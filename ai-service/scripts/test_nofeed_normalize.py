#!/usr/bin/env python3
"""Regression tests for nofeed_normalize.

Every case below is a value the round-1 review found in the generated proposal
(test/gauntlet/bar/no-feed-items-verdict.md §4) — junk that reached the SQL
because the sanitizers were blocklists of wording already seen.

Run: python3 ai-service/scripts/test_nofeed_normalize.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nofeed_normalize import (  # noqa: E402
    color_shade, normalize_clothing_type, normalize_color, normalize_material,
)

FAILURES = []


def eq(got, want, label):
    if got != want:
        FAILURES.append(f"{label}: got {got!r}, want {want!r}")


# --- 1. `льн` matched inside ordinary words -------------------------------
# verdict §4.1: normalize_material("социальные сети") == "лен"; 9 rows got
# material='лен' from the site footer, 49 of 97 'лен' rows had no flax word.
for junk in ("социальные сети",
             "официальный магазин",
             "ами социальные сети Telegram VK Яндекс Дзен 8 (800) 511-80-29",
             "натуральные материалы официальный магазин"):
    eq(normalize_material(junk), None, f"footer text {junk[:24]!r} is not a fibre")

# real flax must still resolve
eq(normalize_material("100% лен"), "лен", "100% лен")
eq(normalize_material("льняная ткань"), "лен", "льняная ткань")
eq(normalize_material("55% лён, 45% вискоза"), "лен", "лён leads")

# --- 2. sole / non-garment composition -------------------------------------
# verdict §4.2: id 274 took 'ацетат' from "этиленвинилацетат 100% подошва".
eq(normalize_material("этиленвинилацетат 100% подошва"), None, "sole is not fabric")
eq(normalize_material("верх 100% кожа; подошва 100% резина"), "кожа", "upper wins")
eq(normalize_material("100% ацетат"), "ацетат", "real acetate still works")

# --- 3. shade sanitizer was a blocklist ------------------------------------
# verdict §4.3: 'а купить', 'очным принтом', 'молочный таблица',
# 'оранжевый единый', 'цвет черный', 'черный на' all survived into tier A.
for junk in ("а купить", "очным принтом", "молочный таблица",
             "оранжевый единый", "цвет черный", "черный на"):
    eq(color_shade(junk), None, f"shade {junk!r} is not a colour")

for good in ("графитовый", "тёмно-синий", "молочный", "серо-бежевый"):
    eq(color_shade(good), good.lower(), f"shade {good!r} kept")

# --- 4. composition parsing regressions ------------------------------------
eq(normalize_material("75%хлопок, 22%полиамид, 3%эластан"), "хлопок", "cotton leads")
eq(normalize_material("50% шерсть, 50% лавсан"), "шерсть", "wool over lavsan")
eq(normalize_material("95% эластан"), "эластан", "elastane only -> elastane")
eq(normalize_material("Satin"), None, "English marketing word is not a fibre")

# --- 5. colour ------------------------------------------------------------
eq(normalize_color("#808080"), None, "hex is not a colour name")
eq(normalize_color("серо-бежевый"), "Бежевый", "compound head noun")

# --- 6. clothing_type stays inside the canonical vocabulary ----------------
eq(normalize_clothing_type("Брюки и джинсы"), "pants", "compound category")
eq(normalize_clothing_type("swimsuit"), None, "no slug -> gap, not junk")
eq(normalize_clothing_type("lonsleeve"), "longsleeve", "typo resolves to canonical")

# --- 7. a card filed under both departments is unisex, not a coin toss ------
from nofeed_normalize import normalize_gender  # noqa: E402

eq(normalize_gender("Женское Мужское"), "unisex", "both departments -> unisex")
eq(normalize_gender("Женское"), "female", "female department")
eq(normalize_gender("Мужское"), "male", "male department")
eq(normalize_gender("унисекс"), "unisex", "explicit unisex")

if FAILURES:
    print("FAIL (%d)" % len(FAILURES))
    for f in FAILURES:
        print("  -", f)
    raise SystemExit(1)
print("ok — all nofeed_normalize regression cases pass")
