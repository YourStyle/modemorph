"""
User profile endpoints — /api/me/*
Returns data in Supabase-compatible format for frontend.
"""

import json as json_lib

from fastapi import APIRouter, Depends, HTTPException, Request
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
        return {"user": None, "profile": None}

    meta = row.get("raw_user_meta_data") or {}

    return {
        "user": {
            "id": str(row["id"]),
            "email": row["email"],
            "user_metadata": meta,
        },
        "profile": {
            "id": str(row["profile_id"]) if row["profile_id"] else None,
            "is_admin": row["is_admin"] or False,
        },
    }


@router.get("/profile")
async def get_profile(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user profile with all fields."""
    result = await db.execute(
        text("SELECT * FROM user_profiles WHERE user_id = :uid"),
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
    """
    Get profile data for session.
    Returns { profile: <all_fields>, user: <supabase_compat_user> }
    """
    # Get full profile
    profile_result = await db.execute(
        text("SELECT * FROM user_profiles WHERE user_id = :uid"),
        {"uid": user["id"]},
    )
    profile = profile_result.mappings().first()

    # Get user with metadata
    user_result = await db.execute(
        text("SELECT id, email, raw_user_meta_data, created_at FROM users WHERE id = :uid"),
        {"uid": user["id"]},
    )
    user_row = user_result.mappings().first()

    meta = user_row["raw_user_meta_data"] if user_row and isinstance(user_row["raw_user_meta_data"], dict) else {}

    return {
        "profile": dict(profile) if profile else None,
        "user": {
            "id": str(user_row["id"]),
            "email": user_row["email"],
            "user_metadata": meta,
            "created_at": str(user_row["created_at"]) if user_row["created_at"] else None,
        } if user_row else None,
    }


@router.post("/profile-session")
async def update_profile_session(
    request: Request,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create or update user profile (partial update)."""
    body = await request.json()

    # Check if profile exists
    existing = await db.execute(
        text("SELECT id FROM user_profiles WHERE user_id = :uid"),
        {"uid": user["id"]},
    )
    profile = existing.first()

    allowed_fields = [
        "full_name", "gender", "height", "weight",
        "top_size", "bottom_size", "shoe_size",
        "avatar_url", "onboarding_complete",
    ]

    if profile:
        # Partial update — only update fields present in request
        updates = {}
        for field in allowed_fields:
            if field in body:
                val = body[field]
                if field in ("height", "weight", "shoe_size") and val:
                    val = int(val)
                updates[field] = val if val else None

        # If avatar_url changed, save previous avatar to user_avatars history
        if "avatar_url" in updates and updates["avatar_url"]:
            old_avatar = await db.execute(
                text("SELECT avatar_url FROM user_profiles WHERE user_id = :uid"),
                {"uid": user["id"]},
            )
            old_row = old_avatar.first()
            if old_row and old_row[0] and old_row[0] != updates["avatar_url"]:
                # Demote current primary avatar
                await db.execute(
                    text("UPDATE user_avatars SET is_primary = false WHERE user_id = :uid AND is_primary = true"),
                    {"uid": user["id"]},
                )
                # Save old avatar to history (if not already there)
                await db.execute(
                    text("""
                        INSERT INTO user_avatars (user_id, url, is_primary, created_at)
                        VALUES (:uid, :url, false, NOW())
                        ON CONFLICT DO NOTHING
                    """),
                    {"uid": user["id"], "url": old_row[0]},
                )
            # Save new avatar as primary
            await db.execute(
                text("""
                    INSERT INTO user_avatars (user_id, url, is_primary, created_at)
                    VALUES (:uid, :url, true, NOW())
                    ON CONFLICT DO NOTHING
                """),
                {"uid": user["id"], "url": updates["avatar_url"]},
            )

        if updates:
            set_parts = [f'"{k}" = :{k}' for k in updates]
            set_parts.append('"updated_at" = NOW()')
            set_clause = ", ".join(set_parts)
            updates["uid"] = user["id"]

            await db.execute(
                text(f'UPDATE user_profiles SET {set_clause} WHERE user_id = :uid'),
                updates,
            )
    else:
        # Create new profile
        insert_data = {
            "user_id": user["id"],
            "full_name": body.get("full_name"),
            "gender": body.get("gender"),
            "height": int(body["height"]) if body.get("height") else None,
            "weight": int(body["weight"]) if body.get("weight") else None,
            "top_size": body.get("top_size"),
            "bottom_size": body.get("bottom_size"),
            "shoe_size": int(body["shoe_size"]) if body.get("shoe_size") else None,
            "avatar_url": body.get("avatar_url"),
            "is_admin": False,
        }

        cols = ", ".join(f'"{k}"' for k in insert_data)
        vals = ", ".join(f":{k}" for k in insert_data)
        await db.execute(text(f'INSERT INTO user_profiles ({cols}) VALUES ({vals})'), insert_data)

        # Also init limits and credits for new profile
        new_profile = await db.execute(
            text("SELECT id FROM user_profiles WHERE user_id = :uid"),
            {"uid": user["id"]},
        )
        pid = new_profile.scalar()
        if pid:
            await db.execute(
                text("INSERT INTO limits (user_profile_id, wardrobe_items_anlyzed, ai_requests, ideas_viewed, outfits_saved, vton_used) VALUES (:pid, 3, 3, 10, 3, 1) ON CONFLICT DO NOTHING"),
                {"pid": str(pid)},
            )
            await db.execute(
                text("INSERT INTO user_credits (user_profile_id, credits_balance) VALUES (:pid, 0) ON CONFLICT DO NOTHING"),
                {"pid": str(pid)},
            )

    await db.commit()
    return {"success": True}


@router.get("/avatars")
async def get_avatars(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all avatars for user (history)."""
    result = await db.execute(
        text("SELECT id, url, is_primary, created_at FROM user_avatars WHERE user_id = :uid ORDER BY created_at DESC"),
        {"uid": user["id"]},
    )
    return [dict(r) for r in result.mappings().all()]


@router.post("/avatars")
async def save_avatar(
    request: Request,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save current avatar to history before replacing."""
    body = await request.json()
    url = body.get("url")
    if not url:
        raise HTTPException(status_code=400, detail="url required")
    # Avoid duplicate entries
    existing = await db.execute(
        text("SELECT id FROM user_avatars WHERE user_id = :uid AND url = :url"),
        {"uid": user["id"], "url": url},
    )
    if not existing.first():
        await db.execute(
            text("INSERT INTO user_avatars (user_id, url, is_primary, created_at) VALUES (:uid, :url, false, NOW())"),
            {"uid": user["id"], "url": url},
        )
        await db.commit()
    return {"success": True}


@router.post("/avatars/{avatar_id}/set-primary")
async def set_primary_avatar(
    avatar_id: int,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set an existing avatar as primary."""
    # Get the avatar URL
    avatar = await db.execute(
        text("SELECT url FROM user_avatars WHERE id = :id AND user_id = :uid"),
        {"id": avatar_id, "uid": user["id"]},
    )
    row = avatar.first()
    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Avatar not found")

    # Demote all, promote selected
    await db.execute(
        text("UPDATE user_avatars SET is_primary = false WHERE user_id = :uid"),
        {"uid": user["id"]},
    )
    await db.execute(
        text("UPDATE user_avatars SET is_primary = true, updated_at = NOW() WHERE id = :id"),
        {"id": avatar_id},
    )
    # Update profile
    await db.execute(
        text("UPDATE user_profiles SET avatar_url = :url, updated_at = NOW() WHERE user_id = :uid"),
        {"url": row[0], "uid": user["id"]},
    )
    await db.commit()
    return {"success": True, "avatar_url": row[0]}


@router.get("/notifications")
async def get_notifications(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("SELECT notifications_enabled FROM user_profiles WHERE user_id = :uid"),
        {"uid": user["id"]},
    )
    row = result.first()
    return {"notifications_enabled": row[0] if row else True}


@router.patch("/notifications")
async def update_notifications(
    request: Request,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()
    enabled = body.get("notifications_enabled", True)
    await db.execute(
        text("UPDATE user_profiles SET notifications_enabled = :e, updated_at = NOW() WHERE user_id = :uid"),
        {"e": enabled, "uid": user["id"]},
    )
    await db.commit()
    return {"success": True, "notifications_enabled": enabled}
