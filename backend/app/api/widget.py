"""
Embeddable partner widget API (public, browser-origin).

The widget runs on the partner's own storefront. It reads the shopper's cart
SKUs, matches them to this partner's catalog rows, asks the CLIP service to
assemble complementary outfits from the SAME partner's catalog, and renders
them with affiliate links.

Security model — DISTINCT from the secret partner_api_tokens used by /api/v1/vton:
  • A publishable widget key (mm_wk_...) is exposed in the partner's page source.
  • It is read-only and locked to an origin allow-list (the real boundary).
  • Dynamic CORS is handled by WidgetCORSMiddleware (registered outermost in
    main.py) because Starlette's global CORSMiddleware would otherwise answer
    the preflight itself with a static origin list.
"""

import hashlib
import json
import secrets
import time
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.core.config import settings
from app.core.database import async_session, get_db
from app.services.capsule import capsule_style_guide

router = APIRouter()

WIDGET_KEY_PREFIX = "mm_wk_"
_CORS_METHODS = "GET, POST, OPTIONS"
_CORS_HEADERS = "Content-Type, X-Widget-Key"
_EVENT_TYPES = {"impression", "outfit_view", "item_click", "add_to_cart"}


# ── Key helpers ──

def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def generate_widget_key() -> tuple[str, str, str]:
    """Returns (plaintext_key, hash, prefix). Plaintext shown once at creation."""
    raw = secrets.token_hex(24)
    key = f"{WIDGET_KEY_PREFIX}{raw}"
    return key, _hash_key(key), key[:14]


def _extract_key(request: Request) -> str | None:
    # Query param keeps POST preflight simple (no custom-header round-trip);
    # header is accepted for server-to-server callers.
    return request.query_params.get("key") or request.headers.get("x-widget-key")


async def _lookup_key(key: str, db: AsyncSession) -> dict | None:
    result = await db.execute(
        text("""
            SELECT k.id, k.partner_id, k.is_active, k.allowed_origins,
                   k.rate_limit_per_minute, k.theme, k.revoked_at,
                   p.status AS partner_status, p.company_name
            FROM partner_widget_keys k
            JOIN partner_profiles p ON p.id = k.partner_id
            WHERE k.key_hash = :h
        """),
        {"h": _hash_key(key)},
    )
    row = result.first()
    return dict(row._mapping) if row else None


def _origin_allowed(record: dict, origin: str | None) -> bool:
    # No Origin header → non-browser caller; the key alone authorises it.
    # Browser callers must match the registered allow-list exactly.
    if not origin:
        return True
    return origin in (record.get("allowed_origins") or [])


async def authenticate_widget(request: Request, db: AsyncSession) -> dict:
    """Validate publishable key + origin. Stashes the allowed origin on
    request.state so WidgetCORSMiddleware can echo it on the response."""
    key = _extract_key(request)
    if not key:
        raise HTTPException(status_code=401, detail="Missing widget key")
    record = await _lookup_key(key, db)
    if not record or not record["is_active"] or record["revoked_at"] is not None:
        raise HTTPException(status_code=401, detail="Invalid or revoked widget key")
    if record["partner_status"] != "approved":
        raise HTTPException(status_code=403, detail="Partner not approved")
    origin = request.headers.get("origin")
    if not _origin_allowed(record, origin):
        raise HTTPException(status_code=403, detail="Origin not allowed for this key")
    if origin:
        request.state.widget_cors_origin = origin
    return record


async def _polish_widget_outfits(outfits: list, gender: str | None, capsule_guide: str) -> list:
    """Give each CLIP-assembled outfit a stylish Russian title and prune items that
    break the look, guided by the curated capsule. Runs once per cache-miss (the
    polished payload is then cached 30 min). Never raises — returns the input
    unchanged on any failure. Only the item ids CLIP already chose may be kept;
    the model can drop, never add."""
    if not outfits or not settings.OPENROUTER_API_KEY:
        return outfits

    catalog = [
        {"i": idx, "items": [
            {"id": it["id"], "name": it.get("name", ""),
             "type": it.get("clothing_type", ""), "color": it.get("color", "")}
            for it in o.get("items", [])
        ]}
        for idx, o in enumerate(outfits)
    ]
    cap = f"\n{capsule_guide}\n" if capsule_guide else ""
    prompt = (
        "Ты — стилист. Ниже готовые образы из товаров одного магазина "
        "(у каждого свой i и список вещей с id).\n"
        f"Пол покупателя: {gender or 'не указан'}.{cap}\n"
        "Для КАЖДОГО образа придумай стильное русское название (3-5 слов) и оставь "
        "только сочетающиеся вещи (минимум 2, ТОЛЬКО из данных id — не добавляй новых).\n"
        'Верни СТРОГО JSON-массив: [{"i":0,"title":"...","keep_ids":[id1,id2]}]\n'
        f"Образы:\n{json.dumps(catalog, ensure_ascii=False)}\n"
        "Только JSON, без markdown."
    )
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Content-Type": "application/json",
                         "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}"},
                json={"model": "google/gemini-2.5-flash-lite",
                      "messages": [{"role": "user", "content": prompt}],
                      "temperature": 0.7, "max_tokens": 2048},
            )
        if resp.status_code != 200:
            return outfits
        content = resp.json()["choices"][0]["message"]["content"]
        plan = json.loads(content.replace("```json", "").replace("```", "").strip())
    except Exception:
        return outfits

    by_i = {p.get("i"): p for p in plan if isinstance(p, dict)}
    result = []
    for idx, o in enumerate(outfits):
        p = by_i.get(idx)
        if not p:
            result.append(o)
            continue
        keep = set(p.get("keep_ids") or [])
        items = [it for it in o.get("items", []) if it["id"] in keep] if keep else o.get("items", [])
        if len(items) < 2:
            items = o.get("items", [])  # never let the model gut the outfit below renderable size
        out = {**o, "items": items}
        title = (p.get("title") or "").strip()
        if title:
            out["title"] = title
        result.append(out)
    return result


# ── Routes ──

@router.get("/config")
async def widget_config(request: Request, db: AsyncSession = Depends(get_db)):
    """Bootstrap call the loader makes to fetch theme + validate key/origin."""
    record = await authenticate_widget(request, db)
    return {
        "partner": {"name": record["company_name"]},
        "theme": record.get("theme") or {},
    }


class CartItem(BaseModel):
    sku: str | None = None
    product_url: str | None = None


class RecommendRequest(BaseModel):
    cart: list[CartItem] = []
    n_outfits: int = 3
    gender: str | None = None   # optional shopper gender hint
    temp: float | None = None    # optional shopper temperature for season filtering


@router.post("/recommend")
async def widget_recommend(body: RecommendRequest, request: Request, db: AsyncSession = Depends(get_db)):
    record = await authenticate_widget(request, db)
    partner_id = record["partner_id"]
    key_id = record["id"]
    origin = request.headers.get("origin")

    # Rate limit: each /recommend is one widget impression. Count impressions
    # for this key in the trailing minute against the key's configured limit.
    rl = await db.execute(
        text("""
            SELECT count(*) FROM widget_events
            WHERE widget_key_id = :kid AND event_type = 'impression'
              AND created_at >= NOW() - INTERVAL '1 minute'
        """),
        {"kid": key_id},
    )
    if (rl.scalar() or 0) >= record["rate_limit_per_minute"]:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    skus = [c.sku.strip() for c in body.cart if c.sku and c.sku.strip()]
    if not skus:
        raise HTTPException(status_code=400, detail="cart must contain at least one item with a sku")

    n_outfits = max(1, min(body.n_outfits, 5))
    session_id = uuid.uuid4().hex

    async def _log(event_type: str, item_id=None):
        await db.execute(
            text("""
                INSERT INTO widget_events
                    (partner_id, widget_key_id, event_type, session_id, item_id, anchor_skus, origin)
                VALUES (:pid, :kid, :et, :sid, :iid, :skus, :origin)
            """),
            {"pid": partner_id, "kid": key_id, "et": event_type, "sid": session_id,
             "iid": item_id, "skus": skus, "origin": origin},
        )
        await db.commit()

    # Cache: memoize the assembled outfits by cart signature. A repeated cart view
    # still logs an impression (a render happened) but skips the expensive CLIP
    # call. Bucket temp to the nearest 3°C so tiny weather jitter stays a hit.
    temp_bucket = round(body.temp / 3) if body.temp is not None else None
    cart_hash = hashlib.sha256(
        f"{partner_id}|{','.join(sorted(skus))}|{n_outfits}|{body.gender}|{temp_bucket}".encode()
    ).hexdigest()
    hit = await db.execute(
        text("SELECT payload FROM widget_reco_cache "
             "WHERE cart_hash = :h AND created_at > NOW() - INTERVAL '30 minutes'"),
        {"h": cart_hash},
    )
    cached = hit.first()
    if cached:
        await _log("impression")
        payload = cached[0] if isinstance(cached[0], dict) else json.loads(cached[0])
        return {**payload, "session_id": session_id, "cached": True}

    # 1. Match cart SKUs to this partner's catalog (the cart→catalog bridge).
    matched = await db.execute(
        text("""
            SELECT id, source_sku FROM wardrobe_items
            WHERE partner_id = :pid AND source_sku = ANY(:skus)
              AND COALESCE(is_hidden, false) = false
        """),
        {"pid": partner_id, "skus": skus},
    )
    anchor_ids = [r[0] for r in matched.all()]

    if not anchor_ids:
        await _log("impression")
        return {"session_id": session_id, "outfits": [], "reason": "no_cart_match"}

    # 2. Ask CLIP to assemble complementary outfits from this partner's catalog.
    ai_url = settings.AI_SERVICE_URL
    if not ai_url:
        raise HTTPException(status_code=503, detail="AI service not configured")
    try:
        async with httpx.AsyncClient(timeout=40.0) as client:
            resp = await client.post(
                f"{ai_url}/clip/complement",
                json={"partner_id": partner_id, "anchor_item_ids": anchor_ids,
                      "n_outfits": n_outfits, "gender": body.gender, "temp": body.temp},
            )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Outfit assembly failed")
        clip_outfits = resp.json().get("outfits", [])
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="AI service unavailable")

    # 3. Hydrate canonical data + affiliate URLs from the DB (CLIP's FAISS meta
    # has no affiliate url, and we don't trust client-supplied catalog data).
    all_ids = list({it["id"] for o in clip_outfits for it in o.get("items", []) if it.get("id")})
    hydrate: dict[int, dict] = {}
    if all_ids:
        rows = await db.execute(
            text("""
                SELECT id, item_name, image_url, url, color, clothing_type, source_sku
                FROM wardrobe_items WHERE id = ANY(:ids)
            """),
            {"ids": all_ids},
        )
        hydrate = {r._mapping["id"]: dict(r._mapping) for r in rows.all()}

    outfits = []
    for o in clip_outfits:
        items = []
        for it in o.get("items", []):
            h = hydrate.get(it.get("id"))
            if not h:
                continue
            items.append({
                "id": h["id"],
                "name": h["item_name"],
                "image_url": h["image_url"],
                "buy_url": h["url"],
                "color": h["color"],
                "clothing_type": h["clothing_type"],
                "sku": h["source_sku"],
                "is_anchor": bool(it.get("is_anchor")),
            })
        if len(items) >= 2:
            outfits.append({"score": o.get("score"), "items": items})

    # Capsule polish: title + coherence pass over the CLIP-assembled outfits.
    # Cache-miss only — the polished payload is what we store below, so repeat
    # cart views reuse it for free. Graceful: returns outfits unchanged on failure.
    capsule_guide = await capsule_style_guide(db, body.gender)
    outfits = await _polish_widget_outfits(outfits, body.gender, capsule_guide)

    payload = {"partner": {"name": record["company_name"]}, "outfits": outfits}

    # Store in cache (upsert) + opportunistically prune day-old rows.
    await db.execute(
        text("""
            INSERT INTO widget_reco_cache (cart_hash, partner_id, payload)
            VALUES (:h, :pid, CAST(:payload AS jsonb))
            ON CONFLICT (cart_hash) DO UPDATE SET payload = EXCLUDED.payload, created_at = NOW()
        """),
        {"h": cart_hash, "pid": partner_id, "payload": json.dumps(payload)},
    )
    await db.execute(text("DELETE FROM widget_reco_cache WHERE created_at < NOW() - INTERVAL '1 day'"))
    await db.commit()

    await _log("impression")
    return {**payload, "session_id": session_id}


class EventRequest(BaseModel):
    session_id: str | None = None
    event_type: str
    item_id: int | None = None
    anchor_skus: list[str] | None = None


@router.post("/event")
async def widget_event(body: EventRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Funnel attribution: outfit_view / item_click / add_to_cart."""
    record = await authenticate_widget(request, db)
    if body.event_type not in _EVENT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid event_type")
    await db.execute(
        text("""
            INSERT INTO widget_events
                (partner_id, widget_key_id, event_type, session_id, item_id, anchor_skus, origin)
            VALUES (:pid, :kid, :et, :sid, :iid, :skus, :origin)
        """),
        {"pid": record["partner_id"], "kid": record["id"], "et": body.event_type,
         "sid": body.session_id, "iid": body.item_id, "skus": body.anchor_skus,
         "origin": request.headers.get("origin")},
    )
    await db.commit()
    return {"ok": True}


# ── Dynamic CORS ──

def _apply_cors(response: Response, origin: str) -> None:
    h = response.headers
    h["Access-Control-Allow-Origin"] = origin          # overwrites any static value
    h["Access-Control-Allow-Methods"] = _CORS_METHODS
    h["Access-Control-Allow-Headers"] = _CORS_HEADERS
    h["Access-Control-Max-Age"] = "600"
    h["Vary"] = "Origin"


class WidgetCORSMiddleware(BaseHTTPMiddleware):
    """Per-key dynamic CORS for /api/v1/widget/*.

    Registered AFTER the global CORSMiddleware so it wraps it (most-recently-added
    middleware is outermost in Starlette). That lets it answer the OPTIONS
    preflight itself with the partner's origin — which the static global CORS
    list could never do.
    """

    _PREFIX = "/api/v1/widget"

    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith(self._PREFIX):
            return await call_next(request)

        origin = request.headers.get("origin")

        if request.method == "OPTIONS":
            allowed = await self._preflight_allowed(request, origin)
            resp = Response(status_code=204 if allowed else 403)
            if allowed and origin:
                _apply_cors(resp, origin)
            return resp

        response = await call_next(request)
        allow_origin = getattr(request.state, "widget_cors_origin", None)
        if allow_origin:
            _apply_cors(response, allow_origin)
        return response

    async def _preflight_allowed(self, request: Request, origin: str | None) -> bool:
        if not origin:
            return True
        key = _extract_key(request)
        if not key:
            return False
        async with async_session() as db:
            record = await _lookup_key(key, db)
        if not record or not record["is_active"] or record["revoked_at"] is not None:
            return False
        return _origin_allowed(record, origin)
