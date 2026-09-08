"""Guards the auto-push scheduler's decision (cron.py::_auto_push_pick).

Run it:  python3 -m app.api.test_auto_push     (from backend/)

ponytail: plain asserts, no pytest — pytest is not installed and CI runs no tests.
"""
from datetime import datetime, timedelta, timezone

from app.api.cron import _auto_push_pick, AUTO_PUSH_MAX_DAYS

NOW = datetime(2026, 9, 8, 7, 0, tzinfo=timezone.utc)
D = timedelta(days=1)


def prof(**kw):
    base = {"pid": 1, "created_at": NOW - 60 * D, "last_act": NOW - 20 * D,
            "n_items": 10, "n_looks": 2, "sub_expires": None, "paywall_at": None}
    return {**base, **kw}


def push(template, days_ago, reacted):
    return {"template": template, "sent_at": NOW - days_ago * D, "reacted": reacted}


# Never pushed, inactive 20 days -> the reactivation message.
assert _auto_push_pick(prof(), [], NOW) == "inactive"
# Active yesterday -> nothing.
assert _auto_push_pick(prof(last_act=NOW - 1 * D), [], NOW) is None

# Backoff: one unreacted push 10 days ago -> pause is 14 days -> not yet.
assert _auto_push_pick(prof(), [push("inactive", 10, False)], NOW) is None
# Same push but reacted -> pause is 7 days -> "inactive" was sent < 30 days ago,
# so nothing else applies and nothing is sent (no same-template spam).
assert _auto_push_pick(prof(), [push("inactive", 10, True)], NOW) is None
# Three unreacted in a row -> 56-day pause (capped), 40 days is not enough.
hist = [push("inactive", 100, False), push("no_outfit", 70, False), push("inactive", 40, False)]
assert AUTO_PUSH_MAX_DAYS == 56 and _auto_push_pick(prof(n_looks=0), hist, NOW) is None
# ...but the streak resets after a reaction: pause 7 days, 8 days passed.
hist = [push("inactive", 100, False), push("inactive", 40, False), push("no_outfit", 8, True)]
assert _auto_push_pick(prof(), hist, NOW) == "inactive"

# Event templates cut in after 3 quiet days even inside a long pause.
hist = [push("inactive", 5, False)]
assert _auto_push_pick(prof(sub_expires=NOW + 2 * D), hist, NOW) == "sub_expiring"
assert _auto_push_pick(prof(paywall_at=NOW - 1 * D), hist, NOW) == "paywall"
# Paywall message is pointless for someone with an active subscription.
assert _auto_push_pick(prof(paywall_at=NOW - 1 * D, sub_expires=NOW + 20 * D), [], NOW) == "inactive"
# 2 days after the last push is too soon even for events.
assert _auto_push_pick(prof(sub_expires=NOW + 2 * D), [push("inactive", 2, False)], NOW) is None

# Lifecycle: empty wardrobe 2+ days after signup; items but no looks.
assert _auto_push_pick(prof(n_items=0, created_at=NOW - 3 * D, last_act=NOW - 3 * D), [], NOW) == "empty_wardrobe"
assert _auto_push_pick(prof(n_items=0, created_at=NOW - 1 * D, last_act=NOW - 1 * D), [], NOW) is None
assert _auto_push_pick(prof(n_looks=0, last_act=NOW - 4 * D), [], NOW) == "no_outfit"
# Same template within 30 days is skipped, the next applicable one is used.
assert _auto_push_pick(prof(n_looks=0), [push("no_outfit", 8, True)], NOW) == "inactive"

print("test_auto_push: OK")
