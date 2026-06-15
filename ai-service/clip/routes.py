import asyncio
import base64
import io
import json
import logging
import threading
import numpy as np
from fastapi import APIRouter, File, UploadFile, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
from PIL import Image

logger = logging.getLogger(__name__)
router = APIRouter()


def _get_services(request: Request):
    return request.app.state.encoder, request.app.state.faiss_index


def _get_db(request: Request):
    return request.app.state.db_pool


def _get_clusters(request: Request):
    return request.app.state.cluster_service


def _get_lightgcn(request: Request):
    return request.app.state.lightgcn_service


def _get_outfit_scorer(request: Request):
    return request.app.state.outfit_scorer


MAX_K = 100
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10MB
ALLOWED_IMAGE_FORMATS = {'JPEG', 'PNG', 'WEBP', 'BMP'}


def _clamp_k(k: int) -> int:
    return max(1, min(k, MAX_K))


def _validate_image(data: bytes) -> Image.Image:
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail=f'Image too large ({len(data)} bytes, max {MAX_IMAGE_BYTES})')
    try:
        img = Image.open(io.BytesIO(data))
        if img.format and img.format not in ALLOWED_IMAGE_FORMATS:
            raise HTTPException(status_code=400, detail=f'Unsupported image format: {img.format}')
        return img.convert('RGB')
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=400, detail=f'Invalid image: {e}')


class SearchRequest(BaseModel):
    query_text: Optional[str] = None
    composed_text: Optional[str] = None
    k: int = 20


class RecommendRequest(BaseModel):
    user_id: str
    k: int = 20


class OutfitRequest(BaseModel):
    item_id: int
    embedding: list
    k: int = 10


class EncodeTextRequest(BaseModel):
    text: str


class PickFlatlayRequest(BaseModel):
    urls: list[str]  # up to 4 photo URLs to evaluate


# ---------------------------------------------------------------------------
# /clip/pick-flatlay — choose best product photo (no model) from a URL list
# ---------------------------------------------------------------------------

@router.post('/pick-flatlay')
async def pick_flatlay(request: Request, body: PickFlatlayRequest):
    """Given a list of image URLs (from a YML feed), return the one most likely
    to be a flat-lay / isolated product photo without a model or mannequin."""
    import httpx
    encoder, _ = _get_services(request)
    from .classifier import CLIPClassifierService
    classifier = CLIPClassifierService(encoder)

    urls = body.urls[:4]  # evaluate at most 4 photos
    if not urls:
        raise HTTPException(status_code=400, detail='urls list is empty')

    best_url = urls[0]
    best_score = float('-inf')
    best_person_score = 0.0
    results = []

    async with httpx.AsyncClient(timeout=15.0) as client:
        for url in urls:
            try:
                r = await client.get(url)
                r.raise_for_status()
                img = Image.open(io.BytesIO(r.content)).convert('RGB')
                emb = encoder.encode_image(img)
                person_score = classifier._person_score(emb)
                # Lower person_score is better (flat-lay)
                score = -person_score
                results.append({'url': url, 'score': score})
                if score > best_score:
                    best_score = score
                    best_url = url
                    best_person_score = person_score
            except Exception as e:
                logger.debug(f'[pick-flatlay] skip {url}: {e}')

    from .classifier import PERSON_SCORE_THRESHOLD
    has_person = best_person_score > PERSON_SCORE_THRESHOLD
    return {
        'url': best_url,
        'has_person': has_person,
        'person_score': best_person_score,
        'checked': len(results),
    }


# ---------------------------------------------------------------------------
# /clip/remove-bg — strip background, composite onto white
# ---------------------------------------------------------------------------
#
# Why this exists: iOS / Telegram share flows occasionally JPEG-encode PNGs
# that had alpha channels, leaving the formerly-transparent regions filled
# with framebuffer noise (the diagonal-blue-stripe artifact reported by
# users). Sending those bytes straight into Gemini for flat-lay generation
# poisons the output color. Running rembg first isolates the garment / person
# subject and lets us paint a clean white background, so the downstream
# image-gen model has nothing weird to inherit.

_REMBG_LOCK = threading.Lock()
_REMBG_SESSION = None
_REMBG_MODEL = 'isnet-general-use'  # better edges than u2net for fashion items
_REMBG_MAX_BYTES = 12 * 1024 * 1024


def _get_rembg_session():
    """Lazy-init singleton — model load is ~170MB and takes a few seconds the
    first time. Hold a process-wide lock so concurrent first-callers don't
    each spin up their own session."""
    global _REMBG_SESSION
    if _REMBG_SESSION is not None:
        return _REMBG_SESSION
    with _REMBG_LOCK:
        if _REMBG_SESSION is None:
            from rembg import new_session
            logger.info(f'[remove-bg] loading rembg session ({_REMBG_MODEL})...')
            _REMBG_SESSION = new_session(_REMBG_MODEL)
            logger.info('[remove-bg] rembg session ready')
    return _REMBG_SESSION


def _composite_on_white(rgba: Image.Image) -> Image.Image:
    """RGBA cut-out → RGB on white. Uses alpha as the paste mask so semi-
    transparent edges (hair, fabric fringe) blend smoothly instead of
    showing a hard cut."""
    if rgba.mode != 'RGBA':
        return rgba.convert('RGB')
    white = Image.new('RGB', rgba.size, (255, 255, 255))
    white.paste(rgba, mask=rgba.split()[3])
    return white


def _run_rembg_sync(img: Image.Image) -> Image.Image:
    """rembg.remove is blocking (CPU-bound onnx inference). Caller should run
    this via asyncio.to_thread to avoid stalling the event loop."""
    from rembg import remove
    return remove(img, session=_get_rembg_session())


class RemoveBgRequest(BaseModel):
    image_url: Optional[str] = None
    # 'white' for downstream image-gen pipelines; 'transparent' if the caller
    # wants the raw RGBA cut-out (e.g. for client-side compositing).
    background: str = 'white'


@router.post('/remove-bg')
async def remove_bg(
    request: Request,
    image: Optional[UploadFile] = File(None),
):
    """Remove the background from an image and return a base64 PNG/JPEG.

    Accepts either a multipart `image` upload or a JSON body with
    `image_url`. Returns `{ image_base64, width, height }`.
    """
    import httpx

    background = 'white'
    if image is not None:
        data = await image.read()
    else:
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail='Provide image file or JSON body')
        url = body.get('image_url') if isinstance(body, dict) else None
        background = (body.get('background') if isinstance(body, dict) else None) or 'white'
        if not url:
            raise HTTPException(status_code=400, detail='Provide image file or image_url')
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                resp = await client.get(url)
                resp.raise_for_status()
            except Exception as e:
                raise HTTPException(status_code=400, detail=f'Failed to fetch image_url: {e}')
            data = resp.content

    if len(data) > _REMBG_MAX_BYTES:
        raise HTTPException(status_code=400, detail=f'Image too large ({len(data)} bytes)')

    try:
        # Force RGBA so we always feed rembg a sane mode (some HEIC→JPEG
        # exports come through as 'P' or 'CMYK' which onnx chokes on).
        src = Image.open(io.BytesIO(data)).convert('RGBA')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f'Invalid image: {e}')

    try:
        cutout = await asyncio.to_thread(_run_rembg_sync, src)
    except Exception as e:
        logger.exception('[remove-bg] inference failed')
        raise HTTPException(status_code=502, detail=f'rembg failed: {e}')

    if background == 'transparent':
        out = cutout if cutout.mode == 'RGBA' else cutout.convert('RGBA')
        fmt, mime = 'PNG', 'image/png'
    else:
        out = _composite_on_white(cutout)
        fmt, mime = 'JPEG', 'image/jpeg'

    buf = io.BytesIO()
    save_kwargs = {'quality': 92, 'optimize': True} if fmt == 'JPEG' else {'optimize': True}
    out.save(buf, format=fmt, **save_kwargs)
    b64 = base64.b64encode(buf.getvalue()).decode()
    return {
        'image_base64': f'data:{mime};base64,{b64}',
        'width': out.width,
        'height': out.height,
        'model': _REMBG_MODEL,
        'background': background,
    }


# ---------------------------------------------------------------------------
# /clip/classify — image → clothing type, color, styles, embedding
# ---------------------------------------------------------------------------

@router.post('/classify')
async def classify_image(request: Request, image: UploadFile = File(...)):
    encoder, _ = _get_services(request)
    from .classifier import CLIPClassifierService
    classifier = CLIPClassifierService(encoder)
    data = await image.read()
    img = _validate_image(data)
    result = classifier.classify(img)
    return JSONResponse(result)


# ---------------------------------------------------------------------------
# /clip/search — image → similar items from FAISS index
# ---------------------------------------------------------------------------

@router.post('/search')
async def visual_search(request: Request, image: Optional[UploadFile] = File(None)):
    encoder, faiss_index = _get_services(request)
    from .recommender import CLIPRecommenderService
    rec = CLIPRecommenderService(encoder, faiss_index)
    if image is not None:
        data = await image.read()
        img = _validate_image(data)
        results = rec.search_by_image(img, k=_clamp_k(20))
    else:
        raise HTTPException(status_code=400, detail='Provide image file')
    return {'results': results}


# ---------------------------------------------------------------------------
# /clip/search/text — text query → similar items
# ---------------------------------------------------------------------------

@router.post('/search/text')
async def text_search(request: Request, body: SearchRequest):
    encoder, faiss_index = _get_services(request)
    from .recommender import CLIPRecommenderService
    rec = CLIPRecommenderService(encoder, faiss_index)
    if not body.query_text:
        raise HTTPException(status_code=400, detail='query_text required')
    results = rec.search_by_text(body.query_text, k=_clamp_k(body.k))
    return {'results': results}


# ---------------------------------------------------------------------------
# /clip/recommend — user_id → personalized recs with dislike penalties
# ---------------------------------------------------------------------------

@router.post('/recommend')
async def recommend(request: Request, body: RecommendRequest):
    encoder, faiss_index = _get_services(request)
    pool = _get_db(request)
    cluster_service = _get_clusters(request)
    lightgcn = _get_lightgcn(request)
    from .recommender import CLIPRecommenderService

    # 1. Fetch user's wardrobe embeddings (preference signal)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, embedding FROM wardrobe_user_items "
            "WHERE user_id = $1 AND embedding IS NOT NULL",
            body.user_id,
        )

    embeddings = []
    for row in rows:
        raw = row["embedding"]
        if raw:
            try:
                vec = [float(x) for x in raw]
                embeddings.append(vec)
            except (ValueError, TypeError):
                continue

    # 2. Fetch disliked item embeddings (anti-preference signal)
    dislike_embeddings = []
    exclude_ids = set()
    try:
        async with pool.acquire() as conn:
            dislike_rows = await conn.fetch("""
                SELECT d.item_id, d.item_source,
                       COALESCE(wi.embedding, wui.embedding) as embedding
                FROM user_item_dislikes d
                LEFT JOIN wardrobe_items wi
                    ON d.item_id = wi.id AND d.item_source = 'wardrobe_items'
                LEFT JOIN wardrobe_user_items wui
                    ON d.item_id = wui.id AND d.item_source = 'wardrobe_user_items'
                WHERE d.user_id = $1
            """, body.user_id)

        for dr in dislike_rows:
            exclude_ids.add(dr['item_id'])
            if dr['embedding']:
                try:
                    vec = [float(x) for x in dr['embedding']]
                    dislike_embeddings.append(vec)
                except (ValueError, TypeError):
                    continue
    except Exception as e:
        logger.warning(f"[recommend] Failed to fetch dislikes: {e}")

    # 3. Get collaborative dislike signal from user's cluster
    cluster_dislike_emb = None
    user_cluster = cluster_service.get_user_cluster(body.user_id)
    if user_cluster is not None:
        cluster_dislike_emb = cluster_service.get_cluster_dislike_embedding(user_cluster)

    # 4. Recommend
    rec = CLIPRecommenderService(encoder, faiss_index)
    clamped_k = _clamp_k(body.k)

    if not embeddings:
        # Cold-start: no wardrobe items — use popular items + gender heuristic
        popular_ids = []
        try:
            async with pool.acquire() as conn:
                pop_rows = await conn.fetch(
                    "SELECT item_id, COUNT(*) as cnt FROM recommendation_logs "
                    "WHERE action IN ('click', 'save', 'try_on') "
                    "GROUP BY item_id ORDER BY cnt DESC LIMIT $1",
                    clamped_k * 2,
                )
                popular_ids = [r['item_id'] for r in pop_rows]
        except Exception:
            pass

        gender = None
        try:
            async with pool.acquire() as conn:
                profile = await conn.fetchrow(
                    "SELECT gender FROM user_profiles WHERE user_id = $1", body.user_id,
                )
                if profile:
                    gender = profile['gender']
        except Exception:
            pass

        results = rec.recommend_cold_start(
            cluster_service=cluster_service,
            popular_item_ids=popular_ids if popular_ids else None,
            gender=gender,
            k=clamped_k,
        )
    elif dislike_embeddings or cluster_dislike_emb is not None:
        results = rec.recommend_for_user_with_dislikes(
            user_embeddings=embeddings,
            dislike_embeddings=dislike_embeddings if dislike_embeddings else None,
            cluster_dislike_emb=cluster_dislike_emb,
            exclude_ids=exclude_ids if exclude_ids else None,
            k=clamped_k,
        )
    else:
        results = rec.recommend_for_user(embeddings, k=clamped_k)

    # 5. Blend in cluster-popular items ("users like you also liked X").
    #    This breaks the filter bubble: CLIP nearest-neighbors alone would
    #    surface things the user already has; popular items bring novelty.
    popular_slice = 0
    if user_cluster is not None:
        popular_items = cluster_service.get_cluster_popular_items(user_cluster)
        if popular_items:
            # Reserve ~20% of slots for popular items. Fetch DB metadata for them
            # so they look identical to FAISS results downstream.
            reserved = max(1, clamped_k // 5)
            existing_ids = {r.get('id') for r in results}
            popular_ids_needed = []
            for pop in popular_items:
                pid = pop.get('id')
                if pid is None or pid in existing_ids or pid in exclude_ids:
                    continue
                popular_ids_needed.append(pid)
                if len(popular_ids_needed) >= reserved:
                    break

            if popular_ids_needed:
                try:
                    async with pool.acquire() as conn:
                        pop_meta_rows = await conn.fetch(
                            "SELECT id, item_name, image_url, clothing_type, color, created_at "
                            "FROM wardrobe_items WHERE id = ANY($1) "
                            "AND COALESCE(is_hidden, false) = false",
                            popular_ids_needed,
                        )
                    pop_meta = {r['id']: dict(r) for r in pop_meta_rows}
                    popular_results = []
                    for pop in popular_items:
                        pid = pop.get('id')
                        if pid not in pop_meta:
                            continue
                        m = pop_meta[pid]
                        popular_results.append({
                            'id': m['id'],
                            'name': m.get('item_name'),
                            'image_url': m.get('image_url'),
                            'clothing_type': m.get('clothing_type'),
                            'color': m.get('color'),
                            'created_at': str(m.get('created_at', '')),
                            # Score inherits from cluster popularity (normalized roughly
                            # into [0, 1] so it doesn't dominate CLIP scores ~[0.5, 0.9]).
                            'score': 0.7 + min(0.2, float(pop.get('score', 0.0)) / 20.0),
                            'source': 'cluster_popular',
                        })
                        if len(popular_results) >= reserved:
                            break

                    # Interleave: every ~5th slot goes to popular, rest to CLIP.
                    merged = []
                    pop_iter = iter(popular_results)
                    clip_iter = iter(results)
                    step = max(1, clamped_k // max(1, len(popular_results)))
                    for i in range(clamped_k):
                        pick = None
                        if i % step == 0 and i > 0:
                            pick = next(pop_iter, None)
                        if pick is None:
                            pick = next(clip_iter, None)
                        if pick is None:
                            pick = next(pop_iter, None)
                        if pick is None:
                            break
                        merged.append(pick)
                    # Append any leftover popular items at the tail (rare but keeps
                    # us from silently dropping collaborative signal).
                    for leftover in pop_iter:
                        merged.append(leftover)
                    results = merged[:clamped_k]
                    popular_slice = len(popular_results)
                except Exception as e:
                    logger.warning(f"[recommend] Failed to merge cluster popular items: {e}")

    # 6. LightGCN re-ranking — if the user is in the trained model, blend the
    #    GCN collaborative score with the CLIP retrieval score. Items the
    #    model doesn't know keep their CLIP score. This is where the "proper
    #    recommendation model beyond Gemini" promised in the thesis actually
    #    kicks in: CLIP finds "things stylistically near the user"; LightGCN
    #    promotes the ones users with similar behaviour actually liked.
    gnn_applied = False
    if lightgcn.has_user(body.user_id) and results:
        try:
            results = lightgcn.rerank(body.user_id, results, blend_weight=0.35)
            gnn_applied = True
        except Exception as e:
            logger.warning(f"[recommend] LightGCN rerank failed: {e}")

    # Log recommendations for feedback loop (async, non-blocking)
    import uuid
    rec_session_id = str(uuid.uuid4())[:12]
    try:
        async with pool.acquire() as conn:
            for pos, item in enumerate(results):
                await conn.execute(
                    "INSERT INTO recommendation_logs (user_id, rec_session_id, item_id, item_score, position, source) "
                    "VALUES ($1, $2, $3, $4, $5, $6)",
                    body.user_id, rec_session_id, item.get('id', 0),
                    item.get('score', 0.0), pos, 'clip',
                )
    except Exception as e:
        logger.warning(f"[recommend] Failed to log recommendations: {e}")

    return {
        'results': results,
        'profile_size': len(embeddings),
        'dislikes_count': len(dislike_embeddings),
        'cluster_id': user_cluster,
        'popular_slice': popular_slice,
        'gnn_applied': gnn_applied,
        'rec_session_id': rec_session_id,
    }


# ---------------------------------------------------------------------------
# /clip/outfit — item embedding → complementary items
# ---------------------------------------------------------------------------

@router.post('/outfit')
async def outfit_complements(request: Request, body: OutfitRequest):
    encoder, faiss_index = _get_services(request)
    from .recommender import CLIPRecommenderService
    rec = CLIPRecommenderService(encoder, faiss_index)
    results = rec.outfit_complements(body.embedding, k=_clamp_k(body.k))
    return {'results': results}


# ---------------------------------------------------------------------------
# /clip/complement — partner widget: cart items → assembled outfits
# ---------------------------------------------------------------------------

# Mirror of backend _SLOT_MAP (recommendations.py). Kept in sync manually
# because the CLIP service is a separate package and can't import backend code.
_SLOT_MAP = {
    "blouse": "top", "lonsleeve": "top", "shirt": "top",
    "t-shirt": "top", "tank-top": "top",
    "cardigan": "layer", "hoodie": "layer", "hoddie": "layer",
    "pullover": "layer", "suit-jacket": "layer", "sweatshirt": "layer",
    "turtleneck": "layer", "vest": "layer",
    "dress": "dress", "skirt": "dress",
    "jeans": "bottom", "pants": "bottom", "shorts": "bottom", "sporty-pants": "bottom",
    "classic": "set", "knitted-suit": "set", "tracksuit": "set",
    "coat": "outerwear", "fur-coat": "outerwear", "fur-coat-dark-brown": "outerwear",
    "parka": "outerwear", "puffer-jacket": "outerwear", "sheepskin-coat": "outerwear",
}
_SLOT_TO_TYPES: dict[str, list[str]] = {}
for _ct, _slot in _SLOT_MAP.items():
    _SLOT_TO_TYPES.setdefault(_slot, []).append(_ct)

# Core slots an outfit must cover, and optional extras we add for richness.
_CORE_SLOTS = ["top", "bottom"]
_EXTRA_SLOTS = ["layer", "outerwear"]


class ComplementRequest(BaseModel):
    partner_id: int
    anchor_item_ids: list[int]      # cart items already matched to this partner's catalog
    n_outfits: int = 3
    candidates_per_slot: int = 6
    score: bool = True              # rank with OutfitTransformer when available


def _slot_of(clothing_type: str | None) -> str | None:
    return _SLOT_MAP.get((clothing_type or "").lower())


def _to_item(d: dict, is_anchor: bool) -> dict:
    """Normalize an anchor row or a meta pick into the widget item shape."""
    return {
        "id": d.get("id"),
        "name": d.get("item_name") or d.get("name"),
        "image_url": d.get("image_url"),
        "clothing_type": d.get("clothing_type"),
        "color": d.get("color"),
        "url": d.get("url"),
        "source_sku": d.get("source_sku"),
        "is_anchor": is_anchor,
    }


def _to_scorer_item(it: dict) -> dict:
    return {
        "id": it.get("id"),
        "image_url": it.get("image_url"),
        "item_name": it.get("name") or "",
        "clothing_type": it.get("clothing_type"),
        "color": it.get("color"),
    }


@router.post('/complement')
async def complement_outfits(request: Request, body: ComplementRequest):
    """Assemble complete outfits around cart anchor items, scoped to one partner.

    Unlike /clip/outfit (nearest-neighbours of the anchor → more of the same
    garment), this fills the *missing* slots: a shirt in the cart pulls bottoms,
    a layer and outerwear from the SAME partner's catalog, then ranks the
    assembled looks by OutfitTransformer compatibility.
    """
    _, faiss_index = _get_services(request)
    pool = _get_db(request)
    n_outfits = max(1, min(body.n_outfits, 6))
    per_slot = max(2, min(body.candidates_per_slot, 12))

    # 1. Resolve anchors — defensively scoped to this partner's catalog.
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, item_name, image_url, clothing_type, color, url,
                   source_sku, embedding
            FROM wardrobe_items
            WHERE id = ANY($1) AND partner_id = $2
              AND COALESCE(is_hidden, false) = false
        """, body.anchor_item_ids, body.partner_id)

    anchors = [dict(r) for r in rows]
    if not anchors:
        raise HTTPException(status_code=404, detail="No anchor items found in this partner's catalog")

    # 2. Mean anchor embedding — the retrieval query for complementary slots.
    anchor_vecs = []
    for a in anchors:
        emb = a.get("embedding")
        if emb:
            try:
                anchor_vecs.append(np.array([float(x) for x in emb], dtype=np.float32))
            except (TypeError, ValueError):
                pass
    if not anchor_vecs:
        raise HTTPException(status_code=422, detail="Anchor items have no embeddings yet — rebuild the index")
    mean_anchor = np.mean(np.stack(anchor_vecs), axis=0)

    anchor_ids = {a["id"] for a in anchors}
    present_slots = {_slot_of(a.get("clothing_type")) for a in anchors}
    present_slots.discard(None)

    # 3. Decide which slots to fill. A dress/set anchor already covers the body,
    # so we only add extras; otherwise fill the missing core slots first.
    body_covered = bool(present_slots & {"dress", "set"})
    target_slots: list[str] = []
    if not body_covered:
        target_slots += [s for s in _CORE_SLOTS if s not in present_slots]
    target_slots += [s for s in _EXTRA_SLOTS if s not in present_slots]
    # If the cart already holds a full top+bottom, still offer one complementary
    # layer/outerwear so the widget never renders empty.
    if not target_slots:
        target_slots = [s for s in _EXTRA_SLOTS]

    # 4. Retrieve per-slot candidates from this partner only.
    slot_candidates: dict[str, list[dict]] = {}
    for slot in target_slots:
        cands = faiss_index.search_filtered(
            mean_anchor,
            k=per_slot,
            partner_id=body.partner_id,
            clothing_types=_SLOT_TO_TYPES.get(slot, []),
            exclude_ids=anchor_ids,
        )
        if cands:
            slot_candidates[slot] = cands

    if not slot_candidates:
        return {"outfits": [], "reason": "no_complementary_items", "anchor_count": len(anchors)}

    # 5. Assemble candidate outfits (generate-and-rank). Core slots are required
    # when present; one extra slot is added per outfit for richness. Rotating the
    # rank index across outfits yields variety before the scorer re-ranks.
    fill_core = [s for s in _CORE_SLOTS if s in slot_candidates]
    fill_extra = [s for s in _EXTRA_SLOTS if s in slot_candidates]
    anchor_items = [_to_item(a, True) for a in anchors]

    assembled: list[list[dict]] = []
    seen: set = set()
    budget = max(n_outfits, 3)
    for i in range(budget * 2):
        if len(assembled) >= budget:
            break
        picks: list[dict] = []
        for slot in fill_core:
            cands = slot_candidates[slot]
            picks.append(_to_item(cands[i % len(cands)], False))
        if fill_extra:
            slot = fill_extra[i % len(fill_extra)]
            cands = slot_candidates[slot]
            picks.append(_to_item(cands[(i // max(1, len(fill_core))) % len(cands)], False))
        if not picks:
            continue
        outfit = anchor_items + picks
        key = frozenset(it["id"] for it in outfit)
        if key in seen:
            continue
        seen.add(key)
        assembled.append(outfit)

    if not assembled:
        return {"outfits": [], "reason": "could_not_assemble", "anchor_count": len(anchors)}

    # 6. Rank. Prefer OutfitTransformer compatibility; fall back to the mean
    # retrieval similarity of the picks so the widget always returns something.
    scorer = _get_outfit_scorer(request)
    scored: list[dict] = []
    # Use OutfitTransformer only if already warm — never block a widget request
    # on the one-time 1.1 GB checkpoint download. Kick off a background warm-load
    # so subsequent requests get true compatibility scoring; this one falls back.
    use_ot = bool(body.score and scorer.is_ready())
    if body.score and not scorer.is_ready():
        try:
            asyncio.create_task(asyncio.to_thread(scorer.load))
        except RuntimeError:
            pass

    for outfit in assembled:
        score = None
        if use_ot:
            try:
                res = await scorer.score_outfit([_to_scorer_item(it) for it in outfit])
                if res and res.get("score") is not None:
                    score = float(res["score"])
            except Exception as e:
                logger.warning(f"[complement] scorer failed, falling back: {e}")
        if score is None:
            picks = [it for it in outfit if not it["is_anchor"]]
            sims = [c.get("score", 0.0) for s in slot_candidates.values() for c in s
                    if c.get("id") in {p["id"] for p in picks}]
            score = float(np.mean(sims)) if sims else 0.0
        scored.append({"score": round(score, 4), "items": outfit})

    scored.sort(key=lambda o: o["score"], reverse=True)
    return {
        "outfits": scored[:n_outfits],
        "anchor_count": len(anchors),
        "scored_with": "outfit_transformer" if use_ot else "similarity_fallback",
    }


# ---------------------------------------------------------------------------
# /clip/build-index — fetch wardrobe_items from DB, encode, build FAISS
# ---------------------------------------------------------------------------

@router.post('/build-index')
async def build_index(request: Request):
    encoder, faiss_index = _get_services(request)
    pool = _get_db(request)
    import httpx

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, item_name, image_url, clothing_type, color, embedding, created_at, "
            "partner_id, source_sku "
            "FROM wardrobe_items WHERE image_url IS NOT NULL"
        )

    items = [dict(r) for r in rows]
    logger.info(f"[build-index] Fetched {len(items)} items from DB")

    # Split: items with existing embeddings vs items needing encoding
    enriched = []
    needs_encoding = []
    newly_encoded = 0
    skipped = 0

    for item in items:
        if item.get("embedding"):
            raw = item["embedding"]
            item["embedding"] = [float(x) for x in raw]
            enriched.append(item)
        elif item.get("image_url"):
            needs_encoding.append(item)
        else:
            skipped += 1

    logger.info(f"[build-index] {len(enriched)} pre-encoded, {len(needs_encoding)} need encoding")

    # Batch-download images and encode
    if needs_encoding:
        batch_images = []
        batch_items = []

        async with httpx.AsyncClient(timeout=30.0) as client:
            for item in needs_encoding:
                try:
                    r = await client.get(item["image_url"])
                    r.raise_for_status()
                    img = Image.open(io.BytesIO(r.content)).convert("RGB")
                    batch_images.append(img)
                    batch_items.append(item)
                except Exception as e:
                    logger.warning(f"[build-index] Download failed {item.get('id')}: {e}")
                    skipped += 1

        # Batch encode all downloaded images
        if batch_images:
            logger.info(f"[build-index] Batch encoding {len(batch_images)} images...")
            embeddings_matrix = encoder.encode_batch_images(batch_images)

            # Save embeddings to DB and add to enriched list
            async with pool.acquire() as conn:
                for i, (item, emb_vec) in enumerate(zip(batch_items, embeddings_matrix)):
                    item["embedding"] = emb_vec.tolist()
                    emb_str = "{" + ",".join(str(x) for x in item["embedding"]) + "}"
                    try:
                        await conn.execute(
                            "UPDATE wardrobe_items SET embedding = $1 WHERE id = $2",
                            emb_str, item["id"],
                        )
                    except Exception as e:
                        logger.warning(f"[build-index] DB save failed {item['id']}: {e}")
                    enriched.append(item)

            newly_encoded = len(batch_images)
            logger.info(f"[build-index] Batch encoded {newly_encoded} images")

    pre_encoded = len(enriched) - newly_encoded
    count = faiss_index.build(enriched)
    logger.info(f"[build-index] Indexed {count} items, skipped {skipped}")
    return {
        "indexed": count,
        "total_fetched": len(items),
        "pre_encoded": pre_encoded,
        "newly_encoded": newly_encoded,
        "skipped": skipped,
    }


# ---------------------------------------------------------------------------
# /clip/clusters/build — build user clusters for collaborative filtering
# ---------------------------------------------------------------------------

@router.post('/clusters/build')
async def build_clusters(request: Request):
    pool = _get_db(request)
    cluster_service = _get_clusters(request)
    result = await cluster_service.build_clusters(pool)
    return result


# ---------------------------------------------------------------------------
# /clip/train-lightgcn — train the LightGCN collaborative recommender
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# /clip/outfit-load — trigger OutfitTransformer checkpoint download + load
# ---------------------------------------------------------------------------

class OutfitScoreRequest(BaseModel):
    item_ids: list[int]  # catalog ids; script fetches image_url + metadata


@router.post('/outfit-load')
async def outfit_load(request: Request):
    """Download the checkpoint if missing and load the model. Idempotent.
    Returns meta about the loaded model."""
    service = _get_outfit_scorer(request)
    import asyncio
    # Load runs synchronously inside torch — offload to thread so the event
    # loop keeps serving other requests during the one-time 1.1 GB download.
    ok = await asyncio.to_thread(service.load)
    return {
        "ready": service.is_ready(),
        "loaded_at": service.loaded_at,
        "device": str(service.device),
        "error": service._load_error if not ok else None,
    }


@router.post('/outfit-score')
async def outfit_score(request: Request, body: OutfitScoreRequest):
    """Score the compatibility of an outfit given catalog item IDs.

    Resolves image_url + item_name + clothing_type + color from the DB,
    downloads images, runs OutfitTransformer, returns a score in [0, 1].
    Both wardrobe_items (catalog) and wardrobe_user_items (user uploads)
    are checked so admins can mix user and catalog items in a test set.
    """
    service = _get_outfit_scorer(request)
    if not service.is_ready():
        # Auto-load on first request — keeps the UX simple for admins.
        import asyncio
        ok = await asyncio.to_thread(service.load)
        if not ok:
            raise HTTPException(
                status_code=503,
                detail=f"OutfitTransformer failed to load: {service._load_error}",
            )

    ids = body.item_ids[:16]  # respect OT's max_length=16
    if len(ids) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 item_ids")

    pool = _get_db(request)
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, item_name, image_url, clothing_type, color,
                   'catalog' AS source
            FROM wardrobe_items
            WHERE id = ANY($1) AND COALESCE(is_hidden, false) = false
            UNION ALL
            SELECT id, item_name, image_url, clothing_type, color,
                   'user' AS source
            FROM wardrobe_user_items
            WHERE id = ANY($1) AND COALESCE(is_hidden, false) = false
        """, ids)

    if not rows:
        raise HTTPException(status_code=404, detail="No matching items in catalog or user wardrobe")

    # Preserve caller's order where possible — id may collide between tables,
    # in which case we keep both; the model doesn't care about duplicates.
    items = [dict(r) for r in rows]
    result = await service.score_outfit(items)
    if result is None:
        raise HTTPException(status_code=502, detail="OutfitTransformer inference failed")
    return {
        "requested_ids": ids,
        "resolved_count": len(items),
        **result,
    }


@router.post('/train-lightgcn')
async def train_lightgcn(request: Request):
    """Train the LightGCN model from current user_likes + outfit_items data.
    Meant to be called nightly by the cron container after /clip/clusters/build.

    Runs on the main event loop because:
      - asyncpg pool is tied to the loop that created it
      - training is CPU-bound but torch tensor ops release the GIL, so
        the worst-case blocking is the batch-sampling Python loop (ms)
      - nightly window (3 AM UTC) makes brief pauses acceptable
    """
    pool = _get_db(request)
    service = _get_lightgcn(request)
    result = await service.train_from_db(pool)
    return result


# ---------------------------------------------------------------------------
# /clip/feedback — log user action on a recommended item
# ---------------------------------------------------------------------------

class FeedbackRequest(BaseModel):
    user_id: str
    rec_session_id: str
    item_id: int
    action: str  # 'click', 'save', 'dislike', 'try_on'


@router.post('/feedback')
async def log_feedback(request: Request, body: FeedbackRequest):
    pool = _get_db(request)
    try:
        async with pool.acquire() as conn:
            # Update the existing log row with the action
            result = await conn.execute(
                "UPDATE recommendation_logs SET action = $1, action_at = NOW() "
                "WHERE user_id = $2 AND rec_session_id = $3 AND item_id = $4 AND action IS NULL",
                body.action, body.user_id, body.rec_session_id, body.item_id,
            )
            # If no existing row (e.g., item not from CLIP), insert new
            if result == 'UPDATE 0':
                await conn.execute(
                    "INSERT INTO recommendation_logs (user_id, rec_session_id, item_id, action, action_at, source) "
                    "VALUES ($1, $2, $3, $4, NOW(), 'direct')",
                    body.user_id, body.rec_session_id, body.item_id, body.action,
                )
    except Exception as e:
        logger.warning(f"[feedback] Failed to log: {e}")
        return {'ok': False}
    return {'ok': True}


# ---------------------------------------------------------------------------
# /clip/encode-image — image → embedding vector
# ---------------------------------------------------------------------------

@router.post('/encode-image')
async def encode_image(request: Request, image: UploadFile = File(...)):
    encoder, _ = _get_services(request)
    data = await image.read()
    img = _validate_image(data)
    emb = encoder.encode_image(img)
    return {'embedding': emb.tolist(), 'dim': len(emb)}


# ---------------------------------------------------------------------------
# /clip/encode-text — text → embedding vector
# ---------------------------------------------------------------------------

@router.post('/encode-text')
async def encode_text(request: Request, body: EncodeTextRequest):
    encoder, _ = _get_services(request)
    emb = encoder.encode_text(body.text)
    return {'embedding': emb.tolist(), 'dim': len(emb)}
