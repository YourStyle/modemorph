"""FastAPI dependencies for auth and database."""

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token


async def _touch_activity(db: AsyncSession, profile_id) -> None:
    """Mark the user active today, on ANY authenticated request.

    Until 2026-08-20 `daily_user_activity` was written only from the metered
    feature path (services/usage.py and api/misc.py), so opening the app, browsing
    the wardrobe or scrolling the feed recorded nothing. Every retention, DAU/MAU,
    cohort and activation number was therefore measuring how much of the product
    is instrumented rather than whether people came back — 124 of 455 users had
    ever produced a row.

    Commits on its own: this runs as a dependency, before the endpoint body, so
    the transaction holds nothing else. Best-effort — a failed ping must never
    cost the user their request, and a poisoned session must not reach the
    endpoint, hence the rollback.
    """
    try:
        await db.execute(text("SELECT record_user_activity(:pid)"), {"pid": profile_id})
        await db.commit()
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """
    Extract and validate Bearer token from Authorization header.
    Returns user dict with id, email, is_admin.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")

    token = auth_header.split(" ", 1)[1]
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    # Verify user exists and get profile
    result = await db.execute(
        text("""
            SELECT u.id, u.email, up.id as profile_id, up.is_admin
            FROM users u
            LEFT JOIN user_profiles up ON up.user_id = u.id
            WHERE u.id = :user_id
        """),
        {"user_id": user_id},
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    if row.profile_id:
        await _touch_activity(db, row.profile_id)

    return {
        "id": str(row.id),
        "email": row.email,
        "profile_id": str(row.profile_id) if row.profile_id else None,
        "is_admin": row.is_admin or False,
    }


async def get_admin_user(user: dict = Depends(get_current_user)) -> dict:
    """Require admin role."""
    if not user.get("is_admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    return user
