# -*- coding: utf-8 -*-
"""Integration tests for the AI chat history endpoints (app/api/ai_chats.py).

Unlike the pure-logic tests next to this one (test_detect_clothing_crop.py),
auth isolation between users is a real-DB-query correctness question — a mock
can't meaningfully cover "does WHERE user_id = :uid actually keep user B out
of user A's chat". So this hits the real FastAPI app (via TestClient) against
a real Postgres with migrations 000..023 applied.

Run against a disposable local Postgres, e.g.:

  docker run -d --name mm_test_pg -e POSTGRES_USER=modemorph \
    -e POSTGRES_PASSWORD=modemorph -e POSTGRES_DB=modemorph \
    -p 55432:5432 postgres:16-alpine

  for f in backend/migrations/0*.sql; do
    PGPASSWORD=modemorph psql -h localhost -p 55432 -U modemorph -d modemorph \
      -v ON_ERROR_STOP=1 -f "$f"
  done

  DATABASE_URL=postgresql+asyncpg://modemorph:modemorph@localhost:55432/modemorph \
    python3 backend/app/api/test_ai_chats.py

Never points at a production/staging database on its own — DATABASE_URL must
be passed in explicitly, and there is no default that resolves to anything
real. The two users this creates (and everything under them) are deleted in
a `finally` block, whether the run passes or fails.
"""
import os
import sys
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
# Running `python3 backend/app/api/test_ai_chats.py` makes Python auto-insert
# this file's own directory (backend/app/api) at sys.path[0]. That shadows
# pip's "limits" package (a slowapi dependency) with our local app/api/limits.py
# of the same name, breaking `from app.main import app`. Drop it before adding
# backend/ so `import app.xxx` resolves the same way the app itself does.
sys.path = [p for p in sys.path if os.path.abspath(p or ".") != HERE]
sys.path.insert(0, os.path.join(HERE, "..", ".."))

if "DATABASE_URL" not in os.environ:
    print("DATABASE_URL is not set — this test needs a real Postgres with "
          "migrations 000..023 applied. See the module docstring for how to "
          "spin up a disposable one. Not guessing a default that could "
          "silently point at a real database.")
    sys.exit(1)

os.environ.setdefault("JWT_SECRET", "test-secret-" + "x" * 32)
os.environ.setdefault("TELEGRAM_PEPPER", "test-pepper")

import asyncio  # noqa: E402
import asyncpg  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.main import app  # noqa: E402

USER_A_ID = str(uuid.uuid4())
USER_B_ID = str(uuid.uuid4())
TOKEN_A = create_access_token(USER_A_ID, f"a-{USER_A_ID}@test.local")
TOKEN_B = create_access_token(USER_B_ID, f"b-{USER_B_ID}@test.local")

client: TestClient = None  # set in main()


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _pg_dsn() -> str:
    # settings.DATABASE_URL is the SQLAlchemy-flavored "postgresql+asyncpg://..."；
    # the bare asyncpg driver wants "postgresql://...".
    return settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")


async def _setup_users():
    conn = await asyncpg.connect(_pg_dsn())
    try:
        for uid_str, email in (
            (USER_A_ID, f"a-{USER_A_ID}@test.local"),
            (USER_B_ID, f"b-{USER_B_ID}@test.local"),
        ):
            await conn.execute(
                "INSERT INTO users (id, email, encrypted_password) VALUES ($1, $2, 'x') "
                "ON CONFLICT (id) DO NOTHING",
                uuid.UUID(uid_str), email,
            )
    finally:
        await conn.close()


async def _teardown_users():
    conn = await asyncpg.connect(_pg_dsn())
    try:
        ids = [uuid.UUID(USER_A_ID), uuid.UUID(USER_B_ID)]
        # ai_chat_messages cascades via ON DELETE CASCADE on ai_chats.
        await conn.execute("DELETE FROM ai_chats WHERE user_id = ANY($1::uuid[])", ids)
        await conn.execute("DELETE FROM users WHERE id = ANY($1::uuid[])", ids)
    finally:
        await conn.close()


# ------------------------------------------------------------ main scenario

def test_create_chat_defaults_to_no_title():
    r = client.post("/api/ai/chats", json={}, headers=auth(TOKEN_A))
    assert r.status_code == 200, r.text
    chat = r.json()["chat"]
    assert chat["title"] is None
    assert "id" in chat and "created_at" in chat and "updated_at" in chat


def test_create_chat_with_explicit_title():
    r = client.post("/api/ai/chats", json={"title": "Собеседование"}, headers=auth(TOKEN_A))
    assert r.status_code == 200, r.text
    assert r.json()["chat"]["title"] == "Собеседование"


def test_get_chat_returns_empty_messages_for_new_chat():
    chat_id = client.post("/api/ai/chats", json={}, headers=auth(TOKEN_A)).json()["chat"]["id"]
    r = client.get(f"/api/ai/chats/{chat_id}", headers=auth(TOKEN_A))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["chat"]["id"] == chat_id
    assert body["messages"] == []


def test_first_user_message_derives_title_from_first_40_chars():
    chat_id = client.post("/api/ai/chats", json={}, headers=auth(TOKEN_A)).json()["chat"]["id"]
    text = "Подбери мне образ на завтра для прогулки в парке с друзьями"
    r = client.post(
        f"/api/ai/chats/{chat_id}/messages",
        json={"role": "user", "content": {"text": text}},
        headers=auth(TOKEN_A),
    )
    assert r.status_code == 200, r.text
    msg = r.json()["message"]
    assert msg["role"] == "user"
    assert msg["content"] == {"text": text}
    assert "id" in msg and "created_at" in msg

    r = client.get(f"/api/ai/chats/{chat_id}", headers=auth(TOKEN_A))
    body = r.json()
    assert body["chat"]["title"] == text[:40]
    assert len(body["messages"]) == 1


def test_title_is_not_overwritten_by_a_later_message():
    chat_id = client.post("/api/ai/chats", json={"title": "Уже есть заголовок"}, headers=auth(TOKEN_A)).json()["chat"]["id"]
    client.post(
        f"/api/ai/chats/{chat_id}/messages",
        json={"role": "user", "content": {"text": "Второй вопрос про другое совсем"}},
        headers=auth(TOKEN_A),
    )
    r = client.get(f"/api/ai/chats/{chat_id}", headers=auth(TOKEN_A))
    assert r.json()["chat"]["title"] == "Уже есть заголовок"


def test_assistant_message_does_not_set_title():
    chat_id = client.post("/api/ai/chats", json={}, headers=auth(TOKEN_A)).json()["chat"]["id"]
    client.post(
        f"/api/ai/chats/{chat_id}/messages",
        json={"role": "assistant", "content": {"text": "Вот твой образ"}},
        headers=auth(TOKEN_A),
    )
    r = client.get(f"/api/ai/chats/{chat_id}", headers=auth(TOKEN_A))
    assert r.json()["chat"]["title"] is None


def test_adding_a_message_bumps_updated_at_and_lists_it_first():
    chat_1 = client.post("/api/ai/chats", json={"title": "Первый"}, headers=auth(TOKEN_A)).json()["chat"]["id"]
    chat_2 = client.post("/api/ai/chats", json={"title": "Второй"}, headers=auth(TOKEN_A)).json()["chat"]["id"]
    # touch chat_1 so it becomes the most recently updated
    client.post(
        f"/api/ai/chats/{chat_1}/messages",
        json={"role": "user", "content": "hi"},
        headers=auth(TOKEN_A),
    )
    r = client.get("/api/ai/chats", headers=auth(TOKEN_A))
    assert r.status_code == 200, r.text
    ids_in_order = [c["id"] for c in r.json()["chats"]]
    assert ids_in_order.index(chat_1) < ids_in_order.index(chat_2)


def test_list_reports_message_count():
    chat_id = client.post("/api/ai/chats", json={}, headers=auth(TOKEN_A)).json()["chat"]["id"]
    for i in range(3):
        client.post(
            f"/api/ai/chats/{chat_id}/messages",
            json={"role": "user" if i % 2 == 0 else "assistant", "content": f"msg {i}"},
            headers=auth(TOKEN_A),
        )
    r = client.get("/api/ai/chats", headers=auth(TOKEN_A))
    entry = next(c for c in r.json()["chats"] if c["id"] == chat_id)
    assert entry["message_count"] == 3


def test_delete_chat_cascades_messages():
    chat_id = client.post("/api/ai/chats", json={}, headers=auth(TOKEN_A)).json()["chat"]["id"]
    client.post(
        f"/api/ai/chats/{chat_id}/messages",
        json={"role": "user", "content": "will be deleted"},
        headers=auth(TOKEN_A),
    )
    r = client.delete(f"/api/ai/chats/{chat_id}", headers=auth(TOKEN_A))
    assert r.status_code == 200 and r.json() == {"ok": True}

    r = client.get(f"/api/ai/chats/{chat_id}", headers=auth(TOKEN_A))
    assert r.status_code == 404


def test_import_creates_chat_and_preserves_created_at():
    messages = [
        {"role": "user", "content": {"text": "Хочу образ на собеседование"},
         "created_at": "2026-01-01T10:00:00Z"},
        {"role": "assistant", "content": {"text": "Вот что предлагаю"},
         "created_at": "2026-01-01T10:00:05Z"},
    ]
    r = client.post("/api/ai/chats/import", json={"messages": messages}, headers=auth(TOKEN_A))
    assert r.status_code == 200, r.text
    chat = r.json()["chat"]
    assert chat["title"] == "Хочу образ на собеседование"[:40]

    r = client.get(f"/api/ai/chats/{chat['id']}", headers=auth(TOKEN_A))
    body_messages = r.json()["messages"]
    assert len(body_messages) == 2
    assert body_messages[0]["role"] == "user"
    assert body_messages[0]["created_at"].startswith("2026-01-01T10:00:00")
    assert body_messages[1]["created_at"].startswith("2026-01-01T10:00:05")


def test_import_without_created_at_still_works():
    r = client.post(
        "/api/ai/chats/import",
        json={"messages": [{"role": "user", "content": "no timestamp"}]},
        headers=auth(TOKEN_A),
    )
    assert r.status_code == 200, r.text
    chat_id = r.json()["chat"]["id"]
    r = client.get(f"/api/ai/chats/{chat_id}", headers=auth(TOKEN_A))
    assert len(r.json()["messages"]) == 1


# ------------------------------------------------------------- limits

def test_import_rejects_more_than_200_messages():
    messages = [{"role": "user", "content": "x"} for _ in range(201)]
    r = client.post("/api/ai/chats/import", json={"messages": messages}, headers=auth(TOKEN_A))
    assert r.status_code == 400, r.text


def test_import_accepts_exactly_200_messages():
    messages = [{"role": "user", "content": "x"} for _ in range(200)]
    r = client.post("/api/ai/chats/import", json={"messages": messages}, headers=auth(TOKEN_A))
    assert r.status_code == 200, r.text


def test_oversized_message_content_is_rejected():
    chat_id = client.post("/api/ai/chats", json={}, headers=auth(TOKEN_A)).json()["chat"]["id"]
    r = client.post(
        f"/api/ai/chats/{chat_id}/messages",
        json={"role": "user", "content": {"text": "x" * 30_000}},
        headers=auth(TOKEN_A),
    )
    assert r.status_code == 400, r.text


def test_invalid_role_is_rejected():
    chat_id = client.post("/api/ai/chats", json={}, headers=auth(TOKEN_A)).json()["chat"]["id"]
    r = client.post(
        f"/api/ai/chats/{chat_id}/messages",
        json={"role": "system", "content": "x"},
        headers=auth(TOKEN_A),
    )
    assert r.status_code == 422, r.text


# ---------------------------------------------------- user isolation (core requirement)

def test_user_b_cannot_read_user_as_chat():
    chat_id = client.post("/api/ai/chats", json={"title": "A private chat"}, headers=auth(TOKEN_A)).json()["chat"]["id"]
    r = client.get(f"/api/ai/chats/{chat_id}", headers=auth(TOKEN_B))
    assert r.status_code == 404, r.text


def test_user_b_cannot_delete_user_as_chat():
    chat_id = client.post("/api/ai/chats", json={"title": "A chat to keep"}, headers=auth(TOKEN_A)).json()["chat"]["id"]
    r = client.delete(f"/api/ai/chats/{chat_id}", headers=auth(TOKEN_B))
    assert r.status_code == 404, r.text
    # confirm it's untouched — the real owner can still read it
    r = client.get(f"/api/ai/chats/{chat_id}", headers=auth(TOKEN_A))
    assert r.status_code == 200


def test_user_b_cannot_post_message_into_user_as_chat():
    chat_id = client.post("/api/ai/chats", json={"title": "A chat"}, headers=auth(TOKEN_A)).json()["chat"]["id"]
    r = client.post(
        f"/api/ai/chats/{chat_id}/messages",
        json={"role": "user", "content": "hijacked message"},
        headers=auth(TOKEN_B),
    )
    assert r.status_code == 404, r.text
    r = client.get(f"/api/ai/chats/{chat_id}", headers=auth(TOKEN_A))
    assert r.json()["messages"] == []


def test_user_bs_list_never_contains_user_as_chats():
    a_chat_id = client.post("/api/ai/chats", json={"title": "only A's"}, headers=auth(TOKEN_A)).json()["chat"]["id"]
    r = client.get("/api/ai/chats", headers=auth(TOKEN_B))
    assert r.status_code == 200, r.text
    b_ids = {c["id"] for c in r.json()["chats"]}
    assert a_chat_id not in b_ids


def test_unknown_chat_id_is_404_not_500():
    r = client.get("/api/ai/chats/999999999", headers=auth(TOKEN_A))
    assert r.status_code == 404


def test_missing_auth_is_401():
    r = client.get("/api/ai/chats")
    assert r.status_code == 401


# ------------------------------------------------------------------ runner

def main():
    global client
    asyncio.run(_setup_users())
    passed = failed = 0
    try:
        with TestClient(app) as c:
            client = c
            for name, fn in sorted(globals().items()):
                if name.startswith("test_") and callable(fn):
                    try:
                        fn()
                        passed += 1
                        print("PASS", name)
                    except AssertionError as exc:
                        failed += 1
                        print("FAIL", name, exc)
                    except Exception as exc:  # noqa: BLE001 — surface unexpected errors too
                        failed += 1
                        print("ERROR", name, repr(exc))
    finally:
        asyncio.run(_teardown_users())
    print(f"{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
