-- The admin analytics dashboard now reads CTR straight from recommendation_logs:
--   count(*) WHERE action = 'click' | 'affiliate_click' | 'impression'
-- The existing partial index uq_rec_logs_impression already covers impressions,
-- but click / affiliate_click counts had no support and fell back to a seq scan.
-- A small btree on action keeps the (admin-only) dashboard snappy as the table
-- grows past the current ~70k rows. Idempotent + concurrent-safe via IF NOT EXISTS.
CREATE INDEX IF NOT EXISTS idx_rec_logs_action
    ON recommendation_logs (action)
    WHERE action IS NOT NULL;
