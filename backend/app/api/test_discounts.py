"""Скидки: арифметика, пол маржи и правила применения.

Что здесь легко сломать молча и что поэтому проверяется:
  1. цена со скидкой округляется ВВЕРХ — иначе сумма разойдётся с той, что
     сверяет вебхук Робокассы, и оплата тихо не применится;
  2. промокод не может продать тариф ниже себестоимости;
  3. деление на контрольную и тестовую группы устойчиво — один и тот же человек
     обязан всегда попадать в одну и ту же;
  4. повторный вебхук не выдаёт пригласившему вторую награду.

Запуск:  python3 -m app.api.test_discounts     (из backend/)

ponytail: подставная db на словарях — без сервера и без базы.
"""

import asyncio

from fastapi import HTTPException

from app.services.discounts import (
    MIN_MARGIN_PCT,
    WINBACK_PERCENT,
    assert_price_above_floor,
    discounted_price,
    in_offer_group,
    plan_worst_case_cost,
    redeem,
)

# Живые значения на 09.09.2026 (plan_limits + feature_costs.unit_cost_rub).
_LIMITS = {
    "weekly": [("wardrobe_items_anlyzed", 10, "week"), ("vton_used", 2, "week"), ("ai_requests", 50, "week")],
    "monthly": [("wardrobe_items_anlyzed", 35, "month"), ("vton_used", 8, "month"), ("ai_requests", 300, "month")],
    "yearly": [("wardrobe_items_anlyzed", 50, "month"), ("vton_used", 10, "month"), ("ai_requests", 600, "month")],
}
_RUB = {"wardrobe_items_anlyzed": 3.10, "vton_used": 14.10, "ai_requests": 0.04}


class _Rows:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return self._rows

    def first(self):
        return self._rows[0] if self._rows else None

    def scalar(self):
        row = self.first()
        return list(row.values())[0] if row else None


class _FakeDB:
    """Отвечает по подстроке в SQL и ведёт состояние, чтобы «уже применяли»
    было настоящим фактом, а не подменённым ответом."""

    def __init__(self, *, owner=None, redemptions=None):
        self.owner = owner
        self.redemptions = set(redemptions or ())
        self.sql = []

    async def execute(self, stmt, params=None):
        s = str(stmt)
        p = params or {}
        self.sql.append(s)

        if "FROM plan_limits" in s:
            return _Rows([
                {"feature": f, "cap": cap, "period": per, "unit_cost_rub": _RUB[f]}
                for f, cap, per in _LIMITS[p["p"]]
            ])
        if "INSERT INTO discount_redemptions" in s:
            key = (p["c"], p["pid"])
            if key in self.redemptions:
                return _Rows([])          # ON CONFLICT DO NOTHING
            self.redemptions.add(key)
            return _Rows([{"id": 1}])
        if "kind = 'referral'" in s:
            return _Rows([{"owner_profile_id": self.owner}] if self.owner else [])
        return _Rows([])

    def touched(self, needle):
        return any(needle in s for s in self.sql)


def test_price_rounds_up_not_down():
    """299 × 0,75 = 224,25. Вниз дало бы 224 ₽, и Робокасса прислала бы сумму,
    которой нет в payments.amount: вебхук вернул бы OK и молча ничего не сделал
    (см. robokassa_result — там UPDATE ... AND amount = :amt)."""
    assert discounted_price(299, 25) == 225
    assert discounted_price(699, 25) == 525
    assert discounted_price(6990, 25) == 5243
    assert discounted_price(100, 50) == 50, "ровное деление не должно прибавлять рубль"


def test_winback_percent_survives_every_plan():
    """Одно число скидки на все три тарифа. −30% уронили бы годовой до 20,4% —
    впритык к полу, поэтому здесь 25%."""
    db = _FakeDB()
    for plan, price in (("weekly", 299), ("monthly", 699), ("yearly", 6990)):
        final = discounted_price(price, WINBACK_PERCENT)
        asyncio.run(assert_price_above_floor(db, plan, final))  # не должно бросить


def test_a_greedy_promo_is_refused_before_anyone_sees_it():
    """Промокод на 60% продаёт годовой за 2 796 ₽ при себестоимости 3 893 ₽.
    Это должно падать у того, кто код придумывает."""
    db = _FakeDB()
    final = discounted_price(6990, 60)
    try:
        asyncio.run(assert_price_above_floor(db, "yearly", final))
        raise AssertionError(f"скидка 60% прошла: годовой за {final} ₽")
    except HTTPException as e:
        assert e.status_code == 400 and "маржу" in e.detail


def test_unmeasured_cost_does_not_block_the_code():
    """Незамеренная себестоимость не должна запрещать скидку: запрещать по
    незнанию хуже, чем разрешить — незамеренное видно на экране «Тарифы»."""
    class _NoCost(_FakeDB):
        async def execute(self, stmt, params=None):
            if "FROM plan_limits" in str(stmt):
                return _Rows([{"feature": "vton_used", "cap": 8, "period": "month", "unit_cost_rub": None}])
            return await super().execute(stmt, params)

    assert asyncio.run(plan_worst_case_cost(_NoCost(), "monthly")) is None
    asyncio.run(assert_price_above_floor(_NoCost(), "monthly", 1))  # не бросает


def test_worst_case_cost_matches_the_pricing_screen():
    """Та же арифметика, что в admin.plan_economics: годовой — 12,17 месячных
    окна, а не 12. Разойтись здесь значит запрещать не те скидки."""
    db = _FakeDB()
    assert asyncio.run(plan_worst_case_cost(db, "monthly")) == 233.30
    assert asyncio.run(plan_worst_case_cost(db, "yearly")) == 3893.33
    assert asyncio.run(plan_worst_case_cost(db, "weekly")) == 61.20


def test_offer_group_is_stable_and_roughly_half():
    """Человек обязан всегда попадать в одну и ту же группу, иначе сравнивать
    конверсию не с чем. И группы должны быть примерно равны."""
    ids = [f"user-{i}" for i in range(1000)]
    assert all(in_offer_group(u) == in_offer_group(u) for u in ids)
    share = sum(in_offer_group(u) for u in ids) / len(ids)
    assert 0.45 <= share <= 0.55, f"перекос групп: {share:.0%}"


def test_repeated_webhook_does_not_pay_the_inviter_twice():
    """Робокасса повторяет вебхук при любой неуверенности в доставке. Вторая
    доставка не должна выдавать пригласившему ещё неделю."""
    db = _FakeDB(owner=42)
    asyncio.run(redeem(db, "REFABC123", 7, 100, "monthly", 699, 594))
    first = sum("user_subscriptions" in s for s in db.sql)
    asyncio.run(redeem(db, "REFABC123", 7, 100, "monthly", 699, 594))
    second = sum("user_subscriptions" in s for s in db.sql)
    assert first == 1 and second == 1, "награда начислена дважды"


def test_promo_without_owner_rewards_nobody():
    db = _FakeDB(owner=None)
    asyncio.run(redeem(db, "AUTUMN", 7, 101, "monthly", 699, 594))
    assert not db.touched("user_subscriptions"), "обычный промокод кому-то начислил дни"


if __name__ == "__main__":
    n = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); n += 1; print(f"ok  {name}")
    print(f"\n{n} checks passed")
