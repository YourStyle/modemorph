"""
Cron-style endpoints — called by scheduler (e.g., system cron).

1. Nightly recommendation generation (CLIP + OpenRouter Gemini)
2. Weather cache refresh
3. Feed sync — refresh Admitad feeds, remove stale items, add new
"""

import json as json_lib
import logging
import random
import xml.etree.ElementTree as ET
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
    user_items: list, partner_items: list, weather: dict, gender: str,
    dominant_style: str = "", sections_count: int = 3,
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
        style = i.get("style", "")
        user_desc.append(f"[USER id={i['id']}] {name} ({ct}, {color}, стиль: {style})")

    partner_desc = []
    for i in partner_items[:40]:
        name = i.get("item_name") or i.get("name", "?")
        ct = i.get("clothing_type", "")
        color = i.get("color", "")
        brand = i.get("brand", "")
        partner_desc.append(f"[PARTNER id={i['id']} brand={brand}] {name} ({ct}, {color})")

    all_items = "\n".join(user_desc + partner_desc)
    temp = weather.get("temperature", 20)
    desc = weather.get("description", "ясно")

    style_instruction = ""
    if dominant_style:
        style_instruction = f"""
СТИЛЬ ПОЛЬЗОВАТЕЛЯ: {dominant_style}
- Большинство образов (70-80%) должны соответствовать стилю "{dominant_style}"
- 1-2 образа могут быть в ДРУГОМ стиле — для разнообразия и экспериментов (укажи это в названии, например "Попробуй: уличный стиль")
"""

    has_partners = bool(partner_items)

    prompt = f"""Ты - стилист. Составь тематические разделы с образами ТРЁХ типов.

Погода: {temp}°C, {desc}
Пол: {gender or 'не указан'}
{style_instruction}
Доступные вещи:
{all_items}

ПРАВИЛА:
1. Раздел(ы) section_type="user_only" — образы ТОЛЬКО из вещей пользователя [USER]:
   - 1-2 раздела по событиям: "На каждый день", "Выходной день" и т.п.
   - В каждом 2-3 образа
   - ТОЛЬКО вещи [USER], БЕЗ [PARTNER]
{"2. Раздел(ы) section_type=\"mix\" — образы из МИКСА вещей пользователя и партнёрских:" if has_partners else ""}
{"   - 1-2 раздела: \"На работу\", \"На свидание\", \"На прогулку\" и т.п." if has_partners else ""}
{"   - Хотя бы 1 вещь пользователя [USER] в каждом образе" if has_partners else ""}
{"3. Раздел section_type=\"partner_only\" — \"Готовые образы от брендов\":" if has_partners else ""}
{"   - 1 раздел, 2-3 образа ЦЕЛИКОМ из [PARTNER] вещей (без USER)" if has_partners else ""}
{"   - Подбери стильные комплекты из одного бренда или миксуй бренды" if has_partners else ""}
{"4" if has_partners else "2"}. ВАЖНО! Каждый образ = 4-6 вещей:
   - Верх (рубашка/футболка/блузка/свитер)
   - Низ (брюки/джинсы/юбка) ИЛИ платье
   - Верхняя одежда — если {temp}°C < 18
   - ОБУВЬ — ВСЕГДА
   - Аксессуар — по возможности
{"5" if has_partners else "3"}. НЕ создавай образ из 2-3 вещей. Минимум: верх + низ + обувь.
{"6" if has_partners else "4"}. НЕ ставь 2 штанов или 2 куртки или 2 шорт в один образ. Каждый слот одежды — строго 1 вещь.
{"7" if has_partners else "5"}. Учитывай погоду ({temp}°C, {desc}).
{"8" if has_partners else "6"}. Стильное короткое название для каждого образа (3-5 слов).
{"9" if has_partners else "7"}. Учитывай пол: не предлагай платья мужчинам.

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
                        if row["id"] in disliked_ids:
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
                user_items, partner_items, weather, gender, dominant_style, n_sections,
            )

            SOURCE_LABELS = {
                "user_only": "Из вашего гардероба",
                "mix": "Подобрано для вас",
                "partner_only": "От партнёров",
            }

            sections = []

            if gemini_sections and isinstance(gemini_sections, list):
                for gs in gemini_sections:
                    section_type = gs.get("section_type", "user_only")
                    if section_type not in SOURCE_LABELS:
                        section_type = "mix" if partner_items else "user_only"
                    suggestions = []
                    for sug in gs.get("suggestions", []):
                        outfit_items = []
                        for iid in sug.get("item_ids", []):
                            item_data = all_items_map.get(iid)
                            if item_data:
                                outfit_items.append(item_data)
                        if outfit_items:
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
                            "source_label": SOURCE_LABELS[section_type],
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
    return results


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

        imported = 0
        skipped = 0

        for item in parsed["items"]:
            notes = f"{item['source']}:{item['source_sku']}"
            existing = await db.execute(text("SELECT id FROM wardrobe_items WHERE notes = :notes LIMIT 1"), {"notes": notes})
            if existing.first():
                skipped += 1
                continue

            await db.execute(text("""
                INSERT INTO wardrobe_items (item_name, description, image_url, url, clothing_type, color, gender, style, is_hidden, is_basic, notes, partner_id, feed_id, price)
                VALUES (:name, :desc, :img, :url, :ct, :color, :gender, 'Casual', false, false, :notes, :pid, :fid, :price)
            """), {
                "name": item["item_name"], "desc": item["description"], "img": item["image_url"],
                "url": item["url"], "ct": item["clothing_type"], "color": item["color"],
                "gender": item["gender"], "notes": notes, "pid": partner_id, "fid": feed_id,
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
# Fill temp_min/temp_max for catalog items based on clothing_type
# ---------------------------------------------------------------------------

TEMP_RANGES: dict[str, tuple[int, int]] = {
    # type: (min_temp, max_temp) in Celsius
    "t-shirt": (18, 35), "tank-top": (22, 35), "shirt": (10, 30),
    "blouse": (12, 30), "lonsleeve": (5, 22), "turtleneck": (0, 15),
    "pullover": (0, 18), "cardigan": (5, 20), "hoodie": (5, 20),
    "sweatshirt": (5, 22), "vest": (5, 20), "suit-jacket": (8, 25),
    "coat": (-10, 15), "puffer-jacket": (-20, 10), "parka": (-25, 5),
    "dress": (10, 30), "skirt": (12, 30), "pants": (-5, 30),
    "jeans": (0, 28), "sporty-pants": (5, 25), "shorts": (20, 35),
    "classic": (5, 28),
}


@router.post("/fill-temp-ranges")
async def fill_temp_ranges(request: Request, db: AsyncSession = Depends(get_db)):
    """Fill temp_min/temp_max for catalog items that don't have them."""
    _verify_cron_auth(request)

    updated = 0
    for clothing_type, (tmin, tmax) in TEMP_RANGES.items():
        result = await db.execute(
            text("""
                UPDATE wardrobe_items SET temp_min = :tmin, temp_max = :tmax
                WHERE clothing_type = :ct AND (temp_min IS NULL OR temp_max IS NULL)
            """),
            {"ct": clothing_type, "tmin": tmin, "tmax": tmax},
        )
        updated += result.rowcount

    await db.commit()
    logger.info(f"[fill-temp-ranges] Updated {updated} items")
    return {"updated": updated}
