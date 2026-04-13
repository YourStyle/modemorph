"""
Recommendations — GET reads cached, POST generates via OpenRouter (Gemini).
No n8n dependency — calls OpenRouter API directly from backend.
"""

import json as json_lib
import logging
from datetime import datetime, date
from decimal import Decimal
from typing import Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def _safe_dict(row) -> dict:
    """Convert DB row to JSON-safe dict."""
    d = {}
    for k, v in dict(row).items():
        if isinstance(v, Decimal):
            d[k] = float(v)
        elif isinstance(v, (datetime, date)):
            d[k] = str(v)
        elif isinstance(v, UUID):
            d[k] = str(v)
        elif isinstance(v, bytes) or (isinstance(v, list) and len(v) > 100):
            continue  # skip embeddings
        else:
            d[k] = v
    return d


def _normalize_sections(val) -> list:
    """Normalize look_sections from DB into flat array of {title, suggestions}."""
    try:
        if val is None:
            return []
        if isinstance(val, str):
            val = json_lib.loads(val)
        if not isinstance(val, list):
            return []
        if len(val) == 1 and isinstance(val[0], dict) and "sections" in val[0]:
            return val[0]["sections"] if isinstance(val[0]["sections"], list) else []
        if len(val) == 1 and isinstance(val[0], dict) and "look_sections" in val[0] and not val[0].get("suggestions"):
            nested = val[0]["look_sections"]
            if isinstance(nested, str):
                nested = json_lib.loads(nested)
            if isinstance(nested, list):
                return _normalize_sections(nested)
        return val
    except Exception:
        return []


async def _enrich_sections(db: AsyncSession, sections: list, user_id: str) -> list:
    """Enrich AI items with image_url from DB."""
    all_ids = set()
    for section in sections:
        for sug in section.get("suggestions", []):
            for item in sug.get("items", []):
                try:
                    all_ids.add(int(item.get("id", 0)))
                except (ValueError, TypeError):
                    pass
    all_ids.discard(0)

    if not all_ids:
        return sections

    # Cap to prevent unbounded IN clause from AI data
    if len(all_ids) > 500:
        all_ids = set(list(all_ids)[:500])

    # Safe: all_ids contains only int values from int() conversion above
    id_csv = ",".join(str(i) for i in all_ids)

    user_items = await db.execute(
        text(f"SELECT id, image_url, item_name, color, shade, has_print, clothing_type, notes, user_id FROM wardrobe_user_items WHERE id IN ({id_csv}) AND user_id = :uid"),
        {"uid": user_id},
    )
    user_map = {r["id"]: dict(r) for r in user_items.mappings().all()}

    catalog_items = await db.execute(
        text(f"SELECT id, image_url, item_name, item_name_en, clothing_type, color, shade, has_print FROM wardrobe_items WHERE id IN ({id_csv})"),
    )
    catalog_map = {r["id"]: dict(r) for r in catalog_items.mappings().all()}

    for section in sections:
        for sug in section.get("suggestions", []):
            for item in sug.get("items", []):
                item_id = int(item.get("id", 0)) if item.get("id") else 0
                db_row = user_map.get(item_id) or catalog_map.get(item_id)
                if db_row:
                    item["image_url"] = db_row.get("image_url") or item.get("image_url")
                    item["name"] = item.get("name") or db_row.get("item_name") or db_row.get("item_name_en", "")
                    item["color"] = item.get("color") or db_row.get("color")
                    item["shade"] = item.get("shade") or db_row.get("shade")
                    item["clothing_type"] = item.get("clothing_type") or db_row.get("clothing_type")

    return sections


@router.get("")
async def get_recommendations(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get cached recommendations."""
    result = await db.execute(
        text("SELECT run_date, look_sections FROM main_recommendations WHERE user_id = :uid ORDER BY run_date DESC LIMIT 7"),
        {"uid": user["id"]},
    )
    rows = result.mappings().all()

    if not rows:
        return {"sections": [], "stale": True}

    today = date.today().isoformat()
    for row in rows:
        sections = _normalize_sections(row["look_sections"])
        if sections:
            enriched = await _enrich_sections(db, sections, user["id"])
            is_stale = str(row["run_date"]) != today
            return {"sections": enriched, "stale": is_stale}

    return {"sections": [], "stale": True}


@router.post("")
async def generate_recommendations(
    request: Request,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate recommendations via OpenRouter (Gemini) — no n8n."""
    api_key = settings.OPENROUTER_API_KEY
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY not configured")

    # Get gender
    profile = await db.execute(
        text("SELECT gender FROM user_profiles WHERE user_id = :uid"),
        {"uid": user["id"]},
    )
    profile_row = profile.first()
    gender = profile_row[0] if profile_row else None

    # Get wardrobe items
    wardrobe_result = await db.execute(
        text("""
            SELECT id, item_name, color, shade, style, material, clothing_type,
                   has_print, image_url, user_id
            FROM wardrobe_user_items
            WHERE user_id = :uid AND COALESCE(is_hidden, false) = false
            LIMIT 60
        """),
        {"uid": user["id"]},
    )
    wardrobe_items = [_safe_dict(r) for r in wardrobe_result.mappings().all()]

    if not wardrobe_items:
        return []

    # Get weather
    weather_result = await db.execute(
        text("SELECT * FROM weather_cache WHERE user_id = :uid ORDER BY updated_at DESC LIMIT 1"),
        {"uid": user["id"]},
    )
    weather_row = weather_result.mappings().first()
    weather = _safe_dict(weather_row) if weather_row else {
        "temperature": 15, "description": "ясно", "city_name": "Москва",
    }

    # Build prompt (same as Next.js)
    wardrobe_json = json_lib.dumps([{
        "id": i["id"], "name": i.get("item_name", ""), "color": i.get("color"),
        "shade": i.get("shade"), "style": i.get("style"), "material": i.get("material"),
        "type": i.get("clothing_type"), "has_print": i.get("has_print"),
        "image_url": i.get("image_url"), "user_id": i.get("user_id"),
    } for i in wardrobe_items], ensure_ascii=False)

    system_prompt = """You are a fashion stylist AI. Generate COMPLETE outfit recommendations based on the user's wardrobe, weather, and gender.

RULES:
- Build outfits ONLY from items in the user's wardrobe (use exact item IDs).
- Create 2-4 thematic sections (e.g. "На каждый день", "Деловой стиль", "На прогулку").
- Each section has 2-3 outfit suggestions.
- IMPORTANT: Each outfit MUST have 4-6 items covering ALL body parts:
  * Upper body (shirt/blouse/t-shirt/hoodie/sweater)
  * Lower body (pants/jeans/skirt) OR a dress
  * Outerwear (jacket/coat) if weather is below 18°C
  * Footwear (shoes/boots/sneakers) — ALWAYS include shoes
  * Optionally an accessory (bag/scarf/belt/hat)
- NEVER create outfits with only 2-3 items. A real outfit needs at least upper+lower+shoes.
- Consider the weather when choosing outfits.
- All text in Russian.

Response format (JSON array of sections):
[
  {
    "title": "Section title in Russian",
    "suggestions": [
      {
        "id": "unique_id",
        "title": "Outfit title in Russian",
        "items": [
          {"id": item_id_number, "name": "item name", "user_id": "user_id", "image_url": "url", "color": "color", "shade": null, "has_print": "no", "notes": null, "url": null}
        ],
        "suggested_items_count": number_of_items
      }
    ]
  }
]

IMPORTANT: Return ONLY valid JSON array. No markdown, no backticks."""

    user_message = f"""Gender: {gender or "не указан"}
Weather: {weather.get('city_name', 'Москва')}, {weather.get('temperature', 15)}°C, {weather.get('description', '')}

Wardrobe items:
{wardrobe_json}"""

    logger.info(f"[Recs POST] Calling OpenRouter for user {user['id']}: {len(wardrobe_items)} items")

    # Call OpenRouter
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            OPENROUTER_URL,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            json={
                "model": "google/gemini-2.5-flash-lite",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                "temperature": 0.8,
            },
        )

        if resp.status_code != 200:
            logger.error(f"[Recs POST] OpenRouter error {resp.status_code}: {resp.text[:300]}")
            raise HTTPException(status_code=502, detail="AI service error")

        ai_result = resp.json()

    # Parse response
    content = ai_result.get("choices", [{}])[0].get("message", {}).get("content", "")
    sections = []

    if content:
        try:
            cleaned = content.replace("```json", "").replace("```", "").strip()
            parsed = json_lib.loads(cleaned)
            sections = parsed if isinstance(parsed, list) else parsed.get("sections", [])
        except json_lib.JSONDecodeError:
            logger.error(f"[Recs POST] Failed to parse AI response: {content[:300]}")

    if not sections:
        logger.warning(f"[Recs POST] No sections generated for user {user['id']}")
        return []

    # Log cost
    usage = ai_result.get("usage", {})
    if usage.get("cost"):
        logger.info(f"[Recs POST] cost=${usage['cost']}, tokens={usage.get('total_tokens')}")

    # Enrich with images
    enriched = await _enrich_sections(db, sections, user["id"])

    # Save to DB
    sections_json = json_lib.dumps(enriched, ensure_ascii=False, default=str)
    existing = await db.execute(
        text("SELECT id FROM main_recommendations WHERE user_id = :uid AND run_date = CURRENT_DATE"),
        {"uid": user["id"]},
    )
    if existing.first():
        await db.execute(
            text("UPDATE main_recommendations SET look_sections = CAST(:s AS jsonb) WHERE user_id = :uid AND run_date = CURRENT_DATE"),
            {"s": sections_json, "uid": user["id"]},
        )
    else:
        await db.execute(
            text("INSERT INTO main_recommendations (user_id, run_date, look_sections, source) VALUES (:uid, CURRENT_DATE, CAST(:s AS jsonb), 'openrouter')"),
            {"uid": user["id"], "s": sections_json},
        )
    await db.commit()

    logger.info(f"[Recs POST] Generated {len(enriched)} sections for user {user['id']}")
    return enriched


@router.delete("")
async def delete_recommendations(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("DELETE FROM main_recommendations WHERE user_id = :uid AND run_date = CURRENT_DATE"),
        {"uid": user["id"]},
    )
    await db.commit()
    return {"success": True}
