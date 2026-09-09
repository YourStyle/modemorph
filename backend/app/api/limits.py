"""
Лимиты планов. Кредитов больше нет.

Раньше здесь было две валюты сразу: бесплатный тариф в таблице `limits`,
включённое в подписку в `subscription_usage`, и кредиты как третий слой, на
который сваливались все, кто вышел за первые два. Кредит не заработал ни разу
за десять месяцев (ни одного успешного платежа за пак), зато исправно делал
поведение непредсказуемым: одна и та же кнопка могла списать лимит, кредит или
ничего, и ответить это могла только база.

Теперь ровно одно правило: у человека есть план (free, если он не платит), у
плана есть потолки в `plan_limits`, потолок кончился — 402 и предложение
перейти на план выше. Никаких «можно продолжить, но за другую валюту».
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user

router = APIRouter()

ALLOWED_FEATURES = {"wardrobe_items_anlyzed", "ai_requests", "ideas_viewed", "outfits_saved", "vton_used"}

FREE_PLAN = "free"

# Длительность оплаченного плана. Днями, а не месяцами, потому что недельный
# тариф в месяцах не выражается. Живёт здесь, рядом с потолками, чтобы вебхук
# оплаты и админская выдача подписки не разошлись в том, что такое «годовой».
PLAN_DAYS = {"weekly": 7, "monthly": 30, "yearly": 365}

# Длина периода не приходит от пользователя — она берётся из plan_limits.period,
# а CHECK на колонке допускает только эти три значения. Подстановка в SQL идёт
# через этот словарь, а не форматированием того, что пришло из запроса.
_PERIOD_SQL = {"week": "INTERVAL '7 days'", "month": "INTERVAL '1 month'"}

# Безлимит. Отдаётся фронту как остаток у функции, для которой потолка нет
# (образы, а у платных планов — лента идей): рисовать там счётчик нечем.
UNLIMITED = 999


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


async def _plan_of(db: AsyncSession, profile_id) -> str:
    """Действующий план. Нет активной подписки — значит бесплатный."""
    result = await db.execute(
        text("""
            SELECT subscription_type FROM user_subscriptions
            WHERE user_profile_id = :pid AND status = 'active' AND expires_at > NOW()
            ORDER BY expires_at DESC
            LIMIT 1
        """),
        {"pid": profile_id},
    )
    row = result.first()
    return (row[0] if row and row[0] else FREE_PLAN)


async def _plan_cap(db: AsyncSession, plan: str, feature: str) -> tuple[int, str] | None:
    """(потолок, период) или None, если функция на этом плане безлимитна.

    Отсутствие строки — это «безлимит», а не «ноль». Ноль пришлось бы ставить
    явно, и именно так его и надо ставить, если функцию когда-нибудь закроют:
    молчание таблицы не должно уметь выключать продукт.
    """
    result = await db.execute(
        text("SELECT cap, period FROM plan_limits WHERE plan_type = :p AND feature = :f"),
        {"p": plan, "f": feature},
    )
    row = result.first()
    return (row[0], row[1]) if row else None


async def _used(db: AsyncSession, profile_id, feature: str, plan: str, period: str) -> int:
    """Сколько израсходовано в текущем периоде. Ничего не пишет.

    Счётчик, накопленный под другим планом, читается как ноль: подписка
    кончилась — потраченное по ней не должно съедать бесплатный тариф, и
    наоборот. Физически строку обнулит _claim при следующем списании.
    """
    stale = "" if period == "once" else f" AND NOW() < period_started_at + {_PERIOD_SQL[period]}"
    result = await db.execute(
        text(f"""
            SELECT used FROM subscription_usage
            WHERE user_profile_id = :pid AND feature = :f AND plan_type = :plan{stale}
        """),
        {"pid": profile_id, "f": feature, "plan": plan},
    )
    row = result.first()
    return row[0] if row else 0


async def _claim(db: AsyncSession, profile_id, feature: str, count: int,
                 cap: int, period: str, plan: str) -> int | None:
    """Занять count единиц. Возвращает остаток или None, если потолок исчерпан.

    Два запроса вместо одного: ленивый сброс и атомарный захват — разные вещи, и
    слитые в один ON CONFLICT они читаются как ребус. Захват всё равно атомарен —
    условие «не превысить cap» живёт внутри UPDATE, поэтому две параллельные
    примерки не могут обе пройти последнюю единицу.
    """
    if count > cap:
        return None

    expired = "" if period == "once" else f" OR NOW() >= period_started_at + {_PERIOD_SQL[period]}"
    await db.execute(
        text(f"""
            UPDATE subscription_usage
            SET used = 0, period_started_at = NOW(), plan_type = :plan
            WHERE user_profile_id = :pid AND feature = :f
              AND (plan_type <> :plan{expired})
        """),
        {"pid": profile_id, "f": feature, "plan": plan},
    )

    result = await db.execute(
        text("""
            INSERT INTO subscription_usage (user_profile_id, feature, used, period_started_at, plan_type)
            VALUES (:pid, :f, :cnt, NOW(), :plan)
            ON CONFLICT (user_profile_id, feature) DO UPDATE
                SET used = subscription_usage.used + :cnt
                WHERE subscription_usage.used + :cnt <= :cap
            RETURNING used
        """),
        {"pid": profile_id, "f": feature, "cnt": count, "cap": cap, "plan": plan},
    )
    row = result.first()
    return (cap - row[0]) if row else None


async def _can_use_feature(db: AsyncSession, profile_id, feature: str, count: int) -> tuple[bool, int]:
    feature = _validate_feature(feature)

    plan = await _plan_of(db, profile_id)
    limit = await _plan_cap(db, plan, feature)
    if limit is None:
        return True, UNLIMITED

    cap, period = limit
    used = await _used(db, profile_id, feature, plan, period)
    return used + count <= cap, max(0, cap - used)


async def _use_feature(db: AsyncSession, profile_id, feature: str, count: int) -> tuple[bool, int]:
    feature = _validate_feature(feature)

    if count <= 0:
        raise HTTPException(status_code=400, detail="count must be positive")

    plan = await _plan_of(db, profile_id)
    limit = await _plan_cap(db, plan, feature)
    if limit is None:
        return True, UNLIMITED

    cap, period = limit
    left = await _claim(db, profile_id, feature, count, cap, period, plan)
    return (True, left) if left is not None else (False, 0)


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
    # No-op: план и его потолки читаются вживую при каждом списании. Ничего
    # материализовать не надо — ровно этим и был баг с limits=999, который
    # никогда не откатывался обратно после истечения подписки.
    await _get_profile_id(db, user["id"])
    return {"success": True}
