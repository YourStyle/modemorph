"""
Cron-style endpoints — called by scheduler (e.g., system cron).

1. Nightly recommendation generation (CLIP + OpenRouter Gemini)
2. Weather cache refresh
3. Feed sync — refresh Admitad feeds, remove stale items, add new
"""

import json as json_lib
import logging
import random
import uuid
import xml.etree.ElementTree as ET
from datetime import date

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.services.weather_rules import TEMP_RANGES, temp_ok
from app.services.catalog_filters import gender_ok, is_kids_name

logger = logging.getLogger(__name__)

router = APIRouter()

# Probability of using CLIP model vs Gemini-only for a given user
CLIP_PROBABILITY = 0.6


def _verify_cron_auth(request: Request):
    """Verify cron secret to prevent unauthorized triggering."""
    import hmac
    if settings.CRON_SECRET:
        auth = request.headers.get("Authorization", "")
        token = auth.replace("Bearer ", "") if auth.startswith("Bearer ") else ""
        if not hmac.compare_digest(token, settings.CRON_SECRET):
            raise HTTPException(status_code=401, detail="Invalid cron secret")


# ---------------------------------------------------------------------------
# CLIP + Gemini recommendation helpers
# ---------------------------------------------------------------------------

# Words in item names that signal female-only items (for male users)
_FEMALE_KEYWORDS = {"женск", "для девочек", "для девушек", "юбка", "платье", "бюстгальтер", "лифчик", "колготки", "блузка"}
_MALE_KEYWORDS = {"мужск", "для мальчиков"}


def _is_partner_compatible(row: dict, gender: str | None, temp: int, disliked_ids: set) -> bool:
    """Check if a partner item is compatible with user gender, weather, and not disliked."""
    item_id = row["id"]
    if item_id in disliked_ids:
        return False
    # Weather filter (infers warmth from type/name when temp_min/max is NULL)
    if not temp_ok(row, temp):
        return False
    # Gender match + kids exclusion + NULL-gender name rescue (shared helper).
    return gender_ok(row, gender)

async def _clip_recommend(user_id: str, k: int = 50) -> tuple[list, str | None]:
    """Call CLIP service /clip/recommend for personalized partner items.

    Returns (results, rec_session_id). The rec_session_id is the identifier the
    CLIP service stamped on its served-baseline rows in recommendation_logs;
    carrying it forward lets the frontend post impression/click events that join
    back to those rows. Previously this was discarded, which is why the daily
    feed emitted almost no client events (cards had no rec_session_id to send)."""
    ai_url = settings.AI_SERVICE_URL
    if not ai_url:
        return [], None
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{ai_url}/clip/recommend",
                json={"user_id": user_id, "k": k},
            )
            if resp.status_code == 200:
                payload = resp.json()
                return payload.get("results", []), payload.get("rec_session_id")
    except Exception as e:
        logger.warning(f"[Cron] CLIP unavailable: {e}")
    return [], None


async def _gemini_organize(
    user_items: list, partner_items: list, weather: dict, gender: str,
    dominant_style: str = "", sections_count: int = 3,
) -> list | None:
    """Use OpenRouter Gemini to organize items into themed outfit sections."""
    api_key = settings.OPENROUTER_API_KEY
    if not api_key:
        return None

    user_desc = []
    for i in user_items[:50]:
        name = i.get("item_name", "?")
        ct = i.get("clothing_type", "")
        color = i.get("color", "")
        style = i.get("style", "")
        season = ""
        tmin, tmax = i.get("temp_min"), i.get("temp_max")
        if tmin is not None or tmax is not None:
            season = f", сезон: {tmin or '?'}..{tmax or '?'}°C"
        user_desc.append(f"[USER id={i['id']}] {name} ({ct}, {color}, стиль: {style}{season})")

    partner_desc = []
    for i in partner_items[:50]:
        name = i.get("item_name") or i.get("name", "?")
        ct = i.get("clothing_type", "")
        color = i.get("color", "")
        brand = i.get("brand", "")
        season = ""
        tmin, tmax = i.get("temp_min"), i.get("temp_max")
        if tmin is not None or tmax is not None:
            season = f", сезон: {tmin or '?'}..{tmax or '?'}°C"
        partner_desc.append(f"[PARTNER id={i['id']} brand={brand}] {name} ({ct}, {color}{season})")

    all_items = "\n".join(user_desc + partner_desc)
    temp = weather.get("temperature", 20)
    desc = weather.get("description", "ясно")

    style_instruction = ""
    if dominant_style:
        style_instruction = f"""
СТИЛЬ ПОЛЬЗОВАТЕЛЯ: {dominant_style}
- Большинство образов (70-80%) должны соответствовать стилю "{dominant_style}"
- 2-3 образа могут быть в ДРУГОМ стиле — для разнообразия
"""

    has_partners = bool(partner_items)
    small_wardrobe = len(user_items) < 6

    mix_rules = ""
    if has_partners:
        mix_rules = """- В разделах "mix" — микс вещей пользователя [USER] и партнёрских [PARTNER]. Минимум 1 вещь [USER] в каждом образе.
- В разделах "partner_only" — образы целиком из [PARTNER] вещей. Миксуй бренды или собирай из одного."""

    # For small wardrobes: lean heavily on partner items
    if small_wardrobe and has_partners:
        section_types_block = f"""ТИПЫ РАЗДЕЛОВ (section_type):
- "user_only" — с использованием [USER] вещей. Создай 1 раздел (вещей мало, но задействуй все).
- "mix" — микс [USER] + [PARTNER]. Создай 2-3 таких раздела — это основной тип.
- "partner_only" — только [PARTNER]. Создай 2-3 раздела — у пользователя мало вещей, поэтому подбери ему МНОГО готовых образов из рекомендованных."""
    elif has_partners:
        section_types_block = f"""ТИПЫ РАЗДЕЛОВ (section_type):
- "user_only" — образы ТОЛЬКО из [USER] вещей. Создай 2-3 таких раздела.
- "mix" — микс [USER] + [PARTNER]. Создай 2-3 таких раздела.
- "partner_only" — только [PARTNER]. Создай 1 раздел."""
    else:
        section_types_block = """ТИПЫ РАЗДЕЛОВ (section_type):
- "user_only" — образы из вещей пользователя [USER]. Создай все разделы этого типа."""

    prompt = f"""Ты - топ-стилист. Составь МНОГО тематических разделов с образами.

Погода: {temp}°C, {desc}
Пол: {gender or 'не указан'}
{style_instruction}
Доступные вещи:
{all_items}

ЗАДАЧА: Создай 5-7 тематических разделов, в каждом по 3-4 образа. Итого 15-25 образов.
{"У пользователя мало своих вещей — активно используй рекомендованные [PARTNER] вещи для полных комплектов!" if small_wardrobe and has_partners else ""}

ТЕМЫ РАЗДЕЛОВ (примеры, выбирай подходящие по погоде и гардеробу):
- "На каждый день", "В офис", "На свидание", "На прогулку", "Выходной день", "Спорт и активный отдых", "Вечерний выход", "Уютный день дома", "На встречу с друзьями"

{section_types_block}
{mix_rules}

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА ДЛЯ КАЖДОГО ОБРАЗА:
1. Каждый образ = СТРОГО 4-6 вещей, покрывающих ВСЁ тело:
   - Верх (футболка/рубашка/блузка/свитер/худи) — ОБЯЗАТЕЛЬНО
   - Низ (брюки/джинсы/юбка/шорты) ИЛИ платье — ОБЯЗАТЕЛЬНО
   - Верхняя одежда (куртка/пальто/пиджак) — ОБЯЗАТЕЛЬНО если {temp}°C < 18
   - ОБУВЬ — ОБЯЗАТЕЛЬНО В КАЖДОМ ОБРАЗЕ
   - Аксессуар (сумка/шарф/ремень/шапка/очки) — по возможности
2. ЗАПРЕЩЕНО: образ из 2-3 вещей. Если не можешь собрать 4+, пропусти образ.
3. ЗАПРЕЩЕНО: 2 вещи одного типа (2 штанов, 2 куртки, 2 рубашки). Строго 1 вещь на слот.
4. СТРОГО учитывай погоду ({temp}°C, {desc}):
   - При {temp}°C НЕ сочетай зимние вещи (пуховики, тёплые перчатки, шапки) с летними (шорты, майки)
   - Все вещи в образе должны быть для ОДНОГО сезона/погоды
   - Перчатки, тёплые шапки — только если < 5°C
   - Шорты, майки — только если > 20°C
5. Учитывай пол — не предлагай платья мужчинам.
6. Название каждого образа: стильное, 3-5 слов.
7. Используй ТОЛЬКО точные ID из списка вещей.
8. Старайся задействовать МАКСИМУМ вещей из гардероба, не повторяя одни и те же.

JSON: [{{"title":"Название раздела","section_type":"user_only|mix|partner_only","suggestions":[{{"title":"Название образа","item_ids":[id1,id2,id3,id4,id5]}}]}}]
Только JSON, без markdown."""

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                },
                json={
                    "model": "google/gemini-2.5-flash-lite",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.85,
                },
            )
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            cleaned = content.replace("```json", "").replace("```", "").strip()
            return json_lib.loads(cleaned)
    except Exception as e:
        logger.warning(f"[Cron] Gemini failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Cron endpoints
# ---------------------------------------------------------------------------

@router.post("/generate-recommendations")
async def cron_generate_recommendations(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Nightly recommendation generation for all active users.

    Uses A/B split:
    - CLIP_PROBABILITY chance: CLIP finds partner items + Gemini organizes into outfits
    - Otherwise: Gemini generates from user wardrobe only

    Both approaches mix user + partner items and account for weather/gender.
    """
    _verify_cron_auth(request)

    today = date.today()

    # Find users eligible for recommendation refresh.
    # Logic: skip users who haven't logged in recently AND already have fresh recs.
    #   - active recently (last 14 days) → always refresh
    #   - inactive but stale recs (>3 days old or none) → refresh
    #   - inactive AND fresh recs (<3 days) → skip
    users_result = await db.execute(text("""
        SELECT up.user_id, up.gender,
               (SELECT count(*) FROM wardrobe_user_items wui
                WHERE wui.user_id = up.user_id
                AND COALESCE(wui.is_hidden, false) = false) as item_count,
               (SELECT max(dua.last_seen_at)
                FROM daily_user_activity dua
                WHERE dua.user_profile_id = up.id) as last_seen,
               (SELECT max(mr.run_date)
                FROM main_recommendations mr
                WHERE mr.user_id = up.user_id) as last_recs_date
        FROM user_profiles up
        WHERE (SELECT count(*) FROM wardrobe_user_items wui
               WHERE wui.user_id = up.user_id
               AND COALESCE(wui.is_hidden, false) = false) >= 1
    """))
    all_users = users_result.mappings().all()

    # Filter: skip inactive users with fresh recs
    users = []
    skipped_fresh = 0
    for u in all_users:
        last_seen = u["last_seen"]
        last_recs = u["last_recs_date"]
        active_recently = last_seen and (today - last_seen.date()).days <= 14
        has_fresh_recs = last_recs and (today - last_recs).days < 3

        if not active_recently and has_fresh_recs:
            skipped_fresh += 1
            continue
        users.append(u)

    logger.info(f"[Cron Recs] {len(all_users)} total users, {len(users)} eligible, {skipped_fresh} skipped (inactive + fresh recs)")

    # Fetch current Moscow weather as fallback for users without weather_cache
    moscow_weather = {"temperature": 15, "description": "ясно"}
    try:
        api_key = settings.OPENWEATHER_API_KEY
        if api_key:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    "https://api.openweathermap.org/data/2.5/weather",
                    params={"q": "Moscow,RU", "appid": api_key, "units": "metric", "lang": "ru"},
                )
                data = resp.json()
                moscow_weather = {
                    "temperature": round(data.get("main", {}).get("temp", 15)),
                    "description": data.get("weather", [{}])[0].get("description", "ясно"),
                }
                logger.info(f"[Cron Recs] Moscow weather fallback: {moscow_weather}")
    except Exception as e:
        logger.warning(f"[Cron Recs] Failed to fetch Moscow weather: {e}")

    results = {"total": len(users), "success": 0, "failed": 0, "clip": 0, "gemini_only": 0}

    results["skipped_fresh"] = skipped_fresh

    for user_row in users:
        user_id = str(user_row["user_id"])
        gender = user_row.get("gender") or None
        item_count = user_row["item_count"] or 0
        # Small wardrobe (<6 items) → always use CLIP partners
        use_clip = True if item_count < 6 else random.random() < CLIP_PROBABILITY

        try:
            # Get user wardrobe items
            user_items_result = await db.execute(text("""
                SELECT id, item_name, clothing_type, color, style, material,
                       image_url, user_id::text as user_id, temp_min, temp_max
                FROM wardrobe_user_items
                WHERE user_id = :uid AND COALESCE(is_hidden, false) = false
                AND image_url IS NOT NULL
            """), {"uid": user_id})
            user_items = [dict(r) for r in user_items_result.mappings().all()]

            # Filter out disliked items (graceful if table doesn't exist yet)
            disliked_ids = set()
            try:
                disliked_result = await db.execute(
                    text("SELECT item_id FROM user_item_dislikes WHERE user_id = :uid"),
                    {"uid": user_id},
                )
                disliked_ids = {r[0] for r in disliked_result.all()}
            except Exception:
                logger.warning("[Cron Recs] user_item_dislikes table not found, skipping")
                await db.rollback()
            if disliked_ids:
                user_items = [i for i in user_items if i["id"] not in disliked_ids]

            # Weather-filter user items too (remove winter gloves in spring, etc.)
            # Applied AFTER we know the temperature
            # (we read weather below, so we do the filter after weather fetch)

            # Get user's dominant style
            style_result = await db.execute(text(
                "SELECT dominant_style FROM user_profiles WHERE user_id = :uid"
            ), {"uid": user_id})
            style_row = style_result.mappings().first()
            dominant_style = (style_row["dominant_style"] if style_row else "") or ""

            # Get weather
            weather_result = await db.execute(text("""
                SELECT temperature, description, city_name
                FROM weather_cache WHERE user_id = :uid
                ORDER BY updated_at DESC LIMIT 1
            """), {"uid": user_id})
            weather_row = weather_result.mappings().first()
            weather = {
                "temperature": weather_row["temperature"] if weather_row else moscow_weather["temperature"],
                "description": weather_row["description"] if weather_row else moscow_weather["description"],
            }
            temp = weather["temperature"] or 20

            # Filter user items by weather (remove winter coats at +20°C, shorts at 0°C).
            # temp_ok() also infers warmth from type/name when temp_min/max is NULL.
            user_items = [i for i in user_items if temp_ok(i, temp)]

            # Get partner items via CLIP (if chosen)
            # Small wardrobes get more partner items to build full outfits
            partner_items = []
            clip_rec_session_id = None
            clip_k = 100 if item_count < 6 else 80
            if use_clip:
                clip_results, clip_rec_session_id = await _clip_recommend(user_id, k=clip_k)
                if clip_results:
                    partner_ids = [r["id"] for r in clip_results]
                    partner_result = await db.execute(text("""
                        SELECT id, item_name, image_url, clothing_type, color, url,
                               notes, gender, temp_min, temp_max, is_kids
                        FROM wardrobe_items WHERE id = ANY(:ids)
                        AND COALESCE(is_hidden, false) = false
                        AND COALESCE(is_kids, false) = false
                    """), {"ids": partner_ids})
                    for r in partner_result.mappings().all():
                        row = dict(r)
                        if not _is_partner_compatible(row, gender, temp, disliked_ids):
                            continue
                        brand = (row.get("notes") or "").split(":")[0] or None
                        row["brand"] = brand
                        partner_items.append(row)

            # Fallback: if CLIP returned too few usable partners, query catalog directly
            if len(partner_items) < 15:
                gender_filter = ""
                binds = {"temp": temp, "lim": 60 - len(partner_items)}
                if gender == "male":
                    gender_filter = "AND (gender IS NULL OR gender = '' OR gender = 'male' OR gender = 'unisex')"
                elif gender == "female":
                    gender_filter = "AND (gender IS NULL OR gender = '' OR gender = 'female' OR gender = 'unisex')"
                existing_ids = {p["id"] for p in partner_items} | {i["id"] for i in user_items}
                fallback_result = await db.execute(text(f"""
                    SELECT id, item_name, image_url, clothing_type, color, url,
                           notes, gender, temp_min, temp_max, is_kids
                    FROM wardrobe_items
                    WHERE COALESCE(is_hidden, false) = false
                    AND COALESCE(is_kids, false) = false
                    {gender_filter}
                    AND (temp_min IS NULL OR temp_min <= :temp)
                    AND (temp_max IS NULL OR temp_max >= :temp)
                    AND image_url IS NOT NULL
                    ORDER BY random()
                    LIMIT :lim
                """), binds)
                for r in fallback_result.mappings().all():
                    row = dict(r)
                    if row["id"] in existing_ids or row["id"] in disliked_ids:
                        continue
                    if not _is_partner_compatible(row, gender, temp, disliked_ids):
                        continue
                    brand = (row.get("notes") or "").split(":")[0] or None
                    row["brand"] = brand
                    partner_items.append(row)

            if not user_items and not partner_items:
                continue

            # Build item lookup.
            # The identifier the frontend posts impression/click/save events with.
            # Reuse CLIP's session id (so events join to its served-baseline rows);
            # fall back to a fresh id when CLIP wasn't used, so the daily feed is
            # ALWAYS trackable. Without this, cards rendered recSessionId=null and
            # every event silently no-op'd — the cause of ~0 recommendation CTR.
            rec_session_id = clip_rec_session_id or uuid.uuid4().hex[:12]

            # Keys are tuples (source, id) because wardrobe_items and wardrobe_user_items
            # have independent id sequences — a bare numeric id is ambiguous.
            all_items_map = {}
            for i in user_items:
                all_items_map[("user", i["id"])] = {
                    "id": i["id"],
                    "item_source": "user",
                    "name": i["item_name"],
                    "image_url": i["image_url"],
                    "color": i.get("color", ""),
                    "clothing_type": i.get("clothing_type", ""),
                    "user_id": i.get("user_id", ""),
                }
            for i in partner_items:
                all_items_map[("catalog", i["id"])] = {
                    "id": i["id"],
                    "item_source": "catalog",
                    "name": i["item_name"],
                    "image_url": i["image_url"],
                    "color": i.get("color", ""),
                    "clothing_type": i.get("clothing_type", ""),
                    "url": i.get("url"),
                    "brand": i.get("brand"),
                    "rec_session_id": rec_session_id,
                }

            # Ask Gemini to organize
            n_sections = min(7, max(3, len(user_items) // 3 + 1))
            gemini_sections = await _gemini_organize(
                user_items, partner_items, weather, gender, dominant_style, n_sections,
            )

            VALID_TYPES = {"user_only", "mix", "partner_only"}

            sections = []

            if gemini_sections and isinstance(gemini_sections, list):
                for gs in gemini_sections:
                    section_type = gs.get("section_type", "user_only")
                    if section_type not in VALID_TYPES:
                        section_type = "mix" if partner_items else "user_only"
                    # Per-section source preference — resolves id collisions between user and catalog tables.
                    preferred_source = "catalog" if section_type == "partner_only" else "user"
                    suggestions = []
                    for sug in gs.get("suggestions", []):
                        outfit_items = []
                        for iid in sug.get("item_ids", []):
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
                        # Skip outfits with fewer than 3 items (incomplete)
                        if len(outfit_items) >= 3:
                            suggestions.append({
                                "id": f"{section_type}_{user_id[:8]}_{len(sections)}_{len(suggestions)}",
                                "title": sug.get("title", "Образ"),
                                "items": outfit_items,
                                "suggested_items_count": len(outfit_items),
                            })
                    if suggestions:
                        sections.append({
                            "title": gs.get("title", "Рекомендации"),
                            "source": section_type,
                            # Frontend reads this to fire impression/click/save
                            # events (OutfitCard recSessionId prop). Missing here
                            # was why the daily feed produced ~0 client events.
                            "rec_session_id": rec_session_id,
                            "suggestions": suggestions,
                        })

            if not sections:
                results["failed"] += 1
                continue

            # Save. Tag the generator (clip+gemini vs gemini-only) so analytics
            # can tell daily-cron rows apart from on-demand POST rows (source was
            # NULL before, which made A/B-by-source impossible).
            row_source = "clip+gemini" if (use_clip and partner_items) else "gemini"
            sections_json = json_lib.dumps(sections, ensure_ascii=False)
            await db.execute(text("""
                INSERT INTO main_recommendations (user_id, run_date, look_sections, source)
                VALUES (:uid, :d, CAST(:sections AS jsonb), :src)
                ON CONFLICT (user_id, run_date) DO UPDATE SET
                    look_sections = CAST(:sections AS jsonb),
                    source = EXCLUDED.source
            """), {"uid": user_id, "d": today, "sections": sections_json, "src": row_source})
            await db.commit()

            total_outfits = sum(len(s["suggestions"]) for s in sections)
            section_types = [s["source"] for s in sections]
            logger.info(f"[Cron Recs] User {user_id[:8]}... {section_types} {len(sections)} sections, {total_outfits} outfits")

            results["success"] += 1
            if use_clip and partner_items:
                results["clip"] += 1
            else:
                results["gemini_only"] += 1

        except Exception as e:
            logger.error(f"[Cron Recs] Failed for {user_id[:8]}: {e}")
            results["failed"] += 1
            await db.rollback()

    logger.info(f"[Cron Recs] Done: {results}")

    # After generating recommendations, rebuild user clusters + LightGCN.
    # Order matters: clusters give us collaborative dislike/like signal that
    # is independent of LightGCN; LightGCN is the heavier CF model. If either
    # fails, the other still runs.
    ai_url = settings.AI_SERVICE_URL
    if ai_url and results["success"] > 0:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                cluster_resp = await client.post(f"{ai_url}/clip/clusters/build")
                if cluster_resp.status_code == 200:
                    cluster_data = cluster_resp.json()
                    logger.info(f"[Cron Recs] Cluster rebuild: {cluster_data}")
                    results["clusters"] = cluster_data
        except Exception as e:
            logger.warning(f"[Cron Recs] Cluster rebuild failed: {e}")

        # Training budget is generous — LightGCN can take minutes on thousands
        # of edges. If we have very little data the endpoint returns quickly.
        try:
            async with httpx.AsyncClient(timeout=600.0) as client:
                gnn_resp = await client.post(f"{ai_url}/clip/train-lightgcn")
                if gnn_resp.status_code == 200:
                    gnn_data = gnn_resp.json()
                    logger.info(f"[Cron Recs] LightGCN train: {gnn_data}")
                    results["lightgcn"] = gnn_data
        except Exception as e:
            logger.warning(f"[Cron Recs] LightGCN train failed: {e}")

    return results


@router.post("/rebuild-clusters")
async def cron_rebuild_clusters(request: Request):
    """Manually trigger user cluster rebuild."""
    _verify_cron_auth(request)

    ai_url = settings.AI_SERVICE_URL
    if not ai_url:
        return {"error": "AI_SERVICE_URL not configured"}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(f"{ai_url}/clip/clusters/build")
            if resp.status_code == 200:
                return resp.json()
            return {"error": f"CLIP service returned {resp.status_code}"}
    except Exception as e:
        logger.error(f"[Cron] Cluster rebuild failed: {e}")
        return {"error": str(e)}


@router.post("/train-lightgcn")
async def cron_train_lightgcn(request: Request):
    """Manually trigger LightGCN training. Usually runs nightly as part of
    /api/cron/generate-recommendations, but exposed separately so we can
    force a retrain after a surge of new likes without waiting for the
    next recs batch."""
    _verify_cron_auth(request)

    ai_url = settings.AI_SERVICE_URL
    if not ai_url:
        return {"error": "AI_SERVICE_URL not configured"}

    try:
        async with httpx.AsyncClient(timeout=600.0) as client:
            resp = await client.post(f"{ai_url}/clip/train-lightgcn")
            if resp.status_code == 200:
                return resp.json()
            return {"error": f"CLIP service returned {resp.status_code}"}
    except Exception as e:
        logger.error(f"[Cron] LightGCN train failed: {e}")
        return {"error": str(e)}


@router.post("/process-feeds")
async def cron_process_feeds(request: Request, db: AsyncSession = Depends(get_db)):
    """Process pending partner XML feeds — parse YML, insert items into wardrobe_items."""
    _verify_cron_auth(request)

    # Pick oldest pending feed
    result = await db.execute(text("SELECT * FROM partner_feeds WHERE status = 'pending' ORDER BY created_at LIMIT 1"))
    feed = result.mappings().first()
    if not feed:
        return {"message": "No pending feeds"}

    feed_id = feed["id"]
    partner_id = feed["partner_id"]
    logger.info(f"[ProcessFeeds] Processing feed {feed_id} ({feed['file_name']})")

    await db.execute(text("UPDATE partner_feeds SET status = 'processing' WHERE id = :fid"), {"fid": feed_id})
    await db.commit()

    try:
        # Download XML
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(feed["file_url"])
            if resp.status_code != 200:
                raise Exception(f"Failed to download feed: {resp.status_code}")
            xml_string = resp.text

        # Parse using the shared feed parser
        from lib_feed_parser import parse_yml_feed
        parsed = parse_yml_feed(xml_string)

        logger.info(f"[ProcessFeeds] Feed {feed_id}: {len(parsed['items'])} items from {parsed['total_offers']} offers")

        # Every XML/YML feed must go through /clip/pick-flatlay — including single-picture offers.
        # Skipping single-pic items leaks model-photos into the catalog (Love Republic: ~38% model-only).
        ai_url = settings.AI_SERVICE_URL
        flaggable = [i for i in parsed["items"] if i.get("all_pictures")]
        person_count = 0
        if ai_url and flaggable:
            logger.info(f"[ProcessFeeds] Running /clip/pick-flatlay on {len(flaggable)} items...")
            async with httpx.AsyncClient(timeout=20.0) as client:
                for item in flaggable:
                    try:
                        resp = await client.post(
                            f"{ai_url}/clip/pick-flatlay",
                            json={"urls": item["all_pictures"][:4]},
                        )
                        if resp.status_code == 200:
                            data = resp.json()
                            if data.get("url"):
                                item["image_url"] = data["url"]
                            item["has_person"] = bool(data.get("has_person"))
                            if item["has_person"]:
                                person_count += 1
                    except Exception as e:
                        logger.debug(f"[ProcessFeeds] pick-flatlay failed for item: {e}")
            logger.info(f"[ProcessFeeds] Flat-lay selection done ({person_count} items flagged as model-photo)")

        imported = 0
        skipped = 0

        for item in parsed["items"]:
            notes = f"{item['source']}:{item['source_sku']}"
            existing = await db.execute(text("SELECT id FROM wardrobe_items WHERE notes = :notes LIMIT 1"), {"notes": notes})
            if existing.first():
                skipped += 1
                continue

            # Model-photo items get auto-hidden — admin can review and un-hide if needed.
            is_hidden = bool(item.get("has_person"))
            await db.execute(text("""
                INSERT INTO wardrobe_items (item_name, description, image_url, url, clothing_type, color, gender, style, is_hidden, is_basic, notes, partner_id, feed_id, price)
                VALUES (:name, :desc, :img, :url, :ct, :color, :gender, 'Casual', :hidden, false, :notes, :pid, :fid, :price)
            """), {
                "name": item["item_name"], "desc": item["description"], "img": item["image_url"],
                "url": item["url"], "ct": item["clothing_type"], "color": item["color"],
                "gender": item["gender"], "hidden": is_hidden, "notes": notes, "pid": partner_id, "fid": feed_id,
                "price": item["price"],
            })
            imported += 1

        await db.execute(text("""
            UPDATE partner_feeds SET status = 'completed', items_total = :total, items_imported = :imp, items_skipped = :skip, completed_at = NOW()
            WHERE id = :fid
        """), {"total": len(parsed["items"]), "imp": imported, "skip": skipped, "fid": feed_id})
        await db.commit()

        # Trigger CLIP index rebuild
        if imported > 0:
            ai_url = settings.AI_SERVICE_URL
            if ai_url:
                try:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        await client.post(f"{ai_url}/clip/build-index")
                except Exception as e:
                    logger.warning(f"[ProcessFeeds] CLIP rebuild failed: {e}")

        logger.info(f"[ProcessFeeds] Feed {feed_id} done: {imported} imported, {skipped} skipped")
        return {"success": True, "feed_id": feed_id, "imported": imported, "skipped": skipped}

    except Exception as e:
        error_msg = str(e)
        logger.error(f"[ProcessFeeds] Feed {feed_id} failed: {error_msg}")
        await db.execute(text("UPDATE partner_feeds SET status = 'failed', error_log = :err WHERE id = :fid"), {"err": error_msg, "fid": feed_id})
        await db.commit()
        return {"error": error_msg}


@router.post("/refresh-weather")
async def cron_refresh_weather(request: Request, db: AsyncSession = Depends(get_db)):
    _verify_cron_auth(request)
    """Refresh cached weather for active users."""

    users_result = await db.execute(text("""
        SELECT DISTINCT wc.user_id, wc.latitude, wc.longitude
        FROM weather_cache wc
        WHERE wc.updated_at < NOW() - INTERVAL '6 hours'
    """))
    users = users_result.mappings().all()

    api_key = settings.OPENWEATHER_API_KEY
    if not api_key:
        return {"error": "Weather API not configured"}

    updated = 0
    for row in users:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "https://api.openweathermap.org/data/2.5/weather",
                    params={"lat": row["latitude"], "lon": row["longitude"],
                            "appid": api_key, "units": "metric", "lang": "ru"},
                )
                data = resp.json()

            await db.execute(text("""
                UPDATE weather_cache SET
                    temperature = :temp, description = :desc, condition = :cond,
                    humidity = :hum, wind_speed = :wind, city_name = :city,
                    country = :country, updated_at = NOW()
                WHERE user_id = :uid
            """), {
                "uid": row["user_id"],
                "temp": round(data.get("main", {}).get("temp", 0)),
                "desc": data.get("weather", [{}])[0].get("description", ""),
                "cond": data.get("weather", [{}])[0].get("main", ""),
                "hum": data.get("main", {}).get("humidity", 0),
                "wind": round(data.get("wind", {}).get("speed", 0)),
                "city": data.get("name", ""),
                "country": data.get("sys", {}).get("country", ""),
            })
            updated += 1
        except Exception as e:
            logger.error(f"Weather refresh failed for {row['user_id']}: {e}")

    await db.commit()
    return {"updated": updated, "total": len(users)}


# ---------------------------------------------------------------------------
# Feed sync — refresh Admitad feeds, hide stale items, add new ones
# ---------------------------------------------------------------------------

# Registered feeds: source_name → feed URL
ADMITAD_FEEDS = {
    "SELA": "http://export.admitad.com/ru/webmaster/websites/2883898/products/export_adv_products/?user=anton_chukseev9c1e2&code=4e79g72v7f&feed_id=24700&format=xml",
    "Gate31": "http://export.admitad.com/ru/webmaster/websites/2883898/products/export_adv_products/?user=anton_chukseev9c1e2&code=4e79g72v7f&feed_id=18983&format=xml",
    "Lacoste": "http://export.admitad.com/ru/webmaster/websites/2883898/products/export_adv_products/?user=anton_chukseev9c1e2&code=4e79g72v7f&feed_id=26532&format=xml",
    "Love Republic": "http://export.admitad.com/ru/webmaster/websites/2883898/products/export_adv_products/?user=anton_chukseev9c1e2&code=4e79g72v7f&feed_id=14764&format=xml",
}

# Threshold: if more than this % of items missing from feed, hide them
STALE_THRESHOLD_PCT = 10


def _parse_feed_skus(xml_bytes: bytes) -> set[str]:
    """Extract all offer IDs/models from YML feed XML."""
    root = ET.fromstring(xml_bytes)
    shop = root.find("shop")
    if not shop:
        return set()
    skus = set()
    for offer in shop.findall(".//offer"):
        model = offer.findtext("model", "")
        oid = offer.get("id", "")
        skus.add(model or oid)
    return skus


@router.post("/sync-feeds")
async def sync_feeds(request: Request, db: AsyncSession = Depends(get_db)):
    """Sync catalog feeds: hide items removed from feed, report stats."""
    _verify_cron_auth(request)

    results = {}
    async with httpx.AsyncClient(timeout=60.0) as client:
        for source_name, feed_url in ADMITAD_FEEDS.items():
            try:
                # 1. Download feed
                resp = await client.get(feed_url)
                resp.raise_for_status()
                feed_skus = _parse_feed_skus(resp.content)
                if not feed_skus:
                    results[source_name] = {"error": "Empty feed or parse error"}
                    continue

                # 2. Get current DB items for this source
                db_rows = await db.execute(
                    text("SELECT id, notes FROM wardrobe_items WHERE notes LIKE :prefix AND is_hidden = false"),
                    {"prefix": f"{source_name}:%"},
                )
                db_items = db_rows.all()

                # 3. Find stale items (in DB but not in feed)
                stale_ids = []
                for row in db_items:
                    sku = row.notes.split(":", 1)[1] if ":" in row.notes else ""
                    if sku and sku not in feed_skus:
                        stale_ids.append(row.id)

                stale_pct = (len(stale_ids) / max(len(db_items), 1)) * 100

                # 4. Hide stale items (only if above threshold to avoid false positives)
                hidden = 0
                if stale_ids and stale_pct >= STALE_THRESHOLD_PCT:
                    await db.execute(
                        text("UPDATE wardrobe_items SET is_hidden = true WHERE id = ANY(:ids)"),
                        {"ids": stale_ids},
                    )
                    hidden = len(stale_ids)

                results[source_name] = {
                    "feed_items": len(feed_skus),
                    "db_items": len(db_items),
                    "stale": len(stale_ids),
                    "stale_pct": round(stale_pct, 1),
                    "hidden": hidden,
                }
                logger.info(f"[sync-feeds] {source_name}: feed={len(feed_skus)} db={len(db_items)} stale={len(stale_ids)} ({stale_pct:.1f}%) hidden={hidden}")
            except Exception as e:
                logger.error(f"[sync-feeds] {source_name} failed: {e}")
                results[source_name] = {"error": str(e)}

    await db.commit()

    # 5. Trigger import_catalog.py for new items (via AI service)
    # New items are added by the regular import_catalog.py script which skips duplicates
    trigger_note = "Run import_catalog.py --encode-embeddings for each feed to add new items"

    return {"feeds": results, "note": trigger_note}


# ---------------------------------------------------------------------------
# Style analysis — classify wardrobe items + compute user dominant style
# ---------------------------------------------------------------------------

AI_SERVICE_URL = settings.AI_SERVICE_URL or "http://modemorph-ai:8000"


@router.post("/analyze-styles")
async def analyze_styles(request: Request, db: AsyncSession = Depends(get_db)):
    """Classify style for user wardrobe items, then compute dominant style per user."""
    _verify_cron_auth(request)

    # 1. Find user items without style (or with generic 'Casual')
    rows = await db.execute(text("""
        SELECT id, image_url FROM wardrobe_user_items
        WHERE image_url IS NOT NULL
          AND (style IS NULL OR style = '' OR style = 'Casual')
        ORDER BY id
        LIMIT 500
    """))
    items = rows.all()
    logger.info(f"[analyze-styles] Found {len(items)} items to classify")

    classified = 0
    async with httpx.AsyncClient(timeout=30.0) as client:
        for item in items:
            try:
                # Download image and send to CLIP classify
                img_resp = await client.get(item.image_url, timeout=10.0)
                if img_resp.status_code != 200:
                    continue

                clip_resp = await client.post(
                    f"{AI_SERVICE_URL}/clip/classify",
                    files={"image": ("img.jpg", img_resp.content, "image/jpeg")},
                    timeout=15.0,
                )
                if clip_resp.status_code != 200:
                    continue

                result = clip_resp.json()
                style_tags = result.get("style_tags", [])
                primary_style = style_tags[0] if style_tags else None

                if primary_style:
                    await db.execute(
                        text("UPDATE wardrobe_user_items SET style = :style WHERE id = :id"),
                        {"style": primary_style, "id": item.id},
                    )
                    classified += 1
            except Exception as e:
                logger.error(f"[analyze-styles] Item {item.id}: {e}")
                continue

    # 2. Compute dominant style per user and save to user_profiles
    style_agg = await db.execute(text("""
        SELECT user_id, style, COUNT(*) as cnt
        FROM wardrobe_user_items
        WHERE style IS NOT NULL AND style != '' AND style != 'Casual'
        GROUP BY user_id, style
        ORDER BY user_id, cnt DESC
    """))
    style_rows = style_agg.all()

    # Group by user, pick top style
    user_styles: dict[str, list] = {}
    for row in style_rows:
        uid = str(row.user_id)
        if uid not in user_styles:
            user_styles[uid] = []
        user_styles[uid].append({"style": row.style, "count": row.cnt})

    updated_users = 0
    for uid, styles in user_styles.items():
        # Top style = first (already sorted by count DESC)
        dominant = styles[0]["style"]
        top3 = [s["style"] for s in styles[:3]]
        await db.execute(
            text("""
                UPDATE user_profiles
                SET dominant_style = :style, style_tags = :tags
                WHERE user_id = :uid
            """),
            {"style": dominant, "tags": ",".join(top3), "uid": uid},
        )
        updated_users += 1

    await db.commit()
    logger.info(f"[analyze-styles] Classified {classified} items, updated {updated_users} user profiles")
    return {"items_classified": classified, "users_updated": updated_users}


# ---------------------------------------------------------------------------
# Gender classification for catalog items (name-based + CLIP zero-shot)
# ---------------------------------------------------------------------------

# Name patterns for rule-based gender detection
_FEMALE_NAME_PATTERNS = [
    "женск", "для женщин", "для девочек", "для девушек",
    "юбка", "платье", "блузка", "бюстгальтер", "колготки",
    "леггинсы для девочек", "велосипедки для девочек",
    "women", "woman", "girl",
]
_MALE_NAME_PATTERNS = [
    "мужск", "для мужчин", "для мальчиков",
    "men's", "man's", "boy",
    "джоггеры для мальчиков",
]


@router.post("/classify-gender")
async def classify_gender(request: Request, db: AsyncSession = Depends(get_db)):
    """Classify gender for catalog items that have NULL/empty gender.
    Uses name-based rules first, then CLIP zero-shot for remaining items."""
    _verify_cron_auth(request)

    # 1. Name-based classification (fast, no API calls)
    result = await db.execute(text("""
        SELECT id, item_name FROM wardrobe_items
        WHERE (gender IS NULL OR gender = '') AND item_name IS NOT NULL
    """))
    items = result.all()
    logger.info(f"[classify-gender] {len(items)} items without gender")

    name_classified = 0
    kids_flagged = 0
    clip_candidates = []

    for item in items:
        # Kids are not our audience — flag + hide, skip gender entirely.
        if is_kids_name(item.item_name):
            await db.execute(
                text("UPDATE wardrobe_items SET is_kids = true, is_hidden = true WHERE id = :id"),
                {"id": item.id},
            )
            kids_flagged += 1
            continue

        name_lower = item.item_name.lower()
        detected = None

        for pattern in _FEMALE_NAME_PATTERNS:
            if pattern in name_lower:
                detected = "female"
                break
        if not detected:
            for pattern in _MALE_NAME_PATTERNS:
                if pattern in name_lower:
                    detected = "male"
                    break

        if detected:
            await db.execute(
                text("UPDATE wardrobe_items SET gender = :g WHERE id = :id"),
                {"g": detected, "id": item.id},
            )
            name_classified += 1
        else:
            clip_candidates.append(item)

    # 2. CLIP zero-shot classification for remaining items (batch, up to 300)
    clip_classified = 0
    clip_candidates = clip_candidates[:300]  # cap to avoid timeout

    if clip_candidates:
        async with httpx.AsyncClient(timeout=30.0) as client:
            for item in clip_candidates:
                try:
                    # Get image URL
                    img_result = await db.execute(
                        text("SELECT image_url FROM wardrobe_items WHERE id = :id"),
                        {"id": item.id},
                    )
                    img_row = img_result.first()
                    if not img_row or not img_row[0]:
                        continue

                    # Download image
                    img_resp = await client.get(img_row[0], timeout=10.0)
                    if img_resp.status_code != 200:
                        continue

                    # CLIP classify with gender labels
                    clip_resp = await client.post(
                        f"{AI_SERVICE_URL}/clip/classify",
                        files={"image": ("img.jpg", img_resp.content, "image/jpeg")},
                        data={"labels": "мужская одежда,женская одежда,унисекс одежда,детская одежда"},
                        timeout=15.0,
                    )
                    if clip_resp.status_code != 200:
                        continue

                    result_data = clip_resp.json()
                    # The classify endpoint returns sorted tags
                    tags = result_data.get("style_tags", []) or result_data.get("tags", [])
                    if not tags:
                        continue

                    top_tag = tags[0].lower()
                    if "детск" in top_tag:
                        # Kids — remove from feeds rather than mislabel as unisex.
                        await db.execute(
                            text("UPDATE wardrobe_items SET is_kids = true, is_hidden = true WHERE id = :id"),
                            {"id": item.id},
                        )
                        kids_flagged += 1
                        continue
                    if "мужск" in top_tag:
                        gender_val = "male"
                    elif "женск" in top_tag:
                        gender_val = "female"
                    else:
                        gender_val = "unisex"

                    await db.execute(
                        text("UPDATE wardrobe_items SET gender = :g WHERE id = :id"),
                        {"g": gender_val, "id": item.id},
                    )
                    clip_classified += 1
                except Exception as e:
                    logger.error(f"[classify-gender] Item {item.id}: {e}")
                    continue

    await db.commit()
    logger.info(f"[classify-gender] name-based: {name_classified}, CLIP: {clip_classified}, remaining: {len(clip_candidates) - clip_classified}")
    return {
        "total_without_gender": len(items),
        "name_classified": name_classified,
        "clip_classified": clip_classified,
        "remaining": len(items) - name_classified - clip_classified,
    }


# ---------------------------------------------------------------------------
# Fill temp_min/temp_max for catalog items based on clothing_type
# ---------------------------------------------------------------------------

# TEMP_RANGES moved to app/services/weather_rules.py (shared with recommendations.py).


@router.post("/fill-temp-ranges")
async def fill_temp_ranges(request: Request, db: AsyncSession = Depends(get_db)):
    """Fill temp_min/temp_max for catalog items that don't have them."""
    _verify_cron_auth(request)

    updated = 0
    for clothing_type, (tmin, tmax) in TEMP_RANGES.items():
        for table in ("wardrobe_items", "wardrobe_user_items"):
            result = await db.execute(
                text(f"""
                    UPDATE {table} SET temp_min = :tmin, temp_max = :tmax
                    WHERE clothing_type = :ct AND (temp_min IS NULL OR temp_max IS NULL)
                """),
                {"ct": clothing_type, "tmin": tmin, "tmax": tmax},
            )
            updated += result.rowcount

    await db.commit()
    logger.info(f"[fill-temp-ranges] Updated {updated} items")
    return {"updated": updated}
