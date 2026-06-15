#!/usr/bin/env python3
"""
Import clothing catalog from Admitad YML feed into wardrobe_items table.

Usage:
  python scripts/import_catalog.py --feed-url <URL>
  python scripts/import_catalog.py --feed-file /tmp/sela_feed.xml
  python scripts/import_catalog.py --feed-file /tmp/sela_feed.xml --encode-embeddings

The script:
  1. Parses YML feed (Yandex Market Language XML)
  2. Filters only clothing/fashion categories
  3. Maps YML categories → our clothing_type
  4. Inserts into wardrobe_items with affiliate URLs
  5. Optionally generates CLIP embeddings for each item
"""

import argparse
import asyncio
import logging
import os
import re
import sys
import xml.etree.ElementTree as ET
from typing import Optional

import asyncpg
import httpx

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://modemorph:modemorph@localhost:5433/modemorph",
)

# ---------------------------------------------------------------------------
# Category mapping: YML category names → our clothing_type
# ---------------------------------------------------------------------------

CATEGORY_MAP = {
    # Верхняя одежда
    "верхняя одежда": "coat",
    "базовые куртки": "puffer-jacket",
    "куртки": "puffer-jacket",
    "пальто и полупальто": "coat",
    "пальто": "coat",
    "тренчи и плащи": "coat",
    "бомберы": "coat",
    "ветровки": "coat",
    "дубленки и шубы": "sheepskin-coat",
    "джинсовые куртки": "coat",
    "жилеты": "vest",
    "кожа и замша": "coat",
    # Джемперы / кардиганы
    "джемперы и кардиганы": "pullover",
    "джемперы и свитеры": "pullover",
    "кардиганы": "cardigan",
    "водолазки": "turtleneck",
    "поло": "t-shirt",
    # Футболки
    "футболки и лонгсливы": "t-shirt",
    "лонгсливы": "lonsleeve",
    "культовые": "t-shirt",
    "базовые": "t-shirt",
    "принт и вышивка": "t-shirt",
    # Худи
    "худи и свитшоты": "hoodie",
    "худи": "hoodie",
    "свитшоты": "sweatshirt",
    "на молнии": "hoodie",
    # Рубашки / блузки
    "рубашки и блузки": "shirt",
    "рубашки": "shirt",
    "блузки": "blouse",
    # Брюки
    "брюки и леггинсы": "pants",
    "брюки": "pants",
    "классические": "pants",
    "широкие": "pants",
    "карго и парашюты": "sporty-pants",
    "джоггеры": "sporty-pants",
    "леггинсы": "pants",
    # Джинсы
    "джинсы": "jeans",
    "слим": "jeans",
    "прямые": "jeans",
    "мом": "jeans",
    "клеш": "jeans",
    # Платья
    "платья": "dress",
    "летние": "dress",
    "макси и миди": "dress",
    "мини": "dress",
    "вечерние": "dress",
    "трикотажные": "dress",
    # Юбки
    "юбки": "skirt",
    # Шорты
    "шорты": "pants",
    # Жакеты
    "жакеты и жилеты": "suit-jacket",
    "жакеты": "suit-jacket",
    # Комплекты
    "комплекты": "classic",
    # Спорт
    "спортивная одежда": "sporty-pants",
    # Топы
    "топы и боди": "tank-top",
    "кроп-топы": "tank-top",
    "боди": "tank-top",
    # Комбинезоны
    "комбинезоны": "dress",
}

# Categories to SKIP (not clothing we want)
SKIP_CATEGORIES = {
    "носки", "колготки", "гетры",
    "нижнее белье", "бюстгальтеры", "трусы",
    "домашняя одежда", "пижамы", "халаты", "сорочки",
    "купальники и пляжная одежда", "купальные лифы", "купальные трусы",
    "постельное белье", "полотенца", "пледы",
    "кружки", "канцелярия", "брелоки",
    "наборы",
    "аксессуары для сна",
}

# Gender detection from category hierarchy
FEMALE_CATS = {"1", "1374"}  # Женщины, Девушки
MALE_CATS = {"2", "1443"}  # Мужчины


def map_clothing_type(category_name: str, parent_name: str = "") -> Optional[str]:
    """Map YML category name to our clothing_type."""
    name_lower = category_name.lower().strip()

    # Check skip list
    if name_lower in SKIP_CATEGORIES:
        return None

    # Direct match
    if name_lower in CATEGORY_MAP:
        return CATEGORY_MAP[name_lower]

    # Try parent
    parent_lower = parent_name.lower().strip()
    if parent_lower in CATEGORY_MAP:
        return CATEGORY_MAP[parent_lower]

    # Fuzzy match
    for key, val in CATEGORY_MAP.items():
        if key in name_lower:
            return val

    return None


def extract_color_from_name(name: str) -> str:
    """Try to extract color from product name."""
    colors_ru = {
        "черн": "Черный", "бел": "Белый", "сер": "Серый", "син": "Синий",
        "голуб": "Голубой", "красн": "Красный", "розов": "Розовый",
        "зелен": "Зеленый", "бежев": "Бежевый", "коричнев": "Коричневый",
        "хаки": "Хаки", "бордов": "Бордовый", "фиолетов": "Фиолетовый",
        "оранж": "Оранжевый", "желт": "Желтый",
    }
    name_lower = name.lower()
    for key, color in colors_ru.items():
        if key in name_lower:
            return color
    return ""


def parse_feed(feed_path: str, source_override=None) -> list[dict]:
    """Parse YML feed and return list of items ready for DB insertion.

    source_override pins the `source` name written into notes (the "Source:sku"
    prefix used for dedup and the stale-item sync in cron.py). Pass it so it matches
    the ADMITAD_FEEDS key in backend/app/api/cron.py: partner-reported <shop><name>
    values are unreliable (marketing sentences, empty feeds default to "Unknown"),
    so relying on them makes `sync-feeds` silently match zero rows.
    """
    logger.info(f"Parsing feed: {feed_path}")
    tree = ET.parse(feed_path)
    root = tree.getroot()
    shop = root.find("shop")
    shop_name = source_override or shop.findtext("name", "Unknown")
    if source_override:
        logger.info(f"Source pinned to '{source_override}' (overriding <shop><name>)")

    # Build category lookup
    cat_map = {}
    cat_parents = {}
    for cat in shop.findall(".//category"):
        cid = cat.get("id")
        cat_map[cid] = cat.text or ""
        parent_id = cat.get("parentId")
        if parent_id:
            cat_parents[cid] = parent_id

    def get_category_chain(cid: str) -> list[str]:
        chain = []
        visited = set()
        while cid and cid not in visited:
            visited.add(cid)
            if cid in cat_map:
                chain.append(cat_map[cid])
            cid = cat_parents.get(cid)
        return chain

    items = []
    skipped = 0

    for offer in shop.findall(".//offer"):
        cid = offer.findtext("categoryId", "")
        chain = get_category_chain(cid)
        cat_name = cat_map.get(cid, "")
        parent_name = cat_map.get(cat_parents.get(cid, ""), "")

        # Skip non-clothing
        if any(s in c.lower() for c in chain for s in SKIP_CATEGORIES):
            skipped += 1
            continue

        clothing_type = map_clothing_type(cat_name, parent_name)
        if not clothing_type:
            # Try deeper in chain
            for c in chain:
                clothing_type = map_clothing_type(c)
                if clothing_type:
                    break
        if not clothing_type:
            skipped += 1
            continue

        name = offer.findtext("name", "")
        description = offer.findtext("description", "")
        price = offer.findtext("price", "0")
        url = offer.findtext("url", "")
        model = offer.findtext("model", "")

        # Collect all pictures — we'll pick the best flat-lay later
        pictures = [p.text for p in offer.findall("picture") if p.text]
        if not pictures:
            skipped += 1
            continue
        image_url = pictures[0]  # default to first; pick_flatlay() refines later

        # Detect gender from category chain
        gender = None
        root_cid = cid
        while cat_parents.get(root_cid):
            root_cid = cat_parents[root_cid]
        if root_cid in FEMALE_CATS:
            gender = "female"
        elif root_cid in MALE_CATS:
            gender = "male"

        color = extract_color_from_name(name)

        items.append({
            "item_name": name,
            "item_name_en": "",
            "description": description[:500] if description else "",
            "description_en": "",
            "image_url": image_url,
            "all_pictures": pictures,  # for flat-lay selection
            "url": url,  # affiliate URL
            "clothing_type": clothing_type,
            "color": color,
            "shade": "",
            "material": "",
            "style": "Casual",
            "gender": gender,
            "has_print": False,
            "has_details": False,
            "is_hidden": False,
            "is_basic": False,
            "source": shop_name,
            "source_sku": model or offer.get("id", ""),
            "price": float(price) if price else None,
        })

    logger.info(f"Parsed {len(items)} clothing items, skipped {skipped}")
    return items


async def insert_items(items: list[dict], dry_run: bool = False):
    """Insert items into wardrobe_items table."""
    if dry_run:
        logger.info(f"[DRY RUN] Would insert {len(items)} items")
        for item in items[:5]:
            logger.info(f"  {item['clothing_type']:>15}  {item['item_name'][:60]}")
        return

    dsn = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    pool = await asyncpg.create_pool(dsn, min_size=2, max_size=10)

    inserted = 0
    duplicates = 0

    async with pool.acquire() as conn:
        for item in items:
            # Check for duplicate by source_sku + source
            exists = await conn.fetchval(
                "SELECT 1 FROM wardrobe_items WHERE notes = $1 LIMIT 1",
                f"{item['source']}:{item['source_sku']}",
            )
            if exists:
                duplicates += 1
                continue

            await conn.execute(
                """INSERT INTO wardrobe_items
                   (item_name, item_name_en, description, description_en,
                    image_url, url, clothing_type, color, shade, material, style,
                    gender, has_print, has_details, is_hidden, is_basic, notes)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)""",
                item["item_name"], item["item_name_en"],
                item["description"], item["description_en"],
                item["image_url"], item["url"],
                item["clothing_type"], item["color"], item["shade"],
                item["material"], item["style"],
                item["gender"],
                item["has_print"], item["has_details"],
                item["is_hidden"], item["is_basic"],
                f"{item['source']}:{item['source_sku']}",  # store in notes for dedup
            )
            inserted += 1

    await pool.close()
    logger.info(f"Inserted {inserted} items, {duplicates} duplicates skipped")


async def pick_flatlay_photos(items: list[dict]):
    """Use CLIP to pick the best flat-lay photo (without person) for each item.

    Runs on ALL items (including single-picture offers) so model-photos get flagged
    via item['has_person']. Callers should honour the flag (e.g. auto-hide) — otherwise
    feeds like Love Republic leak ~38% model-only photos into the catalog.
    """
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from clip.encoder import CLIPEncoderService
    from clip.classifier import CLIPClassifierService, PERSON_SCORE_THRESHOLD
    from PIL import Image
    import io

    logger.info("Loading FashionCLIP for flat-lay photo selection...")
    encoder = CLIPEncoderService()
    classifier = CLIPClassifierService(encoder)

    updated = 0
    flagged = 0
    all_items = [i for i in items if i.get("all_pictures")]
    logger.info(f"Running pick-flatlay on {len(all_items)} items (including single-picture)...")

    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        for idx, item in enumerate(all_items):
            best_url = item["image_url"]
            best_person_score = float("inf")

            for pic_url in item["all_pictures"][:4]:  # check up to 4 photos
                try:
                    r = await client.get(pic_url)
                    r.raise_for_status()
                    img = Image.open(io.BytesIO(r.content)).convert("RGB")
                    img_emb = encoder.encode_image(img)
                    person_score = classifier._person_score(img_emb)
                    if person_score < best_person_score:
                        best_person_score = person_score
                        best_url = pic_url
                except Exception:
                    continue

            if best_url != item["image_url"]:
                item["image_url"] = best_url
                updated += 1

            if best_person_score != float("inf") and best_person_score > PERSON_SCORE_THRESHOLD:
                item["has_person"] = True
                item["is_hidden"] = True  # auto-hide model-photo items for admin review
                flagged += 1

            if (idx + 1) % 100 == 0:
                logger.info(f"  Processed {idx + 1}/{len(all_items)}...")

    logger.info(f"Updated {updated} items to better flat-lay; flagged {flagged} as has_person (auto-hidden)")


async def encode_embeddings(batch_size: int = 50):
    """Generate CLIP embeddings for items without them."""
    # Import here to avoid loading model when not needed
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from clip.encoder import CLIPEncoderService
    from PIL import Image
    import io

    logger.info("Loading FashionCLIP model...")
    encoder = CLIPEncoderService()
    logger.info(f"Model loaded (dim={encoder.dim})")

    dsn = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    pool = await asyncpg.create_pool(dsn, min_size=2, max_size=5)

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, image_url FROM wardrobe_items "
            "WHERE embedding IS NULL AND image_url IS NOT NULL "
            "ORDER BY id LIMIT 5000"
        )

    logger.info(f"Found {len(rows)} items without embeddings")
    encoded = 0
    failed = 0

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        for i, row in enumerate(rows):
            try:
                r = await client.get(row["image_url"])
                r.raise_for_status()
                img = Image.open(io.BytesIO(r.content)).convert("RGB")
                emb = encoder.encode_image(img)

                emb_str = "{" + ",".join(str(x) for x in emb.tolist()) + "}"
                async with pool.acquire() as conn:
                    await conn.execute(
                        "UPDATE wardrobe_items SET embedding = $1 WHERE id = $2",
                        emb_str, row["id"],
                    )
                encoded += 1

                if (i + 1) % 50 == 0:
                    logger.info(f"  Encoded {i + 1}/{len(rows)}...")
            except Exception as e:
                failed += 1
                if failed <= 5:
                    logger.warning(f"  Failed item {row['id']}: {e}")

    await pool.close()
    logger.info(f"Encoded {encoded} items, {failed} failed")


async def main():
    parser = argparse.ArgumentParser(description="Import Admitad YML feed into wardrobe_items")
    parser.add_argument("--feed-url", help="URL of the YML feed")
    parser.add_argument("--feed-file", help="Local path to YML feed XML file")
    parser.add_argument("--source", help="Source name for the notes prefix; MUST match the ADMITAD_FEEDS key in backend cron.py so stale-item sync works. Defaults to the feed's <shop><name>.")
    parser.add_argument("--dry-run", action="store_true", help="Parse only, don't insert")
    parser.add_argument("--encode-embeddings", action="store_true", help="Generate CLIP embeddings after import")
    parser.add_argument("--no-pick-flatlay", action="store_true", help="Skip flat-lay photo selection (faster, but may import model photos)")
    parser.add_argument("--limit", type=int, default=0, help="Max items to import (0 = all)")
    args = parser.parse_args()

    feed_path = args.feed_file

    if args.feed_url and not args.feed_file:
        logger.info(f"Downloading feed from {args.feed_url[:80]}...")
        async with httpx.AsyncClient(timeout=300.0, follow_redirects=True) as client:
            r = await client.get(args.feed_url)
            r.raise_for_status()
            feed_path = "/tmp/admitad_feed.xml"
            with open(feed_path, "wb") as f:
                f.write(r.content)
            logger.info(f"Downloaded {len(r.content)} bytes")

    if not feed_path:
        parser.error("Provide --feed-url or --feed-file")

    items = parse_feed(feed_path, source_override=args.source)

    if args.limit > 0:
        items = items[:args.limit]
        logger.info(f"Limited to {len(items)} items")

    # Show summary
    from collections import Counter
    types = Counter(i["clothing_type"] for i in items)
    logger.info("Category distribution:")
    for ct, cnt in types.most_common(15):
        logger.info(f"  {cnt:>4}  {ct}")

    if not args.no_pick_flatlay:
        await pick_flatlay_photos(items)

    await insert_items(items, dry_run=args.dry_run)

    if args.encode_embeddings and not args.dry_run:
        await encode_embeddings()


if __name__ == "__main__":
    asyncio.run(main())
