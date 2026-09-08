"""Guards the accessory filter on the paid photo-detection path.

Audited 2026-08-22: every detected item triggers its own paid flat-lay
generation, and back then _SLOT_MAP had no slot for accessories, so a generated
image of a pair of sunglasses was paid for and then thrown away.

2026-09-07: seven accessory families (bag, hat, scarf, belt, sunglasses, watch,
jewellery) got their own outfit slots, so they are no longer thrown away and
this filter no longer skips them. What it still skips is what has no slot even
now: gloves, socks, tights, neckties, hair clips.

Run it:  python3 -m app.api.test_accessory_filter     (from backend/)

ponytail: plain asserts, no pytest — pytest is not installed and CI runs no tests.
"""

from app.api.misc import _is_ignored_accessory as skip

# Still no outfit slot. Money spent generating these is money burnt.
SKIP = [
    {"clothing_item": "gloves", "item_name": "Перчатки кожаные"},
    {"clothing_item": "socks", "item_name": "Носки хлопковые"},
    {"clothing_item": "tights", "item_name": "Колготки"},
    {"clothing_item": "tie", "item_name": "Галстук"},
    {"clothing_item": "hair clip", "item_name": "Заколка"},
]

# Real garments, plus the seven accessory families that now have slots.
KEEP = [
    {"clothing_item": "t-shirt", "item_name": "Серая футболка"},
    {"clothing_item": "coat", "item_name": "Пальто"},
    {"clothing_item": "jeans", "item_name": "Джинсы"},
    {"clothing_item": "boots", "item_name": "Ботинки"},
    {"clothing_item": "bag", "item_name": "Сумка-шоппер"},
    {"clothing_item": "hat", "item_name": "Шляпа"},
    {"clothing_item": "scarf", "item_name": "Шарф"},
    {"clothing_item": "sunglasses", "item_name": "Солнцезащитные очки"},
    {"clothing_item": "watch", "item_name": "Наручные часы"},
    {"clothing_item": "jewellery", "item_name": "Ожерелье"},
    {"clothing_item": "belt", "item_name": "Кожаный ремень"},
    # False positives that cost a user a real item — the expensive mistake.
    {"clothing_item": "t-shirt", "item_name": "Футболка",
     "description": "с принтом в виде очков"},
    {"clothing_item": "dress", "item_name": "Платье в кольцах"},
    {"clothing_item": "coat", "item_name": "Пальто с поясом"},
    {"clothing_item": "dress", "item_name": "Платье с ремешком"},
]


def test_accessories_are_skipped():
    for item in SKIP:
        assert skip(item), f"должно отсеиваться, но прошло: {item}"


def test_garments_survive():
    for item in KEEP:
        assert not skip(item), f"настоящая вещь ошибочно отсеяна: {item}"


def test_description_is_never_matched():
    """A garment described using an accessory word is still a garment."""
    assert not skip({"clothing_item": "t-shirt", "item_name": "Футболка",
                     "description": "носки на модели, перчатки, галстук"})


if __name__ == "__main__":
    checked = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); checked += 1
            print(f"ok  {name}")
    print(f"\n{checked} проверки пройдены, {len(SKIP)} отсеивается, {len(KEEP)} остаётся")
