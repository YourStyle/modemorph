-- 052: кабинет партнёров и wardrobe_items.price есть и в базе, собранной с нуля;
--      у скрытия товара появляется причина.
--
-- 1. Таблицы кабинета (токены API, журнал вызовов, фиды) и wardrobe_items.feed_id
--    жили только в sql/partner_cabinet.sql, мимо истории миграций; wardrobe_items.price
--    не создавала ни одна миграция, хотя его пишут оба импортёра. На базе с нуля (CI,
--    новый сервер) падали токены, фиды, /usage, /api/v1/vton, process-feeds и
--    import-feeds. Нашёл e2e 28.09.2026. Определения сверены с продом 28.09.2026;
--    на проде всё это уже есть — IF NOT EXISTS делает шаги no-op.
--
-- 2. hidden_reason. is_hidden ставят три разных процесса: sync-feeds (товар пропал
--    из фида), pick-flatlay (на фото модель) и админ руками — и различить их потом
--    нельзя. Поэтому товар, на день ушедший из наличия, не возвращался никогда, а
--    непроверенный (CLIP лежал) нельзя было перепроверить. Значения:
--      gone_from_feed — пропал из фида, вернётся сам, когда снова появится;
--      unchecked      — pick-flatlay не ответил, перепроверится при следующем импорте;
--      has_person     — на фото модель, ждёт админа.
--    NULL — скрыт до этой миграции или руками: не трогаем.

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

ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS partner_id INT REFERENCES partner_profiles(id);
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS feed_id INT REFERENCES partner_feeds(id);
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_partner ON wardrobe_items(partner_id);

ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS price NUMERIC;

ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS hidden_reason TEXT;
