-- Mark internal/test accounts so revenue and funnel numbers can exclude them in SQL
-- instead of by hardcoded email in every query.
--
-- Audited 2026-08-20: the entire 974 ₽ of "13.09–31.10.2025 revenue" came from a
-- single account making six payments over two days (79/299/99/99/99/299), and
-- modemorph@yandex.ru contributed two 10 ₽ payments. Excluding those by literal
-- email inside each analytics query is how a filter silently drifts out of sync
-- between the dashboard, the Excel export and any ad-hoc report.
--
-- Deliberately flags NOBODY here: which accounts count as test is the product
-- owner's call, not a migration's. Set it explicitly, e.g.
--   UPDATE user_profiles SET is_test = true
--    WHERE user_id = (SELECT id FROM users WHERE email = 'modemorph@yandex.ru');

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_user_profiles_is_test ON user_profiles (is_test) WHERE is_test;
