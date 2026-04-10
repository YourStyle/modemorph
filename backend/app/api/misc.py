"""Miscellaneous endpoints: check-limits, usage/log, spend-credits, pricing, user-subscription, user-likes, detect-clothing, ai-assistant, clip/search."""

import json as json_lib
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, get_admin_user
from app.services.n8n_proxy import n8n_proxy

router = APIRouter()


# ── /api/check-limits (alias for limits/check with same interface) ──

@router.post("/check-limits")
async def check_limits(request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.api.limits import _get_profile_id, _use_feature, _can_use_feature

    body = await request.json()
    feature = body.get("featureType") or body.get("feature")
    count = body.get("count", 1)

    if not feature:
        raise HTTPException(status_code=400, detail="feature or featureType required")

    profile_id = await _get_profile_id(db, user["id"])

    if body.get("featureType"):
        ok, remaining = await _use_feature(db, profile_id, feature, count)
        if not ok:
            raise HTTPException(status_code=402, detail="payment_required")
        await db.commit()
        return {"success": True, "canUse": True, "remaining": remaining}
    else:
        ok, remaining = await _can_use_feature(db, profile_id, feature, count)
        return {"success": True, "canUse": ok, "remaining": remaining}


# ── /api/usage/log ──

@router.post("/usage/log")
async def log_usage(request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    feature = body.get("key") or body.get("feature")
    action = body.get("action", "view")

    profile_result = await db.execute(
        text("SELECT id FROM user_profiles WHERE user_id = :uid"),
        {"uid": user["id"]},
    )
    profile = profile_result.first()
    if not profile:
        return {"success": True}

    await db.execute(
        text("""
            INSERT INTO usage_events (user_profile_id, feature, action, count, page_path, item_id, request_id, occurred_at)
            VALUES (:pid, :feat, :act, :cnt, :page, :item, :req, NOW())
        """),
        {
            "pid": str(profile[0]),
            "feat": feature,
            "act": action,
            "cnt": body.get("count", 1),
            "page": body.get("meta", {}).get("pagePath"),
            "item": body.get("meta", {}).get("itemId"),
            "req": body.get("meta", {}).get("requestId"),
        },
    )
    await db.commit()
    return {"success": True}


# ── /api/spend-credits ──

@router.post("/spend-credits")
async def spend_credits(request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    amount = body.get("amount", 1)
    reason = body.get("reason", "usage")
    description = body.get("description", "")

    profile_result = await db.execute(
        text("SELECT id FROM user_profiles WHERE user_id = :uid"),
        {"uid": user["id"]},
    )
    profile = profile_result.first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    pid = str(profile[0])

    # Check balance
    balance_result = await db.execute(
        text("SELECT credits_balance FROM user_credits WHERE user_profile_id = :pid"),
        {"pid": pid},
    )
    balance_row = balance_result.first()
    balance = balance_row[0] if balance_row else 0

    if balance < amount:
        raise HTTPException(status_code=402, detail="Insufficient credits")

    await db.execute(
        text("UPDATE user_credits SET credits_balance = credits_balance - :amt WHERE user_profile_id = :pid"),
        {"amt": amount, "pid": pid},
    )
    await db.execute(
        text("""
            INSERT INTO credit_transactions (user_profile_id, amount, reason, description, created_at)
            VALUES (:pid, :amt, :reason, :desc, NOW())
        """),
        {"pid": pid, "amt": -amount, "reason": reason, "desc": description},
    )
    await db.commit()
    return {"success": True, "remaining": balance - amount}


# ── /api/pricing ──

@router.get("/pricing")
async def get_pricing(db: AsyncSession = Depends(get_db)):
    subs = await db.execute(text("SELECT * FROM subscription_pricing WHERE is_active = true ORDER BY price_rub"))
    packs = await db.execute(text("SELECT * FROM credit_packs WHERE is_active = true ORDER BY price_rub"))
    return {
        "subscriptions": [dict(r) for r in subs.mappings().all()],
        "credit_packs": [dict(r) for r in packs.mappings().all()],
    }


# ── /api/user-subscription ──

@router.get("/user-subscription")
async def get_user_subscription(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.api.payments import get_subscription
    return await get_subscription(user, db)


# ── /api/user-likes ──

@router.get("/user-likes")
async def get_user_likes(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""
            SELECT ul.*, o.title, o.preview_image_url
            FROM user_likes ul
            LEFT JOIN outfits o ON o.id = ul.outfit_id
            WHERE ul.user_id = :uid
            ORDER BY ul.created_at DESC
        """),
        {"uid": user["id"]},
    )
    return {"data": [dict(r) for r in result.mappings().all()]}


# ── /api/detect-clothing ──

@router.post("/detect-clothing")
async def detect_clothing(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    image_url = body.get("image_url")
    detection_type = body.get("type", "all")
    if not image_url:
        raise HTTPException(status_code=400, detail="image_url required")
    return await n8n_proxy.detect_clothes(image_url, detection_type)


# ── /api/ai-assistant ──

@router.post("/ai-assistant")
async def ai_assistant(request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    prompt = body.get("prompt", "")
    weather = body.get("weather", {})

    # Fetch user items
    items_result = await db.execute(
        text("SELECT id, item_name, description, color, shade, has_print, notes, image_url FROM wardrobe_user_items WHERE user_id = :uid"),
        {"uid": user["id"]},
    )
    items = [dict(r) for r in items_result.mappings().all()]

    return await n8n_proxy.user_prompt_recommendation(user["id"], prompt, weather, items)


# ── /api/clip/search ──

@router.post("/clip/search")
@router.get("/clip/search")
async def clip_search(request: Request, user: dict = Depends(get_current_user)):
    """Proxy to AI service for CLIP search."""
    import httpx

    if request.method == "GET":
        params = dict(request.query_params)
    else:
        params = await request.json()

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{settings.AI_SERVICE_URL}/clip/search",
            json=params,
        )
        return resp.json()
