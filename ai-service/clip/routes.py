import io
import os
import numpy as np
from fastapi import APIRouter, File, UploadFile, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
from PIL import Image

router = APIRouter()


def _get_services(request: Request):
    return request.app.state.encoder, request.app.state.faiss_index


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
    use_fashion: bool = True


@router.post('/classify')
async def classify_image(request: Request, image: UploadFile = File(...)):
    encoder, _ = _get_services(request)
    from .classifier import CLIPClassifierService
    classifier = CLIPClassifierService(encoder)
    data = await image.read()
    img = Image.open(io.BytesIO(data)).convert('RGB')
    result = classifier.classify(img)
    return JSONResponse(result)


@router.post('/search')
async def visual_search(
    request: Request,
    image: Optional[UploadFile] = File(None),
):
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


@router.post('/search/text')
async def text_search(request: Request, body: SearchRequest):
    encoder, faiss_index = _get_services(request)
    from .recommender import CLIPRecommenderService
    rec = CLIPRecommenderService(encoder, faiss_index)
    if not body.query_text:
        raise HTTPException(status_code=400, detail='query_text required')
    results = rec.search_by_text(body.query_text, k=body.k)
    return {'results': results}


@router.post('/recommend')
async def recommend(request: Request, body: RecommendRequest):
    encoder, faiss_index = _get_services(request)
    from .recommender import CLIPRecommenderService
    supabase_url = os.environ.get('SUPABASE_URL', '')
    supabase_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not supabase_url or not supabase_key:
        raise HTTPException(status_code=500, detail='Supabase not configured')
    from supabase import create_client
    sb = create_client(supabase_url, supabase_key)
    resp = sb.table('wardrobe_user_items').select('id,embedding').eq('user_id', body.user_id).execute()
    rows = resp.data or []
    embeddings = [r['embedding'] for r in rows if r.get('embedding')]
    rec = CLIPRecommenderService(encoder, faiss_index)
    results = rec.recommend_for_user(embeddings, k=body.k)
    return {'results': results, 'profile_size': len(embeddings)}


@router.post('/outfit')
async def outfit_complements(request: Request, body: OutfitRequest):
    encoder, faiss_index = _get_services(request)
    from .recommender import CLIPRecommenderService
    rec = CLIPRecommenderService(encoder, faiss_index)
    results = rec.outfit_complements(body.embedding, k=body.k)
    return {'results': results}


@router.post('/build-index')
async def build_index(request: Request):
    encoder, faiss_index = _get_services(request)
    supabase_url = os.environ.get('SUPABASE_URL', '')
    supabase_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not supabase_url or not supabase_key:
        raise HTTPException(status_code=500, detail='Supabase not configured')
    from supabase import create_client
    sb = create_client(supabase_url, supabase_key)
    resp = sb.table('wardrobe_items').select('id,item_name,image_url,clothing_type,color,embedding').execute()
    items = resp.data or []
    items_with_emb = [i for i in items if i.get('embedding')]
    count = faiss_index.build(items_with_emb)
    return {'indexed': count, 'total_fetched': len(items)}


@router.post('/encode-image')
async def encode_image(request: Request, image: UploadFile = File(...)):
    encoder, _ = _get_services(request)
    data = await image.read()
    img = Image.open(io.BytesIO(data)).convert('RGB')
    emb = encoder.encode_image(img, use_fashion=True)
    return {'embedding': emb.tolist(), 'dim': len(emb)}


@router.post('/encode-text')
async def encode_text(request: Request, body: EncodeTextRequest):
    encoder, _ = _get_services(request)
    emb = encoder.encode_text(body.text, use_fashion=body.use_fashion)
    return {'embedding': emb.tolist(), 'dim': len(emb)}
