"""Miscellaneous endpoints: check-limits, usage/log, spend-credits, pricing, user-subscription, user-likes, detect-clothing, ai-assistant, vton, clip/search."""

import base64
import json as json_lib
import re
import time
import hashlib
from typing import Optional
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user

router = APIRouter()

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


async def _openrouter_chat(messages: list, model: str = "google/gemini-2.5-flash-lite",
                           temperature: float = 0.7, modalities: list = None,
                           image_config: dict = None) -> dict:
    """Call OpenRouter API."""
    if not settings.OPENROUTER_API_KEY:
        raise HTTPException(status_code=503, detail="OPENROUTER_API_KEY not configured")

    payload = {"model": model, "messages": messages, "temperature": temperature}
    if modalities:
        payload["modalities"] = modalities
    if image_config:
        payload["image_config"] = image_config

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            OPENROUTER_URL,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}"},
            json=payload,
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"AI error: {resp.text[:200]}")
        return resp.json()


def _parse_ai_json(content: str) -> list:
    """Parse AI response that may be wrapped in markdown code blocks."""
    if not content:
        return []
    cleaned = content.replace("```json", "").replace("```", "").strip()
    try:
        parsed = json_lib.loads(cleaned)
        return parsed if isinstance(parsed, list) else [parsed]
    except json_lib.JSONDecodeError:
        return []


# ── /api/check-limits ──

@router.post("/check-limits")
async def check_limits(request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.api.limits import _get_profile_id, _use_feature, _can_use_feature

    body = await request.json()
    feature = body.get("featureType") or body.get("feature") or body.get("type") or body.get("usageType")
    count = body.get("count", 1)

    if not feature:
        raise HTTPException(status_code=400, detail="feature or featureType required")
    if not isinstance(count, int) or count <= 0:
        count = 1

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

    profile_result = await db.execute(text("SELECT id FROM user_profiles WHERE user_id = :uid"), {"uid": user["id"]})
    profile = profile_result.first()
    if not profile:
        return {"success": True}

    await db.execute(
        text("INSERT INTO usage_events (user_profile_id, feature, action, count, page_path, item_id, request_id, occurred_at) VALUES (:pid, :feat, :act, :cnt, :page, :item, :req, NOW())"),
        {"pid": profile[0], "feat": feature, "act": action, "cnt": body.get("count", 1),
         "page": body.get("meta", {}).get("pagePath"), "item": body.get("meta", {}).get("itemId"),
         "req": body.get("meta", {}).get("requestId")},
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

    if not isinstance(amount, int) or amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be a positive integer")

    profile_result = await db.execute(text("SELECT id FROM user_profiles WHERE user_id = :uid"), {"uid": user["id"]})
    profile = profile_result.first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    result = await db.execute(
        text("UPDATE user_credits SET credits_balance = credits_balance - :amt WHERE user_profile_id = :pid AND credits_balance >= :amt RETURNING credits_balance"),
        {"amt": amount, "pid": profile[0]},
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=402, detail="Insufficient credits")

    await db.execute(
        text("INSERT INTO credit_transactions (user_profile_id, amount, reason, description, created_at) VALUES (:pid, :amt, :reason, :desc, NOW())"),
        {"pid": profile[0], "amt": -amount, "reason": reason, "desc": description},
    )
    await db.commit()
    return {"success": True, "remaining": row[0]}


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
    result = await db.execute(text("SELECT outfit_id FROM user_likes WHERE user_id = :uid"), {"uid": user["id"]})
    return {"liked": [str(r[0]) for r in result.all()]}


# ── /api/detect-clothing (OpenRouter — detection + image generation) ──


def _build_flatlay_prompt(item: dict) -> str:
    """Build prompt for flat-lay product image generation."""
    COMMON = (
        "Top-down studio flat-lay on a neutral light-grey background. "
        "No model, mannequin, props, logos, tags, or text. "
        "Render exact described colors and material texture under soft, even lighting. "
        "High resolution, crisp edges, no strong shadows."
    )
    desc = item.get("description_en") or item.get("description") or item.get("item_name", "")
    clothing = item.get("clothing_item", "item")
    part = item.get("part", "")

    if part == "lower":
        return f"Studio-quality flat-lay of a single pair of {clothing}. {desc} Lay perfectly flat: both legs straight and parallel; hems aligned. {COMMON}"
    if part == "upper":
        return f"Studio-quality flat-lay of a single {clothing}. {desc} Lay perfectly flat and symmetrical: sleeves extended, all parts fully visible. {COMMON}"
    if part == "dress":
        return f"Studio-quality flat-lay of a single {clothing}. {desc} Show full length from neckline to hem; sleeves extended symmetrically. {COMMON}"
    if part == "footwear":
        return f"Studio-quality flat-lay of a matched pair of {clothing}. {desc} Two shoes mirror-symmetric; toes pointing up, heels down. {COMMON}"
    return f"Studio-quality flat-lay of a single {clothing}. {desc} Item laid perfectly flat with all parts visible. {COMMON}"


async def _upload_base64_to_s3(data_uri: str, folder: str = "detected") -> str:
    """Upload base64 data URI to Yandex S3 and return public URL."""
    matches = re.match(r"data:image/(\w+);base64,(.+)", data_uri, re.DOTALL)
    if not matches:
        return data_uri
    ext = "jpg" if matches.group(1) == "jpeg" else matches.group(1)
    img_bytes = base64.b64decode(matches.group(2))
    key = f"{folder}/{int(time.time())}-{hashlib.md5(img_bytes[:100]).hexdigest()[:8]}.{ext}"
    try:
        import boto3
        s3 = boto3.client(
            "s3", endpoint_url=settings.YANDEX_S3_ENDPOINT,
            aws_access_key_id=settings.YANDEX_ACCESS_KEY_ID,
            aws_secret_access_key=settings.YANDEX_SECRET_ACCESS_KEY,
            region_name="ru-central1",
        )
        s3.put_object(Bucket=settings.YANDEX_BUCKET_NAME, Key=key, Body=img_bytes,
                      ContentType=f"image/{matches.group(1)}")
        return f"{settings.YANDEX_S3_ENDPOINT}/{settings.YANDEX_BUCKET_NAME}/{key}"
    except Exception as e:
        print(f"[S3 upload] Failed: {e}")
        # Return data URI as fallback — frontend can still display it
        return data_uri


@router.post("/detect-clothing")
async def detect_clothing(
    image: UploadFile = File(None),
    request: Request = None,
    user: dict = Depends(get_current_user),
):
    """Detect clothing from uploaded image + generate flat-lay product photos."""
    import asyncio

    # --- Read image as base64 ---
    if image:
        content = await image.read()
        ct = image.content_type or "image/jpeg"
        img_b64 = f"data:{ct};base64,{base64.b64encode(content).decode()}"
    else:
        body = await request.json()
        image_url = body.get("image_url")
        if not image_url:
            raise HTTPException(status_code=400, detail="No image provided")
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(image_url)
            ct = resp.headers.get("content-type", "image/jpeg")
            img_b64 = f"data:{ct};base64,{base64.b64encode(resp.content).decode()}"

    # --- Step 1: Detect clothing items ---
    detection_prompt = """Analyze this photo and detect ALL clothing items and accessories the person is wearing.
For each item return a JSON object with these fields:
- clothing_item: item type in English (e.g. t-shirt, jeans, sneakers)
- part: one of 'upper', 'lower', 'dress', 'footwear', 'accessories'
- description: brief description in Russian
- description_en: detailed description in English including color, material, texture, pattern. This will be used to generate a product image.
- item_name: item name in Russian (e.g. "Серая футболка")
- material: material in Russian
- style: style in Russian (optional)
- has_print: 'no' or brief description
- color: primary color in Russian
- shade: shade/tone in Russian
- has_details: distinctive features or 'no'

Return ONLY a valid JSON array. No markdown."""

    result = await _openrouter_chat(
        messages=[{"role": "user", "content": [
            {"type": "text", "text": detection_prompt},
            {"type": "image_url", "image_url": {"url": img_b64}},
        ]}],
        model="google/gemini-2.5-flash-lite",
        temperature=0.1,
    )

    content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
    items = _parse_ai_json(content)

    if not items:
        return [{"acceptable": False, "reason": "Не найдено предметов одежды на фото"}]

    # --- Step 2: Generate flat-lay product images in parallel ---
    async def gen_image(item: dict) -> str | None:
        try:
            prompt = _build_flatlay_prompt(item)
            img_result = await _openrouter_chat(
                messages=[{"role": "user", "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": img_b64}},
                ]}],
                model="google/gemini-3.1-flash-image-preview",
                temperature=0.8,
                modalities=["image", "text"],
                image_config={"aspect_ratio": "1:1"},
            )
            images = img_result.get("choices", [{}])[0].get("message", {}).get("images", [])
            if not images:
                return None
            data_uri = images[0].get("image_url", {}).get("url", "")
            # Return base64 data URI directly — fast preview for user.
            # S3 upload happens later when user clicks "save item".
            return data_uri or None
        except Exception as e:
            print(f"[detect-clothing] Image gen failed: {e}")
            return None

    image_urls = await asyncio.gather(*(gen_image(item) for item in items))

    # --- Step 3: Build response ---
    response_items = []
    for i, item in enumerate(items):
        response_items.append({
            "index": i,
            "basic_item_id": None,
            "need_gen": False,
            "clothing_item": item.get("clothing_item", ""),
            "description": item.get("description", ""),
            "item_name": item.get("item_name", ""),
            "material": item.get("material", ""),
            "style": item.get("style", ""),
            "has_print": item.get("has_print", "no"),
            "color": item.get("color", ""),
            "shade": item.get("shade", ""),
            "has_details": item.get("has_details", "no"),
            "image_url": image_urls[i],
            "img_url": image_urls[i],
        })

    return response_items


# ── /api/ai-assistant (OpenRouter — no n8n) ──

@router.post("/ai-assistant")
async def ai_assistant(request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """AI fashion assistant via OpenRouter Gemini."""
    body = await request.json()
    prompt = body.get("prompt", "")
    weather = body.get("weather", {})

    items_result = await db.execute(
        text("SELECT id, item_name, color, shade, style, material, clothing_type, has_print, image_url, user_id FROM wardrobe_user_items WHERE user_id = :uid LIMIT 50"),
        {"uid": user["id"]},
    )
    wardrobe = [dict(r) for r in items_result.mappings().all()]

    system_prompt = """You are a fashion stylist AI assistant for ModeMorph. Help users with outfit recommendations, style advice, and wardrobe management.

RULES:
1. If NOT about fashion/clothing/style → respond: [{"type": "trash"}]
2. If general fashion question → respond: [{"content": "answer in Russian"}]
3. If outfit recommendation → build from user's wardrobe items

For outfits return JSON array:
[{"id": "unique_id", "title": "Russian title", "description": "Russian desc", "items": [{"id": item_id, "name": "name", "user_id": "uid", "image_url": "url", "color": "color"}], "suggested_items_count": N}]

Always respond with JSON array. Use Russian for all text."""

    wardrobe_json = json_lib.dumps([{
        "id": i["id"], "name": i.get("item_name", ""), "color": i.get("color"),
        "type": i.get("clothing_type"), "image_url": i.get("image_url"), "user_id": i.get("user_id"),
    } for i in wardrobe], ensure_ascii=False)

    user_msg = f"{prompt}\n\nWeather: {weather.get('location', '')}, {weather.get('temperature', '')}°C, {weather.get('description', '')}\n\nWardrobe ({len(wardrobe)} items):\n{wardrobe_json}"

    result = await _openrouter_chat(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg},
        ],
        model="google/gemini-2.5-flash-lite",
        temperature=0.7,
    )

    content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
    return _parse_ai_json(content)


# ── /api/vton (OpenRouter Gemini image gen) ──

@router.post("/vton")
async def virtual_tryon(request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Virtual try-on via OpenRouter Gemini."""
    if not settings.OPENROUTER_API_KEY:
        raise HTTPException(status_code=503, detail="OPENROUTER_API_KEY not configured")

    body = await request.json()
    items = body.get("items", [])
    if not items:
        raise HTTPException(status_code=400, detail="Items are required")

    profile = await db.execute(text("SELECT avatar_url FROM user_profiles WHERE user_id = :uid"), {"uid": user["id"]})
    profile_row = profile.first()
    if not profile_row or not profile_row[0]:
        raise HTTPException(status_code=400, detail="Upload an avatar in your profile first.")

    async with httpx.AsyncClient(timeout=30.0) as client:
        avatar_resp = await client.get(profile_row[0])
        if avatar_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to download avatar")
        ct = avatar_resp.headers.get("content-type", "image/jpeg")
        avatar_b64 = f"data:{ct};base64,{base64.b64encode(avatar_resp.content).decode()}"

    image_contents = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        for item in items:
            if item.get("image_url"):
                try:
                    resp = await client.get(item["image_url"])
                    if resp.status_code == 200:
                        ct = resp.headers.get("content-type", "image/jpeg")
                        image_contents.append({"type": "image_url", "image_url": {"url": f"data:{ct};base64,{base64.b64encode(resp.content).decode()}"}})
                except Exception:
                    pass

    if not image_contents:
        raise HTTPException(status_code=400, detail="Failed to download clothing images")

    item_descs = "\n".join(f"  Item {i+1}: {', '.join(filter(None, [it.get('name',''), it.get('color',''), it.get('material','')]))})" for i, it in enumerate(items))

    prompt = f"Virtual try-on. First image = person. Remaining = clothing items.\n{item_descs}\nGenerate photorealistic image of the SAME person wearing ALL items. Preserve face, hair, body shape. Natural pose, clean background."

    result = await _openrouter_chat(
        messages=[{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": avatar_b64}},
            *image_contents,
        ]}],
        model="google/gemini-3.1-flash-image-preview",
        modalities=["image", "text"],
        image_config={"aspect_ratio": "3:4"},
    )

    images = result.get("choices", [{}])[0].get("message", {}).get("images", [])
    if not images:
        raise HTTPException(status_code=502, detail="Model returned no image")

    image_data = images[0].get("image_url", {}).get("url", "")

    # Upload to S3 if base64
    if image_data.startswith("data:image/"):
        try:
            matches = re.match(r"data:image/(\w+);base64,(.+)", image_data)
            if matches:
                ext = "jpg" if matches.group(1) == "jpeg" else matches.group(1)
                img_bytes = base64.b64decode(matches.group(2))
                key = f"vton/{int(time.time())}-{hashlib.md5(img_bytes[:100]).hexdigest()[:8]}.{ext}"
                import boto3
                s3 = boto3.client("s3", endpoint_url=settings.YANDEX_S3_ENDPOINT,
                    aws_access_key_id=settings.YANDEX_ACCESS_KEY_ID,
                    aws_secret_access_key=settings.YANDEX_SECRET_ACCESS_KEY, region_name="ru-central1")
                s3.put_object(Bucket=settings.YANDEX_BUCKET_NAME, Key=key, Body=img_bytes, ContentType=f"image/{matches.group(1)}")
                image_data = f"{settings.YANDEX_S3_ENDPOINT}/{settings.YANDEX_BUCKET_NAME}/{key}"
        except Exception:
            pass

    return {"success": True, "result": {"image_url": image_data}}


# ── /api/clip/search ──

@router.post("/clip/search")
@router.get("/clip/search")
async def clip_search(request: Request, user: dict = Depends(get_current_user)):
    if request.method == "GET":
        params = dict(request.query_params)
    else:
        params = await request.json()

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(f"{settings.AI_SERVICE_URL}/clip/search", json=params)
        return resp.json()
