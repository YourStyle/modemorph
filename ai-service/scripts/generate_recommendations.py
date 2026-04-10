"""Generate CLIP+Gemini recommendations for all users.

Creates multiple themed sections with mix of user wardrobe + partner items.
Accounts for weather and gender.
"""
import asyncio
import os
import sys
import json
import logging
import datetime
from collections import defaultdict

import asyncpg
import httpx

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ["DATABASE_URL"]
CLIP_URL = "http://127.0.0.1:8000"
OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY", "")

TYPE_GROUPS = {
    "top": ["t-shirt", "shirt", "blouse", "lonsleeve", "tank-top", "pullover", "cardigan", "hoodie", "sweatshirt", "turtleneck"],
    "bottom": ["jeans", "pants", "sporty-pants", "skirt"],
    "outer": ["coat", "puffer-jacket", "parka", "sheepskin-coat", "vest"],
    "dress": ["dress"],
    "suit": ["suit-jacket", "classic"],
}

# Section themes with temperature ranges and outfit rules
SECTION_TEMPLATES = [
    {
        "title": "На каждый день",
        "emoji": "",
        "rules": "casual everyday outfits",
        "min_outfits": 4,
        "max_outfits": 6,
    },
    {
        "title": "Для прогулки",
        "emoji": "",
        "rules": "comfortable walking outfits, consider weather",
        "min_outfits": 3,
        "max_outfits": 5,
    },
    {
        "title": "На работу или учёбу",
        "emoji": "",
        "rules": "smart casual or business casual",
        "min_outfits": 3,
        "max_outfits": 5,
    },
    {
        "title": "На свидание",
        "emoji": "",
        "rules": "stylish date night outfits",
        "min_outfits": 2,
        "max_outfits": 4,
    },
    {
        "title": "Спортивный стиль",
        "emoji": "",
        "rules": "sporty comfortable outfits",
        "min_outfits": 2,
        "max_outfits": 3,
    },
]


def get_group(clothing_type):
    for group, types in TYPE_GROUPS.items():
        if clothing_type in types:
            return group
    return "other"


async def gemini_name_and_organize(user_items, partner_items, weather, gender, sections_count=4):
    """Use Gemini to create themed sections with outfit names from available items."""
    if not OPENROUTER_KEY:
        return None

    user_desc = []
    for i in user_items[:30]:
        name = i.get("item_name") or i.get("name", "?")
        ct = i.get("clothing_type", "")
        color = i.get("color", "")
        user_desc.append(f"[USER id={i['id']}] {name} ({ct}, {color})")

    partner_desc = []
    for i in partner_items[:30]:
        name = i.get("name") or i.get("item_name", "?")
        ct = i.get("clothing_type", "")
        color = i.get("color", "")
        brand = i.get("brand", "")
        partner_desc.append(f"[PARTNER id={i['id']} brand={brand}] {name} ({ct}, {color})")

    all_items = "\n".join(user_desc + partner_desc)

    prompt = f"""Ты - стилист. Составь {sections_count} тематических раздела с образами из доступных вещей.

Погода: {weather.get('temperature', 20)}°C, {weather.get('description', 'ясно')}
Пол: {gender or 'не указан'}

Доступные вещи:
{all_items}

ПРАВИЛА:
1. Каждый раздел имеет тему (например "На каждый день", "На работу", "На свидание", "На прогулку")
2. В каждом разделе 4-6 образов
3. Каждый образ состоит из 2-4 вещей, которые хорошо сочетаются
4. ОБЯЗАТЕЛЬНО миксуй вещи пользователя [USER] и партнёрские [PARTNER] в одном образе
5. Учитывай погоду при выборе вещей
6. Придумай стильное короткое название для каждого образа (3-5 слов)
7. Учитывай пол при подборе

JSON формат:
[
  {{
    "title": "Название раздела",
    "suggestions": [
      {{
        "title": "Название образа",
        "item_ids": [id1, id2, id3]
      }}
    ]
  }}
]

Возвращай ТОЛЬКО JSON. Без markdown."""

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {OPENROUTER_KEY}",
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
            return json.loads(cleaned)
    except Exception as e:
        logger.warning(f"Gemini failed: {e}")
        return None


async def main():
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=5)
    today = datetime.date.today()

    async with pool.acquire() as conn:
        users = await conn.fetch(
            "SELECT user_id, count(*) as cnt FROM wardrobe_user_items "
            "WHERE embedding IS NOT NULL GROUP BY user_id HAVING count(*) >= 2"
        )

    logger.info(f"Found {len(users)} users")
    success = 0

    async with httpx.AsyncClient(timeout=30.0) as http:
        for user_row in users:
            user_id = str(user_row["user_id"])
            item_count = user_row["cnt"]

            try:
                # 1. Get user wardrobe items
                async with pool.acquire() as conn:
                    user_items_rows = await conn.fetch(
                        "SELECT id, item_name, image_url, clothing_type, color, style, "
                        "material, user_id FROM wardrobe_user_items "
                        "WHERE user_id = $1 AND image_url IS NOT NULL",
                        user_row["user_id"],
                    )
                    weather_row = await conn.fetchrow(
                        "SELECT temperature, description, city_name FROM weather_cache "
                        "WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1",
                        user_row["user_id"],
                    )
                    profile = await conn.fetchrow(
                        "SELECT gender FROM user_profiles WHERE user_id = $1",
                        user_row["user_id"],
                    )

                weather = {
                    "temperature": weather_row["temperature"] if weather_row else 20,
                    "description": weather_row["description"] if weather_row else "ясно",
                    "location": weather_row["city_name"] if weather_row else "Москва",
                }
                gender = profile["gender"] if profile else None
                temp = weather["temperature"] or 20

                user_items = [dict(r) for r in user_items_rows]

                # 2. Get CLIP recommendations from partner catalog
                resp = await http.post(
                    f"{CLIP_URL}/clip/recommend",
                    json={"user_id": user_id, "k": 50},
                )
                clip_results = []
                if resp.status_code == 200:
                    clip_results = resp.json().get("results", [])

                # Enrich partner items from DB
                if clip_results:
                    partner_ids = [r["id"] for r in clip_results]
                    async with pool.acquire() as conn:
                        partner_rows = await conn.fetch(
                            "SELECT id, item_name, image_url, clothing_type, color, url, "
                            "notes, gender, temp_min, temp_max "
                            "FROM wardrobe_items WHERE id = ANY($1)",
                            partner_ids,
                        )

                    partner_map = {r["id"]: dict(r) for r in partner_rows}
                    partner_items = []
                    for r in clip_results:
                        db = partner_map.get(r["id"])
                        if not db:
                            continue
                        # Weather filter
                        if db.get("temp_min") is not None and temp < db["temp_min"]:
                            continue
                        if db.get("temp_max") is not None and temp > db["temp_max"]:
                            continue
                        # Gender filter
                        if gender and db.get("gender") and db["gender"] != gender:
                            continue
                        brand = (db.get("notes") or "").split(":")[0] or None
                        partner_items.append({
                            "id": db["id"],
                            "name": db["item_name"],
                            "image_url": db["image_url"],
                            "clothing_type": db.get("clothing_type", ""),
                            "color": db.get("color", ""),
                            "url": db.get("url"),
                            "brand": brand,
                            "score": r["score"],
                        })
                else:
                    partner_items = []

                if not user_items and not partner_items:
                    continue

                # 3. Ask Gemini to organize into themed sections
                all_items_map = {}
                for i in user_items:
                    all_items_map[i["id"]] = {
                        "id": i["id"],
                        "name": i["item_name"],
                        "image_url": i["image_url"],
                        "color": i.get("color", ""),
                        "clothing_type": i.get("clothing_type", ""),
                        "user_id": str(i.get("user_id", "")),
                    }
                for i in partner_items:
                    all_items_map[i["id"]] = {
                        "id": i["id"],
                        "name": i["name"],
                        "image_url": i["image_url"],
                        "color": i.get("color", ""),
                        "clothing_type": i.get("clothing_type", ""),
                        "url": i.get("url"),
                        "brand": i.get("brand"),
                    }

                gemini_sections = await gemini_name_and_organize(
                    user_items, partner_items, weather, gender,
                    sections_count=min(4, max(2, len(user_items) // 3 + 1)),
                )

                sections = []
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
                                    "id": f"clip_{user_id[:8]}_{len(suggestions)}",
                                    "title": sug.get("title", "Образ"),
                                    "items": outfit_items,
                                    "suggested_items_count": len(outfit_items),
                                })
                        if suggestions:
                            sections.append({
                                "title": gs.get("title", "Рекомендации"),
                                "source": "clip",
                                "source_label": "Подобрано для вас",
                                "suggestions": suggestions,
                            })

                if not sections:
                    continue

                # 4. Save to DB
                sections_json = json.dumps(sections, ensure_ascii=False)
                async with pool.acquire() as conn:
                    existing = await conn.fetchval(
                        "SELECT 1 FROM main_recommendations WHERE user_id = $1 AND run_date = $2",
                        user_row["user_id"], today,
                    )
                    if existing:
                        await conn.execute(
                            "UPDATE main_recommendations SET look_sections = $1::jsonb WHERE user_id = $2 AND run_date = $3",
                            sections_json, user_row["user_id"], today,
                        )
                    else:
                        await conn.execute(
                            "INSERT INTO main_recommendations (user_id, run_date, look_sections) VALUES ($1, $2, $3::jsonb)",
                            user_row["user_id"], today, sections_json,
                        )

                total_outfits = sum(len(s["suggestions"]) for s in sections)
                logger.info(f"  User {user_id[:8]}... sections={len(sections)}, outfits={total_outfits}")
                success += 1

            except Exception as e:
                logger.error(f"  Error for {user_id[:8]}: {e}")

    await pool.close()
    logger.info(f"Done! {success}/{len(users)} users updated")


asyncio.run(main())
