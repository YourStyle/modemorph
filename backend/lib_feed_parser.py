"""
YML (Yandex Market Language) feed parser.
Port of ai-service/scripts/import_catalog.py category mapping logic.
"""

import xml.etree.ElementTree as ET
from typing import Optional


CATEGORY_MAP = {
    "верхняя одежда": "coat", "базовые куртки": "puffer-jacket", "куртки": "puffer-jacket",
    "пальто и полупальто": "coat", "пальто": "coat", "тренчи и плащи": "coat",
    "бомберы": "coat", "ветровки": "coat", "дубленки и шубы": "sheepskin-coat",
    "джинсовые куртки": "coat", "жилеты": "vest", "кожа и замша": "coat",
    "джемперы и кардиганы": "pullover", "джемперы и свитеры": "pullover",
    "кардиганы": "cardigan", "водолазки": "turtleneck", "поло": "t-shirt",
    "футболки и лонгсливы": "t-shirt", "лонгсливы": "lonsleeve",
    "культовые": "t-shirt", "базовые": "t-shirt", "принт и вышивка": "t-shirt",
    "худи и свитшоты": "hoodie", "худи": "hoodie", "свитшоты": "sweatshirt", "на молнии": "hoodie",
    "рубашки и блузки": "shirt", "рубашки": "shirt", "блузки": "blouse",
    "брюки и леггинсы": "pants", "брюки": "pants", "классические": "pants",
    "широкие": "pants", "карго и парашюты": "sporty-pants", "джоггеры": "sporty-pants", "леггинсы": "pants",
    "джинсы": "jeans", "слим": "jeans", "прямые": "jeans", "мом": "jeans", "клеш": "jeans",
    "платья": "dress", "летние": "dress", "макси и миди": "dress", "мини": "dress",
    "вечерние": "dress", "трикотажные": "dress",
    "юбки": "skirt", "шорты": "pants",
    "жакеты и жилеты": "suit-jacket", "жакеты": "suit-jacket",
    "комплекты": "classic", "спортивная одежда": "sporty-pants",
    "топы и боди": "tank-top", "кроп-топы": "tank-top", "боди": "tank-top",
    "комбинезоны": "dress",
}

SKIP_CATEGORIES = {
    "носки", "колготки", "гетры", "нижнее белье", "бюстгальтеры", "трусы",
    "домашняя одежда", "пижамы", "халаты", "сорочки",
    "купальники и пляжная одежда", "купальные лифы", "купальные трусы",
    "постельное белье", "полотенца", "пледы", "кружки", "канцелярия", "брелоки",
    "наборы", "аксессуары для сна",
}

FEMALE_CATS = {"1", "1374"}
MALE_CATS = {"2", "1443"}

COLORS_RU = {
    "черн": "Черный", "бел": "Белый", "сер": "Серый", "син": "Синий",
    "голуб": "Голубой", "красн": "Красный", "розов": "Розовый",
    "зелен": "Зеленый", "бежев": "Бежевый", "коричнев": "Коричневый",
    "хаки": "Хаки", "бордов": "Бордовый", "фиолетов": "Фиолетовый",
    "оранж": "Оранжевый", "желт": "Желтый",
}


def _map_clothing_type(name: str, parent: str = "") -> Optional[str]:
    low = name.lower().strip()
    if low in SKIP_CATEGORIES:
        return None
    if low in CATEGORY_MAP:
        return CATEGORY_MAP[low]
    plw = parent.lower().strip()
    if plw and plw in CATEGORY_MAP:
        return CATEGORY_MAP[plw]
    for k, v in CATEGORY_MAP.items():
        if k in low:
            return v
    return None


def _extract_color(name: str) -> str:
    low = name.lower()
    for k, v in COLORS_RU.items():
        if k in low:
            return v
    return ""


def parse_yml_feed(xml_string: str) -> dict:
    """Parse YML XML string. Returns {items, shopName, totalOffers, skippedCategories, skippedNoImage}."""
    root = ET.fromstring(xml_string)
    shop = root.find("shop")
    if shop is None:
        raise ValueError("Неверный формат фида: не найден элемент shop")

    shop_name = shop.findtext("name", "Unknown")

    cat_map = {}
    cat_parents = {}
    for cat in shop.findall(".//category"):
        cid = cat.get("id", "")
        cat_map[cid] = cat.text or ""
        pid = cat.get("parentId")
        if pid:
            cat_parents[cid] = pid

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
    offers = shop.findall(".//offer")

    for offer in offers:
        cat_id = offer.findtext("categoryId", "")
        cat_name = cat_map.get(cat_id, "")
        parent_id = cat_parents.get(cat_id, "")
        parent_name = cat_map.get(parent_id, "")

        # Check skip
        chain = []
        c = cat_id
        visited = set()
        while c and c not in visited:
            visited.add(c)
            if c in cat_map:
                chain.append(cat_map[c])
            c = cat_parents.get(c)

        if any(n.lower().strip() in SKIP_CATEGORIES for n in chain):
            skipped_cat += 1
            continue

        ct = _map_clothing_type(cat_name, parent_name)
        if not ct:
            skipped_cat += 1
            continue

        pictures = offer.findall("picture")
        if not pictures:
            skipped_img += 1
            continue
        image_url = pictures[0].text or ""
        if not image_url:
            skipped_img += 1
            continue

        name = offer.findtext("name") or offer.findtext("model") or ""
        if not name:
            continue

        items.append({
            "item_name": name,
            "description": (offer.findtext("description") or "")[:500],
            "image_url": image_url,
            "url": offer.findtext("url") or "",
            "clothing_type": ct,
            "color": _extract_color(name),
            "gender": detect_gender(cat_id),
            "source": shop_name,
            "source_sku": offer.get("id") or offer.get("group_id") or "",
            "price": float(offer.findtext("price") or 0) or None,
        })

    return {
        "items": items,
        "shopName": shop_name,
        "totalOffers": len(offers),
        "skippedCategories": skipped_cat,
        "skippedNoImage": skipped_img,
    }
