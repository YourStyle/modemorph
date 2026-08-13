#!/usr/bin/env python3
"""Tests for feed_params.py — the shared YML <param>/category markup reader.

Run standalone (no pytest needed):   python3 ai-service/scripts/test_feed_params.py
Or under pytest:                     pytest ai-service/scripts/test_feed_params.py

The first test is the important one: backend/ and ai-service/ are separate Docker
build contexts, so feed_params.py exists twice and nothing but this assertion stops
the two copies from drifting.
"""

from __future__ import annotations

import hashlib
import os
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

from feed_params import (  # noqa: E402
    build_markup_index,
    canon_color,
    clean_material,
    color_from_url,
    dominant_fiber,
    full_color,
    hue_family,
    markup_from_offer,
    offer_sku,
    read_params,
    resolve_color,
    resolve_gender,
    build_category_index,
    category_chain,
)


def test_the_two_copies_are_byte_identical():
    a = os.path.join(REPO, "ai-service", "scripts", "feed_params.py")
    b = os.path.join(REPO, "backend", "feed_params.py")
    da = hashlib.sha256(open(a, "rb").read()).hexdigest()
    db = hashlib.sha256(open(b, "rb").read()).hexdigest()
    assert da == db, (
        f"feed_params.py copies diverged:\n  {a} {da}\n  {b} {db}\n"
        "cp one over the other — backend/ and ai-service/ cannot import each other."
    )


def test_canon_color_folds_yo_and_case():
    assert canon_color("Чёрный") == "Черный"
    assert canon_color("  тёмно-СИНИЙ ") == "Темно-синий"
    assert canon_color(None) == ""
    assert canon_color("") == ""


def test_hue_family_strips_shade_prefix_and_collapses_synonyms():
    assert hue_family("Темно-синий") == "Синий"
    assert hue_family("Светло-серый") == "Серый"
    assert hue_family("Фуксия") == "Розовый"
    assert hue_family("Молочный") == "Белый"
    assert hue_family("Синий") == "Синий"          # already a family
    assert hue_family("") == ""


def test_color_from_url_reads_the_merchant_slug_through_the_affiliate_redirect():
    affiliate = (
        "https://grfpr.com/g/abc/?erid=x&f_id=26118&ulp=https%3A%2F%2Foutlet.tsum.ru"
        "%2Fproduct%2F6845227-dzhinsy-richard-j-brown-temno-sinii%2F"
    )
    assert color_from_url(affiliate) == "Темно-синий"
    assert color_from_url("https://outlet.tsum.ru/product/1-shapka-bilancioni-seryi-id11590664/") == "Серый"
    assert color_from_url("https://www.sela.ru/eshop/kids/girl/verkhnyaya-odezhda/5802051125_37/") == ""
    assert color_from_url(None) == ""


def test_resolve_color_splits_family_and_shade():
    url = "https://outlet.tsum.ru/product/6845227-dzhinsy-temno-sinii/"
    color, shade, source = resolve_color("Синий", url)
    assert (color, shade, source) == ("Синий", "Темно-синий", "param+slug")
    assert full_color(color, shade) == "Темно-синий"

    # shade is not written when it would only repeat the family
    assert resolve_color("Синий", "https://x/y-1-sinii/") == ("Синий", "", "param+slug")
    # no param: family is derived from the slug
    assert resolve_color(None, "https://x/y-1-fuksiya/") == ("Розовый", "Фуксия", "slug")
    # nothing at all -> nothing invented
    assert resolve_color(None, "https://x/y-1-nosuchcolour/") == ("", "", "none")


def test_clean_material_keeps_the_whole_composition():
    assert clean_material("Вискоза: 78%;  Эластан (Полиуретан): 22%;") == "Вискоза: 78%; Эластан (Полиуретан): 22%"
    assert clean_material("  ") == ""
    assert clean_material("не указан") == ""
    assert clean_material(None) == ""


def test_dominant_fiber_picks_the_largest_share():
    assert dominant_fiber("Шерсть: 90%; Кашемир: 8%; Эластан (Полиуретан): 2%") == "Шерсть"
    assert dominant_fiber("Хлопок: 30%; Полиэстер: 70%") == "Полиэстер"
    assert dominant_fiber("деним") == "Деним"
    assert dominant_fiber("") == ""


def test_dominant_fiber_ignores_lining_sole_and_filling():
    """Every section is 100% inside itself, so max-by-percent used to pick the
    lining on 879 of 5011 multi-part ЦУМ compositions (verdict §5). All strings
    below are verbatim from the feed snapshot."""
    # dash-glued sections
    assert dominant_fiber("Шерсть: 100%; Подкладка-полиэстер: 100%") == "Шерсть"
    assert dominant_fiber("Хлопок: 81%; Лен: 19%; Подкладка-хлопок: 100%") == "Хлопок"
    assert dominant_fiber(
        "Кожа: 90%; Подкладка-мех/овчина/: 100%; Подошва-резина: 100%; "
        "Стелька-мех/овчина/: 100%; Полиамид: 10%"
    ) == "Кожа"
    assert dominant_fiber(
        "Наполнитель-гусиный пух: 90%; Полиэстер: 100%; Подкладка-полиэстер: 100%"
    ) == "Полиэстер"
    # the shell is not always first
    assert dominant_fiber(
        "Подкладка-купро: 59%; Подкладка-шелк: 41%; Отделка-мех/овчина/: 100%; Кожа: 100%"
    ) == "Кожа"
    # nested panel + layer: the collar's LINING is still a lining
    assert dominant_fiber(
        "Воротник-Подкладка-полиэстер: 100%; Мех/песец/: 100%"
    ) == "Мех/песец/"
    # colon-header sections, header applies to the parts that follow it
    assert dominant_fiber(
        "Материал 1: Полиамид: 84%; Эластан: 16%; Покрытие 1: Полиуретан: 100%; "
        "Подкладка 1: Полиэстер: 64%; Наполнитель: Полиэстер: 100%"
    ) == "Полиамид"
    # a panel label is not a fibre name
    assert dominant_fiber("Материал 3-нейлон: 81") == "Нейлон"
    # missing colon before the percentage
    assert dominant_fiber("Кожа: 100%; Подошва-резина-100%") == "Кожа"
    # nothing but non-shell sections -> best of them, never empty
    assert dominant_fiber("Подкладка-полиэстер: 100%; Подошва-резина: 90%") == "Полиэстер"


def test_resolve_gender_prefers_the_category_tree_over_param_pol():
    # the ЦУМ contradiction: param says Унисекс, the tree says girls' clothing
    assert resolve_gender(["Детское", "Одежда для девочек", "Платья"], "Унисекс") == ("female", True, "category:kids-girls")
    assert resolve_gender(["Детское", "Одежда для мальчиков"], "Унисекс")[:2] == ("male", True)
    assert resolve_gender(["Детское", "Аксессуары"], "Женский")[:2] == ("unisex", True)
    assert resolve_gender(["Женское", "Платья"], "Мужской") == ("female", False, "category:root")
    assert resolve_gender(["Мужчинам", "Обувь"], None) == ("male", False, "category:root")
    # roots with no gender of their own fall back to the param
    assert resolve_gender(["Shop-In-Shop", "Сумки"], "Женский") == ("female", False, "param")
    # and when neither says anything, nothing is guessed
    assert resolve_gender([], None) == (None, False, "none")


def _shop(xml: str):
    return ET.fromstring(xml).find("shop")


CUM_LIKE = """
<yml_catalog><shop><name>ЦУМ</name>
 <categories>
  <category id="1">Женское</category>
  <category id="2" parentId="1">Женская одежда</category>
  <category id="3" parentId="2">Платья</category>
 </categories>
 <offers>
  <offer id="900001"><categoryId>3</categoryId>
   <name>Платье из вискозы</name>
   <url>https://grfpr.com/g/a/?ulp=https%3A%2F%2Foutlet.tsum.ru%2Fproduct%2F1-plate-temno-sinii%2F</url>
   <param name="Пол">Женский</param>
   <param name="Цвет">Синий</param>
   <param name="Материал">Вискоза: 78%; Эластан (Полиуретан): 22%;</param>
  </offer>
 </offers>
</shop></yml_catalog>
"""


def test_markup_from_offer_end_to_end():
    shop = _shop(CUM_LIKE)
    names, parents = build_category_index(shop)
    offer = shop.find(".//offer")
    assert category_chain(offer.findtext("categoryId"), names, parents) == ["Женское", "Женская одежда", "Платья"]
    m = markup_from_offer(offer, names, parents)
    assert m["color"] == "Синий"
    assert m["shade"] == "Темно-синий"
    assert m["material"] == "Вискоза: 78%; Эластан (Полиуретан): 22%"
    assert m["gender"] == "female"
    assert m["is_kids"] is False
    assert read_params(offer)["material"].startswith("Вискоза")


def test_offer_sku_matches_what_the_importer_writes_into_notes():
    shop = _shop(CUM_LIKE)
    assert offer_sku(shop.find(".//offer")) == "900001"          # no <model> -> id
    with_model = ET.fromstring('<offer id="1"><model>ART-7</model></offer>')
    assert offer_sku(with_model) == "ART-7"                       # <model> wins


COLLIDING = """
<yml_catalog><shop><name>x</name>
 <categories><category id="1">Женское</category></categories>
 <offers>
  <offer id="1"><categoryId>1</categoryId><model>ART</model><url>https://x/y-1-sinii/</url>
    <param name="Цвет">Синий</param><param name="Материал">Хлопок: 100%</param></offer>
  <offer id="2"><categoryId>1</categoryId><model>ART</model><url>https://x/y-2-sinii/</url>
    <param name="Цвет">Синий</param><param name="Материал">Хлопок: 100%</param></offer>
  <offer id="3"><categoryId>1</categoryId><model>S</model><url>https://x/y-3-chernyi/</url>
    <param name="Цвет">Черный</param></offer>
  <offer id="4"><categoryId>1</categoryId><model>S</model><url>https://x/y-4-belyi/</url>
    <param name="Цвет">Белый</param></offer>
 </offers>
</shop></yml_catalog>
"""


def test_build_markup_index_merges_agreeing_collisions_and_drops_conflicting_ones():
    index, merged, conflicting = build_markup_index(_shop(COLLIDING))
    # 'ART' named two offers that agreed (size variants) -> kept, counted as merged
    assert index["ART"]["color"] == "Синий"
    assert merged == {"ART": 2}
    # 'S' is a size: two garments, two colours -> refused, never silently resolved
    assert "S" not in index
    assert conflicting == {"S": 2}


def test_nothing_is_invented_when_the_feed_is_silent():
    shop = _shop(
        '<yml_catalog><shop><categories><category id="1">Дом</category></categories>'
        '<offers><offer id="7"><categoryId>1</categoryId><url>https://x/y/</url></offer></offers>'
        "</shop></yml_catalog>"
    )
    index, _, _ = build_markup_index(shop)
    m = index["7"]
    assert m["color"] == "" and m["shade"] == "" and m["material"] == ""
    assert m["gender"] is None and m["is_kids"] is False


def main() -> int:
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"  ok   {test.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"  FAIL {test.__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
