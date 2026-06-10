"""Server-side usage-event recorder.

Single helper used by every place that needs to drop a row into usage_events
from the backend (e.g. when a user_looks row is created). Recording server-side
— inside the same transaction as the fact it describes — guarantees the event
stream and the underlying table can never disagree, unlike client-fired events
which silently drop on Safari backgrounding / flaky networks / trackOnce dedup.

The canonical COUNT for a metric should still come from the authoritative table
(user_looks, wardrobe_user_items, payments…). These usage_events rows exist so
the per-user timeline can show *when* something happened and so time-series
charts have a uniform source.

Caller owns the transaction: this function does NOT commit.
"""

import json as json_lib
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def record_usage_event(
    db: AsyncSession,
    user_id: str,
    feature: str,
    action: str = "track",
    count: int = 1,
    meta: Optional[dict] = None,
) -> bool:
    """Insert one usage_events row for the given auth user_id (UUID).

    Resolves the BIGINT profile id, enriches with subscriber/credit status
    (both NOT NULL on the table), and bumps daily activity for DAU/MAU. Returns
    False (no-op) if the user has no profile row yet. Never raises — tracking
    must not break the action it is attached to.
    """
    try:
        profile = (
            await db.execute(
                text("SELECT id FROM user_profiles WHERE user_id = :uid"),
                {"uid": user_id},
            )
        ).first()
        if not profile:
            return False
        pid = profile[0]

        # SAVEPOINT: if anything in here fails (constraint, bad jsonb, …) only
        # this nested block rolls back — the caller's outer transaction (e.g. the
        # user_looks INSERT) stays intact and can still commit. Without this, a
        # poisoned session would turn a tracking hiccup into a failed save.
        async with db.begin_nested():
            has_sub = (
                await db.execute(
                    text(
                        "SELECT EXISTS(SELECT 1 FROM user_subscriptions "
                        "WHERE user_profile_id = :pid AND status = 'active' AND expires_at > NOW())"
                    ),
                    {"pid": pid},
                )
            ).scalar() or False

            has_bought = (
                await db.execute(
                    text(
                        "SELECT EXISTS(SELECT 1 FROM credit_transactions "
                        "WHERE user_profile_id = :pid AND reason = 'purchase')"
                    ),
                    {"pid": pid},
                )
            ).scalar() or False

            await db.execute(
                text(
                    """INSERT INTO usage_events
                        (user_profile_id, user_anon_id, feature, action, count,
                         is_subscriber, has_bought_credits,
                         page_path, item_id, request_id, metadata, occurred_at)
                       VALUES (:pid, :anon, :feat, :act, :cnt,
                               :is_sub, :has_bought,
                               :page, :item, :req, CAST(:meta AS jsonb), NOW())"""
                ),
                {
                    "pid": pid,
                    "anon": str(pid),
                    "feat": feature,
                    "act": action,
                    "cnt": count,
                    "is_sub": has_sub,
                    "has_bought": has_bought,
                    "page": (meta or {}).get("pagePath"),
                    "item": (meta or {}).get("itemId"),
                    "req": (meta or {}).get("requestId"),
                    "meta": json_lib.dumps(meta) if meta else "{}",
                },
            )
            await db.execute(text("SELECT record_user_activity(:pid)"), {"pid": pid})
        return True
    except Exception:
        # Tracking is best-effort. Swallow so a logging hiccup never rolls back
        # the real write (e.g. the user_looks insert) the caller is doing.
        return False
