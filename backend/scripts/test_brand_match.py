#!/usr/bin/env python3
"""Guards the brand suffix matcher in backend/brand.py.

Audited 2026-08-20: brand became a real column (migration 030). Rows whose SKU no
longer resolves against the live feed get their brand from a longest-suffix match
of item_name against the vendor values observed in the feeds — 3593 of the 15204
prod ЦУМ rows are in that state. A shortest/first match there would file
"Шорты из вискозы Saint Laurent" under "Laurent", a different fashion house, and
that value would then be printed on a partner report.

Run it:  PYTHONPATH=backend python3 backend/scripts/test_brand_match.py

ponytail: plain asserts, no pytest — pytest is not installed and CI runs no tests,
so a framework-dependent check would never execute. Same house style as
backend/app/api/test_admin_gating.py. Collected as test_* too, if pytest lands.

Every item_name below is a verbatim prod row and every vendor below is a verbatim
<vendor> value from the live ЦУМ (feed_id=26118) or ElytS (24625) feed. Nothing
here is invented — a fixture brand that no merchant ships would be testing the
one behaviour this module forbids.
"""

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)                      # backend/scripts -> backfill_brand
sys.path.insert(0, os.path.dirname(_HERE))     # backend        -> brand

from brand import (  # noqa: E402
    BRAND_SOURCE_DICTIONARY,
    BRAND_SOURCE_FEED_VENDOR,
    BRAND_SOURCE_MONOBRAND,
    brand_from_offer,
    build_brand_dictionary,
    match_brand_suffix,
    monobrand_for_source,
    normalize_brand,
)

# Real <vendor> strings. "Laurent" is NOT one of them in the live feeds, so it is
# added explicitly: the longest-match rule is only load-bearing when a shorter
# brand is a suffix of a longer one, and the test has to create that collision on
# purpose rather than hope a feed ships it.
VENDORS = [
    "Saint Laurent", "Laurent",
    "Moschino", "BOSS Orange", "Ten C", "3x1", "7 For All Mankind",
    "Marco Pescarolo", "Philosophy di Lorenzo Serafini", "Isabel Marant Etoile",
    "Etoile", "Opening Ceremony", "Marina Rinaldi Voyage", "Ports 1961",
    "H`D`S`N Baracco", "O’2nd", "Diego Venturino", "St. John", "Aspesi",
    "LACOSTE", "PT Torino", "Oamc", "Paul Andrew", "Rohe",
]
DICT = build_brand_dictionary(VENDORS)


def check(name, expected):
    got = match_brand_suffix(name, DICT)
    assert got == expected, f"{name!r}: expected {expected!r}, got {got!r}"


# --- the headline case: longest suffix wins over a shorter brand ------------
# Both "Laurent" and "Saint Laurent" are in the dictionary. Anything but the
# longer answer is a mislabelled garment.
check("Шорты из вискозы Saint Laurent", "Saint Laurent")
check("Isabel Marant Etoile", "Isabel Marant Etoile")
check("Хлопковая блузка Isabel Marant Etoile", "Isabel Marant Etoile")
# ...and the short one still resolves when it stands alone.
check("Платье Etoile", "Etoile")

# --- the REAL collision surface, and what happens when a house is delisted ---
# The pair above ("Saint Laurent"/"Laurent") is synthetic. Measured over the 388
# <vendor> strings of the live ЦУМ feed, exactly TWO pairs have one vendor as a
# word-boundary suffix of another, and both are a sub-brand under its parent:
#   Ralph Lauren        <- Polo Ralph Lauren
#   Bond-eye Australia  <- Bound by bond-eye Australia
# (test/gauntlet/ours/brand/MEASUREMENT.json, collision_surface). That is the
# entire mechanism by which this matcher can name the wrong house, so it is
# pinned here rather than left to a comment.
COLLIDING = build_brand_dictionary(
    ["Ralph Lauren", "Polo Ralph Lauren", "Bond-eye Australia", "Bound by bond-eye Australia"]
)
assert match_brand_suffix("Хлопковые брюки Polo Ralph Lauren", COLLIDING) == "Polo Ralph Lauren"
assert match_brand_suffix("Кашемировая водолазка Ralph Lauren", COLLIDING) == "Ralph Lauren"
assert match_brand_suffix("Бра-топ Bound by bond-eye Australia", COLLIDING) == "Bound by bond-eye Australia"

# And the delisted case: the sub-brand leaves the feed, so it leaves the
# dictionary, and the name now resolves to the PARENT house. This is a wrong
# answer and it is the only kind of wrong answer measured: leave-one-house-out
# over 8910 merchant-labelled offers produced 8898 silences and 12 of exactly
# this shape, 0.13%. It is asserted, not lamented — if a future change makes the
# matcher fail closed here instead, that is an improvement and this line is the
# place that says so out loud.
_DELISTED = build_brand_dictionary(["Ralph Lauren", "Bond-eye Australia"])
assert match_brand_suffix("Хлопковые брюки Polo Ralph Lauren", _DELISTED) == "Ralph Lauren"
# The reverse — a house whose name does not end in a surviving vendor — is
# silent, which is why the 12 are 12 and not 8910.
assert match_brand_suffix("Шорты из вискозы Saint Laurent", _DELISTED) is None

# --- verbatim prod item_name values ----------------------------------------
check("Брюки из шерсти и кашемира Marco Pescarolo", "Marco Pescarolo")
check("Хлопковая футболка Ten C", "Ten C")           # two chars + a space, still real
check("Джинсы 3x1", "3x1")                            # shortest real vendor: 3 chars
check("Бомбер BOSS Orange", "BOSS Orange")
check("Джинсы Slimmy tapered 7 For All Mankind", "7 For All Mankind")
check("Хлопковая блузка Philosophy di Lorenzo Serafini", "Philosophy di Lorenzo Serafini")
check("Платье из вискозы и шелка Ports 1961", "Ports 1961")
check("Хлопковое платье Marina Rinaldi Voyage", "Marina Rinaldi Voyage")
check("Брюки Opening Ceremony", "Opening Ceremony")
check("Замшевые лоферы Ernest H`D`S`N Baracco", "H`D`S`N Baracco")
check("Кожаные туфли Needle Paul Andrew", "Paul Andrew")

# --- must NOT match: silence is the correct answer -------------------------
# Verbatim SELA / LOVE REPUBLIC / gate31 names. The dictionary is built from ЦУМ
# and ElytS vendors and fires 0 times on all 7469 of those prod rows; if a change
# makes it start guessing there, these break.
check("Платье", None)
check("Боди с длинными рукавами", None)
check("Вязаные мини-шорты из линейки SELA Young", None)
check("Объемные джинсы с кокеткой", None)
check("Бомбер Севилья", None)
check("Рубашка Бланш с высоким воротником", None)
check("Открытые туфли с овальным мысом черного цвета", None)
check("", None)
check(None, None)

# Brand present but not at the end -> no answer. Lacoste names read "Мужская
# рубашка Lacoste из льна"; that row gets its brand from the monobrand constant,
# not from a mid-string guess that would also fire on ordinary Russian words.
check("Мужская рубашка Lacoste из льна приталенного кроя", None)

# A word merely ENDING in a brand is not that brand. "Rohe" is a real ЦУМ vendor;
# the product name here is SYNTHETIC, and deliberately so — measured over all
# 24355 prod rows, dropping the word-boundary rule changes 0 answers today, so
# there is no real name to quote. The case is kept because the first feed that
# ships one must fail closed instead of inventing a house.
check("Пальто Wardrohe", None)

# --- normalization ---------------------------------------------------------
# Apostrophe spelling and case must not decide whether a row gets a brand.
check("Хлопковое худи moschino", "Moschino")
check("Платье из вискозы O'2nd", "O’2nd")
check("Платье из вискозы O`2nd", "O’2nd")
check("Куртка   Aspesi  ", "Aspesi")
check("Пальто Aspesi.", "Aspesi")
assert normalize_brand("  LACOSTE ") == normalize_brand("Lacoste")

# Different spellings of one house collapse to one dictionary entry, so the
# per-brand counts on a brand page cannot be split across "LACOSTE"/"Lacoste".
assert len(build_brand_dictionary(["LACOSTE", "Lacoste", "lacoste"])) == 1

# 1-2 character vendors never enter the dictionary: nothing real is that short
# and the tail of any word would match.
assert build_brand_dictionary(["A", "Y`s", ""]) == {"y's": "Y`s"}

# --- provenance ------------------------------------------------------------
assert brand_from_offer("Moschino", "ЦУМ") == ("Moschino", BRAND_SOURCE_FEED_VENDOR)
assert brand_from_offer("  Aspesi  ", "ЦУМ") == ("Aspesi", BRAND_SOURCE_FEED_VENDOR)
assert brand_from_offer("", "SELA") == ("SELA", BRAND_SOURCE_MONOBRAND)
assert brand_from_offer(None, "Интернет-магазин Lacoste") == ("Lacoste", BRAND_SOURCE_MONOBRAND)
assert brand_from_offer("", "LOVE REPUBLIC") == ("LOVE REPUBLIC", BRAND_SOURCE_MONOBRAND)
assert brand_from_offer("", "2moodstore") == ("2MOOD", BRAND_SOURCE_MONOBRAND)
# A vendor-less offer from a MULTI-brand retailer stays unknown. Returning "ЦУМ"
# here is the original bug.
assert brand_from_offer("", "ЦУМ") == (None, None)
assert brand_from_offer("", "ElytS") == (None, None)
assert brand_from_offer("", "Unknown") == (None, None)
assert monobrand_for_source("ЦУМ") is None
# The feed outranks the constant: a monobrand retailer that starts carrying a
# second house is right, and our table is stale.
assert brand_from_offer("Lacoste Live", "SELA") == ("Lacoste Live", BRAND_SOURCE_FEED_VENDOR)
# The three strings are a wire format: they land in wardrobe_items.brand_source
# and analytics filters on them. Renaming one silently reclassifies the catalog.
assert (BRAND_SOURCE_FEED_VENDOR, BRAND_SOURCE_MONOBRAND, BRAND_SOURCE_DICTIONARY) == (
    "feed_vendor", "monobrand", "dictionary")


# ---------------------------------------------------------------------------
# The backfill's pure pieces: feed indexing and the precedence rules.
# Imported here rather than in a second file because they are the same
# invariant — "never write a brand nobody named". backfill_brand keeps httpx and
# the DB session behind lazy imports, so this stays dependency-free.
# ---------------------------------------------------------------------------
from backfill_brand import (  # noqa: E402
    MAX_KEY_AMBIGUITY,
    MIN_FEED_VENDOR_SHARE,
    MIN_KEY_CARDINALITY,
    MIN_SOURCE_COVERAGE,
    check_coverage,
    index_feed,
    plan_updates,
    required_feed_sources,
)

# Shaped exactly like the live feeds: ЦУМ has no <model> (SKU is the id
# attribute), ElytS puts a COLOUR in <model> and the real code in <vendorCode>.
FEED_XML = """<?xml version="1.0" encoding="utf-8"?>
<yml_catalog><shop><name>ЦУМ</name><offers>
  <offer id="13516343" group_id="777"><name>Свитшот Tee Library</name><vendor>Tee Library</vendor></offer>
  <offer id="13442050" group_id="777"><name>Пуховик Tatras</name><vendor>Tatras</vendor></offer>
  <offer id="28500"><model>Голубой</model><vendorCode>65968</vendorCode>
    <name>Платье FLAVIO CASTELLANI</name><vendor>FLAVIO CASTELLANI</vendor></offer>
  <offer id="207065"><model>Голубой</model><vendorCode>94439</vendorCode>
    <name>Платье LUISA SPAGNOLI</name><vendor>LUISA SPAGNOLI</vendor></offer>
  <offer id="900001"><name>Футболка без марки</name></offer>
</offers></shop></yml_catalog>"""

index, vendors, dropped, rejected = index_feed(FEED_XML.encode("utf-8"))
# The id attribute is the join key — ЦУМ ships no <model> at all.
assert index["13516343"] == "Tee Library", index
assert index["13442050"] == "Tatras"
# <vendorCode> joins; a <model> that is a colour does NOT — and it is the TYPE
# that is thrown out, not the individual colour (see the ElytS block below).
assert index["65968"] == "FLAVIO CASTELLANI"
assert "Голубой" not in index, "colour-as-model must not resolve to a brand"
assert "model" in rejected and "id" not in rejected and "vendorCode" not in rejected, rejected
assert dropped == 0  # <model> never reaches the per-key pass any more
# group_id is never indexed: on the live ЦУМ feed it bought 29 extra joins and
# 25 of them named the wrong house.
assert "777" not in index
# An offer with no <vendor> contributes no key and no dictionary entry.
assert "900001" not in index
assert len(vendors) == 5 and vendors.count("") == 1

FEED_INDEX = {"ЦУМ": index}
DICTS = {"ЦУМ": build_brand_dictionary(vendors)}

rows = [
    # 1. SKU joins -> the feed's own vendor wins.
    {"id": 1, "notes": "ЦУМ:13442050", "item_name": "Пуховик Tatras", "brand": None, "brand_source": None},
    # 2. SKU is gone from the feed -> suffix match, marked as inferred.
    {"id": 2, "notes": "ЦУМ:99999999", "item_name": "Свитшот Tee Library", "brand": None, "brand_source": None},
    # 3. No feed at all + no monobrand constant -> stays NULL. gate31 lives here.
    {"id": 3, "notes": "Unknown:1151459841", "item_name": "Бомбер Севилья", "brand": None, "brand_source": None},
    # 4. Monobrand retailer, no feed pulled -> the constant.
    {"id": 4, "notes": "SELA:SL6810010225", "item_name": "Объемные джинсы", "brand": None, "brand_source": None},
    # 5. Already has a real brand -> untouched, so reruns are no-ops.
    {"id": 5, "notes": "ЦУМ:13442050", "item_name": "Пуховик Tatras", "brand": "Tatras", "brand_source": "feed_vendor"},
    # 6. The SKU resolves, but the name names a DIFFERENT house -> NULL, not a coin flip.
    {"id": 6, "notes": "ЦУМ:13442050", "item_name": "Свитшот Tee Library", "brand": None, "brand_source": None},
    # 7. A retailer whose dictionary we never built -> no guessing across shops.
    {"id": 7, "notes": "ElytS:1109733", "item_name": "Пуховик Tatras", "brand": None, "brand_source": None},
]
conflicts = []
plan = plan_updates(rows, FEED_INDEX, DICTS, conflicts=conflicts)
assert plan == [
    (1, "Tatras", BRAND_SOURCE_FEED_VENDOR),
    (2, "Tee Library", BRAND_SOURCE_DICTIONARY),
    (4, "SELA", BRAND_SOURCE_MONOBRAND),
], plan
assert [c[0] for c in conflicts] == [6], conflicts

# Rerunning over the applied result changes nothing.
applied = {i: (b, s) for i, b, s in plan}
for r in rows:
    if r["id"] in applied:
        r["brand"], r["brand_source"] = applied[r["id"]]
assert plan_updates(rows, FEED_INDEX, DICTS) == [], "backfill must be idempotent"

# --upgrade re-decides only rows the dictionary guessed, never a feed_vendor one.
rows[1]["notes"] = "ЦУМ:13442050"   # the offer came back into the feed
assert plan_updates(rows, FEED_INDEX, DICTS) == []
assert plan_updates(rows, FEED_INDEX, DICTS, upgrade=True, conflicts=[]) == []
# ...and with a name that agrees, the dictionary row is upgraded to feed_vendor.
rows[1]["item_name"] = "Пуховик Tatras"
assert plan_updates(rows, FEED_INDEX, DICTS, upgrade=True) == [
    (2, "Tatras", BRAND_SOURCE_FEED_VENDOR)
]

# ---------------------------------------------------------------------------
# The ElytS case: <model> is a COLOUR, and a colour that happens to be unique
# must still not hand out a merchant-verified brand.
#
# Live feed 24625, measured 2026-08-20: 81616 offers, 25 distinct <model> values,
# every one a colour word. Six colours ("Светло-серый" → AZUR, "Сиреневый" →
# ANNA RACHELE, "темно-фиолетовый" → STEFANO RICCI, ...) are carried by exactly
# one house, and 9 prod ElytS rows store exactly those colours in notes. Before
# the cardinality/ambiguity gate they joined and were written with
# brand_source='feed_vendor' — "the merchant said so" — off a join on the word
# "Светло-серый". The answer happens to be right; the label was a lie, and one
# more AZUR-coloured offer from another house silently breaks the join.
# ---------------------------------------------------------------------------

def _offer(oid, model, code, name, vendor):
    return (f'<offer id="{oid}"><model>{model}</model><vendorCode>{code}</vendorCode>'
            f'<name>{name}</name><vendor>{vendor}</vendor></offer>')


# 60 offers sharing one colour across 60 houses, plus the one colour that is
# unique to AZUR — the shape that produced the 9 bad rows.
_elyts_offers = [
    _offer(1100000 + i, "Черный", f"VC{i}", f"Платье HOUSE {i}", f"HOUSE {i}")
    for i in range(60)
]
_elyts_offers.append(_offer(
    1109999, "Светло-серый", "VC-AZUR",
    "Безрукавка с декоративным элементом на спине AZUR", "AZUR"))
ELYTS_XML = ("<?xml version=\"1.0\" encoding=\"utf-8\"?><yml_catalog><shop>"
             "<name>ElytS</name><offers>" + "".join(_elyts_offers) +
             "</offers></shop></yml_catalog>")

e_index, e_vendors, _e_dropped, e_rejected = index_feed(ELYTS_XML.encode("utf-8"))
assert "model" in e_rejected, e_rejected
assert "Светло-серый" not in e_index, "a unique COLOUR is still not an identifier"
assert "Черный" not in e_index
# The real identifiers on the same feed keep working — the gate rejects the type,
# it does not disarm the join.
assert e_index["1109999"] == "AZUR"
assert e_index["VC-AZUR"] == "AZUR"

# A key type can also fail on cardinality alone, with zero ambiguity: 100 offers
# from one house all tagged "Черный" is one distinct value, never contradictory,
# and still not an identifier. This is the gate the live ElytS feed trips
# (25 values / 81616 offers = 0.0003).
_one_house = "".join(
    _offer(200000 + i, "Черный", f"C{i}", f"Платье AZUR {i}", "AZUR") for i in range(100)
)
_, _, _, one_house_rejected = index_feed(
    ("<yml_catalog><shop><name>x</name><offers>" + _one_house +
     "</offers></shop></yml_catalog>").encode("utf-8"))
assert "model" in one_house_rejected and "vendorCode" not in one_house_rejected, one_house_rejected
assert 0 < MIN_KEY_CARDINALITY < 0.35, "ElytS <vendorCode> measures 0.349 and must survive"
assert 0 < MAX_KEY_AMBIGUITY < 0.76, "ElytS <model> measures 0.76 ambiguous and must not"

# End to end: the prod row whose notes SKU is the colour "Светло-серый" now lands
# as `dictionary` — inferred from the name, which is what the evidence actually
# is — instead of masquerading as merchant data.
elyts_plan = plan_updates(
    [{"id": 8, "notes": "ElytS:Светло-серый", "brand": None, "brand_source": None,
      "item_name": "Безрукавка с декоративным элементом на спине AZUR"},
     {"id": 9, "notes": "ElytS:1109999", "brand": None, "brand_source": None,
      "item_name": "Безрукавка с декоративным элементом на спине AZUR"}],
    {"ElytS": e_index}, {"ElytS": build_brand_dictionary(e_vendors)},
)
assert elyts_plan == [
    (8, "AZUR", BRAND_SOURCE_DICTIONARY),
    (9, "AZUR", BRAND_SOURCE_FEED_VENDOR),
], elyts_plan


# ---------------------------------------------------------------------------
# «Фид не скачался» обязано выглядеть как неудача.
#
# Регрессия, стоившая бы 62% каталога НАВСЕГДА: fetch_feeds ловил любое
# исключение, печатал [warn] и шёл дальше; main() возвращал 0; scripts/backfill.sh
# по нулевому коду ставил ВЕЧНУЮ отметку в schema_migrations, и следующий деплой
# говорил «уже применён». Причём тихо: словарь ЦУМа строится ИЗ ФИДА ЦУМа,
# поэтому без фида пусты ОБА источника, monobrand_for_source('ЦУМ') справедливо
# отдаёт None — и 15204 строки просто не попадают в план. Ни исключения, ни
# пустого плана «с ошибкой» — просто ноль обновлений и красивая таблица.
#
# Ниже воспроизведён ровно этот вход: пустые feed_index и dictionaries.
# ---------------------------------------------------------------------------
FEED_KEYS = {"SELA", "ElytS", "ЦУМ", "2moodstore", "Эконика"}

catalog = [
    {"id": 100, "notes": "ЦУМ:13442050", "item_name": "Пуховик Tatras", "brand": None, "brand_source": None},
    {"id": 101, "notes": "ЦУМ:13516343", "item_name": "Свитшот Tee Library", "brand": None, "brand_source": None},
    {"id": 102, "notes": "SELA:SL68100", "item_name": "Объемные джинсы", "brand": None, "brand_source": None},
    {"id": 103, "notes": "Unknown:115145", "item_name": "Бомбер Севилья", "brand": None, "brand_source": None},
    {"id": 104, "notes": "Интернет-магазин Lacoste:7", "item_name": "Поло", "brand": None, "brand_source": None},
]

# Обязателен только тот магазин, чью марку неоткуда больше взять.
assert required_feed_sources(catalog, FEED_KEYS) == {"ЦУМ"}, required_feed_sources(catalog, FEED_KEYS)
# Эконика зарегистрирована в ADMITAD_FEEDS, но её строк в базе нет -> не обязательна.
assert "Эконика" not in required_feed_sources(catalog, FEED_KEYS)
# Магазин без фида (gate31) не становится обязательным от того, что он без марки.
assert "Unknown" not in required_feed_sources(catalog, FEED_KEYS)
# ElytS — многобрендовый и с фидом: как только его строки появляются, он обязателен.
assert required_feed_sources(
    catalog + [{"id": 105, "notes": "ElytS:1109999", "item_name": "Платье AZUR",
                "brand": None, "brand_source": None}], FEED_KEYS) == {"ЦУМ", "ElytS"}

# Фид ЦУМа не скачался: оба источника пусты.
dead_plan = plan_updates(catalog, {}, {})
# Только монобренд-константы: обе строки ЦУМа (100, 101) молча выпали из плана,
# и никакого исключения при этом не было — вот как выглядел тихий провал.
assert [u[0] for u in dead_plan] == [102, 104], dead_plan
dead_report = check_coverage(catalog, dead_plan, {"ЦУМ"})
assert dead_report == [("ЦУМ", 0, 2, 0.0, 0, 0.0, False)], dead_report
assert not all(r[6] for r in dead_report), "пустой фид обязан валить проверку полноты"

# Живой фид: те же строки закрываются, проверка проходит.
live_plan = plan_updates(catalog, FEED_INDEX, DICTS)
live_report = check_coverage(catalog, live_plan, {"ЦУМ"})
assert live_report == [("ЦУМ", 2, 2, 1.0, 2, 1.0, True)], live_report

# Порог — доля, а не «хоть что-то»: фид, отдавший половину, тоже не проходит.
half = [dict(r) for r in catalog] + [
    {"id": 200 + i, "notes": "ЦУМ:нет-в-фиде", "item_name": "Пальто без марки",
     "brand": None, "brand_source": None} for i in range(8)
]
half_report = check_coverage(half, plan_updates(half, FEED_INDEX, DICTS), {"ЦУМ"})
assert half_report[0][1:4] == (2, 10, 0.2) and half_report[0][6] is False, half_report

# Уже заполненная база проходит проверку и на втором прогоне, когда план пуст:
# полнота считается по ИТОГОВОМУ состоянию, а не по числу изменений. Без этого
# повторный запуск после успешного объявлял бы себя провалившимся.
done = [dict(r, brand="Tatras", brand_source="feed_vendor") if r["id"] in (100, 101) else r
        for r in catalog]
assert check_coverage(done, [], {"ЦУМ"}) == [("ЦУМ", 2, 2, 1.0, 2, 1.0, True)]

# Магазин без строк — 0 из 0 — не делится на ноль и не валит прогон.
assert check_coverage(catalog, [], {"ElytS"}) == [("ElytS", 0, 0, 1.0, 0, 1.0, True)]

# Порог живёт между «фид пропал» (0%) и худшим реальным магазином (ЦУМ, 97.7%).
assert 0.0 < MIN_SOURCE_COVERAGE <= 0.95, "порог должен ловить пустой фид и пропускать 97.7%"


# ---------------------------------------------------------------------------
# «Марка есть» — НЕ «работа сделана». Провенанс проверяется отдельно.
#
# Тихий провал этажом выше: словарь резолвера собирается из <vendor> ТОГО ЖЕ
# фида, поэтому джойн по SKU может отвалиться ЦЕЛИКОМ (мерчант перевыпустил id,
# <vendorCode> занял место id), а фид при этом скачается, словарь соберётся и
# ответит. Замеры 2026-08-20: словарь совпадает с <vendor> на 11569 из 11611
# сджойненных строк ЦУМа и отвечает на 90.1% несджойненных, то есть без единого
# джойна закрывает 11569 + 3239 = 14808 из 15204 = 97.4%. Это ВЫШЕ порога 0.90.
# Прогон отрапортовал бы успех, scripts/backfill.sh поставил бы отметку, и 11620
# строк навсегда читались бы как dictionary — «мы догадались». На дашборде число
# «назвал мерчант» упало бы с 11620 до ~50 без единого сигнала.
#
# Ниже воспроизведён ровно этот вход: фид жив (словарь есть), индекса SKU нет.
# ---------------------------------------------------------------------------
no_join = [
    {"id": 300 + i, "notes": f"ЦУМ:перевыпущенный-id-{i}", "brand": None,
     "brand_source": None, "item_name": "Пуховик Tatras"} for i in range(10)
]
no_join_plan = plan_updates(no_join, {"ЦУМ": {}}, DICTS)
# Словарь отвечает на все 10 — и по старой проверке это было бы 100% «полноты».
assert len(no_join_plan) == 10, no_join_plan
assert {u[2] for u in no_join_plan} == {BRAND_SOURCE_DICTIONARY}, no_join_plan
no_join_report = check_coverage(no_join, no_join_plan, {"ЦУМ"})
assert no_join_report[0][1:4] == (10, 10, 1.0), no_join_report      # марка есть у всех
assert no_join_report[0][4:6] == (0, 0.0), no_join_report           # мерчант не назвал ни одной
assert no_join_report[0][6] is False, "100% словарных марок обязаны валить прогон"

# Тот же набор строк с живым индексом проходит: разница ровно в провенансе.
joined = [dict(r, notes="ЦУМ:13442050") for r in no_join]
joined_report = check_coverage(joined, plan_updates(joined, FEED_INDEX, DICTS), {"ЦУМ"})
assert joined_report[0][4:7] == (10, 1.0, True), joined_report

# Порог провенанса живёт между «джойн умер» (0%) и худшим реальным магазином
# (ElytS 9/39 = 23.1%, ЦУМ 11611/15204 = 76.4%).
assert 0.0 < MIN_FEED_VENDOR_SHARE < 0.231, \
    "порог должен ловить мёртвый джойн и пропускать ElytS (23.1%)"

# monobrand НЕ засчитывается за «сказал мерчант»: это наша константа. У
# обязательного магазина её и быть не может, но подмена одного провенанса другим
# — это ровно тот баг, с которого всё началось, поэтому он зафиксирован тестом.
mono_rows = [{"id": 400, "notes": "ЦУМ:x", "brand": "SELA",
              "brand_source": BRAND_SOURCE_MONOBRAND, "item_name": "Джемпер"}]
assert check_coverage(mono_rows, [], {"ЦУМ"}) == [("ЦУМ", 1, 1, 1.0, 0, 0.0, False)]

# --- собственно код возврата -----------------------------------------------
# _verdict — это та самая функция, на чей результат scripts/backfill.sh ставит
# ВЕЧНУЮ отметку в schema_migrations. Ноль отсюда означает «больше никогда».
from backfill_brand import _verdict  # noqa: E402

# Фид ЦУМа упал -> 1. Раньше этот путь давал 0.
assert _verdict(catalog, dead_plan, {"ЦУМ"}, {"ЦУМ": "ReadTimeout: 300s"}, None) == 1
# Фид ЦУМа НЕ падал (исключения нет), но отдал заглушку -> полнота 0% -> тоже 1.
# Это второй сигнал, и он ловит ровно то, что не ловит первый.
assert _verdict(catalog, dead_plan, {"ЦУМ"}, {}, None) == 1
# Фид жив, словарь ответил на ВСЕ строки, джойн не дал ни одной -> 1.
# Это третье основание, и первые два его не видят: исключения нет (фида нет в
# feed_failures) и полнота 100% (выше 0.90). Раньше этот путь давал 0 и вечную
# отметку в schema_migrations.
assert _verdict(no_join, no_join_plan, {"ЦУМ"}, {}, None) == 1
# Фид, у которого ни один тип ключа не прошёл отсечку на идентификатор,
# приходит сюда как обычная неудача фида (fetch_feeds его туда и кладёт) -> 1.
assert _verdict(no_join, no_join_plan, {"ЦУМ"},
                {"ЦУМ": "ни один тип ключа не годится для джойна: <model> — цвета"},
                None) == 1
# Всё отработало -> 0.
assert _verdict(catalog, live_plan, {"ЦУМ"}, {}, None) == 0
# Упал фид, который никому не был нужен (Эконика не обязательна) -> 0.
assert _verdict(catalog, live_plan, {"ЦУМ"}, {"Эконика": "404"}, None) == 0
# --limit: полнота не проверяется (выборка обрезана), но упавший обязательный
# фид всё равно даёт 1.
assert _verdict(catalog, dead_plan, {"ЦУМ"}, {}, 10) == 0
assert _verdict(catalog, dead_plan, {"ЦУМ"}, {"ЦУМ": "boom"}, 10) == 1
# Обязательных магазинов нет вовсе (--source SELA) -> 0, и без деления на ноль.
assert _verdict(catalog, live_plan, set(), {}, None) == 0

# ---------------------------------------------------------------------------
# Тот же тест «это идентификатор?», но на СТОРОНЕ ЗАПИСИ.
#
# index_feed защищает чтение: не джойнь бренд по цвету. Но SKU, который ложится
# в notes, выбирал parse_yml_feed, и он спрашивал только вызывающего:
# `model or id if sku_prefer_model`. У ElytS <model> — цвет, у 2moodstore —
# размер, и в проде это видно поштучно: 30 из 39 строк ElytS имеют notes вида
# "ElytS:Светло-серый" (×3), "ElytS:Темно-серый" (×3), "ElytS:Бежевый", а все
# 585 строк 2moodstore разложены по 12 значениям source_sku — "35", "37",
# "39,5", "27/32" — на 100 разных url.
#
# Цена: notes — это ключ дедупликации импортёра. 25 разных <model> на 81616
# офферов ElytS означают, что импортёр считает весь фид уже импортированным,
# и 99.95% его недостижимо. Плюс строка с цветом в ключе не может устареть:
# цвет из фида не исчезнет никогда.
# ---------------------------------------------------------------------------
from lib_feed_parser import (  # noqa: E402
    MIN_MODEL_CARDINALITY,
    parse_yml_feed,
)


def _feed(name, offers):
    return ("<?xml version=\"1.0\" encoding=\"utf-8\"?><yml_catalog><shop>"
            f"<name>{name}</name><categories>"
            "<category id=\"1\">Платья</category></categories><offers>"
            + "".join(offers) + "</offers></shop></yml_catalog>")


def _sku_offer(oid, model, name):
    return (f'<offer id="{oid}"><model>{model}</model><categoryId>1</categoryId>'
            f'<name>{name}</name><picture>https://i/{oid}.jpg</picture>'
            f'<url>https://shop/{oid}</url><price>100</price>'
            f'<vendor>HOUSE</vendor></offer>')


# ElytS: 200 офферов, 4 цвета в <model> = 0.02 (живой фид: 25/81616 = 0.0003).
# Порог 0.05 отвергает и то, и другое; SKU становится id.
elyts_feed = _feed("ElytS", [
    _sku_offer(1109700 + i, ["Бежевый", "Светло-серый", "Темно-серый", "Черный"][i % 4],
               f"Платье HOUSE {i}") for i in range(200)
])
parsed_elyts = parse_yml_feed(elyts_feed, source_override="ElytS", sku_prefer_model=True)
assert parsed_elyts["skuKey"] == "id", parsed_elyts["skuKey"]
elyts_skus = [i["source_sku"] for i in parsed_elyts["items"]]
assert elyts_skus and len(set(elyts_skus)) == len(elyts_skus), elyts_skus[:5]
assert "Светло-серый" not in elyts_skus, "цвет не может быть ключом дедупликации"

# 2moodstore: 300 офферов, 6 размеров в <model> = 0.02. Тот же вердикт.
mood_feed = _feed("2moodstore", [
    _sku_offer(500000 + i, ["35", "36", "37", "38", "39,5", "27/32"][i % 6],
               f"Платье {i}") for i in range(300)
])
parsed_mood = parse_yml_feed(mood_feed, source_override="2moodstore", sku_prefer_model=True)
assert parsed_mood["skuKey"] == "id", parsed_mood["skuKey"]
assert "37" not in [i["source_sku"] for i in parsed_mood["items"]]

# SELA: <model> — настоящий артикул. Отсечка не должна его тронуть, иначе 5155
# строк проды перестанут находиться при дедупликации и импортируются заново.
sela_feed = _feed("SELA", [
    _sku_offer(700000 + i, f"SL68080102{i:02d}", f"Джемпер {i}") for i in range(40)
])
parsed_sela = parse_yml_feed(sela_feed, source_override="SELA", sku_prefer_model=True)
assert parsed_sela["skuKey"] == "model", parsed_sela["skuKey"]
assert parsed_sela["items"][0]["source_sku"] == "SL6808010200", parsed_sela["items"][0]

# ЦУМ: тега <model> нет вовсе — ключ и был id, и остаётся id.
cum_feed = _feed("ЦУМ", [
    f'<offer id="{13442050 + i}"><categoryId>1</categoryId><name>Пуховик Tatras</name>'
    f'<picture>https://i/{i}.jpg</picture><url>https://cum/{i}</url><price>100</price>'
    f'<vendor>Tatras</vendor></offer>' for i in range(10)
])
parsed_cum = parse_yml_feed(cum_feed, source_override="ЦУМ", sku_prefer_model=True)
assert parsed_cum["skuKey"] == "id", parsed_cum["skuKey"]
assert parsed_cum["items"][0]["source_sku"] == "13442050"

# Порог живёт между перечислением (ElytS 0.0003, 2moodstore ~0.002) и артикулом
# (SELA 0.88 по проду: 4524 разных SKU на 5155 строк).
assert 0.002 < MIN_MODEL_CARDINALITY < 0.88, \
    "порог должен отвергать цвет/размер и пропускать артикул SELA"

# Просьба вызывающего остаётся просьбой: без sku_prefer_model ключ всегда id.
assert parse_yml_feed(sela_feed, source_override="SELA")["skuKey"] == "id"

# Ручной массовый импортёр (ai-service/scripts/import_catalog.py) пишет тот же
# notes и имеет ту же развилку своей копией — контейнер modemorph-ai не монтирует
# backend/. Разъехавшаяся копия вернула бы цвет в ключ дедупликации молча.
_IMPORTER = os.path.join(os.path.dirname(os.path.dirname(_HERE)),
                         "ai-service", "scripts", "import_catalog.py")
if os.path.exists(_IMPORTER):
    with open(_IMPORTER, encoding="utf-8") as fh:
        _imp_src = fh.read()
    assert f"MIN_MODEL_CARDINALITY = {MIN_MODEL_CARDINALITY}" in _imp_src, \
        "порог в import_catalog.py разошёлся с lib_feed_parser"
    assert "if use_model else offer.get(\"id\", \"\")" in _imp_src, \
        "import_catalog.py снова пишет <model> в SKU безусловно"


# ---------------------------------------------------------------------------
# Проверка на устаревание обязана быть ПЕРМИССИВНОЙ.
#
# Строки, записанные старой схемой ключей, всё ещё живые товары. Строгий набор
# ключей объявил бы 30 строк ElytS и все 585 строк 2moodstore пропавшими из
# фида — 100% при пороге STALE_THRESHOLD_PCT=10, то есть 615 карточек скрылись
# бы за один прогон sync-feeds.
# ---------------------------------------------------------------------------
# Ровно та функция, которую вызывает cron._parse_feed_skus — не копия её логики.
from lib_feed_parser import feed_sku_candidates  # noqa: E402

_stale_set = feed_sku_candidates(elyts_feed.encode("utf-8"))
# Новый ключ (id) в наборе — как и старый (цвет). Ни одна из двух схем не даёт
# ложного «пропал из фида».
assert "1109700" in _stale_set
assert "Светло-серый" in _stale_set, "строка со старым ключом не должна считаться устаревшей"
# Реально исчезнувший оффер не находится ни по одной схеме.
assert "9999999" not in _stale_set

# ---------------------------------------------------------------------------
# Провенанс обязан доживать до промпта.
#
# Четыре сборщика промптов (cron._generate_daily_recommendations,
# recommendations POST, misc.ai_assistant, ai-service generate_recommendations)
# печатали `brand=` одинаково и для «так сказал мерчант», и для «мы догадались
# по названию». Gemini пишет названия разделов и образов, которые ВИДИТ
# пользователь, а ассистент — вообще свободный русский текст. На проде 3239
# строк ЦУМа с догадкой, и ЦУМ — это 213 из 463 настоящих показов. Аккуратное
# разделение жирный/приглушённый на карточке всё это обходит стороной.
# ---------------------------------------------------------------------------
from brand import (  # noqa: E402
    BRAND_GUESS_PROMPT_RULE,
    BRAND_STATED_SOURCES,
    prompt_brand_field,
)

assert prompt_brand_field("Saint Laurent", BRAND_SOURCE_FEED_VENDOR) == ("brand", "Saint Laurent")
assert prompt_brand_field("SELA", BRAND_SOURCE_MONOBRAND) == ("brand", "SELA")
assert prompt_brand_field("Tatras", BRAND_SOURCE_DICTIONARY) == ("brand_guess", "Tatras")
# Нет марки — нет ключа: отсутствующий ключ честнее пустого.
assert prompt_brand_field(None, BRAND_SOURCE_FEED_VENDOR) == (None, None)
assert prompt_brand_field("   ", BRAND_SOURCE_FEED_VENDOR) == (None, None)
# Марка есть, происхождение неизвестно (строки старше миграции 030) -> догадка.
# Умолчание в сторону «мерчант сказал» — это ровно та подмена, из-за которой
# «ЦУМ» ехал в промпт как имя дома.
assert prompt_brand_field("Tatras", None) == ("brand_guess", "Tatras")
assert prompt_brand_field("Tatras", "") == ("brand_guess", "Tatras")
assert prompt_brand_field("Tatras", "что-то новое") == ("brand_guess", "Tatras")
# Правило обязано запрещать печать значения, иначе ключ ничего не меняет.
assert "brand_guess" in BRAND_GUESS_PROMPT_RULE and "НИКОГДА" in BRAND_GUESS_PROMPT_RULE

# Копия правила в modemorph-ai (контейнер не монтирует backend/, импортировать
# оттуда нельзя) обязана совпадать дословно — иначе одна из четырёх точек тихо
# вернётся к старому поведению.
_AI_COPY = os.path.join(os.path.dirname(os.path.dirname(_HERE)),
                        "ai-service", "scripts", "generate_recommendations.py")
if os.path.exists(_AI_COPY):
    with open(_AI_COPY, encoding="utf-8") as fh:
        _ai_src = fh.read()

    def _squash(text):
        """Убирает кавычки и пробелы: копия разбита на строковые литералы,
        и перенос строки в исходнике — это не расхождение."""
        return "".join(text.split()).replace('"', "").replace("'", "")

    assert _squash(BRAND_GUESS_PROMPT_RULE) in _squash(_ai_src), \
        "копия BRAND_GUESS_PROMPT_RULE в generate_recommendations.py разошлась"
    for _src in BRAND_STATED_SOURCES:
        assert f'"{_src}"' in _ai_src, f"копия BRAND_STATED_SOURCES разошлась: {_src}"
    # И сама развилка: догадка обязана ехать под ДРУГИМ ключом.
    assert 'return "brand_guess", value' in _ai_src

if __name__ == "__main__":
    print("brand matcher + backfill planner + SKU key + prompt provenance: "
          "all checks passed")
