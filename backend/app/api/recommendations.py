"""
Recommendations — GET reads cached, POST generates via n8n AI proxy.
Matches the Next.js behavior: POST triggers generation and saves to DB.
"""

import json as json_lib
import logging
from datetime import datetime, date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.services.n8n_proxy import n8n_proxy

logger = logging.getLogger(__name__)

router = APIRouter()


def _safe_dict(row) -> dict:
    """Convert DB row to JSON-safe dict (Decimal→float, datetime→str, UUID→str)."""
    d = {}
    for k, v in dict(row).items():
        if isinstance(v, Decimal):
            d[k] = float(v)
        elif isinstance(v, (datetime, date)):
            d[k] = str(v)
        elif isinstance(v, UUID):
            d[k] = str(v)
        elif isinstance(v, bytes):
            continue  # skip binary (embeddings)
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
        # Unwrap n8n wrapper: [{"sections": [...]}] → [...]
        if len(val) == 1 and isinstance(val[0], dict) and "sections" in val[0]:
            return val[0]["sections"] if isinstance(val[0]["sections"], list) else []
        # Unwrap nested look_sections
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
    """Enrich AI items with image_url from DB (user items + catalog)."""
    all_ids = set()
    for section in sections:
        for sug in section.get("suggestions", []):
            for item in sug.get("items", []):
                item_id = item.get("id")
                if item_id:
                    try:
                        all_ids.add(int(item_id))
                    except (ValueError, TypeError):
                        pass

    if not all_ids:
        return sections

    id_list = list(all_ids)

    # Fetch from both tables
    user_items = await db.execute(
        text("""
            SELECT id, image_url, item_name, color, shade, has_print, clothing_type, notes, user_id
            FROM wardrobe_user_items WHERE id = ANY(:ids) AND user_id = :uid
        """),
        {"ids": id_list, "uid": user_id},
    )
    user_map = {r["id"]: dict(r) for r in user_items.mappings().all()}

    catalog_items = await db.execute(
        text("""
            SELECT id, image_url, item_name, item_name_en, clothing_type, color, shade, has_print
            FROM wardrobe_items WHERE id = ANY(:ids)
        """),
        {"ids": id_list},
    )
    catalog_map = {r["id"]: dict(r) for r in catalog_items.mappings().all()}

    # Merge
    for section in sections:
        for sug in section.get("suggestions", []):
            enriched_items = []
            for item in sug.get("items", []):
                item_id = int(item.get("id", 0)) if item.get("id") else 0
                db_row = user_map.get(item_id) or catalog_map.get(item_id)
                if db_row:
                    item["image_url"] = db_row.get("image_url") or item.get("image_url")
                    item["name"] = item.get("name") or db_row.get("item_name") or db_row.get("item_name_en", "")
                    item["color"] = item.get("color") or db_row.get("color")
                    item["shade"] = item.get("shade") or db_row.get("shade")
                    item["clothing_type"] = item.get("clothing_type") or db_row.get("clothing_type")
                enriched_items.append(item)
            sug["items"] = enriched_items

    return sections


def _filter_sections(sections: list, min_items: int = 2) -> list:
    """Remove suggestions with too few items or missing images."""
    filtered = []
    for section in sections:
        good_suggestions = []
        for sug in section.get("suggestions", []):
            items = sug.get("items", [])
            # Keep suggestions with at least min_items items that have images
            items_with_images = [i for i in items if i.get("image_url")]
            if len(items_with_images) >= min_items:
                sug["items"] = items_with_images
                good_suggestions.append(sug)
        if good_suggestions:
            section["suggestions"] = good_suggestions
            filtered.append(section)
    return filtered


@router.get("")
async def get_recommendations(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get cached recommendations. Returns { sections, stale }."""
    # Fetch last 7 rows to find non-empty one
    result = await db.execute(
        text("""
            SELECT run_date, look_sections FROM main_recommendations
            WHERE user_id = :uid
            ORDER BY run_date DESC LIMIT 7
        """),
        {"uid": user["id"]},
    )
    rows = result.mappings().all()

    if not rows:
        return {"sections": [], "stale": True}

    # Find first non-empty row
    from datetime import date
    today = date.today().isoformat()

    for row in rows:
        sections = _normalize_sections(row["look_sections"])
        if sections:
            enriched = await _enrich_sections(db, sections, user["id"])
            filtered = _filter_sections(enriched)
            is_stale = str(row["run_date"]) != today
            return {"sections": filtered, "stale": is_stale or len(filtered) == 0}

    return {"sections": [], "stale": True}


@router.post("")
async def generate_recommendations(
    request: Request,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate recommendations via n8n AI proxy.
    Frontend sends POST with empty body {} to trigger generation.
    Returns generated sections array.
    """
    # Get user profile (gender)
    profile = await db.execute(
        text("SELECT gender FROM user_profiles WHERE user_id = :uid"),
        {"uid": user["id"]},
    )
    profile_row = profile.first()
    gender = profile_row[0] if profile_row else None

    # Get user's wardrobe items
    wardrobe_result = await db.execute(
        text("""
            SELECT id, item_name, color, shade, style, material, clothing_type,
                   has_print, image_url, user_id
            FROM wardrobe_user_items
            WHERE user_id = :uid
            LIMIT 60
        """),
        {"uid": user["id"]},
    )
    wardrobe_items = [_safe_dict(r) for r in wardrobe_result.mappings().all()]

    if not wardrobe_items:
        return []

    # Get cached weather
    weather_result = await db.execute(
        text("SELECT * FROM weather_cache WHERE user_id = :uid ORDER BY updated_at DESC LIMIT 1"),
        {"uid": user["id"]},
    )
    weather_row = weather_result.mappings().first()
    weather = _safe_dict(weather_row) if weather_row else {
        "temperature": 15, "description": "clear sky",
        "city_name": "Москва", "latitude": 55.7558, "longitude": 37.6176,
    }

    # Get catalog items for mixing
    catalog_result = await db.execute(
        text("""
            SELECT id, item_name, clothing_type, color, image_url, gender
            FROM wardrobe_items
            WHERE COALESCE(is_hidden, false) = false
            AND (gender = :g OR gender = 'unisex' OR gender IS NULL)
        """),
        {"g": gender or "female"},
    )
    catalog_items = [_safe_dict(r) for r in catalog_result.mappings().all()]

    logger.info(f"[Recs POST] Generating for user {user['id']}: {len(wardrobe_items)} wardrobe, {len(catalog_items)} catalog items")

    try:
        # Call n8n for AI generation
        ai_result = await n8n_proxy.generate_recommendations(
            user_id=user["id"],
            gender=gender or "female",
            weather=weather,
            user_items=wardrobe_items,
            catalog_items=catalog_items,
        )

        # Parse sections
        sections = ai_result.get("sections", ai_result.get("look_sections", []))
        if isinstance(sections, str):
            sections = json_lib.loads(sections)

        # Normalize
        sections = _normalize_sections(sections) if not isinstance(sections, list) or (
            len(sections) == 1 and "sections" in (sections[0] if isinstance(sections[0], dict) else {})
        ) else sections

        if not sections:
            logger.warning(f"[Recs POST] No sections from AI for user {user['id']}")
            return []

        # Enrich with images from DB
        enriched = await _enrich_sections(db, sections, user["id"])
        filtered = _filter_sections(enriched)

        # Save to DB
        sections_json = json_lib.dumps(filtered, ensure_ascii=False, default=str)
        existing = await db.execute(
            text("SELECT id FROM main_recommendations WHERE user_id = :uid AND run_date = CURRENT_DATE"),
            {"uid": user["id"]},
        )
        if existing.first():
            await db.execute(
                text("UPDATE main_recommendations SET look_sections = :s::jsonb WHERE user_id = :uid AND run_date = CURRENT_DATE"),
                {"s": sections_json, "uid": user["id"]},
            )
        else:
            await db.execute(
                text("""
                    INSERT INTO main_recommendations (user_id, run_date, look_sections, source)
                    VALUES (:uid, CURRENT_DATE, :s::jsonb, 'api:post')
                """),
                {"uid": user["id"], "s": sections_json},
            )
        await db.commit()

        logger.info(f"[Recs POST] Generated {len(filtered)} sections for user {user['id']}")
        return filtered

    except Exception as e:
        logger.error(f"[Recs POST] AI generation failed for user {user['id']}: {e}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


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
