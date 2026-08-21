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
    (both NOT NULL on the table), and bumps daily activity for DAU/MAU. Never
    raises — tracking must not break the action it is attached to.

    Works BEFORE the profile exists. Until 2026-08-21 this returned False for a
    profile-less user, which made the largest drop in the product structurally
    unmeasurable: an account row is created the moment someone opens the Mini
    App, but the profile only on submitting the last of three registration
    steps, and 160 of 457 accounts never got that far (25–62% every month since
    launch, on both the Telegram and the web channel). Every one of those people
    was invisible to every event query, so "where in registration do they
    leave?" had no answer at all.

    usage_events.user_profile_id is nullable and user_anon_id is NOT NULL, so a
    pre-profile event is stored keyed on the auth user_id. Subscriber and credit
    flags are trivially false for someone who has not finished signing up.
    daily_user_activity takes a BIGINT profile id and is skipped in that case.
    """
    try:
        profile = (
            await db.execute(
                text("SELECT id FROM user_profiles WHERE user_id = :uid"),
                {"uid": user_id},
            )
        ).first()
        pid = profile[0] if profile else None

        # SAVEPOINT: if anything in here fails (constraint, bad jsonb, …) only
        # this nested block rolls back — the caller's outer transaction (e.g. the
        # user_looks INSERT) stays intact and can still commit. Without this, a
        # poisoned session would turn a tracking hiccup into a failed save.
        async with db.begin_nested():
            # Someone without a profile cannot hold a subscription or have bought
            # credits — both are keyed on the profile id. Skip the two lookups
            # rather than running them with :pid = NULL, where EXISTS is a
            # guaranteed false and the query is pure cost.
            if pid is None:
                has_sub = has_bought = False
            else:
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
                    # user_anon_id is NOT NULL and is the only key a pre-profile
                    # event has. Falling back to the auth user_id keeps those
                    # rows joinable to `users`, which is what the registration
                    # funnel counts from.
                    "anon": str(pid) if pid is not None else str(user_id),
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
            if pid is not None:
                await db.execute(text("SELECT record_user_activity(:pid)"), {"pid": pid})
        return True
    except Exception:
        # Tracking is best-effort. Swallow so a logging hiccup never rolls back
        # the real write (e.g. the user_looks insert) the caller is doing.
        return False
