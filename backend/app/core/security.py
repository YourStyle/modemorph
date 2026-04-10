"""
JWT + password hashing — using PyJWT (maintained) and bcrypt directly.
Replaces python-jose and passlib.
"""

import hashlib
import hmac
import json
import time
import urllib.parse
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt

from app.core.config import settings


# ── Password hashing (direct bcrypt, no passlib) ──

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# ── JWT tokens (PyJWT, not python-jose) ──

def create_access_token(user_id: str, email: str, is_admin: bool = False) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "is_admin": is_admin,
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "type": "access",
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        "type": "refresh",
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None


# ── Telegram initData verification ──

def validate_telegram_init_data(init_data: str, bot_token: str) -> Optional[dict]:
    """Validate Telegram Mini App initData (HMAC-SHA256 with WebAppData key)."""
    params = dict(urllib.parse.parse_qsl(init_data, keep_blank_values=True))
    received_hash = params.pop("hash", None)
    if not received_hash:
        return None

    auth_date = int(params.get("auth_date", "0"))
    if auth_date > 0 and abs(time.time() - auth_date) > 3600:
        return None

    # Try with and without 'signature' in check string
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


def validate_telegram_login_widget(data: dict, bot_token: str) -> bool:
    """
    Validate Telegram Login Widget data.
    Uses SHA256(bot_token) as secret key (different from Mini App).
    """
    received_hash = data.get("hash", "")
    if not received_hash:
        return False

    auth_date = int(data.get("auth_date", "0"))
    if auth_date > 0 and abs(time.time() - auth_date) > 3600:
        return False

    # Build check string from all fields except hash
    check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(data.items()) if k != "hash"
    )

    # Secret = SHA256(bot_token), NOT HMAC("WebAppData", bot_token)
    secret = hashlib.sha256(bot_token.encode()).digest()
    computed = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()

    return hmac.compare_digest(computed, received_hash)
