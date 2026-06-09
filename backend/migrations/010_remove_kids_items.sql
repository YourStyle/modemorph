-- Migration 008: remove children's items from the catalog (kids are not our audience).
--
-- The legacy schema has no age/age_group column, so kids are detected by name.
-- We add an is_kids flag, backfill it, and HIDE flagged items — every feed that
-- already respects is_hidden (recommendations, cron, ai) then drops them at once.
-- Idempotent.

ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS is_kids BOOLEAN DEFAULT false;

-- Backfill: flag kids items by name (mirror of catalog_filters.KIDS_KEYWORDS).
UPDATE wardrobe_items SET is_kids = true
WHERE COALESCE(is_kids, false) = false
  AND (
        item_name ILIKE '%детск%'        OR item_name ILIKE '%для детей%'
     OR item_name ILIKE '%для мальчик%'  OR item_name ILIKE '%для девоч%'
     OR item_name ILIKE '%ясельн%'       OR item_name ILIKE '%малыш%'
     OR item_name ILIKE '%школьн%'       OR item_name ILIKE '%подростк%'
     OR item_name ILIKE '%детям%'        OR item_name ILIKE '%новорожд%'
     OR item_name ILIKE '%kids%'         OR item_name ILIKE '%baby%'
     OR item_name ILIKE '%junior%'       OR item_name ILIKE '%toddler%'
     OR item_name ILIKE '%infant%'
  );

-- Hide them so they vanish from every is_hidden-aware feed.
UPDATE wardrobe_items SET is_hidden = true
WHERE is_kids = true AND COALESCE(is_hidden, false) = false;

CREATE INDEX IF NOT EXISTS wardrobe_items_is_kids_idx ON wardrobe_items (is_kids);
