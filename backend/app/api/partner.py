"""
Partner cabinet API — registration, tokens, feeds, usage stats.
Public VTON API at /api/v1/vton.
Admin partner management at /api/admin/partners.
"""

import hashlib
import io
import os
import secrets
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_admin_user

router = APIRouter()
admin_router = APIRouter()
public_router = APIRouter()


# ── Helpers ──

def _hash_api_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def _generate_api_key() -> tuple[str, str, str]:
    """Returns (plaintext_key, hash, prefix)."""
    raw = secrets.token_hex(32)
    key = f"mm_pk_{raw}"
    return key, _hash_api_key(key), key[:14]


async def _get_partner(user_id: str, db: AsyncSession) -> Optional[dict]:
    result = await db.execute(
        text("SELECT * FROM partner_profiles WHERE user_id = :uid"),
        {"uid": user_id},
    )
    row = result.first()
    return dict(row._mapping) if row else None


async def _require_approved_partner(user: dict, db: AsyncSession) -> dict:
    partner = await _get_partner(user["id"], db)
    if not partner:
        raise HTTPException(status_code=404, detail="Partner profile not found")
    if partner["status"] != "approved":
        raise HTTPException(status_code=403, detail="Partner not approved")
    return partner


# ══════════════════════════════════════════════════════════════════════
# Partner Cabinet Routes (Bearer token auth)
# ══════════════════════════════════════════════════════════════════════


class PartnerRegisterRequest(BaseModel):
    company_name: str
    contact_name: str
    website: Optional[str] = None
    description: Optional[str] = None


@router.post("/register")
async def partner_register(body: PartnerRegisterRequest, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not body.company_name.strip() or not body.contact_name.strip():
        raise HTTPException(status_code=400, detail="Название компании и контактное лицо обязательны")

    # Check if already registered
    existing = await _get_partner(user["id"], db)
    if existing:
        raise HTTPException(status_code=409, detail="Вы уже зарегистрированы как партнёр")

    await db.execute(
        text("""
            INSERT INTO partner_profiles (user_id, company_name, contact_name, website, description, status)
            VALUES (:uid, :company, :contact, :website, :desc, 'pending')
        """),
        {
            "uid": user["id"],
            "company": body.company_name.strip(),
            "contact": body.contact_name.strip(),
            "website": (body.website or "").strip() or None,
            "desc": (body.description or "").strip() or None,
        },
    )
    await db.commit()
    partner = await _get_partner(user["id"], db)
    return {"success": True, "partner": {"id": partner["id"], "status": partner["status"]}}


@router.get("/me")
async def partner_me(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    partner = await _get_partner(user["id"], db)
    if not partner:
        raise HTTPException(status_code=404, detail="not_a_partner")
    return {"user": {"id": user["id"], "email": user["email"]}, "partner": partner}


# ── Tokens ──

@router.get("/tokens")
async def list_tokens(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    partner = await _require_approved_partner(user, db)
    result = await db.execute(
        text("SELECT id, name, token_prefix, is_active, rate_limit_per_minute, last_used_at, created_at, revoked_at FROM partner_api_tokens WHERE partner_id = :pid ORDER BY created_at DESC"),
        {"pid": partner["id"]},
    )
    return {"tokens": [dict(r._mapping) for r in result.all()]}


class CreateTokenRequest(BaseModel):
    name: str


@router.post("/tokens")
async def create_token(body: CreateTokenRequest, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    partner = await _require_approved_partner(user, db)

    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Название токена обязательно")

    # Max 10 active tokens
    count = await db.execute(
        text("SELECT count(*) FROM partner_api_tokens WHERE partner_id = :pid AND is_active = true"),
        {"pid": partner["id"]},
    )
    if count.scalar() >= 10:
        raise HTTPException(status_code=400, detail="Максимум 10 активных токенов")

    key, key_hash, prefix = _generate_api_key()
    await db.execute(
        text("INSERT INTO partner_api_tokens (partner_id, name, token_hash, token_prefix) VALUES (:pid, :name, :hash, :prefix)"),
        {"pid": partner["id"], "name": body.name.strip(), "hash": key_hash, "prefix": prefix},
    )
    await db.commit()

    # Get the created token
    result = await db.execute(
        text("SELECT id, name, token_prefix, created_at FROM partner_api_tokens WHERE token_hash = :hash"),
        {"hash": key_hash},
    )
    token = dict(result.first()._mapping)
    token["key"] = key  # plaintext — shown once
    return {"token": token}


@router.delete("/tokens/{token_id}")
async def revoke_token(token_id: int, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    partner = await _require_approved_partner(user, db)

    result = await db.execute(
        text("SELECT id, partner_id FROM partner_api_tokens WHERE id = :tid"),
        {"tid": token_id},
    )
    token = result.first()
    if not token or token.partner_id != partner["id"]:
        raise HTTPException(status_code=404, detail="Token not found")

    await db.execute(
        text("UPDATE partner_api_tokens SET is_active = false, revoked_at = NOW() WHERE id = :tid"),
        {"tid": token_id},
    )
    await db.commit()
    return {"success": True}


@router.patch("/tokens/{token_id}/rate-limit")
async def update_token_rate_limit(token_id: int, request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    partner = await _require_approved_partner(user, db)
    body = await request.json()
    new_limit = body.get("rate_limit_per_minute")
    if not isinstance(new_limit, int) or new_limit < 1 or new_limit > 1000:
        raise HTTPException(status_code=400, detail="rate_limit_per_minute must be 1-1000")

    result = await db.execute(
        text("UPDATE partner_api_tokens SET rate_limit_per_minute = :lim WHERE id = :tid AND partner_id = :pid RETURNING id"),
        {"lim": new_limit, "tid": token_id, "pid": partner["id"]},
    )
    if not result.first():
        raise HTTPException(status_code=404, detail="Token not found")
    await db.commit()
    return {"success": True, "rate_limit_per_minute": new_limit}


# ── Feeds ──

@router.get("/feeds")
async def list_feeds(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    partner = await _require_approved_partner(user, db)
    result = await db.execute(
        text("SELECT * FROM partner_feeds WHERE partner_id = :pid ORDER BY created_at DESC"),
        {"pid": partner["id"]},
    )
    return {"feeds": [dict(r._mapping) for r in result.all()]}


@router.post("/feeds")
async def upload_feed(
    feed_file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    partner = await _require_approved_partner(user, db)

    if not feed_file.filename or not feed_file.filename.lower().endswith((".xml", ".yml")):
        raise HTTPException(status_code=400, detail="Поддерживаются только файлы XML/YML")

    content = await feed_file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Максимальный размер файла — 50 МБ")

    # Upload to S3
    from app.core.config import settings
    import boto3

    s3_key = f"feeds/{partner['id']}/{int(time.time())}_{feed_file.filename}"
    s3 = boto3.client(
        "s3",
        endpoint_url=settings.YANDEX_S3_ENDPOINT,
        aws_access_key_id=settings.YANDEX_ACCESS_KEY_ID,
        aws_secret_access_key=settings.YANDEX_SECRET_ACCESS_KEY,
        region_name="ru-central1",
    )
    s3.upload_fileobj(io.BytesIO(content), settings.YANDEX_BUCKET_NAME, s3_key, ExtraArgs={"ContentType": "application/xml"})
    file_url = f"{settings.YANDEX_S3_ENDPOINT}/{settings.YANDEX_BUCKET_NAME}/{s3_key}"

    await db.execute(
        text("INSERT INTO partner_feeds (partner_id, file_url, file_name, status) VALUES (:pid, :url, :name, 'pending')"),
        {"pid": partner["id"], "url": file_url, "name": feed_file.filename},
    )
    await db.commit()

    result = await db.execute(
        text("SELECT id, file_name, status, created_at FROM partner_feeds WHERE partner_id = :pid ORDER BY created_at DESC LIMIT 1"),
        {"pid": partner["id"]},
    )
    feed = dict(result.first()._mapping)
    return {"success": True, "feed": feed}


@router.get("/feeds/{feed_id}")
async def get_feed(feed_id: int, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    partner = await _require_approved_partner(user, db)

    result = await db.execute(
        text("SELECT * FROM partner_feeds WHERE id = :fid AND partner_id = :pid"),
        {"fid": feed_id, "pid": partner["id"]},
    )
    feed = result.first()
    if not feed:
        raise HTTPException(status_code=404, detail="Feed not found")

    items_count = await db.execute(
        text("SELECT count(*) FROM wardrobe_items WHERE feed_id = :fid"),
        {"fid": feed_id},
    )
    return {"feed": dict(feed._mapping), "items_in_db": items_count.scalar() or 0}


# ── Widget Keys (publishable, domain-locked) ──

def _validate_origins(origins: list[str]) -> list[str]:
    """Normalize + validate origin allow-list entries (scheme://host[:port])."""
    cleaned = []
    for o in origins or []:
        o = (o or "").strip().rstrip("/")
        if not o:
            continue
        if not (o.startswith("https://") or o.startswith("http://")):
            raise HTTPException(status_code=400, detail=f"Origin must start with http(s)://: {o}")
        if "/" in o.split("://", 1)[1]:
            raise HTTPException(status_code=400, detail=f"Origin must not contain a path: {o}")
        cleaned.append(o)
    return cleaned


@router.get("/widget-keys")
async def list_widget_keys(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    partner = await _require_approved_partner(user, db)
    result = await db.execute(
        text("""
            SELECT id, name, key_prefix, allowed_origins, is_active,
                   rate_limit_per_minute, theme, last_used_at, created_at, revoked_at
            FROM partner_widget_keys WHERE partner_id = :pid ORDER BY created_at DESC
        """),
        {"pid": partner["id"]},
    )
    return {"keys": [dict(r._mapping) for r in result.all()]}


class CreateWidgetKeyRequest(BaseModel):
    name: str
    allowed_origins: list[str] = []
    theme: Optional[dict] = None


@router.post("/widget-keys")
async def create_widget_key(body: CreateWidgetKeyRequest, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.api.widget import generate_widget_key
    import json as _json

    partner = await _require_approved_partner(user, db)
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Название ключа обязательно")
    origins = _validate_origins(body.allowed_origins)

    count = await db.execute(
        text("SELECT count(*) FROM partner_widget_keys WHERE partner_id = :pid AND is_active = true"),
        {"pid": partner["id"]},
    )
    if count.scalar() >= 10:
        raise HTTPException(status_code=400, detail="Максимум 10 активных виджет-ключей")

    key, key_hash, prefix = generate_widget_key()
    await db.execute(
        text("""
            INSERT INTO partner_widget_keys (partner_id, name, key_hash, key_prefix, allowed_origins, theme)
            VALUES (:pid, :name, :hash, :prefix, :origins, CAST(:theme AS jsonb))
        """),
        {"pid": partner["id"], "name": body.name.strip(), "hash": key_hash, "prefix": prefix,
         "origins": origins, "theme": _json.dumps(body.theme) if body.theme else None},
    )
    await db.commit()

    result = await db.execute(
        text("SELECT id, name, key_prefix, allowed_origins, created_at FROM partner_widget_keys WHERE key_hash = :hash"),
        {"hash": key_hash},
    )
    rec = dict(result.first()._mapping)
    rec["key"] = key  # plaintext — shown once
    return {"key": rec}


class UpdateWidgetKeyRequest(BaseModel):
    name: Optional[str] = None
    allowed_origins: Optional[list[str]] = None
    rate_limit_per_minute: Optional[int] = None
    is_active: Optional[bool] = None
    theme: Optional[dict] = None


@router.patch("/widget-keys/{key_id}")
async def update_widget_key(key_id: int, body: UpdateWidgetKeyRequest, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    import json as _json
    partner = await _require_approved_partner(user, db)

    owns = await db.execute(
        text("SELECT id FROM partner_widget_keys WHERE id = :kid AND partner_id = :pid"),
        {"kid": key_id, "pid": partner["id"]},
    )
    if not owns.first():
        raise HTTPException(status_code=404, detail="Widget key not found")

    updates, binds = [], {"kid": key_id}
    if body.name is not None:
        updates.append("name = :name"); binds["name"] = body.name.strip()
    if body.allowed_origins is not None:
        updates.append("allowed_origins = :origins"); binds["origins"] = _validate_origins(body.allowed_origins)
    if body.rate_limit_per_minute is not None:
        if not (1 <= body.rate_limit_per_minute <= 1000):
            raise HTTPException(status_code=400, detail="rate_limit_per_minute must be 1-1000")
        updates.append("rate_limit_per_minute = :rl"); binds["rl"] = body.rate_limit_per_minute
    if body.is_active is not None:
        updates.append("is_active = :active"); binds["active"] = body.is_active
    if body.theme is not None:
        updates.append("theme = CAST(:theme AS jsonb)"); binds["theme"] = _json.dumps(body.theme)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    await db.execute(text(f"UPDATE partner_widget_keys SET {', '.join(updates)} WHERE id = :kid"), binds)
    await db.commit()
    return {"success": True}


@router.delete("/widget-keys/{key_id}")
async def revoke_widget_key(key_id: int, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    partner = await _require_approved_partner(user, db)
    result = await db.execute(
        text("UPDATE partner_widget_keys SET is_active = false, revoked_at = NOW() WHERE id = :kid AND partner_id = :pid RETURNING id"),
        {"kid": key_id, "pid": partner["id"]},
    )
    if not result.first():
        raise HTTPException(status_code=404, detail="Widget key not found")
    await db.commit()
    return {"success": True}


@router.get("/widget-stats")
async def widget_stats(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Conversion funnel for the partner's widget: impression → outfit_view →
    item_click → add_to_cart, with CTR / conversion and a 30-day daily series."""
    partner = await _require_approved_partner(user, db)
    pid = partner["id"]

    totals_res = await db.execute(
        text("""
            SELECT event_type, count(*) AS c FROM widget_events
            WHERE partner_id = :pid AND created_at >= NOW() - INTERVAL '30 days'
            GROUP BY event_type
        """),
        {"pid": pid},
    )
    counts = {r._mapping["event_type"]: r._mapping["c"] for r in totals_res.all()}
    impressions = counts.get("impression", 0)
    clicks = counts.get("item_click", 0)
    adds = counts.get("add_to_cart", 0)

    daily_res = await db.execute(
        text("""
            SELECT to_char(created_at, 'YYYY-MM-DD') AS d, event_type, count(*) AS c
            FROM widget_events
            WHERE partner_id = :pid AND created_at >= NOW() - INTERVAL '30 days'
            GROUP BY d, event_type ORDER BY d
        """),
        {"pid": pid},
    )
    daily: dict[str, dict] = {}
    for r in daily_res.all():
        m = r._mapping
        row = daily.setdefault(m["d"], {"date": m["d"], "impression": 0, "outfit_view": 0,
                                        "item_click": 0, "add_to_cart": 0})
        row[m["event_type"]] = m["c"]

    return {
        "totals": {
            "impressions": impressions,
            "outfit_views": counts.get("outfit_view", 0),
            "clicks": clicks,
            "add_to_cart": adds,
        },
        "ctr": round(clicks / impressions * 100, 1) if impressions else 0.0,
        "conversion": round(adds / impressions * 100, 1) if impressions else 0.0,
        "daily": sorted(daily.values(), key=lambda x: x["date"]),
    }


# ── Usage Stats ──

@router.get("/usage")
async def usage_stats(summary: str = "", user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    partner = await _require_approved_partner(user, db)
    pid = partner["id"]

    tokens_count = (await db.execute(text("SELECT count(*) FROM partner_api_tokens WHERE partner_id = :pid AND is_active = true"), {"pid": pid})).scalar()
    feeds_count = (await db.execute(text("SELECT count(*) FROM partner_feeds WHERE partner_id = :pid"), {"pid": pid})).scalar()
    total_calls = (await db.execute(text("SELECT count(*) FROM partner_api_usage WHERE partner_id = :pid"), {"pid": pid})).scalar()

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_calls = (await db.execute(text("SELECT count(*) FROM partner_api_usage WHERE partner_id = :pid AND created_at >= :ts"), {"pid": pid, "ts": today_start})).scalar()
    success_calls = (await db.execute(text("SELECT count(*) FROM partner_api_usage WHERE partner_id = :pid AND status_code = 200"), {"pid": pid})).scalar()
    success_rate = round((success_calls / max(total_calls, 1)) * 100) if total_calls else 0

    if summary == "true":
        return {
            "tokens_count": tokens_count or 0,
            "feeds_count": feeds_count or 0,
            "api_calls_today": today_calls or 0,
            "api_calls_total": total_calls or 0,
            "success_rate": success_rate,
        }

    # Full stats: daily breakdown for last 30 days
    result = await db.execute(
        text("SELECT status_code, error_code, latency_ms, created_at FROM partner_api_usage WHERE partner_id = :pid AND created_at >= NOW() - INTERVAL '30 days' ORDER BY created_at"),
        {"pid": pid},
    )
    rows = result.all()

    daily = {}
    error_breakdown = {}
    for row in rows:
        day = str(row.created_at)[:10]
        if day not in daily:
            daily[day] = {"date": day, "total": 0, "success": 0, "errors": 0, "avg_latency": 0}
        daily[day]["total"] += 1
        if row.status_code == 200:
            daily[day]["success"] += 1
        else:
            daily[day]["errors"] += 1
        if row.latency_ms:
            n = daily[day]["total"]
            daily[day]["avg_latency"] += (row.latency_ms - daily[day]["avg_latency"]) / n
        if row.error_code:
            error_breakdown[row.error_code] = error_breakdown.get(row.error_code, 0) + 1

    return {
        "tokens_count": tokens_count or 0,
        "feeds_count": feeds_count or 0,
        "api_calls_today": today_calls or 0,
        "api_calls_total": total_calls or 0,
        "success_rate": success_rate,
        "daily": sorted(daily.values(), key=lambda d: d["date"]),
        "error_breakdown": error_breakdown,
    }


# ══════════════════════════════════════════════════════════════════════
# Admin Partner Routes
# ══════════════════════════════════════════════════════════════════════


@admin_router.get("/partners")
async def admin_list_partners(status: str = "", user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    sql = "SELECT * FROM partner_profiles"
    binds = {}
    if status:
        sql += " WHERE status = :status"
        binds["status"] = status
    sql += " ORDER BY created_at DESC"
    result = await db.execute(text(sql), binds)
    partners = [dict(r._mapping) for r in result.all()]

    # Get usage counts
    if partners:
        pids = [p["id"] for p in partners]
        usage = await db.execute(
            text("SELECT partner_id, count(*) as cnt FROM partner_api_usage WHERE partner_id = ANY(:pids) GROUP BY partner_id"),
            {"pids": pids},
        )
        counts = {r.partner_id: r.cnt for r in usage.all()}
        for p in partners:
            p["api_calls_total"] = counts.get(p["id"], 0)

    return {"partners": partners}


@admin_router.get("/partners/{partner_id}")
async def admin_get_partner(partner_id: int, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT * FROM partner_profiles WHERE id = :pid"), {"pid": partner_id})
    partner = result.first()
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")

    tokens = await db.execute(
        text("SELECT id, name, token_prefix, is_active, created_at, last_used_at, revoked_at FROM partner_api_tokens WHERE partner_id = :pid ORDER BY created_at DESC"),
        {"pid": partner_id},
    )
    feeds = await db.execute(
        text("SELECT * FROM partner_feeds WHERE partner_id = :pid ORDER BY created_at DESC"),
        {"pid": partner_id},
    )
    recent = await db.execute(
        text("SELECT * FROM partner_api_usage WHERE partner_id = :pid ORDER BY created_at DESC LIMIT 50"),
        {"pid": partner_id},
    )
    total = (await db.execute(text("SELECT count(*) FROM partner_api_usage WHERE partner_id = :pid"), {"pid": partner_id})).scalar()
    success = (await db.execute(text("SELECT count(*) FROM partner_api_usage WHERE partner_id = :pid AND status_code = 200"), {"pid": partner_id})).scalar()

    return {
        "partner": dict(partner._mapping),
        "tokens": [dict(r._mapping) for r in tokens.all()],
        "feeds": [dict(r._mapping) for r in feeds.all()],
        "recent_usage": [dict(r._mapping) for r in recent.all()],
        "stats": {"total_calls": total or 0, "success_calls": success or 0},
    }


class PartnerStatusUpdate(BaseModel):
    status: str
    rejected_reason: Optional[str] = None


@admin_router.patch("/partners/{partner_id}")
async def admin_update_partner(partner_id: int, body: PartnerStatusUpdate, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    if body.status not in ("approved", "rejected", "suspended"):
        raise HTTPException(status_code=400, detail="Invalid status")

    updates = ["status = :status", "updated_at = NOW()"]
    binds = {"status": body.status, "pid": partner_id}

    if body.status == "approved":
        updates += ["approved_at = NOW()", "approved_by = :admin_id", "rejected_reason = NULL"]
        binds["admin_id"] = user["id"]
    if body.status == "rejected" and body.rejected_reason:
        updates.append("rejected_reason = :reason")
        binds["reason"] = body.rejected_reason

    await db.execute(text(f"UPDATE partner_profiles SET {', '.join(updates)} WHERE id = :pid"), binds)
    await db.commit()

    result = await db.execute(text("SELECT * FROM partner_profiles WHERE id = :pid"), {"pid": partner_id})
    return {"success": True, "partner": dict(result.first()._mapping)}


@admin_router.get("/widget-keys")
async def admin_list_widget_keys(user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Cross-partner overview of every widget key with its event volume and
    conversion count — oversight for the embeddable-widget program."""
    result = await db.execute(text("""
        SELECT k.id, k.partner_id, p.company_name, k.name, k.key_prefix,
               k.allowed_origins, k.is_active, k.rate_limit_per_minute,
               k.last_used_at, k.created_at, k.revoked_at,
               (SELECT count(*) FROM widget_events e WHERE e.widget_key_id = k.id) AS events_total,
               (SELECT count(*) FROM widget_events e
                  WHERE e.widget_key_id = k.id AND e.event_type = 'impression') AS impressions,
               (SELECT count(*) FROM widget_events e
                  WHERE e.widget_key_id = k.id AND e.event_type = 'add_to_cart') AS conversions
        FROM partner_widget_keys k
        JOIN partner_profiles p ON p.id = k.partner_id
        ORDER BY k.created_at DESC
    """))
    return {"keys": [dict(r._mapping) for r in result.all()]}


# ══════════════════════════════════════════════════════════════════════
# Public VTON API (X-API-Key auth)
# ══════════════════════════════════════════════════════════════════════


async def _get_partner_from_token(request: Request, db: AsyncSession) -> dict:
    """Authenticate via X-API-Key header. Returns {partner_id, token_id, rate_limit}."""
    api_key = request.headers.get("x-api-key")
    if not api_key:
        raise HTTPException(status_code=401, detail=_api_err("INVALID_API_KEY", "Неверный или отсутствующий API ключ"))

    key_hash = _hash_api_key(api_key)
    result = await db.execute(
        text("SELECT id, partner_id, is_active, rate_limit_per_minute FROM partner_api_tokens WHERE token_hash = :hash"),
        {"hash": key_hash},
    )
    token = result.first()
    if not token or not token.is_active:
        raise HTTPException(status_code=401, detail=_api_err("INVALID_API_KEY", "Неверный или отозванный API ключ"))

    # Check partner is approved
    partner = await db.execute(text("SELECT status FROM partner_profiles WHERE id = :pid"), {"pid": token.partner_id})
    p = partner.first()
    if not p or p.status != "approved":
        raise HTTPException(status_code=403, detail=_api_err("PARTNER_NOT_APPROVED", "Партнёрский аккаунт не одобрен"))

    # Update last_used_at
    await db.execute(text("UPDATE partner_api_tokens SET last_used_at = NOW() WHERE id = :tid"), {"tid": token.id})

    return {"partner_id": token.partner_id, "token_id": token.id, "rate_limit": token.rate_limit_per_minute}


def _api_err(code: str, message: str) -> dict:
    return {"success": False, "error": {"code": code, "message": message}}


async def _log_usage(db: AsyncSession, partner_id: int, token_id: int, endpoint: str, status_code: int, error_code: str = None, latency_ms: int = None):
    await db.execute(
        text("INSERT INTO partner_api_usage (partner_id, token_id, endpoint, status_code, error_code, latency_ms) VALUES (:pid, :tid, :ep, :sc, :ec, :lm)"),
        {"pid": partner_id, "tid": token_id, "ep": endpoint, "sc": status_code, "ec": error_code, "lm": latency_ms},
    )
    await db.commit()


@public_router.post("/vton")
async def public_vton(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    start = time.time()
    token_info = await _get_partner_from_token(request, db)
    pid = token_info["partner_id"]
    tid = token_info["token_id"]

    # Rate limit check
    count = await db.execute(
        text("SELECT count(*) FROM partner_api_usage WHERE token_id = :tid AND created_at >= NOW() - INTERVAL '1 minute'"),
        {"tid": tid},
    )
    if count.scalar() >= token_info["rate_limit"]:
        await _log_usage(db, pid, tid, "/api/v1/vton", 429, "RATE_LIMIT_EXCEEDED", int((time.time() - start) * 1000))
        raise HTTPException(status_code=429, detail=_api_err("RATE_LIMIT_EXCEEDED", f"Превышен лимит запросов ({token_info['rate_limit']}/мин). Повторите позже."))

    # Parse multipart form
    form = await request.form()
    person_file = form.get("person_photo")
    clothing_file = form.get("clothing_photo")

    if not person_file or not hasattr(person_file, "read"):
        raise HTTPException(status_code=400, detail=_api_err("MISSING_PERSON_PHOTO", "Отсутствует поле person_photo. Формат: JPEG/PNG, макс. 10 МБ."))
    if not clothing_file or not hasattr(clothing_file, "read"):
        raise HTTPException(status_code=400, detail=_api_err("MISSING_CLOTHING_PHOTO", "Отсутствует поле clothing_photo. Формат: JPEG/PNG, макс. 10 МБ."))

    person_bytes = await person_file.read()
    clothing_bytes = await clothing_file.read()

    if len(person_bytes) > 10 * 1024 * 1024 or len(clothing_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail=_api_err("FILE_TOO_LARGE", "Максимальный размер файла — 10 МБ"))

    import base64
    import httpx
    from app.core.config import settings

    person_mime = getattr(person_file, "content_type", "image/jpeg")
    clothing_mime = getattr(clothing_file, "content_type", "image/jpeg")
    person_b64 = f"data:{person_mime};base64,{base64.b64encode(person_bytes).decode()}"
    clothing_b64 = f"data:{clothing_mime};base64,{base64.b64encode(clothing_bytes).decode()}"

    openrouter_key = settings.OPENROUTER_API_KEY
    if not openrouter_key:
        raise HTTPException(status_code=503, detail=_api_err("INTERNAL_ERROR", "AI service not configured"))

    headers = {"Authorization": f"Bearer {openrouter_key}", "Content-Type": "application/json"}
    openrouter_url = "https://openrouter.ai/api/v1/chat/completions"

    # ── AI Validation (parallel) ──

    person_prompt = """Проанализируй это изображение. Это фотография реального человека, подходящая для виртуальной примерки одежды?
Требования: один реальный человек (не рисунок, не манекен), хорошо видно лицо и верхнюю часть тела, нормальное качество.
Ответь СТРОГО JSON без markdown: {"valid": true} или {"valid": false, "reason": "причина на русском"}"""

    clothing_prompt = """Проанализируй это изображение. Это фотография предмета одежды, подходящая для виртуальной примерки?
Требования: видна одежда отдельно (flat-lay, на вешалке, на нейтральном фоне), НЕ фото человека в одежде.
Ответь СТРОГО JSON без markdown: {"valid": true} или {"valid": false, "reason": "причина на русском"}"""

    import json as json_lib

    async def validate_image(b64: str, prompt: str) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(openrouter_url, headers=headers, json={
                "model": "google/gemini-2.5-flash-lite",
                "messages": [{"role": "user", "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": b64}},
                ]}],
                "temperature": 0,
            })
            if resp.status_code != 200:
                return {"valid": False, "reason": "Не удалось проанализировать изображение"}
            content = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
            try:
                clean = content.replace("```json", "").replace("```", "").strip()
                return json_lib.loads(clean)
            except Exception:
                return {"valid": False, "reason": "Не удалось определить содержимое"}

    import asyncio
    person_val, clothing_val = await asyncio.gather(
        validate_image(person_b64, person_prompt),
        validate_image(clothing_b64, clothing_prompt),
    )

    if not person_val.get("valid"):
        latency = int((time.time() - start) * 1000)
        await _log_usage(db, pid, tid, "/api/v1/vton", 422, "INVALID_PERSON_PHOTO", latency)
        raise HTTPException(status_code=422, detail=_api_err("INVALID_PERSON_PHOTO", person_val.get("reason", "Фото не подходит для примерки")))

    if not clothing_val.get("valid"):
        latency = int((time.time() - start) * 1000)
        await _log_usage(db, pid, tid, "/api/v1/vton", 422, "INVALID_CLOTHING_PHOTO", latency)
        raise HTTPException(status_code=422, detail=_api_err("INVALID_CLOTHING_PHOTO", clothing_val.get("reason", "Фото не содержит предмет одежды")))

    # ── VTON Generation ──

    vton_prompt = """Virtual try-on task. The FIRST image is a reference photo of a person. The SECOND image is a clothing item.
Generate a single photorealistic image of the SAME person wearing the clothing item.
Preserve face, hair, body shape exactly. Natural pose, clean background. Professional fashion photo."""

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(openrouter_url, headers=headers, json={
            "model": "google/gemini-3.1-flash-image-preview",
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": vton_prompt},
                {"type": "image_url", "image_url": {"url": person_b64}},
                {"type": "image_url", "image_url": {"url": clothing_b64}},
            ]}],
            "modalities": ["image", "text"],
            "image_config": {"aspect_ratio": "3:4"},
        })

    if resp.status_code != 200:
        latency = int((time.time() - start) * 1000)
        await _log_usage(db, pid, tid, "/api/v1/vton", 502, "VTON_GENERATION_FAILED", latency)
        raise HTTPException(status_code=502, detail=_api_err("VTON_GENERATION_FAILED", "Модель не вернула результат. Попробуйте другие фото."))

    result_json = resp.json()
    images = result_json.get("choices", [{}])[0].get("message", {}).get("images", [])
    if not images:
        latency = int((time.time() - start) * 1000)
        await _log_usage(db, pid, tid, "/api/v1/vton", 502, "VTON_GENERATION_FAILED", latency)
        raise HTTPException(status_code=502, detail=_api_err("VTON_GENERATION_FAILED", "Модель не вернула изображение"))

    # Upload result to S3
    image_data = images[0].get("image_url", {}).get("url", "")
    image_url = image_data

    if image_data.startswith("data:image/"):
        try:
            import re
            match = re.match(r"data:image/(\w+);base64,(.+)", image_data)
            if match:
                ext = "jpg" if match.group(1) == "jpeg" else match.group(1)
                img_bytes = base64.b64decode(match.group(2))
                s3_key = f"partner-vton/{int(time.time())}-{secrets.token_hex(4)}.{ext}"

                import boto3
                s3 = boto3.client("s3", endpoint_url=settings.YANDEX_S3_ENDPOINT, aws_access_key_id=settings.YANDEX_ACCESS_KEY_ID, aws_secret_access_key=settings.YANDEX_SECRET_ACCESS_KEY, region_name="ru-central1")
                s3.upload_fileobj(io.BytesIO(img_bytes), settings.YANDEX_BUCKET_NAME, s3_key, ExtraArgs={"ContentType": f"image/{match.group(1)}", "ACL": "public-read"})
                image_url = f"{settings.YANDEX_S3_ENDPOINT}/{settings.YANDEX_BUCKET_NAME}/{s3_key}"
        except Exception as e:
            print(f"[Partner VTON] S3 upload failed: {e}")

    latency = int((time.time() - start) * 1000)
    await _log_usage(db, pid, tid, "/api/v1/vton", 200, None, latency)

    return {"success": True, "result": {"image_url": image_url}}
