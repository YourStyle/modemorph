-- Brand as a first-class column on the catalog.
--
-- Audited 2026-08-20: wardrobe_items had no brand at all. Six call sites faked one
-- with `notes.split(":")[0]`, but notes is "<FEED_SOURCE>:<SKU>" and FEED_SOURCE is
-- the RETAILER. 15204 of the 24355 rows with notes come from ЦУМ (62.4%, counted
-- on prod 2026-08-20), so a Saint Laurent coat reached the outfit card AND the
-- Gemini prompt labelled "ЦУМ".
-- Those sites now say `retailer`, which is true; `brand` lives here instead.
--
-- brand_source records HOW the value was obtained, so confidence is queryable
-- rather than assumed:
--   'feed_vendor' — copied from the offer's <vendor> tag (ЦУМ 375/375 sampled,
--                   ElytS 662/662). Trustworthy.
--   'monobrand'   — the feed carries no <vendor> and the retailer sells one brand
--                   (SELA, Lacoste, 2moodstore, LOVE REPUBLIC). Trustworthy by
--                   construction, but it is a constant, not merchant data.
--   'dictionary'  — longest-suffix match of item_name against the set of vendor
--                   values observed in the feeds. Inferred. Filter it out of any
--                   partner-facing report.
-- Anything NULL is unknown, and that is the intended resting state: the catalog
-- shipped a wrong brand for a year, and a NULL is strictly better than that.
--
-- No CHECK constraint on brand_source on purpose — a new provenance (a merchant
-- API, a manual admin edit) should not need a migration to be recordable. The
-- three values above are the vocabulary, enforced by the writers.

ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS brand_source TEXT;

-- Brand pages / catalog composition group case-insensitively: the feeds ship
-- "LACOSTE", "Lacoste" and "lacoste" for the same house (ElytS shouts, ЦУМ does
-- not), so an index on the raw column would not serve the query that matters.
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_brand_lower
    ON wardrobe_items (lower(brand))
    WHERE brand IS NOT NULL;
