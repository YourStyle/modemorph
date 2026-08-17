-- Server-side history for the AI stylist chat. Previously lived only in the
-- browser's localStorage ("ai_assistant_history" in app/app/ai-assistant/page.tsx)
-- and was lost on device change / cache clear. This adds server storage;
-- localStorage is migrated once via POST /api/ai/chats/import.
--
-- Follows the established convention for user-owned tables in this schema
-- (recommendation_logs, user_looks, wardrobe_user_items, ...): user_id is a
-- plain UUID with no DB-level FK to users(id) — ownership is enforced entirely
-- in the API layer (WHERE user_id = :uid on every read/write).

CREATE TABLE IF NOT EXISTS ai_chats (
    id         BIGSERIAL PRIMARY KEY,
    user_id    UUID NOT NULL,
    title      VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GET /api/ai/chats: list a user's chats ordered by updated_at desc.
CREATE INDEX IF NOT EXISTS idx_ai_chats_user_updated ON ai_chats (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
    id         BIGSERIAL PRIMARY KEY,
    chat_id    BIGINT NOT NULL REFERENCES ai_chats(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    -- Free-form: plain text today, but the frontend also wants to attach an
    -- outfit card / item references, so this stays JSONB rather than TEXT.
    content    JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Backstop against an absurd single message (~20KB is generous for text +
    -- a card/item-ref payload). Primary enforcement is in the API layer, this
    -- is defense in depth in case a future caller bypasses it.
    CONSTRAINT ai_chat_messages_content_size CHECK (pg_column_size(content) <= 20000)
);

-- GET /api/ai/chats/{chat_id}: messages of one chat ordered by created_at.
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_chat_created ON ai_chat_messages (chat_id, created_at);
