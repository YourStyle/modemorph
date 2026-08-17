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

from app.services.outfit_compat import (  # noqa: E402
    covers_body, has_bottom, is_coherent, item_window, repair_outfit, shared_window,
)


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


def test_repair_keeps_a_base_garment():
    # Баг 1 (продуктовый): жадный алгоритм по ширине окна раньше жертвовал
    # футболкой и шортами ради шапки, шарфа и перчаток — их окно (-30, 12)
    # шире окна базовой вещи, поэтому "выгоднее" на вид. Починка должна
    # сначала выбрасывать аксессуары, и только если это не помогло —
    # добираться до базового гардероба.
    items = [_item("футболка", "t-shirt", 18, 35),
             _item("шорты", "shorts", 20, 35),
             _item("шапка", None, None, None),
             _item("шарф", None, None, None),
             _item("перчатки", None, None, None)]
    kept, dropped = repair_outfit(items)
    has_base_item = any(it["name"] in ("футболка", "шорты") for it in kept)
    # Либо в остатке осталась хотя бы одна базовая вещь, либо образ признан
    # неспасаемым целиком — но НЕ "одни аксессуары в kept".
    assert kept == [] or has_base_item, kept


def test_repair_leaves_a_coherent_pair_alone():
    # Баг 2 (контрактный): уже согласованный образ раньше стирался целиком,
    # потому что порог _MIN_OUTFIT_SIZE применялся ко ВСЕМ образам, включая
    # те, что чинить было не нужно.
    items = [_item("футболка", "t-shirt", 18, 35), _item("шорты", "shorts", 20, 35)]
    assert is_coherent(items) is True
    kept, dropped = repair_outfit(items)
    assert kept == items, kept
    assert dropped == [], dropped


def test_repair_does_not_mutate_input():
    items = [_item("футболка", "t-shirt", 18, 35),
             _item("шорты", "shorts", 20, 35),
             _item("куртка", "jacket", 0, 20),
             _item("кроссовки", "sneakers", None, None)]
    items_copy = [dict(it) for it in items]
    repair_outfit(items)
    assert items == items_copy, items


def test_repair_on_empty_list():
    kept, dropped = repair_outfit([])
    assert kept == [], kept
    assert dropped == [], dropped


def test_item_window_with_only_one_bound():
    lo, hi = item_window(_item("шорты", "shorts", 20, None))
    assert (lo, hi) == (20, 50), (lo, hi)
    lo, hi = item_window(_item("шорты", "shorts", None, 35))
    assert (lo, hi) == (-50, 35), (lo, hi)


def test_has_bottom_rejects_outfit_without_legs():
    """Реальный образ с прода 17.08.2026: «Прогулка с комфортом» = рубашка +
    куртка + очки. По температуре согласован, слоты не дублируются, но надеть
    нельзя — ни is_coherent, ни дедуп по слотам эту дыру не видят."""
    walk = [_item("льняная рубашка", "shirt"), _item("Куртка-рубашка Fioroni", "jacket")]
    assert is_coherent(walk), "по температуре образ согласован — ловить должен не temp"
    assert not has_bottom(walk), "низа нет, образ обязан быть отброшен"


def test_has_bottom_accepts_normal_outfits():
    assert has_bottom([_item("футболка", "t-shirt"), _item("брюки", "pants")])
    assert has_bottom([_item("рубашка", "shirt"), _item("джинсы", "jeans")])
    # свитшот с брюками — верха-рубашки нет, и это нормальный образ
    assert has_bottom([_item("свитшот", "sweatshirt"), _item("брюки", "pants")])
    # платье самодостаточно
    assert has_bottom([_item("платье", "dress"), _item("туфли", "shoes")])
    # костюм тоже — отдельные брюки к нему не нужны
    assert has_bottom([_item("костюм", "classic"), _item("туфли", "shoes")])


def test_covers_body_distinguishes_layers_that_need_something_underneath():
    """Слой слою рознь — на этом расходились сидер витрины и рекомендации.

    Кардиган на голое тело — это те самые 42 образа из 71 «джинсы + кроссовки +
    кардиган» из dry-run сидера 17.08.2026. Свитшот на голое тело — нормально,
    и требование обязательной рубашки под ним теряло живые образы.
    """
    # нужен низ + что-то, что само закрывает верх
    assert covers_body([_item("джинсы", "jeans"), _item("свитшот", "sweatshirt")])
    assert covers_body([_item("джинсы", "jeans"), _item("худи", "hoodie")])
    assert covers_body([_item("брюки", "pants"), _item("водолазка", "turtleneck")])
    # а эти слои сами верх не закрывают
    assert not covers_body([_item("джинсы", "jeans"), _item("кроссовки", "sneakers"),
                            _item("кардиган", "cardigan")])
    assert not covers_body([_item("брюки", "pants"), _item("пиджак", "suit-jacket")])
    assert not covers_body([_item("брюки", "pants"), _item("жилет", "vest")])
    # но с рубашкой под низ — образ полный
    assert covers_body([_item("брюки", "pants"), _item("пиджак", "suit-jacket"),
                        _item("рубашка", "shirt")])


def test_covers_body_rejects_two_whole_body_garments():
    """Платье и костюм в одном образе — не образ. Правило пришло из сидера."""
    assert not covers_body([_item("платье", "dress"), _item("костюм", "classic"),
                            _item("туфли", "shoes")])
    assert covers_body([_item("платье", "dress"), _item("туфли", "shoes")])


def test_covers_body_rescues_valid_two_item_outfits():
    """Порог «минимум 3 вещи» не должен убивать образ, который одевает целиком.

    Кейс с прода: «свитшот + брюки + очки» после снятия аксессуара превращался
    в двухпредметный и выбрасывался, хотя носить его можно.
    """
    assert covers_body([_item("свитшот", "sweatshirt"), _item("брюки", "pants")])
    assert covers_body([_item("платье", "dress")])
    assert covers_body([_item("костюм", "classic")])
    # неполные наборы не спасаем
    assert not covers_body([_item("рубашка", "shirt"), _item("куртка", "jacket")])
    assert not covers_body([_item("брюки", "pants"), _item("кроссовки", "sneakers")])
    assert not covers_body([_item("футболка", "t-shirt"), _item("очки", "верхняя")])


def test_is_coherent_requires_current_temperature_inside_the_window():
    """Кейс с прода 17.08.2026: сандалии в образе при +19.

    Окна: футболка (18..35), спортивные брюки (5..25), сандалии (22..40).
    Пересечение — (22, 25), ширина ровно 3, то есть «согласовано». Но 19 в это
    окно не попадает, и образ всё равно уезжал пользователю.
    """
    outfit = [_item("футболка", "t-shirt", 18, 35),
              _item("спортивные брюки", "sporty-pants", 5, 25),
              _item("сандалии", "sandals", 22, 40)]
    assert shared_window(outfit) == (22, 25)
    assert is_coherent(outfit) is True, "без температуры образ считается согласованным"
    assert is_coherent(outfit, 19) is False, "при +19 образ носить нельзя"
    assert is_coherent(outfit, 23) is True, "при +23 всё в порядке"
    # границы окна включительно
    assert is_coherent(outfit, 22) is True
    assert is_coherent(outfit, 25) is True
    assert is_coherent(outfit, 26) is False


def test_repair_with_temp_drops_the_out_of_season_item_not_the_trousers():
    """Метрика «шире окно» тут уводит в другую сторону, и это главный риск правки.

    Выброс брюк даёт (22, 35) шириной 13, выброс сандалий — (18, 25) шириной 7.
    По ширине победил бы выброс брюк: образ остался бы без низа, зато в
    сандалиях. Побеждать должно расстояние до текущей температуры.
    """
    outfit = [_item("футболка", "t-shirt", 18, 35),
              _item("спортивные брюки", "sporty-pants", 5, 25),
              _item("сандалии", "sandals", 22, 40)]
    kept, dropped = repair_outfit(outfit, 19)
    assert [d["name"] for d in dropped] == ["сандалии"], dropped
    assert {k["name"] for k in kept} == {"футболка", "спортивные брюки"}
    assert is_coherent(kept, 19) is True
    assert covers_body(kept), "низ обязан остаться на месте"


def test_repair_without_temp_keeps_old_behaviour():
    """Сидер витрины зовёт repair_outfit без температуры — поведение не меняем."""
    outfit = [_item("футболка", "t-shirt", 18, 35),
              _item("спортивные брюки", "sporty-pants", 5, 25),
              _item("сандалии", "sandals", 22, 40)]
    kept, dropped = repair_outfit(outfit)
    assert dropped == [], "без температуры образ согласован и чинить нечего"
    assert kept == outfit


def test_repair_with_temp_gives_up_on_hopeless_outfit():
    """Зимний образ при +25 спасать нечем — выбрасывается целиком."""
    outfit = [_item("пуховик", "puffer-jacket", -20, 10),
              _item("свитер", "pullover", 0, 18),
              _item("ботинки", "boots", -25, 15)]
    kept, dropped = repair_outfit(outfit, 25)
    assert kept == [], kept


def test_has_bottom_ignores_accessories_and_shoes():
    """Обувь и аксессуары ног не прикрывают."""
    assert not has_bottom([_item("футболка", "t-shirt"), _item("кроссовки", "sneakers")])
    assert not has_bottom([_item("Очки", "верхняя"), _item("худи", "hoodie")])


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
