# -*- coding: utf-8 -*-
"""E2E денежных путей против ЖИВОЙ базы: прайс, разовое предложение, лимиты.

Зачем отдельно от unit-тестов рядом. Почти всё, что ломалось на этом проекте,
ломалось одинаково: ручка отвечала 200, а нужного действия не происходило.
Перестройка индекса возвращала успех и не сохраняла ни одного эмбеддинга. Крон
отчитывался об успехе и ронял сервис. Прайс расходился с лендингом на 100 и 1000
рублей, и заметил это человек, а не проверка.

Мок такое поймать не может по устройству: он подтверждает, что мы позвали то,
что собирались позвать. Вопрос же в другом — изменилось ли состояние на той
стороне. Поэтому здесь настоящая база, а проверяется НАБЛЮДАЕМЫЙ результат, а не
код ответа.

Запуск против одноразового Postgres:

    docker run -d --name mm_test_pg -e POSTGRES_USER=modemorph \
      -e POSTGRES_PASSWORD=modemorph -e POSTGRES_DB=modemorph \
      -p 55432:5432 postgres:16-alpine

    for f in backend/migrations/*.sql; do
      PGPASSWORD=modemorph psql -h localhost -p 55432 -U modemorph -d modemorph \
        -v ON_ERROR_STOP=1 -f "$f"
    done

    cd backend && DATABASE_URL=postgresql+asyncpg://modemorph:modemorph@localhost:55432/modemorph \
      python3 -m pytest app/api/test_e2e_money.py -q
"""

import os
import sys
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
# Тот же приём, что в test_ai_chats: каталог app/api содержит limits.py, который
# затеняет пакет "limits" из зависимостей slowapi и ломает импорт app.main.
sys.path = [p for p in sys.path if os.path.abspath(p or ".") != HERE]
sys.path.insert(0, os.path.join(HERE, "..", ".."))

import pytest  # noqa: E402

if "DATABASE_URL" not in os.environ:
    pytest.skip(
        "нужен живой Postgres с применёнными миграциями — см. докстринг модуля. "
        "Умолчание не подставляем: оно может молча указать на боевую базу.",
        allow_module_level=True,
    )

os.environ.setdefault("JWT_SECRET", "test-secret-" + "x" * 32)
os.environ.setdefault("TELEGRAM_PEPPER", "test-pepper")

import asyncio  # noqa: E402

import asyncpg  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.database import async_session  # noqa: E402
from app.services.discounts import (  # noqa: E402
    MIN_MARGIN_PCT,
    plan_worst_case_cost,
    resolve,
)


def _dsn() -> str:
    """settings.DATABASE_URL — в диалекте SQLAlchemy; голому asyncpg нужен чистый."""
    return settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")


async def _rows(sql: str, *args):
    conn = await asyncpg.connect(_dsn())
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


async def _apply(sql: str, *args):
    """Запрос без результата. Параметры только через $1, $2 — не подстановкой."""
    conn = await asyncpg.connect(_dsn())
    try:
        return await conn.execute(sql, *args)
    finally:
        await conn.close()


def rows(sql: str, *args):
    return asyncio.run(_rows(sql, *args))


def apply(sql: str, *args):
    return asyncio.run(_apply(sql, *args))


_ACTIVE_PLANS = (
    "SELECT plan_type, price_rub, offer_price_rub FROM subscription_pricing "
    "WHERE is_active = true"
)


@pytest.fixture(autouse=True)
def _dispose_engine_between_tests():
    """Отпускать пул соединений после каждого теста.

    SQLAlchemy привязывает пул к тому циклу событий, в котором его создали, а
    каждый asyncio.run() поднимает НОВЫЙ цикл. Второй тест получал соединение из
    чужого, уже закрытого цикла — и падал, хотя поодиночке проходил. Признак
    ровно такой: «coroutine 'Connection._cancel' was never awaited».

    Именно тот случай, когда тест врёт не результатом, а порядком запуска.
    """
    yield
    from app.core.database import engine
    asyncio.run(engine.dispose())


# --------------------------------------------------------------------------
# Прайс
# --------------------------------------------------------------------------

def test_every_active_plan_has_a_price_and_an_offer():
    """Тариф без цены предложения посчитает разовую скидку запасным процентом.
    По марже это безопасно, но цифра будет НЕ ТА, что обещана на лендинге, и
    расхождение никто не заметит — как не заметили 699 против 599."""
    plans = rows(_ACTIVE_PLANS)
    assert plans, "в базе нет ни одного активного тарифа"
    for p in plans:
        assert p["price_rub"] and p["price_rub"] > 0, f"{p['plan_type']}: цена не задана"
        assert p["offer_price_rub"] is not None, (
            f"{p['plan_type']}: не задана цена разового предложения"
        )
        assert 0 < p["offer_price_rub"] < p["price_rub"], (
            f"{p['plan_type']}: предложение {p['offer_price_rub']} не дешевле цены {p['price_rub']}"
        )


def test_offer_price_stays_above_the_discount_margin_floor():
    """Пол маржи уже спасал: при переходе годового на 5 990 запасные 25% давали
    маржу 13,3%, то есть предложение падало бы с 400 ровно в минуту показа."""

    async def check():
        plans = await _rows(_ACTIVE_PLANS + " AND offer_price_rub IS NOT NULL")
        async with async_session() as db:
            for p in plans:
                cost = await plan_worst_case_cost(db, p["plan_type"])
                if cost is None:
                    continue  # себестоимость не замерена — считать не из чего
                offer = p["offer_price_rub"]
                margin = (offer - cost) / offer * 100
                assert margin >= MIN_MARGIN_PCT, (
                    f"{p['plan_type']}: предложение {offer} ₽ даёт маржу {margin:.1f}% "
                    f"при поле {MIN_MARGIN_PCT:.0f}% (себестоимость {cost:.0f} ₽)"
                )

    asyncio.run(check())


# --------------------------------------------------------------------------
# Разовое предложение
# --------------------------------------------------------------------------

def test_winback_charges_the_offer_price_not_a_percentage():
    """Главная денежная проверка: код разового предложения обязан дать РОВНО ту
    цену, что лежит в прайсе.

    Проценты сюда не годятся — 199 / 449 / 4 999 это −33,4% / −25,0% / −16,5%, а
    percent_off хранится целым. Исчезни однажды эта ветка в resolve(), человек
    увидит на лендинге одно, а в счёте другое, и узнаем мы это от него.
    """
    code = f"E2E{uuid.uuid4().hex[:6].upper()}"
    apply("INSERT INTO discounts (code, kind, percent_off, is_active) "
          "VALUES ($1, 'winback', 18, true)", code)
    try:
        plans = rows(_ACTIVE_PLANS + " AND offer_price_rub IS NOT NULL")

        async def check():
            for p in plans:
                async with async_session() as db:
                    got = await resolve(db, code, profile_id=-1, plan_type=p["plan_type"])
                assert got["discounted_rub"] == p["offer_price_rub"], (
                    f"{p['plan_type']}: посчитали {got['discounted_rub']} ₽, "
                    f"а в прайсе {p['offer_price_rub']} ₽"
                )
                assert got["price_rub"] == p["price_rub"]

        asyncio.run(check())
    finally:
        # Код нужен только на время проверки: оставленный в базе, он стал бы
        # действующей скидкой.
        apply("DELETE FROM discounts WHERE code = $1", code)


def test_a_missing_offer_price_falls_back_instead_of_failing():
    """Пустая offer_price_rub — не отказ, а запасной процент. Человек в этом
    случае обязан получить цену, а не ошибку."""
    code = f"E2E{uuid.uuid4().hex[:6].upper()}"
    row = rows(_ACTIVE_PLANS + " AND offer_price_rub IS NOT NULL ORDER BY price_rub LIMIT 1")[0]
    plan, saved, full = row["plan_type"], row["offer_price_rub"], row["price_rub"]

    apply("INSERT INTO discounts (code, kind, percent_off, is_active) "
          "VALUES ($1, 'winback', 18, true)", code)
    apply("UPDATE subscription_pricing SET offer_price_rub = NULL WHERE plan_type = $1", plan)
    try:
        async def check():
            async with async_session() as db:
                got = await resolve(db, code, profile_id=-1, plan_type=plan)
            assert 0 < got["discounted_rub"] < full

        asyncio.run(check())
    finally:
        apply("UPDATE subscription_pricing SET offer_price_rub = $1 WHERE plan_type = $2",
              saved, plan)
        apply("DELETE FROM discounts WHERE code = $1", code)


# --------------------------------------------------------------------------
# Целостность прайса и лимитов
# --------------------------------------------------------------------------

def test_every_paid_plan_has_limits():
    """Тариф без потолков продаёт безлимит по цене лимитированного. И защиты тут
    нет: plan_worst_case_cost вернёт для него 0, а не None, то есть маржа
    посчитается стопроцентной и пол пропустит любую скидку."""
    priced = {r["plan_type"] for r in rows(
        "SELECT plan_type FROM subscription_pricing WHERE is_active = true")}
    capped = {r["plan_type"] for r in rows("SELECT DISTINCT plan_type FROM plan_limits")}
    missing = priced - capped
    assert not missing, f"платные тарифы без единого потолка: {sorted(missing)}"


def test_every_capped_feature_has_a_measured_cost():
    """Потолок без замеренной себестоимости делает маржу неизвестной, а тогда пол
    пропускает ЛЮБУЮ скидку (assert_price_above_floor: cost is None → return).
    Это тихое отключение защиты, и заметить его иначе нечем."""
    unmeasured = rows("""
        SELECT DISTINCT pl.feature
        FROM plan_limits pl
        LEFT JOIN feature_costs fc ON fc.feature_name = pl.feature
        WHERE fc.unit_cost_rub IS NULL
    """)
    assert not unmeasured, (
        "функции с потолком, но без замеренной себестоимости: "
        f"{sorted(r['feature'] for r in unmeasured)}"
    )
