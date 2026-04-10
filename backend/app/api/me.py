"""
User profile endpoints — /api/me/*
"""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user

router = APIRouter()


@router.get("")
async def get_me(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user info."""
    result = await db.execute(
        text("""
            SELECT u.id, u.email, u.raw_user_meta_data,
                   up.id as profile_id, up.is_admin, up.created_at
            FROM users u
            LEFT JOIN user_profiles up ON up.user_id = u.id
            WHERE u.id = :uid
        """),
        {"uid": user["id"]},
    )
    row = result.mappings().first()
    if not row:
        return {"user": None}

    meta = row.get("raw_user_meta_data") or {}
    return {
        "user": {
            "id": str(row["id"]),
            "email": row["email"],
            "profile_id": str(row["profile_id"]) if row["profile_id"] else None,
            "is_admin": row["is_admin"] or False,
            "full_name": meta.get("full_name", ""),
            "telegram_id": meta.get("telegram_id"),
            "telegram_username": meta.get("telegram_username"),
            "telegram_photo_url": meta.get("telegram_photo_url"),
            "created_at": str(row["created_at"]) if row["created_at"] else None,
        }
    }


@router.get("/profile")
async def get_profile(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user profile with subscription and limits."""
    result = await db.execute(
        text("""
            SELECT up.*, u.email, u.raw_user_meta_data,
                   l.wardrobe_items_anlyzed, l.ai_requests, l.ideas_viewed,
                   l.outfits_saved, l.vton_used,
                   uc.credits_balance,
                   us.subscription_type, us.status as sub_status, us.expires_at as sub_expires
            FROM user_profiles up
            JOIN users u ON u.id = up.user_id
            LEFT JOIN limits l ON l.user_profile_id = up.id
            LEFT JOIN user_credits uc ON uc.user_profile_id = up.id
            LEFT JOIN user_subscriptions us ON us.user_profile_id = up.id
                AND us.status = 'active' AND us.expires_at > NOW()
            WHERE up.user_id = :uid
        """),
        {"uid": user["id"]},
    )
    row = result.mappings().first()
    if not row:
        return {"profile": None}
    return {"profile": dict(row)}


@router.get("/profile-session")
async def get_profile_session(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get profile data for session (used by navigation, sheets)."""
    result = await db.execute(
        text("""
            SELECT up.id as profile_id, up.is_admin, up.gender, up.onboarding_completed,
                   u.email, u.raw_user_meta_data
            FROM user_profiles up
            JOIN users u ON u.id = up.user_id
            WHERE up.user_id = :uid
        """),
        {"uid": user["id"]},
    )
    row = result.mappings().first()
    if not row:
        return {"profile": None}

    meta = row.get("raw_user_meta_data") or {}
    return {
        "profile": {
            **dict(row),
            "full_name": meta.get("full_name", ""),
            "telegram_photo_url": meta.get("telegram_photo_url"),
        }
    }


@router.get("/notifications")
async def get_notifications(user: dict = Depends(get_current_user)):
    """Notifications stub."""
    return {"notifications": []}
