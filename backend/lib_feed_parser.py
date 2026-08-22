"""
YML (Yandex Market Language) feed parser — the PRODUCTION ingest path.

Both scheduled catalog jobs go through :func:`parse_yml_feed`:
    docker/cron/entrypoint.sh  02:30 UTC -> POST /api/cron/import-feeds  (cron.py)
    docker/cron/entrypoint.sh  03:00 UTC -> POST /api/cron/process-feeds (cron.py)

Markup (color / shade / material / gender / is_kids) is NOT decided here: it is
read off the offer by ``feed_params.markup_from_offer``, the same module the
manual importer (ai-service/scripts/import_catalog.py) and the one-off backfill
(ai-service/scripts/backfill_feed_markup.py) use, so all three paths write the
same values for the same offer.
"""

import xml.etree.ElementTree as ET
from typing import Optional

from brand import brand_from_offer
from feed_params import build_category_index, markup_from_offer
from kids_detect import detect_kids


# ---------------------------------------------------------------------------
# Feed category -> clothing_type slug.
#
# These three tables live ONLY here. ai-service/scripts/import_catalog.py still
# carries its own older single-table CATEGORY_MAP with a different resolver, so
# the two importers can disagree on clothing_type; unifying them is the
# type-style workstream, not this one. Do not describe them as "in sync".
#
# WHY THE TABLE IS SPLIT IN TWO
# -----------------------------
# The old single CATEGORY_MAP mixed garment nouns ("юбки") with fit/length/
# occasion adjectives ("прямые", "мини", "классические"), and the resolver tried
# the LEAF first. Merchant taxonomies put those adjectives at the leaf under many
# different garments, so the adjective won and the garment was lost.
#
# Measured on the ЦУМ feed snapshot /tmp/cum.xml, 8940 offers
# (test/gauntlet/ours/type-style/raw/feed_category_audit.tsv):
#     "Классические < Платья"        6 dresses   -> pants
#     "Классические < Рубашки"       6 shirts    -> pants
#     "Классические < Костюмы"       4 suits     -> pants
#     "Классические < Кроссовки"     3 sneakers  -> pants
#     "Классические < Юбки"          2 skirts    -> pants
#     "Трикотажные  < Перчатки"     13 gloves    -> dress
#     "Прямые       < Брюки"       198 trousers  -> jeans
#     "Мини         < Юбки"          skirts      -> dress
# ---------------------------------------------------------------------------

# Category names that identify the garment on their own.
GARMENT_CATEGORIES = {
    # --- outerwear ---
    # NB: «Верхняя одежда» names a shop section, not a garment — it is a
    # qualifier below, so the resolver walks past it to the real leaf.
    "базовые куртки": "jacket", "куртки": "jacket",
    "пальто и полупальто": "coat", "пальто": "coat", "тренчи и плащи": "coat",
    "тренчи": "coat", "плащи": "coat",
    "бомберы": "jacket", "ветровки": "jacket", "дубленки и шубы": "sheepskin-coat",
    "дубленки": "sheepskin-coat", "шубы": "fur-coat",
    "джинсовые куртки": "jacket", "жилеты": "vest", "кожа и замша": "jacket",
    "пуховики": "puffer-jacket", "парки": "parka",
    # --- knitwear / layers ---
    "джемперы и кардиганы": "pullover", "джемперы и свитеры": "pullover",
    "джемперы": "pullover", "свитеры": "pullover", "свитера": "pullover",
    "пуловеры": "pullover",
    "кардиганы": "cardigan", "водолазки": "turtleneck", "поло": "t-shirt",
    "толстовки": "hoodie", "худи и свитшоты": "hoodie", "худи": "hoodie",
    "свитшоты": "sweatshirt",
    # --- tops ---
    "футболки и лонгсливы": "t-shirt", "футболки и топы": "t-shirt",
    "футболки и поло": "t-shirt", "футболки": "t-shirt",
    "лонгсливы": "longsleeve",
    "рубашки и блузки": "shirt", "рубашки и блузы": "shirt", "рубашки": "shirt",
    "блузки": "blouse", "блузы": "blouse",
    "топы и боди": "tank-top", "кроп-топы": "tank-top", "боди": "tank-top",
    "топы": "tank-top", "майки": "tank-top",
    # --- bottoms ---
    "брюки и леггинсы": "pants", "брюки": "pants",
    "карго и парашюты": "sporty-pants", "карго": "sporty-pants",
    "джоггеры": "sporty-pants", "леггинсы": "pants", "легинсы": "pants",
    "джинсы": "jeans", "деним": "jeans",
    "шорты": "shorts",
    # --- dress family ---
    "платья": "dress", "сарафаны": "dress", "юбки": "skirt",
    "комбинезоны": "jumpsuit",
    # --- tailoring / sets ---
    "жакеты и жилеты": "suit-jacket", "жакеты": "suit-jacket", "пиджаки": "suit-jacket",
    "костюмы": "classic", "спортивные костюмы": "tracksuit",
    "спортивная одежда": "sporty-pants",
    # --- shoes — mapped onto the 4 shoe clothing_types used by the "shoes" slot
    # (see _SLOT_MAP in ai-service/clip/routes.py / backend/app/api/recommendations.py).
    "обувь": "shoes", "туфли": "shoes", "лоферы": "shoes", "балетки": "shoes",
    "мокасины": "shoes",
    "сапоги": "boots", "ботинки": "boots", "ботильоны": "boots",
    "ботинки и ботильоны": "boots", "полусапоги": "boots",
    "кроссовки": "sneakers", "кеды": "sneakers", "кроссовки и кеды": "sneakers",
    "сандалии": "sandals", "босоножки": "sandals",
    "sneakers": "sneakers", "boots": "boots", "shoes": "shoes", "sandals": "sandals",
}

# Fit / length / occasion / fabric adjectives. They only ever refine the parent
# category, so they must resolve to NOTHING on their own and let the resolver
# walk one level up. Listed explicitly (rather than just omitted) so the guard
# below fails loudly if someone re-adds one of them as a garment.
QUALIFIER_CATEGORIES = {
    "верхняя одежда", "одежда", "обувь и аксессуары",
    "классические", "классический", "повседневные", "вечерние", "коктейльные",
    "летние", "зимние", "демисезонные", "утепленные", "утеплённые",
    "прямые", "широкие", "узкие", "расклешенные", "слим", "мом", "клеш",
    "скинни", "бойфренды", "приталенные", "оверсайз", "укороченные",
    "мини", "миди", "макси", "короткие", "длинные", "макси и миди",
    "базовые", "культовые", "принт и вышивка", "с принтом", "однотонные",
    "трикотажные", "кожаные", "джинсовые", "шерстяные", "хлопковые",
    "на молнии", "на пуговицах", "на каблуке", "на плоской подошве",
    "с высокой посадкой", "с низкой посадкой", "на шнуровке",
}

_clash = set(GARMENT_CATEGORIES) & QUALIFIER_CATEGORIES
assert not _clash, f"category listed as both garment and qualifier: {sorted(_clash)}"

# Back-compat alias: callers (and the ai-service copy) still import CATEGORY_MAP.
CATEGORY_MAP = GARMENT_CATEGORIES

SKIP_CATEGORIES = {
    "носки", "колготки", "гетры", "нижнее белье", "нижнее бельё", "бельё", "белье",
    "бюстгальтеры", "трусы",
    "домашняя одежда", "пижамы", "халаты", "сорочки",
    "купальники и пляжная одежда", "купальники", "пляжная одежда",
    "купальные лифы", "купальные трусы", "раздельные купальники",
    "слитные купальники",
    "постельное белье", "полотенца", "пледы", "кружки", "канцелярия", "брелоки",
    "наборы", "аксессуары для сна",
    # Accessories: _SLOT_MAP has no accessory slot, so an accessory that slips
    # through gets a garment slug and is offered as clothing. "Трикотажные <
    # Перчатки < Аксессуары" used to import 13 pairs of gloves as `dress`.
    "аксессуары", "аксессуары из кожи", "головные уборы", "шапки", "бейсболки",
    "кепки", "панамы", "шляпы", "шарфы", "платки", "шарфы и платки",
    "перчатки", "варежки", "ремни", "очки", "солнцезащитные очки",
    "украшения", "бижутерия", "часы", "галстуки", "бабочки",
    "сумки", "повседневные сумки", "поясные сумки", "шоперы", "клатчи",
    "рюкзаки", "картхолдеры", "кошельки", "чемоданы",
}

# SELA-only root category ids. Gender used to be resolved by walking the parent
# chain looking for one of these four numbers, which is why the ЦУМ feed (roots
# 18327 "Женское" / 18338 "Мужское") imported with gender = NULL on every row.
# Gender now comes from feed_params.resolve_gender, which reads the root category
# NAME and therefore works on any feed; these ids stay only as a last-resort
# fallback for a feed whose root name we do not recognise.
FEMALE_CATS = {"1", "1374"}
MALE_CATS = {"2", "1443"}

# Children's items are not our audience — skip at import (name + category chain).
# Mirrors app/services/catalog_filters.KIDS_KEYWORDS.
_KIDS_KEYWORDS = (
    "детск", "для детей", "для мальчик", "для девоч", "ясельн", "малыш",
    "школьн", "подростк", "детям", "новорожд", "kids", "baby", "junior",
    "toddler", "infant",
)

COLORS_RU = {
    "черн": "Черный", "бел": "Белый", "сер": "Серый", "син": "Синий",
    "голуб": "Голубой", "красн": "Красный", "розов": "Розовый",
    "зелен": "Зеленый", "бежев": "Бежевый", "коричнев": "Коричневый",
    "хаки": "Хаки", "бордов": "Бордовый", "фиолетов": "Фиолетовый",
    "оранж": "Оранжевый", "желт": "Желтый",
}


def map_clothing_type_chain(chain) -> Optional[str]:
    """Resolve a leaf->root category chain to one clothing_type slug.

    ``chain`` is ordered most-specific-first, e.g.
    ``["Прямые", "Брюки", "Одежда", "Женское"]``.

    Rules, in order:
      1. anything on the chain in SKIP_CATEGORIES -> None (not clothing we sell);
      2. first node that is an exact GARMENT_CATEGORIES key wins — qualifier
         leaves ("Прямые") simply are not keys, so the walk continues to "Брюки";
      3. last resort, a substring match against garment keys, again leaf->root,
         restricted to keys of 5+ chars so short keys can't hijack a long label.

    Returns None when nothing on the chain names a garment we have a slug for —
    the caller skips the offer rather than inventing a type.
    """
    nodes = [(c or "").lower().strip() for c in chain if c]
    if any(n in SKIP_CATEGORIES for n in nodes):
        return None
    for n in nodes:
        if n in GARMENT_CATEGORIES:
            return GARMENT_CATEGORIES[n]
    for n in nodes:
        if n in QUALIFIER_CATEGORIES:
            continue
        for k, v in GARMENT_CATEGORIES.items():
            if len(k) >= 5 and k in n:
                return v
    return None


def _map_clothing_type(name: str, parent: str = "") -> Optional[str]:
    """Back-compat two-argument wrapper around map_clothing_type_chain()."""
    return map_clothing_type_chain([name, parent])


def _extract_color(name: str) -> str:
    """Guess a colour from the product name. LAST RESORT ONLY.

    Measured against 45 archived ЦУМ product pages
    (test/gauntlet/ours/feed-backfill/accuracy_vs_truth_cum45.json): 0/45 correct,
    because merchants do not put the colour in the name. It runs only when the
    offer carries neither a colour <param> nor a colour token in its URL slug.
    """
    low = name.lower()
    for k, v in COLORS_RU.items():
        if k in low:
            return v
    return ""


# Минимальная доля РАЗНЫХ значений <model> среди офферов, где тег есть, чтобы
# <model> вообще годился в SKU. Идентификатор почти уникален (доля около 1),
# перечисление — нет.
#
# Зачем это здесь, а не «просто берём model, раз попросили». <model> у разных
# мерчантов означает разное, и на двух из четырёх фидов это НЕ идентификатор:
#
#   магазин      что лежит в <model>   что видно в проде (wardrobe_items.notes)
#   SELA         артикул (SL6808010224)  5155 строк / 4524 разных SKU = 0.88
#   ЦУМ          тега нет вовсе          15204 строки, SKU = атрибут id, всё ок
#   ElytS        ЦВЕТ                    39 строк, у 30 в SKU «Бежевый»,
#                                        «Светло-серый» (×3), «Темно-серый» (×3)
#   2moodstore   РАЗМЕР                  585 строк / 12 разных source_sku:
#                                        «35», «37», «39,5», «27/32»
#
# (замерено на проде 2026-08-20; ElytS-строки перечислены поштучно, у
#  2moodstore на 585 строк всего 100 разных url — это 12 товаров в 585 копиях).
#
# Цена ошибки — не косметическая. notes = "<МАГАЗИН>:<SKU>" это ключ дедупликации
# импортёра И ключ проверки на устаревание в sync-feeds. Когда в SKU лежит цвет,
# импортёр считает, что все офферы этого цвета у него уже есть: у ElytS 25
# разных <model> на 81616 офферов, то есть 99.95% фида недостижимо, а строки с
# цветом в ключе не могут устареть никогда — цвет из фида не исчезает.
#
# 0.05 стоит между перечислениями (ElytS 25/81616 = 0.0003, 2moodstore ≈ 0.002 по
# 12 значениям) и артикулом (SELA 0.88): ×25 запаса до ближайшего перечисления
# снизу и ×17 до артикула сверху. То же значение и по той же причине, что
# MIN_KEY_CARDINALITY в
# backend/scripts/backfill_brand.py — там этот тест защищает ЧТЕНИЕ (джойн ради
# бренда), здесь ЗАПИСЬ (ключ, который ляжет в notes).
MIN_MODEL_CARDINALITY = 0.05


def _model_is_identifier(offers) -> bool:
    """Ведёт ли <model> себя как идентификатор НА ЭТОМ фиде.

    Меряется каждый прогон по самому фиду, а не берётся из таблицы магазинов:
    захардкоженный список рано или поздно разойдётся с фидом, а разошедшийся
    список — это цвет в ключе дедупликации.
    """
    values = [(o.findtext("model") or "").strip() for o in offers]
    present = [v for v in values if v]
    if not present:
        return False
    return len(set(present)) / len(present) >= MIN_MODEL_CARDINALITY


def feed_sku_candidates(xml_bytes) -> set:
    """Every value any importer could have written into notes for this feed.

    Used by the sync-feeds staleness check, which answers ONE question — "is this
    offer still in the feed?" — where a wrong answer HIDES a live product. So the
    set is deliberately PERMISSIVE: the union of id, group_id, <vendorCode> and
    <model>, not just the one key today's importer writes.

    Why the union. The SKU scheme changes (see MIN_MODEL_CARDINALITY: <model> is
    a colour at ElytS and a shoe size at 2moodstore, so those feeds key on the
    offer id), and prod holds rows written under the old one — 30 of 39 ElytS
    rows read "ElytS:Светло-серый", all 585 2moodstore rows are keyed by size.
    Under a strict set every one of those is "missing from the feed": 100% stale,
    far past cron.STALE_THRESHOLD_PCT, and one sync run would hide 615 live rows.

    The opposite risk — an old key colliding with something still in the feed and
    masking a real removal — is the cheap direction to be wrong in: one stale card
    survives an extra day, versus 615 products vanishing at once.
    """
    root = ET.fromstring(xml_bytes)
    shop = root.find("shop")
    if shop is None:
        return set()
    skus = set()
    for offer in shop.findall(".//offer"):
        for value in (offer.get("id"), offer.get("group_id"),
                      offer.findtext("vendorCode"), offer.findtext("model")):
            value = (value or "").strip()
            if value:
                skus.add(value)
    return skus


def parse_yml_feed(xml_string: str, source_override: Optional[str] = None,
                   sku_prefer_model: bool = False) -> dict:
    """Parse YML XML string.

    Returns {items, shopName, totalOffers, skippedCategories, skippedNoImage,
    skippedKids}. Each item carries the markup ``feed_params`` can prove off the
    offer: color, shade, material, gender, is_kids — never a guessed default.

    source_override pins the `source` written into notes (the "Source:sku" prefix used
    for dedup and sync). Pass it for registered Admitad feeds so it matches the
    ADMITAD_FEEDS key — partner <shop><name> values are unreliable.

    sku_prefer_model asks for the SKU import_catalog.py / sync-feeds have always
    written (`<model> or id`) instead of the default (`id or group_id`), so dedup
    keeps matching the model-based notes already in the DB. It is a PREFERENCE,
    honoured only when <model> behaves like an identifier on this feed — see
    MIN_MODEL_CARDINALITY for the two feeds where it does not, and for what a
    colour or a shoe size in the dedup key costs. The chosen scheme is reported
    back as `skuKey` ("model" or "id") so the caller can log it.
    """
    root = ET.fromstring(xml_string)
    shop = root.find("shop")
    if shop is None:
        raise ValueError("Неверный формат фида: не найден элемент shop")

    shop_name = source_override or shop.findtext("name", "Unknown")

    # Same index feed_params.markup_from_offer needs, built once for the feed.
    cat_map, cat_parents = build_category_index(shop)

    def detect_gender(cid: str) -> Optional[str]:
        visited = set()
        cur = cid
        while cur and cur not in visited:
            visited.add(cur)
            if cur in FEMALE_CATS:
                return "female"
            if cur in MALE_CATS:
                return "male"
            cur = cat_parents.get(cur)
        return None

    items = []
    skipped_cat = 0
    skipped_img = 0
    skipped_kids = 0
    offers = shop.findall(".//offer")

    # sku_prefer_model is the CALLER's preference, not a licence. <model> is only
    # a SKU on a feed where it BEHAVES like one — see MIN_MODEL_CARDINALITY.
    use_model = sku_prefer_model and _model_is_identifier(offers)

    for offer in offers:
        cat_id = offer.findtext("categoryId", "")

        # Full leaf->root chain. Resolution needs the whole chain, not just
        # leaf+parent: merchant leaves are often fit/length adjectives
        # ("Классические < Кроссовки < Обувь для мальчиков < Детское").
        chain = []
        c = cat_id
        visited = set()
        while c and c not in visited:
            visited.add(c)
            if c in cat_map:
                chain.append(cat_map[c])
            c = cat_parents.get(c)

        ct = map_clothing_type_chain(chain)
        if not ct:
            skipped_cat += 1
            continue

        pictures = offer.findall("picture")
        if not pictures:
            skipped_img += 1
            continue
        all_pictures = [p.text for p in pictures if p.text and p.text.strip()]
        if not all_pictures:
            skipped_img += 1
            continue
        image_url = all_pictures[0]

        name = offer.findtext("name") or offer.findtext("model") or ""
        if not name:
            continue

        # Everything the offer itself says: <param name="Пол"/"Цвет"/"Материал">
        # plus the merchant's own category tree. See feed_params.py for why the
        # tree beats param Пол and why colour is split into color + shade.
        markup = markup_from_offer(offer, cat_map, cat_parents)

        # The house that made the garment. <vendor> is present on 100% of the ЦУМ
        # (387 distinct brands / 8964 offers) and ElytS (416 / 81616) offers and was
        # being parsed by nobody, which is why every consumer fell back to the
        # retailer name in notes. SELA / 2moodstore ship no <vendor> at all: those
        # are monobrand, so brand.py answers with a constant. A multi-brand feed
        # with no vendor gets (None, None) — an unknown brand, not the shop's name.
        item_brand, item_brand_source = brand_from_offer(
            offer.findtext("vendor") or "", shop_name
        )

        # Skip children's items. The keyword scan over name+chain is the old rule
        # and stays (it is the only one that works on a feed with no kids root);
        # markup["is_kids"] is the merchant's own answer, kept as the safety net
        # for a merchant who renames its categories. Measured on the four live
        # feeds (test/gauntlet/ours/feed-prod-path/r2/raw/prod_path_summary.json,
        # "merchant_kids_offers_imported_by_head"): the keyword rule already
        # catches all 978 ЦУМ and 1770 SELA kids offers, so today this condition
        # drops 0 extra offers — it costs nothing and it changes nothing yet.
        # kids_detect adds the signals neither of the two rules above has: the
        # kids section of the merchant URL (SELA prints /eshop/kids/ and
        # /eshop/baby/ in the link, 1164 rows in prod), <param name="Пол">Детский
        # (ElytS), an age/height grid in the name, and the guards that keep
        # "платье baby doll" / "шерсть baby-альпака" / a description mentioning a
        # school dress code out of the kids bucket. Evidence and per-signal counts:
        # test/gauntlet/ours/kids-purge/r2/raw/{token_evidence,signal_evidence,
        # ambiguous_words}.json.
        hay = (name + " " + " ".join(chain)).lower()
        kid = detect_kids(
            name=name,
            url=offer.findtext("url") or "",
            category_chain=list(reversed(chain)),  # chain is built leaf -> root
            params={(p.get("name") or ""): (p.text or "") for p in offer.findall("param")},
        )
        if markup["is_kids"] or kid.is_kids or any(kw in hay for kw in _KIDS_KEYWORDS):
            skipped_kids += 1
            continue

        items.append({
            "item_name": name,
            "description": (offer.findtext("description") or "")[:500],
            "image_url": image_url,
            "all_pictures": all_pictures,
            "url": offer.findtext("url") or "",
            "clothing_type": ct,
            "color": markup["color"] or _extract_color(name),
            "shade": markup["shade"],
            "material": markup["material"],
            # detect_gender() only knows SELA's four root ids; it is the fallback
            # for a feed whose root category name resolve_gender does not know.
            "gender": markup["gender"] or detect_gender(cat_id),
            "is_kids": markup["is_kids"],
            "brand": item_brand,
            "brand_source": item_brand_source,
            "source": shop_name,
            "source_sku": (
                (offer.findtext("model") or offer.get("id") or offer.get("group_id") or "")
                if use_model
                else (offer.get("id") or offer.get("group_id") or "")
            ),
            "price": float(offer.findtext("price") or 0) or None,
        })

    return {
        "items": items,
        "shopName": shop_name,
        "skuKey": "model" if use_model else "id",
        "totalOffers": len(offers),
        "skippedCategories": skipped_cat,
        "skippedKids": skipped_kids,
        "skippedNoImage": skipped_img,
    }
