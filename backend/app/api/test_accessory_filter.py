"""Guards the accessory filter on the paid photo-detection path.

Audited 2026-08-22: the detection prompt explicitly asked for "a bag, hat, scarf,
belt or jewellery", and every returned item triggered its own paid flat-lay
generation (5.64 ₽ each at the time). Meanwhile _SLOT_MAP in recommendations.py
has no slot for accessories and drops them, so a generated image of a pair of
sunglasses was paid for and then thrown away — it could never appear in an outfit.

Run it:  python3 -m app.api.test_accessory_filter     (from backend/)

ponytail: plain asserts, no pytest — pytest is not installed and CI runs no tests.
"""

from app.api.misc import _is_ignored_accessory as skip

# Accessories with no outfit slot. Money spent generating these is money burnt.
SKIP = [
    {"clothing_item": "sunglasses", "item_name": "Солнцезащитные очки"},
    {"clothing_item": "glasses", "item_name": "Очки в тонкой оправе"},
    {"clothing_item": "watch", "item_name": "Наручные часы"},
    {"clothing_item": "necklace", "item_name": "Ожерелье"},
    {"clothing_item": "earrings", "item_name": "Серьги"},
    {"clothing_item": "bracelet", "item_name": "Браслет"},
    {"clothing_item": "ring", "item_name": "Золотое кольцо"},
    {"clothing_item": "belt", "item_name": "Кожаный ремень"},
]

# Real garments, plus the accessories deliberately kept (bags, hats, scarves are
# plausible outfit elements once slots exist for them).
KEEP = [
    {"clothing_item": "t-shirt", "item_name": "Серая футболка"},
    {"clothing_item": "coat", "item_name": "Пальто"},
    {"clothing_item": "jeans", "item_name": "Джинсы"},
    {"clothing_item": "boots", "item_name": "Ботинки"},
    {"clothing_item": "bag", "item_name": "Сумка-шоппер"},
    {"clothing_item": "hat", "item_name": "Шляпа"},
    {"clothing_item": "scarf", "item_name": "Шарф"},
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
                     "description": "часы на запястье модели, очки, ремень"})


if __name__ == "__main__":
    checked = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); checked += 1
            print(f"ok  {name}")
    print(f"\n{checked} проверки пройдены, {len(SKIP)} отсеивается, {len(KEEP)} остаётся")
