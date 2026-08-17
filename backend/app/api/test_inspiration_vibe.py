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

from app.api.outfits import _inspiration_filter


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
