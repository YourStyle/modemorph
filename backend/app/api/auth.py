"""
Auth endpoints replacing Supabase GoTrue.

Supports:
- POST /api/auth/login          — email/password login
- POST /api/auth/register       — email/password registration
- POST /api/auth/refresh        — refresh token
- POST /api/auth/telegram       — Telegram Mini App auth
- POST /api/auth/signout        — invalidate session (client-side)
"""

import json
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    validate_telegram_init_data,
    verify_password,
)
from app.core.config import settings

router = APIRouter()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str = ""


class RefreshRequest(BaseModel):
    refresh_token: str


class TelegramAuthRequest(BaseModel):
    init_data: str


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_at: int
    user: dict


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT id, email, encrypted_password FROM users WHERE email = :email"),
        {"email": body.email},
    )
    user = result.first()

    if not user or not verify_password(body.password, user.encrypted_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Get profile
    profile = await db.execute(
        text("SELECT id, is_admin FROM user_profiles WHERE user_id = :uid"),
        {"uid": str(user.id)},
    )
    prof = profile.first()

    access = create_access_token(str(user.id), user.email, prof.is_admin if prof else False)
    refresh = create_refresh_token(str(user.id))
    payload = decode_token(access)

    return AuthResponse(
        access_token=access,
        refresh_token=refresh,
        expires_at=payload["exp"],
        user={
            "id": str(user.id),
            "email": user.email,
            "profile_id": str(prof.id) if prof else None,
            "is_admin": prof.is_admin if prof else False,
        },
    )


@router.post("/register", response_model=AuthResponse)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check if email exists
    existing = await db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": body.email},
    )
    if existing.first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user_id = str(uuid4())
    hashed = hash_password(body.password)

    # Create user
    await db.execute(
        text("""
            INSERT INTO users (id, email, encrypted_password, raw_user_meta_data, created_at)
            VALUES (:id, :email, :password, :meta, NOW())
        """),
        {
            "id": user_id,
            "email": body.email,
            "password": hashed,
            "meta": json.dumps({"full_name": body.full_name, "email_verified": True}),
        },
    )

    # Create profile
    profile_id = str(uuid4())
    await db.execute(
        text("""
            INSERT INTO user_profiles (id, user_id, is_admin, created_at)
            VALUES (:id, :uid, false, NOW())
        """),
        {"id": profile_id, "uid": user_id},
    )

    # Initialize limits
    await db.execute(
        text("""
            INSERT INTO limits (user_profile_id, wardrobe_items_anlyzed, ai_requests, ideas_viewed, outfits_saved, vton_used)
            VALUES (:pid, 3, 3, 10, 3, 1)
        """),
        {"pid": profile_id},
    )

    # Initialize credits
    await db.execute(
        text("""
            INSERT INTO user_credits (user_profile_id, credits_balance)
            VALUES (:pid, 0)
        """),
        {"pid": profile_id},
    )

    await db.commit()

    access = create_access_token(user_id, body.email, False)
    refresh = create_refresh_token(user_id)
    payload = decode_token(access)

    return AuthResponse(
        access_token=access,
        refresh_token=refresh,
        expires_at=payload["exp"],
        user={"id": user_id, "email": body.email, "profile_id": profile_id, "is_admin": False},
    )


@router.post("/refresh", response_model=AuthResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user_id = payload["sub"]
    result = await db.execute(
        text("""
            SELECT u.id, u.email, up.id as profile_id, up.is_admin
            FROM users u
            LEFT JOIN user_profiles up ON up.user_id = u.id
            WHERE u.id = :uid
        """),
        {"uid": user_id},
    )
    user = result.first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    access = create_access_token(str(user.id), user.email, user.is_admin or False)
    new_refresh = create_refresh_token(str(user.id))
    tok = decode_token(access)

    return AuthResponse(
        access_token=access,
        refresh_token=new_refresh,
        expires_at=tok["exp"],
        user={
            "id": str(user.id),
            "email": user.email,
            "profile_id": str(user.profile_id) if user.profile_id else None,
            "is_admin": user.is_admin or False,
        },
    )


@router.post("/telegram", response_model=AuthResponse)
async def telegram_auth(body: TelegramAuthRequest, db: AsyncSession = Depends(get_db)):
    """Telegram Mini App authentication — validates initData, creates/finds user."""
    tg_user = validate_telegram_init_data(body.init_data, settings.TELEGRAM_BOT_TOKEN)
    if not tg_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Telegram data")

    tg_id = str(tg_user["id"])
    email = f"{tg_id}@telegram.local"
    full_name = tg_user.get("first_name", "") + " " + tg_user.get("last_name", "")

    # Find existing user by telegram email
    result = await db.execute(
        text("SELECT id, email FROM users WHERE email = :email"),
        {"email": email},
    )
    user = result.first()

    if user:
        user_id = str(user.id)
        # Update metadata
        meta = {
            "telegram_id": tg_id,
            "telegram_first_name": tg_user.get("first_name", ""),
            "telegram_last_name": tg_user.get("last_name", ""),
            "telegram_username": tg_user.get("username", ""),
            "telegram_photo_url": tg_user.get("photo_url", ""),
            "full_name": full_name.strip(),
        }
        await db.execute(
            text("UPDATE users SET raw_user_meta_data = :meta WHERE id = :uid"),
            {"meta": json.dumps(meta), "uid": user_id},
        )
        await db.commit()
    else:
        # Create new user
        user_id = str(uuid4())
        meta = {
            "provider": "telegram-miniapp",
            "telegram_id": tg_id,
            "telegram_first_name": tg_user.get("first_name", ""),
            "telegram_last_name": tg_user.get("last_name", ""),
            "telegram_username": tg_user.get("username", ""),
            "telegram_photo_url": tg_user.get("photo_url", ""),
            "full_name": full_name.strip(),
        }
        random_password = hash_password(str(uuid4()))
        await db.execute(
            text("""
                INSERT INTO users (id, email, encrypted_password, raw_user_meta_data, created_at)
                VALUES (:id, :email, :pw, :meta, NOW())
            """),
            {"id": user_id, "email": email, "pw": random_password, "meta": json.dumps(meta)},
        )

        profile_id = str(uuid4())
        await db.execute(
            text("INSERT INTO user_profiles (id, user_id, is_admin, created_at) VALUES (:id, :uid, false, NOW())"),
            {"id": profile_id, "uid": user_id},
        )
        await db.execute(
            text("INSERT INTO limits (user_profile_id, wardrobe_items_anlyzed, ai_requests, ideas_viewed, outfits_saved, vton_used) VALUES (:pid, 3, 3, 10, 3, 1)"),
            {"pid": profile_id},
        )
        await db.execute(
            text("INSERT INTO user_credits (user_profile_id, credits_balance) VALUES (:pid, 0)"),
            {"pid": profile_id},
        )
        await db.commit()

    # Get profile
    prof_result = await db.execute(
        text("SELECT id, is_admin FROM user_profiles WHERE user_id = :uid"),
        {"uid": user_id},
    )
    prof = prof_result.first()

    access = create_access_token(user_id, email, prof.is_admin if prof else False)
    refresh = create_refresh_token(user_id)
    tok = decode_token(access)

    return AuthResponse(
        access_token=access,
        refresh_token=refresh,
        expires_at=tok["exp"],
        user={
            "id": user_id,
            "email": email,
            "profile_id": str(prof.id) if prof else None,
            "is_admin": prof.is_admin if prof else False,
        },
    )


@router.post("/signout")
async def signout():
    """Client-side signout — tokens are stateless, just return ok."""
    return {"success": True}
