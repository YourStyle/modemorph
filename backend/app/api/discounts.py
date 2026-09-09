"""Скидки — то, что видит пользователь.

Три ручки: проверить введённый код, забрать свой реферальный, узнать про личное
предложение. Выдачу winback дёргает не фронт, а лимиты (limits.py) в момент
отказа: предложение обязано появляться от того, что человек упёрся, а не от
того, что он открыл экран.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.services import discounts as svc

router = APIRouter()


class CheckRequest(BaseModel):
    code: str
    planType: str


async def _profile_id(db: AsyncSession, user_id: str) -> int:
    row = (await db.execute(
        text("SELECT id FROM user_profiles WHERE user_id = :uid"), {"uid": user_id}
    )).first()
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found")
    return row[0]


@router.post("/check")
async def check_code(
    body: CheckRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Посчитать цену по коду. Ничего не расходует — код закрепляется только
    после оплаты, в вебхуке."""
    pid = await _profile_id(db, user["id"])
    return await svc.resolve(db, body.code, pid, body.planType)


@router.get("/mine")
async def my_discounts(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Реферальный код (создаётся при первом обращении) и живое личное
    предложение, если оно есть."""
    pid = await _profile_id(db, user["id"])
    code = await svc.referral_code_for(db, pid)
    await db.commit()

    invited = (await db.execute(
        text("SELECT count(*) FROM discount_redemptions WHERE code = :c"), {"c": code}
    )).scalar() or 0

    return {
        "referral": {
            "code": code,
            "percent_off": svc.REFERRAL_PERCENT,
            "reward_days": svc.REFERRAL_REWARD_DAYS,
            "invited": invited,
        },
        "offer": await svc.active_offer(db, pid),
    }
