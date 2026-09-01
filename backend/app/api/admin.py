"""Admin endpoints — complete set."""

import json as json_lib
import logging
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_admin_user, get_staff_user, require_role
from app.services.telegram import send_bot_message

logger = logging.getLogger(__name__)

router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────
# Analytics: shared guards and thresholds
# ─────────────────────────────────────────────────────────────────────────

def not_test(col: str, key: str = "user_id") -> str:
    """The ONE definition of "this row does not belong to a test account".

    Every revenue, funnel, payment and user-scoped metric composes this, and so
    does the Excel export (which reads the same response). A predicate copied
    into a dozen queries is how the dashboard and the export drift apart — the
    dashboard gets a new exclusion, the export keeps the old numbers, and the
    two disagree with nobody noticing.

    NOT EXISTS rather than `NOT IN (SELECT ...)` on purpose:
      * `NULL NOT IN (…)` evaluates to NULL, which silently drops rows whose
        user_id is NULL (recommendation_logs allows that).
      * `IN (SELECT user_id FROM user_profiles WHERE NOT is_test)` would also
        drop orphans — rows whose user_id has no profile row at all. There are
        30 such rows in recommendation_logs on prod today; they are real
        retrievals and must keep counting.
    Only rows positively matched to a flagged profile are removed.

    `key` is the user_profiles column to join on: `user_id` for the UUID that
    payments/user_looks/wardrobe_user_items carry, `id` for the BIGINT profile
    id that usage_events/daily_user_activity carry.
    """
    if "." not in col:
        # An unqualified name inside the subquery resolves to the INNER scope
        # first, so `not_test("user_id")` would expand to `_tf.user_id =
        # _tf.user_id` — always true, excluding every row. Fail loudly.
        raise ValueError(f"not_test() needs a table-qualified column, got {col!r}")
    return f"NOT EXISTS (SELECT 1 FROM user_profiles _tf WHERE _tf.{key} = {col} AND _tf.is_test)"


# Revenue is gated on payer count, checked in SQL (a HAVING clause that returns
# zero rows), not by hiding a card in the UI. A hidden card still ships the
# numbers in the JSON, and they end up pasted into a deck.
MIN_PAYERS_FOR_REVENUE = 30

# CTR needs a sample before it means anything. At a ~2% rate you need on the
# order of 1000 impressions for a ±1pp interval; below that the number moves a
# full point when one person taps one card. Enforced in SQL, same reason.
MIN_IMPRESSIONS_FOR_CTR = 1000

# A cohort cell built from fewer than this many users renders "—". One user out
# of one is 100% retention and it is not a fact about the product.
MIN_COHORT_SIZE = 10

# The day `deps.py::_touch_activity` shipped. Before it, daily_user_activity was
# written ONLY by the metered-feature path (services/usage.py, api/misc.py), so
# opening the app, browsing the wardrobe or scrolling the feed recorded nothing:
# 124 of 457 users had ever produced a row. Every retention / DAU / MAU / cohort
# figure before this date measures *paid actions*, not returning users. The
# series is not comparable across this boundary and the UI must draw the break.
ACTIVITY_PING_CUTOFF = "2026-08-20"

# Client-side impression + click logging landed here. recommendation_logs has no
# row with a non-NULL action before it.
REC_INSTRUMENTATION_SINCE = "2026-06-09"


def _pct(num, den, digits: int = 1):
    """Percentage, or None when it cannot honestly be computed.

    Returns None — never 0 — for an empty or unknown denominator, so the UI
    renders "—" instead of a confident zero that reads as "measured, and bad".
    """
    if num is None or den is None or not den:
        return None
    return round(num / den * 100, digits)


def _ratio(num, den, digits: int = 1):
    if num is None or den is None or not den:
        return None
    return round(num / den, digits)


@router.get("/analytics")
async def analytics(user: dict = Depends(get_staff_user), db: AsyncSession = Depends(get_db)):
    """Product analytics — onboarding, aha-moment, value, engagement, retention,
    payment funnel, timeline.

    Two rules this endpoint is built around:

    1. A failed query returns None and records itself in `_errors`. It never
       returns 0. A zero from a broken query is indistinguishable from a
       measured zero, and the dashboard spent months showing "0 конверсий" that
       was actually "this column does not exist".
    2. A number that cannot be computed is absent, not estimated. Revenue is
       gated in SQL on payer count; CTR is gated on impression count; cohort
       cells are gated on cohort size.
    """

    errors: list[dict] = []

    async def scalar(label: str, sql: str, default=None):
        """Run a scalar query.

        `default` substitutes a SQL NULL result (query succeeded, no value).
        A raised exception is different and is never conflated with it: the
        failure is logged, appended to `_errors`, and the metric comes back
        None so the UI renders "—" and the banner, never a confident 0.
        """
        try:
            value = (await db.execute(text(sql))).scalar()
            return default if value is None else value
        except Exception as e:
            await db.rollback()
            logger.exception("[admin/analytics] scalar %r failed", label)
            errors.append({"metric": label, "error": str(e)[:300]})
            return None

    async def rows(label: str, sql: str):
        try:
            return (await db.execute(text(sql))).mappings().all()
        except Exception as e:
            await db.rollback()
            logger.exception("[admin/analytics] rows %r failed", label)
            errors.append({"metric": label, "error": str(e)[:300]})
            return []

    # ── Population: TWO numbers, because they are two different things ─────
    #
    # `users` gets a row the moment somebody authenticates — api/auth.py INSERTs
    # it on email signup (line 89), on Telegram auth (195) and on the mini-app
    # bootstrap (314). `user_profiles` gets a row only when the profile form is
    # submitted (api/me.py:216). Those are not the same population and never
    # were: prod today has 457 accounts and 297 profiles, so 160 people
    # authenticated — 85 of them by opening the Mini App — and produced no
    # profile row at all.
    #
    # This endpoint used to ship ONE number, count(*) FROM user_profiles, under
    # the name `total_users`, and /admin/users printed it beneath the caption
    # «Зарегистрированных аккаунтов». It was wrong by 160 accounts (455 minus
    # test versus the 295 it printed), it deleted
    # the single largest drop-off in the product (auth → profile, 35%) from a
    # funnel whose stated contract is that every stage is a subset of the one
    # above, and `meta.excludes_test_accounts` told the reader that two test
    # accounts were the only thing removed.
    #
    # So both numbers ship, both are named for what they count, and the gap
    # between them is a field in the payload rather than a definition buried in
    # a WHERE clause. Rates below stay on the profile denominator — a
    # profile-less account cannot appear in daily_user_activity (which keys on
    # user_profiles.id) and has zero rows in wardrobe_user_items / user_looks /
    # payments on prod, so counting it in a numerator is impossible — but every
    # one of them now carries `*_basis` naming that denominator out loud.
    total_accounts = await scalar(
        "total_accounts",
        f"SELECT count(*) FROM users u WHERE {not_test('u.id')}",
    )
    total_users = await scalar("total_users", "SELECT count(*) FROM user_profiles WHERE NOT is_test")
    test_accounts = await scalar("test_accounts", "SELECT count(*) FROM user_profiles WHERE is_test", default=0)
    accounts_without_profile = (
        None if (total_accounts is None or total_users is None) else total_accounts - total_users
    )
    # The name every rate on this page divides by, shipped next to the rate so
    # "% от зарегистрированных" cannot be read onto a denominator that is not
    # the registered population.
    PROFILE_BASIS = "profiles_with_data"

    # ── Onboarding ────────────────────────────────────────────────────────
    # "Завершили онбординг" is GONE. It read user_profiles.onboarding_complete,
    # which is BOOLEAN DEFAULT true — 296 of 297 rows are true because nobody
    # ever set them false, not because 99.7% of users finished onboarding. A
    # column's default is not a measurement.
    users_with_first_item = await scalar(
        "users_with_first_item",
        f"SELECT count(DISTINCT w.user_id) FROM wardrobe_user_items w WHERE {not_test('w.user_id')}",
    )
    # Buckets are item COUNTS, and are now labelled as such. They used to be
    # called "30% / 50% / 100% гардероба" while thresholding at 15/25/50 items —
    # a percentage of a wardrobe size nobody ever declared.
    wardrobe_counts = await rows(
        "wardrobe_counts",
        f"SELECT w.user_id, count(*) AS cnt FROM wardrobe_user_items w"
        f" WHERE {not_test('w.user_id')} GROUP BY w.user_id",
    )
    users_wardrobe_15 = sum(1 for r in wardrobe_counts if r["cnt"] >= 15)
    users_wardrobe_25 = sum(1 for r in wardrobe_counts if r["cnt"] >= 25)
    users_wardrobe_50 = sum(1 for r in wardrobe_counts if r["cnt"] >= 50)

    # ── Aha-moment ────────────────────────────────────────────────────────
    # SINGLE SOURCE OF TRUTH: a real user "makes an outfit" by saving a look
    # into user_looks (POST /api/user-looks). The `outfits` table is only
    # written by admin/AI flows.
    users_first_outfit = await scalar(
        "users_first_outfit",
        f"SELECT count(DISTINCT l.user_id) FROM user_looks l WHERE {not_test('l.user_id')}",
    )
    # action='consume_success' only. Counting every vton_used row folded in 322
    # 'click' and 50 'consume_fail' events — a user who opened the try-on sheet
    # and hit the paywall was being counted as having tried on a garment.
    users_first_tryon = await scalar(
        "users_first_tryon",
        f"SELECT count(DISTINCT e.user_profile_id) FROM usage_events e"
        f" WHERE e.feature = 'vton_used' AND e.action = 'consume_success'"
        f" AND {not_test('e.user_profile_id', 'id')}",
    )
    # Rec clicks live in recommendation_logs (written by /api/rec-event).
    users_clicked_rec = await scalar(
        "users_clicked_rec",
        f"SELECT count(DISTINCT r.user_id) FROM recommendation_logs r"
        f" WHERE r.action = 'click' AND {not_test('r.user_id')}",
    )

    # ── Recommendations: SERVED is not IMPRESSIONS ────────────────────────
    # 433 280 of 433 778 recommendation_logs rows have action IS NULL. Those are
    # server-side CLIP retrievals — the ranker wrote down what it returned. No
    # human necessarily saw any of them. An "impression" is a card that entered
    # the viewport and fired /api/rec-event; there are 463 of those, from 12
    # users, none before 2026-06-09.
    #
    # The two are reported as separate named metrics and clicks are NEVER
    # divided by served. Dividing 18 by 433 280 yields 0.004%, which reads as a
    # catastrophic product failure and is actually a units error.
    rec = await rows(
        "recommendations",
        f"""
        SELECT
            count(*) FILTER (WHERE r.action IS NULL)                          AS served_rows,
            count(DISTINCT r.rec_session_id) FILTER (WHERE r.action IS NULL)   AS served_sessions,
            count(DISTINCT r.user_id) FILTER (WHERE r.action IS NULL)          AS served_users,
            count(*) FILTER (WHERE r.action = 'impression')                    AS impressions,
            count(DISTINCT r.rec_session_id) FILTER (WHERE r.action = 'impression') AS impression_sessions,
            count(DISTINCT r.user_id) FILTER (WHERE r.action = 'impression')   AS impression_users,
            count(*) FILTER (WHERE r.action = 'click')                         AS clicks,
            count(DISTINCT r.user_id) FILTER (WHERE r.action = 'click')        AS click_users
        FROM recommendation_logs r
        WHERE {not_test('r.user_id')}
        """,
    )
    rec = dict(rec[0]) if rec else {}

    # CTR is computed over every session that produced at least one
    # action='impression' row — the impression-aligned basis, and the SAME
    # population the «Показы» tile counts. There is exactly one impression
    # number on this page.
    #
    # This used to INTERSECT the impression sessions with the *served* sessions
    # (action IS NULL), on the stated rationale that it made "numerator and
    # denominator describe the same sessions". It did not. A session that
    # emitted action='impression' already carries both the impressions and the
    # clicks from the same client; the extra INTERSECT additionally demanded a
    # server-retrieval row, which is a property of the ranker's logging, not of
    # whether a human saw a card. On prod it discarded 25 of 41 fully
    # instrumented sessions and 14 of 16 clicks: the tile printed 414 показов
    # while the CTR tile beside it printed 152, same word, different
    # population, no explanation. Paired CTR was 1.3%, impression-aligned 3.9%.
    _impression_cte = f"""
        WITH impressed AS (
            SELECT DISTINCT rec_session_id FROM recommendation_logs
            WHERE action = 'impression' AND rec_session_id IS NOT NULL
        ), scoped AS (
            SELECT r.* FROM recommendation_logs r JOIN impressed p USING (rec_session_id)
            WHERE {not_test('r.user_id')}
        )
    """
    ctr_basis = await rows(
        "rec_ctr_basis",
        _impression_cte + """
        SELECT count(DISTINCT rec_session_id)                  AS sessions,
               count(*) FILTER (WHERE action = 'impression')   AS impressions,
               count(*) FILTER (WHERE action = 'click')        AS clicks
        FROM scoped
        """,
    )
    _ctr_basis_ok = bool(ctr_basis)
    ctr_basis = dict(ctr_basis[0]) if ctr_basis else {"sessions": 0, "impressions": 0, "clicks": 0}
    # The invariant that keeps the two tiles honest, checked rather than
    # assumed: the CTR denominator IS the impressions headline. If a future
    # edit re-narrows one of them, it lands in `_errors` and the UI shows the
    # banner instead of two different numbers labelled «показы».
    #
    # Gated on `_ctr_basis_ok` so a failed basis query reports itself once, as
    # itself. Without it the 0-fallback would compare 0 against 414 and add a
    # spurious second "mismatch" on top of the real error.
    if (
        _ctr_basis_ok
        and ctr_basis.get("impressions") is not None
        and rec.get("impressions") is not None
        and ctr_basis["impressions"] != rec["impressions"]
    ):
        errors.append({
            "metric": "ctr_basis_mismatch",
            "error": (
                f"знаменатель CTR ({ctr_basis['impressions']}) не равен показам "
                f"({rec['impressions']}) — на странице два разных числа с одной подписью"
            ),
        })
    # The suppression is a HAVING clause, not an `if` in the UI: below the
    # threshold this query returns zero rows and there is no percentage to leak
    # into the JSON, the Excel export, or a screenshot.
    rec_ctr = await scalar(
        "rec_ctr",
        _impression_cte + f"""
        SELECT round(
            100.0 * count(*) FILTER (WHERE action = 'click')
                 / NULLIF(count(*) FILTER (WHERE action = 'impression'), 0), 2)
        FROM scoped
        HAVING count(*) FILTER (WHERE action = 'impression') >= {MIN_IMPRESSIONS_FOR_CTR}
        """,
    )
    # "Affiliate CTR" is GONE. It divided count(action='affiliate_click') by
    # impressions; no code anywhere emits 'affiliate_click', so the tile was a
    # hardcoded 0.0% dressed as a measurement.

    # ── Value delivery ────────────────────────────────────────────────────
    # 'outfit_shared' and 'session_task_completed' tiles are GONE: zero rows in
    # usage_events for either feature name, ever. No code emits them.
    total_outfits_saved = await scalar(
        "total_outfits_saved",
        f"SELECT count(*) FROM user_looks l WHERE {not_test('l.user_id')}",
    )
    users_saved_outfits = users_first_outfit
    users_with_repeat = await scalar(
        "users_with_repeat",
        f"SELECT count(*) FROM (SELECT l.user_id FROM user_looks l WHERE {not_test('l.user_id')}"
        f" GROUP BY l.user_id HAVING count(*) >= 2) sub",
    )
    repeat_task_rate = _pct(users_with_repeat, users_saved_outfits)
    outfits_per_user = _ratio(total_outfits_saved, users_saved_outfits)

    # ── Engagement ────────────────────────────────────────────────────────
    # consume_success only. The old predicate was feature IN
    # ('ai_assistant_used','ai_requests') with no action filter, so it summed
    # attempts (564), successes (285), UI clicks (82), failures (53) and a dead
    # 'ai_assistant_used' tracking event (67) into one number: 1051 "AI сессий"
    # against 285 answers actually delivered.
    users_used_ai = await scalar(
        "users_used_ai",
        f"SELECT count(DISTINCT e.user_profile_id) FROM usage_events e"
        f" WHERE e.feature = 'ai_requests' AND e.action = 'consume_success'"
        f" AND {not_test('e.user_profile_id', 'id')}",
    )
    total_ai_requests = await scalar(
        "total_ai_requests",
        f"SELECT count(*) FROM usage_events e"
        f" WHERE e.feature = 'ai_requests' AND e.action = 'consume_success'"
        f" AND {not_test('e.user_profile_id', 'id')}",
    )

    # ── Retention ─────────────────────────────────────────────────────────
    # Honest framing: the denominator is every eligible registered user, but the
    # numerator can only ever contain users who produced a daily_user_activity
    # row — and until today that table was written only by the metered-feature
    # path. These figures are a lower bound on returning users and a direct
    # measure of how much of the product was instrumented. `measurement` below
    # carries the coverage so the UI can say so out loud.
    ret = await rows(
        "retention",
        """
        SELECT
            count(*) FILTER (WHERE up.created_at <= NOW() - INTERVAL '1 day')  AS eligible_d1,
            count(*) FILTER (WHERE up.created_at <= NOW() - INTERVAL '7 days') AS eligible_d7,
            count(*) FILTER (WHERE up.created_at <= NOW() - INTERVAL '30 days') AS eligible_d30,
            count(*) FILTER (WHERE up.created_at <= NOW() - INTERVAL '1 day' AND EXISTS (
                SELECT 1 FROM daily_user_activity d WHERE d.user_profile_id = up.id
                 AND d.activity_date = DATE(up.created_at) + 1)) AS d1,
            count(*) FILTER (WHERE up.created_at <= NOW() - INTERVAL '7 days' AND EXISTS (
                SELECT 1 FROM daily_user_activity d WHERE d.user_profile_id = up.id
                 AND d.activity_date BETWEEN DATE(up.created_at) + 2 AND DATE(up.created_at) + 7)) AS d7,
            count(*) FILTER (WHERE up.created_at <= NOW() - INTERVAL '30 days' AND EXISTS (
                SELECT 1 FROM daily_user_activity d WHERE d.user_profile_id = up.id
                 AND d.activity_date BETWEEN DATE(up.created_at) + 8 AND DATE(up.created_at) + 30)) AS d30
        FROM user_profiles up
        WHERE NOT up.is_test
        """,
    )
    ret = dict(ret[0]) if ret else {}
    instrumented_users = await scalar(
        "instrumented_users",
        f"SELECT count(DISTINCT d.user_profile_id) FROM daily_user_activity d"
        f" WHERE {not_test('d.user_profile_id', 'id')}",
    )

    # ── Stickiness (ONE query — there used to be two identical pairs) ─────
    # dau/mau were computed twice, verbatim, into `dau`/`mau` and `dau_val`/
    # `mau_val`; `stickiness` was derived from the first pair and the response
    # shipped the second. Four round-trips for two numbers.
    #
    # AND DAU/MAU IS NOT DIVIDED ACROSS THE INSTRUMENTATION BREAK. The numerator
    # is today — the first day `_touch_activity` writes a row on every
    # authorised request. The denominator is the trailing 30 days, 29 of which
    # were written only by the metered-feature path. Those are two different
    # instruments, and the quotient of two different instruments is not a
    # stickiness rate: today it reads 2/11 = 18%, and once the ping has been
    # live a week the numerator will be the full active base while the
    # denominator is still mostly pre-ping, inflating the headline for a month.
    # The window boundary is computed in SQL so it uses the database clock, the
    # same one CURRENT_DATE above uses.
    stick = await rows(
        "stickiness",
        f"""
        SELECT
            count(DISTINCT d.user_profile_id) FILTER (WHERE d.activity_date = CURRENT_DATE)     AS dau,
            count(DISTINCT d.user_profile_id) FILTER (WHERE d.activity_date > CURRENT_DATE - 30) AS mau,
            (CURRENT_DATE - 29)                                        AS mau_window_start,
            (CURRENT_DATE - 29) < DATE '{ACTIVITY_PING_CUTOFF}'        AS mau_crosses_cutoff
        FROM daily_user_activity d
        WHERE {not_test('d.user_profile_id', 'id')}
        """,
    )
    stick = dict(stick[0]) if stick else {}
    # None (query failed) suppresses too: a ratio is not shipped on the strength
    # of an unknown window.
    ratio_suppressed = stick.get("mau_crosses_cutoff") is not False
    avg_days_active = await scalar(
        "avg_days_active",
        f"""
        SELECT round(AVG(days), 1) FROM (
            SELECT d.user_profile_id, count(DISTINCT d.activity_date) AS days
            FROM daily_user_activity d
            WHERE d.activity_date > CURRENT_DATE - 30 AND {not_test('d.user_profile_id', 'id')}
            GROUP BY d.user_profile_id
        ) sub
        """,
    )

    # ── Payment funnel: invoice created -> payment confirmed ──────────────
    # This replaces the revenue block.
    #
    # WHAT `pending` IS, AND WHAT IT IS NOT.
    #
    # `payments.status` has exactly two values, ever: api/payments.py INSERTs
    # 'pending' when an invoice is created (line 94) and the Robokassa webhook
    # UPDATEs it to 'paid' (line 145). No code path in this repository writes
    # 'failed', 'canceled', 'expired' or anything else, and prod agrees —
    # SELECT DISTINCT status FROM payments returns {paid, pending}.
    #
    # So 'pending' is not a measurement of user behaviour. It is the residual
    # bucket for everything that is not a CONFIRMED payment: a declined card, a
    # closed payment sheet, a user who is mid-checkout right now, and a webhook
    # that was sent but never arrived are all the same row. Dividing it by
    # attempts and calling the result «отвал» reports a schema shape as a user
    # decision, and 88.9% of 45 attempts would get pasted into a deck as "89%
    # of users abandon checkout" — a claim this table cannot support.
    #
    # This is the identical read that deletes churn_rate further down (all
    # user_subscriptions rows are status='active' because nothing writes another
    # value). The count ships — it is a countable fact about invoices — under a
    # label that says what it counts, with `status_caveat` below carrying the
    # reason in the payload rather than in this comment. The word «отвал» and
    # the red framing come back when the provider callback writes a real
    # terminal status and a decline can be told apart from a lost webhook.
    #
    # Measured, not asserted: if a migration or a new provider ever starts
    # writing a third status, this query sees it and the caveat retires itself.
    status_rows = await rows(
        "payment_statuses_observed",
        f"SELECT p.status, count(*) AS cnt FROM payments p"
        f" WHERE {not_test('p.user_id')} GROUP BY 1 ORDER BY 2 DESC",
    )
    statuses_observed = [r["status"] for r in status_rows]
    # True while 'pending' is a catch-all rather than a state a payment
    # provider put the row into deliberately.
    has_failure_status = any(s not in ("paid", "pending") for s in statuses_observed)

    funnel_months = await rows(
        "payment_funnel_by_month",
        f"""
        SELECT to_char(date_trunc('month', p.created_at), 'YYYY-MM')        AS month,
               count(*)                                                     AS attempts,
               count(*) FILTER (WHERE p.status = 'pending')                 AS pending,
               count(*) FILTER (WHERE p.status = 'paid')                    AS paid,
               count(DISTINCT p.user_id)                                    AS users,
               COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid'), 0)  AS revenue
        FROM payments p
        WHERE {not_test('p.user_id')}
        GROUP BY 1 ORDER BY 1
        """,
    )
    payment_months = [{
        "month": r["month"],
        "attempts": r["attempts"],
        "pending": r["pending"],
        "paid": r["paid"],
        "users": r["users"],
        "revenue": float(r["revenue"] or 0),
        "paid_pct": _pct(r["paid"], r["attempts"]),
        # Renamed from `drop_off_pct`. Same arithmetic, honest name: the share
        # of invoices with no confirmed payment, which is NOT a drop-off rate.
        "unconfirmed_pct": _pct(r["pending"], r["attempts"]),
    } for r in funnel_months]

    pay_total = await rows(
        "payment_funnel_totals",
        f"""
        SELECT count(*)                                    AS attempts,
               count(*) FILTER (WHERE p.status = 'pending') AS pending,
               count(*) FILTER (WHERE p.status = 'paid')    AS paid,
               count(DISTINCT p.user_id)                    AS users_attempted,
               count(DISTINCT p.user_id) FILTER (WHERE p.status = 'paid') AS users_paid,
               COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid'), 0) AS revenue
        FROM payments p
        WHERE {not_test('p.user_id')}
        """,
    )
    pay_total = dict(pay_total[0]) if pay_total else {}
    payment_funnel = {
        "attempts": pay_total.get("attempts"),
        "pending": pay_total.get("pending"),
        "paid": pay_total.get("paid"),
        "users_attempted": pay_total.get("users_attempted"),
        "users_paid": pay_total.get("users_paid"),
        "paid_pct": _pct(pay_total.get("paid"), pay_total.get("attempts")),
        "unconfirmed_pct": _pct(pay_total.get("pending"), pay_total.get("attempts")),
        "by_month": payment_months,
        # Travels WITH the number, in the same object, so it cannot be read off
        # the JSON or the Excel export without the reason it is not a drop-off
        # rate. Every other suppressed or caveated metric on this page carries
        # its caveat in the payload; the biggest number in this block was the
        # one shipping without it.
        "status_caveat": {
            "statuses_observed": statuses_observed,
            # False => the number is "invoices without a confirmed payment".
            # True  => the provider distinguishes outcomes and it is a real
            #          drop-off; the UI may say so.
            "has_failure_status": has_failure_status,
            "unconfirmed_label": "Не подтверждено оплатой",
            "reason": (
                "У payments нет статуса неудачи: код пишет только 'pending' при выставлении "
                "счёта и 'paid' по вебхуку провайдера. Поэтому 'pending' — это остаток «всё, "
                "что не подтверждённая оплата»: отказ карты, закрытая форма, платёж прямо "
                "сейчас в процессе и не дошедший вебхук лежат в одном ведре и неразличимы. "
                "Это доля счетов без подтверждения, а не отвал пользователей."
            ),
            "unblocks_when": (
                "Когда callback провайдера начнёт писать терминальный статус "
                "(failed / canceled / expired), отказ можно будет отличить от потерянного "
                "вебхука — и это число станет отвалом."
            ),
        },
        # Stated outright, in the same block as the per-month column that already
        # contains it. The per-month `revenue` values sum to exactly this number;
        # shipping the addends while calling the sum "withheld" is not a gate, it
        # is a gate-shaped label. Sums of payments are countable facts and stay.
        # What the gate below removes is the per-user RATES (MRR/ARPU/ARPPU),
        # which is a different claim — see revenueGate.
        #
        # Summed in SQL, NOT as sum(payment_months). `rows()` returns [] both
        # when a query fails and when it genuinely matched nothing, so
        # sum(<empty>) would have rendered a confident "0 ₽" for a broken
        # query — the exact pattern this endpoint exists to remove. Reading it
        # off pay_total gives None when the query failed and 0 only when there
        # really were no paid rows.
        "total_revenue": (
            float(pay_total["revenue"]) if pay_total.get("revenue") is not None else None
        ),
    }

    # ── Revenue: gated in SQL on payer count ──────────────────────────────
    # MRR / ARPU / ARPPU on 5 payers is noise with a currency symbol, and three
    # of the old numbers were not merely noisy but uncomputable:
    #
    #   LTV   = ARPPU × avg_lifetime_months, where ARPPU = all-time revenue per
    #           payer. All-time revenue already spans the whole lifetime, so the
    #           multiplication counts it twice. Prod: ARPPU 1436 ₽ became an
    #           "LTV" of 7543 ₽ off 10 052 ₽ of total revenue.
    #   Churn = subs expiring in the last 30 days AND status <> 'active'. All 12
    #           user_subscriptions rows have status='active' — nothing ever
    #           writes another value — so the predicate cannot match and the
    #           tile reads 0.0% forever.
    #   Conv. = paid subscriptions ÷ paywall_shown events. paywall_shown spans
    #           2026-06-11..2026-08-20; paid subscriptions span
    #           2025-10-26..2026-06-09. The two populations do not overlap by a
    #           single day, so the ratio relates nothing to nothing.
    #
    # The gate is a HAVING clause: under MIN_PAYERS_FOR_REVENUE the query
    # returns zero rows and the response carries `"revenue": null`. There is no
    # number for the UI to accidentally render, and none for the Excel export
    # to pick up.
    payers = await scalar(
        "revenue_payers",
        f"SELECT count(DISTINCT p.user_id) FROM payments p"
        f" WHERE p.status = 'paid' AND {not_test('p.user_id')}",
        default=0,
    )
    revenue_rows = await rows(
        "revenue_gated",
        f"""
        WITH paid AS (
            SELECT p.* FROM payments p
            WHERE p.status = 'paid' AND {not_test('p.user_id')}
        ), gate AS (
            SELECT count(DISTINCT user_id) AS payers FROM paid
            HAVING count(DISTINCT user_id) >= {MIN_PAYERS_FOR_REVENUE}
        )
        SELECT g.payers,
               (SELECT COALESCE(SUM(amount), 0) FROM paid) AS total_revenue,
               (SELECT COALESCE(SUM(p.amount), 0) FROM paid p
                  JOIN user_profiles up ON up.user_id = p.user_id
                  JOIN user_subscriptions us ON us.user_profile_id = up.id
                 WHERE p.meta->>'action' = 'subscribe' AND p.meta->>'type' = 'monthly'
                   AND us.status = 'active' AND us.expires_at > NOW()) AS mrr_monthly,
               (SELECT COALESCE(SUM(p.amount / 12.0), 0) FROM paid p
                  JOIN user_profiles up ON up.user_id = p.user_id
                  JOIN user_subscriptions us ON us.user_profile_id = up.id
                 WHERE p.meta->>'action' = 'subscribe' AND p.meta->>'type' = 'yearly'
                   AND us.status = 'active' AND us.expires_at > NOW()) AS mrr_yearly
        FROM gate g
        """,
    )
    revenue = None
    if revenue_rows:
        r = dict(revenue_rows[0])
        total_revenue = float(r["total_revenue"] or 0)
        revenue = {
            "mrr": round(float(r["mrr_monthly"] or 0) + float(r["mrr_yearly"] or 0)),
            "total_revenue": total_revenue,
            "paying_users": r["payers"],
            "arpu": _ratio(total_revenue, total_users),
            # ARPU divides by profiles, not accounts: an account with no profile
            # has no payments row on prod and never entered the paid flow.
            "arpu_basis": PROFILE_BASIS,
            "arpu_denominator": total_users,
            "arppu": _ratio(total_revenue, r["payers"]),
        }
    revenue_gate = {
        "payers": payers,
        "required": MIN_PAYERS_FOR_REVENUE,
        "unlocked": revenue is not None,
        "removed_metrics": ["ltv", "churn_rate", "conversion_rate", "avg_lifetime_months"],
        # The gate describes ITSELF accurately. The previous copy claimed "в
        # ответе API просто нет чисел, которые можно было бы случайно показать
        # или выгрузить" while the response shipped payments.by_month[].revenue
        # (4992 + 3289 + 299 = 8580 ₽ on prod — exactly the "withheld"
        # total_revenue), revenueGate.payers = 5, and every individual payment
        # amount via /paying-users. ARPPU was one division away from three
        # numbers on the same screen. A caveat that describes a different system
        # than the one shipping is the defect this rebuild exists to remove.
        #
        # So: say what is gated, and say what is not.
        "gated_metrics": ["mrr", "arpu", "arppu"],
        "gated_reason": (
            "MRR / ARPU / ARPPU — это оценки на пользователя. На "
            f"{payers} платящих они не обобщаются: один платёж двигает ARPPU на сотни рублей, "
            "поэтому число выглядит как измерение, но им не является."
        ),
        "shown_anyway": ["payments.by_month[].revenue", "payments.total_revenue", "paying_users[].payments"],
        "shown_anyway_reason": (
            "Суммы оплаченных платежей — это факты, их можно сосчитать и на пяти платящих. "
            "Они показаны как есть и не считаются «скрытыми»."
        ),
    }

    # ── Monetization (what is left that is real) ──────────────────────────
    # 'premium_feature_used' tile is GONE — zero rows in usage_events, ever.
    paywall_shown = await scalar(
        "paywall_shown",
        f"SELECT count(*) FROM usage_events e WHERE e.feature = 'paywall_shown'"
        f" AND {not_test('e.user_profile_id', 'id')}",
    )
    # PREMIUM CARRIES PROVENANCE. An "active subscription" row is written by two
    # different things: the payment webhook, and the admin buttons /grant-credits
    # and /gift. On prod today that is 7 active subscriptions of which only 3
    # belong to users who ever completed a paid payment — the other 4 are
    # self-issued. Shipping the undifferentiated 7 under a «Монетизация» heading,
    # one tile away from «Оплаченных подписок: 3», reads as "7 people are on paid
    # plans" and overstates paid premium by 133%.
    #
    # The catalog's brand column in this same module is split three ways
    # (feed_vendor / monobrand / dictionary) so an inferred row can be dropped
    # from a partner report. The most load-bearing monetization number gets the
    # same treatment: the split is one NOT EXISTS away and the provenance is
    # already in the DB (payments.status='paid', and credit_transactions.reason
    # IN ('admin_grant','admin_gift') on the issuing side).
    _premium_sql = (
        "SELECT count(*) FROM user_subscriptions us"
        " JOIN user_profiles up ON up.id = us.user_profile_id"
        " WHERE us.status = 'active' AND us.expires_at > NOW() AND NOT up.is_test"
    )
    _has_paid = (
        " AND {neg} EXISTS (SELECT 1 FROM payments p"
        " WHERE p.user_id = up.user_id AND p.status = 'paid')"
    )
    premium_users = await scalar("premium_users", _premium_sql)
    premium_paid = await scalar("premium_paid", _premium_sql + _has_paid.format(neg=""))
    premium_granted = await scalar("premium_granted", _premium_sql + _has_paid.format(neg="NOT"))
    paid_subscriptions = await scalar(
        "paid_subscriptions",
        f"SELECT count(*) FROM payments p WHERE p.status = 'paid'"
        f" AND p.meta->>'action' = 'subscribe' AND {not_test('p.user_id')}",
    )
    # The overlap is measured, not asserted, so the reason conversion is absent
    # is visible in the payload rather than buried in a code comment.
    overlap = await rows(
        "conversion_overlap",
        f"""
        SELECT (SELECT min(e.occurred_at)::date FROM usage_events e
                 WHERE e.feature = 'paywall_shown' AND {not_test('e.user_profile_id', 'id')}) AS paywall_from,
               (SELECT max(e.occurred_at)::date FROM usage_events e
                 WHERE e.feature = 'paywall_shown' AND {not_test('e.user_profile_id', 'id')}) AS paywall_to,
               (SELECT min(p.created_at)::date FROM payments p
                 WHERE p.status = 'paid' AND p.meta->>'action' = 'subscribe'
                   AND {not_test('p.user_id')}) AS paid_from,
               (SELECT max(p.created_at)::date FROM payments p
                 WHERE p.status = 'paid' AND p.meta->>'action' = 'subscribe'
                   AND {not_test('p.user_id')}) AS paid_to
        """,
    )
    overlap = dict(overlap[0]) if overlap else {}
    _ov_from = max(filter(None, [overlap.get("paywall_from"), overlap.get("paid_from")]), default=None)
    _ov_to = min(filter(None, [overlap.get("paywall_to"), overlap.get("paid_to")]), default=None)
    overlap_days = (_ov_to - _ov_from).days + 1 if _ov_from and _ov_to and _ov_to >= _ov_from else 0

    monetization = {
        "paywall_shown": paywall_shown,
        "paid_subscriptions": paid_subscriptions,
        # premium_users stays for the total, but it is never rendered without
        # its two components beside it — see the tile in app/admin/analytics.
        "premium_users": premium_users,
        "premium_paid": premium_paid,
        "premium_granted": premium_granted,
        # Never a number: the two series do not overlap in time.
        "conversion_rate": None,
        "conversion_overlap_days": overlap_days,
        "paywall_window": [str(overlap.get("paywall_from") or ""), str(overlap.get("paywall_to") or "")],
        "paid_window": [str(overlap.get("paid_from") or ""), str(overlap.get("paid_to") or "")],
    }

    # ── Funnel ────────────────────────────────────────────────────────────
    # "Онбординг завершён" removed — see the onboarding block.
    #
    # A FUNNEL IS A NESTED POPULATION. Each stage counts users who completed
    # this step AND every step before it. The previous version listed six
    # INDEPENDENT counts side by side and drew them as bars, which produced an
    # arithmetically impossible chart on prod: «2+ образов» 22, then «AI
    # ассистент» 38 — a subset 73% larger than its superset. Measured today:
    # only 11 of those 22 repeat-savers ever used AI, and only 15 of the 38 AI
    # users ever saved a look. Five separate populations, one funnel shape.
    #
    # «AI ассистент» is GONE from the funnel entirely. It is not a step on the
    # path to payment — it is a parallel feature, and inserting it between
    # "saved two outfits" and "paid" asserted an ordering that does not exist.
    # AI adoption ships as its own metric with its own denominator, below.
    #
    # Each row carries BOTH numbers, because the difference is the interesting
    # part and hiding it is how the nested count starts looking like a bug:
    #   users — completed this stage and all prior ones (the bar).
    #   total — did this action at all, whatever path they took.
    # On prod: 47 users saved a look but only 46 of them ever added a wardrobe
    # item, and 5 users paid but only 4 had saved two outfits first. Those
    # off-path users are reported, not silently dropped or silently promoted.
    #
    # THE FUNNEL STARTS AT THE ACCOUNT, NOT AT THE PROFILE. Its base used to be
    # `user_profiles`, so its first bar («Регистрация», 295) silently began one
    # step downstream of where users actually enter the product. On prod that
    # deleted 160 accounts and, with them, the biggest single drop in the whole
    # funnel: 457 people authenticate, 297 fill in the profile. A chart that
    # promises "each stage is a subset of the one above" and then starts at
    # stage two is asserting that nobody is lost before stage two.
    #
    # Every account without a profile has zero wardrobe items, zero looks and
    # zero paid payments on prod (checked), so widening the base cannot inflate
    # any downstream stage; it only makes the first drop visible.
    funnel_rows = await rows(
        "funnel_nested",
        f"""
        WITH base AS (
            SELECT u.id AS user_id,
                   EXISTS (SELECT 1 FROM user_profiles p WHERE p.user_id = u.id) AS has_profile
            FROM users u WHERE {not_test('u.id')}
        ), f AS (
            SELECT b.user_id, b.has_profile,
                   EXISTS (SELECT 1 FROM wardrobe_user_items w WHERE w.user_id = b.user_id) AS has_item,
                   (SELECT count(*) FROM user_looks l WHERE l.user_id = b.user_id)           AS looks,
                   EXISTS (SELECT 1 FROM payments p
                            WHERE p.user_id = b.user_id AND p.status = 'paid')               AS has_paid
            FROM base b
        )
        SELECT count(*)                                                              AS n_acct,
               count(*) FILTER (WHERE has_profile)                                    AS n_reg,
               count(*) FILTER (WHERE has_profile AND has_item)                       AS n_item,
               count(*) FILTER (WHERE has_profile AND has_item AND looks >= 1)        AS n_look,
               count(*) FILTER (WHERE has_profile AND has_item AND looks >= 2)        AS n_repeat,
               count(*) FILTER (WHERE has_profile AND has_item AND looks >= 2
                                  AND has_paid)                                       AS n_paid,
               count(*) FILTER (WHERE has_profile)                                    AS t_reg,
               count(*) FILTER (WHERE has_item)                                       AS t_item,
               count(*) FILTER (WHERE looks >= 1)                                     AS t_look,
               count(*) FILTER (WHERE looks >= 2)                                     AS t_repeat,
               count(*) FILTER (WHERE has_paid)                                       AS t_paid
        FROM f
        """,
    )
    fr = dict(funnel_rows[0]) if funnel_rows else {}
    _stages = [
        ("Аккаунт создан", fr.get("n_acct"), fr.get("n_acct")),
        ("Профиль заполнен", fr.get("n_reg"), fr.get("t_reg")),
        ("Первая вещь", fr.get("n_item"), fr.get("t_item")),
        ("Первый образ", fr.get("n_look"), fr.get("t_look")),
        ("2+ образов", fr.get("n_repeat"), fr.get("t_repeat")),
        ("Оплатили", fr.get("n_paid"), fr.get("t_paid")),
    ]
    funnel = []
    _prev = None
    for stage, users, total in _stages:
        funnel.append({
            "stage": stage,
            "users": users,
            "total": total,
            # Share of the stage immediately above — the only denominator that
            # means anything in a nested funnel.
            "conv_from_prev_pct": None if _prev is None else _pct(users, _prev),
            "conv_from_start_pct": _pct(users, fr.get("n_acct")),
            # Did this action without having completed a prior stage.
            "off_path": None if (users is None or total is None) else total - users,
        })
        _prev = users

    # The invariant this whole block exists to enforce, checked rather than
    # assumed. If a future stage is composed wrong, it lands in `_errors` and
    # the UI shows the failure banner instead of shipping an impossible chart.
    for _i in range(1, len(funnel)):
        _cur, _up = funnel[_i], funnel[_i - 1]
        if _cur["users"] is not None and _up["users"] is not None and _cur["users"] > _up["users"]:
            errors.append({
                "metric": "funnel_monotonicity",
                "error": (
                    f"этап «{_cur['stage']}» ({_cur['users']}) больше предыдущего "
                    f"«{_up['stage']}» ({_up['users']}) — воронка не вложена"
                ),
            })

    # ── Inside the registration form ─────────────────────────────────────────
    # «Профиль заполнен» is the single biggest drop in the funnel above, and on
    # its own it says nothing actionable: the form has three steps and the
    # profile row is written only by the third, so an abandoned registration
    # left no trace at all. registration_step events (shipped 2026-08-21) give
    # it an interior.
    #
    # Keyed on user_anon_id, not user_profile_id: the whole point is the people
    # who never got a profile, and for them user_profile_id is NULL.
    #
    # `failed` separates "changed their mind" from "we broke it" — prod returned
    # a 500 on this submit for a height typed with a decimal, which blocked
    # registration outright while looking identical to voluntary abandonment.
    reg_step_rows = await rows(
        "registration_steps",
        """
        SELECT (metadata->>'step')::int AS step,
               count(DISTINCT user_anon_id) FILTER (WHERE action = 'view')          AS reached,
               count(DISTINCT user_anon_id) FILTER (WHERE action = 'complete')      AS completed,
               count(DISTINCT user_anon_id) FILTER (WHERE action = 'back')          AS went_back,
               count(DISTINCT user_anon_id) FILTER (WHERE action = 'submit')        AS submitted,
               count(DISTINCT user_anon_id) FILTER (WHERE action = 'submit_failed') AS failed
        FROM usage_events
        WHERE feature = 'registration_step' AND metadata->>'step' IS NOT NULL
        GROUP BY 1 ORDER BY 1
        """,
    )
    _STEP_LABELS = {1: "Пол, рост, вес", 2: "Размеры", 3: "Как узнали о нас"}
    registration_steps = {
        # No rows is not zero drop-off: it means the events did not exist yet.
        # Rendering 0% here would claim a perfect form on the strength of
        # missing instrumentation — exactly the failure this rebuild removed.
        "instrumented_since": "2026-08-21",
        "has_data": bool(reg_step_rows),
        "steps": [{
            "step": r["step"],
            "label": _STEP_LABELS.get(r["step"], f"Шаг {r['step']}"),
            "reached": r["reached"],
            "completed": r["completed"],
            "went_back": r["went_back"],
            "submitted": r["submitted"],
            "failed": r["failed"],
            "drop_pct": _pct(r["reached"] - (r["completed"] + r["submitted"]), r["reached"]),
        } for r in reg_step_rows],
    }

    # AI adoption is a feature-usage rate over all registered users, NOT a
    # funnel stage. The cross-tab with outfit-saving is reported as a plain
    # overlap so nobody has to infer an ordering from a bar length.
    ai_and_look = await scalar(
        "ai_users_who_saved_look",
        f"""
        SELECT count(DISTINCT up.user_id)
        FROM usage_events e
        JOIN user_profiles up ON up.id = e.user_profile_id
        WHERE e.feature = 'ai_requests' AND e.action = 'consume_success'
          AND NOT up.is_test
          AND EXISTS (SELECT 1 FROM user_looks l WHERE l.user_id = up.user_id)
        """,
    )

    # ── Timeline (last 30 days) ───────────────────────────────────────────
    # Three real series. The old payload shipped four keys for three values:
    # `first_outfit_generated` and `outfit_saved` were both assigned the same
    # user_looks count, so the "Создание образов" chart plotted one series
    # twice and its subtitle promised "первые образы и сохранения".
    # THE DATE SPINE IS BUILT IN SQL, not from whatever dates happened to
    # produce a row. Two bugs died here:
    #
    #   * A day with zero activity was ABSENT, not zero. On prod the last 30
    #     days produced rows on only 9 dates, so the area chart plotted nine
    #     evenly spaced points on a categorical axis and interpolated a straight
    #     line from 2026-08-01 to 2026-08-11 across ten missing days. "Nothing
    #     happened" and "we have no data" rendered identically.
    #   * ACTIVITY_PING_CUTOFF had no row, so the dashed «смена инструментации»
    #     ReferenceLine the PO mandated had no category to anchor to and
    #     silently did not draw. With every day present the cutoff is always
    #     plottable.
    #
    # WHICH SERIES THE CUTOFF APPLIES TO: `active_users` ONLY. It is the one
    # column here read out of daily_user_activity, and therefore the one whose
    # meaning changes at ACTIVITY_PING_CUTOFF. items_added / outfits_created /
    # ai_requests / registrations come from wardrobe_user_items, user_looks,
    # usage_events and user_profiles, none of which the activity ping touched;
    # drawing the break on a chart of those three and captioning it "ряды
    # слева и справа измерены по-разному" states something false about all
    # three. The marker belongs on whichever chart plots `active_users` —
    # /admin/users «Активность» — and that is where it now lives.
    #
    # generate_series LEFT JOINed to each aggregate: every day appears exactly
    # once, missing days are an explicit 0.
    timeline_rows = await rows(
        "timeline",
        f"""
        WITH spine AS (
            SELECT generate_series(CURRENT_DATE - 29, CURRENT_DATE, INTERVAL '1 day')::date AS date
        ), items AS (
            SELECT DATE(w.created_at) AS date, count(*) AS cnt FROM wardrobe_user_items w
             WHERE w.created_at >= CURRENT_DATE - 29 AND {not_test('w.user_id')} GROUP BY 1
        ), looks AS (
            SELECT DATE(l.created_at) AS date, count(*) AS cnt FROM user_looks l
             WHERE l.created_at >= CURRENT_DATE - 29 AND {not_test('l.user_id')} GROUP BY 1
        ), ai AS (
            SELECT DATE(e.occurred_at) AS date, count(*) AS cnt FROM usage_events e
             WHERE e.occurred_at >= CURRENT_DATE - 29 AND e.feature = 'ai_requests'
               AND e.action = 'consume_success' AND {not_test('e.user_profile_id', 'id')} GROUP BY 1
        ), regs AS (
            SELECT DATE(up.created_at) AS date, count(*) AS cnt FROM user_profiles up
             WHERE up.created_at >= CURRENT_DATE - 29 AND NOT up.is_test GROUP BY 1
        ), act AS (
            SELECT d.activity_date AS date, count(DISTINCT d.user_profile_id) AS cnt
              FROM daily_user_activity d
             WHERE d.activity_date >= CURRENT_DATE - 29
               AND {not_test('d.user_profile_id', 'id')} GROUP BY 1
        )
        SELECT s.date,
               COALESCE(i.cnt, 0) AS items_added,
               COALESCE(l.cnt, 0) AS outfits_created,
               COALESCE(a.cnt, 0) AS ai_requests,
               COALESCE(r.cnt, 0) AS registrations,
               COALESCE(c.cnt, 0) AS active_users
        FROM spine s
        LEFT JOIN items i ON i.date = s.date
        LEFT JOIN looks l ON l.date = s.date
        LEFT JOIN ai    a ON a.date = s.date
        LEFT JOIN regs  r ON r.date = s.date
        LEFT JOIN act   c ON c.date = s.date
        ORDER BY s.date
        """,
    )
    timeline = [{
        "date": str(r["date"]),
        "items_added": r["items_added"],
        "outfits_created": r["outfits_created"],
        "ai_requests": r["ai_requests"],
        # Both series /admin/users used to fetch from its own endpoint. One
        # query per number: /metrics is gone and that page reads these.
        "registrations": r["registrations"],
        "active_users": r["active_users"],
    } for r in timeline_rows]

    # ── Cohort retention ──────────────────────────────────────────────────
    # Two rules, both enforced below:
    #   * a cohort smaller than MIN_COHORT_SIZE renders "—", never a percentage.
    #     Every cohort on prod today is 1–6 users, so the old table showed
    #     saturated 100% cells built from a single person.
    #   * a week whose window has not finished yet returns null, not 0. The
    #     cohort that registered three days ago has not had four weeks to come
    #     back; printing 0% for it is a claim nobody measured.
    cohort_rows = await rows(
        "cohort_retention",
        """
        WITH c AS (
            SELECT up.id AS profile_id,
                   date_trunc('week', up.created_at)::date AS cohort_week,
                   DATE(up.created_at) AS reg
            FROM user_profiles up
            WHERE NOT up.is_test AND up.created_at >= NOW() - INTERVAL '12 weeks'
        )
        SELECT c.cohort_week,
               count(*) AS cohort_size,
               count(*) FILTER (WHERE EXISTS (SELECT 1 FROM daily_user_activity d
                   WHERE d.user_profile_id = c.profile_id
                     AND d.activity_date BETWEEN c.reg + 1 AND c.reg + 7))  AS week_1,
               count(*) FILTER (WHERE EXISTS (SELECT 1 FROM daily_user_activity d
                   WHERE d.user_profile_id = c.profile_id
                     AND d.activity_date BETWEEN c.reg + 8 AND c.reg + 14)) AS week_2,
               count(*) FILTER (WHERE EXISTS (SELECT 1 FROM daily_user_activity d
                   WHERE d.user_profile_id = c.profile_id
                     AND d.activity_date BETWEEN c.reg + 15 AND c.reg + 21)) AS week_3,
               count(*) FILTER (WHERE EXISTS (SELECT 1 FROM daily_user_activity d
                   WHERE d.user_profile_id = c.profile_id
                     AND d.activity_date BETWEEN c.reg + 22 AND c.reg + 28)) AS week_4,
               (c.cohort_week + 14) <= CURRENT_DATE AS week_1_elapsed,
               (c.cohort_week + 21) <= CURRENT_DATE AS week_2_elapsed,
               (c.cohort_week + 28) <= CURRENT_DATE AS week_3_elapsed,
               (c.cohort_week + 35) <= CURRENT_DATE AS week_4_elapsed
        FROM c GROUP BY c.cohort_week ORDER BY c.cohort_week
        """,
    )
    #
    # SUPPRESSING A RATE MEANS SUPPRESSING ITS NUMERATOR TOO. `week_N_pct` was
    # nulled on a small cohort while `week_N` — the raw retained count — shipped
    # anyway, and the Excel «Когорты» sheet writes them on one row next to
    # `cohort_size`. So the workbook printed `2026-06-22 | 2 | — | 1`, and 50%
    # is one cell division away, under a caption saying the dash is there
    # because «100% от одного пользователя не является фактом о продукте».
    # That is the exact defect the revenue gate was rewritten to remove: a
    # caveat that claims to withhold numbers the same response ships.
    #
    # `cohort_size` stays — it is a countable fact about how many people
    # registered that week, not an estimate derived from a sample of two.
    cohort_retention = []
    for r in cohort_rows:
        size = r["cohort_size"]
        low = size < MIN_COHORT_SIZE
        cell = {
            "week": str(r["cohort_week"]),
            "cohort_size": size,
            "low_sample": low,
            "suppressed_reason": (
                f"когорта меньше {MIN_COHORT_SIZE} человек: и доля, и число вернувшихся скрыты, "
                "потому что из них восстанавливается та же доля"
            ) if low else None,
        }
        for n in (1, 2, 3, 4):
            elapsed = r[f"week_{n}_elapsed"]
            # Both halves of the ratio, gated by the same condition.
            cell[f"week_{n}"] = None if (low or not elapsed) else r[f"week_{n}"]
            cell[f"week_{n}_pct"] = None if (low or not elapsed) else _pct(r[f"week_{n}"], size)
            cell[f"week_{n}_elapsed"] = elapsed
        cohort_retention.append(cell)

    # ── Activation ────────────────────────────────────────────────────────
    # "first_look_saved" is GONE: it read the same user_looks table as
    # "first_outfit", so the table showed one measurement on two rows.
    activation_actions = [
        ("first_item", "wardrobe_user_items"),
        ("first_outfit", "user_looks"),
    ]
    activation = []
    for label, table in activation_actions:
        agg = await rows(
            f"activation_{label}",
            f"""
            SELECT EXISTS (SELECT 1 FROM {table} t WHERE t.user_id = up.user_id) AS did,
                   count(*) AS total,
                   count(*) FILTER (WHERE EXISTS (SELECT 1 FROM daily_user_activity d
                       WHERE d.user_profile_id = up.id
                         AND d.activity_date BETWEEN DATE(up.created_at) + 1
                                                 AND DATE(up.created_at) + 7)) AS retained
            FROM user_profiles up
            WHERE NOT up.is_test AND up.created_at <= NOW() - INTERVAL '7 days'
            GROUP BY 1
            """,
        )
        buckets = {bool(r["did"]): r for r in agg}
        did = buckets.get(True, {"total": 0, "retained": 0})
        didnt = buckets.get(False, {"total": 0, "retained": 0})
        activation.append({
            "action": label,
            "did_total": did["total"],
            "did_retained": did["retained"],
            "did_retention_pct": _pct(did["retained"], did["total"]),
            "didnt_total": didnt["total"],
            "didnt_retained": didnt["retained"],
            "didnt_retention_pct": _pct(didnt["retained"], didnt["total"]),
        })

    # ── Time to value ─────────────────────────────────────────────────────
    ttv = await rows(
        "time_to_value",
        """
        SELECT
            EXTRACT(EPOCH FROM AVG(wi.first_at - up.created_at)) / 3600.0 AS avg_item,
            EXTRACT(EPOCH FROM PERCENTILE_CONT(0.5) WITHIN GROUP (
                ORDER BY wi.first_at - up.created_at)) / 3600.0           AS med_item
        FROM user_profiles up
        JOIN (SELECT user_id, MIN(created_at) AS first_at FROM wardrobe_user_items GROUP BY user_id) wi
          ON wi.user_id = up.user_id
        WHERE NOT up.is_test
        """,
    )
    ttv = dict(ttv[0]) if ttv else {}
    ttv_o = await rows(
        "time_to_value_outfit",
        """
        SELECT
            EXTRACT(EPOCH FROM AVG(ul.first_at - up.created_at)) / 3600.0 AS avg_outfit,
            EXTRACT(EPOCH FROM PERCENTILE_CONT(0.5) WITHIN GROUP (
                ORDER BY ul.first_at - up.created_at)) / 3600.0           AS med_outfit
        FROM user_profiles up
        JOIN (SELECT user_id, MIN(created_at) AS first_at FROM user_looks GROUP BY user_id) ul
          ON ul.user_id = up.user_id
        WHERE NOT up.is_test
        """,
    )
    ttv_o = dict(ttv_o[0]) if ttv_o else {}

    def _hours(v):
        return None if v is None else round(float(v), 1)

    return {
        # Non-empty => at least one query failed. The UI renders a banner; it
        # must not present the rest of the payload as a complete picture, and a
        # metric that failed is null rather than a confident 0.
        "_errors": errors,
        "meta": {
            "excludes_test_accounts": True,
            "test_accounts_excluded": test_accounts,
            # Two populations, both named. `accounts` is everyone who ever
            # authenticated (users); `profiles_with_data` is everyone who then
            # submitted the profile form (user_profiles). The gap is shipped as
            # a number so the page states it instead of hiding it in a JOIN.
            "accounts": total_accounts,
            "profiles_with_data": total_users,
            "accounts_without_profile": accounts_without_profile,
            "population_note": (
                "Аккаунт заводится при авторизации, профиль — только когда пользователь "
                "отправил форму профиля. Это разные множества: доли ниже считаются от "
                "заполнивших профиль, потому что аккаунт без профиля физически не может "
                "попасть ни в один числитель (активность, вещи и образы привязаны к профилю)."
            ),
            # Deprecated alias for `profiles_with_data`. Kept so an older client
            # does not silently render an empty tile; it is the profile count,
            # never the account count, and nothing new should read it.
            "total_users": total_users,
            # Everything derived from daily_user_activity changes meaning here.
            "activity_cutoff": ACTIVITY_PING_CUTOFF,
            "rec_instrumentation_since": REC_INSTRUMENTATION_SINCE,
        },
        "onboarding": {
            "users_with_first_item": users_with_first_item,
            "users_wardrobe_15": users_wardrobe_15,
            "users_wardrobe_25": users_wardrobe_25,
            "users_wardrobe_50": users_wardrobe_50,
        },
        "ahaMoment": {
            "users_first_outfit": users_first_outfit,
            "users_first_tryon": users_first_tryon,
            "users_clicked_recommendation": users_clicked_rec,
        },
        "recommendations": {
            # Server-side retrievals. NOT impressions, never a CTR denominator.
            "served_rows": rec.get("served_rows"),
            "served_sessions": rec.get("served_sessions"),
            "served_users": rec.get("served_users"),
            # Cards a human actually had on screen.
            "impressions": rec.get("impressions"),
            "impression_sessions": rec.get("impression_sessions"),
            "impression_users": rec.get("impression_users"),
            "clicks": rec.get("clicks"),
            "click_users": rec.get("click_users"),
            # null until the paired-session sample clears the threshold.
            "ctr": float(rec_ctr) if rec_ctr is not None else None,
            "ctr_basis": ctr_basis,
            "ctr_min_impressions": MIN_IMPRESSIONS_FOR_CTR,
            "instrumentation_since": REC_INSTRUMENTATION_SINCE,
        },
        "value": {
            "total_outfits_saved": total_outfits_saved,
            "users_saved_outfits": users_saved_outfits,
            "repeat_task_rate": repeat_task_rate,
            "outfits_per_active_user": outfits_per_user,
        },
        "engagement": {
            "users_used_ai": users_used_ai,
            "total_ai_requests": total_ai_requests,
            # AI used to sit inside `funnel` between "2+ образов" and
            # "Оплатили", implying an ordering that the data contradicts. It is
            # a rate over all registered users, with its own denominator.
            "ai_adoption_pct": _pct(users_used_ai, total_users),
            # The denominator, named. «% от зарегистрированных» read onto 295
            # profiles while 457 accounts exist was the label this endpoint
            # exists to stop shipping.
            "ai_adoption_basis": PROFILE_BASIS,
            "ai_adoption_denominator": total_users,
            # The honest cross-tab, instead of a bar length people read as
            # nesting: of the AI users, how many ever saved a look at all.
            "ai_users_who_saved_look": ai_and_look,
            "ai_users_who_saved_look_pct": _pct(ai_and_look, users_used_ai),
        },
        "retention": {
            "d1_retention": _pct(ret.get("d1"), ret.get("eligible_d1")),
            "d7_retention": _pct(ret.get("d7"), ret.get("eligible_d7")),
            "d30_retention": _pct(ret.get("d30"), ret.get("eligible_d30")),
            "d1_users": ret.get("d1"),
            "d7_users": ret.get("d7"),
            "d30_users": ret.get("d30"),
            "eligible_d1": ret.get("eligible_d1"),
            "eligible_d7": ret.get("eligible_d7"),
            "eligible_d30": ret.get("eligible_d30"),
            "measurement": {
                "cutoff": ACTIVITY_PING_CUTOFF,
                "instrumented_users": instrumented_users,
                # Coverage is over profiles: daily_user_activity keys on
                # user_profiles.id, so an account without a profile cannot
                # produce a row and is not a candidate for instrumentation.
                # Both populations ship so the reader can see which one this is.
                "denominator": total_users,
                "denominator_basis": PROFILE_BASIS,
                "accounts": total_accounts,
                "total_users": total_users,
                "coverage_pct": _pct(instrumented_users, total_users),
                "basis": "paid_actions_only_before_cutoff",
            },
        },
        "monetization": monetization,
        "paymentFunnel": payment_funnel,
        # null until MIN_PAYERS_FOR_REVENUE payers exist. Gate lives in SQL.
        "revenue": revenue,
        "revenueGate": revenue_gate,
        "funnel": funnel,
        "registration_steps": registration_steps,
        "funnelMeta": {
            # The shape contract, in the payload, so the chart cannot be
            # re-mis-composed without the description going stale visibly.
            "basis": "nested",
            "starts_at": "accounts",
            "description": (
                "Каждый этап — подмножество предыдущего: пользователь считается, "
                "только если выполнил и этот шаг, и все шаги выше. Отсчёт идёт "
                "от созданного аккаунта (авторизация), а не от заполненного "
                "профиля — иначе самый большой обрыв в продукте не виден."
            ),
            "excluded_stages": ["AI ассистент"],
            "excluded_reason": (
                "AI-ассистент не лежит на пути к оплате: это параллельная фича. "
                "Метрика переехала в блок «Вовлечённость» со своим знаменателем."
            ),
        },
        "timeline": timeline,
        "timelineMeta": {
            # The chart is a 30-day spine: a day with no rows is a real 0, not a
            # gap the line interpolates across.
            "from": timeline[0]["date"] if timeline else None,
            "to": timeline[-1]["date"] if timeline else None,
            "days": len(timeline),
            "zero_filled": True,
            # The break at meta.activity_cutoff is a property of
            # daily_user_activity, so it applies to this series and no other.
            # Named in the payload so a chart cannot inherit the marker just by
            # sharing the timeline array.
            "cutoff_applies_to": ["active_users"],
            "cutoff_not_applicable_to": [
                "items_added", "outfits_created", "ai_requests", "registrations",
            ],
        },
        "stickiness": {
            # DAU and MAU ship as separate counts always. The RATIO is null
            # while the 30-day window still contains days recorded by the old
            # instrument — dividing across that boundary produces a number that
            # measures the instrumentation change, not stickiness.
            "dau": stick.get("dau"),
            "mau": stick.get("mau"),
            "ratio": None if ratio_suppressed else _pct(stick.get("dau"), stick.get("mau")),
            "ratio_suppressed": ratio_suppressed,
            "ratio_suppressed_reason": (
                f"недостаточно однородных данных: окно MAU пересекает смену инструментации "
                f"{ACTIVITY_PING_CUTOFF}. DAU считается новым пингом активности, MAU — почти "
                f"целиком старым (только платные действия), их отношение не является метрикой "
                f"липкости. Вернётся, когда все 30 дней окна будут после {ACTIVITY_PING_CUTOFF}."
            ) if ratio_suppressed else None,
            "mau_window_start": (
                str(stick["mau_window_start"]) if stick.get("mau_window_start") is not None else None
            ),
            "avg_days_active": float(avg_days_active) if avg_days_active is not None else None,
            # Today is still running; DAU is a partial count by construction.
            "dau_is_partial": True,
            "cutoff": ACTIVITY_PING_CUTOFF,
        },
        "cohortRetention": cohort_retention,
        "cohortMinSize": MIN_COHORT_SIZE,
        "activation": activation,
        "timeToValue": {
            "avg_to_first_item_hours": _hours(ttv.get("avg_item")),
            "median_to_first_item_hours": _hours(ttv.get("med_item")),
            "avg_to_first_outfit_hours": _hours(ttv_o.get("avg_outfit")),
            "median_to_first_outfit_hours": _hours(ttv_o.get("med_outfit")),
            "users_reached_first_outfit": users_first_outfit,
            "first_outfit_activation_rate": _pct(users_first_outfit, total_users),
            "first_outfit_activation_basis": PROFILE_BASIS,
            "first_outfit_activation_denominator": total_users,
        },
    }


@router.get("/users")
async def list_users(
    search: str = Query(""),
    limit: int = Query(200, ge=1, le=5000),
    user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List profiles, WITH the population they were taken from.

    This used to be `... LIMIT 200` and a bare `{"users": [...]}`. With 297
    profiles on prod the table rendered 200 rows, titled itself «Пользователи
    (200)» and described itself as «Список всех зарегистрированных» — so the
    page carried two different user counts (a tile saying 295, a table saying
    200), neither of which was the 457 accounts that exist. The same truncated
    array fed the Excel export, which therefore shipped 200 of 297 profiles
    without saying so.

    `total` is the count the filter matches, `returned` is what came back, and
    the caller can raise `limit` (the export does) to get the rest. Both numbers
    ship on every response so a truncation cannot be silent.

    `is_test` ships per row as well. The «Метрики» sheet of that same workbook
    states «Тестовые аккаунты исключены: 2» while this query has no is_test
    predicate at all — one workbook, two population conventions. The rows are
    kept (an admin managing a test account still needs to find it) and flagged,
    so the export can label them instead of quietly mixing them in.
    """
    # limits.* is a REMAINING BALANCE, not a usage count: _use_feature() in
    # api/limits.py does `UPDATE limits SET "<feature>" = "<feature>" - :cnt`.
    # The Excel export used to write those columns under the headings «AI
    # запросов» / «Вещей в гардеробе», which is anti-correlated with the truth —
    # the heaviest users export the lowest numbers. On prod, profile 1554 has 90
    # wardrobe items and 184 successful ai_requests consumptions and its limits
    # row reads 3/3; profile 4714 has 214 wardrobe items and its
    # wardrobe_items_anlyzed reads 0. So ship the actual counts alongside the
    # balances and let each column be labelled for what it is.
    # `up.*` already carries is_test (migration 029); the UI badges off it.
    sql = """
        SELECT up.*, u.email, u.raw_user_meta_data, u.created_at as user_created_at,
               (SELECT count(*) FROM wardrobe_user_items w
                 WHERE w.user_id = up.user_id) AS wardrobe_items_count,
               (SELECT count(*) FROM usage_events e
                 WHERE e.user_profile_id = up.id
                   AND e.feature = 'ai_requests'
                   AND e.action = 'consume_success') AS ai_requests_used,
               (SELECT count(*) FROM usage_events e
                 WHERE e.user_profile_id = up.id
                   AND e.feature = 'wardrobe_items_anlyzed'
                   AND e.action = 'consume_success') AS photos_analyzed
        FROM user_profiles up JOIN users u ON u.id = up.user_id
    """
    binds = {}
    where = ""
    if search:
        # Parenthesised: without them the OR broadened any predicate added after
        # this line, which is how a filter silently stops filtering.
        where = " WHERE (u.email ILIKE :s OR u.raw_user_meta_data::text ILIKE :s)"
        binds["s"] = f"%{search}%"

    # The denominator for «показано N из M», counted under the SAME filter the
    # page shows, so the two numbers can never describe different populations.
    total = (
        await db.execute(
            text(f"SELECT count(*) FROM user_profiles up JOIN users u ON u.id = up.user_id{where}"),
            binds,
        )
    ).scalar()

    sql += where + " ORDER BY u.created_at DESC LIMIT :lim"
    result = await db.execute(text(sql), {**binds, "lim": limit})
    rows = result.mappings().all()

    users = []
    for r in rows:
        row = dict(r)
        pid = row.get("id")

        # Get subscriptions array
        subs = await db.execute(
            text("SELECT subscription_type, status, start_date, expires_at as end_date, credits_included FROM user_subscriptions WHERE user_profile_id = :pid ORDER BY start_date DESC"),
            {"pid": pid},
        )
        row["user_subscriptions"] = [dict(s) for s in subs.mappings().all()]

        # Get credits array
        creds = await db.execute(
            text("SELECT credits_balance, updated_at FROM user_credits WHERE user_profile_id = :pid"),
            {"pid": pid},
        )
        row["user_credits"] = [dict(c) for c in creds.mappings().all()]

        # Get limits array
        lims = await db.execute(
            text("SELECT wardrobe_items_anlyzed, ai_requests, ideas_viewed, outfits_saved, vton_used FROM limits WHERE user_profile_id = :pid"),
            {"pid": pid},
        )
        row["limits"] = [dict(l) for l in lims.mappings().all()]

        # Extract full_name from metadata
        meta = row.get("raw_user_meta_data") or {}
        if isinstance(meta, dict):
            row["full_name"] = meta.get("full_name") or meta.get("telegram_first_name") or ""

        users.append(row)

    return {
        "users": users,
        # `total` is profiles matching the filter; `accounts` is every row in
        # `users`, which is the population /analytics calls «Аккаунт создан».
        # A page that prints only len(users) cannot tell the reader it is
        # looking at a slice, and this table is a slice of a slice.
        "total": total,
        "returned": len(users),
        "limit": limit,
        "truncated": total is not None and len(users) < total,
        # NO account count here on purpose. /analytics already computes it with
        # the is_test exclusion applied (455); a second count(*) FROM users in
        # this endpoint would ship 457 and put two account numbers on one page —
        # the exact two-conventions defect this response is being fixed for.
        # The page reads meta.accounts from /analytics.
        "population_note": (
            "Строки таблицы — профили (user_profiles). Аккаунты без профиля "
            "(авторизовались, но не заполнили форму) сюда не попадают: у них нет строки профиля."
        ),
    }


@router.get("/paying-users")
async def paying_users(user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """List all users who ever paid — subscriptions + credit purchases.

    Excludes is_test accounts through the same not_test() helper the dashboard
    uses, so this table and the "Платящих" figure above it cannot disagree.
    On prod that is 7 rows -> 5.

    ONE DEFINITION OF "ACTIVE SUBSCRIPTION". The join used to filter on
    us.status = 'active' alone while premium_users above additionally requires
    us.expires_at > NOW() — two definitions in one response. On prod that let
    user 4afe2a86 render a green «Pro (мес) до 25.03.2026» five months after it
    lapsed, while the «Premium пользователей» tile one scroll up correctly
    excluded them.

    AND "NO SUBSCRIPTION" IS NOT "EXPIRED SUBSCRIPTION". The old payload had a
    single nullable sub_status, so the UI's two-branch ternary printed «Истекла»
    for user 50aef37a — who has zero rows in user_subscriptions and only
    buy_credits payments. That asserted a subscription lapsed for someone who
    never had one. sub_state is now computed in SQL and is one of:
      'active'  — a row exists, status='active', and it has not expired
      'expired' — a row exists but is cancelled/expired/past its expires_at
      'never'   — no user_subscriptions row at all (credits-only buyer)
    """
    result = await db.execute(text(f"""
        SELECT DISTINCT ON (u.id)
            up.id as profile_id,
            up.user_id,
            u.email,
            u.raw_user_meta_data,
            up.full_name,
            up.created_at as registered_at,
            p.amount,
            p.status as payment_status,
            p.meta as payment_meta,
            p.created_at as payment_date,
            us.subscription_type,
            us.status as sub_status,
            us.expires_at as sub_expires,
            CASE
                WHEN us.id IS NULL THEN 'never'
                WHEN us.status = 'active' AND us.expires_at > NOW() THEN 'active'
                ELSE 'expired'
            END as sub_state
        FROM payments p
        JOIN user_profiles up ON up.user_id = p.user_id
        JOIN users u ON u.id = p.user_id
        LEFT JOIN user_subscriptions us ON us.user_profile_id = up.id
        WHERE p.status = 'paid' AND {not_test('p.user_id')}
        ORDER BY u.id, p.created_at DESC
    """))
    rows = result.mappings().all()

    paying = []
    for r in rows:
        row = dict(r)
        meta = row.get("raw_user_meta_data") or {}
        if isinstance(meta, str):
            try:
                meta = json_lib.loads(meta)
            except Exception:
                meta = {}

        # Get all payments for this user
        payments_result = await db.execute(text("""
            SELECT amount, status, meta, created_at FROM payments
            WHERE user_id = :uid AND status = 'paid' ORDER BY created_at DESC
        """), {"uid": row["user_id"]})

        paying.append({
            "profile_id": row["profile_id"],
            "user_id": str(row["user_id"]),
            "email": row.get("email") or "",
            "full_name": row.get("full_name") or meta.get("full_name") or meta.get("telegram_first_name") or "",
            "telegram_username": meta.get("telegram_username") or "",
            "telegram_id": meta.get("telegram_id") or meta.get("sub") or "",
            "registered_at": str(row.get("registered_at") or ""),
            "subscription_type": row.get("subscription_type"),
            "sub_status": row.get("sub_status"),
            "sub_state": row.get("sub_state"),
            "sub_expires": str(row.get("sub_expires") or ""),
            "payments": [
                {"amount": float(p["amount"]), "action": (p["meta"] or {}).get("action", ""),
                 "type": (p["meta"] or {}).get("type", ""), "date": str(p["created_at"])}
                for p in payments_result.mappings().all()
            ],
        })

    return {"paying_users": paying, "total": len(paying)}


@router.get("/users/{user_id}/timeline")
async def user_timeline(user_id: str, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Per-user behavior timeline: activation funnel (signup -> first wardrobe upload
    -> first outfit -> paid) + every payment + subscription + active days + event
    stream. Bridges the UUID (user_id) <-> BIGINT (profile_id) split."""
    async def scalar(sql, binds=None):
        try:
            return (await db.execute(text(sql), binds or {})).scalar()
        except Exception:
            await db.rollback()
            return None

    prof = (await db.execute(text("""
        SELECT up.id AS profile_id, up.created_at AS signup_at, up.onboarding_complete,
               up.full_name, up.gender, up.dominant_style, u.email, u.raw_user_meta_data
        FROM user_profiles up JOIN users u ON u.id = up.user_id
        WHERE up.user_id = :uid
    """), {"uid": user_id})).mappings().first()
    if not prof:
        raise HTTPException(status_code=404, detail="User not found")
    pid = prof["profile_id"]

    wardrobe_count = await scalar("SELECT count(*) FROM wardrobe_user_items WHERE user_id = :uid", {"uid": user_id}) or 0
    first_item_at = await scalar("SELECT MIN(created_at) FROM wardrobe_user_items WHERE user_id = :uid", {"uid": user_id})
    # first_outfit == first saved look (same source of truth as the dashboard).
    first_outfit_at = await scalar("SELECT MIN(created_at) FROM user_looks WHERE user_id = :uid", {"uid": user_id})
    first_look_at = first_outfit_at
    # When (if ever) this user was shown the paywall — lets us see "saw paywall
    # but didn't pay" vs "paid" right on the card.
    first_paywall_at = await scalar(
        "SELECT MIN(occurred_at) FROM usage_events WHERE user_profile_id = :pid AND feature = 'paywall_shown'",
        {"pid": pid},
    )

    pay_rows = (await db.execute(text("""
        SELECT amount, status, meta, created_at FROM payments WHERE user_id = :uid ORDER BY created_at
    """), {"uid": user_id})).mappings().all()
    payments = [{
        "amount": float(p["amount"]), "status": p["status"],
        "action": (p["meta"] or {}).get("action"), "type": (p["meta"] or {}).get("type"),
        "created_at": str(p["created_at"]),
    } for p in pay_rows]
    first_paid_at = next((p["created_at"] for p in payments if p["status"] == "paid"), None)

    sub = (await db.execute(text("""
        SELECT subscription_type, status, start_date, expires_at, credits_included
        FROM user_subscriptions WHERE user_profile_id = :pid ORDER BY created_at DESC LIMIT 1
    """), {"pid": pid})).mappings().first()
    credits = await scalar("SELECT credits_balance FROM user_credits WHERE user_profile_id = :pid", {"pid": pid}) or 0

    activity = (await db.execute(text("""
        SELECT activity_date, activity_count FROM daily_user_activity
        WHERE user_profile_id = :pid ORDER BY activity_date DESC LIMIT 60
    """), {"pid": pid})).mappings().all()
    events = (await db.execute(text("""
        SELECT occurred_at, feature, action, count FROM usage_events
        WHERE user_profile_id = :pid ORDER BY occurred_at DESC LIMIT 100
    """), {"pid": pid})).mappings().all()

    meta = prof["raw_user_meta_data"] or {}
    if isinstance(meta, str):
        try:
            meta = json_lib.loads(meta)
        except Exception:
            meta = {}

    return {
        "user": {
            "user_id": user_id, "profile_id": pid, "email": prof["email"] or "",
            "full_name": prof["full_name"] or meta.get("full_name") or meta.get("telegram_first_name") or "",
            "telegram_username": meta.get("telegram_username") or "",
            "gender": prof["gender"], "dominant_style": prof["dominant_style"],
            "onboarding_complete": prof["onboarding_complete"],
        },
        "funnel": {
            "signup_at": str(prof["signup_at"]) if prof["signup_at"] else None,
            "first_item_at": str(first_item_at) if first_item_at else None,
            "wardrobe_count": wardrobe_count,
            "first_outfit_at": str(first_outfit_at) if first_outfit_at else None,
            "first_look_at": str(first_look_at) if first_look_at else None,
            "first_paywall_at": str(first_paywall_at) if first_paywall_at else None,
            "first_paid_at": first_paid_at,
        },
        "subscription": ({
            "subscription_type": sub["subscription_type"], "status": sub["status"],
            "start_date": str(sub["start_date"]) if sub["start_date"] else None,
            "expires_at": str(sub["expires_at"]) if sub["expires_at"] else None,
            "credits_included": sub["credits_included"],
        } if sub else None),
        "credits": credits,
        "payments": payments,
        "activity": [{"date": str(a["activity_date"]), "count": a["activity_count"]} for a in activity],
        "events": [{"at": str(e["occurred_at"]), "feature": e["feature"], "action": e["action"], "count": e["count"]} for e in events],
    }


# GET /metrics IS DELETED. It was a second, older implementation of four numbers
# /analytics already computes, and it disagreed with them on prod:
#
#     metric              /metrics   /analytics
#     totalUsers            297         295      no is_test exclusion
#     activeSubscriptions     9           7      no is_test exclusion
#     MAU                    11          10      `>= CURRENT_DATE - 30` = 31 days
#     DAU                     2           2
#
# Two admin pages one nav item apart showed different user counts, and
# /admin/users shipped a SECOND xlsx export built from the un-excluded set.
# It also used `(...).scalar() or default` with default=0, so a raised
# exception and a measured zero were the same value — the confident-zero
# pattern this rebuild exists to kill, alive in the same module.
#
# Rather than patch three bugs into a duplicate, /admin/users now reads the
# tiles off /analytics (`meta.accounts` + `meta.profiles_with_data`,
# `stickiness.dau/mau`, `monetization.premium_users`) and both of its charts off
# `timeline`, which is zero-filled over a 30-day spine. One query per number.


@router.post("/grant-credits")
async def grant_credits(request: Request, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    user_id = body.get("userId")
    credits = body.get("credits", 0)
    sub_duration = body.get("subscriptionDuration")

    if not user_id:
        raise HTTPException(status_code=400, detail="userId required")

    profile = await db.execute(text("SELECT id FROM user_profiles WHERE user_id = :uid"), {"uid": user_id})
    p = profile.first()
    if not p:
        raise HTTPException(status_code=404, detail="User not found")
    pid = p[0]

    if credits and credits > 0:
        await db.execute(text("UPDATE user_credits SET credits_balance = credits_balance + :amt WHERE user_profile_id = :pid"), {"amt": credits, "pid": pid})
        await db.execute(text("INSERT INTO credit_transactions (user_profile_id, transaction_type, amount, reason, description, created_at) VALUES (:pid, 'credit', :amt, 'admin_grant', :desc, NOW())"),
            {"pid": pid, "amt": credits, "desc": f"Admin granted {credits} credits"})

    if sub_duration in ("monthly", "yearly"):
        months = 1 if sub_duration == "monthly" else 12
        # UNIQUE(user_profile_id) means a plain INSERT 500s on repeat grants.
        # Stack instead of overwrite: a user with active time keeps it.
        await db.execute(text("""
            INSERT INTO user_subscriptions (user_profile_id, subscription_type, status, start_date, expires_at)
            VALUES (:pid, :stype, 'active', NOW(), NOW() + make_interval(months => :months))
            ON CONFLICT (user_profile_id) DO UPDATE
            SET subscription_type = EXCLUDED.subscription_type,
                status = 'active',
                expires_at = GREATEST(user_subscriptions.expires_at, NOW()) + make_interval(months => :months)
        """),
            {"pid": pid, "stype": sub_duration, "months": months})
        await db.execute(text("UPDATE limits SET wardrobe_items_anlyzed=999, ai_requests=999, ideas_viewed=999, outfits_saved=999, vton_used=999 WHERE user_profile_id = :pid"), {"pid": pid})

    await db.commit()
    return {"success": True}


# ── Gift template ──────────────────────────────────────────────────────
# One-shot: grants credits + subscription, sends Telegram notification,
# and flags user_profiles.pending_gift so the app shows a welcome sheet on
# next entry. Frontend calls this from the admin "🎁 Подарок" dialog.

_DEFAULT_GIFT_SHEET = {
    "title": "Вам подарок ✨",
    "body": "Мы подарили вам подписку и кредиты, чтобы вы могли попробовать всё без ограничений.",
    "bullets": [
        "Оцифровка гардероба по фото",
        "Подбор образов AI-стилистом",
        "Виртуальная примерка",
    ],
    "cta_text": "Круто, спасибо!",
}

_DEFAULT_BOT_MESSAGE = (
    "✨ <b>Вам выдана подписка!</b>\n\n"
    "Мы начислили <b>{credits}</b> кредитов и активировали подписку на <b>{duration_ru}</b>.\n\n"
    "Заходите в приложение — все лимиты сняты."
)

_DURATION_RU = {"monthly": "1 месяц", "yearly": "1 год"}


@router.post("/gift")
async def gift_user(
    request: Request,
    user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()
    target_user_id = body.get("userId")
    if not target_user_id:
        raise HTTPException(status_code=400, detail="userId required")

    credits = int(body.get("credits") or 0)
    sub_duration = body.get("subscriptionDuration")  # "monthly" | "yearly" | None

    sheet = {**_DEFAULT_GIFT_SHEET, **(body.get("welcomeSheet") or {})}
    # Replace known placeholders rather than .format() — admin-pasted text may
    # legitimately contain stray `{` / `}` (emoji, HTML, JSON) that would crash
    # str.format with ValueError/KeyError.
    _template = body.get("botMessage") or _DEFAULT_BOT_MESSAGE
    bot_message = (
        _template
        .replace("{credits}", str(credits if credits else "дополнительные"))
        .replace("{duration_ru}", _DURATION_RU.get(sub_duration, "подарочный период"))
    )

    # Resolve profile + telegram_id
    row = await db.execute(
        text("""
            SELECT up.id AS profile_id,
                   u.raw_user_meta_data->>'telegram_id' AS telegram_id
            FROM user_profiles up
            JOIN users u ON u.id = up.user_id
            WHERE up.user_id = :uid
        """),
        {"uid": target_user_id},
    )
    found = row.mappings().first()
    if not found:
        raise HTTPException(status_code=404, detail="User not found")

    pid = found["profile_id"]
    telegram_id = found["telegram_id"]

    # Grant credits
    if credits > 0:
        await db.execute(
            text("""
                INSERT INTO user_credits (user_profile_id, credits_balance)
                VALUES (:pid, :amt)
                ON CONFLICT (user_profile_id) DO UPDATE
                SET credits_balance = user_credits.credits_balance + EXCLUDED.credits_balance,
                    updated_at = NOW()
            """),
            {"pid": pid, "amt": credits},
        )
        await db.execute(
            text("""
                INSERT INTO credit_transactions
                  (user_profile_id, transaction_type, amount, reason, description, created_at)
                VALUES (:pid, 'credit', :amt, 'admin_gift', :desc, NOW())
            """),
            {"pid": pid, "amt": credits, "desc": f"Admin gift: {credits} credits"},
        )

    # Grant subscription + unlock limits
    if sub_duration in ("monthly", "yearly"):
        months = 1 if sub_duration == "monthly" else 12
        # ON CONFLICT handles users who already have a subscription row —
        # we extend from the later of (current expiry, now) so the gift stacks
        # on top of an active subscription instead of overwriting it.
        await db.execute(
            text("""
                INSERT INTO user_subscriptions
                  (user_profile_id, subscription_type, status, start_date, expires_at)
                VALUES (:pid, :stype, 'active', NOW(), NOW() + make_interval(months => :months))
                ON CONFLICT (user_profile_id) DO UPDATE
                SET subscription_type = EXCLUDED.subscription_type,
                    status = 'active',
                    start_date = NOW(),
                    expires_at = GREATEST(user_subscriptions.expires_at, NOW()) + make_interval(months => :months)
            """),
            {"pid": pid, "stype": sub_duration, "months": months},
        )
        await db.execute(
            text("""
                INSERT INTO limits (user_profile_id, wardrobe_items_anlyzed, ai_requests, ideas_viewed, outfits_saved, vton_used)
                VALUES (:pid, 999, 999, 999, 999, 999)
                ON CONFLICT (user_profile_id) DO UPDATE
                SET wardrobe_items_anlyzed = 999, ai_requests = 999,
                    ideas_viewed = 999, outfits_saved = 999, vton_used = 999,
                    updated_at = NOW()
            """),
            {"pid": pid},
        )

    # Flag pending welcome sheet
    pending = {
        "subscription_type": sub_duration,
        "credits": credits,
        "sheet": sheet,
        "granted_at": None,  # populated by NOW() below
    }
    await db.execute(
        text("""
            UPDATE user_profiles
            SET pending_gift = jsonb_set(CAST(:payload AS jsonb), '{granted_at}', to_jsonb(CAST(NOW() AS text))),
                updated_at = NOW()
            WHERE id = :pid
        """),
        {"pid": pid, "payload": json_lib.dumps(pending)},
    )

    await db.commit()

    # Send Telegram notification (best-effort — failure must not roll back grant)
    bot_result = await send_bot_message(telegram_id, bot_message)

    return {
        "success": True,
        "bot_sent": bool(bot_result.get("ok")),
        "bot_error": None if bot_result.get("ok") else bot_result.get("error") or "telegram_failed",
        "telegram_id": telegram_id,
    }


@router.post("/reset-onboarding")
async def reset_onboarding(request: Request, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    user_id = body.get("userId")
    if not user_id:
        raise HTTPException(status_code=400, detail="userId required")
    await db.execute(text("UPDATE user_profiles SET onboarding_complete = false WHERE user_id = :uid"), {"uid": user_id})
    await db.commit()
    return {"success": True}


@router.get("/reminders")
async def get_reminders(user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT * FROM reminder_configs ORDER BY created_at"))
    return {"data": [dict(r) for r in result.mappings().all()]}


@router.post("/reminders")
async def create_reminder(request: Request, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    result = await db.execute(
        text("INSERT INTO reminder_configs (message_text, cron_expression, is_active, created_at) VALUES (:msg, :cron, true, NOW()) RETURNING *"),
        {"msg": body.get("message_text", ""), "cron": body.get("cron_expression", "")})
    await db.commit()
    return {"data": dict(result.mappings().first())}


@router.patch("/reminders")
async def update_reminder(request: Request, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    reminder_id = body.get("id")
    if not reminder_id:
        raise HTTPException(status_code=400, detail="id required")
    updates = body.get("updates", {})
    allowed = ["message_text", "cron_expression", "is_active"]
    set_parts = [f"{k} = :{k}" for k in updates if k in allowed]
    if not set_parts:
        return {"success": True}
    params = {k: v for k, v in updates.items() if k in allowed}
    params["id"] = reminder_id
    await db.execute(text(f"UPDATE reminder_configs SET {', '.join(set_parts)} WHERE id = :id"), params)
    await db.commit()
    return {"success": True}


@router.delete("/reminders")
async def delete_reminder(request: Request, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    reminder_id = body.get("id")
    if not reminder_id:
        raise HTTPException(status_code=400, detail="id required")
    await db.execute(text("DELETE FROM reminder_configs WHERE id = :id"), {"id": reminder_id})
    await db.commit()
    return {"success": True}


@router.get("/broadcast")
async def list_broadcasts(user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT * FROM broadcast_messages ORDER BY created_at DESC LIMIT 50"))
    return {"data": [dict(r) for r in result.mappings().all()]}


@router.post("/broadcast")
async def send_broadcast(request: Request, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    result = await db.execute(
        text("INSERT INTO broadcast_messages (admin_user_id, message_text, created_at) VALUES (:uid, :msg, NOW()) RETURNING *"),
        {"uid": user["id"], "msg": body.get("message_text", "")})
    await db.commit()
    return {"data": dict(result.mappings().first())}


# ── Missing admin endpoints ──

@router.patch("/subscription-pricing")
async def update_subscription_pricing(request: Request, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    pricing_id = body.get("id")
    updates = body.get("updates", {})
    if not pricing_id or not updates:
        raise HTTPException(status_code=400, detail="id and updates required")
    allowed = ["price_rub", "credits", "display_name", "description", "is_active"]
    set_parts = [f'"{k}" = :{k}' for k in updates if k in allowed]
    if not set_parts:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    params = {k: v for k, v in updates.items() if k in allowed}
    params["id"] = pricing_id
    await db.execute(text(f"UPDATE subscription_pricing SET {', '.join(set_parts)}, updated_at = NOW() WHERE id = :id"), params)
    await db.commit()
    return {"success": True}


@router.patch("/credit-packs")
async def update_credit_packs(request: Request, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    pack_id = body.get("id")
    updates = body.get("updates", {})
    if not pack_id or not updates:
        raise HTTPException(status_code=400, detail="id and updates required")
    allowed = ["name", "credits", "price_rub", "is_active"]
    set_parts = [f'"{k}" = :{k}' for k in updates if k in allowed]
    if not set_parts:
        raise HTTPException(status_code=400, detail="No valid fields")
    params = {k: v for k, v in updates.items() if k in allowed}
    params["id"] = pack_id
    await db.execute(text(f"UPDATE credit_packs SET {', '.join(set_parts)} WHERE id = :id"), params)
    await db.commit()
    return {"success": True}


@router.post("/clean-recommendations")
async def clean_recommendations(user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("DELETE FROM main_recommendations WHERE look_sections IS NULL OR look_sections::text = '[]' RETURNING id"))
    count = len(result.all())
    await db.commit()
    return {"success": True, "deleted": count}


@router.post("/mark-clothing-types")
async def mark_clothing_types(user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Auto-match clothing types for untagged wardrobe items."""
    result = await db.execute(text("""
        UPDATE wardrobe_user_items wui SET clothing_type = bwi.clothing_type
        FROM basic_wardrobe_items bwi WHERE wui.basic_item_id = bwi.id
        AND (wui.clothing_type IS NULL OR wui.clothing_type = '') AND bwi.clothing_type IS NOT NULL
    """))
    await db.commit()
    return {"success": True, "updated": result.rowcount}


@router.get("/credit-packs")
async def get_credit_packs(user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT * FROM credit_packs ORDER BY price_rub"))
    return {"data": [dict(r) for r in result.mappings().all()]}


@router.get("/subscription-pricing")
async def get_subscription_pricing(user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT * FROM subscription_pricing ORDER BY price_rub"))
    return {"data": [dict(r) for r in result.mappings().all()]}


_PLAN_MONTHS = {"monthly": 1, "yearly": 12}


def feature_economics(features: list[dict], credit_price_min, credit_price_max,
                      plans: list[dict], caps: dict) -> tuple[list[dict], list[dict]]:
    """Досчитать маржу к строкам тарификации. Чистая функция — вся арифметика
    раздела «Тарификация» живёт здесь и проверяется test_pricing_economics.

    Считается на бэкенде, а не в JSX, по той же причине, по которой цена
    считается в одном месте: экран, который сам себе считает выручку, однажды
    начнёт расходиться с тем, что списывает код, и никто этого не заметит.

    Маржа даётся ВИЛКОЙ, а не одним числом. Кредит стоит человеку от 5,00 ₽
    (пак 200/999) до 15,80 ₽ (Мини 5/79) — оба пака активны одновременно, и
    разброс втрое. Одна усреднённая цифра тут была бы красивее и неправдивее:
    нижняя граница — то, что мы зарабатываем в худшем случае, и решать надо
    по ней.

    Пустая себестоимость означает «не замеряли». Тогда маржа — None, а не ноль:
    ноль выглядит как ответ.
    """
    out_features = []
    for f in features:
        cost = float(f["unit_cost_rub"]) if f.get("unit_cost_rub") is not None else None
        credits = f.get("cost_credits") or 0
        billed = bool(f.get("is_active")) and credits > 0

        row = dict(f)
        row["unit_cost_rub"] = cost
        row["included_monthly"] = caps.get(f["feature_name"])
        row["is_free"] = not billed
        row["revenue_rub_min"] = round(credits * float(credit_price_min), 2) if billed and credit_price_min else None
        row["revenue_rub_max"] = round(credits * float(credit_price_max), 2) if billed and credit_price_max else None

        for bound in ("min", "max"):
            rev = row[f"revenue_rub_{bound}"]
            row[f"margin_pct_{bound}"] = (
                round((rev - cost) / rev * 100, 1) if rev and cost is not None else None
            )
        out_features.append(row)

    unit_cost = {
        f["feature_name"]: float(f["unit_cost_rub"])
        for f in features if f.get("unit_cost_rub") is not None
    }
    # Стоимость включённого в подписку: то, что мы дарим подписчику каждый
    # месяц. Функция без лимита в caps безлимитна — её сюда не посчитать, и
    # честнее показать это отдельным списком, чем занулить.
    included_cost = round(sum(n * unit_cost.get(feat, 0) for feat, n in caps.items()), 2)
    uncapped = sorted(feat for feat in unit_cost if feat not in caps)

    out_plans = []
    for p in plans:
        months = _PLAN_MONTHS.get(p.get("plan_type"), 1)
        monthly = round(float(p["price_rub"]) / months, 2)
        out_plans.append({
            "plan_type": p.get("plan_type"),
            "display_name": p.get("display_name"),
            "price_rub": float(p["price_rub"]),
            "monthly_rub": monthly,
            "included_cost_rub": included_cost,
            "margin_pct": round((monthly - included_cost) / monthly * 100, 1) if monthly else None,
        })

    return out_features, out_plans


@router.get("/feature-costs")
async def get_feature_costs(user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    from app.api.limits import SUBSCRIBER_MONTHLY_CAPS

    features = [dict(r) for r in (
        await db.execute(text("SELECT * FROM feature_costs ORDER BY feature_name"))
    ).mappings().all()]
    packs = [dict(r) for r in (
        await db.execute(text("SELECT credits, price_rub FROM credit_packs WHERE is_active = true AND credits > 0"))
    ).mappings().all()]
    plans = [dict(r) for r in (
        await db.execute(text("SELECT * FROM subscription_pricing WHERE is_active = true ORDER BY price_rub"))
    ).mappings().all()]

    per_credit = sorted(float(p["price_rub"]) / p["credits"] for p in packs) or [0]
    enriched, plan_economics = feature_economics(
        features, per_credit[0], per_credit[-1], plans, SUBSCRIBER_MONTHLY_CAPS
    )

    return {
        "data": enriched,
        "credit_price": {"min": round(per_credit[0], 2), "max": round(per_credit[-1], 2)},
        "subscription": plan_economics,
    }


@router.patch("/feature-costs")
async def update_feature_cost(request: Request, user: dict = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    cost_id = body.get("id")
    updates = body.get("updates", {})
    if not cost_id:
        raise HTTPException(status_code=400, detail="id required")
    # unit_cost_rub редактируется отсюда же: при смене модели себестоимость
    # меняется, и требовать ради одного числа деплой — способ гарантировать,
    # что его не обновят и маржа на экране станет враньём.
    allowed = ["cost_credits", "display_name", "description", "is_active", "unit_cost_rub"]
    set_parts = [f'"{k}" = :{k}' for k in updates if k in allowed]
    if not set_parts:
        return {"success": True}
    params = {k: v for k, v in updates.items() if k in allowed}
    params["id"] = cost_id
    await db.execute(text(f"UPDATE feature_costs SET {', '.join(set_parts)}, updated_at = NOW() WHERE id = :id"), params)
    await db.commit()
    return {"success": True}


# ─────────────────────────────────────────────────────────────────────────
# OutfitTransformer — admin smoke test
# ─────────────────────────────────────────────────────────────────────────

@router.get("/outfit-scorer/search-items")
async def outfit_scorer_search_items(
    q: str = Query("", description="Substring match on item name"),
    limit: int = Query(60, ge=1, le=200),
    offset: int = Query(0, ge=0),
    clothing_types: Optional[List[str]] = Query(None, description="Filter by clothing_type list"),
    sources: Optional[List[str]] = Query(None, description="Subset of ['catalog','user']"),
    user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Picker items for the admin smoke-test UI.

    Supports:
      * name substring via q (empty → latest items)
      * clothing_type whitelist via repeated ?clothing_types=pants&clothing_types=jeans
      * sources whitelist via repeated ?sources=catalog (skip the other table)
      * LIMIT/OFFSET pagination — returned `has_more_*` flags tell the UI
        whether to show a "Показать ещё" button per source.

    Items without image_url are filtered out because a visual picker
    without thumbnails is useless.
    """
    like = f"%{q}%" if q else "%"
    want_catalog = not sources or "catalog" in sources
    want_user = not sources or "user" in sources

    # We fetch `limit + 1` rows so we know whether another page exists
    # without needing a second COUNT(*) query (which would double the cost
    # on every keystroke). If we get back limit+1 rows, trim to limit and
    # flag has_more.
    probe_limit = limit + 1

    def _type_clause(param_name: str) -> str:
        return f"AND clothing_type = ANY(:{param_name})" if clothing_types else ""

    catalog_rows: list = []
    has_more_catalog = False
    if want_catalog:
        params = {"like": like, "limit": probe_limit, "offset": offset}
        if clothing_types:
            params["ctypes"] = list(clothing_types)
        q_sql = f"""
            SELECT id, item_name AS name, image_url, clothing_type, color,
                   'catalog' AS source
            FROM wardrobe_items
            WHERE COALESCE(is_hidden, false) = false
              AND image_url IS NOT NULL
              AND item_name ILIKE :like
              {_type_clause('ctypes')}
            ORDER BY id DESC
            LIMIT :limit OFFSET :offset
        """
        rows = await db.execute(text(q_sql), params)
        catalog_rows = [dict(r) for r in rows.mappings().all()]
        if len(catalog_rows) > limit:
            has_more_catalog = True
            catalog_rows = catalog_rows[:limit]

    user_rows: list = []
    has_more_user = False
    if want_user:
        params = {"like": like, "limit": probe_limit, "offset": offset}
        if clothing_types:
            params["ctypes"] = list(clothing_types)
        q_sql = f"""
            SELECT id, item_name AS name, image_url, clothing_type, color,
                   'user' AS source
            FROM wardrobe_user_items
            WHERE COALESCE(is_hidden, false) = false
              AND image_url IS NOT NULL
              AND item_name ILIKE :like
              {_type_clause('ctypes')}
            ORDER BY id DESC
            LIMIT :limit OFFSET :offset
        """
        rows = await db.execute(text(q_sql), params)
        user_rows = [dict(r) for r in rows.mappings().all()]
        if len(user_rows) > limit:
            has_more_user = True
            user_rows = user_rows[:limit]

    # Also surface the set of clothing_types currently available in the catalog
    # so the UI can render type-filter chips without guessing. Cheap because
    # `clothing_type` is low-cardinality.
    type_rows = await db.execute(text("""
        SELECT clothing_type, COUNT(*) AS n
        FROM wardrobe_items
        WHERE COALESCE(is_hidden, false) = false
          AND image_url IS NOT NULL
          AND clothing_type IS NOT NULL
          AND clothing_type <> ''
        GROUP BY clothing_type
        ORDER BY n DESC
    """))
    type_counts = [{"clothing_type": r["clothing_type"], "n": r["n"]} for r in type_rows.mappings().all()]

    return {
        "catalog": catalog_rows,
        "user": user_rows,
        "has_more_catalog": has_more_catalog,
        "has_more_user": has_more_user,
        "offset": offset,
        "limit": limit,
        "type_counts": type_counts,
    }


@router.get("/outfit-scorer/presets")
async def outfit_scorer_presets(
    count: int = Query(5, ge=1, le=12),
    user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Return ready-made outfits for one-click scoring in the admin UI.

    Strategy:
      1. Real user-composed outfits from the `outfits` table with >= 3
         items that all have valid images.
      2. If too few real outfits exist, synthesize slot-complete ones
         (top + bottom + outerwear + optional accessory) from random
         catalog items — ensures the page is useful on a fresh DB.
    """
    outfit_rows = await db.execute(
        text("""
            SELECT o.id AS outfit_id, o.name, o.occasion, o.user_id,
                   COUNT(oi.wardrobe_item_id) AS item_count
            FROM outfits o
            JOIN outfit_items oi ON oi.outfit_id = o.id
            JOIN wardrobe_items wi ON wi.id = oi.wardrobe_item_id
            WHERE wi.image_url IS NOT NULL
              AND COALESCE(wi.is_hidden, false) = false
            GROUP BY o.id
            HAVING COUNT(oi.wardrobe_item_id) >= 3
            ORDER BY o.created_at DESC
            LIMIT :count
        """),
        {"count": count},
    )
    outfits = [dict(r) for r in outfit_rows.mappings().all()]

    presets = []
    for o in outfits:
        item_rows = await db.execute(
            text("""
                SELECT wi.id, wi.item_name AS name, wi.image_url,
                       wi.clothing_type, wi.color
                FROM outfit_items oi
                JOIN wardrobe_items wi ON wi.id = oi.wardrobe_item_id
                WHERE oi.outfit_id = :oid AND wi.image_url IS NOT NULL
                ORDER BY oi.position NULLS LAST, oi.id
                LIMIT 16
            """),
            {"oid": o["outfit_id"]},
        )
        items = [dict(r) for r in item_rows.mappings().all()]
        if len(items) < 2:
            continue
        presets.append({
            "outfit_id": o["outfit_id"],
            "title": o.get("name") or f"Образ #{o['outfit_id']}",
            "occasion": o.get("occasion"),
            "kind": "real",
            "items": items,
        })

    # Synthesize slot-complete outfits if we don't have enough real ones
    if len(presets) < 3:
        slot_groups = [
            (["t-shirt", "shirt", "blouse", "hoodie", "sweatshirt"], "верх"),
            (["jeans", "pants", "skirt"], "низ"),
            (["jacket", "coat", "suit-jacket", "cardigan", "puffer-jacket"], "верхняя одежда"),
        ]
        slot_sql = text("""
            SELECT id, item_name AS name, image_url, clothing_type, color
            FROM wardrobe_items
            WHERE image_url IS NOT NULL
              AND COALESCE(is_hidden, false) = false
              AND clothing_type = ANY(:types)
            ORDER BY RANDOM()
            LIMIT 1
        """)
        for synth_i in range(max(0, 3 - len(presets))):
            synth_items = []
            for types, _slot_name in slot_groups:
                row = await db.execute(slot_sql, {"types": types})
                picked = row.mappings().first()
                if picked:
                    synth_items.append(dict(picked))
            # dedupe by id in case of collisions across RANDOM() calls
            seen = set()
            deduped = [it for it in synth_items if not (it["id"] in seen or seen.add(it["id"]))]
            if len(deduped) >= 3:
                presets.append({
                    "outfit_id": None,
                    "title": f"Синтетический #{synth_i + 1}",
                    "occasion": "slot-complete",
                    "kind": "synthetic",
                    "items": deduped,
                })

    return {"presets": presets}


@router.post("/outfit-scorer/load")
async def outfit_scorer_load(user: dict = Depends(get_admin_user)):
    """Kick off the one-time checkpoint download + model load on the AI
    service. Safe to call multiple times; reports current state."""
    ai_url = settings.AI_SERVICE_URL
    if not ai_url:
        raise HTTPException(status_code=500, detail="AI_SERVICE_URL not configured")
    # Extended timeout: first load downloads ~1.1 GB from Google Drive.
    try:
        async with httpx.AsyncClient(timeout=1800.0) as client:
            resp = await client.post(f"{ai_url}/clip/outfit-load")
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as e:
        logger.error(f"[admin/outfit-load] AI call failed: {e}")
        raise HTTPException(status_code=502, detail=f"AI service error: {e}")


@router.post("/outfit-scorer/score")
async def outfit_scorer_score(request: Request, user: dict = Depends(get_admin_user)):
    """Score compatibility of an outfit by item IDs. Body: {item_ids: [int]}."""
    body = await request.json()
    item_ids = body.get("item_ids") or []
    if not isinstance(item_ids, list) or len(item_ids) < 2:
        raise HTTPException(status_code=400, detail="item_ids must be a list of >= 2 ids")

    ai_url = settings.AI_SERVICE_URL
    if not ai_url:
        raise HTTPException(status_code=500, detail="AI_SERVICE_URL not configured")

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{ai_url}/clip/outfit-score",
                json={"item_ids": [int(i) for i in item_ids]},
            )
            if resp.status_code >= 400:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
            return resp.json()
    except httpx.HTTPError as e:
        logger.error(f"[admin/outfit-score] AI call failed: {e}")
        raise HTTPException(status_code=502, detail=f"AI service error: {e}")


# ---------------------------------------------------------------------------
# Лукбук витрины: собранный образ -> кадр ИИ-модели в этих вещах
# ---------------------------------------------------------------------------
# Превью курируемых образов (outfits.vibe, миграция 024) изначально ставилось
# как image_url первой вещи — карточка выглядела товаром, а не луком. Здесь
# вещи образа уходят референсами в Gemini и превью заменяется на кадр модели.
#
# Бюджет ограничен жёстко: max_cost_usd проверяется ПЕРЕД каждым следующим
# кадром по фактической стоимости уже сделанных (OpenRouter /api/v1/generation),
# а не по оценке. Кадры генерируются последовательно именно поэтому —
# параллельный gather не даёт остановиться на нужном рубле.


@router.post("/outfits/lookbook")
async def generate_outfit_lookbooks(
    request: Request,
    user: dict = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    from app.api.misc import _openrouter_chat, _upload_base64_to_s3
    from app.services import lookbook

    body = await request.json() if await request.body() else {}
    vibe = (body.get("vibe") or "").strip() or None
    limit = max(1, min(int(body.get("limit") or 5), 100))
    force = bool(body.get("force"))
    max_cost = float(body.get("max_cost_usd") or 1.0)

    # Порядок чередует полы. Просто ORDER BY id тратил бы бюджет на первые по id,
    # а каталог женоцентричный — мужские образы лежат в конце и до них деньги бы
    # не доехали. row_number по полу + ORDER BY rn даёт ж/м/ж/м...
    inner = "SELECT id, gender, vibe, preview_image_url, row_number() OVER (PARTITION BY gender ORDER BY id) AS rn FROM outfits WHERE vibe IS NOT NULL"
    binds: dict = {}
    if vibe:
        inner += " AND vibe = :vibe"
        binds["vibe"] = vibe
    if not force:
        inner += f" AND (preview_image_url IS NULL OR preview_image_url NOT LIKE '%/{lookbook.S3_FOLDER}/%')"
    sql = f"SELECT id, gender, vibe, preview_image_url FROM ({inner}) t ORDER BY rn, gender LIMIT :lim"
    binds["lim"] = limit

    targets = (await db.execute(text(sql), binds)).mappings().all()

    results: list[dict] = []
    spent = 0.0
    unpriced = 0

    for row in targets:
        if spent >= max_cost:
            results.append({"outfit_id": row["id"], "status": "skipped_budget"})
            continue

        items = (await db.execute(text("""
            SELECT wi.item_name AS name, wi.color, wi.clothing_type, wi.image_url
            FROM outfit_items oi
            JOIN wardrobe_items wi ON wi.id = oi.wardrobe_item_id
            WHERE oi.outfit_id = :oid
              AND COALESCE(wi.is_hidden, false) = false
              AND COALESCE(wi.is_kids, false) = false
            ORDER BY oi.position
        """), {"oid": row["id"]})).mappings().all()
        items = [dict(i) for i in items]
        if not items:
            results.append({"outfit_id": row["id"], "status": "no_items"})
            continue

        try:
            data_uri, gen_id = await lookbook.generate(
                _openrouter_chat, row["vibe"], row["gender"], items, seed=int(row["id"]),
            )
        except Exception as e:
            logger.error(f"[admin/lookbook] outfit {row['id']}: {e}")
            results.append({"outfit_id": row["id"], "status": "error", "error": str(e)[:200]})
            continue

        cost = await lookbook.fetch_cost(settings.OPENROUTER_API_KEY, gen_id)
        if cost is None:
            # Кадр уже оплачен, даже если статистика недоступна — считаем его по
            # замеренной цене, иначе сторож бюджета «не видит» траты и не встанет.
            unpriced += 1
            spent += lookbook.FALLBACK_COST_USD
        else:
            spent += cost

        if not data_uri:
            results.append({"outfit_id": row["id"], "status": "no_image", "cost_usd": cost})
            continue

        url = await _upload_base64_to_s3(data_uri, folder=lookbook.S3_FOLDER)
        if url.startswith("data:"):
            # S3 недоступен — в preview_image_url data-uri класть нельзя, он там
            # не помещается осмысленно и попадёт в ленту как мусор.
            results.append({"outfit_id": row["id"], "status": "s3_failed", "cost_usd": cost})
            continue

        # Пол образа = пол человека на кадре. До этого gender описывал разметку
        # ВЕЩЕЙ и оставался 'unisex', когда она отсутствовала, — а фильтр ленты
        # пропускает 'unisex' обоим полам, и мужчина получал карточку с женщиной
        # на фото (жалоба с прода 2026-08-18, таких образов было 12).
        shot_gender = lookbook.model_gender(row["gender"], int(row["id"]))
        await db.execute(
            text("UPDATE outfits SET preview_image_url = :u, gender = :g WHERE id = :id"),
            {"u": url, "g": shot_gender, "id": row["id"]},
        )
        await db.commit()
        results.append({"outfit_id": row["id"], "status": "ok", "url": url,
                        "gender": shot_gender, "cost_usd": cost})

    return {
        "requested": len(targets),
        "generated": sum(1 for r in results if r["status"] == "ok"),
        "total_cost_usd": round(spent, 4),
        "unpriced_generations": unpriced,
        "budget_usd": max_cost,
        "results": results,
    }


# ─────────────────────────────────────────────────────────────────────────
# Catalog composition by brand
# ─────────────────────────────────────────────────────────────────────────

@router.get("/catalog/brands")
async def catalog_brands(
    limit: int = Query(200, ge=1, le=1000),
    user: dict = Depends(get_staff_user),
    db: AsyncSession = Depends(get_db),
):
    """Что за марки лежат в каталоге и НАСКОЛЬКО МЫ В ЭТОМ УВЕРЕНЫ.

    Колонка brand появилась в миграции 030, но без этого места её нельзя было ни
    посчитать, ни отфильтровать: значение лежало в базе и не доходило ни до
    одного экрана и ни одного запроса. «Марка есть в базе» и «мы знаем, сколько
    у нас Saint Laurent» — разные вещи, и вторую без ответа отсюда не получить.

    Провенанс отдаётся ОТДЕЛЬНЫМИ числами, а не одной суммой:

      merchant_named = feed_vendor + monobrand — марку назвал сам магазин
                       (<vendor> в фиде) либо он монобрендовый. Это можно
                       показывать партнёру.
      inferred       = dictionary — марка ВЫВЕДЕНА из названия товара
                       суффиксным матчером. На 11569 строках, где правду знает
                       фид, матчер не ошибся ни разу, но это всё равно наша
                       догадка, а не слова мерчанта. В партнёрский отчёт такие
                       строки идут только явным решением, поэтому они посчитаны
                       отдельно, а не растворены в общем итоге.

    Группировка по lower(brand) — фиды пишут «LACOSTE», «Lacoste» и «lacoste»
    для одного дома (ElytS кричит, ЦУМ нет), и три строки в отчёте вместо одной
    были бы не композицией каталога, а описанием пунктуации. Ровно под это в 030
    сделан индекс по lower(brand).

    CTR по маркам тут НЕТ намеренно. В recommendation_logs 433280 из 433778
    строк — это серверные выборки CLIP с action IS NULL, а не показы, которые
    видел человек; подтверждённых показов за всю историю 463 от 11 человек.
    Деление кликов на выборки дало бы красивую и полностью выдуманную цифру.

    ДВА ЗНАМЕНАТЕЛЯ, И ОБА НАЗВАНЫ. Полнота по каталогу отвечает на вопрос
    «сколько строк в таблице подписаны», и на неё нельзя опираться, решая, что
    увидит человек: каталог и выдача — это разные множества, и разошлись они не
    на проценты. Замер на проде 2026-08-20 (433280 выборок CLIP):

        группа строк          позиций  доля каталога   выборок   доля выдачи
        монобренд (031)          7861          31.9%    234939         54.2%
        ЦУМ + ElytS (фид)       15243          61.9%      9728          2.2%
        остаётся NULL            1539           6.2%    188613         43.5%

    То есть 61.9% каталога — это 2.2% выдачи, а 6.2% каталога, у которых марки
    не будет никогда (gate31 без фида и строки без notes), — это 43.5% всего,
    что CLIP реально достаёт. Одна цифра «марка известна у 92%» была бы не
    неточной, а неверной по существу: у того, что выдаётся, марки нет почти у
    половины. Поэтому `coverage` и `served` отдаются раздельно, каждый со своим
    явным знаменателем, и `served` честно называется выборками, а не показами.

    Из 24643 позиций каталога CLIP за всю историю доставал 5432 — это тоже
    отдано (`served.distinct_items`), чтобы «ноль выборок» у марки читалось как
    «её не выдавали», а не как «её не смотрели».
    """
    coverage = (await db.execute(text("""
        SELECT count(*)                                                   AS total,
               count(*) FILTER (WHERE brand IS NOT NULL)                  AS with_brand,
               count(*) FILTER (WHERE brand_source = 'feed_vendor')       AS feed_vendor,
               count(*) FILTER (WHERE brand_source = 'monobrand')         AS monobrand,
               count(*) FILTER (WHERE brand_source = 'dictionary')        AS dictionary,
               count(DISTINCT lower(brand))                               AS distinct_brands
        FROM wardrobe_items
    """))).mappings().first()

    # Тот же вопрос, но по ВЫДАЧЕ. action IS NULL — это серверная выборка CLIP:
    # позиция, которую движок достал из каталога. Не показ (их 463 за всю
    # историю) и не клик. Считаются строки выборок, а не позиции: доля выдачи —
    # это доля мест, а одна позиция могла быть выдана тысячу раз.
    # 64 мс на проде (EXPLAIN ANALYZE 2026-08-20): агрегат по 433к строк идёт
    # параллельным seq scan, джойн — по idx_rec_logs_item.
    served = (await db.execute(text("""
        SELECT count(*)                                                    AS total,
               count(*) FILTER (WHERE w.brand IS NOT NULL)                 AS with_brand,
               count(*) FILTER (WHERE w.brand_source = 'feed_vendor')      AS feed_vendor,
               count(*) FILTER (WHERE w.brand_source = 'monobrand')        AS monobrand,
               count(*) FILTER (WHERE w.brand_source = 'dictionary')       AS dictionary,
               count(DISTINCT lower(w.brand))                              AS distinct_brands,
               count(DISTINCT w.id)                                        AS distinct_items
        FROM recommendation_logs r
        JOIN wardrobe_items w ON w.id = r.item_id
        WHERE r.action IS NULL
    """))).mappings().first()

    rows = (await db.execute(text("""
        WITH served AS (
            SELECT item_id, count(*) AS shows
            FROM recommendation_logs
            WHERE action IS NULL
            GROUP BY item_id
        )
        SELECT min(w.brand)                                                AS brand,
               count(*)                                                    AS items,
               count(*) FILTER (WHERE COALESCE(w.is_hidden, false) = false) AS visible,
               count(*) FILTER (WHERE w.brand_source IN ('feed_vendor', 'monobrand'))
                                                                           AS merchant_named,
               count(*) FILTER (WHERE w.brand_source = 'dictionary')       AS inferred,
               -- ::bigint: sum() над bigint отдаёт numeric, и марка приезжала бы
               -- на фронт как 9728.0 вместо 9728.
               COALESCE(sum(s.shows), 0)::bigint                            AS served,
               string_agg(DISTINCT split_part(w.notes, ':', 1), ', ')      AS retailers
        FROM wardrobe_items w
        LEFT JOIN served s ON s.item_id = w.id
        WHERE w.brand IS NOT NULL
        GROUP BY lower(w.brand)
        ORDER BY count(*) DESC, min(w.brand)
        LIMIT :limit
    """), {"limit": limit})).mappings().all()

    cov = dict(coverage or {})
    total = cov.get("total") or 0
    with_brand = cov.get("with_brand") or 0

    srv = dict(served or {})
    served_total = srv.get("total") or 0
    served_with_brand = srv.get("with_brand") or 0

    return {
        "coverage": {
            **cov,
            # Строки без марки — это не ошибка отчёта, а честный ответ «не
            # знаем»: у gate31 (1250 позиций) фида нет вообще, и придумывать ему
            # дом мы не будем.
            "unknown": total - with_brand,
            "with_brand_pct": _pct(with_brand, total),
            "merchant_named": (cov.get("feed_vendor") or 0) + (cov.get("monobrand") or 0),
            "denominator": "позиции каталога (wardrobe_items)",
        },
        # Второй знаменатель, а не второй способ посчитать первый. Здесь полнота
        # проваливается до ~56%, потому что 43.5% выборок приходятся на строки,
        # у которых марки нет и не будет.
        "served": {
            **srv,
            "unknown": served_total - served_with_brand,
            "with_brand_pct": _pct(served_with_brand, served_total),
            "merchant_named": (srv.get("feed_vendor") or 0) + (srv.get("monobrand") or 0),
            "catalog_items": total,
            "denominator": "выборки CLIP (recommendation_logs.action IS NULL)",
        },
        # У каждой марки теперь два числа: сколько её лежит и сколько её
        # выдавали. Расходятся они на порядки, и решать по первому нельзя.
        "brands": [
            {**dict(r), "served_pct": _pct(r["served"], served_total)}
            for r in rows
        ],
        "limit": limit,
    }


# ── /api/admin/audit-log ─────────────────────────────────────────────────────

@router.get("/audit-log")
async def audit_log(
    limit: int = Query(100, ge=1, le=500),
    actor: str = Query(None, description="фильтр по email"),
    only_denied: bool = Query(False, description="только отказы — 4xx/5xx"),
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Who did what under /api/admin/*.

    Admin only, deliberately: the point of the log is that the super admin can
    see what the analyst has been doing, which stops being true the moment the
    analyst can read — or filter — it herself.

    Denied attempts are included and are the interesting half. A 403 on
    grant-credits is the only visible sign of someone probing the boundary.
    """
    where, binds = ["TRUE"], {"lim": limit}
    if actor:
        where.append("a.actor_email ILIKE :actor")
        binds["actor"] = f"%{actor}%"
    if only_denied:
        where.append("a.status_code >= 400")

    rows = (await db.execute(
        text(f"""
            SELECT a.occurred_at, a.actor_email, a.actor_role, a.method,
                   a.path, a.status_code, a.body, a.ip
            FROM admin_audit_log a
            WHERE {' AND '.join(where)}
            ORDER BY a.occurred_at DESC
            LIMIT :lim
        """),
        binds,
    )).mappings().all()

    return {
        "entries": [{
            "occurred_at": r["occurred_at"].isoformat() if r["occurred_at"] else None,
            "actor": r["actor_email"] or "(неизвестен)",
            "role": r["actor_role"] or "user",
            "method": r["method"],
            "path": r["path"],
            "status": r["status_code"],
            "denied": (r["status_code"] or 0) >= 400,
            "body": r["body"],
            "ip": r["ip"],
        } for r in rows],
        # Absence of rows is not absence of activity: the log starts when the
        # middleware ships, and says so rather than implying a clean history.
        "recording_since": "2026-08-22",
        "limit": limit,
    }


# ── /api/admin/brand-leads ───────────────────────────────────────────────────
#
# The pipeline the analyst used to keep in «Бренды_mode morph.xlsx». Open to the
# analyst as well as the admin: this block is hers, and every write lands in
# admin_audit_log via the middleware, so the super admin sees what she changed
# without her needing anyone's permission to change it.
#
# The reason this is worth moving off a spreadsheet is the `stats` field below.
# «Показатели» was a column she filled in by hand; for any brand we already carry
# it is a query over data we already have.

_LEAD_FIELDS = [
    "name", "segment", "styles", "contact", "phone", "contact_person",
    "status", "last_touch_at", "offer_type", "notes",
    "test_start", "test_end", "test_status", "test_notes", "catalog_brand",
]


@router.get("/brand-leads")
async def list_brand_leads(
    user: dict = Depends(get_staff_user),
    db: AsyncSession = Depends(get_db),
):
    """Every lead, with live catalogue numbers for the ones we already carry.

    served — how many times our recommender pulled the brand's items. Reported
    as-is and never divided by anything: 421930 of the recommendation_logs rows
    are server-side retrievals, not impressions a person saw, so a CTR built on
    them would be wrong by roughly a factor of a thousand. Confirmed impressions
    and clicks exist (422 and 18 in the product's whole history) and are counted
    separately, which is also why no rate is offered here — three clicks do not
    make a percentage.
    """
    rows = (await db.execute(text("""
        SELECT l.*,
               s.items, s.distinct_products, s.served, s.impressions, s.clicks
        FROM brand_leads l
        LEFT JOIN LATERAL (
            SELECT count(*)                          AS items,
                   count(DISTINCT w.notes)           AS distinct_products,
                   (SELECT count(*) FROM recommendation_logs r
                     WHERE r.item_id = ANY(array_agg(w.id)) AND r.action IS NULL)      AS served,
                   (SELECT count(*) FROM recommendation_logs r
                     WHERE r.item_id = ANY(array_agg(w.id)) AND r.action = 'impression') AS impressions,
                   (SELECT count(*) FROM recommendation_logs r
                     WHERE r.item_id = ANY(array_agg(w.id)) AND r.action = 'click')      AS clicks
            FROM wardrobe_items w
            WHERE l.catalog_brand IS NOT NULL AND lower(w.brand) = lower(l.catalog_brand)
        ) s ON TRUE
        ORDER BY l.last_touch_at DESC NULLS LAST, lower(l.name)
    """))).mappings().all()

    return {"leads": [{
        **{f: (r[f].isoformat() if hasattr(r[f], "isoformat") else r[f]) for f in _LEAD_FIELDS},
        "id": r["id"],
        "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
        # Absent, not zero: a brand we do not carry has no numbers, which is a
        # different statement from "we carry it and nobody looked".
        "stats": None if not r["catalog_brand"] or not r["items"] else {
            "items": r["items"],
            "distinct_products": r["distinct_products"],
            "served": r["served"],
            "impressions": r["impressions"],
            "clicks": r["clicks"],
        },
    } for r in rows]}


@router.post("/brand-leads")
async def create_brand_lead(
    request: Request,
    user: dict = Depends(get_staff_user),
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Название бренда обязательно")

    data = {f: (body.get(f) or None) for f in _LEAD_FIELDS}
    data["name"] = name
    data["status"] = body.get("status") or "Не начинали"
    cols = ", ".join(_LEAD_FIELDS)
    vals = ", ".join(f":{f}" for f in _LEAD_FIELDS)
    try:
        row = (await db.execute(
            text(f"INSERT INTO brand_leads ({cols}, updated_by) "
                 f"VALUES ({vals}, CAST(:actor AS uuid)) RETURNING id"),
            {**data, "actor": user["id"]},
        )).first()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail=f"Бренд «{name}» уже есть в списке")
    await db.commit()
    return {"id": row[0]}


@router.patch("/brand-leads/{lead_id}")
async def update_brand_lead(
    lead_id: int,
    request: Request,
    user: dict = Depends(get_staff_user),
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()
    updates = {f: body[f] or None for f in _LEAD_FIELDS if f in body}
    if not updates:
        raise HTTPException(status_code=400, detail="Нечего обновлять")

    sets = ", ".join(f'"{f}" = :{f}' for f in updates)
    result = await db.execute(
        text(f"UPDATE brand_leads SET {sets}, updated_at = NOW(), "
             f"updated_by = CAST(:actor AS uuid) WHERE id = :id RETURNING id"),
        {**updates, "id": lead_id, "actor": user["id"]},
    )
    if not result.first():
        raise HTTPException(status_code=404, detail="Бренд не найден")
    await db.commit()
    return {"success": True}


@router.delete("/brand-leads/{lead_id}")
async def delete_brand_lead(
    lead_id: int,
    user: dict = Depends(get_staff_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("DELETE FROM brand_leads WHERE id = :id RETURNING id"), {"id": lead_id})
    if not result.first():
        raise HTTPException(status_code=404, detail="Бренд не найден")
    await db.commit()
    return {"success": True}
