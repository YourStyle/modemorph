-- Partner Cabinet: tables for partner system
-- Compatible with both Supabase and standalone PostgreSQL

-- 1. Partner profiles
CREATE TABLE IF NOT EXISTS partner_profiles (
  id          SERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  website     TEXT,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  rejected_reason TEXT,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- 2. API tokens (hash-only storage)
CREATE TABLE IF NOT EXISTS partner_api_tokens (
  id                    SERIAL PRIMARY KEY,
  partner_id            INT NOT NULL REFERENCES partner_profiles(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  token_hash            TEXT NOT NULL,
  token_prefix          TEXT NOT NULL,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  rate_limit_per_minute INT NOT NULL DEFAULT 10,
  last_used_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_partner_api_tokens_hash ON partner_api_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_partner_api_tokens_partner ON partner_api_tokens(partner_id);

-- 3. API usage log
CREATE TABLE IF NOT EXISTS partner_api_usage (
  id          BIGSERIAL PRIMARY KEY,
  partner_id  INT NOT NULL REFERENCES partner_profiles(id),
  token_id    INT REFERENCES partner_api_tokens(id),
  endpoint    TEXT NOT NULL,
  status_code INT NOT NULL,
  error_code  TEXT,
  latency_ms  INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_api_usage_partner_created ON partner_api_usage(partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_api_usage_token_created ON partner_api_usage(token_id, created_at DESC);

-- 4. Partner XML feeds
CREATE TABLE IF NOT EXISTS partner_feeds (
  id              SERIAL PRIMARY KEY,
  partner_id      INT NOT NULL REFERENCES partner_profiles(id) ON DELETE CASCADE,
  file_url        TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  items_total     INT DEFAULT 0,
  items_imported  INT DEFAULT 0,
  items_skipped   INT DEFAULT 0,
  error_log       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_partner_feeds_partner ON partner_feeds(partner_id);

-- 5. Add partner tracking columns to wardrobe_items
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS partner_id INT REFERENCES partner_profiles(id);
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS feed_id INT REFERENCES partner_feeds(id);
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_partner ON wardrobe_items(partner_id);

-- 6. RLS (only if using Supabase — skip for standalone Postgres)
-- ALTER TABLE partner_profiles ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE partner_api_tokens ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE partner_api_usage ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE partner_feeds ENABLE ROW LEVEL SECURITY;
