# -*- coding: utf-8 -*-
"""Тесты сочетаемости образа. Кейсы взяты из прода 2026-08-16: 1191 образ
содержал шорты с верхней одеждой, 150 — шорты с шапкой.

Запуск: `python3 backend/test_outfit_compat.py`
"""
import os
import sys

# Только backend/ на пути: app.services.weather_rules тянет clothing_taxonomy
# из корня backend, а вторая вставка backend/app дала бы модуль дважды.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.outfit_compat import is_coherent, repair_outfit, shared_window  # noqa: E402


def _item(name, ct, tmin=None, tmax=None):
    return {"id": name, "name": name, "clothing_type": ct,
            "temp_min": tmin, "temp_max": tmax}


def test_shorts_and_jacket_do_not_share_a_window():
    # Ровно тот брак со скриншота: окна пересекаются в одной точке 20.
    items = [_item("шорты", "shorts", 20, 35), _item("куртка", "jacket", 0, 20)]
    lo, hi = shared_window(items)
    assert (lo, hi) == (20, 20), (lo, hi)
    assert is_coherent(items) is False


def test_summer_outfit_is_coherent():
    items = [_item("футболка", "t-shirt", 18, 35),
             _item("шорты", "shorts", 20, 35),
             _item("кроссовки", "sneakers", None, None)]
    assert is_coherent(items) is True


def test_autumn_outfit_is_coherent():
    items = [_item("пальто", "coat", -10, 15),
             _item("джинсы", "jeans", 0, 28),
             _item("свитер", "pullover", 0, 18)]
    assert is_coherent(items) is True


def test_untagged_item_does_not_break_a_good_outfit():
    # Вещь без диапазона и без узнаваемого имени не должна ничего ломать.
    items = [_item("футболка", "t-shirt", 18, 35),
             _item("шорты", "shorts", 20, 35),
             _item("нечто", None, None, None)]
    assert is_coherent(items) is True


def test_repair_drops_the_offending_item():
    items = [_item("футболка", "t-shirt", 18, 35),
             _item("шорты", "shorts", 20, 35),
             _item("куртка", "jacket", 0, 20),
             _item("кроссовки", "sneakers", None, None)]
    kept, dropped = repair_outfit(items)
    assert len(dropped) == 1, dropped
    assert dropped[0]["name"] == "куртка"
    assert is_coherent(kept) is True


def test_repair_gives_up_when_too_few_items_remain():
    # Чинить нечего: после удаления останется меньше трёх вещей.
    items = [_item("шорты", "shorts", 20, 35), _item("пуховик", "puffer-jacket", -20, 10)]
    kept, dropped = repair_outfit(items)
    assert kept == [], kept


def test_cold_accessory_by_name_conflicts_with_shorts():
    # Шапка не имеет clothing_type в проде — ловим по имени.
    items = [_item("футболка", "t-shirt", 18, 35),
             _item("шорты", "shorts", 20, 35),
             _item("шапка вязаная", None, None, None)]
    assert is_coherent(items) is False


if __name__ == "__main__":
    passed = failed = 0
    for _name, _fn in sorted(list(globals().items())):
        if _name.startswith("test_") and callable(_fn):
            try:
                _fn()
                passed += 1
            except AssertionError as exc:
                failed += 1
                print("FAIL", _name, exc)
    print(f"{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
