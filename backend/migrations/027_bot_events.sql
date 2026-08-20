-- Pre-auth Telegram funnel.
--
-- Audited 2026-08-20: "сколько было стартов бота" was unanswerable for any period.
-- /start fires before a users/user_profiles row exists, so neither user_events
-- (needs user_profile_id BIGINT) nor usage_events (needs user_anon_id + subscriber
-- flags) can hold it. This table is the only place a pre-registration touch fits.
--
-- Deliberately append-only and free of foreign keys: the telegram_id is all the
-- bot knows at /start time, and the join to users happens later via
-- users.email = telegram_id || '@telegram.local'.

CREATE TABLE IF NOT EXISTS bot_events (
    id          BIGSERIAL PRIMARY KEY,
    telegram_id TEXT        NOT NULL,
    event_type  TEXT        NOT NULL,
    payload     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_events_created ON bot_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_events_type_created ON bot_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_events_telegram_id ON bot_events (telegram_id);
