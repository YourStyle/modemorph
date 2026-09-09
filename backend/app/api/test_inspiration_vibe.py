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

from app.api.outfits import _gender_filter, _inspiration_filter


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


def test_default_feed_hides_curated():
    where, binds = _inspiration_filter(None, None)
    assert where == "vibe IS NULL", where
    assert binds == {}, binds


def test_vibe_selects_only_that_circle():
    where, binds = _inspiration_filter(None, "Япония")
    assert where == "vibe = :vibe", where
    assert binds == {"vibe": "Япония"}, binds
    # Главное: выбранный кружок НЕ добавляет обычные образы к витрине.
    assert "IS NULL" not in where, where


def test_gender_composes_with_both_modes():
    for vibe in (None, "Япония"):
        where, binds = _inspiration_filter("female", vibe)
        assert "(gender = :g OR gender = 'unisex' OR gender IS NULL)" in where, where
        assert binds["g"] == "female", binds
        assert where.startswith("vibe "), where     # фильтр витрины идёт первым и всегда есть


def test_empty_vibe_is_treated_as_absent():
    # ?vibe= из строки запроса приходит пустой строкой, а не None — она не должна
    # превращаться в "vibe = ''" и выдавать пустую ленту.
    assert _inspiration_filter(None, "")[0] == "vibe IS NULL"


def test_feed_hides_incomplete_outfits():
    """Лента идей показывала образы из одной вещи и такие, что не одевают.

    Замер на проде 2026-09-08: 77 образов, из них 6 с одной-двумя вещами и 12,
    не одевающих человека целиком. Верхнюю одежду не требуем сознательно — её
    нет у 67 из 77, и это почти всегда нормальный летний комплект.
    """
    from app.api.outfits import _is_showable

    def it(ct, name=""):
        return {"clothing_type": ct, "name": name or ct}

    full = [it("t-shirt"), it("jeans"), it("sneakers")]
    assert _is_showable(full) is True

    # Ровно то, на что жаловались.
    assert _is_showable([]) is False
    assert _is_showable([it("dress")]) is False                       # образ из одной вещи
    assert _is_showable([it("dress"), it("shoes")]) is False          # две вещи — мало
    assert _is_showable([it("t-shirt"), it("sneakers"), it("bag")]) is False   # нет низа

    # Платье закрывает и верх, и низ — три вещи достаточно.
    assert _is_showable([it("dress"), it("shoes"), it("bag")]) is True
    # Летний комплект без верхней одежды остаётся в ленте.
    assert _is_showable([it("tank-top"), it("shorts"), it("sandals")]) is True


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
