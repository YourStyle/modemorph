"""Miscellaneous endpoints: check-limits, usage/log, spend-credits, pricing, user-subscription, user-likes, detect-clothing, ai-assistant, vton, clip/search."""

import base64
import io
import json as json_lib
import re
import time
import hashlib
from typing import Optional
from urllib.parse import urlparse

import httpx
from PIL import Image
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
    meta = body.get("meta", {})

    profile_result = await db.execute(text("SELECT id FROM user_profiles WHERE user_id = :uid"), {"uid": user["id"]})
    profile = profile_result.first()
    if not profile:
        return {"success": True}

    pid = profile[0]

    # Check subscriber/credits status for usage_events enrichment
    is_sub = await db.execute(text(
        "SELECT EXISTS(SELECT 1 FROM user_subscriptions WHERE user_profile_id = :pid AND status = 'active' AND expires_at > NOW())"
    ), {"pid": pid})
    has_sub = is_sub.scalar() or False

    has_cred = await db.execute(text(
        "SELECT EXISTS(SELECT 1 FROM credit_transactions WHERE user_profile_id = :pid AND reason = 'purchase')"
    ), {"pid": pid})
    has_bought = has_cred.scalar() or False

    await db.execute(
        text("""INSERT INTO usage_events
                (user_profile_id, user_anon_id, feature, action, count,
                 is_subscriber, has_bought_credits,
                 page_path, item_id, request_id, metadata, occurred_at)
                VALUES (:pid, :anon, :feat, :act, :cnt,
                        :is_sub, :has_bought,
                        :page, :item, :req, CAST(:meta AS jsonb), NOW())"""),
        {"pid": pid, "anon": str(pid), "feat": feature, "act": action, "cnt": body.get("count", 1),
         "is_sub": has_sub, "has_bought": has_bought,
         "page": meta.get("pagePath"), "item": meta.get("itemId"),
         "req": meta.get("requestId"), "meta": json_lib.dumps(meta) if meta else "{}"},
    )

    # Record daily activity for DAU/MAU tracking
    await db.execute(text("SELECT record_user_activity(:pid)"), {"pid": pid})

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
        text("INSERT INTO credit_transactions (user_profile_id, transaction_type, amount, reason, description, created_at) VALUES (:pid, 'spend', :amt, :reason, :desc, NOW())"),
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


async def _remove_bg_via_ai_service(img_bytes: bytes, content_type: str) -> str | None:
    """Strip background via the ai-service /clip/remove-bg endpoint.

    Used to clean up uploads before Gemini sees them — kills artifacts like the
    iOS/Telegram alpha-leak blue stripes that otherwise bleed into the generated
    flat-lay's color. Returns a base64 data URI on success, None on failure
    (caller should fall back to the original bytes)."""
    ai_service = settings.AI_SERVICE_URL or "http://modemorph-ai:8000"
    filename = "upload.jpg" if "jpeg" in content_type else "upload"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{ai_service}/clip/remove-bg",
                files={"image": (filename, img_bytes, content_type)},
            )
            if resp.status_code != 200:
                print(f"[detect-clothing] remove-bg returned {resp.status_code}: {resp.text[:200]}")
                return None
            return resp.json().get("image_base64")
    except Exception as e:
        print(f"[detect-clothing] remove-bg error: {e}")
        return None


@router.post("/detect-clothing")
async def detect_clothing(
    image: UploadFile = File(None),
    request: Request = None,
    user: dict = Depends(get_current_user),
):
    """Detect clothing from uploaded image + generate flat-lay product photos."""
    import asyncio

    # --- Read raw bytes ---
    if image:
        raw_bytes = await image.read()
        ct = image.content_type or "image/jpeg"
    else:
        body = await request.json()
        image_url = body.get("image_url")
        if not image_url:
            raise HTTPException(status_code=400, detail="No image provided")
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(image_url)
            raw_bytes = resp.content
            ct = resp.headers.get("content-type", "image/jpeg")

    img_b64 = f"data:{ct};base64,{base64.b64encode(raw_bytes).decode()}"

    # Strip background before calling the image-gen model. The original bytes
    # are kept for the detection prompt (so Gemini can still read the full
    # context, e.g. distinguish jacket-over-shirt) but flat-lay generation
    # uses the cleaned version where backgrounds and alpha-leak artifacts
    # cannot poison the output color.
    clean_b64 = await _remove_bg_via_ai_service(raw_bytes, ct) or img_b64

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
                    {"type": "image_url", "image_url": {"url": clean_b64}},
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
    """AI fashion assistant with RAG — searches catalog via CLIP for relevant items."""
    body = await request.json()
    prompt = body.get("prompt", "")
    weather = body.get("weather", {})

    # 1. Get user's wardrobe
    items_result = await db.execute(
        text("SELECT id, item_name, color, shade, style, material, clothing_type, has_print, image_url, user_id FROM wardrobe_user_items WHERE user_id = :uid LIMIT 50"),
        {"uid": user["id"]},
    )
    wardrobe = [dict(r) for r in items_result.mappings().all()]

    # 2. Get user's dominant style
    style_result = await db.execute(
        text("SELECT dominant_style FROM user_profiles WHERE user_id = :uid"),
        {"uid": user["id"]},
    )
    style_row = style_result.mappings().first()
    dominant_style = (style_row["dominant_style"] if style_row else "") or ""

    # 3. RAG: search catalog for relevant items via CLIP text search
    catalog_items = []
    ai_service = settings.AI_SERVICE_URL or "http://modemorph-ai:8000"
    try:
        async with httpx.AsyncClient(timeout=10.0) as clip_client:
            clip_resp = await clip_client.post(
                f"{ai_service}/clip/search/text",
                json={"query_text": prompt, "k": 10},
            )
            if clip_resp.status_code == 200:
                clip_results = clip_resp.json().get("results", [])
                if clip_results:
                    cat_ids = [r["id"] for r in clip_results]
                    cat_result = await db.execute(
                        text("SELECT id, item_name, color, clothing_type, url, notes, image_url FROM wardrobe_items WHERE id = ANY(:ids)"),
                        {"ids": cat_ids},
                    )
                    catalog_items = [dict(r) for r in cat_result.mappings().all()]
    except Exception:
        pass  # RAG is optional, don't block assistant

    system_prompt = f"""You are a fashion stylist AI assistant for ModeMorph. Help users with outfit recommendations, style advice, and wardrobe management.
User's dominant style: {dominant_style or 'not determined yet'}

RULES:
1. If NOT about fashion/clothing/style → respond: [{{"type": "trash"}}]
2. If general fashion question → respond: [{{"content": "answer in Russian"}}]
3. If outfit recommendation → build from user's wardrobe items + optionally recommend catalog items
4. When recommending catalog items, include their shop URL so user can buy them

For outfits return JSON array:
[{{"id": "unique_id", "title": "Russian title", "description": "Russian desc", "items": [{{"id": item_id, "name": "name", "user_id": "uid", "image_url": "url", "color": "color"}}], "suggested_items_count": N}}]

Always respond with JSON array. Use Russian for all text."""

    wardrobe_json = json_lib.dumps([{
        "id": i["id"], "name": i.get("item_name", ""), "color": i.get("color"),
        "style": i.get("style", ""), "type": i.get("clothing_type"),
        "image_url": i.get("image_url"), "user_id": str(i["user_id"]) if i.get("user_id") else None,
    } for i in wardrobe], ensure_ascii=False)

    catalog_json = ""
    if catalog_items:
        catalog_json = "\n\nRelevant catalog items (partner brands, user can buy):\n" + json_lib.dumps([{
            "id": i["id"], "name": i.get("item_name", ""), "color": i.get("color"),
            "type": i.get("clothing_type"), "url": i.get("url"), "image_url": i.get("image_url"),
            "brand": (i.get("notes") or "").split(":")[0],
        } for i in catalog_items], ensure_ascii=False)

    user_msg = f"{prompt}\n\nWeather: {weather.get('location', '')}, {weather.get('temperature', '')}°C, {weather.get('description', '')}\n\nWardrobe ({len(wardrobe)} items):\n{wardrobe_json}{catalog_json}"

    result = await _openrouter_chat(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg},
        ],
        model="google/gemini-2.5-flash-lite",
        temperature=0.7,
    )

    content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
    parsed = _parse_ai_json(content)
    if not parsed:
        # Log raw model output so we can see what's coming back when the user gets
        # an empty response (JSON parse silently returns []).
        prompt_preview = (prompt or "")[:120]
        content_preview = (content or "")[:1000]
        print(
            f"[ai-assistant] empty parsed response | user={user.get('id')} "
            f"prompt={prompt_preview!r} wardrobe_items={len(wardrobe)} "
            f"catalog_items={len(catalog_items)} raw_content={content_preview!r}"
        )
    return parsed


# ── /api/vton helpers ──


def _extract_vton_image(result: dict) -> str | None:
    """Extract image URL/data from OpenRouter image generation response."""
    images = result.get("choices", [{}])[0].get("message", {}).get("images", [])
    if images:
        return images[0].get("image_url", {}).get("url", "")
    return None


def _data_uri_md5(uri: str | None) -> str | None:
    """MD5 of decoded image bytes from a base64 data URI. None if not a data URI."""
    if not uri:
        return None
    m = re.match(r"data:image/\w+;base64,(.+)", uri)
    if not m:
        return None
    try:
        return hashlib.md5(base64.b64decode(m.group(1))).hexdigest()
    except Exception:
        return None


def _data_uri_phash(uri: str | None) -> str | None:
    """64-bit dHash of a data URI. Robust to re-encoding (Gemini echoes get re-encoded
    by the image-gen pipeline, so md5 misses them but pixels survive). Returns 64-char
    bit string or None on failure."""
    if not uri:
        return None
    m = re.match(r"data:image/\w+;base64,(.+)", uri)
    if not m:
        return None
    try:
        img = Image.open(io.BytesIO(base64.b64decode(m.group(1)))).convert("L").resize(
            (9, 8), Image.LANCZOS
        )
        px = list(img.getdata())
        bits = []
        for row in range(8):
            for col in range(8):
                bits.append("1" if px[row * 9 + col] > px[row * 9 + col + 1] else "0")
        return "".join(bits)
    except Exception:
        return None


def _phash_hamming(a: str | None, b: str | None) -> int | None:
    if not a or not b or len(a) != len(b):
        return None
    return sum(c1 != c2 for c1, c2 in zip(a, b))


# Hamming distance below this counts as "same image" — generous to allow for JPEG
# re-encoding noise but tight enough that distinct portraits don't collide.
_VTON_ECHO_HAMMING_THRESHOLD = 6


async def _vton_refine_face(avatar_b64: str, generated_b64: str) -> str | None:
    """Send original avatar + generated result, ask model to correct the face
    so it matches the reference photo exactly. Purely visual — no text description."""
    try:
        result = await _openrouter_chat(
            messages=[{"role": "user", "content": [
                {"type": "text", "text": (
                    "FACE CORRECTION TASK.\n\n"
                    "You are given two images:\n"
                    "  Image 1 = REFERENCE — the original person's photo. This is ground truth.\n"
                    "  Image 2 = DRAFT — a virtual try-on result. The clothing is correct, but the face may not match the reference.\n\n"
                    "Produce a CORRECTED version of Image 2 where:\n"
                    "- The face is replaced with the EXACT face from Image 1 — same bone structure, skin tone, skin texture, eyes, nose, mouth, eyebrows, facial hair, moles, freckles.\n"
                    "- The EXACT hairstyle, hair color, hair length, AND hair VOLUME (height on top) from Image 1 are preserved.\n"
                    "- Preserve the head proportions from Image 1 — do NOT compress the face vertically, do NOT widen the jaw, do NOT shorten the neck. The distance from hairline to chin, and from eyes to chin, must match Image 1.\n"
                    "- ALL clothing, pose, lighting, background, and body proportions from Image 2 stay unchanged.\n"
                    "- Do NOT beautify, smooth, or alter any facial features. Do NOT change age or ethnicity.\n"
                    "- Output one photorealistic image. Match the aspect ratio of Image 2 — do NOT crop, stretch, or change the frame."
                )},
                {"type": "image_url", "image_url": {"url": avatar_b64}},
                {"type": "image_url", "image_url": {"url": generated_b64}},
            ]}],
            model="google/gemini-3.1-flash-image-preview",
            temperature=0.15,
            modalities=["image", "text"],
        )
        return _extract_vton_image(result)
    except Exception:
        return None


# ── /api/vton (OpenRouter Gemini image gen) ──

@router.post("/vton")
async def virtual_tryon(request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Virtual try-on via OpenRouter Gemini — 2-pass pipeline:
    Pass 1: Generate try-on image with double avatar reference
    Pass 2: Refine face in generated image to match original exactly
    """
    if not settings.OPENROUTER_API_KEY:
        raise HTTPException(status_code=503, detail="OPENROUTER_API_KEY not configured")

    body = await request.json()
    items = body.get("items", [])
    if not items:
        raise HTTPException(status_code=400, detail="Items are required")

    # Use avatar_url from request body if provided, otherwise fall back to profile
    avatar_url = body.get("avatar_url")
    if not avatar_url:
        profile = await db.execute(
            text("SELECT avatar_url FROM user_profiles WHERE user_id = :uid"),
            {"uid": user["id"]},
        )
        profile_row = profile.first()
        if not profile_row or not profile_row[0]:
            raise HTTPException(status_code=400, detail="Upload an avatar in your profile first.")
        avatar_url = profile_row[0]

    async with httpx.AsyncClient(timeout=30.0) as client:
        avatar_resp = await client.get(avatar_url)
        if avatar_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to download avatar")
        ct = avatar_resp.headers.get("content-type", "image/jpeg")
        avatar_b64 = f"data:{ct};base64,{base64.b64encode(avatar_resp.content).decode()}"

    # Download clothing images
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

    # ── Pass 1: Generate try-on ──
    item_descs = "\n".join(
        f"  Item {i+1}: {', '.join(filter(None, [it.get('name',''), it.get('color',''), it.get('material','')]))}"
        for i, it in enumerate(items)
    )

    prompt = (
        "TASK: Virtual clothing try-on.\n\n"
        "IMAGE LAYOUT:\n"
        "  [Image 1] = REFERENCE PERSON — the original photo. This is the identity AND framing you MUST preserve.\n"
        "  [Images 2..N] = clothing items to put on the person.\n"
        "OUTPUT: a NEW photorealistic image — the reference person dressed in the clothing items. NEVER output the reference photo unchanged. NEVER output any of the clothing photos as-is. The result must be a synthesized image that combines them.\n\n"
        "RULE #1 — IDENTITY PRESERVATION (non-negotiable, highest priority):\n"
        "The generated person MUST be the EXACT same individual as in the reference photo.\n"
        "- COPY the face pixel-for-pixel from the reference: identical bone structure, jawline, cheekbones, nose, lips, eyes, eye color, eyebrows, skin tone, skin texture, freckles, moles, scars, dimples.\n"
        "- COPY the exact hairstyle, hair color, hair texture, hair length, and hair VOLUME (height on top of the head).\n"
        "- COPY the body type and proportions.\n"
        "- Do NOT beautify, smooth, de-age, or idealize. Do NOT change ethnicity or gender.\n"
        "- Preserve glasses, jewelry, watch, piercings, tattoos if visible in reference.\n"
        "- If you cannot preserve the face exactly, it is better to produce a slightly less perfect outfit than to change the face.\n\n"
        "RULE #2 — HEAD & BODY PROPORTIONS (critical):\n"
        "- Do NOT compress the face vertically. Do NOT widen the jaw. Do NOT shorten the neck.\n"
        "- The distance from hairline to chin, from eyes to chin, and from chin to shoulders MUST match the reference.\n"
        "- The head size relative to the torso MUST match the reference photo — do NOT enlarge the head, do NOT shrink it.\n"
        "- If the reference shows hair with volume/height on top, that volume MUST be preserved (do not buzz-cut or flatten the hair).\n\n"
        "RULE #3 — CLOTHING:\n"
        f"{item_descs}\n"
        "- Dress the person in ALL items above. Show accurate colors, textures, patterns, logos.\n"
        "- Clothing should drape naturally on this specific body type.\n"
        "- IMPORTANT: Some clothing reference photos may show a model or mannequin wearing the item. "
        "Use ONLY the garment itself (its design, color, cut, fabric texture) — completely ignore any model or mannequin in those images.\n\n"
        "RULE #4 — OUTPUT FRAMING:\n"
        "- MATCH the aspect ratio, framing, crop, and background of the REFERENCE photo. Do NOT force a different aspect ratio — do NOT stretch or squash the image to fit a new ratio.\n"
        "- Keep the same lighting direction, color temperature, and background from the reference.\n"
        "- Keep the same pose/angle from the reference.\n"
        "- Photorealistic. A viewer who knows this person should immediately recognize them."
    )

    avatar_img = {"type": "image_url", "image_url": {"url": avatar_b64}}

    async def _run_pass1() -> str | None:
        result = await _openrouter_chat(
            messages=[{"role": "user", "content": [
                {"type": "text", "text": prompt},
                avatar_img,           # Reference: beginning (primacy)
                *image_contents,      # Clothing items — last image so model focuses on garments
            ]}],
            model="google/gemini-3.1-flash-image-preview",
            temperature=0.2,
            modalities=["image", "text"],
        )
        return _extract_vton_image(result)

    avatar_phash = _data_uri_phash(avatar_b64)

    # Pass 1 with one retry on echo. md5 catches exact pass-through; pHash catches
    # re-encoded echoes (Gemini's image-gen pipeline re-encodes its outputs, so the
    # bytes differ even when pixels are identical to the input avatar).
    image_data = await _run_pass1()
    if not image_data:
        raise HTTPException(status_code=502, detail="Model returned no image")

    avatar_hash = _data_uri_md5(avatar_b64)
    pass1_hash = _data_uri_md5(image_data)
    pass1_phash = _data_uri_phash(image_data)
    pass1_dist = _phash_hamming(avatar_phash, pass1_phash)
    pass1_echo = (
        (avatar_hash and pass1_hash and avatar_hash == pass1_hash)
        or (pass1_dist is not None and pass1_dist <= _VTON_ECHO_HAMMING_THRESHOLD)
    )

    if pass1_echo:
        print(f"[vton] Pass 1 echoed avatar (md5={pass1_hash}, phash_dist={pass1_dist}) — retrying once")
        retry = await _run_pass1()
        if retry:
            retry_phash = _data_uri_phash(retry)
            retry_dist = _phash_hamming(avatar_phash, retry_phash)
            retry_md5 = _data_uri_md5(retry)
            still_echo = (
                (avatar_hash and retry_md5 and avatar_hash == retry_md5)
                or (retry_dist is not None and retry_dist <= _VTON_ECHO_HAMMING_THRESHOLD)
            )
            if still_echo:
                print(f"[vton] Pass 1 retry also echoed (phash_dist={retry_dist}) — failing")
                raise HTTPException(status_code=502, detail="Try-on model returned the original photo, please retry")
            image_data = retry
            pass1_hash = retry_md5
            pass1_phash = retry_phash
            pass1_dist = retry_dist
        else:
            raise HTTPException(status_code=502, detail="Try-on model returned the original photo, please retry")

    # ── Pass 2: Face refinement ──
    refined = await _vton_refine_face(avatar_b64, image_data)
    refined_hash = _data_uri_md5(refined)
    refined_phash = _data_uri_phash(refined)
    refined_dist = _phash_hamming(avatar_phash, refined_phash)
    print(
        f"[vton] hashes: avatar={avatar_hash} pass1={pass1_hash} (dist={pass1_dist}) "
        f"refined={refined_hash} (dist={refined_dist})"
    )

    refined_echo = refined and (
        (refined_hash and avatar_hash and refined_hash == avatar_hash)
        or (refined_dist is not None and refined_dist <= _VTON_ECHO_HAMMING_THRESHOLD)
    )
    if refined_echo:
        # Pass 2 echoed the avatar — discard and keep Pass 1 result
        print("[vton] Pass 2 echoed avatar — keeping Pass 1 result")
    elif refined:
        image_data = refined

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


# ── /api/style-check — "Will this item fit my wardrobe?" ──

@router.post("/style-check")
async def style_check(
    image: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a photo of an item → get style compatibility score with user's wardrobe.
    Uses CLIP: computes embedding of the photo, compares with average wardrobe embedding.
    """
    content = await image.read()
    ai_service = settings.AI_SERVICE_URL or "http://modemorph-ai:8000"

    # 1. Classify the uploaded item
    async with httpx.AsyncClient(timeout=20.0) as client:
        classify_resp = await client.post(
            f"{ai_service}/clip/classify",
            files={"image": ("item.jpg", content, "image/jpeg")},
        )
        if classify_resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Classification failed")
        classification = classify_resp.json()

    # Reject non-clothing images
    if not classification.get("is_clothing", True):
        return {
            "score": 0,
            "item_style": "",
            "item_color": "",
            "item_type": "",
            "user_style": "",
            "style_match": False,
            "similar_items": 0,
            "verdict": "На фото не удалось распознать одежду. Попробуйте загрузить фото вещи крупнее.",
        }

    # 2. Search for similar items in user's wardrobe via CLIP
    async with httpx.AsyncClient(timeout=20.0) as client:
        search_resp = await client.post(
            f"{ai_service}/clip/search",
            files={"image": ("item.jpg", content, "image/jpeg")},
            data={"k": "5", "user_id": user["id"]},
        )
        similar = search_resp.json().get("results", []) if search_resp.status_code == 200 else []

    # 3. Get user's dominant style
    style_result = await db.execute(
        text("SELECT dominant_style, style_tags FROM user_profiles WHERE user_id = :uid"),
        {"uid": user["id"]},
    )
    profile = style_result.mappings().first()
    dominant_style = (profile["dominant_style"] if profile else "") or "casual"

    # 4. Compute compatibility
    item_styles = classification.get("style_tags", [])
    item_primary_style = item_styles[0] if item_styles else "casual"
    style_match = item_primary_style == dominant_style

    # Score: 0-100 based on style match + similar items found
    base_score = 70 if style_match else 40
    similar_bonus = min(30, len(similar) * 6)  # up to 30 points for similar items
    score = min(100, base_score + similar_bonus)

    return {
        "score": score,
        "item_style": item_primary_style,
        "item_color": classification.get("color", ""),
        "item_type": classification.get("clothing_type", ""),
        "user_style": dominant_style,
        "style_match": style_match,
        "similar_items": len(similar),
        "verdict": (
            "Отлично подходит вашему стилю!" if score >= 80
            else "Хорошо дополнит гардероб" if score >= 60
            else "Интересный эксперимент — попробуйте!" if score >= 40
            else "Не совсем ваш стиль, но почему бы и нет?"
        ),
    }
