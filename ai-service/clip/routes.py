import io
import json
import logging
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


# ---------------------------------------------------------------------------
# /clip/classify — image → clothing type, color, styles, embedding
# ---------------------------------------------------------------------------

@router.post('/classify')
async def classify_image(request: Request, image: UploadFile = File(...)):
    encoder, _ = _get_services(request)
    from .classifier import CLIPClassifierService
    classifier = CLIPClassifierService(encoder)
    data = await image.read()
    img = Image.open(io.BytesIO(data)).convert('RGB')
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
        img = Image.open(io.BytesIO(data)).convert('RGB')
        results = rec.search_by_image(img)
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
    results = rec.search_by_text(body.query_text, k=body.k)
    return {'results': results}


# ---------------------------------------------------------------------------
# /clip/recommend — user_id → personalized recs from mean embedding
# ---------------------------------------------------------------------------

@router.post('/recommend')
async def recommend(request: Request, body: RecommendRequest):
    encoder, faiss_index = _get_services(request)
    pool = _get_db(request)
    from .recommender import CLIPRecommenderService

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
            # embedding stored as TEXT[] in PostgreSQL
            vec = [float(x) for x in raw]
            embeddings.append(vec)

    rec = CLIPRecommenderService(encoder, faiss_index)
    results = rec.recommend_for_user(embeddings, k=body.k)
    return {'results': results, 'profile_size': len(embeddings)}


# ---------------------------------------------------------------------------
# /clip/outfit — item embedding → complementary items
# ---------------------------------------------------------------------------

@router.post('/outfit')
async def outfit_complements(request: Request, body: OutfitRequest):
    encoder, faiss_index = _get_services(request)
    from .recommender import CLIPRecommenderService
    rec = CLIPRecommenderService(encoder, faiss_index)
    results = rec.outfit_complements(body.embedding, k=body.k)
    return {'results': results}


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
            "SELECT id, item_name, image_url, clothing_type, color, embedding "
            "FROM wardrobe_items WHERE image_url IS NOT NULL"
        )

    items = [dict(r) for r in rows]
    logger.info(f"[build-index] Fetched {len(items)} items from DB")

    enriched = []
    skipped = 0

    async with httpx.AsyncClient(timeout=30.0) as client:
        for item in items:
            try:
                if item.get("embedding"):
                    # Parse stored TEXT[] embedding
                    raw = item["embedding"]
                    item["embedding"] = [float(x) for x in raw]
                    enriched.append(item)
                    continue

                if not item.get("image_url"):
                    skipped += 1
                    continue

                r = await client.get(item["image_url"])
                r.raise_for_status()
                img = Image.open(io.BytesIO(r.content)).convert("RGB")
                emb = encoder.encode_image(img)
                item["embedding"] = emb.tolist()

                # Save embedding back to DB
                async with pool.acquire() as conn:
                    emb_str = "{" + ",".join(str(x) for x in item["embedding"]) + "}"
                    await conn.execute(
                        "UPDATE wardrobe_items SET embedding = $1 WHERE id = $2",
                        emb_str, item["id"],
                    )

                enriched.append(item)
            except Exception as e:
                logger.warning(f"[build-index] Skipped item {item.get('id')}: {e}")
                skipped += 1

    count = faiss_index.build(enriched)
    logger.info(f"[build-index] Indexed {count} items, skipped {skipped}")
    return {
        "indexed": count,
        "total_fetched": len(items),
        "encoded": len(enriched),
        "skipped": skipped,
    }


# ---------------------------------------------------------------------------
# /clip/encode-image — image → embedding vector
# ---------------------------------------------------------------------------

@router.post('/encode-image')
async def encode_image(request: Request, image: UploadFile = File(...)):
    encoder, _ = _get_services(request)
    data = await image.read()
    img = Image.open(io.BytesIO(data)).convert('RGB')
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
