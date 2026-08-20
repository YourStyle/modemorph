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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from feed_params import (  # noqa: E402
    build_category_index,
    category_chain,
    markup_from_offer,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://modemorph:modemorph@localhost:5433/modemorph",
)

# ---------------------------------------------------------------------------
# Brand provenance.
#
# This is a deliberate copy of the two small pieces of backend/brand.py that this
# script needs: it runs inside the modemorph-ai container, which does not have
# backend/ on its path. The canonical module (with the suffix matcher used by the
# backfill, the reasoning, and the measurements) is backend/brand.py — change both.
#
# Monobrand = the feed ships no <vendor> and the retailer sells one house, so the
# brand is a constant. Verified on the live feeds 2026-08-20: SELA (feed 24700)
# and 2moodstore (25132, 0/6389 offers with a vendor) carry no <vendor> tag at all.
# ЦУМ and ElytS are NOT here: they are multi-brand, and writing a constant for them
# is the "brand = ЦУМ" bug this whole change exists to remove.
# ---------------------------------------------------------------------------
MONOBRAND_SOURCES = {
    "sela": "SELA",
    "интернет-магазин lacoste": "Lacoste",
    "lacoste": "Lacoste",
    "love republic": "LOVE REPUBLIC",
    "loverepublic": "LOVE REPUBLIC",
    "2moodstore": "2MOOD",
}

BRAND_SOURCE_FEED_VENDOR = "feed_vendor"
BRAND_SOURCE_MONOBRAND = "monobrand"


def brand_from_offer(vendor: str, source_name: str):
    """(brand, brand_source) for one offer; (None, None) when genuinely unknown.

    <vendor> outranks the monobrand constant: a monobrand retailer that starts
    carrying a second house is right and our table is stale.
    """
    vendor = (vendor or "").strip()
    if vendor:
        return vendor, BRAND_SOURCE_FEED_VENDOR
    constant = MONOBRAND_SOURCES.get(" ".join((source_name or "").split()).lower())
    if constant:
        return constant, BRAND_SOURCE_MONOBRAND
    return None, None


# ---------------------------------------------------------------------------
# Which tag is the SKU. Copy of backend/lib_feed_parser.MIN_MODEL_CARDINALITY /
# _model_is_identifier — this script runs in modemorph-ai and cannot import
# backend/, same as the MONOBRAND_SOURCES copy above.
#
# `source_sku` becomes notes ("<SOURCE>:<SKU>"), which is the dedup key here AND
# the staleness key in cron.sync-feeds. It was `model or id` unconditionally, and
# <model> is not an identifier on half the registered feeds (measured on prod
# 2026-08-20 via wardrobe_items.notes):
#
#   SELA         артикул   5155 строк / 4524 разных SKU
#   ЦУМ          тега нет  ключ и так был id
#   ElytS        ЦВЕТ      30 из 39 строк: "ElytS:Светло-серый" (×3), "Бежевый"…
#   2moodstore   РАЗМЕР    585 строк на 12 разных source_sku: "35", "39,5", "27/32"
#
# With a colour in the key the importer believes it already has every offer of
# that colour: 25 distinct <model> across 81616 ElytS offers means 99.95% of the
# feed can never be imported, and such a row can never go stale either.
# 0.05 sits between the enumerations (0.0003 / ~0.002) and the article code (0.88).
# ---------------------------------------------------------------------------
MIN_MODEL_CARDINALITY = 0.05


def _model_is_identifier(offers) -> bool:
    """Does <model> behave like an identifier ON THIS feed? Measured, not assumed."""
    present = [(o.findtext("model") or "").strip() for o in offers]
    present = [v for v in present if v]
    if not present:
        return False
    return len(set(present)) / len(present) >= MIN_MODEL_CARDINALITY


# ---------------------------------------------------------------------------
# Category mapping: YML category names → our clothing_type
# ---------------------------------------------------------------------------

CATEGORY_MAP = {
    # Верхняя одежда
    "базовые куртки": "jacket",
    "куртки": "jacket",
    "пальто и полупальто": "coat",
    "пальто": "coat",
    "тренчи и плащи": "coat",
    "бомберы": "jacket",
    "ветровки": "jacket",
    "дубленки и шубы": "sheepskin-coat",
    "джинсовые куртки": "jacket",
    "жилеты": "vest",
    "кожа и замша": "jacket",
    # Джемперы / кардиганы
    "джемперы и кардиганы": "pullover",
    "джемперы и свитеры": "pullover",
    "кардиганы": "cardigan",
    "водолазки": "turtleneck",
    "поло": "t-shirt",
    # Футболки
    "футболки и лонгсливы": "t-shirt",
    "лонгсливы": "longsleeve",  # was "lonsleeve" — typo, see clothing_taxonomy.py
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
    "комбинезоны": "jumpsuit",
    # Обувь — mapped onto the 4 shoe clothing_types used by the "shoes" slot
    # (see _SLOT_MAP in ai-service/clip/routes.py / backend/app/api/recommendations.py).
    "обувь": "shoes",
    "туфли": "shoes",
    "лоферы": "shoes",
    "сапоги": "boots",
    "ботинки": "boots",
    "кроссовки": "sneakers",
    "кеды": "sneakers",
    "сандалии": "sandals",
    "босоножки": "sandals",
    "sneakers": "sneakers",
    "boots": "boots",
    "shoes": "shoes",
    "sandals": "sandals",
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

# Gender now comes from feed_params.resolve_gender (category tree, param Пол as
# fallback). The two hardcoded root-category-id sets that used to live here only
# ever matched SELA's numbering, which is why gender was NULL on every ЦУМ row.


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

    # Same tree, whitespace-stripped — feed_params matches category names exactly.
    cat_names, cat_parent_ids = build_category_index(shop)

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

    # <model> is only a SKU on a feed where it BEHAVES like one — see
    # _model_is_identifier. On ElytS it is a colour and on 2moodstore a shoe
    # size, and `model or id` put those straight into the notes dedup key.
    offers = shop.findall(".//offer")
    use_model = _model_is_identifier(offers)
    logger.info(f"SKU key for this feed: {'<model>' if use_model else 'offer id'}")

    for offer in offers:
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
        vendor = (offer.findtext("vendor") or "").strip()

        # Collect all pictures — we'll pick the best flat-lay later
        pictures = [p.text for p in offer.findall("picture") if p.text]
        if not pictures:
            skipped += 1
            continue
        image_url = pictures[0]  # default to first; pick_flatlay() refines later

        # Real markup off the offer: <param name="Пол"/"Цвет"/"Материал"> plus the
        # feed's own category tree. See ai-service/scripts/feed_params.py for why the
        # tree beats param Пол and why colour is split into color + shade.
        # Before this, gender came from two hardcoded root category ids (which only
        # ever matched SELA), colour from a substring of the product name and material
        # was the literal "". Measured against 45 ЦУМ product pages
        # (test/gauntlet/ours/feed-backfill/accuracy_backfill_vs_truth_cum45.json):
        # colour 0/45 -> 31/31 of the offers present in the feed, material 0 -> 31/31,
        # gender 6/45 -> 31/31.
        markup = markup_from_offer(offer, cat_names, cat_parent_ids)
        brand, brand_source = brand_from_offer(vendor, shop_name)
        gender = markup["gender"]
        color, shade, material = markup["color"], markup["shade"], markup["material"]
        if not color:
            # last resort for feeds that carry no colour at all: the product name.
            # Kept because it costs nothing, but it is weak — on the ЦУМ sample it
            # produced an answer for 0 of 45 items.
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
            "shade": shade,
            "material": material,
            # style stays NULL on purpose. It used to be the literal "Casual" on
            # every insert, which is how 22193/22418 prod rows ended up claiming
            # a style nobody looked at (measured 2026-08-13). No merchant ships
            # one: 0/45 archived ЦУМ product pages carry a "Стиль" field and
            # none of the three YML feeds has a style <param>. The only real
            # producer is the CLIP zero-shot classifier (clip/classifier.py
            # STYLES) — see test/gauntlet/ours/type-style/proposal/PROPOSAL.md.
            "style": None,
            "gender": gender,
            "is_kids": markup["is_kids"],
            "has_print": False,
            "has_details": False,
            # A children's item used to be inserted with is_hidden = False: the
            # row was correctly flagged and still shown, because the only job
            # that hides kids (cron classify-gender) looks at rows with an empty
            # gender, and a kids row always gets one from the category tree. The
            # 1567 kids rows in prod are hidden only because migration 010 hid
            # them in bulk; anything imported after it would have leaked.
            # Kids are hidden, never deleted.
            "is_hidden": bool(markup["is_kids"]),
            "is_basic": False,
            # The house that made the garment, and how we know. <vendor> was parsed
            # and thrown away here until 2026-08-20, which is why every consumer
            # fell back to the retailer name in notes and a Saint Laurent coat came
            # out labelled "ЦУМ". Multi-brand feeds with no <vendor> stay NULL —
            # see backend/migrations/030_item_brand.sql.
            "brand": brand,
            "brand_source": brand_source,
            "source": shop_name,
            "source_sku": (model or offer.get("id", "")) if use_model else offer.get("id", ""),
            "price": float(price) if price else None,
        })

    logger.info(f"Parsed {len(items)} clothing items, skipped {skipped}")
    return items


async def insert_items(items: list[dict], dry_run: bool = False):
    """Insert items into wardrobe_items table."""
    if dry_run:
        logger.info(f"[DRY RUN] Would insert {len(items)} items")
        total = len(items) or 1
        for field in ("color", "shade", "material", "gender", "brand"):
            filled = sum(1 for i in items if i.get(field))
            logger.info(f"  {field:>9} filled on {filled}/{len(items)} ({100 * filled // total}%)")
        logger.info(f"  {'is_kids':>9} true on {sum(1 for i in items if i.get('is_kids'))}/{len(items)}")
        # Which provenance the brands came from, and how many houses the feed
        # actually names — 1 distinct brand on a feed we treat as multi-brand
        # (or 0 on any feed) is the signal that <vendor> went away.
        by_source = {}
        for i in items:
            if i.get("brand_source"):
                by_source[i["brand_source"]] = by_source.get(i["brand_source"], 0) + 1
        logger.info(f"  {'brand_src':>9} {by_source or 'none'}")
        logger.info(f"  {'brands':>9} {len({i['brand'] for i in items if i.get('brand')})} distinct")
        for item in items[:5]:
            logger.info(
                f"  {item['clothing_type']:>15}  {item['item_name'][:44]:<44} "
                f"{item['color']}/{item['shade'] or '-'}  {item['gender']}  "
                f"{item['material'][:24]}  {item['brand'] or '-'}"
            )
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
                    gender, is_kids, has_print, has_details, is_hidden, is_basic, notes, price,
                    brand, brand_source)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
                           $20,$21)""",
                item["item_name"], item["item_name_en"],
                item["description"], item["description_en"],
                item["image_url"], item["url"],
                item["clothing_type"], item["color"], item["shade"],
                item["material"], item["style"],
                item["gender"],
                item["is_kids"],  # from the feed's category root, not a keyword guess
                item["has_print"], item["has_details"],
                item["is_hidden"], item["is_basic"],
                f"{item['source']}:{item['source_sku']}",  # store in notes for dedup
                item["price"],  # парсился из фида и терялся — виджету нечего было показать
                item["brand"],  # <vendor> — тоже парсился и терялся, отсюда «бренд ЦУМ»
                item["brand_source"],
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
