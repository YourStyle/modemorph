"""
AI endpoints — replaces n8n workflow orchestration.

Data prep and post-processing runs here in FastAPI.
Only actual AI API calls (OpenAI, Gemini, FalAI) are proxied through n8n
because they require a non-Russian IP.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.services.n8n_proxy import n8n_proxy

router = APIRouter()


# ── Photo Analysis ──

@router.post("/photo-parse")
async def photo_parse(
    image: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Analyze clothing photo.
    Flow: receive image → proxy to n8n (GPT-4o pre-check + analysis + flat-lay gen) → return items.
    """
    image_bytes = await image.read()

    # Proxy to n8n for AI processing
    result = await n8n_proxy.analyze_photo(image_bytes, image.filename or "image.jpg")
    return result


# ── User Prompt Recommendations ──

class PromptRecRequest(BaseModel):
    prompt: str
    weather: dict


@router.post("/user-prompt-rec")
async def user_prompt_recommendation(
    body: PromptRecRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Process user prompt for outfit recommendation or style advice.
    Data fetching done HERE, AI call proxied through n8n.
    """
    # Fetch user's wardrobe items (was done by n8n Supabase node)
    items_result = await db.execute(
        text("""
            SELECT id, item_name, description, color, shade, has_print, notes, image_url
            FROM wardrobe_user_items
            WHERE user_id = :uid
        """),
        {"uid": user["id"]},
    )
    wardrobe_items = [dict(r) for r in items_result.mappings().all()]

    # Proxy to n8n for AI processing (text classification + GPT-4o generation)
    result = await n8n_proxy.user_prompt_recommendation(
        user_id=user["id"],
        prompt=body.prompt,
        weather=body.weather,
        wardrobe_items=wardrobe_items,
    )
    return result


# ── Main Recommendations ──

class GenerateRecsRequest(BaseModel):
    weather: dict
    gender: str = "female"


@router.post("/generate-recommendations")
async def generate_recommendations(
    body: GenerateRecsRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate daily outfit recommendations.
    Data fetching + saving done HERE, AI generation proxied through n8n.
    """
    # Fetch all catalog items (was n8n "Get All Items" Supabase node)
    catalog_result = await db.execute(
        text("""
            SELECT id, item_name, clothing_type, color, image_url, gender
            FROM wardrobe_items
            WHERE is_hidden = false AND (gender = :gender OR gender IS NULL)
        """),
        {"gender": body.gender},
    )
    catalog_items = [dict(r) for r in catalog_result.mappings().all()]

    # Fetch user's items (was n8n "Get user Items" Supabase node)
    user_items_result = await db.execute(
        text("""
            SELECT id, item_name, clothing_type, color, image_url, user_id
            FROM wardrobe_user_items
            WHERE user_id = :uid
        """),
        {"uid": user["id"]},
    )
    user_items = [dict(r) for r in user_items_result.mappings().all()]

    # Proxy to n8n for AI generation
    result = await n8n_proxy.generate_recommendations(
        user_id=user["id"],
        gender=body.gender,
        weather=body.weather,
        user_items=user_items,
        catalog_items=catalog_items,
    )

    # Save result to DB (was n8n "Check existing row" + "Create/Update row")
    import json
    sections = result.get("sections", result.get("look_sections", []))
    sections_json = json.dumps(sections, ensure_ascii=False)

    existing = await db.execute(
        text("SELECT id FROM main_recommendations WHERE user_id = :uid AND run_date = CURRENT_DATE"),
        {"uid": user["id"]},
    )
    row = existing.first()

    if row:
        await db.execute(
            text("UPDATE main_recommendations SET look_sections = :s::jsonb WHERE id = :id"),
            {"s": sections_json, "id": row[0]},
        )
    else:
        await db.execute(
            text("""
                INSERT INTO main_recommendations (user_id, run_date, look_sections, source)
                VALUES (:uid, CURRENT_DATE, :s::jsonb, 'algo:http')
            """),
            {"uid": user["id"], "s": sections_json},
        )

    await db.commit()
    return {"sections": sections, "saved": True}


# ── Virtual Try-On ──

class VTONRequest(BaseModel):
    avatar_url: str
    items: list  # [{name, description, color, material, image_url}]


@router.post("/vton")
async def virtual_tryon(
    body: VTONRequest,
    user: dict = Depends(get_current_user),
):
    """
    Virtual try-on — fully proxied to n8n (Gemini/FalAI).
    All image processing happens on foreign server.
    """
    result = await n8n_proxy.virtual_tryon(
        avatar_url=body.avatar_url,
        items=[{"name": i.get("name"), "image_url": i.get("image_url"),
                "color": i.get("color"), "description": i.get("description"),
                "material": i.get("material")} for i in body.items],
    )
    return result


# ── Admin: Detect Clothes from URL ──

class DetectClothesRequest(BaseModel):
    image_url: str
    type: str = "all"  # "all" or "text"


@router.post("/detect-clothes")
async def detect_clothes(
    body: DetectClothesRequest,
    user: dict = Depends(get_current_user),
):
    """Admin clothing detection from image URL."""
    result = await n8n_proxy.detect_clothes(body.image_url, body.type)
    return result
