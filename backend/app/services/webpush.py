"""Web Push (VAPID) — the second notification channel next to the Telegram bot.

Recipients are rows of push_subscriptions (migration 048), written by the
browser/PWA through POST /api/me/push-subscription. The VAPID key pair lives
in push_vapid and is generated on first use — nothing to put in .env.

pywebpush is sync (requests), so each send runs in a thread. requests picks up
HTTPS_PROXY from the env on its own — same route out as the bot.
"""

import asyncio
import base64
import json
import logging
import re

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

VAPID_SUBJECT = "mailto:admin@modemorph.site"
_vapid: tuple[str, str] | None = None  # (public, private), cached per process


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def generate_vapid() -> tuple[str, str]:
    """Raw urlsafe-base64: public = 65-byte uncompressed point (the browser's
    applicationServerKey), private = 32-byte scalar (py_vapid.from_string)."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    key = ec.generate_private_key(ec.SECP256R1())
    pub = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return _b64(pub), _b64(key.private_numbers().private_value.to_bytes(32, "big"))


async def get_vapid(db: AsyncSession) -> tuple[str, str]:
    global _vapid
    if _vapid:
        return _vapid
    q = text("SELECT public_key, private_key FROM push_vapid WHERE id = 1")
    row = (await db.execute(q)).first()
    if not row:
        pub, priv = generate_vapid()
        # ON CONFLICT: two workers racing on first use keep the same winner.
        await db.execute(text("""
            INSERT INTO push_vapid (id, public_key, private_key) VALUES (1, :p, :k)
            ON CONFLICT (id) DO NOTHING
        """), {"p": pub, "k": priv})
        await db.commit()
        row = (await db.execute(q)).first()
    _vapid = (row[0], row[1])
    return _vapid


def _send_one(sub: dict, payload: str, private_key: str) -> int:
    """Returns the HTTP status (201 ok, 404/410 gone, 0 on a network error)."""
    from pywebpush import WebPushException, webpush

    try:
        resp = webpush(
            subscription_info={"endpoint": sub["endpoint"], "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}},
            data=payload,
            vapid_private_key=private_key,
            vapid_claims={"sub": VAPID_SUBJECT},
            ttl=24 * 3600,
            timeout=10,
        )
        return resp.status_code
    except WebPushException as exc:
        return exc.response.status_code if exc.response is not None else 0
    except Exception:
        logger.exception("webpush send error")
        return 0


async def send_web_push(db: AsyncSession, profile_id, title: str, body: str, url: str) -> bool:
    """Push to every device of one profile. True if at least one accepted it.

    Dead subscriptions (404/410) are deleted here; the caller commits.
    """
    subs = (await db.execute(
        text("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_profile_id = :pid"),
        {"pid": profile_id},
    )).mappings().all()
    if not subs:
        return False
    _, private_key = await get_vapid(db)
    payload = json.dumps({"title": title, "body": body, "url": url}, ensure_ascii=False)
    ok = False
    for sub in subs:
        status = await asyncio.to_thread(_send_one, dict(sub), payload, private_key)
        if 200 <= status < 300:
            ok = True
        elif status in (404, 410):
            await db.execute(text("DELETE FROM push_subscriptions WHERE id = :id"), {"id": sub["id"]})
        else:
            logger.warning("webpush %s for profile %s", status, profile_id)
    return ok


def split_title(message: str) -> tuple[str, str]:
    """Bot messages are 'Headline\\n\\nbody' in HTML; a notification wants both apart, plain."""
    plain = re.sub(r"<[^>]+>", "", message).strip()
    head, _, rest = plain.partition("\n")
    return (head.strip() or "ModeMorph"), rest.strip()
