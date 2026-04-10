"""
Cron-style endpoints — called by scheduler (e.g., system cron).

1. Nightly recommendation generation (CLIP + OpenRouter Gemini)
2. Weather cache refresh
"""

import json as json_lib
import logging
import random
from datetime import date

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db

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

async def _clip_recommend(user_id: str, k: int = 50) -> list:
    """Call CLIP service /clip/recommend for personalized partner items."""
    ai_url = settings.AI_SERVICE_URL
    if not ai_url:
        return []
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{ai_url}/clip/recommend",
                json={"user_id": user_id, "k": k},
            )
            if resp.status_code == 200:
                return resp.json().get("results", [])
    except Exception as e:
        logger.warning(f"[Cron] CLIP unavailable: {e}")
    return []


async def _gemini_organize(
    user_items: list, partner_items: list, weather: dict, gender: str, sections_count: int = 3,
) -> list | None:
    """Use OpenRouter Gemini to organize items into themed outfit sections."""
    api_key = settings.OPENROUTER_API_KEY
    if not api_key:
        return None

    user_desc = []
    for i in user_items[:30]:
        name = i.get("item_name", "?")
        ct = i.get("clothing_type", "")
        color = i.get("color", "")
        user_desc.append(f"[USER id={i['id']}] {name} ({ct}, {color})")

    partner_desc = []
    for i in partner_items[:30]:
        name = i.get("item_name") or i.get("name", "?")
        ct = i.get("clothing_type", "")
        color = i.get("color", "")
        brand = i.get("brand", "")
        partner_desc.append(f"[PARTNER id={i['id']} brand={brand}] {name} ({ct}, {color})")

    all_items = "\n".join(user_desc + partner_desc)
    temp = weather.get("temperature", 20)
    desc = weather.get("description", "ясно")

    prompt = f"""Ты - стилист. Составь {sections_count} тематических раздела с образами.

Погода: {temp}°C, {desc}
Пол: {gender or 'не указан'}

Доступные вещи:
{all_items}

ПРАВИЛА:
1. Разделы по событиям: "На каждый день", "На работу/учёбу", "На свидание", "На прогулку" и т.п.
2. В каждом разделе 4-6 образов
3. Каждый образ из 2-4 вещей: МАКСИМУМ 1 верх, 1 низ, 1 верхняя одежда. НЕ ставь 2 штанов или 2 куртки в один образ!
4. МИКСУЙ вещи пользователя [USER] и партнёрские [PARTNER] в одном образе. Хотя бы 1 вещь пользователя в каждом образе.
5. ОБЯЗАТЕЛЬНО учитывай погоду ({temp}°C, {desc}): если холодно — добавляй куртку/пальто, если жарко — лёгкие вещи без верхней одежды.
6. Придумай стильное короткое название для каждого образа (3-5 слов)
7. Учитывай пол ({gender or 'не указан'}): не предлагай платья мужчинам

JSON: [{{"title":"Название раздела","suggestions":[{{"title":"Название образа","item_ids":[id1,id2,id3]}}]}}]
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

    # Find active users
    users_result = await db.execute(text("""
        SELECT DISTINCT up.user_id, up.gender,
               (SELECT count(*) FROM wardrobe_user_items wui
                WHERE wui.user_id = up.user_id
                AND COALESCE(wui.is_hidden, false) = false) as item_count
        FROM user_profiles up
        WHERE (SELECT count(*) FROM wardrobe_user_items wui
               WHERE wui.user_id = up.user_id
               AND COALESCE(wui.is_hidden, false) = false) >= 3
    """))
    users = users_result.mappings().all()

    logger.info(f"[Cron Recs] Found {len(users)} active users")

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

    for user_row in users:
        user_id = str(user_row["user_id"])
        gender = user_row.get("gender") or None
        use_clip = random.random() < CLIP_PROBABILITY

        try:
            # Get user wardrobe items
            user_items_result = await db.execute(text("""
                SELECT id, item_name, clothing_type, color, style, material,
                       image_url, user_id::text as user_id
                FROM wardrobe_user_items
                WHERE user_id = :uid AND COALESCE(is_hidden, false) = false
                AND image_url IS NOT NULL
            """), {"uid": user_id})
            user_items = [dict(r) for r in user_items_result.mappings().all()]

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

            # Get partner items via CLIP (if chosen)
            partner_items = []
            if use_clip:
                clip_results = await _clip_recommend(user_id, k=50)
                if clip_results:
                    partner_ids = [r["id"] for r in clip_results]
                    partner_result = await db.execute(text("""
                        SELECT id, item_name, image_url, clothing_type, color, url,
                               notes, gender, temp_min, temp_max
                        FROM wardrobe_items WHERE id = ANY(:ids)
                    """), {"ids": partner_ids})
                    for r in partner_result.mappings().all():
                        row = dict(r)
                        # Weather filter
                        if row.get("temp_min") is not None and temp < row["temp_min"]:
                            continue
                        if row.get("temp_max") is not None and temp > row["temp_max"]:
                            continue
                        # Gender filter
                        if gender and row.get("gender") and row["gender"] != gender:
                            continue
                        brand = (row.get("notes") or "").split(":")[0] or None
                        row["brand"] = brand
                        partner_items.append(row)

            if not user_items and not partner_items:
                continue

            # Build item lookup
            all_items_map = {}
            for i in user_items:
                all_items_map[i["id"]] = {
                    "id": i["id"],
                    "name": i["item_name"],
                    "image_url": i["image_url"],
                    "color": i.get("color", ""),
                    "clothing_type": i.get("clothing_type", ""),
                    "user_id": i.get("user_id", ""),
                }
            for i in partner_items:
                all_items_map[i["id"]] = {
                    "id": i["id"],
                    "name": i["item_name"],
                    "image_url": i["image_url"],
                    "color": i.get("color", ""),
                    "clothing_type": i.get("clothing_type", ""),
                    "url": i.get("url"),
                    "brand": i.get("brand"),
                }

            # Ask Gemini to organize
            n_sections = min(4, max(2, len(user_items) // 3 + 1))
            gemini_sections = await _gemini_organize(
                user_items, partner_items, weather, gender, n_sections,
            )

            sections = []
            source = "clip" if use_clip and partner_items else "ai"
            source_label = "Подобрано для вас" if source == "clip" else "Рекомендация стилиста"

            if gemini_sections and isinstance(gemini_sections, list):
                for gs in gemini_sections:
                    suggestions = []
                    for sug in gs.get("suggestions", []):
                        outfit_items = []
                        for iid in sug.get("item_ids", []):
                            item_data = all_items_map.get(iid)
                            if item_data:
                                outfit_items.append(item_data)
                        if outfit_items:
                            suggestions.append({
                                "id": f"{source}_{user_id[:8]}_{len(suggestions)}",
                                "title": sug.get("title", "Образ"),
                                "items": outfit_items,
                                "suggested_items_count": len(outfit_items),
                            })
                    if suggestions:
                        sections.append({
                            "title": gs.get("title", "Рекомендации"),
                            "source": source,
                            "source_label": source_label,
                            "suggestions": suggestions,
                        })

            if not sections:
                results["failed"] += 1
                continue

            # Save
            sections_json = json_lib.dumps(sections, ensure_ascii=False)
            await db.execute(text("""
                INSERT INTO main_recommendations (user_id, run_date, look_sections)
                VALUES (:uid, :d, CAST(:sections AS jsonb))
                ON CONFLICT (user_id, run_date) DO UPDATE SET
                    look_sections = CAST(:sections AS jsonb)
            """), {"uid": user_id, "d": today, "sections": sections_json})
            await db.commit()

            total_outfits = sum(len(s["suggestions"]) for s in sections)
            logger.info(f"[Cron Recs] User {user_id[:8]}... [{source}] {len(sections)} sections, {total_outfits} outfits")

            results["success"] += 1
            if source == "clip":
                results["clip"] += 1
            else:
                results["gemini_only"] += 1

        except Exception as e:
            logger.error(f"[Cron Recs] Failed for {user_id[:8]}: {e}")
            results["failed"] += 1
            await db.rollback()

    logger.info(f"[Cron Recs] Done: {results}")
    return results


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
                    humidity = :hum, wind_speed = :wind, city_name = :city, updated_at = NOW()
                WHERE user_id = :uid
            """), {
                "uid": row["user_id"],
                "temp": round(data.get("main", {}).get("temp", 0)),
                "desc": data.get("weather", [{}])[0].get("description", ""),
                "cond": data.get("weather", [{}])[0].get("main", ""),
                "hum": data.get("main", {}).get("humidity", 0),
                "wind": round(data.get("wind", {}).get("speed", 0)),
                "city": data.get("name", ""),
            })
            updated += 1
        except Exception as e:
            logger.error(f"Weather refresh failed for {row['user_id']}: {e}")

    await db.commit()
    return {"updated": updated, "total": len(users)}
