"""Weather endpoints — compatible with frontend top-navigation + ai-assistant."""

import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user

router = APIRouter()


def _weather_icon(condition: str) -> str:
    c = condition.lower()
    if "clear" in c or "sunny" in c:
        return "☀️"
    if "cloud" in c:
        return "☁️"
    if "rain" in c or "drizzle" in c:
        return "🌧️"
    if "snow" in c:
        return "❄️"
    if "thunder" in c or "storm" in c:
        return "⛈️"
    if "fog" in c or "mist" in c:
        return "🌫️"
    if "wind" in c:
        return "💨"
    return "🌤️"


FALLBACK = {
    "temperature": 20,
    "condition": "Clear",
    "description": "ясно",
    "humidity": 50,
    "wind_speed": 5,
    "icon": "☀️",
    "location": "Москва",
}


@router.get("/weather")
async def get_weather(
    lat: float = Query(...),
    lon: float = Query(...),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get weather from OpenWeatherMap, cache, return flat response."""
    api_key = settings.OPENWEATHER_API_KEY
    if not api_key:
        return FALLBACK

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.openweathermap.org/data/2.5/weather",
                params={"lat": lat, "lon": lon, "appid": api_key, "units": "metric", "lang": "ru"},
            )
            data = resp.json()

        condition = data.get("weather", [{}])[0].get("main", "Clear")
        result = {
            "temperature": round(data.get("main", {}).get("temp", 0)),
            "condition": condition,
            "description": data.get("weather", [{}])[0].get("description", ""),
            "humidity": data.get("main", {}).get("humidity", 0),
            "wind_speed": round(data.get("wind", {}).get("speed", 0)),
            "icon": _weather_icon(condition),
            "location": data.get("name", "Москва"),
        }

        # Cache in DB
        await db.execute(
            text("""
                INSERT INTO weather_cache (user_id, latitude, longitude, temperature, description,
                    condition, humidity, wind_speed, city_name, updated_at)
                VALUES (:uid, :lat, :lon, :temp, :desc, :cond, :hum, :wind, :city, NOW())
                ON CONFLICT (user_id) DO UPDATE SET
                    latitude = :lat, longitude = :lon, temperature = :temp,
                    description = :desc, condition = :cond, humidity = :hum,
                    wind_speed = :wind, city_name = :city, updated_at = NOW()
            """),
            {
                "uid": user["id"], "lat": lat, "lon": lon,
                "temp": result["temperature"], "desc": result["description"],
                "cond": result["condition"], "hum": result["humidity"],
                "wind": result["wind_speed"], "city": result["location"],
            },
        )
        await db.commit()
        return result
    except Exception as e:
        print(f"[weather] Error: {e}")
        return FALLBACK


@router.get("/weather/cached")
async def get_cached_weather(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get cached weather — flat response matching frontend expectations."""
    result = await db.execute(
        text("""
            SELECT temperature, condition, description, humidity, wind_speed, city_name
            FROM weather_cache WHERE user_id = :uid
            AND updated_at > NOW() - INTERVAL '1 hour'
            ORDER BY updated_at DESC LIMIT 1
        """),
        {"uid": user["id"]},
    )
    row = result.mappings().first()
    if not row:
        return FALLBACK

    condition = row["condition"] or "Clear"
    return {
        "temperature": row["temperature"],
        "condition": condition,
        "description": row["description"] or "ясно",
        "humidity": row["humidity"] or 50,
        "wind_speed": row["wind_speed"] or 5,
        "icon": _weather_icon(condition),
        "location": row["city_name"] or "Москва",
    }
