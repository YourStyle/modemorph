"""User-facing errors → hourly digest to the admins' Telegram.

Collection (table error_events, migration 049):
  record_error()          — backend 5xx / unhandled exceptions (middleware in main.py)
  POST /api/client-errors — browser side (lib/error-report.ts), no auth required:
                            the most important client error is "the session is gone".
Digest: POST /api/cron/error-digest, hourly. Groups what is not yet digested,
asks Gemini for a likely cause + fix per group, sends to every admin with a
telegram_id, marks the rows. A quiet hour sends nothing.
"""

import json
import logging
import re
import traceback
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session, get_db
from app.core.security import decode_token

logger = logging.getLogger(__name__)
router = APIRouter()

MSK = timezone(timedelta(hours=3))
DIGEST_GROUPS = 10          # the rest is summed into one line
RETENTION_DAYS = 30


def _user_id(request: Request) -> str | None:
    auth = request.headers.get("Authorization") or ""
    if not auth.startswith("Bearer "):
        return None
    payload = decode_token(auth[7:]) or {}
    return payload.get("sub")


async def record_error(request: Request, source: str, location: str, message: str,
                       detail: str | None = None, status: int | None = None) -> None:
    """Own session, never raises: error bookkeeping must not become the error."""
    try:
        async with async_session() as db:
            await db.execute(text("""
                INSERT INTO error_events (source, location, message, detail, status, user_id, user_agent)
                VALUES (:s, :l, :m, :d, :st, CAST(:u AS uuid), :ua)
            """), {"s": source, "l": location[:300], "m": message[:500], "d": (detail or "")[:4000] or None,
                   "st": status, "u": _user_id(request), "ua": (request.headers.get("user-agent") or "")[:300]})
            await db.commit()
    except Exception:
        logger.exception("record_error failed")


def exception_detail(exc: BaseException) -> str:
    """Last frames only — the digest needs "where", not the whole ASGI stack."""
    return "".join(traceback.format_exception(type(exc), exc, exc.__traceback__)[-6:])


@router.post("/client-errors")
async def client_errors(request: Request):
    try:
        body = await request.json()
    except Exception:
        return {"ok": False}
    items = body if isinstance(body, list) else [body]
    for e in items[:10]:
        if not isinstance(e, dict) or not e.get("message"):
            continue
        await record_error(request, "client", str(e.get("location") or "?"), str(e["message"]),
                           detail=str(e.get("detail") or "") or None,
                           status=e.get("status") if isinstance(e.get("status"), int) else None)
    return {"ok": True}


# ── digest ───────────────────────────────────────────────────────────────

_ID_SEGMENT = re.compile(r"/(\d+|[0-9a-f]{8}-[0-9a-f-]{27,}|[0-9a-f]{24,})(?=/|$|\?)", re.I)


def _norm_location(loc: str) -> str:
    """'GET /api/looks/123?x=1' and '.../456' are the same place."""
    return _ID_SEGMENT.sub("/:id", loc.split("?", 1)[0])


def _norm_message(msg: str) -> str:
    return re.sub(r"\d+", "N", msg)[:160]


def group_errors(rows: list[dict]) -> list[dict]:
    """Pure — see test_error_digest.py. Rows: source, location, message, detail,
    status, user_id, occurred_at. Returns groups, most frequent first."""
    groups: dict[tuple, dict] = {}
    for r in rows:
        key = (r["source"], _norm_location(r["location"]), _norm_message(r["message"]))
        g = groups.get(key)
        if not g:
            g = groups[key] = {"source": key[0], "location": key[1], "message": r["message"],
                               "detail": r.get("detail"), "status": r.get("status"),
                               "count": 0, "users": set(), "first": r["occurred_at"], "last": r["occurred_at"]}
        g["count"] += 1
        if r.get("user_id"):
            g["users"].add(str(r["user_id"]))
        g["first"] = min(g["first"], r["occurred_at"])
        g["last"] = max(g["last"], r["occurred_at"])
    return sorted(groups.values(), key=lambda g: (-len(g["users"]), -g["count"]))


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def format_digest(groups: list[dict], tips: dict[int, str]) -> str:
    """Telegram HTML, kept under the 4096-char message limit."""
    total = sum(g["count"] for g in groups)
    users = len(set().union(*(g["users"] for g in groups))) if groups else 0
    first = min(g["first"] for g in groups).astimezone(MSK).strftime("%H:%M")
    last = max(g["last"] for g in groups).astimezone(MSK).strftime("%H:%M")
    out = [f"⚠️ <b>Ошибки {first}–{last} МСК</b>: {total} шт., пользователей: {users}\n"]
    for i, g in enumerate(groups[:DIGEST_GROUPS]):
        who = f", {len(g['users'])} польз." if g["users"] else ""
        src = "браузер" if g["source"] == "client" else "сервер"
        block = (f"\n<b>{i + 1}. {_esc(g['message'][:200])}</b>\n"
                 f"📍 {_esc(g['location'])} ({src}) — {g['count']}×{who}\n")
        if tips.get(i):
            block += f"💡 {_esc(tips[i][:400])}\n"
        out.append(block)
    rest = groups[DIGEST_GROUPS:]
    if rest:
        out.append(f"\n…и ещё {len(rest)} видов ошибок, {sum(g['count'] for g in rest)} шт.")
    msg = "".join(out)
    return msg if len(msg) <= 4000 else msg[:3990] + "…"


async def _ai_tips(groups: list[dict]) -> dict[int, str]:
    """One cheap Gemini call for all groups. Failure → a digest without tips."""
    from app.api.misc import _openrouter_chat

    brief = [{"i": i, "where": g["location"], "source": g["source"], "status": g["status"],
              "message": g["message"][:300], "trace": (g["detail"] or "")[-800:], "count": g["count"]}
             for i, g in enumerate(groups[:DIGEST_GROUPS])]
    prompt = (
        "Ты дежурный инженер веб-приложения ModeMorph: Next.js 15 фронтенд (Telegram Mini App и веб), "
        "FastAPI + PostgreSQL бэкенд, авторизация Bearer-токеном (access 60 мин, refresh 30 дней), "
        "генерация картинок через OpenRouter (Gemini), поиск через CLIP-сервис.\n"
        "Для каждой ошибки дай вероятную причину и что проверить или исправить — одно-два коротких "
        "предложения по-русски, конкретно, без воды. Не уверен — так и скажи.\n"
        'Ответ строго JSON: [{"i": 0, "tip": "..."}]\n\n'
        + json.dumps(brief, ensure_ascii=False, default=str)
    )
    try:
        resp = await _openrouter_chat([{"role": "user", "content": prompt}], max_tokens=1500, temperature=0.2)
        content = resp["choices"][0]["message"]["content"]
        parsed = json.loads(content[content.find("["): content.rfind("]") + 1])
        return {int(t["i"]): str(t["tip"]) for t in parsed if "i" in t and t.get("tip")}
    except Exception:
        logger.exception("error digest: AI tips failed")
        return {}


async def run_error_digest(db: AsyncSession) -> dict:
    from app.services.telegram import send_bot_message

    rows = (await db.execute(text("""
        SELECT id, source, location, message, detail, status, user_id, occurred_at
        FROM error_events WHERE NOT digested ORDER BY id LIMIT 5000
    """))).mappings().all()
    await db.execute(text("DELETE FROM error_events WHERE occurred_at < NOW() - make_interval(days => :d)"),
                     {"d": RETENTION_DAYS})
    await db.commit()
    if not rows:
        return {"errors": 0, "sent": 0}

    groups = group_errors([dict(r) for r in rows])
    message = format_digest(groups, await _ai_tips(groups))
    admins = (await db.execute(text("""
        SELECT DISTINCT u.raw_user_meta_data->>'telegram_id' AS tg
        FROM user_profiles up JOIN users u ON u.id = up.user_id
        WHERE up.role = 'admin' AND COALESCE(u.raw_user_meta_data->>'telegram_id', '') <> ''
    """))).scalars().all()
    sent = 0
    for tg in admins:
        if (await send_bot_message(tg, message)).get("ok"):
            sent += 1
    # Nobody got it (bot/proxy down) → keep the rows, next hour retries them.
    if sent:
        await db.execute(text("UPDATE error_events SET digested = true WHERE NOT digested AND id <= :m"),
                         {"m": rows[-1]["id"]})
        await db.commit()
    return {"errors": len(rows), "groups": len(groups), "admins": len(admins), "sent": sent}
