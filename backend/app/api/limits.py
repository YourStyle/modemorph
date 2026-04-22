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
        text("SELECT cost_credits FROM feature_costs WHERE feature_name = :f"),
        {"f": feature},
    )
    row = result.first()
    return row[0] if row else 1


async def _can_use_feature(db: AsyncSession, profile_id, feature: str, count: int) -> tuple[bool, int]:
    feature = _validate_feature(feature)

    if await _is_subscriber(db, profile_id):
        return True, 999

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
        return True, 999

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
    profile_id = await _get_profile_id(db, user["id"])
    if await _is_subscriber(db, profile_id):
        await db.execute(
            text("""
                UPDATE limits
                SET wardrobe_items_anlyzed = 999, ai_requests = 999,
                    ideas_viewed = 999, outfits_saved = 999, vton_used = 999
                WHERE user_profile_id = :pid
            """),
            {"pid": profile_id},
        )
        await db.commit()
    return {"success": True}
