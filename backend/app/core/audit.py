"""Audit trail for staff mutations under /api/admin/*.

Before this, the endpoints that mint credits, gift subscriptions, broadcast to
every user and change prices left no trace whatsoever — there was no way to
answer "who granted those credits" even in principle.

Implemented as middleware rather than a decorator on each handler on purpose: a
per-endpoint decorator is opt-in, and the endpoint someone forgets to decorate is
exactly the one worth auditing. Middleware cannot be forgotten, and a new admin
route is covered the moment it is added.

Denied attempts are recorded too. A 403 from an analyst reaching for the credit
grant is precisely what a super admin wants to see, and it is the only signal
that would show someone probing the boundary.
"""

import json
import logging

from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.database import async_session
from app.core.security import decode_token

logger = logging.getLogger(__name__)

_AUDITED_PREFIX = "/api/admin"
_SKIP_METHODS = {"GET", "HEAD", "OPTIONS"}

# Never store these, whatever endpoint they arrive at. The audit log answers
# "who did what", not "what was the secret".
_REDACT = {
    "password", "encrypted_password", "token", "secret", "api_key", "apikey",
    "access_token", "refresh_token", "code", "pass1", "pass2", "cron_secret",
}

# A broadcast body carries the full message text for every user; a feed upload
# carries the whole XML. Neither belongs in an audit row.
_MAX_BODY_CHARS = 4000


def _redact(value):
    if isinstance(value, dict):
        return {k: ("***" if k.lower() in _REDACT else _redact(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact(v) for v in value[:50]]
    if isinstance(value, str) and len(value) > 500:
        return value[:500] + f"… (+{len(value) - 500} символов)"
    return value


class AdminAuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path
        if request.method in _SKIP_METHODS or not path.startswith(_AUDITED_PREFIX):
            return await call_next(request)

        # Read the body before the handler consumes it, then put it back —
        # a Starlette request body is a one-shot stream.
        raw = await request.body()

        async def _replay():
            return {"type": "http.request", "body": raw, "more_body": False}

        request._receive = _replay

        response = await call_next(request)

        try:
            await _write(request, response.status_code, raw)
        except Exception as e:
            # Auditing must never take down the action it is watching. A lost
            # audit row is bad; a 500 on grant-credits because the log table is
            # missing is worse.
            logger.warning("audit write failed for %s %s: %s", request.method, path, e)
        return response


async def _write(request, status_code: int, raw: bytes) -> None:
    actor_id = None
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        payload = decode_token(header.split(" ", 1)[1])
        if payload:
            actor_id = payload.get("sub")

    body = None
    if raw:
        try:
            body = _redact(json.loads(raw))
        except Exception:
            body = {"_raw": raw[:200].decode("utf-8", "replace")}
        dumped = json.dumps(body, ensure_ascii=False)
        if len(dumped) > _MAX_BODY_CHARS:
            body = {"_truncated": dumped[:_MAX_BODY_CHARS]}

    # Own session: the request's own transaction may be rolling back — a denied
    # or failed call is exactly the one worth keeping.
    async with async_session() as db:
        await db.execute(
            text("""
                INSERT INTO admin_audit_log
                    (actor_user_id, actor_email, actor_role, method, path, status_code, body, ip)
                SELECT CAST(:uid AS uuid), u.email, COALESCE(p.role, 'user'),
                       :method, :path, :status, CAST(:body AS jsonb), :ip
                FROM (SELECT 1) _
                LEFT JOIN users u ON u.id = CAST(:uid AS uuid)
                LEFT JOIN user_profiles p ON p.user_id = u.id
            """),
            {
                "uid": actor_id,
                "method": request.method,
                "path": request.url.path,
                "status": status_code,
                "body": json.dumps(body, ensure_ascii=False) if body is not None else None,
                "ip": (request.client.host if request.client else None),
            },
        )
        await db.commit()
