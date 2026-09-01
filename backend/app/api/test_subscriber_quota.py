"""Подписка перестаёт быть безлимитной там, где генерация стоит денег.

Примерка — 14,10 ₽ за штуку (две генерации на дорогой модели). Годовой тариф
даёт 249 ₽ в месяц, и на нём пятеро из восьми активных подписчиков. До этой
правки _is_subscriber() отвечал «можно, осталось 999» и на этом всё: профиль
1554 в апреле 2026 сделал 43 примерки на 621 ₽ себестоимости.

Три вещи, которые здесь легко сломать молча и которые поэтому проверяются:
  1. подписчик за лимитом должен платить КРЕДИТАМИ, а не съедать бесплатный
     тариф — иначе он получит сверху ещё и то, что положено неплатящим;
  2. счётчик подписки не должен трогать limits — там бесплатный тариф, и
     смешение вернёт баг «истёкшая подписка унесла большой остаток»;
  3. функции без лимита обязаны остаться безлимитными.

Запуск:  python3 -m app.api.test_subscriber_quota     (из backend/)

ponytail: подставная db, которая сама считает квоту, — без сервера и без базы.
"""

import asyncio
from pathlib import Path

from app.api.limits import (
    SUBSCRIBER_MONTHLY_CAPS,
    _can_use_feature,
    _claim_subscriber_quota,
    _use_feature,
)

_MIGRATION = (Path(__file__).resolve().parents[2] / "migrations" / "038_subscription_usage.sql").read_text()


class _FakeResult:
    def __init__(self, row):
        self._row = row

    def first(self):
        return self._row


class _FakeDB:
    """Отвечает по подстроке в SQL и сам ведёт квоту, чтобы «за лимитом» было
    настоящим состоянием, а не подменённым ответом."""

    def __init__(self, *, subscriber=False, quota_used=0, cost=(6, True), credits=0, limit_left=None):
        self.subscriber = subscriber
        self.quota_used = quota_used
        self.cost = cost
        self.credits = credits
        self.limit_left = limit_left
        self.sql = []

    async def execute(self, stmt, params=None):
        s = str(stmt)
        p = params or {}
        self.sql.append(s)

        if "user_subscriptions" in s:
            return _FakeResult((1,) if self.subscriber else None)
        if "UPDATE subscription_usage" in s:          # ленивый сброс периода
            return _FakeResult(None)
        if "INSERT INTO subscription_usage" in s:     # атомарный захват
            new = self.quota_used + p["cnt"]
            if new <= p["cap"]:
                self.quota_used = new
                return _FakeResult((new,))
            return _FakeResult(None)
        if "SELECT used FROM subscription_usage" in s:
            return _FakeResult((self.quota_used,))
        if "UPDATE limits" in s:
            return _FakeResult(self.limit_left)
        if "feature_costs" in s:
            return _FakeResult(self.cost)
        if "UPDATE user_credits" in s:
            return _FakeResult((self.credits - p["cost"],) if self.credits >= p["cost"] else None)
        if "user_credits" in s:
            return _FakeResult((self.credits,))
        return _FakeResult(None)

    def touched(self, needle):
        return any(needle in s for s in self.sql)


def test_the_two_paid_features_are_capped():
    """Примерка и оцифровка — единственные функции, которые стоят реальных
    денег (14,10 ₽ и 2,90 ₽). Остальные — 4 копейки, им лимит не нужен."""
    assert SUBSCRIBER_MONTHLY_CAPS.get("vton_used"), "примерка снова безлимитна по подписке"
    assert SUBSCRIBER_MONTHLY_CAPS.get("wardrobe_items_anlyzed"), "оцифровка снова безлимитна"


def test_included_cost_stays_under_the_cheapest_plan():
    """Годовой тариф — 249 ₽ в месяц. Включённое не должно стоить дороже, иначе
    подписка убыточна не в хвосте, а по замыслу."""
    rub = {"vton_used": 14.10, "wardrobe_items_anlyzed": 2.90}
    total = sum(SUBSCRIBER_MONTHLY_CAPS[f] * rub[f] for f in SUBSCRIBER_MONTHLY_CAPS)
    assert total <= 260, f"включённое стоит {total:.0f} ₽ при выручке 249 ₽ с годового тарифа"


def test_photo_batch_respects_the_cap():
    """Оцифровка приходит пачкой: count = число фото. Лимит должен считать
    штуки, а не запросы, иначе пачка из сорока пройдёт как одна."""
    cap = SUBSCRIBER_MONTHLY_CAPS["wardrobe_items_anlyzed"]
    db = _FakeDB(subscriber=True, quota_used=cap - 2, credits=0)
    ok, _ = asyncio.run(_use_feature(db, 1, "wardrobe_items_anlyzed", 5))
    assert not ok, "пачка из пяти прошла при двух оставшихся"


def test_subscriber_within_cap_is_free():
    db = _FakeDB(subscriber=True, quota_used=0)
    ok, left = asyncio.run(_use_feature(db, 1, "vton_used", 1))
    assert ok and left == SUBSCRIBER_MONTHLY_CAPS["vton_used"] - 1
    assert not db.touched("credit_transactions"), "с подписчика списали кредиты внутри лимита"


def test_subscriber_over_cap_pays_with_credits():
    cap = SUBSCRIBER_MONTHLY_CAPS["vton_used"]
    db = _FakeDB(subscriber=True, quota_used=cap, credits=99)
    ok, _ = asyncio.run(_use_feature(db, 1, "vton_used", 1))
    assert ok, "подписчик за лимитом с кредитами на счету должен пройти"
    assert db.touched("credit_transactions"), "списание не попало в журнал"


def test_subscriber_over_cap_never_eats_the_free_tier():
    """Бесплатный тариф — для тех, кто не платит. Подписчик уже заплатил за
    месяц; если пустить его в limits, он получит сверху ещё и чужую порцию."""
    cap = SUBSCRIBER_MONTHLY_CAPS["vton_used"]
    db = _FakeDB(subscriber=True, quota_used=cap, credits=99)
    asyncio.run(_use_feature(db, 1, "vton_used", 1))
    assert not db.touched("UPDATE limits"), "подписчик за лимитом залез в бесплатный тариф"


def test_subscriber_over_cap_without_credits_is_refused():
    cap = SUBSCRIBER_MONTHLY_CAPS["vton_used"]
    db = _FakeDB(subscriber=True, quota_used=cap, credits=0)
    ok, _ = asyncio.run(_use_feature(db, 1, "vton_used", 1))
    assert not ok, "примерка сверх включённого раздаётся даром"


def test_uncapped_feature_stays_unlimited_for_subscribers():
    db = _FakeDB(subscriber=True)
    ok, left = asyncio.run(_use_feature(db, 1, "ideas_viewed", 1))
    assert ok and left == 999
    assert not db.touched("subscription_usage"), "безлимитная функция начала расходовать квоту"


def test_free_user_is_untouched_by_the_cap():
    db = _FakeDB(subscriber=False, limit_left=(1,))
    ok, left = asyncio.run(_use_feature(db, 1, "vton_used", 1))
    assert ok and left == 1
    assert db.touched("UPDATE limits"), "бесплатный тариф перестал списываться"
    assert not db.touched("subscription_usage"), "неподписчик тронул счётчик подписки"


def test_check_does_not_advance_the_counter():
    """_can_use_feature вызывается перед генерацией в /api/vton. Если бы она
    что-то писала, каждая проверка съедала бы примерку."""
    db = _FakeDB(subscriber=True, quota_used=3)
    ok, left = asyncio.run(_can_use_feature(db, 1, "vton_used", 1))
    assert ok and left == SUBSCRIBER_MONTHLY_CAPS["vton_used"] - 3
    assert not db.touched("INSERT INTO subscription_usage")
    assert not db.touched("UPDATE subscription_usage")


def test_claim_refuses_a_batch_larger_than_the_cap():
    db = _FakeDB(subscriber=True)
    left = asyncio.run(_claim_subscriber_quota(db, 1, "vton_used", 999, 10))
    assert left is None
    assert not db.sql, "запрос ушёл в базу вместо того, чтобы отказать сразу"


def test_counter_lives_apart_from_the_free_tier():
    """Отдельная таблица, а не колонка в limits: иначе истёкшая подписка унесёт
    с собой большой остаток — ровно тот баг, из-за которого убрали запись 999."""
    assert "CREATE TABLE IF NOT EXISTS subscription_usage" in _MIGRATION
    assert "period_started_at" in _MIGRATION


if __name__ == "__main__":
    n = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); n += 1; print(f"ok  {name}")
    print(f"\n{n} checks passed — лимит подписки: {SUBSCRIBER_MONTHLY_CAPS}")
