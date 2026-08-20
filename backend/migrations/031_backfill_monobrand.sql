-- Brand for the monobrand half of the catalog, in SQL, on the deploy path.
--
-- Migration 030 added the column; without this the column is NULL for all 24643
-- rows on deploy day and the frontend (which no longer falls back to the
-- retailer) shows no brand at all for the entire catalog. The full backfill
-- needs the live feeds and lives in backend/scripts/backfill_brand.py, driven by
-- scripts/backfill.sh — but the part that needs NO network is exactly the part
-- that is a constant, so it belongs here where it cannot be forgotten.
--
-- These four retailers ship no <vendor> tag at all (verified on the live feeds
-- 2026-08-20: SELA feed 24700, 2moodstore 25132 — 0 of 6389 offers with a
-- vendor) and each sells exactly one house, so the brand is a constant. That is
-- what brand_source='monobrand' means: trustworthy by construction, but chosen
-- by us, not stated by the merchant.
--
-- ЦУМ (15204 rows) and ElytS (39) are NOT here and never will be: they are
-- multi-brand department stores, and writing a constant for them is precisely
-- the "brand = ЦУМ" bug this change exists to remove. Their rows get a brand
-- from their own feed's <vendor>, or they stay NULL.
--
-- The pairs below MUST match MONOBRAND_SOURCES in backend/brand.py and the copy
-- in ai-service/scripts/import_catalog.py. Expected effect on prod, counted
-- 2026-08-20: SELA 5155 + Интернет-магазин Lacoste 1642 + 2moodstore 585 +
-- LOVE REPUBLIC 479 = 7861 rows. Idempotent: `brand IS NULL` means a second run
-- and the later feed backfill both change 0 of them.

UPDATE wardrobe_items AS w
   SET brand = v.brand,
       brand_source = 'monobrand'
  FROM (VALUES
        ('sela',                     'SELA'),
        ('интернет-магазин lacoste', 'Lacoste'),
        ('lacoste',                  'Lacoste'),
        ('love republic',            'LOVE REPUBLIC'),
        ('loverepublic',             'LOVE REPUBLIC'),
        -- The feed calls the shop "2moodstore"; the house styles itself 2MOOD.
        ('2moodstore',               '2MOOD')
       ) AS v(source, brand)
 WHERE w.brand IS NULL
   AND w.notes IS NOT NULL
   AND lower(btrim(split_part(w.notes, ':', 1))) = v.source;
