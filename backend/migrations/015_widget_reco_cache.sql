-- Widget recommendation cache: memoize assembled outfits by cart signature so a
-- repeated cart view skips the expensive CLIP /complement call (retrieval +
-- OutfitTransformer scoring + image downloads). Keyed by a hash of
-- (partner_id, sorted SKUs, n_outfits, gender, temp bucket); served while fresh.
CREATE TABLE IF NOT EXISTS widget_reco_cache (
  cart_hash   TEXT PRIMARY KEY,
  partner_id  INT NOT NULL REFERENCES partner_profiles(id) ON DELETE CASCADE,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_widget_reco_cache_created ON widget_reco_cache (created_at);
