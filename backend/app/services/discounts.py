"""Скидки: промокоды, рефералки, разовое предложение после бесплатного лимита.

Одна механика с тремя способами выдачи кода (см. миграцию 045). Здесь живёт всё,
что должно быть одинаковым для всех трёх: проверка кода, расчёт цены, пол маржи
и запись применения.

Пол маржи — не украшение. Промокод придумывает человек в админке, а платит по
нему Робокасса: код на 90% продал бы годовой тариф за 699 ₽ при себестоимости
включённого в 3 893 ₽. Поэтому цена со скидкой проверяется против той же
арифметики, что считает маржу на экране «Тарифы».
"""

import hashlib
import secrets
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Ниже этого продавать нельзя ни по какому коду. 20%, а не 40% как порог для
# самих тарифов: скидка — разовая акция, а не постоянная цена, и съедать она
# может больше. Но не всё.
MIN_MARGIN_PCT = 20.0

# Запасной процент разового предложения — на случай, когда у тарифа не задана
# offer_price_rub (завели новый план, цену акции забыли). Обычно предложение
# идёт по абсолютной цене из прайса, см. resolve().
#
# 18%, а не прежние 25%: после перехода на цены лендинга годовой стоит 5 990, и
# −25% дают 4 493 при себестоимости 3 893 — это маржа 13,3% при поле в 20%.
# То есть запасной вариант САМ падал бы с 400 в момент показа скидки, а это
# худшая из возможных минут. Потолок считается так: цена после скидки должна
# быть не ниже 3893 / 0,8 = 4 867, значит скидка не больше 18,7%.
WINBACK_PERCENT = 18
WINBACK_HOURS = 48

# Приглашённому — скидка, пригласившему — дни подписки.
REFERRAL_PERCENT = 15
REFERRAL_REWARD_DAYS = 7

# Без I, O, 0 и 1: код диктуют голосом и переписывают с экрана телефона.
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

_PERIOD_DAYS = {"week": 7, "month": 30}
_PLAN_DAYS = {"weekly": 7, "monthly": 30, "yearly": 365}


def _generate_code(prefix: str, length: int = 6) -> str:
    return f"{prefix}{''.join(secrets.choice(_ALPHABET) for _ in range(length))}"


def discounted_price(price_rub: int, percent_off: int) -> int:
    """Цена со скидкой, округлённая вверх до рубля.

    Вверх, а не арифметически: Робокасса принимает сумму, которую мы сами же
    записали в payments.amount и потом сверяем в вебхуке. Разойтись на копейку
    здесь — значит получить оплату, которая молча не применится (вебхук вернёт
    OK и ничего не сделает, см. robokassa_result).
    """
    return -(-price_rub * (100 - percent_off) // 100)


async def plan_worst_case_cost(db: AsyncSession, plan_type: str) -> float | None:
    """Себестоимость включённого в тариф за весь его срок. None — если хоть
    одна функция с потолком не имеет замеренной себестоимости: тогда маржу
    считать не из чего, и притворяться нулём нельзя."""
    rows = (await db.execute(
        text("""
            SELECT pl.feature, pl.cap, pl.period, fc.unit_cost_rub
            FROM plan_limits pl
            LEFT JOIN feature_costs fc ON fc.feature_name = pl.feature
            WHERE pl.plan_type = :p
        """),
        {"p": plan_type},
    )).mappings().all()

    days = _PLAN_DAYS.get(plan_type)
    total = 0.0
    for r in rows:
        if r["unit_cost_rub"] is None:
            return None
        windows = (days / _PERIOD_DAYS[r["period"]]) if days and r["period"] in _PERIOD_DAYS else 1
        total += r["cap"] * windows * float(r["unit_cost_rub"])
    return round(total, 2)


async def assert_price_above_floor(db: AsyncSession, plan_type: str, discounted_rub: int) -> None:
    """Не дать продать тариф ниже пола маржи. Незамеренная себестоимость
    пропускает: запрещать по незнанию хуже, чем разрешить — но это видно на
    экране «Тарифы» как unmeasured."""
    cost = await plan_worst_case_cost(db, plan_type)
    if cost is None or discounted_rub <= 0:
        return
    margin = (discounted_rub - cost) / discounted_rub * 100
    if margin < MIN_MARGIN_PCT:
        raise HTTPException(
            status_code=400,
            detail=(f"Скидка уводит маржу к {margin:.1f}% при поле {MIN_MARGIN_PCT:.0f}%: "
                    f"{plan_type} за {discounted_rub} ₽ стоит нам {cost:.0f} ₽"),
        )


async def resolve(db: AsyncSession, code: str, profile_id: int, plan_type: str) -> dict:
    """Проверить код и посчитать цену. Бросает 400 с человеческой причиной.

    Причины разные намеренно: «просрочен» и «уже применяли» — это разные
    ситуации для того, кто вводит код, и одинаковое «код недействителен» на оба
    случая заставляет человека вводить его снова.
    """
    code = (code or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Пустой код")

    row = (await db.execute(
        text("SELECT * FROM discounts WHERE code = :c"), {"c": code}
    )).mappings().first()

    if not row or not row["is_active"]:
        raise HTTPException(status_code=400, detail="Такого кода нет")
    if row["expires_at"] is not None and row["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Срок действия кода истёк")
    if row["max_uses"] is not None and row["uses"] >= row["max_uses"]:
        raise HTTPException(status_code=400, detail="Код исчерпан")
    if row["plan_type"] and row["plan_type"] != plan_type:
        raise HTTPException(status_code=400, detail=f"Код действует только на тариф «{row['plan_type']}»")
    if row["owner_profile_id"] == profile_id and row["kind"] == "referral":
        raise HTTPException(status_code=400, detail="Это ваш собственный код — он для друзей")

    used = (await db.execute(
        text("SELECT 1 FROM discount_redemptions WHERE code = :c AND user_profile_id = :pid"),
        {"c": code, "pid": profile_id},
    )).first()
    if used:
        raise HTTPException(status_code=400, detail="Вы уже применяли этот код")

    plan = (await db.execute(
        text("SELECT price_rub, offer_price_rub FROM subscription_pricing "
             "WHERE plan_type = :p AND is_active = true"),
        {"p": plan_type},
    )).mappings().first()
    if plan is None:
        raise HTTPException(status_code=400, detail=f"Неизвестный тариф: {plan_type}")

    price = int(plan["price_rub"])

    # Разовое предложение идёт по цене из прайса, а не по проценту.
    #
    # На лендинге это 199 / 449 / 4 999 — числа психологические, в один процент
    # они не ложатся (−33,4%, −25,0%, −16,5%), а percent_off хранится целым.
    # Промокоды и рефералки остаются на процентах: там важна именно доля, её
    # называют человеку голосом («минус пятнадцать»).
    offer = plan["offer_price_rub"]
    if row["kind"] == "winback" and offer is not None:
        final = int(offer)
        percent_shown = round((price - final) / price * 100) if price else 0
    else:
        final = discounted_price(price, row["percent_off"])
        percent_shown = row["percent_off"]

    await assert_price_above_floor(db, plan_type, final)

    return {
        "code": code,
        "kind": row["kind"],
        "percent_off": percent_shown,
        "price_rub": price,
        "discounted_rub": final,
        "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None,
    }


async def redeem(db: AsyncSession, code: str, profile_id: int, invoice_id: int,
                 plan_type: str, price_rub: int, discounted_rub: int) -> None:
    """Записать применение после успешной оплаты. Вызывается из вебхука.

    ON CONFLICT DO NOTHING, а не проверка перед вставкой: вебхук Робокассы
    повторяется при любой неуверенности в доставке, и второй заход не должен
    ни падать, ни выдавать пригласившему вторую неделю.
    """
    inserted = (await db.execute(
        text("""
            INSERT INTO discount_redemptions
              (code, user_profile_id, invoice_id, plan_type, price_rub, discounted_rub)
            VALUES (:c, :pid, :inv, :plan, :price, :disc)
            ON CONFLICT (code, user_profile_id) DO NOTHING
            RETURNING id
        """),
        {"c": code, "pid": profile_id, "inv": invoice_id, "plan": plan_type,
         "price": price_rub, "disc": discounted_rub},
    )).first()
    if not inserted:
        return

    await db.execute(text("UPDATE discounts SET uses = uses + 1 WHERE code = :c"), {"c": code})

    owner = (await db.execute(
        text("SELECT owner_profile_id FROM discounts WHERE code = :c AND kind = 'referral'"),
        {"c": code},
    )).scalar()
    if owner:
        # Пригласившему — дни подписки. GREATEST(expires_at, NOW()) по той же
        # причине, что и в оплате: у активного подписчика награда должна
        # ложиться сверху, а не обнулять остаток.
        await db.execute(
            text("""
                INSERT INTO user_subscriptions
                  (user_profile_id, subscription_type, status, start_date, expires_at)
                VALUES (:pid, 'monthly', 'active', NOW(), NOW() + make_interval(days => :d))
                ON CONFLICT (user_profile_id) DO UPDATE
                SET status = 'active',
                    expires_at = GREATEST(user_subscriptions.expires_at, NOW())
                                 + make_interval(days => :d)
            """),
            {"pid": owner, "d": REFERRAL_REWARD_DAYS},
        )


async def referral_code_for(db: AsyncSession, profile_id: int) -> str:
    """Код пользователя, создаётся при первом запросе.

    Лениво, а не при регистрации: 301 профиль из 297 никогда никого не
    пригласит, и заводить каждому строку заранее — это таблица, которая на 99%
    состоит из неиспользованного.
    """
    existing = (await db.execute(
        text("SELECT code FROM discounts WHERE owner_profile_id = :pid AND kind = 'referral'"),
        {"pid": profile_id},
    )).scalar()
    if existing:
        return existing

    for _ in range(5):
        code = _generate_code("REF")
        created = (await db.execute(
            text("""
                INSERT INTO discounts (code, kind, percent_off, owner_profile_id)
                VALUES (:c, 'referral', :pct, :pid)
                ON CONFLICT (code) DO NOTHING
                RETURNING code
            """),
            {"c": code, "pct": REFERRAL_PERCENT, "pid": profile_id},
        )).scalar()
        if created:
            return created
    raise HTTPException(status_code=500, detail="Не удалось выдать реферальный код")


def in_offer_group(user_id: str) -> bool:
    """Контрольная группа для гипотезы про скидку.

    Делится детерминированно по user_id, а не случайно при показе: иначе один и
    тот же человек попадал бы то в тестовую, то в контрольную группу при каждом
    открытии пейволла, и сравнивать было бы нечего.
    """
    return int(hashlib.md5(str(user_id).encode()).hexdigest(), 16) % 2 == 0


async def grant_winback(db: AsyncSession, profile_id: int, user_id: str) -> dict | None:
    """Выдать разовое предложение тому, у кого только что кончился бесплатный
    лимит. Возвращает код или None, если человек в контрольной группе либо
    предложение уже выдавалось.

    Одно на человека за всю жизнь: смысл в том, что окно закрывается. Если
    выдавать заново при каждом упоре в лимит, срочность — обман, и человек
    научится ждать следующего.
    """
    if not in_offer_group(user_id):
        return None

    existing = (await db.execute(
        text("SELECT code, expires_at FROM discounts WHERE owner_profile_id = :pid AND kind = 'winback'"),
        {"pid": profile_id},
    )).mappings().first()
    if existing:
        return None

    code = _generate_code("SALE")
    await db.execute(
        text("""
            INSERT INTO discounts (code, kind, percent_off, owner_profile_id, expires_at, max_uses)
            VALUES (:c, 'winback', :pct, :pid, NOW() + make_interval(hours => :h), 1)
        """),
        {"c": code, "pct": WINBACK_PERCENT, "pid": profile_id, "h": WINBACK_HOURS},
    )
    return {"code": code, "percent_off": WINBACK_PERCENT}


async def active_offer(db: AsyncSession, profile_id: int) -> dict | None:
    """Живое личное предложение, если есть. Читает пейволл, чтобы показать
    таймер и подставить код без ввода руками."""
    row = (await db.execute(
        text("""
            SELECT code, percent_off, expires_at FROM discounts
            WHERE owner_profile_id = :pid AND kind = 'winback' AND is_active
              AND (expires_at IS NULL OR expires_at > NOW())
              AND (max_uses IS NULL OR uses < max_uses)
            ORDER BY created_at DESC LIMIT 1
        """),
        {"pid": profile_id},
    )).mappings().first()
    if not row:
        return None
    return {
        "code": row["code"],
        "percent_off": row["percent_off"],
        "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None,
    }
