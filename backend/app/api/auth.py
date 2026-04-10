"""
Auth endpoints — with rate limiting and proper Telegram widget verification.
"""

import hashlib
import hmac
import json
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
    validate_telegram_login_widget,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


def _make_session_response(user_id: str, email: str, is_admin: bool, metadata: dict):
    """Build Supabase-compatible session response."""
    access = create_access_token(user_id, email, is_admin)
    refresh = create_refresh_token(user_id)
    payload = decode_token(access)
    return {
        "success": True,
        "session": {
            "access_token": access,
            "refresh_token": refresh,
            "expires_at": payload["exp"],
        },
        "user": {
            "id": user_id,
            "email": email,
            "user_metadata": metadata,
        },
    }


def _derived_password(telegram_id: str, pepper: str) -> str:
    return hmac.new(pepper.encode(), telegram_id.encode(), hashlib.sha256).hexdigest()


# ── Email Register ──

class EmailRegisterRequest(BaseModel):
    email: str
    password: str


@router.post("/register")
@limiter.limit("5/minute")
async def email_register(request: Request, body: EmailRegisterRequest, db: AsyncSession = Depends(get_db)):
    email = body.email.strip().lower()
    password = body.password.strip()

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    # Check if email already exists
    existing = await db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": email},
    )
    if existing.first():
        raise HTTPException(status_code=409, detail="Email already registered")

    # Create user
    user_id = str(uuid4())
    hashed = hash_password(password)
    await db.execute(
        text("INSERT INTO users (id, email, encrypted_password, raw_user_meta_data, created_at) VALUES (:id, :email, :pw, CAST(:meta AS jsonb), NOW())"),
        {"id": user_id, "email": email, "pw": hashed, "meta": json.dumps({"provider": "email"})},
    )
    await db.commit()

    return _make_session_response(user_id, email, False, {"provider": "email"})


# ── Email Login ──

class EmailLoginRequest(BaseModel):
    email: str
    password: str


@router.post("/email-session")
@limiter.limit("10/minute")
async def email_session(request: Request, body: EmailLoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT id, email, encrypted_password, raw_user_meta_data FROM users WHERE email = :email"),
        {"email": body.email.strip()},
    )
    user = result.first()
    if not user or not verify_password(body.password, user.encrypted_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    prof = await db.execute(
        text("SELECT id, is_admin FROM user_profiles WHERE user_id = :uid"),
        {"uid": str(user.id)},
    )
    p = prof.first()
    meta = user.raw_user_meta_data if isinstance(user.raw_user_meta_data, dict) else {}
    return _make_session_response(str(user.id), user.email, p.is_admin if p else False, meta)


# ── Telegram Mini App Login ──

class TelegramSessionRequest(BaseModel):
    initData: str


def _verify_miniapp_init_data(raw: str, bot_token: str) -> dict | None:
    """Verify Telegram Mini App initData HMAC."""
    import time
    import urllib.parse

    params = dict(urllib.parse.parse_qsl(raw, keep_blank_values=True))
    received_hash = params.pop("hash", None)
    if not received_hash:
        return None

    auth_date = int(params.get("auth_date", "0"))
    if auth_date > 0 and abs(time.time() - auth_date) > 3600:
        return None

    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    for omit_sig in [False, True]:
        omit = {"hash"} | ({"signature"} if omit_sig else set())
        dcs = "\n".join(f"{k}={v}" for k, v in sorted(params.items()) if k not in omit)
        computed = hmac.new(secret, dcs.encode(), hashlib.sha256).hexdigest()
        if hmac.compare_digest(computed, received_hash):
            user_str = params.get("user", "")
            try:
                return json.loads(user_str) if user_str else None
            except json.JSONDecodeError:
                return None
    return None


async def _telegram_login_flow(tg_user: dict, db: AsyncSession) -> dict:
    """Shared login/register flow for Telegram users (miniapp and widget)."""
    tg_id = str(tg_user.get("id", ""))
    if not tg_id:
        raise HTTPException(status_code=400, detail="No user in Telegram data")

    email = f"{tg_id}@telegram.local"
    full_name = " ".join(filter(None, [tg_user.get("first_name"), tg_user.get("last_name")])) or tg_user.get("username", "User")
    password = _derived_password(tg_id, settings.TELEGRAM_PEPPER)

    metadata = {
        "provider": "telegram-miniapp",
        "telegram_id": tg_id,
        "telegram_username": tg_user.get("username"),
        "telegram_first_name": tg_user.get("first_name"),
        "telegram_last_name": tg_user.get("last_name"),
        "telegram_photo_url": tg_user.get("photo_url"),
        "full_name": full_name,
    }

    result = await db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": email},
    )
    user = result.first()

    if user:
        user_id = str(user.id)
        await db.execute(
            text("UPDATE users SET raw_user_meta_data = CAST(:meta AS jsonb) WHERE id = :uid"),
            {"meta": json.dumps(metadata), "uid": user_id},
        )
        await db.commit()
    else:
        user_id = str(uuid4())
        hashed = hash_password(password)
        await db.execute(
            text("INSERT INTO users (id, email, encrypted_password, raw_user_meta_data, created_at) VALUES (:id, :email, :pw, CAST(:meta AS jsonb), NOW())"),
            {"id": user_id, "email": email, "pw": hashed, "meta": json.dumps(metadata)},
        )
        await db.commit()

    prof = await db.execute(
        text("SELECT id, is_admin FROM user_profiles WHERE user_id = :uid"),
        {"uid": user_id},
    )
    p = prof.first()
    return _make_session_response(user_id, email, p.is_admin if p else False, metadata)


@router.post("/telegram/miniapp-session")
@limiter.limit("20/minute")
async def telegram_miniapp_session(request: Request, body: TelegramSessionRequest, db: AsyncSession = Depends(get_db)):
    raw = body.initData.strip()
    if not raw:
        raise HTTPException(status_code=400, detail="No initData")

    tg_user = _verify_miniapp_init_data(raw, settings.TELEGRAM_BOT_TOKEN)
    if not tg_user:
        raise HTTPException(status_code=401, detail="Invalid initData")

    return await _telegram_login_flow(tg_user, db)


# ── Telegram Login Widget (different verification) ──

class WidgetLoginRequest(BaseModel):
    user: dict


@router.post("/telegram/login-widget-session")
@limiter.limit("10/minute")
async def telegram_login_widget_session(request: Request, body: WidgetLoginRequest, db: AsyncSession = Depends(get_db)):
    """Telegram Login Widget — uses SHA256(bot_token), NOT HMAC(WebAppData)."""
    tg_data = body.user
    if not validate_telegram_login_widget(tg_data, settings.TELEGRAM_BOT_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid Telegram widget data")

    return await _telegram_login_flow(tg_data, db)


# ── Refresh Token ──

class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/refresh")
@limiter.limit("30/minute")
async def refresh(request: Request, body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = payload["sub"]
    result = await db.execute(
        text("SELECT u.id, u.email, u.raw_user_meta_data, up.is_admin FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id WHERE u.id = :uid"),
        {"uid": user_id},
    )
    user = result.first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    meta = user.raw_user_meta_data if isinstance(user.raw_user_meta_data, dict) else {}
    resp = _make_session_response(str(user.id), user.email, user.is_admin or False, meta)
    resp["user_id"] = str(user.id)
    return resp


# ── Reset Password ──

class ResetRequest(BaseModel):
    email: str


@router.post("/reset")
@limiter.limit("3/minute")
async def reset_password(request: Request, body: ResetRequest):
    # TODO: implement email sending (e.g., via SMTP or API)
    return {"success": True, "message": "If the email exists, a reset link was sent."}


@router.post("/signout")
async def signout():
    return {"success": True}
