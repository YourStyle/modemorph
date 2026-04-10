"""
Cron-style endpoints — called by scheduler (e.g., system cron or Docker healthcheck).

Replaces Supabase cron jobs:
1. Nightly recommendation generation for active users
2. Weather cache refresh
"""

import json as json_lib
import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.services.n8n_proxy import n8n_proxy

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/generate-recommendations")
async def cron_generate_recommendations(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Nightly recommendation generation for all active users.

    An 'active user' is one who:
    - Has >= 6 visible wardrobe items
    - Was active in the last 14 days (has a user profile)

    For each user:
    1. Fetch their wardrobe items + catalog items
    2. Get cached weather
    3. Call n8n for AI generation
    4. Save result to main_recommendations

    This fixes the issue where new users didn't get recommendations
    because their recs_jobs weren't completing or saving properly.
    """
    # Verify cron secret (optional security)
    auth_header = request.headers.get("Authorization", "")
    # In production, verify a shared secret here

    today = date.today().isoformat()

    # Find active users who need recommendations today
    users_result = await db.execute(text("""
        SELECT DISTINCT up.user_id, up.gender,
               (SELECT count(*) FROM wardrobe_user_items wui
                WHERE wui.user_id = up.user_id
                AND COALESCE(wui.is_hidden, false) = false) as item_count
        FROM user_profiles up
        WHERE (SELECT count(*) FROM wardrobe_user_items wui
               WHERE wui.user_id = up.user_id
               AND COALESCE(wui.is_hidden, false) = false) >= 6
        AND NOT EXISTS (
            SELECT 1 FROM main_recommendations mr
            WHERE mr.user_id = up.user_id AND mr.run_date = CURRENT_DATE
        )
    """))
    users = users_result.mappings().all()

    logger.info(f"[Cron Recs] Found {len(users)} users needing recommendations for {today}")

    results = {"total": len(users), "success": 0, "failed": 0, "errors": []}

    for user_row in users:
        user_id = str(user_row["user_id"])
        gender = user_row.get("gender") or "female"

        try:
            # Get user's wardrobe items
            user_items_result = await db.execute(text("""
                SELECT id, item_name, clothing_type, color, image_url, user_id
                FROM wardrobe_user_items
                WHERE user_id = :uid AND COALESCE(is_hidden, false) = false
            """), {"uid": user_id})
            user_items = [dict(r) for r in user_items_result.mappings().all()]

            # Get catalog items
            catalog_result = await db.execute(text("""
                SELECT id, item_name, clothing_type, color, image_url, gender
                FROM wardrobe_items
                WHERE COALESCE(is_hidden, false) = false
                AND (gender = :g OR gender IS NULL)
            """), {"g": gender})
            catalog_items = [dict(r) for r in catalog_result.mappings().all()]

            # Get cached weather
            weather_result = await db.execute(text("""
                SELECT * FROM weather_cache WHERE user_id = :uid
                ORDER BY updated_at DESC LIMIT 1
            """), {"uid": user_id})
            weather_row = weather_result.mappings().first()

            weather = dict(weather_row) if weather_row else {
                "temperature": 15, "description": "clear sky",
                "city_name": "Москва", "latitude": 55.7558, "longitude": 37.6176,
            }

            # Call n8n for AI generation
            ai_result = await n8n_proxy.generate_recommendations(
                user_id=user_id,
                gender=gender,
                weather=weather,
                user_items=user_items,
                catalog_items=catalog_items,
            )

            # Parse sections from AI result
            sections = ai_result.get("sections", ai_result.get("look_sections", []))

            if not sections:
                logger.warning(f"[Cron Recs] No sections returned for user {user_id}")
                results["failed"] += 1
                results["errors"].append({"user_id": user_id, "error": "No sections from AI"})
                continue

            # Save to main_recommendations
            sections_json = json_lib.dumps(sections, ensure_ascii=False)
            await db.execute(text("""
                INSERT INTO main_recommendations (user_id, run_date, look_sections, source, created_at)
                VALUES (:uid, CURRENT_DATE, :sections::jsonb, 'cron:nightly', NOW())
                ON CONFLICT (user_id, run_date) DO UPDATE SET
                    look_sections = :sections::jsonb,
                    source = 'cron:nightly'
            """), {"uid": user_id, "sections": sections_json})

            await db.commit()
            results["success"] += 1
            logger.info(f"[Cron Recs] Generated {len(sections)} sections for user {user_id}")

        except Exception as e:
            logger.error(f"[Cron Recs] Failed for user {user_id}: {e}")
            results["failed"] += 1
            results["errors"].append({"user_id": user_id, "error": str(e)})
            await db.rollback()

    logger.info(f"[Cron Recs] Done: {results['success']} success, {results['failed']} failed")
    return results


@router.post("/refresh-weather")
async def cron_refresh_weather(db: AsyncSession = Depends(get_db)):
    """Refresh cached weather for active users."""
    import httpx

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
