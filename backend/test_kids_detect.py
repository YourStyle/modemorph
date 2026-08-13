# -*- coding: utf-8 -*-
"""Tests for kids_detect. Every case is a real catalog row or feed offer; the
id / source is in the comment so the claim can be re-checked against prod.

Run with pytest, or standalone: `python3 backend/test_kids_detect.py`.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from kids_detect import detect_kids, is_kids_item, is_kids_name, merchant_url  # noqa: E402


# --------------------------------------------------------------- category tree
def test_cum_kids_root_wins_over_a_neutral_name():
    # prod id 1000001694, ЦУМ:13418927 — name says nothing, feed root does
    v = detect_kids(name="Хлопковое платье Paade Mode",
                    category_chain=["Детское", "Одежда для девочек", "Платья", "Повседневные"])
    assert v.is_kids and v.signal == "category:root"


def test_kids_node_below_an_adult_root():
    v = detect_kids(name="Пуф детский", category_chain=["Дом", "Детская"])
    assert v.is_kids and v.signal.startswith("category:")


def test_adult_chain_is_not_kids():
    v = detect_kids(name="Шелковое платье Kika Vargas",
                    category_chain=["Женское", "Одежда", "Платья"])
    assert not v.is_kids


# ---------------------------------------------------------------- merchant URL
def test_sela_kids_section_in_url():
    # prod id 723 — "Брюки-аладдины из смесового льна", no kids word in the name
    u = ("https://kpwfp.com/g/2d35674743/?erid=x&f_id=24700&ulp=https%3A%2F%2Fwww.sela.ru"
         "%2Feshop%2Fkids%2Fgirl%2Fbryuki-i-legginsy%2Fsl6805041502_70%2F")
    assert merchant_url(u).startswith("https://www.sela.ru/eshop/kids/")
    assert detect_kids(name="Брюки-аладдины из смесового льна", url=u).signal == "url:segment"


def test_sela_baby_section_in_url():
    u = "https://www.sela.ru/eshop/baby/bodi/sl5809000201_37/"
    assert detect_kids(name="Свитшот-боди", url=u).is_kids


def test_adult_url_is_not_kids():
    u = "https://www.sela.ru/eshop/women/futbolki/SL5810210502_60/"
    assert not detect_kids(name="Топ со спущенным плечом", url=u).is_kids


def test_sela_young_line_is_not_kids():
    # /eshop/young/ is SELA's teen-styled adult line; the shop itself files it
    # under "Девушки", a root of its own, next to "Дети" — checked on the page
    # (r2/raw/gold_labelled.json, stratum E_sela_young, 8/8 non-kids)
    u = "https://www.sela.ru/eshop/young/tops/SL5810210502_60/"
    assert not detect_kids(name="Топ со спущенным плечом из линейки SELA Young", url=u).is_kids


# ----------------------------------------------------------------------- names
def test_brand_suffix_kids_and_junior():
    assert is_kids_name("Хлопковое платье MSGM kids")
    assert is_kids_name("Хлопковый топ Trussardi junior")
    assert is_kids_name("Пуховик Yves Salomon Enfant")


def test_russian_stems():
    for n in ("Вязаный джемпер в полоску для девочек", "Рубашка для мальчиков",
              "Базовый лонгслив детский", "Свитшот с вышивкой для малышей",
              "Школьный сарафан", "Комплект для новорожденных"):
        assert is_kids_name(n), n


def test_age_and_height_grid_in_name():
    assert is_kids_name("Комбинезон 3-4 года")
    assert is_kids_name("Куртка на 5 лет")
    assert is_kids_name("Платье рост 116")
    assert not is_kids_name("Платье, рост модели 176")


# ----------------------------------------------------------- the two traps
def test_babydoll_dress_is_not_kids():
    # ЦУМ 13556872 / 13556145 "Шелковое платье Kika Vargas": the description says
    # "платье в стиле baby doll" and the card sits in Женское > Одежда > Платья
    assert not detect_kids(name="Шелковое платье Kika Vargas",
                           description="Пудровое платье в стиле baby doll наши стилисты "
                                       "предлагают носить с мюлями").is_kids
    assert not is_kids_name("Платье baby-doll из тафты")


def test_baby_alpaca_is_a_wool_not_an_age():
    # ЦУМ "Свитер Isabel Marant Etoile … из нежнейшей шерсти baby-альпака"
    assert not is_kids_name("Свитер из шерсти baby-альпака")
    assert not detect_kids(name="Шерстяной свитер Isabel Marant",
                           description="Нежный пух бэби-альпака в ее составе").is_kids


def test_school_dress_code_in_a_description_is_not_kids():
    # ЦУМ 1000007916 "Хлопковое платье CALVIN KLEIN 205W39NYC", Женское > Платья:
    # "…напоминающее блузу с надетым поверх нее школьным фартуком"
    assert not detect_kids(
        name="Хлопковое платье CALVIN KLEIN 205W39NYC",
        description="Короткое белоснежное платье, напоминающее блузу с надетым поверх "
                    "нее школьным фартуком.",
        category_chain=["Женское", "Одежда", "Платья"]).is_kids


def test_preppy_is_a_print_not_an_age():
    assert not is_kids_name("Футболка оверсайз в стиле преппи")


def test_words_that_look_like_kids_but_are_not():
    for n in ("Кожаные сандалии Seboy`s", "Джинсы Sabina Girlfriend 3x1",
              "Футболка BLUGIRL", "Трусы-слипы Ritratti Milano",
              "Замшевые слипоны Thomas The-Antipode", "Комбинезон Isabel Marant",
              "Боди с открытой спиной"):
        assert not is_kids_name(n), n


# ------------------------------------------------------------------ структура
def test_sela_on_child_size_marker():
    v = detect_kids(name="Джинсовый сарафан",
                    description="Прямой силуэт. на ребенке представлен размер 140.")
    assert v.is_kids and v.signal == "description:on-child-size"


def test_model_size_marker_is_not_kids():
    assert not detect_kids(name="Джемпер из 100% шерсти",
                           description="на модели размер s. параметры модели: 86/60/89, "
                                       "рост 176.").is_kids


def test_param_gender_child():
    # ElytS feed: 8 offers carry <param name="Пол">Детский</param>
    assert detect_kids(name="Куртка", params={"Пол": "Детский"}).signal == "param:пол"
    assert not detect_kids(name="Куртка", params={"Пол": "Женский"}).is_kids


# ------------------------------------------------------------------ item dicts
def test_is_kids_item_reads_every_field():
    assert is_kids_item({"item_name": "Хлопковое платье Paade Mode",
                         "category_chain": ["Детское", "Одежда для девочек"]})
    assert is_kids_item({"name": "Брюки", "url": "https://www.sela.ru/eshop/kids/girl/x/"})
    assert is_kids_item({"item_name": "Что угодно", "is_kids": True})
    assert not is_kids_item({"item_name": "Брюки Lacoste приталенного кроя",
                             "url": "https://lacoste.ru/catalog/bryuki-muzhchiny/x/"})
    assert not is_kids_item(None)


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
