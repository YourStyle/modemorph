"""Арифметика раздела «Тарификация» в админке.

Раньше здесь считалась выручка функции через цену кредита. Кредита больше нет:
функция сама по себе ничего не приносит — приносит план, а функция только
тратит. Поэтому маржа теперь одна на план, а не вилка на функцию.

Живые значения на 09.09.2026, чтобы числа в проверках сходились с продом.

Запуск:  python3 -m app.api.test_pricing_economics     (из backend/)
"""

from app.api.admin import plan_economics

_FEATURES = [
    {"feature_name": "wardrobe_items_anlyzed", "unit_cost_rub": 3.10, "is_active": True},
    {"feature_name": "vton_used", "unit_cost_rub": 14.10, "is_active": True},
    {"feature_name": "ai_requests", "unit_cost_rub": 0.04, "is_active": True},
    {"feature_name": "ideas_viewed", "unit_cost_rub": 0.04, "is_active": True},
]
_PLANS = [
    {"plan_type": "weekly", "price_rub": 299, "display_name": "Недельный"},
    {"plan_type": "monthly", "price_rub": 699, "display_name": "Ежемесячно"},
    {"plan_type": "yearly", "price_rub": 6990, "display_name": "Годовой план"},
]
_CAPS = {
    "free": {"wardrobe_items_anlyzed": {"cap": 5, "period": "once"},
             "vton_used": {"cap": 1, "period": "once"},
             "ai_requests": {"cap": 10, "period": "once"},
             "ideas_viewed": {"cap": 100, "period": "once"}},
    "weekly": {"wardrobe_items_anlyzed": {"cap": 10, "period": "week"},
               "vton_used": {"cap": 2, "period": "week"},
               "ai_requests": {"cap": 50, "period": "week"}},
    "monthly": {"wardrobe_items_anlyzed": {"cap": 35, "period": "month"},
                "vton_used": {"cap": 8, "period": "month"},
                "ai_requests": {"cap": 300, "period": "month"}},
    "yearly": {"wardrobe_items_anlyzed": {"cap": 50, "period": "month"},
               "vton_used": {"cap": 10, "period": "month"},
               "ai_requests": {"cap": 600, "period": "month"}},
}


def _plans():
    return {p["plan_type"]: p for p in plan_economics(_FEATURES, _PLANS, _CAPS)[1]}


def test_the_photo_is_billed_per_photo_not_per_item():
    """Тот самый вопрос, из-за которого пересчитывали всю экономику: 35 фото на
    месячном тарифе стоят 35 × 3,10 ₽, а не 35 × 2,5 вещи × 3,10 ₽.

    Оцифровка режет вещи по четыре и просит одну картинку сеткой 2×2, а кадр у
    Gemini стоит фиксированные ~1120 токенов независимо от содержимого. Если
    кто-нибудь однажды вернёт генерацию по одной вещи, это число вырастет втрое
    и упадёт здесь."""
    assert _plans()["monthly"]["included_cost_rub"] == 233.30


def test_weekly_plan_costs_one_week_not_one_month():
    """Недельный тариф с потолками period='week' — это ровно одно окно, а не
    четыре. Спутать здесь единицы — вчетверо переоценить расход."""
    assert _plans()["weekly"]["included_cost_rub"] == 61.20
    assert _plans()["weekly"]["margin_pct"] == 79.5


def test_yearly_contains_twelve_and_a_bit_monthly_windows():
    """365 / 30 = 12,17, а не 12. Округление до двенадцати дарит подписчику
    почти неделю сверх оплаченного — незаметно и каждый год."""
    y = _plans()["yearly"]
    assert y["included_cost_rub"] == 3893.33, y["included_cost_rub"]
    assert y["margin_pct"] == 44.3


def test_the_upgrade_costs_us_what_it_promises():
    """Годовой шире месячного (миграция 044), и разница — не косметика: она
    обязана быть видна в себестоимости. Если завтра потолки снова сравняют,
    included_cost_rub сойдётся с месячным ×12,17 и это упадёт здесь."""
    plans = _plans()
    monthly_equivalent = plans["monthly"]["included_cost_rub"] * 365 / 30
    assert plans["yearly"]["included_cost_rub"] > monthly_equivalent * 1.2


def test_no_plan_is_sold_below_cost():
    """Худший случай должен оставаться прибыльным на каждом тарифе. До правки
    цен годовой давал минус 8 ₽ в месяц — ровно это здесь и ловится."""
    for plan, row in _plans().items():
        assert row["margin_pct"] > 0, f"{plan} убыточен в худшем случае"


def test_unmeasured_cost_is_named_not_counted_as_zero():
    """Незамеренная себестоимость обязана попасть в unmeasured, а не прибавить
    к расходу ноль: ноль выглядит как ответ."""
    features = [{"feature_name": "vton_used", "unit_cost_rub": None, "is_active": True}]
    caps = {"monthly": {"vton_used": {"cap": 8, "period": "month"}}}
    _, plans = plan_economics(features, [_PLANS[1]], caps)
    assert plans[0]["unmeasured"] == ["vton_used"]
    assert plans[0]["included_cost_rub"] == 0.0


def test_numeric_from_postgres_does_not_blow_up():
    """unit_cost_rub и price_rub — NUMERIC, из драйвера они приходят Decimal.
    Смешать Decimal с float в одном выражении — верный 500 на проде и ровно тот
    класс ошибки, который не видно до деплоя."""
    from decimal import Decimal

    features = [{"feature_name": "vton_used", "unit_cost_rub": Decimal("14.10"), "is_active": True}]
    caps = {"monthly": {"vton_used": {"cap": 8, "period": "month"}}}
    rows, plans = plan_economics(
        features, [{"plan_type": "monthly", "price_rub": Decimal("699"), "display_name": "М"}], caps
    )
    assert isinstance(rows[0]["unit_cost_rub"], float)
    assert plans[0]["included_cost_rub"] == 112.80
    assert plans[0]["margin_pct"] == 83.9


def test_feature_rows_say_where_they_are_capped():
    """Экран должен уметь ответить «примерка: 1 бесплатно, 8 в месяц, 2 в
    неделю» — иначе себестоимость видна, а на что она тратится, нет."""
    rows, _ = plan_economics(_FEATURES, _PLANS, _CAPS)
    vton = next(r for r in rows if r["feature_name"] == "vton_used")
    assert vton["caps"] == {"free": 1, "weekly": 2, "monthly": 8, "yearly": 10}


if __name__ == "__main__":
    n = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); n += 1; print(f"ok  {name}")
    print(f"\n{n} checks passed")
