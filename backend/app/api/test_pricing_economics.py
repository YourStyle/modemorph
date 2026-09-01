"""Арифметика раздела «Тарификация».

Экран, который сам себе считает выручку, однажды начнёт расходиться с тем, что
списывает код, и никто этого не заметит — ровно так прайс год с лишним стоял
рядом с функциями, которые его не читали. Поэтому вся математика живёт в одной
чистой функции на бэкенде, а здесь проверяется на числах, которые можно
пересчитать в уме.

Запуск:  python3 -m app.api.test_pricing_economics     (из backend/)
"""

from app.api.admin import feature_economics

# Живые значения на 01.09.2026, чтобы числа в проверках сходились с продом.
_FEATURES = [
    {"feature_name": "wardrobe_items_anlyzed", "cost_credits": 3, "unit_cost_rub": 2.90, "is_active": True},
    {"feature_name": "vton_used", "cost_credits": 6, "unit_cost_rub": 14.10, "is_active": True},
    {"feature_name": "ai_requests", "cost_credits": 1, "unit_cost_rub": 0.04, "is_active": True},
    {"feature_name": "ideas_viewed", "cost_credits": 0, "unit_cost_rub": 0.04, "is_active": True},
]
_PLANS = [
    {"plan_type": "monthly", "price_rub": 399, "display_name": "Ежемесячно"},
    {"plan_type": "yearly", "price_rub": 2990, "display_name": "Годовой план"},
]
_CAPS = {"vton_used": 10, "wardrobe_items_anlyzed": 40}
_CHEAP, _DEAR = 5.00, 15.80          # пак 200/999 и Мини 5/79


def _run():
    return feature_economics(_FEATURES, _CHEAP, _DEAR, _PLANS, _CAPS)


def _by_name(rows):
    return {r["feature_name"]: r for r in rows}


def test_margin_is_a_range_not_a_single_number():
    """Кредит стоит от 5,00 до 15,80 ₽ — оба пака активны. Одно усреднённое
    число было бы красивее и неправдивее."""
    f = _by_name(_run()[0])["wardrobe_items_anlyzed"]
    assert f["revenue_rub_min"] == 15.00 and f["revenue_rub_max"] == 47.40
    assert f["margin_pct_min"] == 80.7, f["margin_pct_min"]   # (15,00 − 2,90) / 15,00
    assert f["margin_pct_max"] == 93.9, f["margin_pct_max"]


def test_try_on_margin_survives_the_cheapest_pack():
    """6 кредитов × 5,00 ₽ = 30,00 ₽ при себестоимости 14,10 ₽."""
    f = _by_name(_run()[0])["vton_used"]
    assert f["margin_pct_min"] == 53.0, f["margin_pct_min"]


def test_free_feature_reports_no_margin_instead_of_minus_hundred():
    """У бесплатной функции выручки нет. −100% формально верно и бесполезно:
    это не убыток, это подарок ценой в 4 копейки."""
    f = _by_name(_run()[0])["ideas_viewed"]
    assert f["is_free"] is True
    assert f["revenue_rub_min"] is None and f["margin_pct_min"] is None


def test_unmeasured_cost_is_unknown_not_zero():
    """Ноль выглядит как ответ. Незамеренная себестоимость обязана давать None."""
    rows, _ = feature_economics(
        [{"feature_name": "vton_used", "cost_credits": 6, "unit_cost_rub": None, "is_active": True}],
        _CHEAP, _DEAR, _PLANS, _CAPS,
    )
    assert rows[0]["margin_pct_min"] is None and rows[0]["unit_cost_rub"] is None


def test_disabled_feature_is_free_not_priced():
    """Выключенный тумблер = функция не тарифицируется (см. _get_feature_cost).
    Экран обязан говорить то же самое, что делает код."""
    rows, _ = feature_economics(
        [{"feature_name": "vton_used", "cost_credits": 6, "unit_cost_rub": 14.10, "is_active": False}],
        _CHEAP, _DEAR, _PLANS, _CAPS,
    )
    assert rows[0]["is_free"] is True and rows[0]["revenue_rub_min"] is None


def test_yearly_plan_is_the_one_that_barely_breaks_even():
    """2 990 / 12 = 249,17 ₽ в месяц против 257 ₽ включённого. Это и есть
    причина, по которой цифра должна быть на экране."""
    plans = {p["plan_type"]: p for p in _run()[1]}
    assert plans["yearly"]["monthly_rub"] == 249.17
    assert plans["yearly"]["included_cost_rub"] == 257.00   # 10×14,10 + 40×2,90
    assert plans["yearly"]["margin_pct"] < 0, "годовой тариф внезапно стал прибыльным — проверь цифры"
    assert plans["monthly"]["margin_pct"] > 30, "месячный тариф просел ниже 30%"


def test_numeric_from_postgres_does_not_blow_up():
    """unit_cost_rub — NUMERIC, а из драйвера он приходит Decimal. Смешать его
    с float в одном выражении — верный 500 на проде и ровно тот класс ошибки,
    который не видно до деплоя."""
    from decimal import Decimal

    rows, plans = feature_economics(
        [{"feature_name": "vton_used", "cost_credits": 6, "unit_cost_rub": Decimal("14.10"), "is_active": True}],
        Decimal("5.00"), Decimal("15.80"),
        [{"plan_type": "yearly", "price_rub": Decimal("2990"), "display_name": "Годовой"}],
        {"vton_used": 10},
    )
    assert isinstance(rows[0]["unit_cost_rub"], float)
    assert rows[0]["margin_pct_min"] == 53.0
    assert plans[0]["included_cost_rub"] == 141.00


def test_included_cost_counts_every_capped_feature():
    """Если завтра лимит поставят на третью функцию, её стоимость обязана
    попасть в «включено», а не тихо выпасть из расчёта."""
    _, plans = feature_economics(_FEATURES, _CHEAP, _DEAR, _PLANS, {**_CAPS, "ai_requests": 100})
    assert plans[0]["included_cost_rub"] == 261.00          # +100 × 0,04


if __name__ == "__main__":
    n = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); n += 1; print(f"ok  {name}")
    print(f"\n{n} checks passed")
