-- Partner outfit-matching widget: cart→catalog SKU bridge, browser-safe
-- publishable keys (domain-locked), and widget attribution events.
--
-- Context: the embeddable widget runs on the partner's own site. It reads the
-- shopper's cart SKUs, matches them to this partner's catalog rows in
-- wardrobe_items, asks the CLIP service to assemble complementary outfits from
-- the SAME partner's catalog, and renders them with affiliate links.

-- 1. SKU bridge ───────────────────────────────────────────────────────────
-- Feeds historically stored the partner SKU inside notes as "SOURCE:sku"
-- (import_catalog.py / cron process-feeds). Promote it to a first-class,
-- indexed column so cart lookups are O(index) instead of LIKE scans.
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS source_sku TEXT;

-- Backfill from the legacy notes encoding. split_part takes the 2nd ':' field;
-- multi-colon SKUs truncate, which is acceptable for historical rows — the
-- importer writes source_sku directly going forward.
UPDATE wardrobe_items
SET source_sku = NULLIF(split_part(notes, ':', 2), '')
WHERE source_sku IS NULL AND notes LIKE '%:%';

-- Cart lookup is always partner-scoped: WHERE partner_id = :pid AND source_sku = :sku
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_partner_sku
    ON wardrobe_items (partner_id, source_sku)
    WHERE source_sku IS NOT NULL;

-- 2. Publishable widget keys ──────────────────────────────────────────────
-- DISTINCT from partner_api_tokens (those are SECRET, server-side, full VTON
-- access). A widget key (mm_wk_...) is exposed in the partner's page source, so
-- it is read-only, scoped to the widget endpoints, and locked to an origin
-- allow-list. The origin lock — not the key secrecy — is the real boundary.
CREATE TABLE IF NOT EXISTS partner_widget_keys (
  id                    SERIAL PRIMARY KEY,
  partner_id            INT NOT NULL REFERENCES partner_profiles(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  key_hash              TEXT NOT NULL,                 -- sha256(mm_wk_...)
  key_prefix            TEXT NOT NULL,                 -- mm_wk_xxxxxx for display
  allowed_origins       TEXT[] NOT NULL DEFAULT '{}',  -- exact origins, e.g. https://shop.sela.ru
  is_active             BOOLEAN NOT NULL DEFAULT true,
  rate_limit_per_minute INT NOT NULL DEFAULT 60,
  theme                 JSONB,                         -- {title, accent, radius, ...}
  last_used_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_partner_widget_keys_hash ON partner_widget_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_partner_widget_keys_partner ON partner_widget_keys(partner_id);

-- 3. Widget attribution events ────────────────────────────────────────────
-- Funnel: impression → outfit_view → item_click → add_to_cart. Lets us report
-- per-partner conversion and tie affiliate clicks back to a render session.
CREATE TABLE IF NOT EXISTS widget_events (
  id            BIGSERIAL PRIMARY KEY,
  partner_id    INT NOT NULL REFERENCES partner_profiles(id) ON DELETE CASCADE,
  widget_key_id INT REFERENCES partner_widget_keys(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL
                  CHECK (event_type IN ('impression', 'outfit_view', 'item_click', 'add_to_cart')),
  session_id    TEXT,            -- per render, ties the funnel together
  item_id       BIGINT,          -- catalog item involved (click / add_to_cart)
  anchor_skus   TEXT[],          -- cart SKUs that drove the recommendation
  origin        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_widget_events_partner_created ON widget_events(partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_widget_events_session ON widget_events(session_id);
