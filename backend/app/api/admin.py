"""Admin endpoints — complete set."""

import json as json_lib

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_admin_user

router = APIRouter()


@router.get("/analytics")
async def analytics(user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    activity = await db.execute(text("SELECT activity_date, count(*) as users FROM daily_user_activity GROUP BY activity_date ORDER BY activity_date DESC LIMIT 30"))
    total = await db.execute(text("SELECT count(*) FROM user_profiles"))
    return {"daily_activity": [dict(r) for r in activity.mappings().all()], "total_users": total.scalar()}


@router.get("/users")
async def list_users(search: str = Query(""), user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    sql = """
        SELECT up.*, u.email, u.raw_user_meta_data, u.created_at as user_created_at
        FROM user_profiles up JOIN users u ON u.id = up.user_id
    """
    binds = {}
    if search:
        sql += " WHERE u.email ILIKE :s OR u.raw_user_meta_data::text ILIKE :s"
        binds["s"] = f"%{search}%"
    sql += " ORDER BY u.created_at DESC LIMIT 200"
    result = await db.execute(text(sql), binds)
    rows = result.mappings().all()

    users = []
    for r in rows:
        row = dict(r)
        pid = row.get("id")

        # Get subscriptions array
        subs = await db.execute(
            text("SELECT subscription_type, status, start_date, expires_at as end_date, credits_included FROM user_subscriptions WHERE user_profile_id = :pid ORDER BY start_date DESC"),
            {"pid": pid},
        )
        row["user_subscriptions"] = [dict(s) for s in subs.mappings().all()]

        # Get credits array
        creds = await db.execute(
            text("SELECT credits_balance, updated_at FROM user_credits WHERE user_profile_id = :pid"),
            {"pid": pid},
        )
        row["user_credits"] = [dict(c) for c in creds.mappings().all()]

        # Get limits array
        lims = await db.execute(
            text("SELECT wardrobe_items_anlyzed, ai_requests, ideas_viewed, outfits_saved, vton_used FROM limits WHERE user_profile_id = :pid"),
            {"pid": pid},
        )
        row["limits"] = [dict(l) for l in lims.mappings().all()]

        # Extract full_name from metadata
        meta = row.get("raw_user_meta_data") or {}
        if isinstance(meta, dict):
            row["full_name"] = meta.get("full_name") or meta.get("telegram_first_name") or ""

        users.append(row)

    return {"users": users}


@router.get("/metrics")
async def metrics(user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    async def safe_scalar(sql: str, default=0):
        try:
            return (await db.execute(text(sql))).scalar() or default
        except Exception:
            await db.rollback()
            return default

    async def safe_rows(sql: str):
        try:
            result = await db.execute(text(sql))
            return result.all()
        except Exception:
            await db.rollback()
            return []

    total_users = await safe_scalar("SELECT count(*) FROM user_profiles")
    active_subs = await safe_scalar("SELECT count(*) FROM user_subscriptions WHERE status='active' AND expires_at > NOW()")
    mau = await safe_scalar("SELECT count(DISTINCT user_id) FROM daily_user_activity WHERE activity_date >= CURRENT_DATE - 30")
    dau = await safe_scalar("SELECT count(DISTINCT user_id) FROM daily_user_activity WHERE activity_date = CURRENT_DATE")

    reg_rows = await safe_rows("SELECT DATE(created_at) as date, count(*) as count FROM user_profiles WHERE created_at >= CURRENT_DATE - 30 GROUP BY DATE(created_at) ORDER BY date")
    registrations = [{"date": str(r.date), "count": r.count} for r in reg_rows]

    act_rows = await safe_rows("SELECT activity_date as date, count(*) as count FROM daily_user_activity WHERE activity_date >= CURRENT_DATE - 30 GROUP BY activity_date ORDER BY activity_date")
    activity = [{"date": str(r.date), "count": r.count} for r in act_rows]

    return {
        "summary": {
            "totalUsers": total_users,
            "mau": mau,
            "dau": dau,
            "activeSubscriptions": active_subs,
        },
        "charts": {
            "registrations": registrations,
            "activity": activity,
        },
        "total_users": total_users,
        "active_subscriptions": active_subs,
    }


@router.post("/grant-credits")
async def grant_credits(request: Request, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    user_id = body.get("userId")
    credits = body.get("credits", 0)
    sub_duration = body.get("subscriptionDuration")

    if not user_id:
        raise HTTPException(status_code=400, detail="userId required")

    profile = await db.execute(text("SELECT id FROM user_profiles WHERE user_id = :uid"), {"uid": user_id})
    p = profile.first()
    if not p:
        raise HTTPException(status_code=404, detail="User not found")
    pid = p[0]

    if credits and credits > 0:
        await db.execute(text("UPDATE user_credits SET credits_balance = credits_balance + :amt WHERE user_profile_id = :pid"), {"amt": credits, "pid": pid})
        await db.execute(text("INSERT INTO credit_transactions (user_profile_id, amount, reason, description, created_at) VALUES (:pid, :amt, 'admin_grant', :desc, NOW())"),
            {"pid": pid, "amt": credits, "desc": f"Admin granted {credits} credits"})

    if sub_duration in ("monthly", "yearly"):
        duration = "1 month" if sub_duration == "monthly" else "1 year"
        await db.execute(text("INSERT INTO user_subscriptions (user_profile_id, subscription_type, status, start_date, expires_at) VALUES (:pid, :stype, 'active', NOW(), NOW() + :dur::interval)"),
            {"pid": pid, "stype": sub_duration, "dur": duration})
        await db.execute(text("UPDATE limits SET wardrobe_items_anlyzed=999, ai_requests=999, ideas_viewed=999, outfits_saved=999, vton_used=999 WHERE user_profile_id = :pid"), {"pid": pid})

    await db.commit()
    return {"success": True}


@router.post("/reset-onboarding")
async def reset_onboarding(request: Request, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    user_id = body.get("userId")
    if not user_id:
        raise HTTPException(status_code=400, detail="userId required")
    await db.execute(text("UPDATE user_profiles SET onboarding_complete = false WHERE user_id = :uid"), {"uid": user_id})
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
        {"msg": body.get("message_text", ""), "cron": body.get("cron_expression", "")})
    await db.commit()
    return {"data": dict(result.mappings().first())}


@router.patch("/reminders")
async def update_reminder(request: Request, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    reminder_id = body.get("id")
    if not reminder_id:
        raise HTTPException(status_code=400, detail="id required")
    updates = body.get("updates", {})
    allowed = ["message_text", "cron_expression", "is_active"]
    set_parts = [f"{k} = :{k}" for k in updates if k in allowed]
    if not set_parts:
        return {"success": True}
    params = {k: v for k, v in updates.items() if k in allowed}
    params["id"] = reminder_id
    await db.execute(text(f"UPDATE reminder_configs SET {', '.join(set_parts)} WHERE id = :id"), params)
    await db.commit()
    return {"success": True}


@router.delete("/reminders")
async def delete_reminder(request: Request, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    reminder_id = body.get("id")
    if not reminder_id:
        raise HTTPException(status_code=400, detail="id required")
    await db.execute(text("DELETE FROM reminder_configs WHERE id = :id"), {"id": reminder_id})
    await db.commit()
    return {"success": True}


@router.get("/broadcast")
async def list_broadcasts(user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT * FROM broadcast_messages ORDER BY created_at DESC LIMIT 50"))
    return {"data": [dict(r) for r in result.mappings().all()]}


@router.post("/broadcast")
async def send_broadcast(request: Request, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    result = await db.execute(
        text("INSERT INTO broadcast_messages (admin_user_id, message_text, created_at) VALUES (:uid, :msg, NOW()) RETURNING *"),
        {"uid": user["id"], "msg": body.get("message_text", "")})
    await db.commit()
    return {"data": dict(result.mappings().first())}


# ── Missing admin endpoints ──

@router.patch("/subscription-pricing")
async def update_subscription_pricing(request: Request, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    pricing_id = body.get("id")
    updates = body.get("updates", {})
    if not pricing_id or not updates:
        raise HTTPException(status_code=400, detail="id and updates required")
    allowed = ["price_rub", "credits", "display_name", "description", "is_active"]
    set_parts = [f'"{k}" = :{k}' for k in updates if k in allowed]
    if not set_parts:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    params = {k: v for k, v in updates.items() if k in allowed}
    params["id"] = pricing_id
    await db.execute(text(f"UPDATE subscription_pricing SET {', '.join(set_parts)}, updated_at = NOW() WHERE id = :id"), params)
    await db.commit()
    return {"success": True}


@router.patch("/credit-packs")
async def update_credit_packs(request: Request, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    pack_id = body.get("id")
    updates = body.get("updates", {})
    if not pack_id or not updates:
        raise HTTPException(status_code=400, detail="id and updates required")
    allowed = ["name", "credits", "price_rub", "is_active"]
    set_parts = [f'"{k}" = :{k}' for k in updates if k in allowed]
    if not set_parts:
        raise HTTPException(status_code=400, detail="No valid fields")
    params = {k: v for k, v in updates.items() if k in allowed}
    params["id"] = pack_id
    await db.execute(text(f"UPDATE credit_packs SET {', '.join(set_parts)} WHERE id = :id"), params)
    await db.commit()
    return {"success": True}


@router.post("/clean-recommendations")
async def clean_recommendations(user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("DELETE FROM main_recommendations WHERE look_sections IS NULL OR look_sections::text = '[]' RETURNING id"))
    count = len(result.all())
    await db.commit()
    return {"success": True, "deleted": count}


@router.post("/mark-clothing-types")
async def mark_clothing_types(user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Auto-match clothing types for untagged wardrobe items."""
    result = await db.execute(text("""
        UPDATE wardrobe_user_items wui SET clothing_type = bwi.clothing_type
        FROM basic_wardrobe_items bwi WHERE wui.basic_item_id = bwi.id
        AND (wui.clothing_type IS NULL OR wui.clothing_type = '') AND bwi.clothing_type IS NOT NULL
    """))
    await db.commit()
    return {"success": True, "updated": result.rowcount}


@router.get("/credit-packs")
async def get_credit_packs(user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT * FROM credit_packs ORDER BY price_rub"))
    return {"data": [dict(r) for r in result.mappings().all()]}


@router.get("/subscription-pricing")
async def get_subscription_pricing(user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT * FROM subscription_pricing ORDER BY price_rub"))
    return {"data": [dict(r) for r in result.mappings().all()]}


@router.get("/feature-costs")
async def get_feature_costs(user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT * FROM feature_costs ORDER BY feature_name"))
    return {"data": [dict(r) for r in result.mappings().all()]}


@router.patch("/feature-costs")
async def update_feature_cost(request: Request, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    cost_id = body.get("id")
    updates = body.get("updates", {})
    if not cost_id:
        raise HTTPException(status_code=400, detail="id required")
    allowed = ["cost_credits", "display_name", "description", "is_active"]
    set_parts = [f'"{k}" = :{k}' for k in updates if k in allowed]
    if not set_parts:
        return {"success": True}
    params = {k: v for k, v in updates.items() if k in allowed}
    params["id"] = cost_id
    await db.execute(text(f"UPDATE feature_costs SET {', '.join(set_parts)}, updated_at = NOW() WHERE id = :id"), params)
    await db.commit()
    return {"success": True}
