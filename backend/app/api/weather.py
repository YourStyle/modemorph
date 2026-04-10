"""Weather endpoints."""

import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user

router = APIRouter()


@router.get("/weather")
async def get_weather(
    lat: float = Query(...),
    lon: float = Query(...),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get weather from OpenWeatherMap and cache it."""
    api_key = settings.OPENWEATHER_API_KEY
    if not api_key:
        return {"weather": None, "error": "Weather API not configured"}

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={"lat": lat, "lon": lon, "appid": api_key, "units": "metric", "lang": "ru"},
        )
        data = resp.json()

    weather = {
        "temperature": round(data.get("main", {}).get("temp", 0)),
        "description": data.get("weather", [{}])[0].get("description", ""),
        "condition": data.get("weather", [{}])[0].get("main", ""),
        "humidity": data.get("main", {}).get("humidity", 0),
        "wind_speed": round(data.get("wind", {}).get("speed", 0)),
        "city_name": data.get("name", ""),
        "latitude": lat,
        "longitude": lon,
    }

    # Cache in DB
    import json
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
            "temp": weather["temperature"], "desc": weather["description"],
            "cond": weather["condition"], "hum": weather["humidity"],
            "wind": weather["wind_speed"], "city": weather["city_name"],
        },
    )
    await db.commit()

    return {"weather": weather}


@router.get("/weather/cached")
async def get_cached_weather(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get cached weather for user."""
    result = await db.execute(
        text("SELECT * FROM weather_cache WHERE user_id = :uid ORDER BY updated_at DESC LIMIT 1"),
        {"uid": user["id"]},
    )
    row = result.mappings().first()
    if not row:
        # Return Moscow defaults
        return {
            "weather": {
                "temperature": 15, "description": "default weather for Moscow",
                "condition": "Clear", "humidity": 50, "wind_speed": 3,
                "city_name": "Москва", "latitude": 55.7558, "longitude": 37.6176,
                "is_default": True,
            }
        }
    return {"weather": dict(row)}
