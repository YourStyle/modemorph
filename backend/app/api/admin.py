"""Admin endpoints — complete set."""

import json as json_lib
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_admin_user
from app.services.telegram import send_bot_message

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/analytics")
async def analytics(user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Full product analytics — onboarding, aha-moment, value, engagement, retention, monetization, funnel, timeline."""

    async def scalar(sql: str, default=0):
        try:
            return (await db.execute(text(sql))).scalar() or default
        except Exception:
            await db.rollback()
            return default

    async def rows(sql: str):
        try:
            return (await db.execute(text(sql))).mappings().all()
        except Exception:
            await db.rollback()
            return []

    total_users = await scalar("SELECT count(*) FROM user_profiles")

    # ── Onboarding ──
    users_with_first_item = await scalar("SELECT count(DISTINCT user_id) FROM wardrobe_user_items")
    users_onboarding_complete = await scalar("SELECT count(*) FROM user_profiles WHERE onboarding_complete = true")

    # Wardrobe progress: count items per user, bucket by thresholds
    wardrobe_counts = await rows("""
        SELECT user_id, count(*) as cnt FROM wardrobe_user_items GROUP BY user_id
    """)
    users_wardrobe_30 = sum(1 for r in wardrobe_counts if r["cnt"] >= 15)
    users_wardrobe_50 = sum(1 for r in wardrobe_counts if r["cnt"] >= 25)
    users_wardrobe_100 = sum(1 for r in wardrobe_counts if r["cnt"] >= 50)

    # ── Aha-moment ──
    users_first_outfit = await scalar("SELECT count(DISTINCT user_id) FROM outfits")
    users_first_tryon = await scalar("SELECT count(DISTINCT user_profile_id) FROM usage_events WHERE feature = 'vton_used' OR feature = 'first_tryon_opened'")
    users_clicked_rec = await scalar("SELECT count(DISTINCT user_profile_id) FROM usage_events WHERE feature = 'recommendation_clicked'")

    # ── Value delivery ──
    total_outfits_saved = await scalar("SELECT count(*) FROM user_looks")
    users_saved_outfits = await scalar("SELECT count(DISTINCT user_id) FROM user_looks")
    total_outfits_shared = await scalar("SELECT count(DISTINCT user_profile_id) FROM usage_events WHERE feature = 'outfit_shared'")
    total_tasks_completed = await scalar("SELECT count(*) FROM usage_events WHERE feature = 'session_task_completed'")

    # Repeat task rate: % of users who did 2+ outfit saves
    users_with_repeat = await scalar("""
        SELECT count(*) FROM (SELECT user_id FROM user_looks GROUP BY user_id HAVING count(*) >= 2) sub
    """)
    repeat_task_rate = round(users_with_repeat / max(users_saved_outfits, 1) * 100, 1)
    outfits_per_user = round(total_outfits_saved / max(users_saved_outfits, 1), 1)

    # ── Engagement ──
    users_used_ai = await scalar("SELECT count(DISTINCT user_profile_id) FROM usage_events WHERE feature IN ('ai_assistant_used', 'ai_requests')")
    total_ai_sessions = await scalar("SELECT count(*) FROM usage_events WHERE feature IN ('ai_assistant_used', 'ai_requests')")

    # ── Retention (from daily_user_activity + user_profiles.created_at) ──
    # D1: users who came back the day after registration
    d1_users = await scalar("""
        SELECT count(DISTINCT up.id) FROM user_profiles up
        JOIN daily_user_activity dua ON dua.user_profile_id = up.id
        WHERE dua.activity_date = DATE(up.created_at) + 1
    """)
    d7_users = await scalar("""
        SELECT count(DISTINCT up.id) FROM user_profiles up
        JOIN daily_user_activity dua ON dua.user_profile_id = up.id
        WHERE dua.activity_date BETWEEN DATE(up.created_at) + 2 AND DATE(up.created_at) + 7
    """)
    d30_users = await scalar("""
        SELECT count(DISTINCT up.id) FROM user_profiles up
        JOIN daily_user_activity dua ON dua.user_profile_id = up.id
        WHERE dua.activity_date BETWEEN DATE(up.created_at) + 8 AND DATE(up.created_at) + 30
    """)
    # Users eligible for each retention window (registered at least N days ago)
    eligible_d1 = await scalar("SELECT count(*) FROM user_profiles WHERE created_at <= NOW() - INTERVAL '1 day'") or 1
    eligible_d7 = await scalar("SELECT count(*) FROM user_profiles WHERE created_at <= NOW() - INTERVAL '7 days'") or 1
    eligible_d30 = await scalar("SELECT count(*) FROM user_profiles WHERE created_at <= NOW() - INTERVAL '30 days'") or 1

    d1_retention = round(d1_users / max(eligible_d1, 1) * 100, 1)
    d7_retention = round(d7_users / max(eligible_d7, 1) * 100, 1)
    d30_retention = round(d30_users / max(eligible_d30, 1) * 100, 1)

    # ── Monetization ──
    paywall_shown = await scalar("SELECT count(*) FROM usage_events WHERE feature = 'paywall_shown'")
    conversions_to_premium = await scalar("SELECT count(*) FROM payments WHERE status = 'paid' AND meta->>'action' = 'subscribe'")
    premium_users = await scalar("SELECT count(*) FROM user_subscriptions WHERE status = 'active' AND expires_at > NOW()")
    premium_feature_uses = await scalar("SELECT count(*) FROM usage_events WHERE feature = 'premium_feature_used'")
    conversion_rate = round(conversions_to_premium / max(paywall_shown, 1) * 100, 1)

    # ── Funnel ──
    funnel = [
        {"stage": "Регистрация", "users": total_users},
        {"stage": "Первая вещь", "users": users_with_first_item},
        {"stage": "Онбординг завершён", "users": users_onboarding_complete},
        {"stage": "Первый образ", "users": users_first_outfit},
        {"stage": "Сохранили образ", "users": users_saved_outfits},
        {"stage": "AI ассистент", "users": users_used_ai},
        {"stage": "Premium", "users": premium_users},
    ]

    # ── Timeline (last 30 days from usage_events) ──
    timeline_rows = await rows("""
        SELECT DATE(occurred_at) as date,
            count(*) FILTER (WHERE feature = 'first_item_added') as first_item_added,
            count(*) FILTER (WHERE feature IN ('first_outfit_generated', 'outfit_saved')) as first_outfit_generated,
            count(*) FILTER (WHERE feature = 'outfit_saved') as outfit_saved,
            count(*) FILTER (WHERE feature IN ('ai_assistant_used', 'ai_requests')) as ai_assistant_used
        FROM usage_events
        WHERE occurred_at >= CURRENT_DATE - 30
        GROUP BY DATE(occurred_at) ORDER BY date
    """)
    timeline = [{"date": str(r["date"]), "first_item_added": r["first_item_added"],
                 "first_outfit_generated": r["first_outfit_generated"],
                 "outfit_saved": r["outfit_saved"], "ai_assistant_used": r["ai_assistant_used"]}
                for r in timeline_rows]

    # ── Revenue ──
    # MRR: active monthly subs + yearly subs / 12
    mrr_monthly = await scalar("""
        SELECT COALESCE(SUM(p.amount), 0) FROM payments p
        JOIN user_subscriptions us ON us.user_profile_id = (
            SELECT id FROM user_profiles WHERE user_id = p.user_id
        )
        WHERE p.status = 'paid' AND p.meta->>'action' = 'subscribe'
        AND p.meta->>'type' = 'monthly'
        AND us.status = 'active' AND us.expires_at > NOW()
    """)
    mrr_yearly = await scalar("""
        SELECT COALESCE(SUM(p.amount / 12.0), 0) FROM payments p
        JOIN user_subscriptions us ON us.user_profile_id = (
            SELECT id FROM user_profiles WHERE user_id = p.user_id
        )
        WHERE p.status = 'paid' AND p.meta->>'action' = 'subscribe'
        AND p.meta->>'type' = 'yearly'
        AND us.status = 'active' AND us.expires_at > NOW()
    """)
    mrr = round(float(mrr_monthly) + float(mrr_yearly), 0)

    total_revenue = await scalar("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'paid'")
    total_revenue = float(total_revenue)
    paying_count = await scalar("SELECT count(DISTINCT user_id) FROM payments WHERE status = 'paid'")

    arpu = round(total_revenue / max(total_users, 1), 1)
    arppu = round(total_revenue / max(paying_count, 1), 1)

    # LTV estimate: ARPPU × avg subscription lifetime in months
    avg_lifetime_months = await scalar("""
        SELECT COALESCE(
            AVG(EXTRACT(EPOCH FROM (LEAST(expires_at, NOW()) - start_date)) / 2592000.0),
            1.0
        ) FROM user_subscriptions WHERE start_date IS NOT NULL
    """)
    avg_lifetime_months = max(float(avg_lifetime_months), 1.0)
    ltv = round(arppu * avg_lifetime_months, 0)

    # Churn rate: expired subs in last 30 days / total subs that existed
    churned = await scalar("""
        SELECT count(*) FROM user_subscriptions
        WHERE expires_at BETWEEN NOW() - INTERVAL '30 days' AND NOW()
        AND status != 'active'
    """)
    total_subs_ever = await scalar("SELECT count(*) FROM user_subscriptions") or 1
    churn_rate = round(churned / max(total_subs_ever, 1) * 100, 1)

    # ── Stickiness ──
    stickiness = round(dau / max(mau, 1) * 100, 1) if mau else 0
    # Avg days active per user in last 30 days
    avg_days_active = await scalar("""
        SELECT COALESCE(AVG(days), 0) FROM (
            SELECT user_profile_id, count(DISTINCT activity_date) as days
            FROM daily_user_activity
            WHERE activity_date >= CURRENT_DATE - 30
            GROUP BY user_profile_id
        ) sub
    """)
    avg_days_active = round(float(avg_days_active), 1)

    # ── Cohort Retention (by registration week, last 12 weeks) ──
    cohort_rows = await rows("""
        WITH cohorts AS (
            SELECT
                up.id as profile_id,
                DATE_TRUNC('week', up.created_at)::date as cohort_week,
                up.created_at
            FROM user_profiles up
            WHERE up.created_at >= NOW() - INTERVAL '12 weeks'
        ),
        activity AS (
            SELECT
                c.cohort_week,
                count(DISTINCT c.profile_id) as cohort_size,
                count(DISTINCT c.profile_id) FILTER (
                    WHERE EXISTS (SELECT 1 FROM daily_user_activity d WHERE d.user_profile_id = c.profile_id
                        AND d.activity_date BETWEEN DATE(c.created_at) + 1 AND DATE(c.created_at) + 7)
                ) as week_1,
                count(DISTINCT c.profile_id) FILTER (
                    WHERE EXISTS (SELECT 1 FROM daily_user_activity d WHERE d.user_profile_id = c.profile_id
                        AND d.activity_date BETWEEN DATE(c.created_at) + 8 AND DATE(c.created_at) + 14)
                ) as week_2,
                count(DISTINCT c.profile_id) FILTER (
                    WHERE EXISTS (SELECT 1 FROM daily_user_activity d WHERE d.user_profile_id = c.profile_id
                        AND d.activity_date BETWEEN DATE(c.created_at) + 15 AND DATE(c.created_at) + 21)
                ) as week_3,
                count(DISTINCT c.profile_id) FILTER (
                    WHERE EXISTS (SELECT 1 FROM daily_user_activity d WHERE d.user_profile_id = c.profile_id
                        AND d.activity_date BETWEEN DATE(c.created_at) + 22 AND DATE(c.created_at) + 28)
                ) as week_4
            FROM cohorts c
            GROUP BY c.cohort_week
            ORDER BY c.cohort_week
        )
        SELECT * FROM activity
    """)
    cohort_retention = [{
        "week": str(r["cohort_week"]),
        "cohort_size": r["cohort_size"],
        "week_1": r["week_1"],
        "week_2": r["week_2"],
        "week_3": r["week_3"],
        "week_4": r["week_4"],
        "week_1_pct": round(r["week_1"] / max(r["cohort_size"], 1) * 100, 1),
        "week_2_pct": round(r["week_2"] / max(r["cohort_size"], 1) * 100, 1),
        "week_3_pct": round(r["week_3"] / max(r["cohort_size"], 1) * 100, 1),
        "week_4_pct": round(r["week_4"] / max(r["cohort_size"], 1) * 100, 1),
    } for r in cohort_rows]

    # ── Activation Analysis ──
    # For each key action, calculate D7 retention of users who did it vs. didn't
    activation_actions = [
        ("first_item", "wardrobe_user_items", "user_id"),
        ("first_outfit", "outfits", "user_id"),
        ("first_look_saved", "user_looks", "user_id"),
    ]
    activation = []
    for label, table, uid_col in activation_actions:
        did_action = await rows(f"""
            SELECT
                count(DISTINCT up.id) as total,
                count(DISTINCT up.id) FILTER (
                    WHERE EXISTS (SELECT 1 FROM daily_user_activity d
                        WHERE d.user_profile_id = up.id
                        AND d.activity_date BETWEEN DATE(up.created_at) + 1 AND DATE(up.created_at) + 7)
                ) as retained
            FROM user_profiles up
            WHERE up.created_at <= NOW() - INTERVAL '7 days'
            AND EXISTS (SELECT 1 FROM {table} t WHERE t.{uid_col} = up.user_id)
        """)
        didnt_action = await rows(f"""
            SELECT
                count(DISTINCT up.id) as total,
                count(DISTINCT up.id) FILTER (
                    WHERE EXISTS (SELECT 1 FROM daily_user_activity d
                        WHERE d.user_profile_id = up.id
                        AND d.activity_date BETWEEN DATE(up.created_at) + 1 AND DATE(up.created_at) + 7)
                ) as retained
            FROM user_profiles up
            WHERE up.created_at <= NOW() - INTERVAL '7 days'
            AND NOT EXISTS (SELECT 1 FROM {table} t WHERE t.{uid_col} = up.user_id)
        """)
        did = did_action[0] if did_action else {"total": 0, "retained": 0}
        didnt = didnt_action[0] if didnt_action else {"total": 0, "retained": 0}
        activation.append({
            "action": label,
            "did_total": did["total"],
            "did_retained": did["retained"],
            "did_retention_pct": round(did["retained"] / max(did["total"], 1) * 100, 1),
            "didnt_total": didnt["total"],
            "didnt_retained": didnt["retained"],
            "didnt_retention_pct": round(didnt["retained"] / max(didnt["total"], 1) * 100, 1),
        })

    # ── Time to Value ──
    ttv_first_item = await scalar("""
        SELECT COALESCE(
            EXTRACT(EPOCH FROM AVG(first_item_at - up.created_at)) / 3600.0, 0
        )
        FROM user_profiles up
        JOIN (SELECT user_id, MIN(created_at) as first_item_at FROM wardrobe_user_items GROUP BY user_id) wi
        ON wi.user_id = up.user_id
    """)
    ttv_first_outfit = await scalar("""
        SELECT COALESCE(
            EXTRACT(EPOCH FROM AVG(first_outfit_at - up.created_at)) / 3600.0, 0
        )
        FROM user_profiles up
        JOIN (SELECT user_id, MIN(created_at) as first_outfit_at FROM user_looks GROUP BY user_id) ul
        ON ul.user_id = up.user_id
    """)
    # Median (approximated via percentile)
    ttv_median_item = await scalar("""
        SELECT COALESCE(
            EXTRACT(EPOCH FROM PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY wi.first_item_at - up.created_at)) / 3600.0, 0
        )
        FROM user_profiles up
        JOIN (SELECT user_id, MIN(created_at) as first_item_at FROM wardrobe_user_items GROUP BY user_id) wi
        ON wi.user_id = up.user_id
    """)

    # ── DAU/MAU for stickiness (reuse from /metrics if available) ──
    dau_val = await scalar("SELECT count(DISTINCT user_profile_id) FROM daily_user_activity WHERE activity_date = CURRENT_DATE")
    mau_val = await scalar("SELECT count(DISTINCT user_profile_id) FROM daily_user_activity WHERE activity_date >= CURRENT_DATE - 30")

    return {
        "onboarding": {
            "users_with_first_item": users_with_first_item,
            "users_onboarding_complete": users_onboarding_complete,
            "users_wardrobe_30": users_wardrobe_30,
            "users_wardrobe_50": users_wardrobe_50,
            "users_wardrobe_100": users_wardrobe_100,
        },
        "ahaMoment": {
            "users_first_outfit": users_first_outfit,
            "users_first_tryon": users_first_tryon,
            "users_clicked_recommendation": users_clicked_rec,
        },
        "value": {
            "total_outfits_saved": total_outfits_saved,
            "users_saved_outfits": users_saved_outfits,
            "total_outfits_shared": total_outfits_shared,
            "total_tasks_completed": total_tasks_completed,
            "repeat_task_rate": repeat_task_rate,
            "outfits_per_active_user": outfits_per_user,
        },
        "engagement": {
            "users_used_ai": users_used_ai,
            "total_ai_sessions": total_ai_sessions,
        },
        "retention": {
            "d1_retention": d1_retention,
            "d7_retention": d7_retention,
            "d30_retention": d30_retention,
            "d1_users": d1_users,
            "d7_users": d7_users,
            "d30_users": d30_users,
        },
        "monetization": {
            "paywall_shown": paywall_shown,
            "conversions_to_premium": conversions_to_premium,
            "conversion_rate": conversion_rate,
            "premium_users": premium_users,
            "premium_feature_uses": premium_feature_uses,
        },
        "funnel": funnel,
        "timeline": timeline,
        "revenue": {
            "mrr": mrr,
            "total_revenue": total_revenue,
            "arpu": arpu,
            "arppu": arppu,
            "ltv": ltv,
            "paying_users": paying_count,
            "churn_rate": churn_rate,
            "avg_lifetime_months": round(avg_lifetime_months, 1),
        },
        "stickiness": {
            "dau": dau_val,
            "mau": mau_val,
            "ratio": stickiness,
            "avg_days_active": avg_days_active,
        },
        "cohortRetention": cohort_retention,
        "activation": activation,
        "timeToValue": {
            "avg_to_first_item_hours": round(float(ttv_first_item), 1),
            "avg_to_first_outfit_hours": round(float(ttv_first_outfit), 1),
            "median_to_first_item_hours": round(float(ttv_median_item), 1),
        },
    }


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


@router.get("/paying-users")
async def paying_users(user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """List all users who ever paid — subscriptions + credit purchases."""
    result = await db.execute(text("""
        SELECT DISTINCT ON (u.id)
            up.id as profile_id,
            up.user_id,
            u.email,
            u.raw_user_meta_data,
            up.full_name,
            up.created_at as registered_at,
            p.amount,
            p.status as payment_status,
            p.meta as payment_meta,
            p.created_at as payment_date,
            us.subscription_type,
            us.status as sub_status,
            us.expires_at as sub_expires
        FROM payments p
        JOIN user_profiles up ON up.user_id = p.user_id
        JOIN users u ON u.id = p.user_id
        LEFT JOIN user_subscriptions us ON us.user_profile_id = up.id AND us.status = 'active'
        WHERE p.status = 'paid'
        ORDER BY u.id, p.created_at DESC
    """))
    rows = result.mappings().all()

    paying = []
    for r in rows:
        row = dict(r)
        meta = row.get("raw_user_meta_data") or {}
        if isinstance(meta, str):
            try:
                meta = json_lib.loads(meta)
            except Exception:
                meta = {}

        # Get all payments for this user
        payments_result = await db.execute(text("""
            SELECT amount, status, meta, created_at FROM payments
            WHERE user_id = :uid AND status = 'paid' ORDER BY created_at DESC
        """), {"uid": row["user_id"]})

        paying.append({
            "profile_id": row["profile_id"],
            "user_id": str(row["user_id"]),
            "email": row.get("email") or "",
            "full_name": row.get("full_name") or meta.get("full_name") or meta.get("telegram_first_name") or "",
            "telegram_username": meta.get("telegram_username") or "",
            "telegram_id": meta.get("telegram_id") or meta.get("sub") or "",
            "registered_at": str(row.get("registered_at") or ""),
            "subscription_type": row.get("subscription_type"),
            "sub_status": row.get("sub_status"),
            "sub_expires": str(row.get("sub_expires") or ""),
            "payments": [
                {"amount": float(p["amount"]), "action": (p["meta"] or {}).get("action", ""),
                 "type": (p["meta"] or {}).get("type", ""), "date": str(p["created_at"])}
                for p in payments_result.mappings().all()
            ],
        })

    return {"paying_users": paying, "total": len(paying)}


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
    mau = await safe_scalar("SELECT count(DISTINCT user_profile_id) FROM daily_user_activity WHERE activity_date >= CURRENT_DATE - 30")
    dau = await safe_scalar("SELECT count(DISTINCT user_profile_id) FROM daily_user_activity WHERE activity_date = CURRENT_DATE")

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
        await db.execute(text("INSERT INTO credit_transactions (user_profile_id, transaction_type, amount, reason, description, created_at) VALUES (:pid, 'credit', :amt, 'admin_grant', :desc, NOW())"),
            {"pid": pid, "amt": credits, "desc": f"Admin granted {credits} credits"})

    if sub_duration in ("monthly", "yearly"):
        months = 1 if sub_duration == "monthly" else 12
        # UNIQUE(user_profile_id) means a plain INSERT 500s on repeat grants.
        # Stack instead of overwrite: a user with active time keeps it.
        await db.execute(text("""
            INSERT INTO user_subscriptions (user_profile_id, subscription_type, status, start_date, expires_at)
            VALUES (:pid, :stype, 'active', NOW(), NOW() + make_interval(months => :months))
            ON CONFLICT (user_profile_id) DO UPDATE
            SET subscription_type = EXCLUDED.subscription_type,
                status = 'active',
                expires_at = GREATEST(user_subscriptions.expires_at, NOW()) + make_interval(months => :months)
        """),
            {"pid": pid, "stype": sub_duration, "months": months})
        await db.execute(text("UPDATE limits SET wardrobe_items_anlyzed=999, ai_requests=999, ideas_viewed=999, outfits_saved=999, vton_used=999 WHERE user_profile_id = :pid"), {"pid": pid})

    await db.commit()
    return {"success": True}


# ── Gift template ──────────────────────────────────────────────────────
# One-shot: grants credits + subscription, sends Telegram notification,
# and flags user_profiles.pending_gift so the app shows a welcome sheet on
# next entry. Frontend calls this from the admin "🎁 Подарок" dialog.

_DEFAULT_GIFT_SHEET = {
    "title": "Вам подарок ✨",
    "body": "Мы подарили вам подписку и кредиты, чтобы вы могли попробовать всё без ограничений.",
    "bullets": [
        "Оцифровка гардероба по фото",
        "Подбор образов AI-стилистом",
        "Виртуальная примерка",
    ],
    "cta_text": "Круто, спасибо!",
}

_DEFAULT_BOT_MESSAGE = (
    "✨ <b>Вам выдана подписка!</b>\n\n"
    "Мы начислили <b>{credits}</b> кредитов и активировали подписку на <b>{duration_ru}</b>.\n\n"
    "Заходите в приложение — все лимиты сняты."
)

_DURATION_RU = {"monthly": "1 месяц", "yearly": "1 год"}


@router.post("/gift")
async def gift_user(
    request: Request,
    user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()
    target_user_id = body.get("userId")
    if not target_user_id:
        raise HTTPException(status_code=400, detail="userId required")

    credits = int(body.get("credits") or 0)
    sub_duration = body.get("subscriptionDuration")  # "monthly" | "yearly" | None

    sheet = {**_DEFAULT_GIFT_SHEET, **(body.get("welcomeSheet") or {})}
    # Replace known placeholders rather than .format() — admin-pasted text may
    # legitimately contain stray `{` / `}` (emoji, HTML, JSON) that would crash
    # str.format with ValueError/KeyError.
    _template = body.get("botMessage") or _DEFAULT_BOT_MESSAGE
    bot_message = (
        _template
        .replace("{credits}", str(credits if credits else "дополнительные"))
        .replace("{duration_ru}", _DURATION_RU.get(sub_duration, "подарочный период"))
    )

    # Resolve profile + telegram_id
    row = await db.execute(
        text("""
            SELECT up.id AS profile_id,
                   u.raw_user_meta_data->>'telegram_id' AS telegram_id
            FROM user_profiles up
            JOIN users u ON u.id = up.user_id
            WHERE up.user_id = :uid
        """),
        {"uid": target_user_id},
    )
    found = row.mappings().first()
    if not found:
        raise HTTPException(status_code=404, detail="User not found")

    pid = found["profile_id"]
    telegram_id = found["telegram_id"]

    # Grant credits
    if credits > 0:
        await db.execute(
            text("""
                INSERT INTO user_credits (user_profile_id, credits_balance)
                VALUES (:pid, :amt)
                ON CONFLICT (user_profile_id) DO UPDATE
                SET credits_balance = user_credits.credits_balance + EXCLUDED.credits_balance,
                    updated_at = NOW()
            """),
            {"pid": pid, "amt": credits},
        )
        await db.execute(
            text("""
                INSERT INTO credit_transactions
                  (user_profile_id, transaction_type, amount, reason, description, created_at)
                VALUES (:pid, 'credit', :amt, 'admin_gift', :desc, NOW())
            """),
            {"pid": pid, "amt": credits, "desc": f"Admin gift: {credits} credits"},
        )

    # Grant subscription + unlock limits
    if sub_duration in ("monthly", "yearly"):
        months = 1 if sub_duration == "monthly" else 12
        # ON CONFLICT handles users who already have a subscription row —
        # we extend from the later of (current expiry, now) so the gift stacks
        # on top of an active subscription instead of overwriting it.
        await db.execute(
            text("""
                INSERT INTO user_subscriptions
                  (user_profile_id, subscription_type, status, start_date, expires_at)
                VALUES (:pid, :stype, 'active', NOW(), NOW() + make_interval(months => :months))
                ON CONFLICT (user_profile_id) DO UPDATE
                SET subscription_type = EXCLUDED.subscription_type,
                    status = 'active',
                    start_date = NOW(),
                    expires_at = GREATEST(user_subscriptions.expires_at, NOW()) + make_interval(months => :months)
            """),
            {"pid": pid, "stype": sub_duration, "months": months},
        )
        await db.execute(
            text("""
                INSERT INTO limits (user_profile_id, wardrobe_items_anlyzed, ai_requests, ideas_viewed, outfits_saved, vton_used)
                VALUES (:pid, 999, 999, 999, 999, 999)
                ON CONFLICT (user_profile_id) DO UPDATE
                SET wardrobe_items_anlyzed = 999, ai_requests = 999,
                    ideas_viewed = 999, outfits_saved = 999, vton_used = 999,
                    updated_at = NOW()
            """),
            {"pid": pid},
        )

    # Flag pending welcome sheet
    pending = {
        "subscription_type": sub_duration,
        "credits": credits,
        "sheet": sheet,
        "granted_at": None,  # populated by NOW() below
    }
    await db.execute(
        text("""
            UPDATE user_profiles
            SET pending_gift = jsonb_set(CAST(:payload AS jsonb), '{granted_at}', to_jsonb(CAST(NOW() AS text))),
                updated_at = NOW()
            WHERE id = :pid
        """),
        {"pid": pid, "payload": json_lib.dumps(pending)},
    )

    await db.commit()

    # Send Telegram notification (best-effort — failure must not roll back grant)
    bot_result = await send_bot_message(telegram_id, bot_message)

    return {
        "success": True,
        "bot_sent": bool(bot_result.get("ok")),
        "bot_error": None if bot_result.get("ok") else bot_result.get("error") or "telegram_failed",
        "telegram_id": telegram_id,
    }


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


# ─────────────────────────────────────────────────────────────────────────
# OutfitTransformer — admin smoke test
# ─────────────────────────────────────────────────────────────────────────

@router.get("/outfit-scorer/search-items")
async def outfit_scorer_search_items(
    q: str = Query("", description="Substring match on item name"),
    limit: int = Query(30, ge=1, le=100),
    user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Picker items for the admin smoke-test UI — search by name, or browse
    the latest items when q is empty. Items without image_url are excluded
    because the thumbnails-grid becomes useless without them."""
    like = f"%{q}%" if q else "%"
    catalog = await db.execute(
        text("""
            SELECT id, item_name AS name, image_url, clothing_type, color,
                   'catalog' AS source
            FROM wardrobe_items
            WHERE COALESCE(is_hidden, false) = false
              AND image_url IS NOT NULL
              AND item_name ILIKE :like
            ORDER BY id DESC
            LIMIT :limit
        """),
        {"like": like, "limit": limit},
    )
    user_rows = await db.execute(
        text("""
            SELECT id, item_name AS name, image_url, clothing_type, color,
                   'user' AS source
            FROM wardrobe_user_items
            WHERE COALESCE(is_hidden, false) = false
              AND image_url IS NOT NULL
              AND item_name ILIKE :like
            ORDER BY id DESC
            LIMIT :limit
        """),
        {"like": like, "limit": limit},
    )
    return {
        "catalog": [dict(r) for r in catalog.mappings().all()],
        "user": [dict(r) for r in user_rows.mappings().all()],
    }


@router.get("/outfit-scorer/presets")
async def outfit_scorer_presets(
    count: int = Query(5, ge=1, le=12),
    user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Return ready-made outfits for one-click scoring in the admin UI.

    Strategy:
      1. Real user-composed outfits from the `outfits` table with >= 3
         items that all have valid images.
      2. If too few real outfits exist, synthesize slot-complete ones
         (top + bottom + outerwear + optional accessory) from random
         catalog items — ensures the page is useful on a fresh DB.
    """
    outfit_rows = await db.execute(
        text("""
            SELECT o.id AS outfit_id, o.name, o.occasion, o.user_id,
                   COUNT(oi.wardrobe_item_id) AS item_count
            FROM outfits o
            JOIN outfit_items oi ON oi.outfit_id = o.id
            JOIN wardrobe_items wi ON wi.id = oi.wardrobe_item_id
            WHERE wi.image_url IS NOT NULL
              AND COALESCE(wi.is_hidden, false) = false
            GROUP BY o.id
            HAVING COUNT(oi.wardrobe_item_id) >= 3
            ORDER BY o.created_at DESC
            LIMIT :count
        """),
        {"count": count},
    )
    outfits = [dict(r) for r in outfit_rows.mappings().all()]

    presets = []
    for o in outfits:
        item_rows = await db.execute(
            text("""
                SELECT wi.id, wi.item_name AS name, wi.image_url,
                       wi.clothing_type, wi.color
                FROM outfit_items oi
                JOIN wardrobe_items wi ON wi.id = oi.wardrobe_item_id
                WHERE oi.outfit_id = :oid AND wi.image_url IS NOT NULL
                ORDER BY oi.position NULLS LAST, oi.id
                LIMIT 16
            """),
            {"oid": o["outfit_id"]},
        )
        items = [dict(r) for r in item_rows.mappings().all()]
        if len(items) < 2:
            continue
        presets.append({
            "outfit_id": o["outfit_id"],
            "title": o.get("name") or f"Образ #{o['outfit_id']}",
            "occasion": o.get("occasion"),
            "kind": "real",
            "items": items,
        })

    # Synthesize slot-complete outfits if we don't have enough real ones
    if len(presets) < 3:
        slot_groups = [
            (["t-shirt", "shirt", "blouse", "hoodie", "sweatshirt"], "верх"),
            (["jeans", "pants", "skirt"], "низ"),
            (["coat", "suit-jacket", "cardigan", "puffer-jacket"], "верхняя одежда"),
        ]
        slot_sql = text("""
            SELECT id, item_name AS name, image_url, clothing_type, color
            FROM wardrobe_items
            WHERE image_url IS NOT NULL
              AND COALESCE(is_hidden, false) = false
              AND clothing_type = ANY(:types)
            ORDER BY RANDOM()
            LIMIT 1
        """)
        for synth_i in range(max(0, 3 - len(presets))):
            synth_items = []
            for types, _slot_name in slot_groups:
                row = await db.execute(slot_sql, {"types": types})
                picked = row.mappings().first()
                if picked:
                    synth_items.append(dict(picked))
            # dedupe by id in case of collisions across RANDOM() calls
            seen = set()
            deduped = [it for it in synth_items if not (it["id"] in seen or seen.add(it["id"]))]
            if len(deduped) >= 3:
                presets.append({
                    "outfit_id": None,
                    "title": f"Синтетический #{synth_i + 1}",
                    "occasion": "slot-complete",
                    "kind": "synthetic",
                    "items": deduped,
                })

    return {"presets": presets}


@router.post("/outfit-scorer/load")
async def outfit_scorer_load(user: dict = Depends(get_admin_user)):
    """Kick off the one-time checkpoint download + model load on the AI
    service. Safe to call multiple times; reports current state."""
    ai_url = settings.AI_SERVICE_URL
    if not ai_url:
        raise HTTPException(status_code=500, detail="AI_SERVICE_URL not configured")
    # Extended timeout: first load downloads ~1.1 GB from Google Drive.
    try:
        async with httpx.AsyncClient(timeout=1800.0) as client:
            resp = await client.post(f"{ai_url}/clip/outfit-load")
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as e:
        logger.error(f"[admin/outfit-load] AI call failed: {e}")
        raise HTTPException(status_code=502, detail=f"AI service error: {e}")


@router.post("/outfit-scorer/score")
async def outfit_scorer_score(request: Request, user: dict = Depends(get_admin_user)):
    """Score compatibility of an outfit by item IDs. Body: {item_ids: [int]}."""
    body = await request.json()
    item_ids = body.get("item_ids") or []
    if not isinstance(item_ids, list) or len(item_ids) < 2:
        raise HTTPException(status_code=400, detail="item_ids must be a list of >= 2 ids")

    ai_url = settings.AI_SERVICE_URL
    if not ai_url:
        raise HTTPException(status_code=500, detail="AI_SERVICE_URL not configured")

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{ai_url}/clip/outfit-score",
                json={"item_ids": [int(i) for i in item_ids]},
            )
            if resp.status_code >= 400:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
            return resp.json()
    except httpx.HTTPError as e:
        logger.error(f"[admin/outfit-score] AI call failed: {e}")
        raise HTTPException(status_code=502, detail=f"AI service error: {e}")
