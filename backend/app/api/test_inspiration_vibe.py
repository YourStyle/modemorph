# -*- coding: utf-8 -*-
"""Чистый тест WHERE для ленты идей (app/api/outfits.py:_inspiration_filter).

Почему именно чистый, без базы: проверяемое утверждение — «курируемая витрина не
течёт в общую ленту» — целиком выражается в тексте WHERE, для него не нужен ни
Postgres, ни TestClient (ср. test_ai_chats.py, где изоляция пользователей без
реальных запросов действительно не проверяется).

Запуск:
    PYTHONPATH=backend python3 backend/app/api/test_inspiration_vibe.py
"""

import sys

from app.api.outfits import (
    _current_season,
    _gender_filter,
    _inspiration_filter,
    _inspiration_order,
)


def test_gender_filter_is_shared_by_feed_and_circles():
    """Кружок обязан считаться по тем же образам, что откроются при тапе.

    Пока условие было записано отдельно в ленте и отсутствовало у кружков,
    мужчина видел ряд кружков с женщинами на обложках.
    """
    clause, binds = _gender_filter("male")
    assert binds == {"g": "male"}, binds
    # То же выражение обязано попасть в фильтр ленты — иначе определения разойдутся.
    feed_where, _ = _inspiration_filter("male", "Япония")
    assert clause in feed_where, (clause, feed_where)


def test_gender_filter_without_gender_matches_everything():
    clause, binds = _gender_filter(None)
    assert clause == "TRUE" and binds == {}, (clause, binds)
    # Пустая строка ведёт себя как отсутствие пола, а не как пол "".
    assert _gender_filter("") == ("TRUE", {})


def test_default_feed_shows_every_section():
    """«Все» обязано грузить из всех разделов, включая витрину.

    Раньше это был vibe IS NULL — 16 самых первых образов и ничего из витрины,
    хотя витрина к тому моменту стала 90% содержимого. У мужчин экран выходил
    пустым совсем: из тех 16 образов мужских всего 2, и оба не проходили отсев
    неполных.
    """
    where, binds = _inspiration_filter(None, None)
    assert where == "TRUE", where
    assert binds == {}, binds
    assert "vibe" not in where, where


def test_season_is_derived_from_the_month():
    """Северное полушарие: продукт работает в России."""
    assert _current_season(9) == "autumn" and _current_season(11) == "autumn"
    assert _current_season(12) == "winter" and _current_season(2) == "winter"
    assert _current_season(3) == "spring" and _current_season(6) == "summer"
    # Все двенадцать месяцев обязаны разрешаться — иначе лента упадёт в декабре.
    for m in range(1, 13):
        assert _current_season(m) in ("winter", "spring", "summer", "autumn"), m


def test_all_tab_puts_current_season_first():
    """В сентябре наверху осеннее, а пуховики — в самом низу.

    Порядок рангов: текущий сезон, потом образы без сезона (страновые кружки —
    они про эстетику, а не про погоду), потом соседний сезон, потом
    противоположный.
    """
    order = _inspiration_order(None, "autumn")
    assert order.startswith("CASE WHEN season = :season THEN 0"), order
    assert "WHEN season IS NULL THEN 1" in order, order
    assert "'summer'" in order and "'winter'" in order, order   # соседние
    assert order.endswith("random()"), order                    # внутри ранга — вперемешку
    # Внутри кружка сезон не применяется: человек сам выбрал раздел.
    assert _inspiration_order("Зима", "autumn") == "created_at DESC"


def test_default_feed_is_shuffled_before_limit():
    """Витрина не должна вытеснять обычные образы за границу LIMIT.

    Раньше от этого защищал сам фильтр (vibe IS NULL). Теперь, когда «Все»
    грузит всё, защита держится только на порядке: у витрины created_at =
    момент посева, она всегда свежее, и при сортировке по дате в выборку попала
    бы одна витрина.
    """
    assert _inspiration_order(None) == "random()"
    assert _inspiration_order("Япония") == "created_at DESC"


def test_vibe_selects_only_that_circle():
    where, binds = _inspiration_filter(None, "Япония")
    assert where == "vibe = :vibe", where
    assert binds == {"vibe": "Япония"}, binds
    # Главное: выбранный кружок НЕ добавляет обычные образы к витрине.
    assert "IS NULL" not in where, where
    assert where == "vibe = :vibe", where


def test_gender_composes_with_both_modes():
    for vibe in (None, "Япония"):
        where, binds = _inspiration_filter("female", vibe)
        assert "(gender = :g OR gender = 'unisex' OR gender IS NULL)" in where, where
        assert binds["g"] == "female", binds
        # У кружка фильтр витрины идёт первым; во «Всех» его нет вовсе, и
        # остаётся только пол.
        if vibe:
            assert where.startswith("vibe "), where
        else:
            assert where == "(gender = :g OR gender = 'unisex' OR gender IS NULL)", where


def test_empty_vibe_is_treated_as_absent():
    # ?vibe= из строки запроса приходит пустой строкой, а не None — она не должна
    # превращаться в "vibe = ''" и выдавать пустую ленту.
    assert _inspiration_filter(None, "")[0] == "TRUE"


def test_feed_hides_incomplete_outfits():
    """Лента идей показывала образы из одной вещи и такие, что не одевают.

    Замер на проде 2026-09-08: 77 образов, из них 6 с одной-двумя вещами и 12,
    не одевающих человека целиком. Верхнюю одежду не требуем сознательно — её
    нет у 67 из 77, и это почти всегда нормальный летний комплект.
    """
    from app.api.outfits import _is_showable

    def it(ct, name=""):
        return {"clothing_type": ct, "name": name or ct}

    SHOT = "https://s3/modemorphs3/lookbook/123.png"
    full = [it("t-shirt"), it("jeans"), it("sneakers")]
    assert _is_showable(full, SHOT) is True

    # Ровно то, на что жаловались.
    assert _is_showable([], SHOT) is False
    assert _is_showable([it("dress")], SHOT) is False                  # образ из одной вещи
    assert _is_showable([it("dress"), it("shoes")], SHOT) is False     # две вещи — мало
    assert _is_showable([it("t-shirt"), it("sneakers"), it("bag")], SHOT) is False  # нет низа

    # Платье закрывает и верх, и низ — три вещи достаточно.
    assert _is_showable([it("dress"), it("shoes"), it("bag")], SHOT) is True
    # Летний комплект без верхней одежды остаётся в ленте.
    assert _is_showable([it("tank-top"), it("shorts"), it("sandals")], SHOT) is True

    # Без кадра образ в ленту не идёт, каким бы полным он ни был: посев ставит в
    # превью фото первой вещи, и такая карточка выглядит как карточка товара.
    assert _is_showable(full, None) is False
    assert _is_showable(full, "") is False
    assert _is_showable(full, "https://www.sela.ru/shop/products/1.jpg") is False
    assert _is_showable(full, "https://s3/modemorphs3/original/blouse.png") is False
    assert _is_showable(full, "https://s3/modemorphs3/flatlay/1-ab.png") is False
    # Кадры, загруженные руками до появления лукбука, — настоящие.
    assert _is_showable(full, "https://s3/modemorphs3/upload-5MjoYhFg.jpeg") is True


def test_mixed_gender_outfits_are_hidden():
    """Мужчина в женской блузке — брак по составу, а не по ярлыку.

    Жалоба с прода 2026-09-09: «Осень · образ 6» (id 139) показывался как
    мужской, а состоял из женской блузки, женских ботильонов и женских джинсов
    при одной мужской вещи. Правка пола не помогла бы: вещи всё равно из разных
    гардеробов. Замер тогда же: 31 образ из 196 смешивал полы, 13 показывались.
    """
    from app.api.outfits import _is_showable

    SHOT = "https://s3/modemorphs3/lookbook/1.png"

    def it(ct, g=None):
        return {"clothing_type": ct, "name": ct, "gender": g}

    # Тот самый случай: три женские вещи и одна мужская.
    mixed = [it("blouse", "female"), it("jeans", "female"),
             it("boots", "female"), it("pullover", "male")]
    assert _is_showable(mixed, SHOT) is False

    # Однополый образ проходит, каким бы ни был пол.
    assert _is_showable([it("shirt", "male"), it("pants", "male"), it("shoes", "male")], SHOT) is True
    assert _is_showable([it("blouse", "female"), it("jeans", "female"), it("boots", "female")], SHOT) is True

    # Неразмеченные и unisex не считаются противоречием: они годятся обоим.
    assert _is_showable([it("shirt", "male"), it("pants"), it("shoes", "unisex")], SHOT) is True
    assert _is_showable([it("blouse"), it("jeans"), it("boots")], SHOT) is True


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"ok   {name}")
            except AssertionError as e:
                failures += 1
                print(f"FAIL {name}: {e}")
    print("inspiration vibe filter: OK" if not failures else f"{failures} failed")
    sys.exit(1 if failures else 0)
