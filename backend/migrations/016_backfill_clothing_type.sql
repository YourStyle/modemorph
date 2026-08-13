-- Backfill clothing_type for items saved before the client started sending it.
--
-- Until 72b6909 none of the three save paths passed clothing_type, so every
-- item analysed from a photo landed on the column DEFAULT 'верхняя' (or empty).
-- That is 595 of 1301 user items — slot-based outfit assembly reads this column,
-- so it was assembling outfits blind on ~46% of every wardrobe.
--
-- The target vocabulary is _SLOT_MAP (ai-service/clip/routes.py:560, mirrored in
-- backend/app/api/recommendations.py). Writing anything outside it is pointless:
-- the recommender resolves an unknown type to no slot and drops the item.
--
-- Accessories (bags, eyewear, belts, watches, jewellery, hats, scarves, socks)
-- are deliberately left alone — _SLOT_MAP has no accessory slot, so there is no
-- honest value to write. They stay as they are until the slot vocabulary grows.
--
-- Idempotent: only touches rows that are still unset.

UPDATE wardrobe_user_items SET clothing_type = t
FROM (
  SELECT id, CASE
    -- outerwear (before the generic 'куртка' guard below)
    WHEN n ILIKE '%пухов%'                                        THEN 'puffer-jacket'
    WHEN n ILIKE '%парк%'                                         THEN 'parka'
    WHEN n ILIKE '%шуб%'                                          THEN 'fur-coat'
    WHEN n ILIKE '%дублен%' OR n ILIKE '%дублён%'                 THEN 'sheepskin-coat'
    WHEN n ILIKE '%тренч%' OR n ILIKE '%пальто%' OR n ILIKE '%плащ%' THEN 'coat'
    -- _SLOT_MAP has no generic jacket key, and 'джинсовая куртка' must not fall
    -- through to the 'джинс' rule below and become trousers.
    WHEN n ILIKE '%куртк%'                                        THEN NULL
    -- shoes
    WHEN n ILIKE '%кроссовк%' OR n ILIKE '%кед%'                  THEN 'sneakers'
    WHEN n ILIKE '%ботин%' OR n ILIKE '%сапог%' OR n ILIKE '%ботильон%'
      OR n ILIKE '%ботфорт%' OR n ILIKE '%берцы%' OR n ILIKE '%угг%' THEN 'boots'
    WHEN n ILIKE '%босонож%' OR n ILIKE '%сандал%'
      OR n ILIKE '%шлеп%' OR n ILIKE '%шлёп%'                     THEN 'sandals'
    WHEN n ILIKE '%туфл%' OR n ILIKE '%лофер%' OR n ILIKE '%балетк%'
      OR n ILIKE '%мокасин%' OR n ILIKE '%мюли%'                  THEN 'shoes'
    -- dress family
    WHEN n ILIKE '%платье%' OR n ILIKE '%сарафан%'                THEN 'dress'
    WHEN n ILIKE '%юбк%'                                          THEN 'skirt'
    -- bottom
    WHEN n ILIKE '%спортивн%брюк%' OR n ILIKE '%треник%'
      OR n ILIKE '%джоггер%'                                      THEN 'sporty-pants'
    WHEN n ILIKE '%шорт%'                                         THEN 'shorts'
    WHEN n ILIKE '%джинс%'                                        THEN 'jeans'
    WHEN n ILIKE '%брюк%' OR n ILIKE '%штан%'                     THEN 'pants'
    -- top
    -- 'поло' needs word boundaries: a plain LIKE '%поло%' also matches
    -- «полосатая рубашка», «брюки в полоску», «полосатый пуловер».
    -- «воротник-поло» describes a collar, not the garment — «свитер с
    -- воротником-поло» is a pullover.
    WHEN n ILIKE '%футболк%'
      OR (n ~* '(^|[^а-яёa-z])поло([^а-яёa-z]|$)'
          AND n NOT ILIKE '%воротник%')                           THEN 't-shirt'
    WHEN n ILIKE '%рубашк%'                                       THEN 'shirt'
    WHEN n ILIKE '%блузк%' OR n ILIKE '%блуза%'                   THEN 'blouse'
    WHEN n ILIKE '%лонгслив%'                                     THEN 'lonsleeve'
    WHEN n ILIKE '%водолазк%'                                     THEN 'turtleneck'
    -- same for 'боди' — without boundaries it swallows «кроссбоди сумка».
    WHEN n ILIKE '%топ%' OR n ILIKE '%майк%'
      OR n ~* '(^|[^а-яёa-z])боди([^а-яёa-z]|$)'                  THEN 'tank-top'
    -- layer
    WHEN n ILIKE '%пиджак%' OR n ILIKE '%блейзер%' OR n ILIKE '%жакет%' THEN 'suit-jacket'
    WHEN n ILIKE '%кардиган%'                                     THEN 'cardigan'
    WHEN n ILIKE '%худи%'                                         THEN 'hoodie'
    WHEN n ILIKE '%свитшот%' OR n ILIKE '%толстовк%'              THEN 'sweatshirt'
    WHEN n ILIKE '%свитер%' OR n ILIKE '%джемпер%'
      OR n ILIKE '%пуловер%' OR n ILIKE '%кофт%'                  THEN 'pullover'
    WHEN n ILIKE '%жилет%'                                        THEN 'vest'
    -- sets
    WHEN n ILIKE '%спортивн%костюм%'                              THEN 'tracksuit'
    WHEN n ILIKE '%костюм%'                                       THEN 'classic'
    ELSE NULL END AS t
  FROM (
    SELECT id, coalesce(item_name, '') AS n
    FROM wardrobe_user_items
    WHERE clothing_type IS NULL OR clothing_type = '' OR clothing_type = 'верхняя'
  ) src
) m
WHERE wardrobe_user_items.id = m.id AND m.t IS NOT NULL;
