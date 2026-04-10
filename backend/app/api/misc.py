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
    feature = body.get("featureType") or body.get("feature") or body.get("type") or body.get("usageType")
    count = body.get("count", 1)

    if not feature:
        raise HTTPException(status_code=400, detail="feature or featureType required")

    # Consume mode if featureType or usageType is set
    is_consume = bool(body.get("featureType") or body.get("usageType"))

    profile_id = await _get_profile_id(db, user["id"])

    if is_consume:
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
            "pid": profile[0],
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
    pid = profile[0]

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
        text("SELECT outfit_id FROM user_likes WHERE user_id = :uid"),
        {"uid": user["id"]},
    )
    return {"liked": [str(r[0]) for r in result.all()]}


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


# ── /api/vton ──

@router.post("/vton")
async def virtual_tryon(request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Virtual try-on via OpenRouter Gemini — same logic as Next.js route."""
    import base64
    import httpx

    api_key = settings.OPENROUTER_API_KEY
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENROUTER_API_KEY not configured")

    body = await request.json()
    items = body.get("items", [])
    if not items:
        raise HTTPException(status_code=400, detail="Items are required")

    # Get user avatar
    profile = await db.execute(
        text("SELECT avatar_url FROM user_profiles WHERE user_id = :uid"),
        {"uid": user["id"]},
    )
    profile_row = profile.first()
    if not profile_row or not profile_row[0]:
        raise HTTPException(status_code=400, detail="User avatar not found. Please upload an avatar in your profile.")

    avatar_url = profile_row[0]

    # Download avatar → base64
    async with httpx.AsyncClient(timeout=30.0) as client:
        avatar_resp = await client.get(avatar_url)
        if avatar_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to download avatar")
        content_type = avatar_resp.headers.get("content-type", "image/jpeg")
        avatar_b64 = f"data:{content_type};base64,{base64.b64encode(avatar_resp.content).decode()}"

    # Download clothing images → base64
    image_contents = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        for item in items:
            if item.get("image_url"):
                try:
                    resp = await client.get(item["image_url"])
                    if resp.status_code == 200:
                        ct = resp.headers.get("content-type", "image/jpeg")
                        b64 = f"data:{ct};base64,{base64.b64encode(resp.content).decode()}"
                        image_contents.append({"type": "image_url", "image_url": {"url": b64}})
                except Exception:
                    pass

    if not image_contents:
        raise HTTPException(status_code=400, detail="Failed to download clothing images")

    # Build prompt
    item_descs = "\n".join(
        f"  Clothing item {i+1}: {', '.join(filter(None, [it.get('name',''), it.get('color',''), it.get('material',''), it.get('description','')]))}"
        for i, it in enumerate(items)
    )
    prompt = f"""Virtual try-on task.

The FIRST image is a reference photo of a person.
The REMAINING images are individual clothing items.

{item_descs}

Generate a single photorealistic image of the SAME person from the first image
wearing ALL the provided clothing items together. Requirements:
- Preserve the person's face, hair, body shape, and proportions exactly.
- Use a natural pose and a clean, neutral background.
- The clothing must match the provided item photos in color, texture, and style.
- The result should look like a professional fashion photo."""

    # Call OpenRouter Gemini
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
            json={
                "model": "google/gemini-3.1-flash-image-preview",
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": avatar_b64}},
                        *image_contents,
                    ],
                }],
                "modalities": ["image", "text"],
                "image_config": {"aspect_ratio": "3:4"},
            },
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"AI service error: {resp.text[:200]}")
        ai_result = resp.json()

    images = ai_result.get("choices", [{}])[0].get("message", {}).get("images", [])
    if not images:
        raise HTTPException(status_code=502, detail="Model returned no image")

    image_data = images[0].get("image_url", {}).get("url", "")

    # Upload to S3 if base64
    if image_data.startswith("data:image/"):
        try:
            import re
            matches = re.match(r"data:image/(\w+);base64,(.+)", image_data)
            if matches:
                ext = "jpg" if matches.group(1) == "jpeg" else matches.group(1)
                img_bytes = base64.b64decode(matches.group(2))
                import time, hashlib
                key = f"vton/{int(time.time())}-{hashlib.md5(img_bytes[:100]).hexdigest()[:8]}.{ext}"

                s3 = None
                try:
                    import boto3
                    s3 = boto3.client("s3",
                        endpoint_url=settings.YANDEX_S3_ENDPOINT,
                        aws_access_key_id=settings.YANDEX_S3_ACCESS_KEY_ID,
                        aws_secret_access_key=settings.YANDEX_S3_SECRET_ACCESS_KEY,
                        region_name="ru-central1",
                    )
                    s3.put_object(Bucket=settings.YANDEX_S3_BUCKET_NAME, Key=key, Body=img_bytes, ContentType=f"image/{matches.group(1)}")
                    image_data = f"{settings.YANDEX_S3_ENDPOINT}/{settings.YANDEX_S3_BUCKET_NAME}/{key}"
                except Exception as e:
                    pass  # Return base64 if S3 fails
        except Exception:
            pass

    return {"success": True, "result": {"image_url": image_data}}


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
