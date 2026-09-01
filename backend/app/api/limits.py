"""
Limits & credits — with input validation and atomic operations.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user

router = APIRouter()

ALLOWED_FEATURES = {"wardrobe_items_anlyzed", "ai_requests", "ideas_viewed", "outfits_saved", "vton_used"}

# Что включено в подписку помесячно. Функции, которых тут нет, остаются
# безлимитными — они стоят копейки, и считать их дороже, чем отдать.
#
# Примерка — 14,10 ₽ за штуку: две генерации на дорогой модели, одежда и лицо.
# Годовой тариф даёт 249 ₽ в месяц (2 990 / 12), и на нём пятеро из восьми
# активных подписчиков. Десять примерок — это 141 ₽, то есть 57% выручки с
# годового тарифа и 35% с месячного; остального хватает на оцифровку.
#
# Это не отсечка, а граница включённого: всё сверх лимита продолжает работать
# по обычной цене за кредиты. Человека не выключают — ему перестают дарить
# самую дорогую операцию в продукте.
#
# По живым данным за 12 месяцев планку перешагнул бы один профиль (1554: до 43
# примерок в месяц при себестоимости 621 ₽ против 249 ₽ выручки) и ещё двое —
# по разу.
SUBSCRIBER_MONTHLY_CAPS = {"vton_used": 10}


def _validate_feature(feature: str) -> str:
    if feature not in ALLOWED_FEATURES:
        raise HTTPException(status_code=400, detail=f"Invalid feature: {feature}")
    return feature


class ConsumeRequest(BaseModel):
    feature: str
    count: int = 1


async def _get_profile_id(db: AsyncSession, user_id: str):
    result = await db.execute(
        text("SELECT id FROM user_profiles WHERE user_id = :uid"),
        {"uid": user_id},
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found")
    return row[0]


async def _is_subscriber(db: AsyncSession, profile_id) -> bool:
    result = await db.execute(
        text("""
            SELECT id FROM user_subscriptions
            WHERE user_profile_id = :pid AND status = 'active' AND expires_at > NOW()
            LIMIT 1
        """),
        {"pid": profile_id},
    )
    return result.first() is not None


async def _get_feature_cost(db: AsyncSession, feature: str) -> int:
    result = await db.execute(
        text("SELECT cost_credits, is_active FROM feature_costs WHERE feature_name = :f"),
        {"f": feature},
    )
    row = result.first()
    if not row:
        # Ключа нет — таблица цен разошлась с ALLOWED_FEATURES. Ровно это и было
        # сломано до миграции 037: имена не совпадали ни в одной строке, и этот
        # fallback молча делал любую функцию стоящей один кредит, что бы ни было
        # выставлено в админке. Оставляем минимум, а не ноль: бесплатность
        # должна быть выставлена явно, а не получиться из опечатки в ключе.
        # Сходимость ключей стережёт test_feature_costs.py.
        return 1
    # Выключенный тумблер в админке = функция не тарифицируется. Раньше он не
    # значил ничего — это была вторая неправда на том же экране.
    return row[0] if row[1] else 0


async def _subscriber_used(db: AsyncSession, profile_id, feature: str) -> int:
    """Сколько из включённого в подписку израсходовано в текущем месяце.

    Период, который уже истёк, читается как ноль: сброс ленивый, его делает
    _claim_subscriber_quota при следующем списании. Проверка не должна ничего
    писать — иначе GET-подобный вызов начнёт менять состояние.
    """
    result = await db.execute(
        text("""
            SELECT used FROM subscription_usage
            WHERE user_profile_id = :pid AND feature = :f
              AND NOW() < period_started_at + INTERVAL '1 month'
        """),
        {"pid": profile_id, "f": feature},
    )
    row = result.first()
    return row[0] if row else 0


async def _claim_subscriber_quota(db: AsyncSession, profile_id, feature: str, count: int, cap: int) -> int | None:
    """Занять count единиц включённого в подписку. Возвращает остаток или None,
    если включённое кончилось.

    Два запроса вместо одного, потому что ленивый сброс и атомарный захват — это
    разные вещи, и слитые в один ON CONFLICT они читаются как ребус. Захват всё
    равно атомарен: условие «не превысить cap» живёт внутри UPDATE, поэтому две
    параллельные примерки не могут обе пройти последнюю единицу.
    """
    if count > cap:
        return None

    await db.execute(
        text("""
            UPDATE subscription_usage SET used = 0, period_started_at = NOW()
            WHERE user_profile_id = :pid AND feature = :f
              AND NOW() >= period_started_at + INTERVAL '1 month'
        """),
        {"pid": profile_id, "f": feature},
    )

    result = await db.execute(
        text("""
            INSERT INTO subscription_usage (user_profile_id, feature, used, period_started_at)
            VALUES (:pid, :f, :cnt, NOW())
            ON CONFLICT (user_profile_id, feature) DO UPDATE
                SET used = subscription_usage.used + :cnt
                WHERE subscription_usage.used + :cnt <= :cap
            RETURNING used
        """),
        {"pid": profile_id, "f": feature, "cnt": count, "cap": cap},
    )
    row = result.first()
    return (cap - row[0]) if row else None


async def _can_use_feature(db: AsyncSession, profile_id, feature: str, count: int) -> tuple[bool, int]:
    feature = _validate_feature(feature)

    if await _is_subscriber(db, profile_id):
        cap = SUBSCRIBER_MONTHLY_CAPS.get(feature)
        if cap is None:
            return True, 999
        used = await _subscriber_used(db, profile_id, feature)
        if used + count <= cap:
            return True, cap - used
        # Включённое кончилось — дальше подписчик платит кредитами, как все.
        # Бесплатный тариф ему не полагается: он уже заплатил за месяц.
        credits_row = (await db.execute(
            text("SELECT credits_balance FROM user_credits WHERE user_profile_id = :pid"),
            {"pid": profile_id},
        )).first()
        credits = credits_row[0] if credits_row else 0
        return credits >= await _get_feature_cost(db, feature) * count, 0

    result = await db.execute(
        text(f'SELECT "{feature}" FROM limits WHERE user_profile_id = :pid'),
        {"pid": profile_id},
    )
    row = result.first()
    remaining = row[0] if row else 0

    if remaining >= count:
        return True, remaining

    credits_result = await db.execute(
        text("SELECT credits_balance FROM user_credits WHERE user_profile_id = :pid"),
        {"pid": profile_id},
    )
    credits_row = credits_result.first()
    credits = credits_row[0] if credits_row else 0
    cost = await _get_feature_cost(db, feature)

    if credits >= cost * count:
        return True, remaining

    return False, remaining


async def _use_feature(db: AsyncSession, profile_id, feature: str, count: int) -> tuple[bool, int]:
    """Consume feature usage with atomic operations to prevent race conditions."""
    feature = _validate_feature(feature)

    if count <= 0:
        raise HTTPException(status_code=400, detail="count must be positive")

    if await _is_subscriber(db, profile_id):
        cap = SUBSCRIBER_MONTHLY_CAPS.get(feature)
        if cap is None:
            return True, 999
        left = await _claim_subscriber_quota(db, profile_id, feature, count, cap)
        if left is not None:
            return True, left
        # Включённое в подписку кончилось. Не трогаем бесплатный тариф — он для
        # тех, кто не платит; списываем сразу с кредитов, ниже по общей ветке.
    else:
        # Atomic deduct from limits — only if sufficient
        result = await db.execute(
            text(f"""
                UPDATE limits SET "{feature}" = "{feature}" - :cnt
                WHERE user_profile_id = :pid AND "{feature}" >= :cnt
                RETURNING "{feature}"
            """),
            {"cnt": count, "pid": profile_id},
        )
        row = result.first()
        if row:
            return True, row[0]

    # Try atomic top-up from credits
    cost = await _get_feature_cost(db, feature)
    total_cost = cost * count

    # Цена ноль — функция бесплатная, кредиты не трогаем вовсе. Без этой ветки
    # UPDATE ... credits_balance - 0 WHERE credits_balance >= 0 проходит всегда,
    # и на каждый просмотр идеи в журнал ложится транзакция на −0. Журнал должен
    # отвечать на вопрос «за что списали», а не хранить сотни строк ни о чём.
    if total_cost == 0:
        return True, 0

    credit_result = await db.execute(
        text("""
            UPDATE user_credits SET credits_balance = credits_balance - :cost
            WHERE user_profile_id = :pid AND credits_balance >= :cost
            RETURNING credits_balance
        """),
        {"cost": total_cost, "pid": profile_id},
    )
    if credit_result.first():
        await db.execute(
            text("""
                INSERT INTO credit_transactions (user_profile_id, transaction_type, amount, reason, description, created_at)
                VALUES (:pid, 'spend', :amt, 'feature_topup', :desc, NOW())
            """),
            {"pid": profile_id, "amt": -total_cost, "desc": f"Auto-topup for {feature} x{count}"},
        )
        return True, 0

    return False, 0


@router.post("/check")
async def check_limits_endpoint(
    body: ConsumeRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile_id = await _get_profile_id(db, user["id"])
    ok, remaining = await _can_use_feature(db, profile_id, body.feature, body.count)
    return {"success": True, "canUse": ok, "remaining": remaining}


@router.post("/consume")
async def consume_limit(
    body: ConsumeRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile_id = await _get_profile_id(db, user["id"])
    ok, remaining = await _use_feature(db, profile_id, body.feature, body.count)
    if not ok:
        raise HTTPException(status_code=402, detail="payment_required")
    await db.commit()
    return {"success": True, "remaining": remaining}


@router.post("/reconcile")
async def reconcile_limits(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # No-op: unlimited-while-subscribed is handled live by _is_subscriber().
    # We intentionally no longer write 999 into the limits table — that value was
    # never restored on expiry, so churned subscribers kept unlimited access.
    await _get_profile_id(db, user["id"])
    return {"success": True}
