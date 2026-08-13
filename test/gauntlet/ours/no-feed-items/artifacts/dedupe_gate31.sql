-- gate31 (notes LIKE 'Unknown:%') size-variant dedupe — DRY RUN by default.
--
-- 1250 rows collapse to 264 products. Group members are byte-identical on
-- item_name / image_url / embedding / price / description; only source_sku and
-- url (?variant_id=) differ, and size_type is empty on all 1250 rows — so the
-- extra rows carry no size information the app could ever show.
--
-- Nothing is deleted. The 986 redundant rows are hidden and their embedding is
-- cleared (the FAISS build reads `embedding IS NOT NULL` and ignores is_hidden,
-- so hiding alone would NOT remove them from visual search). Both changes are
-- reversible from the surviving twin — see ROLLBACK at the bottom.
--
-- Run:  psql ... -f dedupe_gate31.sql            (dry run, read-only)
--       psql ... -v apply=1 -f dedupe_gate31.sql (applies inside a transaction)

\set ON_ERROR_STOP on

-- The drop set. Keeper = the row already referenced by real user data
-- (user_looks / dislikes / outfit_items) if there is one, else the lowest id.
-- With today's data that rule makes every referenced id a keeper, so no
-- foreign key or jsonb reference needs re-pointing.
CREATE TEMP VIEW dedupe_plan AS
WITH referenced AS (
  SELECT (e->>'id')::bigint AS id
    FROM user_looks ul, jsonb_array_elements(ul.items) e
   WHERE e->>'type' = 'basic' AND e->>'id' ~ '^[0-9]+$'
  UNION SELECT item_id FROM user_item_dislikes WHERE item_source = 'wardrobe_items'
  UNION SELECT wardrobe_item_id FROM outfit_items
), grp AS (
  -- ?variant_id= is the size; everything before it identifies the product.
  -- Matches decode_merchant_url() in ai-service/scripts/enrich_no_feed.py.
  SELECT id, split_part(substring(url from 'ulp=([^&]+)'), '%3F', 1) AS product_key
    FROM wardrobe_items
   WHERE notes LIKE 'Unknown:%'
)
SELECT g.id, g.product_key,
       row_number() OVER (PARTITION BY g.product_key
                          ORDER BY (g.id IN (SELECT id FROM referenced)) DESC, g.id) AS rn
  FROM grp g;

\echo '=== 1. shape: rows -> products ==='
SELECT count(*) rows, count(DISTINCT product_key) products,
       count(*) FILTER (WHERE rn = 1) keepers,
       count(*) FILTER (WHERE rn > 1) to_hide,
       count(*) FILTER (WHERE product_key IS NULL OR product_key = '') unparsed_url
  FROM dedupe_plan;
-- expected: 1250 | 264 | 264 | 986 | 0

\echo '=== 2. safety: do any group members actually disagree? (all zeros = true duplicates) ==='
SELECT sum((n_name    > 1)::int) name_differs,
       sum((n_img     > 1)::int) image_differs,
       sum((n_emb     > 1)::int) embedding_differs,
       sum((n_price   > 1)::int) price_differs,
       sum((n_desc    > 1)::int) description_differs,
       sum((n_type    > 1)::int) clothing_type_differs,
       sum((n_size    > 1)::int) size_type_differs,
       count(*) groups
  FROM (SELECT p.product_key,
               count(DISTINCT w.item_name) n_name, count(DISTINCT w.image_url) n_img,
               count(DISTINCT w.embedding::text) n_emb, count(DISTINCT w.price) n_price,
               count(DISTINCT w.description) n_desc, count(DISTINCT w.clothing_type) n_type,
               count(DISTINCT w.size_type) n_size
          FROM dedupe_plan p JOIN wardrobe_items w ON w.id = p.id
         GROUP BY 1) s;

\echo '=== 3. references landing on rows we are about to hide ==='
SELECT 'outfit_items (FK)'          site, count(*) refs FROM outfit_items o
  JOIN dedupe_plan p ON p.id = o.wardrobe_item_id AND p.rn > 1
UNION ALL SELECT 'user_looks.items (jsonb, type=basic)', count(*)
  FROM user_looks ul, jsonb_array_elements(ul.items) e
  JOIN dedupe_plan p ON p.id::text = e->>'id' AND p.rn > 1 WHERE e->>'type' = 'basic'
UNION ALL SELECT 'user_item_dislikes', count(*) FROM user_item_dislikes d
  JOIN dedupe_plan p ON p.id = d.item_id AND p.rn > 1
UNION ALL SELECT 'wardrobe_items.basic_item_id (self-FK)', count(*) FROM wardrobe_items w
  JOIN dedupe_plan p ON p.id = w.basic_item_id AND p.rn > 1
UNION ALL SELECT 'usage_events', count(*) FROM usage_events u
  JOIN dedupe_plan p ON p.id = u.item_id AND p.rn > 1
UNION ALL SELECT 'recommendation_logs (append-only history, left as-is)', count(*)
  FROM recommendation_logs r JOIN dedupe_plan p ON p.id = r.item_id AND p.rn > 1
UNION ALL SELECT 'main_recommendations (jsonb snapshot, regenerated daily)', count(*)
  FROM main_recommendations m, jsonb_array_elements(m.look_sections) sec,
       jsonb_array_elements(sec->'suggestions') sug, jsonb_array_elements(sug->'items') it
  JOIN dedupe_plan p ON p.id::text = it->>'id' AND p.rn > 1 WHERE it->>'user_id' IS NULL;
-- expected: first four sites 0; rec_logs ~108761, main_recs ~21022 (both tolerate it)

\echo '=== 4. FAISS index before / after ==='
SELECT count(*) FILTER (WHERE embedding IS NOT NULL) vectors_now,
       count(*) FILTER (WHERE embedding IS NOT NULL
                          AND id NOT IN (SELECT id FROM dedupe_plan WHERE rn > 1)) vectors_after
  FROM wardrobe_items;
-- expected: 5767 -> 4781

\if :{?apply}
BEGIN;
  CREATE TABLE IF NOT EXISTS dedupe_gate31_backup AS
    SELECT id, is_hidden, embedding, now() AS backed_up_at FROM wardrobe_items WHERE false;
  INSERT INTO dedupe_gate31_backup (id, is_hidden, embedding, backed_up_at)
    SELECT w.id, w.is_hidden, w.embedding, now()
      FROM wardrobe_items w JOIN dedupe_plan p ON p.id = w.id AND p.rn > 1;

  UPDATE wardrobe_items w
     SET is_hidden = true, embedding = NULL, updated_at = now()
    FROM dedupe_plan p
   WHERE p.id = w.id AND p.rn > 1;
COMMIT;
\echo '=== APPLIED (committed). Prior is_hidden/embedding saved in dedupe_gate31_backup. ==='

SELECT count(*) FILTER (WHERE embedding IS NOT NULL) vectors_after_apply,
       count(*) FILTER (WHERE notes LIKE 'Unknown:%' AND NOT is_hidden) gate31_visible,
       (SELECT count(*) FROM dedupe_gate31_backup) rows_backed_up
  FROM wardrobe_items;
\else
\echo '=== DRY RUN — nothing written. Re-run with -v apply=1 to apply. ==='
\endif

-- ROLLBACK (either works):
--   UPDATE wardrobe_items w SET is_hidden = b.is_hidden, embedding = b.embedding
--     FROM dedupe_gate31_backup b WHERE b.id = w.id;
-- or, without the backup table, restore each vector from its surviving twin:
--   UPDATE wardrobe_items w SET is_hidden = false, embedding = k.embedding
--     FROM dedupe_plan p JOIN dedupe_plan kp ON kp.product_key = p.product_key AND kp.rn = 1
--     JOIN wardrobe_items k ON k.id = kp.id
--    WHERE p.id = w.id AND p.rn > 1;
