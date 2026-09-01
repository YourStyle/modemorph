"""Miscellaneous endpoints: check-limits, usage/log, pricing, user-subscription, user-likes, detect-clothing, ai-assistant, vton, clip/search."""

import base64
import hmac
import io
import math
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
from app.services.capsule import capsule_style_guide
from app.services.usage import record_usage_event
from clothing_taxonomy import resolve_clothing_type
# Retailer (the shop in `notes`) vs brand (the house, wardrobe_items.brand) —
# see backend/brand.py.
from brand import BRAND_GUESS_PROMPT_RULE, prompt_brand_field, retailer_from_notes

router = APIRouter()

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Flat-lay generator. Switched off gemini-3.1-flash-image-preview on 2026-08-22
# after a side-by-side run on 15 real garments spanning tweed, lace, denim,
# suede, silk, knit and printed silk.
#
# The lite model is 2.2x cheaper (1278 vs 1402 completion tokens at half the
# per-token price: 3.25 RUB vs 7.05 RUB per image) and was not worse. On the one
# garment where they clearly diverged it was BETTER: a navy blouse with sheer
# sleeves and a sheer yoke came back from the expensive model as opaque satin —
# it had invented a sheen and removed the transparency that defines the piece.
# The lite model kept both. The expensive model is not more accurate here, it is
# more flattering, which is right for a storefront and wrong for a wardrobe where
# the owner has to recognise their own clothes.
#
# gpt-5-image-mini was measured too and rejected: 4983 completion tokens (not the
# ~1120 the pricing page implies), 47 s against 5-11 s, HTTP 400 on two of three
# inputs, and on the one that worked it cropped the garment out of frame.
FLATLAY_MODEL = "google/gemini-3.1-flash-lite-image"


async def _openrouter_chat(messages: list, model: str = "google/gemini-2.5-flash-lite",
                           temperature: float = 0.7, modalities: list = None,
                           image_config: dict = None, max_tokens: int = 8192) -> dict:
    """Call OpenRouter API.

    max_tokens MUST be set: OpenRouter's credit check reserves the full requested
    max_tokens up-front, and Gemini's default is ~65535. With a maxed/limited key
    that 402s ("requested up to 65535 tokens, but can only afford N") even when
    plenty of budget remains for a normal-sized response. Capping to a realistic
    ceiling keeps every Gemini-backed feature (stylist, detection, chat) working
    within the remaining budget."""
    if not settings.OPENROUTER_API_KEY:
        raise HTTPException(status_code=503, detail="OPENROUTER_API_KEY not configured")

    payload = {"model": model, "messages": messages, "temperature": temperature, "max_tokens": max_tokens}
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


# ── /api/bot/event ──

# Events the bot is allowed to report. Kept as an explicit allowlist so a leaked
# secret cannot be used to write arbitrary event names into the funnel.
ALLOWED_BOT_EVENTS = {"bot_start", "bot_blocked", "bot_unblocked"}


@router.post("/bot/event")
async def bot_event(request: Request, db: AsyncSession = Depends(get_db)):
    """Record a pre-auth Telegram touch (mainly /start).

    The bot lives in a separate compose project and cannot reach the backend over
    the internal docker network, so it calls this through the public origin and
    authenticates with a shared secret rather than a user token — at /start time
    no user exists yet.
    """
    secret = settings.BOT_SECRET or settings.CRON_SECRET
    if not secret or not hmac.compare_digest(request.headers.get("X-Bot-Secret", ""), secret):
        raise HTTPException(status_code=403, detail="Forbidden")

    body = await request.json()
    telegram_id = str(body.get("telegram_id") or "").strip()
    event_type = str(body.get("event_type") or "").strip()

    if not telegram_id:
        raise HTTPException(status_code=400, detail="telegram_id is required")
    if event_type not in ALLOWED_BOT_EVENTS:
        raise HTTPException(status_code=400, detail=f"Unknown event_type: {event_type!r}")

    await db.execute(
        text("""
            INSERT INTO bot_events (telegram_id, event_type, payload)
            VALUES (:tg, :et, CAST(:payload AS jsonb))
        """),
        {
            "tg": telegram_id,
            "et": event_type,
            "payload": json_lib.dumps(body.get("payload") or {}),
        },
    )
    await db.commit()
    return {"ok": True}


# ── /api/usage/log ──

@router.post("/usage/log")
async def log_usage(request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Client-side event sink.

    This used to carry its own copy of the insert — profile lookup, subscriber
    and credit enrichment, activity bump — which drifted from the shared one in
    services/usage.py and, worse, repeated its `if not profile: return` early
    exit. That exit is why registration-step events could not exist: the profile
    is created by the LAST of three registration steps, so every event fired by
    someone still inside the form was silently dropped, and the biggest drop in
    the product (160 of 457 accounts) had no observable interior.

    Delegating means the pre-profile path is fixed once, for both callers.
    """
    body = await request.json()
    await record_usage_event(
        db,
        user_id=user["id"],
        feature=body.get("key") or body.get("feature"),
        action=body.get("action", "view"),
        count=body.get("count", 1),
        meta=body.get("meta", {}),
    )
    await db.commit()
    return {"success": True}


# /api/spend-credits удалён вместе с кнопкой «Купить 5 просмотров за 2 токена»,
# которая была его единственным вызовом. Сумму и назначение списания диктовал
# клиент: цена жила в JSX мимо feature_costs, а `reason` попадал в журнал
# кредитов свободным текстом. Теперь цену на любую функцию знает ровно одна
# таблица, и списывает её ровно один код — _use_feature().


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


# Accessories the outfit generator has no slot for and silently drops, so paying
# to generate a product image for them is money spent on something no user can
# ever see in an outfit. Bags, hats and scarves are deliberately NOT here — they
# are plausible outfit elements once slots exist for them.
_IGNORED_ACCESSORY_RE = re.compile(
    r"очк|оправ|солнцезащ|часы|наручн|"
    r"ожерель|серьг|серёж|брасл|кольцо|цепочк|подвеск|брошь|украшени|"
    r"ремен|\bпояс\b|"
    r"glass|sunglass|eyewear|watch|jewel|ring|earring|necklace|bracelet|belt",
    re.IGNORECASE,
)


def _is_ignored_accessory(item: dict) -> bool:
    """True when the detected item is an accessory we deliberately skip.

    Matches the type and the name only, never the description: a t-shirt whose
    description reads "с принтом в виде очков" is a t-shirt. Dropping a real
    garment is the more expensive mistake — the user loses an item they
    photographed, while a watch that slips through costs one generation.
    """
    haystack = " ".join(str(item.get(k) or "") for k in ("clothing_item", "item_name"))
    return bool(_IGNORED_ACCESSORY_RE.search(haystack))


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


# Aspect ratios the image models accept. Anything else is silently coerced.
_SUPPORTED_RATIOS = (
    ("21:9", 21 / 9), ("16:9", 16 / 9), ("3:2", 3 / 2), ("4:3", 4 / 3), ("5:4", 5 / 4),
    ("1:1", 1.0),
    ("4:5", 4 / 5), ("3:4", 3 / 4), ("2:3", 2 / 3), ("9:16", 9 / 16),
)


def _nearest_aspect_ratio(data_uri: str, fallback: str = "3:4") -> str:
    """Closest supported aspect ratio to the given image.

    Try-on used to pass no image_config at all and instead ASK for the right
    framing in the prompt ("MATCH the aspect ratio ... do NOT stretch or squash").
    A prompt is a request, not a constraint: with the parameter absent the model
    fell back to its own default, so a 9:16 phone photo came back as 3:4 — the
    squashed result reported 2026-08-22.

    Ratio is compared in log space so that being off by a factor is penalised the
    same whether the image is tall or wide; a linear distance would quietly prefer
    the wide end of the list for every portrait photo.
    """
    match = re.match(r"data:image/(\w+);base64,(.+)", data_uri or "", re.DOTALL)
    if not match:
        return fallback
    try:
        with Image.open(io.BytesIO(base64.b64decode(match.group(2)))) as img:
            width, height = img.size
        if not width or not height:
            return fallback
        actual = width / height
        return min(_SUPPORTED_RATIOS, key=lambda r: abs(math.log(r[1] / actual)))[0]
    except Exception as e:
        print(f"[vton] aspect detect failed, falling back to {fallback}: {e}")
        return fallback


_GRID_CELLS = ("top-left", "top-right", "bottom-left", "bottom-right")


def _build_grid_prompt(chunk: list) -> str:
    """One prompt that lays up to four garments out in a 2x2 grid.

    Empty quadrants are named explicitly. Left unmentioned, the model fills them
    by inventing a fourth garment that was never on the photo — and an invented
    item is worse than a missing one, because it lands in someone's wardrobe.
    """
    lines = []
    for i, item in enumerate(chunk[:4]):
        desc = item.get("description_en") or item.get("description") or item.get("item_name", "")
        lines.append(f"- {_GRID_CELLS[i]} quadrant: a single {item.get('clothing_item', 'item')}. {desc}")
    for i in range(len(chunk), 4):
        lines.append(f"- {_GRID_CELLS[i]} quadrant: completely empty, plain background only.")

    return (
        "One square image divided into a strict 2x2 grid of four equal quadrants, "
        "separated by thin straight lines of the same neutral light-grey background.\n"
        "Place exactly one garment per quadrant, centred, fully inside its own quadrant, "
        "never crossing into another. Same scale logic, same lighting, same background in all four.\n\n"
        + "\n".join(lines) +
        "\n\nEach garment: top-down studio flat-lay, laid perfectly flat and symmetrical, "
        "all parts visible. No model, mannequin, props, logos, tags, or text. "
        "Render exact described colors and material texture under soft, even lighting. "
        "High resolution, crisp edges, no strong shadows."
    )


def _split_grid(data_uri: str, count: int) -> list:
    """Slice a 2x2 grid data URI into `count` separate data URIs.

    Cuts on the exact halves rather than hunting for the separator: the prompt
    asks for four equal quadrants and the model delivers them, so edge detection
    would be a second thing to get wrong for no gain.

    A failure here must not lose the whole photo — the caller has already paid
    for the generation — so an unparseable image degrades to "no picture" and the
    detected item still reaches the user with its text fields intact.
    """
    match = re.match(r"data:image/(\w+);base64,(.+)", data_uri or "", re.DOTALL)
    if not match:
        return [None] * count
    try:
        grid = Image.open(io.BytesIO(base64.b64decode(match.group(2)))).convert("RGB")
    except Exception as e:
        print(f"[detect-clothing] grid split failed: {e}")
        return [None] * count

    w, h = grid.size
    boxes = ((0, 0, w // 2, h // 2), (w // 2, 0, w, h // 2),
             (0, h // 2, w // 2, h), (w // 2, h // 2, w, h))
    out = []
    for box in boxes[:count]:
        buf = io.BytesIO()
        grid.crop(box).save(buf, format="PNG", optimize=True)
        out.append("data:image/png;base64," + base64.b64encode(buf.getvalue()).decode())
    return out


async def _upload_base64_to_s3(data_uri: str, folder: str = "detected") -> str:
    """Upload base64 data URI to Yandex S3 and return public URL."""
    matches = re.match(r"data:image/(\w+);base64,(.+)", data_uri, re.DOTALL)
    if not matches:
        return data_uri
    ext = "jpg" if matches.group(1) == "jpeg" else matches.group(1)
    img_bytes = base64.b64decode(matches.group(2))
    # Хеш по ВСЕМ байтам, а не по первым 100. Первые 100 байт JPEG — это
    # заголовок, у картинок одного генератора он совпадает: на 58 кадрах лукбука
    # получилось всего 3 разных хеша, и уникальность ключа держалась на одной
    # лишь секундной метке. Любые две записи в одну секунду в одну папку затирали
    # друг друга — а пакетные вызовы (detect-clothing грузит вещи параллельно,
    # shrink_lookbooks.py — в тесном цикле) именно так и работают.
    key = f"{folder}/{int(time.time())}-{hashlib.md5(img_bytes).hexdigest()[:8]}.{ext}"
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
    detection_prompt = """Analyze this photo and detect the clothing items the person is wearing.

SKIP entirely — do not return an object for these: eyewear (glasses, sunglasses),
watches, jewellery (rings, earrings, necklaces, bracelets), belts. They are not
clothing for our purposes: the outfit generator has no slot for them and drops
them, so a generated product image for a pair of sunglasses is paid for and then
thrown away. Bags, hats and scarves are still returned.

For each item return a JSON object with these fields:
- clothing_item: item type in English, ONE of: t-shirt, shirt, blouse, longsleeve,
  tank-top, pullover, cardigan, hoodie, sweatshirt, turtleneck, vest, suit-jacket,
  dress, skirt, jumpsuit, pants, jeans, shorts, sporty-pants, jacket, coat, parka,
  puffer-jacket, fur-coat, sheepskin-coat, shoes, boots, sneakers, sandals.
  Use "jacket" for any ordinary jacket (denim/leather/bomber/windbreaker),
  "puffer-jacket" only for a down puffer, "coat" only for a long coat/trench.
  For a bag, hat or scarf answer with the plain English noun.
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

    # Belt-and-braces for the prompt rule above: a model instruction is a request,
    # not a guarantee, and every item that slips through costs a paid generation
    # for something _SLOT_MAP will discard anyway (recommendations.py:457).
    detected_total = len(items)
    items = [i for i in items if not _is_ignored_accessory(i)]
    dropped_accessories = detected_total - len(items)

    if not items:
        return [{"acceptable": False, "reason": "На фото не нашлось одежды — только аксессуары"}]

    # How many items one photo yields has never been recorded anywhere, which is
    # why the cost of a photo could only ever be given as a range: generations are
    # billed per detected item, and only the SAVED ones (1.23 per photo) were
    # observable after the fact. Logged here at the only point where the real
    # number exists.
    await record_usage_event(
        db, user_id=user["id"], feature="photo_detection", action="detected",
        count=len(items),
        meta={"detected": detected_total, "kept": len(items),
              "dropped_accessories": dropped_accessories,
              "generations": len(items)},
    )
    await db.commit()

    # --- Step 2: Generate flat-lay product images ---
    #
    # One generation covers up to FOUR items by asking for a 2x2 grid and slicing
    # it, instead of one paid call per item.
    #
    # Measured 2026-08-22 on a real three-garment lookbook photo:
    #   per-item : 3 calls, 3800 completion tokens, 23 s
    #   2x2 grid : 1 call,  1120 completion tokens,  6 s      -> 3.4x cheaper
    # The image-token price does not scale with content or aspect ratio — a
    # generation costs the same whether it draws one garment or four — so the
    # per-item fan-out was paying full price for each quarter of the same picture.
    #
    # Quality was compared side by side, not assumed: the tank top and shorts are
    # indistinguishable from their single-call versions, and the SHOES came out
    # better in the grid. Footwear is the known weak spot of the per-item prompt
    # (it asks for a mirror-symmetric pair seen from above, a viewpoint absent
    # from the source photo, and the model invents one — two of two footwear items
    # in the 15-garment run came out deformed). Inside a grid the model has three
    # neighbours establishing a consistent top-down plane, and it stops inventing.
    async def gen_grid(chunk: list[dict]) -> list[str | None]:
        """Generate one 2x2 grid for up to 4 items; return one data URI each."""
        try:
            img_result = await _openrouter_chat(
                messages=[{"role": "user", "content": [
                    {"type": "text", "text": _build_grid_prompt(chunk)},
                    {"type": "image_url", "image_url": {"url": clean_b64}},
                ]}],
                model=FLATLAY_MODEL,
                temperature=0.8,
                modalities=["image", "text"],
                image_config={"aspect_ratio": "1:1"},
            )
            images = img_result.get("choices", [{}])[0].get("message", {}).get("images", [])
            if not images:
                return [None] * len(chunk)
            data_uri = images[0].get("image_url", {}).get("url", "")
            return _split_grid(data_uri, len(chunk))
        except Exception as e:
            print(f"[detect-clothing] Grid gen failed: {e}")
            return [None] * len(chunk)

    # Chunks of 4 run concurrently, so a 9-item photo is 3 calls, not 9.
    chunks = [items[i:i + 4] for i in range(0, len(items), 4)]
    image_urls = [uri for group in await asyncio.gather(*(gen_grid(c) for c in chunks))
                  for uri in group]

    # --- Step 3: Build response ---
    response_items = []
    for i, item in enumerate(items):
        response_items.append({
            "index": i,
            "basic_item_id": None,
            "need_gen": False,
            "clothing_item": item.get("clothing_item", ""),
            # Gemini answers `clothing_item` in free English ("bomber jacket",
            # "polo shirt"), and three save paths used to write that string
            # straight into wardrobe_user_items.clothing_type. Resolve it to a
            # canonical slug here, once, so all callers get the same answer;
            # None when neither the English phrase nor the Russian item name
            # names a garment we have a slot for.
            "clothing_type": resolve_clothing_type(
                item.get("clothing_item"), item.get("item_name")),
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

    # 2. Get user's dominant style + gender
    style_result = await db.execute(
        text("SELECT dominant_style, gender FROM user_profiles WHERE user_id = :uid"),
        {"uid": user["id"]},
    )
    style_row = style_result.mappings().first()
    dominant_style = (style_row["dominant_style"] if style_row else "") or ""
    gender = (style_row["gender"] if style_row else None)

    # Curated capsule as style exemplars (cached per gender; "" if unavailable).
    capsule_guide = await capsule_style_guide(db, gender)

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
                        # brand_source travels with brand: the assistant answers in
                        # free Russian prose, so a house we merely inferred must
                        # reach the model under a key it is forbidden to print.
                        text("SELECT id, item_name, color, clothing_type, url, notes, image_url, "
                             "brand, brand_source FROM wardrobe_items WHERE id = ANY(:ids)"),
                        {"ids": cat_ids},
                    )
                    catalog_items = [dict(r) for r in cat_result.mappings().all()]
    except Exception:
        pass  # RAG is optional, don't block assistant

    capsule_block = f"\n{capsule_guide}\n" if capsule_guide else ""

    system_prompt = f"""You are a fashion stylist AI assistant for ModeMorph. Help users with outfit recommendations, style advice, and wardrobe management.
User's dominant style: {dominant_style or 'not determined yet'}
{capsule_block}
RULES:
1. If NOT about fashion/clothing/style → respond: [{{"type": "trash"}}]
2. If general fashion question → respond: [{{"content": "answer in Russian"}}]
3. If outfit recommendation → build from user's wardrobe items + optionally recommend catalog items
4. When recommending catalog items, include their shop URL so user can buy them
5. Whenever a "content" answer talks about SPECIFIC items (wardrobe analysis,
   "what to buy", "what doesn't match"), also attach them:
   [{{"content": "...", "items": [{{"id": item_id, "name": "name", "user_id": "uid", "image_url": "url", "color": "color", "url": "shop url or null"}}]}}]
   The app renders them as photo cards under your text, so the user SEES the
   garment instead of reading its number. Attach only items you actually
   discussed, at most 6, and keep referring to them in prose by name.

For outfits return JSON array:
[{{"id": "unique_id", "title": "Russian title", "description": "Russian desc", "items": [{{"id": item_id, "name": "name", "user_id": "uid", "image_url": "url", "color": "color"}}], "suggested_items_count": N}}]

NEVER show internal ids to the user. The "id" fields exist only so you can put
items into the "items" array — they are database keys, meaningless to a human.
Writing things like "Серые леггинсы (ID: 1590)" in prose is a bug: refer to an
item by its name and colour only ("серые леггинсы", "рваный вязаный свитер").
The same goes for user_id and image_url — never mention them in text.

Formatting of the "content" text (it is rendered as light markdown):
- Short paragraphs, one thought each, separated by a blank line.
- **bold** for the few words that matter; do not bold whole sentences.
- "- " for bullets, "1. " for numbered lists. Nothing else: no headings, no
  tables, no code blocks — they are not rendered and read as raw symbols.
- Answer the question first, details after. Do not pad.

Always respond with JSON array. Use Russian for all text."""

    wardrobe_json = json_lib.dumps([{
        "id": i["id"], "name": i.get("item_name", ""), "color": i.get("color"),
        "style": i.get("style", ""), "type": i.get("clothing_type"),
        "image_url": i.get("image_url"), "user_id": str(i["user_id"]) if i.get("user_id") else None,
    } for i in wardrobe], ensure_ascii=False)

    catalog_json = ""
    brand_guess_block = ""
    if catalog_items:
        # "retailer" is the SHOP off notes ("<FEED_SOURCE>:<SKU>"). It shipped to
        # the assistant as "brand" until 2026-08-20, so the stylist told users a
        # Saint Laurent coat was by "ЦУМ" for 62% of the catalog.
        #
        # The house now ships under "brand" when a merchant named it and under
        # "brand_guess" when we matched it off the product name. This endpoint
        # returns free Russian text straight to the user, so it is the site where
        # printing a guess as fact costs the most — 3239 ЦУМ rows are guesses.
        # An absent key makes the model say nothing, which is the truth here.
        _catalog_payload = []
        has_brand_guess = False
        for i in catalog_items:
            brand_key, brand_value = prompt_brand_field(i.get("brand"), i.get("brand_source"))
            has_brand_guess = has_brand_guess or brand_key == "brand_guess"
            _catalog_payload.append({
                "id": i["id"], "name": i.get("item_name", ""), "color": i.get("color"),
                "type": i.get("clothing_type"), "url": i.get("url"),
                "image_url": i.get("image_url"),
                "retailer": retailer_from_notes(i.get("notes")),
                **({brand_key: brand_value} if brand_key else {}),
            })
        catalog_json = ("\n\nRelevant catalog items (from partner shops, user can buy):\n"
                        + json_lib.dumps(_catalog_payload, ensure_ascii=False))
        if has_brand_guess:
            brand_guess_block = f"\n\n{BRAND_GUESS_PROMPT_RULE}"

    user_msg = f"{prompt}\n\nWeather: {weather.get('location', '')}, {weather.get('temperature', '')}°C, {weather.get('description', '')}\n\nWardrobe ({len(wardrobe)} items):\n{wardrobe_json}{catalog_json}{brand_guess_block}"

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
    so it matches the reference photo exactly. Purely visual — no text description.

    Frame is locked to the DRAFT, not the reference: pass 1 has already settled the
    framing, and this pass must only repaint the face. Without the lock it re-crops
    on its own and undoes pass 1's geometry — the same squashing this parameter was
    added to stop, one step later in the pipeline.
    """
    try:
        result = await _openrouter_chat(
            image_config={"aspect_ratio": _nearest_aspect_ratio(generated_b64)},
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
            # Deliberately NOT FLATLAY_MODEL. The lite model was measured on
            # flat-lay generation only; try-on is a different job — it has to
            # keep a real person's face and body intact, and nothing here has
            # been tested for that. Switching it on the strength of a garment
            # benchmark would be the same unverified leap this comment exists
            # to prevent. Measure faces first, then decide.
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

    # Право на примерку проверяется ДО генерации.
    #
    # Списание живёт на клиенте, в handleTryOnSuccess, и происходит после того,
    # как картинка уже готова. То есть до сих пор сервер генерировал всегда, а
    # 402 приходил постфактум — деньги потрачены, отказ показан. В журнале это
    # видно: 50 событий vton_used/consume_fail, то есть примерно 705 ₽ роздано
    # тем, у кого не было на неё права.
    #
    # Проверка только читает: счётчик двигает списание после успеха, чтобы за
    # упавшую генерацию человек не платил. Гонку это не закрывает полностью
    # (десять одновременных запросов пройдут все десять), но интерфейс делает
    # одну примерку за раз, а стоимость ошибки здесь — одна картинка, не сотня.
    from app.api.limits import _get_profile_id, _can_use_feature

    vton_profile_id = await _get_profile_id(db, user["id"])
    allowed, _ = await _can_use_feature(db, vton_profile_id, "vton_used", 1)
    if not allowed:
        raise HTTPException(status_code=402, detail="payment_required")

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

    # Lock the output frame to the person's photo. The prompt already asks for it
    # in words, and words were not enough: without this parameter the model used
    # its own default and returned a 9:16 phone photo squashed into 3:4.
    vton_ratio = _nearest_aspect_ratio(avatar_b64)

    async def _run_pass1() -> str | None:
        result = await _openrouter_chat(
            messages=[{"role": "user", "content": [
                {"type": "text", "text": prompt},
                avatar_img,           # Reference: beginning (primacy)
                *image_contents,      # Clothing items — last image so model focuses on garments
            ]}],
            image_config={"aspect_ratio": vton_ratio},
            # Deliberately NOT FLATLAY_MODEL. The lite model was measured on
            # flat-lay generation only; try-on is a different job — it has to
            # keep a real person's face and body intact, and nothing here has
            # been tested for that. Switching it on the strength of a garment
            # benchmark would be the same unverified leap this comment exists
            # to prevent. Measure faces first, then decide.
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

# Веса и якоря шкалы. Не подобраны на глаз — посчитаны 01.09.2026 на всех 1090
# вещах с эмбеддингами (109 гардеробов, 91 из них с двумя вещами и больше).
#
# Методика: для каждой вещи считаем её близость к ОСТАЛЬНОМУ своему гардеробу
# (leave-one-out) — это ровно та задача, которую решает style-check для новой
# вещи. Контроль — та же вещь против случайного ЧУЖОГО гардероба, то есть
# эталон ответа «не ваш стиль».
#
# Что показал замер:
#   близость к ближайшей своей вещи  — медиана 0.745, у чужого гардероба 0.602;
#   близость ко всему гардеробу      — медиана 0.541, у чужого 0.496.
# Разрыв по максимуму втрое больше, чем по среднему, поэтому максимум и весит
# 0.7: ключ к «моё» — есть ли в гардеробе хоть одна близкая вещь, а не средняя
# температура по шкафу. Итоговая метрика разделяет своё и чужое с AUC 0.748.
#
# Якоря шкалы — измеренные квантили этой метрики:
#   0.573 = медиана ЧУЖОГО гардероба -> 40 баллов («не ваш стиль»)
#   0.686 = медиана СВОЕГО            -> 70 («хорошо дополнит»)
#   0.796 = p95 СВОЕГО                -> 95 («отлично подходит»)
# Края 0.35 и 0.95 — технические границы косинуса на этих данных.
_FIT_W_MAX = 0.7
_FIT_W_MEAN = 0.3
_FIT_ANCHORS = [(0.35, 0), (0.573, 40), (0.686, 70), (0.796, 95), (0.95, 100)]


def _wardrobe_fit_score(mean: float | None, max_sim: float | None) -> int | None:
    """Косинусная близость -> балл 0-100 по измеренным якорям.

    Возвращает None, когда сравнивать не с чем — это честнее выдуманного числа.
    """
    if mean is None or max_sim is None:
        return None

    fit = _FIT_W_MAX * max_sim + _FIT_W_MEAN * mean

    # Кусочно-линейная интерполяция по якорям; за краями — зажим.
    if fit <= _FIT_ANCHORS[0][0]:
        return _FIT_ANCHORS[0][1]
    for (x0, y0), (x1, y1) in zip(_FIT_ANCHORS, _FIT_ANCHORS[1:]):
        if fit <= x1:
            return round(y0 + (y1 - y0) * (fit - x0) / (x1 - x0))
    return _FIT_ANCHORS[-1][1]

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

    # 2. Насколько вещь близка к ГАРДЕРОБУ пользователя.
    #
    # Раньше здесь звался /clip/search с параметрами k и user_id, которых у него
    # нет в сигнатуре (ai-service/clip/routes.py: search берёт только image и
    # хардкодит k=20). Он молча отдавал 20 вещей КАТАЛОГА, бонус min(30, 20*6)
    # всегда упирался в потолок, и балл был константой: 100 при совпадении
    # стиля, иначе 70. /clip/wardrobe-fit считает настоящий косинус к вещам
    # именно этого пользователя.
    fit = {}
    async with httpx.AsyncClient(timeout=20.0) as client:
        fit_resp = await client.post(
            f"{ai_service}/clip/wardrobe-fit",
            files={"image": ("item.jpg", content, "image/jpeg")},
            data={"user_id": user["id"]},
        )
        if fit_resp.status_code == 200:
            fit = fit_resp.json()
    similar = fit.get("nearest", [])

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

    # 5. Балл — из измеренной близости, а не из строкового равенства стилей.
    #
    # style_match намеренно НЕ входит в балл: dominant_style агрегируется по
    # сырому свободному тексту (cron.py), поэтому равенство строк здесь —
    # ненадёжный сигнал. Он остаётся в ответе как справка.
    score = _wardrobe_fit_score(fit.get("mean"), fit.get("max"))
    if score is None:
        # Сравнивать не с чем: гардероб пуст или вещам ещё не проставили
        # эмбеддинги. Врать числом не будем — фронт покажет объяснение.
        return {
            "score": None,
            "item_style": item_primary_style,
            "item_color": classification.get("color", ""),
            "item_type": classification.get("clothing_type")
            or classification.get("non_garment")
            or "",
            "user_style": dominant_style,
            "style_match": style_match,
            "similar_items": 0,
            "verdict": "Пока не с чем сравнить — добавьте несколько вещей в гардероб.",
        }

    return {
        "score": score,
        "item_style": item_primary_style,
        "item_color": classification.get("color", ""),
        # Canonical slug (components/style-check-sheet.tsx looks it up in
        # CLOTHING_TYPE_LABELS); non_garment is the bag/hat/scarf answer, which
        # has no slug and is shown as-is.
        "item_type": classification.get("clothing_type")
        or classification.get("non_garment")
        or "",
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
