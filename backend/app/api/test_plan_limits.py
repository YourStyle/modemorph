"""Планы вместо кредитов: потолок либо держит, либо нет. Третьей валюты нет.

Заменяет test_subscriber_quota.py и test_feature_costs.py. Оба проверяли мир, в
котором за лимитом человек продолжал платить кредитами, а цена функции жила в
feature_costs.cost_credits. Ни того, ни другого больше не существует.

Четыре вещи, которые здесь легко сломать молча и которые поэтому проверяются:
  1. потолок берётся по ДЕЙСТВУЮЩЕМУ плану, а не по одному словарю на всех;
  2. счётчик, накопленный под другим планом, не переносится — иначе истёкшая
     подписка съест бесплатный тариф, а оплата не даст ничего нового;
  3. оцифровка приходит пачкой, и лимит обязан считать фото, а не запросы;
  4. ключи plan_limits обязаны совпадать с ALLOWED_FEATURES — ровно на этом
     расхождении десять месяцев не работала тарификация (миграция 037).

Запуск:  python3 -m app.api.test_plan_limits     (из backend/)

ponytail: подставная db, которая сама ведёт квоту, — без сервера и без базы.
"""

import asyncio
import re
from pathlib import Path

from app.api.limits import (
    ALLOWED_FEATURES,
    PLAN_DAYS,
    _can_use_feature,
    _use_feature,
)

_MIGRATIONS = Path(__file__).resolve().parents[2] / "migrations"

# Себестоимость из feature_costs.unit_cost_rub, замер 22.08.2026.
_RUB = {"wardrobe_items_anlyzed": 3.10, "vton_used": 14.10, "ai_requests": 0.04, "ideas_viewed": 0.04}


def _seeded_caps() -> dict[str, dict[str, tuple[int, str]]]:
    """Разобрать потолки из ПОСЛЕДНЕЙ миграции, которая объявляет plan_limits.

    Не копия цифр рядом с тестом: копия разошлась бы с продом при первой правке,
    и тест продолжил бы уверенно проверять то, чего в базе уже нет. Каждая
    миграция, меняющая тариф, переписывает посев целиком — тогда «последняя»
    и есть текущее состояние, и читать историю не нужно.
    """
    latest = max(
        (p for p in _MIGRATIONS.glob("*.sql") if "INSERT INTO plan_limits" in p.read_text()),
        key=lambda p: p.name,
    )
    block = latest.read_text().split("INSERT INTO plan_limits", 1)[1].split("ON CONFLICT", 1)[0]
    caps: dict[str, dict[str, tuple[int, str]]] = {}
    for plan, feature, cap, period in re.findall(
        r"\('(\w+)',\s*'(\w+)',\s*(\d+),\s*'(\w+)'\)", block
    ):
        caps.setdefault(plan, {})[feature] = (int(cap), period)
    return caps


class _FakeResult:
    def __init__(self, row):
        self._row = row

    def first(self):
        return self._row


class _FakeDB:
    """Отвечает по подстроке в SQL и сам ведёт квоту, чтобы «за лимитом» было
    настоящим состоянием, а не подменённым ответом."""

    def __init__(self, *, plan="free", used=0, used_plan=None, caps=None):
        self.plan = plan
        self.used = used
        # Под каким планом накоплен счётчик. По умолчанию — под текущим.
        self.used_plan = used_plan or plan
        self.caps = caps if caps is not None else _seeded_caps()
        self.sql = []

    async def execute(self, stmt, params=None):
        s = str(stmt)
        p = params or {}
        self.sql.append(s)

        if "user_subscriptions" in s:
            return _FakeResult((self.plan,) if self.plan != "free" else None)

        if "FROM plan_limits" in s:
            cap = self.caps.get(p["p"], {}).get(p["f"])
            return _FakeResult(cap)

        if "UPDATE subscription_usage" in s:          # ленивый сброс
            if self.used_plan != p["plan"]:
                self.used, self.used_plan = 0, p["plan"]
            return _FakeResult(None)

        if "INSERT INTO subscription_usage" in s:     # атомарный захват
            new = self.used + p["cnt"]
            if new <= p["cap"]:
                self.used = new
                return _FakeResult((new,))
            return _FakeResult(None)

        if "SELECT used FROM subscription_usage" in s:
            return _FakeResult((self.used,) if self.used_plan == p["plan"] else None)

        return _FakeResult(None)

    def touched(self, needle):
        return any(needle in s for s in self.sql)


def test_seed_keys_match_the_features_the_app_actually_bills():
    """Расхождение ключей — это ровно тот баг, из-за которого тарификация
    молчала десять месяцев. Здесь оно должно падать, а не тихо давать безлимит."""
    caps = _seeded_caps()
    assert caps, "посев plan_limits не разобрался — миграция изменила форму"
    for plan, lims in caps.items():
        unknown = set(lims) - ALLOWED_FEATURES
        assert not unknown, f"{plan}: потолки на несуществующие функции {unknown}"
    assert set(caps) == {"free", *PLAN_DAYS}, "план без потолков или потолки без плана"


_PRICE = {"weekly": 299, "monthly": 699, "yearly": 6990}

# Пол маржи худшего случая. 40%, а не 60%: годовой обязан быть просторнее
# месячного при цене на 17% ниже за месяц (582 ₽ против 699 ₽), и его маржа ниже
# по построению — это плата за то, чтобы у апгрейда был смысл. Пол ловит не
# «стало хуже», а «щедрость вышла из берегов».
_MARGIN_FLOOR = 40.0


def _worst_case_cost(plan: str, caps: dict) -> float:
    days = PLAN_DAYS[plan]
    return sum(
        cap * (days / (7 if period == "week" else 30)) * _RUB[f]
        for f, (cap, period) in caps[plan].items()
    )


def test_every_paid_plan_keeps_a_margin_floor():
    """Худший случай: человек выбрал каждый потолок до конца. Цены — 299 / 699 /
    6 990 из «Тарифы_V2». Если щедрость съест маржу, это видно здесь, а не через
    месяц по счёту от OpenRouter."""
    caps = _seeded_caps()
    for plan in PLAN_DAYS:
        cost = _worst_case_cost(plan, caps)
        margin = (_PRICE[plan] - cost) / _PRICE[plan] * 100
        assert margin >= _MARGIN_FLOOR, f"{plan}: маржа {margin:.1f}% при расходе {cost:.0f} ₽"


def test_yearly_is_actually_wider_than_monthly():
    """Смысл годового тарифа. До миграции 044 потолки совпадали (35/8/300), и
    месячному подписчику за лимитом было некуда апгрейдиться: годовой давал
    ровно столько же в месяц и отличался только ценой."""
    caps = _seeded_caps()
    for feature, (monthly_cap, _) in caps["monthly"].items():
        yearly_cap = caps["yearly"][feature][0]
        assert yearly_cap > monthly_cap, (
            f"{feature}: годовой даёт {yearly_cap}, месячный {monthly_cap} — апгрейд ни во что"
        )


def test_free_tier_costs_less_than_a_third_of_the_cheapest_plan():
    """Бесплатный тариф выдаётся один раз навсегда, но выдаётся каждому
    зарегистрировавшемуся — это чистый расход на привлечение."""
    caps = _seeded_caps()
    cost = sum(cap * _RUB[f] for f, (cap, _) in caps["free"].items())
    assert all(p == "once" for _, p in caps["free"].values()), "бесплатный тариф стал возобновляемым"
    assert cost < 100, f"бесплатный тариф стоит {cost:.0f} ₽ на регистрацию"


def test_photo_batch_respects_the_cap():
    """Оцифровка приходит пачкой: count = число фото. Лимит должен считать
    штуки, а не запросы, иначе пачка из сорока пройдёт как одна."""
    cap = _seeded_caps()["monthly"]["wardrobe_items_anlyzed"][0]
    db = _FakeDB(plan="monthly", used=cap - 2)
    ok, _ = asyncio.run(_use_feature(db, 1, "wardrobe_items_anlyzed", 5))
    assert not ok, "пачка из пяти прошла при двух оставшихся"


def test_within_the_cap_it_just_works():
    db = _FakeDB(plan="monthly", used=0)
    ok, left = asyncio.run(_use_feature(db, 1, "vton_used", 1))
    assert ok and left == _seeded_caps()["monthly"]["vton_used"][0] - 1


def test_over_the_cap_there_is_no_second_currency():
    """Раньше здесь начинались кредиты. Теперь — отказ, и ничего больше."""
    cap = _seeded_caps()["monthly"]["vton_used"][0]
    db = _FakeDB(plan="monthly", used=cap)
    ok, left = asyncio.run(_use_feature(db, 1, "vton_used", 1))
    assert not ok and left == 0
    assert not db.touched("user_credits"), "код снова полез в кредиты"


def test_expired_subscription_does_not_eat_the_free_tier():
    """Человек израсходовал 30 оцифровок по подписке и слетел на бесплатный.
    Счётчик от платного плана не должен считаться потраченным бесплатным."""
    db = _FakeDB(plan="free", used=30, used_plan="monthly")
    ok, left = asyncio.run(_can_use_feature(db, 1, "wardrobe_items_anlyzed", 1))
    free_cap = _seeded_caps()["free"]["wardrobe_items_anlyzed"][0]
    assert ok and left == free_cap, f"осталось {left} вместо {free_cap}"


def test_paying_resets_what_the_free_tier_spent():
    """Обратная сторона: бесплатные 5 оцифровок израсходованы, человек платит —
    и получает полный месячный потолок, а не потолок минус пять."""
    db = _FakeDB(plan="monthly", used=5, used_plan="free")
    ok, left = asyncio.run(_use_feature(db, 1, "wardrobe_items_anlyzed", 1))
    monthly_cap = _seeded_caps()["monthly"]["wardrobe_items_anlyzed"][0]
    assert ok and left == monthly_cap - 1, f"осталось {left}, а должно {monthly_cap - 1}"


def test_feature_without_a_row_is_unlimited_not_blocked():
    """Отсутствие строки — «безлимит». Ноль пришлось бы поставить явно; молчание
    таблицы не должно уметь выключать функцию."""
    db = _FakeDB(plan="monthly", caps={"monthly": {}})
    ok, left = asyncio.run(_use_feature(db, 1, "outfits_saved", 3))
    assert ok and left == 999


def test_count_larger_than_the_whole_cap_is_refused_without_writing():
    """Пачка больше всего потолка не должна занять его наполовину."""
    db = _FakeDB(plan="free", used=0)
    ok, _ = asyncio.run(_use_feature(db, 1, "wardrobe_items_anlyzed", 99))
    assert not ok
    assert db.used == 0, "потолок частично израсходован отказанной пачкой"


if __name__ == "__main__":
    n = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); n += 1; print(f"ok  {name}")
    print(f"\n{n} checks passed")
