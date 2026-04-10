"""
Auth endpoints — matching Supabase session response format for frontend compatibility.

Frontend expects:
{
  "success": true,
  "session": { "access_token", "refresh_token", "expires_at" },
  "user": { "id", "email", "user_metadata": {...} }
}
"""

import hashlib
import hmac
import json
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
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
)

router = APIRouter()


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
            "expires_at": payload["exp"],  # unix seconds
        },
        "user": {
            "id": user_id,
            "email": email,
            "user_metadata": metadata,
        },
    }


def _derived_password(telegram_id: str, pepper: str) -> str:
    """Same derived password as Next.js: HMAC-SHA256(pepper, telegram_id)."""
    return hmac.new(pepper.encode(), telegram_id.encode(), hashlib.sha256).hexdigest()


# ── Email Login ──

class EmailLoginRequest(BaseModel):
    email: str
    password: str


@router.post("/email-session")
async def email_session(body: EmailLoginRequest, db: AsyncSession = Depends(get_db)):
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


def _verify_init_data(raw: str, bot_token: str) -> dict | None:
    """Verify Telegram initData HMAC and return user data."""
    import urllib.parse

    params = dict(urllib.parse.parse_qsl(raw, keep_blank_values=True))
    received_hash = params.pop("hash", None)
    if not received_hash:
        return None

    # Check auth_date freshness (24h)
    import time
    auth_date = int(params.get("auth_date", "0"))
    if auth_date > 0 and abs(time.time() - auth_date) > 3600:  # 1 hour freshness
        return None

    # Try both with and without 'signature' in check string
    def make_check_string(entries, omit_signature=False):
        omit = {"hash"}
        if omit_signature:
            omit.add("signature")
        return "\n".join(
            f"{k}={v}" for k, v in sorted(entries.items()) if k not in omit
        )

    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()

    for omit_sig in [False, True]:
        dcs = make_check_string(params, omit_sig)
        computed = hmac.new(secret, dcs.encode(), hashlib.sha256).hexdigest()
        if hmac.compare_digest(computed, received_hash):
            user_str = params.get("user", "")
            try:
                return json.loads(user_str) if user_str else None
            except json.JSONDecodeError:
                return None

    return None


@router.post("/telegram/miniapp-session")
async def telegram_miniapp_session(body: TelegramSessionRequest, db: AsyncSession = Depends(get_db)):
    raw = body.initData.strip()
    if not raw:
        raise HTTPException(status_code=400, detail="No initData")

    tg_user = _verify_init_data(raw, settings.TELEGRAM_BOT_TOKEN)
    if not tg_user:
        raise HTTPException(status_code=401, detail="Invalid initData")

    tg_id = str(tg_user.get("id", ""))
    if not tg_id:
        raise HTTPException(status_code=400, detail="No user in initData")

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

    # Try to find existing user
    result = await db.execute(
        text("SELECT id, email, encrypted_password FROM users WHERE email = :email"),
        {"email": email},
    )
    user = result.first()

    if user:
        # Update metadata
        await db.execute(
            text("UPDATE users SET raw_user_meta_data = :meta WHERE id = :uid"),
            {"meta": json.dumps(metadata), "uid": str(user.id)},
        )
        await db.commit()
        user_id = str(user.id)
    else:
        # Create new user
        user_id = str(uuid4())
        hashed = hash_password(password)
        await db.execute(
            text("""
                INSERT INTO users (id, email, encrypted_password, raw_user_meta_data, created_at)
                VALUES (:id, :email, :pw, :meta, NOW())
            """),
            {"id": user_id, "email": email, "pw": hashed, "meta": json.dumps(metadata)},
        )
        # Note: profile NOT created here — frontend creates it during onboarding
        await db.commit()

    # Get profile
    prof = await db.execute(
        text("SELECT id, is_admin FROM user_profiles WHERE user_id = :uid"),
        {"uid": user_id},
    )
    p = prof.first()

    return _make_session_response(user_id, email, p.is_admin if p else False, metadata)


# ── Telegram Login Widget ──

@router.post("/telegram/login-widget-session")
async def telegram_login_widget_session(body: TelegramSessionRequest, db: AsyncSession = Depends(get_db)):
    """Same as miniapp-session but for web widget login."""
    return await telegram_miniapp_session(body, db)


# ── Refresh Token ──

class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/refresh")
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = payload["sub"]
    result = await db.execute(
        text("""
            SELECT u.id, u.email, u.raw_user_meta_data, up.is_admin
            FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id
            WHERE u.id = :uid
        """),
        {"uid": user_id},
    )
    user = result.first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    meta = user.raw_user_meta_data if isinstance(user.raw_user_meta_data, dict) else {}
    resp = _make_session_response(str(user.id), user.email, user.is_admin or False, meta)

    # Also return user_id for compatibility
    resp["user_id"] = str(user.id)
    return resp


# ── Reset Password ──

class ResetRequest(BaseModel):
    email: str


@router.post("/reset")
async def reset_password(body: ResetRequest):
    """Password reset — stub (would need email service)."""
    # In production, send reset email. For now, acknowledge.
    return {"success": True, "message": "If the email exists, a reset link was sent."}


# ── Sign Out ──

@router.post("/signout")
async def signout():
    return {"success": True}
