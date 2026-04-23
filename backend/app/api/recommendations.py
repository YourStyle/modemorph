"""
Recommendations — GET reads cached, POST generates via OpenRouter (Gemini).
No n8n dependency — calls OpenRouter API directly from backend.
"""

import hashlib
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

# Mirrors lib/recommendation-filters.ts — keep in sync with lib/clothing-types.ts.
# One item per slot in an outfit; user items beat catalog items on the same slot.
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


def _dedup_by_slot(items: list) -> list:
    """Keep max 1 item per category slot. Prefer user items; items without a known
    clothing_type pass through untouched (accessories, footwear, etc.)."""
    slot_winner: dict = {}
    passthrough: list = []
    for item in items:
        ctype = item.get("clothing_type") if isinstance(item, dict) else None
        slot = _SLOT_MAP.get(ctype) if ctype else None
        if not slot:
            passthrough.append(item)
            continue
        existing = slot_winner.get(slot)
        if existing is None:
            slot_winner[slot] = item
            continue
        # First-wins, but user item upgrades a catalog winner.
        existing_is_user = (existing.get("item_source") == "user") or bool(existing.get("user_id"))
        current_is_user = (item.get("item_source") == "user") or bool(item.get("user_id"))
        if current_is_user and not existing_is_user:
            slot_winner[slot] = item
    return list(slot_winner.values()) + passthrough


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
        text(f"SELECT id, image_url, item_name, color, shade, has_print, clothing_type, notes, user_id FROM wardrobe_user_items WHERE id IN ({id_csv}) AND user_id = :uid AND COALESCE(is_hidden, false) = false"),
        {"uid": user_id},
    )
    user_map = {r["id"]: dict(r) for r in user_items.mappings().all()}

    catalog_items = await db.execute(
        text(f"SELECT id, image_url, item_name, item_name_en, clothing_type, color, shade, has_print FROM wardrobe_items WHERE id IN ({id_csv})"),
    )
    catalog_map = {r["id"]: dict(r) for r in catalog_items.mappings().all()}

    for section in sections:
        for sug in section.get("suggestions", []):
            enriched_items = []
            for item in sug.get("items", []):
                item_id = int(item.get("id", 0)) if item.get("id") else 0
                # Route by explicit item_source. Fallback to user_id for legacy cache entries
                # written before item_source existed. Never fall through across namespaces —
                # wardrobe_items and wardrobe_user_items have independent id sequences.
                source = item.get("item_source")
                if not source:
                    source = "user" if item.get("user_id") else "catalog"
                if source == "user":
                    db_row = user_map.get(item_id)
                else:
                    db_row = catalog_map.get(item_id)
                if db_row:
                    item["item_source"] = source
                    # Sync user_id with provenance so the UI label is never misattributed,
                    # even if the cache was written by a buggy older version.
                    if source == "user":
                        item["user_id"] = db_row.get("user_id") or item.get("user_id")
                    else:
                        item["user_id"] = None
                    item["image_url"] = item.get("image_url") or db_row.get("image_url")
                    item["name"] = item.get("name") or db_row.get("item_name") or db_row.get("item_name_en", "")
                    item["color"] = item.get("color") or db_row.get("color")
                    item["shade"] = item.get("shade") or db_row.get("shade")
                    item["clothing_type"] = item.get("clothing_type") or db_row.get("clothing_type")
                    enriched_items.append(item)
                elif source == "catalog" and item.get("image_url"):
                    # Catalog item the feed has since removed — cached image still shows the right thing.
                    item["item_source"] = "catalog"
                    item["user_id"] = None
                    enriched_items.append(item)
            # Clean up already-cached outfits with duplicate slots (pre-fix cache).
            sug["items"] = _dedup_by_slot(enriched_items)
        # Drop suggestions with too few items (post-dedup can drop below 3)
        section["suggestions"] = [s for s in section.get("suggestions", []) if len(s.get("items") or []) >= 3]

    # Drop sections with no suggestions
    return [s for s in sections if s.get("suggestions")]


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

    # Get user's dominant style
    style_result = await db.execute(
        text("SELECT dominant_style FROM user_profiles WHERE user_id = :uid"),
        {"uid": user["id"]},
    )
    style_row = style_result.mappings().first()
    dominant_style = (style_row["dominant_style"] if style_row else "") or ""

    # Get disliked item IDs (graceful if table doesn't exist yet)
    disliked_ids = set()
    try:
        disliked_result = await db.execute(
            text("SELECT item_id FROM user_item_dislikes WHERE user_id = :uid"),
            {"uid": user["id"]},
        )
        disliked_ids = {r[0] for r in disliked_result.all()}
    except Exception:
        logger.warning("[Recs POST] user_item_dislikes table not found, skipping dislike filter")
        await db.rollback()

    # Filter out disliked items from wardrobe
    if disliked_ids:
        wardrobe_items = [i for i in wardrobe_items if i["id"] not in disliked_ids]

    # Get partner items via CLIP
    partner_items = []
    ai_url = settings.AI_SERVICE_URL
    if ai_url:
        try:
            async with httpx.AsyncClient(timeout=15.0) as clip_client:
                clip_resp = await clip_client.post(
                    f"{ai_url}/clip/recommend",
                    json={"user_id": user["id"], "k": 50},
                )
                if clip_resp.status_code == 200:
                    clip_results = clip_resp.json().get("results", [])
                    if clip_results:
                        partner_ids = [r["id"] for r in clip_results]
                        # Filter out disliked items
                        if disliked_ids:
                            partner_ids = [pid for pid in partner_ids if pid not in disliked_ids]
                        if partner_ids:
                            temp = weather.get("temperature", 15)
                            partner_result = await db.execute(text("""
                                SELECT id, item_name, image_url, clothing_type, color, shade, url,
                                       notes, gender, temp_min, temp_max
                                FROM wardrobe_items WHERE id = ANY(:ids) AND COALESCE(is_hidden, false) = false
                            """), {"ids": partner_ids})
                            for r in partner_result.mappings().all():
                                row = dict(r)
                                if row.get("temp_min") is not None and temp < row["temp_min"]:
                                    continue
                                if row.get("temp_max") is not None and temp > row["temp_max"]:
                                    continue
                                if gender and row.get("gender") and row["gender"] != gender:
                                    continue
                                brand = (row.get("notes") or "").split(":")[0] or None
                                row["brand"] = brand
                                partner_items.append(row)
        except Exception as e:
            logger.warning(f"[Recs POST] CLIP unavailable: {e}")

    # Build prompt
    wardrobe_json = json_lib.dumps([{
        "id": i["id"], "name": i.get("item_name", ""), "color": i.get("color"),
        "shade": i.get("shade"), "style": i.get("style"), "material": i.get("material"),
        "type": i.get("clothing_type"), "has_print": i.get("has_print"),
        "image_url": i.get("image_url"), "user_id": i.get("user_id"),
    } for i in wardrobe_items], ensure_ascii=False)

    partner_json = ""
    if partner_items:
        partner_json = json_lib.dumps([{
            "id": i["id"], "name": i.get("item_name", ""), "color": i.get("color"),
            "type": i.get("clothing_type"), "image_url": i.get("image_url"),
            "url": i.get("url"), "brand": i.get("brand"),
        } for i in partner_items[:50]], ensure_ascii=False)

    style_hint = f"\nUser's preferred style: {dominant_style}. Most outfits (70-80%) should match this style, 2-3 can experiment." if dominant_style else ""

    has_partners = bool(partner_items)

    mix_rules = ""
    if has_partners:
        mix_rules = """- "mix" sections: mix [USER] + [PARTNER] items. At least 1 [USER] item per outfit. Create 2-3 such sections.
- "partner_only" section: outfits entirely from [PARTNER] items. Create 1 such section."""

    system_prompt = f"""You are a top fashion stylist AI. Generate MANY complete outfit recommendations.
{style_hint}
TASK: Create 5-7 themed sections, each with 3-4 outfits. Total 15-25 outfits.

SECTION THEMES (pick what fits weather/wardrobe):
"На каждый день", "В офис", "На свидание", "На прогулку", "Выходной день", "Спорт", "Вечерний выход", "Уютный день дома", "На встречу с друзьями"

SECTION TYPES (section_type):
- "user_only" — outfits ONLY from [USER] items. Create 2-3 such sections.
{mix_rules}

MANDATORY RULES FOR EVERY OUTFIT:
1. Each outfit = STRICTLY 4-6 items covering the FULL body:
   * Upper body (shirt/blouse/t-shirt/hoodie/sweater) — REQUIRED
   * Lower body (pants/jeans/skirt/shorts) OR dress — REQUIRED
   * Outerwear (jacket/coat/blazer) — REQUIRED if weather < 18°C
   * FOOTWEAR — REQUIRED IN EVERY OUTFIT
   * Accessory (bag/scarf/belt/hat/glasses) — when possible
2. FORBIDDEN: outfits with only 2-3 items. If you can't make 4+, skip it.
3. FORBIDDEN: 2 items of same type (no 2 pants, 2 jackets, 2 shirts). Strictly 1 per slot.
4. Consider weather. No heavy coats in heat, no shorts in freezing cold.
5. Consider gender — no dresses for men.
6. Short stylish outfit names (3-5 words), in Russian.
7. Use EXACT item IDs from provided lists.
8. Try to use MAXIMUM items from the wardrobe, avoid repeating the same items across outfits.

Response: JSON array, no markdown.
[{{"title":"Section name","section_type":"user_only|mix|partner_only","suggestions":[{{"title":"Outfit name","item_ids":[id1,id2,id3,id4,id5]}}]}}]"""

    user_items_block = f"User wardrobe items [USER]:\n{wardrobe_json}"
    partner_items_block = f"\n\nPartner items [PARTNER]:\n{partner_json}" if partner_json else ""

    user_message = f"""Gender: {gender or "не указан"}
Weather: {weather.get('city_name', 'Москва')}, {weather.get('temperature', 15)}°C, {weather.get('description', '')}

{user_items_block}{partner_items_block}"""

    logger.info(f"[Recs POST] Calling OpenRouter for user {user['id']}: {len(wardrobe_items)} user items, {len(partner_items)} partner items")

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
    raw_sections = []

    if content:
        try:
            cleaned = content.replace("```json", "").replace("```", "").strip()
            parsed = json_lib.loads(cleaned)
            raw_sections = parsed if isinstance(parsed, list) else parsed.get("sections", [])
        except json_lib.JSONDecodeError:
            logger.error(f"[Recs POST] Failed to parse AI response: {content[:300]}")

    if not raw_sections:
        logger.warning(f"[Recs POST] No sections generated for user {user['id']}")
        return []

    # Log cost
    usage = ai_result.get("usage", {})
    if usage.get("cost"):
        logger.info(f"[Recs POST] cost=${usage['cost']}, tokens={usage.get('total_tokens')}")

    # Build item lookup keyed by (source, id) — bare numeric id is ambiguous because
    # wardrobe_items and wardrobe_user_items have independent id sequences.
    all_items_map = {}
    for i in wardrobe_items:
        all_items_map[("user", i["id"])] = {
            "id": i["id"], "item_source": "user",
            "name": i.get("item_name", ""),
            "image_url": i.get("image_url"), "color": i.get("color", ""),
            "shade": i.get("shade", ""), "has_print": i.get("has_print", ""),
            "clothing_type": i.get("clothing_type", ""),
            "user_id": i.get("user_id", ""),
        }
    for i in partner_items:
        all_items_map[("catalog", i["id"])] = {
            "id": i["id"], "item_source": "catalog",
            "name": i.get("item_name", ""),
            "image_url": i.get("image_url"), "color": i.get("color", ""),
            "clothing_type": i.get("clothing_type", ""),
            "url": i.get("url"), "brand": i.get("brand"),
        }

    VALID_TYPES = {"user_only", "mix", "partner_only"}

    sections = []
    for gs in raw_sections:
        section_type = gs.get("section_type", "user_only")
        if section_type not in VALID_TYPES:
            section_type = "user_only"
        preferred_source = "catalog" if section_type == "partner_only" else "user"
        suggestions = []
        for sug in gs.get("suggestions", []):
            # Support both "item_ids" and "items" formats
            item_ids = sug.get("item_ids", [])
            if not item_ids and sug.get("items"):
                item_ids = [it.get("id") for it in sug["items"] if it.get("id")]
            outfit_items = []
            for iid in item_ids:
                try:
                    iid = int(iid)
                except (ValueError, TypeError):
                    continue
                item_data = (
                    all_items_map.get((preferred_source, iid))
                    or all_items_map.get(("catalog" if preferred_source == "user" else "user", iid))
                )
                if item_data:
                    outfit_items.append(item_data)
            # Gemini sometimes ignores the "1 per slot" rule (4 pants in one outfit etc.).
            # Enforce it server-side so the client never sees duplicate slots.
            outfit_items = _dedup_by_slot(outfit_items)
            # Skip incomplete outfits (fewer than 3 items)
            if len(outfit_items) >= 3:
                items_hash = hashlib.md5(",".join(str(it["id"]) for it in outfit_items).encode()).hexdigest()[:8]
                suggestions.append({
                    "id": f"{section_type}_{items_hash}",
                    "title": sug.get("title", "Образ"),
                    "items": outfit_items,
                    "suggested_items_count": len(outfit_items),
                })
        if suggestions:
            sections.append({
                "title": gs.get("title", "Рекомендации"),
                "source": section_type,
                "suggestions": suggestions,
            })

    # Save to DB
    sections_json = json_lib.dumps(sections, ensure_ascii=False, default=str)
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

    logger.info(f"[Recs POST] Generated {len(sections)} sections for user {user['id']}")
    return sections


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
