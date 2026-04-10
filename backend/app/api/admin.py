"""Admin endpoints."""

import json as json_lib

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_admin_user

router = APIRouter()


@router.get("/analytics")
async def analytics(user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    # Daily activity
    activity = await db.execute(text("""
        SELECT activity_date, count(*) as users
        FROM daily_user_activity
        GROUP BY activity_date ORDER BY activity_date DESC LIMIT 30
    """))
    # Total users
    total = await db.execute(text("SELECT count(*) FROM user_profiles"))
    return {
        "daily_activity": [dict(r) for r in activity.mappings().all()],
        "total_users": total.scalar(),
    }


@router.get("/users")
async def list_users(
    search: str = Query(""),
    user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    sql = """
        SELECT up.*, u.email, u.raw_user_meta_data, u.created_at as user_created_at,
               uc.credits_balance,
               us.subscription_type, us.status as sub_status, us.expires_at as sub_expires
        FROM user_profiles up
        JOIN users u ON u.id = up.user_id
        LEFT JOIN user_credits uc ON uc.user_profile_id = up.id
        LEFT JOIN user_subscriptions us ON us.user_profile_id = up.id
    """
    binds = {}
    if search:
        sql += " WHERE u.email ILIKE :s OR u.raw_user_meta_data::text ILIKE :s"
        binds["s"] = f"%{search}%"
    sql += " ORDER BY u.created_at DESC LIMIT 100"

    result = await db.execute(text(sql), binds)
    return {"users": [dict(r) for r in result.mappings().all()]}


@router.get("/metrics")
async def metrics(user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    total_users = (await db.execute(text("SELECT count(*) FROM user_profiles"))).scalar()
    active_subs = (await db.execute(text("SELECT count(*) FROM user_subscriptions WHERE status='active' AND expires_at > NOW()"))).scalar()
    total_items = (await db.execute(text("SELECT count(*) FROM wardrobe_user_items"))).scalar()
    total_events = (await db.execute(text("SELECT count(*) FROM usage_events"))).scalar()
    return {"total_users": total_users, "active_subscriptions": active_subs, "total_wardrobe_items": total_items, "total_events": total_events}


@router.post("/grant-credits")
async def grant_credits(request: Request, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    user_id = body.get("userId")
    credits = body.get("credits", 0)

    if not user_id or credits <= 0:
        raise HTTPException(status_code=400, detail="userId and credits required")

    profile = await db.execute(text("SELECT id FROM user_profiles WHERE user_id = :uid"), {"uid": user_id})
    p = profile.first()
    if not p:
        raise HTTPException(status_code=404, detail="User not found")
    pid = str(p[0])

    await db.execute(
        text("UPDATE user_credits SET credits_balance = credits_balance + :amt WHERE user_profile_id = :pid"),
        {"amt": credits, "pid": pid},
    )
    await db.execute(
        text("INSERT INTO credit_transactions (user_profile_id, amount, reason, description, created_at) VALUES (:pid, :amt, 'admin_grant', :desc, NOW())"),
        {"pid": pid, "amt": credits, "desc": f"Admin granted {credits} credits"},
    )
    await db.commit()
    return {"success": True}


@router.post("/reset-onboarding")
async def reset_onboarding(request: Request, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    user_id = body.get("userId")
    await db.execute(
        text("UPDATE user_profiles SET onboarding_completed = false WHERE user_id = :uid"),
        {"uid": user_id},
    )
    await db.commit()
    return {"success": True}


@router.get("/reminders")
async def get_reminders(user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT * FROM reminder_configs ORDER BY created_at"))
    return {"data": [dict(r) for r in result.mappings().all()]}


@router.post("/reminders")
async def create_reminder(request: Request, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    result = await db.execute(
        text("INSERT INTO reminder_configs (message_text, cron_expression, is_active, created_at) VALUES (:msg, :cron, true, NOW()) RETURNING *"),
        {"msg": body.get("message_text", ""), "cron": body.get("cron_expression", "")},
    )
    await db.commit()
    return {"data": dict(result.mappings().first())}


@router.post("/broadcast")
async def send_broadcast(request: Request, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    result = await db.execute(
        text("INSERT INTO broadcast_messages (admin_user_id, message_text, created_at) VALUES (:uid, :msg, NOW()) RETURNING *"),
        {"uid": user["id"], "msg": body.get("message_text", "")},
    )
    await db.commit()
    return {"data": dict(result.mappings().first())}
