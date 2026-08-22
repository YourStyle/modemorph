-- Flag the known internal accounts, decided by the product owner 2026-08-20.
--
-- Why these two:
--   modemorph@yandex.ru      — two 10 ₽ payments on 2025-09-01, provider smoke test
--   416546809@telegram.local — the ADMIN_CHAT_ID of the bot; its 8 "paid" payments
--                              include six over two days (79/299/99/99/99/299) on
--                              2025-10-25..26, which is the entire reported
--                              "974 ₽ revenue" for the 13.09–31.10.2025 period
--
-- After this, honest revenue for that launch period is 0 payments, and all-time
-- drops from 15 paid rows to 7 (9 058 ₽).
--
-- Idempotent by email so re-running is harmless; profiles that do not exist are
-- silently skipped rather than failing the migration.

UPDATE user_profiles
   SET is_test = true, updated_at = NOW()
 WHERE user_id IN (
     SELECT id FROM users
      WHERE email IN ('modemorph@yandex.ru', '416546809@telegram.local')
 );
