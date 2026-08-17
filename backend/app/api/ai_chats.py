"""
AI stylist chat history — server-side storage.

Previously the AI assistant's chat history lived only in the browser's
localStorage (key "ai_assistant_history" in app/app/ai-assistant/page.tsx),
so it was lost on device change or cache clear. This module persists it
server-side instead. It does NOT talk to any AI model — that stays in ai.py
(n8n-proxied generation). This is pure CRUD over ai_chats / ai_chat_messages
(migration 023_ai_chats.sql).

Security: every route that takes a chat_id scopes its query with
"AND user_id = :uid" (or a prior ownership SELECT) so a user can never read,
write to, or delete another user's chat. A chat that exists but isn't the
caller's returns 404, same as a chat that doesn't exist at all — this avoids
leaking which chat_ids exist to someone probing at random.
"""

import json as json_lib
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user

router = APIRouter()

# ── Sane limits (task requirement: title length, content size, chats/user) ──
TITLE_MAX_LEN = 200
CONTENT_MAX_BYTES = 20_000        # per message; matches the DB CHECK in the migration
MAX_CHATS_PER_USER = 200
MAX_IMPORT_MESSAGES = 200         # hard cap from the contract


def _content_byte_size(content: Any) -> int:
    return len(json_lib.dumps(content, ensure_ascii=False).encode("utf-8"))


def _check_content_size(content: Any) -> None:
    if _content_byte_size(content) > CONTENT_MAX_BYTES:
        raise HTTPException(status_code=400, detail=f"content exceeds {CONTENT_MAX_BYTES} bytes")


def _parse_jsonb(value: Any) -> Any:
    """asyncpg (via SQLAlchemy text()) can hand back a jsonb column as a raw
    JSON string rather than a decoded object — same situation looks.py works
    around for user_looks.items. Defend the same way here."""
    if isinstance(value, str):
        try:
            return json_lib.loads(value)
        except (TypeError, ValueError):
            return value
    return value


def _derive_title(content: Any) -> Optional[str]:
    """First ~40 chars of a message's text, for auto-titling a chat that has
    none yet. content is arbitrary JSONB; the two shapes we know how to pull
    text out of are a plain string, or {"text": "..."}. Anything else (e.g. a
    pure outfit-card payload with no "text" key) yields no title — the chat
    just stays untitled until a message we CAN extract text from arrives."""
    text_value = None
    if isinstance(content, str):
        text_value = content
    elif isinstance(content, dict):
        candidate = content.get("text")
        if isinstance(candidate, str):
            text_value = candidate
    if not text_value:
        return None
    text_value = text_value.strip()
    if not text_value:
        return None
    return text_value[:40]


def _parse_created_at(value: Optional[str]) -> Optional[datetime]:
    """Best-effort ISO8601 parse for the optional per-message created_at in
    the import payload. Invalid/missing -> None, caller falls back to now()."""
    if not value or not isinstance(value, str):
        return None
    try:
        v = value.strip()
        if v.endswith("Z"):
            v = v[:-1] + "+00:00"
        dt = datetime.fromisoformat(v)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


async def _count_user_chats(db: AsyncSession, uid: str) -> int:
    result = await db.execute(text("SELECT count(*) FROM ai_chats WHERE user_id = :uid"), {"uid": uid})
    return result.scalar_one()


class CreateChatRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=TITLE_MAX_LEN)


class MessageIn(BaseModel):
    role: str
    content: Any

    @field_validator("role")
    @classmethod
    def _role_valid(cls, v: str) -> str:
        if v not in ("user", "assistant"):
            raise ValueError("role must be 'user' or 'assistant'")
        return v


class ImportMessageIn(MessageIn):
    created_at: Optional[str] = None


class ImportRequest(BaseModel):
    messages: List[ImportMessageIn]


# ── GET /api/ai/chats ──

@router.get("/chats")
async def list_chats(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""
            SELECT c.id, c.title, c.updated_at, COUNT(m.id) AS message_count
            FROM ai_chats c
            LEFT JOIN ai_chat_messages m ON m.chat_id = c.id
            WHERE c.user_id = :uid
            GROUP BY c.id
            ORDER BY c.updated_at DESC
        """),
        {"uid": user["id"]},
    )
    chats = [dict(r) for r in result.mappings().all()]
    return {"chats": chats}


# ── POST /api/ai/chats ──

@router.post("/chats")
async def create_chat(
    body: CreateChatRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if await _count_user_chats(db, user["id"]) >= MAX_CHATS_PER_USER:
        raise HTTPException(status_code=400, detail=f"chat limit reached ({MAX_CHATS_PER_USER})")

    title = body.title.strip()[:TITLE_MAX_LEN] if body.title and body.title.strip() else None

    result = await db.execute(
        text("""
            INSERT INTO ai_chats (user_id, title)
            VALUES (:uid, :title)
            RETURNING id, title, created_at, updated_at
        """),
        {"uid": user["id"], "title": title},
    )
    chat = dict(result.mappings().first())
    await db.commit()
    return {"chat": chat}


# ── GET /api/ai/chats/{chat_id} ──

@router.get("/chats/{chat_id}")
async def get_chat(
    chat_id: int,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    chat_result = await db.execute(
        text("SELECT id, title, created_at, updated_at FROM ai_chats WHERE id = :id AND user_id = :uid"),
        {"id": chat_id, "uid": user["id"]},
    )
    chat = chat_result.mappings().first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    messages_result = await db.execute(
        text("""
            SELECT id, role, content, created_at
            FROM ai_chat_messages
            WHERE chat_id = :id
            ORDER BY created_at, id
        """),
        {"id": chat_id},
    )
    messages = []
    for r in messages_result.mappings().all():
        m = dict(r)
        m["content"] = _parse_jsonb(m["content"])
        messages.append(m)

    return {"chat": dict(chat), "messages": messages}


# ── POST /api/ai/chats/{chat_id}/messages ──

@router.post("/chats/{chat_id}/messages")
async def add_message(
    chat_id: int,
    body: MessageIn,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _check_content_size(body.content)

    # Ownership check BEFORE writing — a non-owner (or a nonexistent chat_id)
    # gets 404 and nothing is written.
    chat_result = await db.execute(
        text("SELECT id, title FROM ai_chats WHERE id = :id AND user_id = :uid"),
        {"id": chat_id, "uid": user["id"]},
    )
    chat = chat_result.mappings().first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    content_json = json_lib.dumps(body.content, ensure_ascii=False)
    msg_result = await db.execute(
        text("""
            INSERT INTO ai_chat_messages (chat_id, role, content)
            VALUES (:cid, :role, CAST(:content AS jsonb))
            RETURNING id, role, content, created_at
        """),
        {"cid": chat_id, "role": body.role, "content": content_json},
    )
    message = dict(msg_result.mappings().first())
    message["content"] = _parse_jsonb(message["content"])

    new_title = _derive_title(body.content) if (not chat["title"] and body.role == "user") else None

    if new_title:
        await db.execute(
            text("UPDATE ai_chats SET updated_at = now(), title = :title WHERE id = :id"),
            {"title": new_title, "id": chat_id},
        )
    else:
        await db.execute(
            text("UPDATE ai_chats SET updated_at = now() WHERE id = :id"),
            {"id": chat_id},
        )

    await db.commit()
    return {"message": message}


# ── DELETE /api/ai/chats/{chat_id} ──

@router.delete("/chats/{chat_id}")
async def delete_chat(
    chat_id: int,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Messages cascade via ON DELETE CASCADE (migration 023).
    result = await db.execute(
        text("DELETE FROM ai_chats WHERE id = :id AND user_id = :uid RETURNING id"),
        {"id": chat_id, "uid": user["id"]},
    )
    if not result.first():
        raise HTTPException(status_code=404, detail="Chat not found")
    await db.commit()
    return {"ok": True}


# ── POST /api/ai/chats/import ──

@router.post("/chats/import")
async def import_chat(
    body: ImportRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if len(body.messages) > MAX_IMPORT_MESSAGES:
        raise HTTPException(status_code=400, detail=f"at most {MAX_IMPORT_MESSAGES} messages per import")

    for m in body.messages:
        _check_content_size(m.content)

    if await _count_user_chats(db, user["id"]) >= MAX_CHATS_PER_USER:
        raise HTTPException(status_code=400, detail=f"chat limit reached ({MAX_CHATS_PER_USER})")

    title = None
    for m in body.messages:
        if m.role == "user":
            title = _derive_title(m.content)
            if title:
                break

    chat_result = await db.execute(
        text("INSERT INTO ai_chats (user_id, title) VALUES (:uid, :title) RETURNING id"),
        {"uid": user["id"], "title": title},
    )
    chat_id = chat_result.mappings().first()["id"]

    for m in body.messages:
        created_at = _parse_created_at(m.created_at)
        content_json = json_lib.dumps(m.content, ensure_ascii=False)
        await db.execute(
            text("""
                INSERT INTO ai_chat_messages (chat_id, role, content, created_at)
                VALUES (:cid, :role, CAST(:content AS jsonb), COALESCE(:created_at, now()))
            """),
            {"cid": chat_id, "role": m.role, "content": content_json, "created_at": created_at},
        )

    result = await db.execute(
        text("""
            UPDATE ai_chats SET updated_at = now() WHERE id = :id
            RETURNING id, title, created_at, updated_at
        """),
        {"id": chat_id},
    )
    chat = dict(result.mappings().first())
    await db.commit()
    return {"chat": chat}
