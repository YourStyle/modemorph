#!/usr/bin/env python3
"""Tests for the canonical clothing_type/style taxonomy.

Run with pytest, or directly:  python3 ai-service/clip/test_clothing_taxonomy.py

Every fixture in `test_prod_garbage_rows_resolve` is a REAL row from prod
wardrobe_items on 2026-08-13 (raw dump:
test/gauntlet/ours/type-style/raw/r2_garbage_rows.tsv) — this file is the
regression net for the values the recommender was silently dropping.
"""

import hashlib
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from clothing_taxonomy import (  # noqa: E402
    CANONICAL_STYLES,
    CANONICAL_TYPES,
    SLOT_MAP,
    TYPE_ALIASES,
    infer_clothing_type,
    is_accessory,
    normalize_clothing_type,
    normalize_style,
    resolve_clothing_type,
    slot_of,
)

_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO = os.path.abspath(os.path.join(_HERE, "..", ".."))


def _sha(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def test_copies_are_byte_identical():
    """backend/ and ai-service/ are separate Docker contexts — see module docstring."""
    a = os.path.join(_REPO, "backend", "clothing_taxonomy.py")
    b = os.path.join(_REPO, "ai-service", "clip", "clothing_taxonomy.py")
    assert _sha(a) == _sha(b), (
        "clothing_taxonomy.py copies diverged; "
        "run: cp backend/clothing_taxonomy.py ai-service/clip/clothing_taxonomy.py"
    )


def test_vocabulary_is_self_consistent():
    assert CANONICAL_TYPES == frozenset(SLOT_MAP)
    # every alias points at a real slug, and no alias shadows one
    for old, new in TYPE_ALIASES.items():
        assert new in CANONICAL_TYPES, f"alias {old} -> unknown slug {new}"
        assert old not in CANONICAL_TYPES, f"alias {old} shadows a canonical slug"
    assert set(SLOT_MAP.values()) == {
        "top", "layer", "dress", "bottom", "set", "outerwear", "shoes"}


def test_typo_aliases_still_resolve():
    """346 wardrobe_items + 18 wardrobe_user_items + 2 basic rows still say
    'lonsleeve' in prod. Reads must keep working before/without the rewrite."""
    assert normalize_clothing_type("lonsleeve") == "longsleeve"
    assert normalize_clothing_type("longsleeve") == "longsleeve"
    assert normalize_clothing_type("hoddie") == "hoodie"
    assert normalize_clothing_type("fur-coat-dark-brown") == "fur-coat"
    assert slot_of("lonsleeve") == "top"
    assert slot_of("longsleeve") == "top"


def test_column_default_is_not_a_garment_type():
    """'верхняя' is the DB DEFAULT (001_schema.sql), not the outerwear slug.

    Mapping it to 'coat' would invent markup for 43 user items + 9 capsule items
    + 13 catalogue rows whose real types span every slot.
    """
    for v in ("верхняя", "нижняя", "аксессуар", "", "  ", "nan", None):
        assert normalize_clothing_type(v) is None, v
    # ...but the name still rescues it
    assert resolve_clothing_type("верхняя", "куртка на молнии") == "jacket"
    assert resolve_clothing_type("верхняя", "Лоферы") == "shoes"
    assert resolve_clothing_type("верхняя", "Сандали") == "sandals"


def test_classic_is_a_real_slug_not_garbage():
    """All 30 prod rows carrying 'classic' are комплекты — it is the set slot."""
    assert normalize_clothing_type("classic") == "classic"
    assert slot_of("classic") == "set"
    assert infer_clothing_type("Комплект из футболки и шорт для мальчиков") == "classic"
    assert infer_clothing_type("Трикотажный комплект из футболки и шорт") == "knitted-suit"


def test_prod_garbage_rows_resolve():
    """Real (id, stored_value, item_name) triples from prod, 2026-08-13."""
    cases = [
        # stored value, item name, expected slug
        ("обувь", "ботильоны", "boots"),
        ("аксессуар", "туфли мюли", "shoes"),
        ("аксессуар", "мюли", "shoes"),
        ("аксессуар", "шлепанцы", "sandals"),
        ("аксессуар", "босоножки на каблуке с ремешками", "sandals"),
        ("аксессуар", "кроссовки", "sneakers"),
        ("верхняя", "Сандали", "sandals"),
        ("верхняя", "Лоферы", "shoes"),
        ("верхняя", "Мюли", "shoes"),
        ("верхняя", "кеды", "sneakers"),
        ("верхняя", "балетки", "shoes"),
        ("верхняя", "upper_hoddie_grey-with-a-zipper", "hoodie"),
        (None, "Босоножки", "sandals"),
        (None, "Балетки", "shoes"),
        (None, "туфли-лодочки с острым носком", "shoes"),
        (None, "кроссовки для бега", "sneakers"),
        (None, "Ботильоны на низком каблуке демисезонные", "boots"),
        (None, "Сапоги лакированные на маленьком каблуке", "boots"),
        (None, "Ветровка оверсайз короткая без капюшона на кулиске", "jacket"),
        (None, "Полупальто весна-осень оверсайз", "coat"),
        (None, "Тренч укороченный женский плащ", "coat"),
        (None, "Топ шелковый с кружевом", "tank-top"),
        (None, " Джинсы Straight fit с высокой посадкой", "jeans"),
        (None, "Джинсы мом с высокой посадкой", "jeans"),
        (None, "Водолазка с горлом тонкая с длинным рукавом", "turtleneck"),
        (None, "Юбка", "skirt"),
    ]
    bad = [(v, n, resolve_clothing_type(v, n), e)
           for v, n, e in cases if resolve_clothing_type(v, n) != e]
    assert not bad, bad


def test_accessories_are_reported_not_invented():
    """No slot exists for these — resolve must stay None and is_accessory True."""
    for name in ("Сумка мини", "Плетеная сумка из замши", "Солнцезащитные очки",
                 "Очки имиджевые", "Ремень", "Жемчужное ожерелье", "Серьги",
                 "Клатч", "Платок", "бейсболка", "золотое ожерелье",
                 "бралетт на бретелях", "Сумка тоут кожаная большая на плечо"):
        assert resolve_clothing_type(None, name) is None, name
        assert is_accessory(name) is True, name
    # a garment that merely mentions an accessory word is still a garment
    assert is_accessory("Платье с поясом") is False
    assert resolve_clothing_type(None, "Платье с поясом") == "dress"
    assert is_accessory("Сумка-кроссбоди") is True


def test_name_rules_do_not_swallow_each_other():
    assert infer_clothing_type("полосатая рубашка") == "shirt"          # not поло
    assert infer_clothing_type("свитер с воротником-поло") == "pullover"
    assert infer_clothing_type("кроссбоди сумка") is None               # not боди
    assert infer_clothing_type("джинсовая юбка") == "skirt"             # not jeans
    assert infer_clothing_type("спортивные брюки") == "sporty-pants"    # not pants
    assert infer_clothing_type("спортивный костюм") == "tracksuit"      # not classic
    # «Пуховая парка» is a parka, not a puffer: ЦУМ files item 1000009630
    # ("Пуховая парка Woolrich") under «Мужские парки» — truth_cum_45.json.
    assert infer_clothing_type("Пуховая парка") == "parka"
    assert infer_clothing_type("Пуховик длинный") == "puffer-jacket"
    # «джинсовая» as an adjective must not turn the garment into jeans
    assert infer_clothing_type("Блузка джинсовая") == "blouse"
    assert infer_clothing_type("Джинсы мом с высокой посадкой") == "jeans"
    # 'куртка' was deliberately left unknown until the `jacket` slug existed
    # (1752 catalogue rows lay as puffer-jacket/coat). Now it has one answer,
    # and the SPECIFIC outerwear rules must still beat it.
    assert infer_clothing_type("куртка") == "jacket"
    assert infer_clothing_type("Пуховая куртка") == "puffer-jacket"
    assert infer_clothing_type("Куртка джинсовая") == "jacket"
    assert infer_clothing_type("Suit jacket") == "suit-jacket"   # пиджак, not куртка
    assert infer_clothing_type("куртка-безрукавка") == "vest"    # жилет, not куртка


def test_style_default_is_dropped_but_real_classification_is_kept():
    """'Casual' (capital C) is the importer default on 22193/22418 rows;
    'casual' (lower) is a CLIP classification. cron.py already distinguishes them."""
    assert normalize_style("Casual") is None
    assert normalize_style("casual") == "casual"
    assert normalize_style("широкие штанины") is None
    assert normalize_style("прямоугольная оправа") is None
    assert normalize_style("nan") is None
    assert normalize_style("") is None
    assert normalize_style("классический") == "classic"
    assert normalize_style("Classic") == "classic"
    assert normalize_style("minimalist") == "minimalist"
    # the canonical enum is exactly ai-service/clip/classifier.py STYLES
    assert len(CANONICAL_STYLES) == 12


def test_jacket_and_jumpsuit_slugs():
    """The two slugs added 2026-08-13. See the JACKET / JUMPSUIT note in
    clothing_taxonomy.py for the prod census that motivated them."""
    assert SLOT_MAP["jacket"] == "outerwear"
    assert SLOT_MAP["jumpsuit"] == "dress"
    for name in ("Куртка", "Утепленная куртка", "Бомбер", "Шерстяной бомбер",
                 "Ветровка", "Косуха кожаная", "Джинсовка", "Анорак",
                 "Bomber jacket", "Denim jacket", "Windbreaker", "Leather jacket"):
        assert infer_clothing_type(name) == "jacket", name
    for name in ("Комбинезон", "Джинсовый комбинезон", "Полукомбинезон",
                 "Jumpsuit", "Overalls", "Romper", "Комбинезон утепленный"):
        assert infer_clothing_type(name) == "jumpsuit", name
    # spelling variants stored by other producers resolve to the new slugs
    assert normalize_clothing_type("jacket") == "jacket"
    assert normalize_clothing_type("windbreaker") == "jacket"
    assert normalize_clothing_type("bomber") == "jacket"
    assert normalize_clothing_type("romper") == "jumpsuit"
    assert slot_of("jacket") == "outerwear"
    assert slot_of("jumpsuit") == "dress"
    # a Russian clothing_type saved by components/edit-wardrobe-item-sheet.tsx
    assert resolve_clothing_type("Куртка", None) == "jacket"
    assert resolve_clothing_type("Комбинезон", None) == "jumpsuit"
    assert resolve_clothing_type("Ветровка", None) == "jacket"


def test_weather_ranges_cover_every_canonical_garment():
    """A slug with no TEMP_RANGES entry falls through to the name keywords, which
    is how a denim jacket filed as puffer-jacket got hidden above +10 °C."""
    sys.path.insert(0, os.path.join(_REPO, "backend"))
    from app.services.weather_rules import TEMP_RANGES  # noqa: E402
    missing = sorted(t for t in CANONICAL_TYPES
                     if SLOT_MAP[t] != "shoes" and t not in TEMP_RANGES)
    assert not missing, f"no temperature band for {missing}"
    assert TEMP_RANGES["jacket"] == (0, 20)
    # the whole point: a jacket must not inherit a puffer's or a coat's band
    assert TEMP_RANGES["jacket"] != TEMP_RANGES["puffer-jacket"]
    assert TEMP_RANGES["jacket"] != TEMP_RANGES["coat"]


def test_classifier_types_match_canonical_vocabulary():
    """The CLIP zero-shot vocabulary used to be a fourth, private word list
    ('sweater', 'suit', 'blazer', 'sportswear') that shared no string with the
    slugs, so no CLIP answer could ever become an outfit slot."""
    path = os.path.join(_REPO, "ai-service", "clip", "classifier.py")
    with open(path, encoding="utf-8") as f:
        src = f.read()
    block = src.split("CLOTHING_TYPE_PROMPTS: dict[str, str] = {", 1)[1].split("\n}", 1)[0]
    keys = set(re.findall(r'^\s*"([^"]+)":', block, re.M))
    assert keys == set(CANONICAL_TYPES), keys ^ set(CANONICAL_TYPES)
    non_block = src.split("NON_GARMENT_PROMPTS: dict[str, str] = {", 1)[1].split("\n}", 1)[0]
    non_keys = set(re.findall(r'^\s*"([^"]+)":', non_block, re.M))
    assert not (non_keys & set(CANONICAL_TYPES)), non_keys & set(CANONICAL_TYPES)


def test_frontend_mirror_has_every_slug():
    """lib/clothing-types.ts and lib/labels.ts must name all 32 slugs, or the UI
    shows a raw English slug to the user."""
    for rel, marker in (("lib/clothing-types.ts", "export const clothingTypes = {"),
                        ("lib/labels.ts", "export const CLOTHING_TYPE_LABELS: Record<string, string> = {")):
        with open(os.path.join(_REPO, rel), encoding="utf-8") as f:
            src = f.read()
        block = src.split(marker, 1)[1].split("\n}", 1)[0]
        keys = set(re.findall(r'^\s*"?([a-z][a-z-]*)"?:', block, re.M))
        missing = sorted(set(CANONICAL_TYPES) - keys)
        assert not missing, f"{rel} is missing {missing}"


def test_classifier_styles_match_canonical_vocabulary():
    """Guards the CLIP labels ↔ taxonomy ↔ lib/labels.ts contract."""
    path = os.path.join(_REPO, "ai-service", "clip", "classifier.py")
    with open(path, encoding="utf-8") as f:
        src = f.read()
    block = src.split("STYLES = [", 1)[1].split("]", 1)[0]
    styles = {s.strip().strip('",\'') for s in block.split(",") if s.strip()}
    assert styles == set(CANONICAL_STYLES), styles ^ set(CANONICAL_STYLES)


if __name__ == "__main__":
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"ok   {name}")
            except AssertionError as e:
                fails += 1
                print(f"FAIL {name}: {e}")
    print(f"\n{fails} failure(s)")
    sys.exit(1 if fails else 0)
