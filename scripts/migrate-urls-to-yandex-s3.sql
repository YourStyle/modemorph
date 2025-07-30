-- Миграция всех blob URL на Yandex S3
-- Заменяем все варианты blob.vercel-storage.com на storage.yandexcloud.net/modemorphs3

BEGIN;

-- Обновляем wardrobe_items
UPDATE wardrobe_items 
SET image_url = REGEXP_REPLACE(
    image_url, 
    'https://[a-zA-Z0-9]+\.public\.blob\.vercel-storage\.com',
    'https://storage.yandexcloud.net/modemorphs3',
    'g'
)
WHERE image_url LIKE '%.public.blob.vercel-storage.com%';

-- Обновляем wardrobe_user_items
UPDATE wardrobe_user_items 
SET image_url = REGEXP_REPLACE(
    image_url, 
    'https://[a-zA-Z0-9]+\.public\.blob\.vercel-storage\.com',
    'https://storage.yandexcloud.net/modemorphs3',
    'g'
)
WHERE image_url LIKE '%.public.blob.vercel-storage.com%';

-- Обновляем basic_wardrobe_items
UPDATE basic_wardrobe_items 
SET image_url = REGEXP_REPLACE(
    image_url, 
    'https://[a-zA-Z0-9]+\.public\.blob\.vercel-storage\.com',
    'https://storage.yandexcloud.net/modemorphs3',
    'g'
)
WHERE image_url LIKE '%.public.blob.vercel-storage.com%';

COMMIT;

-- Показываем статистику обновлений (выполнить отдельно после коммита)
SELECT 
    'wardrobe_items' as table_name,
    COUNT(*) as updated_count
FROM wardrobe_items 
WHERE image_url LIKE '%storage.yandexcloud.net/modemorphs3%'

UNION ALL

SELECT 
    'wardrobe_user_items' as table_name,
    COUNT(*) as updated_count
FROM wardrobe_user_items 
WHERE image_url LIKE '%storage.yandexcloud.net/modemorphs3%'

UNION ALL

SELECT 
    'basic_wardrobe_items' as table_name,
    COUNT(*) as updated_count
FROM basic_wardrobe_items 
WHERE image_url LIKE '%storage.yandexcloud.net/modemorphs3%';

-- Проверяем, что старых URL не осталось
SELECT 
    'OLD blob URLs remaining' as check_type,
    COUNT(*) as count
FROM (
    SELECT image_url FROM wardrobe_items WHERE image_url LIKE '%.blob.vercel-storage.com%'
    UNION ALL
    SELECT image_url FROM wardrobe_user_items WHERE image_url LIKE '%.blob.vercel-storage.com%'
    UNION ALL
    SELECT image_url FROM basic_wardrobe_items WHERE image_url LIKE '%.blob.vercel-storage.com%'
) old_urls;

-- Показываем примеры обновленных записей из wardrobe_items
SELECT 
    'wardrobe_items' as table_name,
    id,
    item_name,
    image_url
FROM wardrobe_items 
WHERE image_url LIKE '%storage.yandexcloud.net/modemorphs3%'
LIMIT 3;

-- Показываем примеры обновленных записей из wardrobe_user_items
SELECT 
    'wardrobe_user_items' as table_name,
    id::text,
    item_name,
    image_url
FROM wardrobe_user_items 
WHERE image_url LIKE '%storage.yandexcloud.net/modemorphs3%'
LIMIT 3;

-- Показываем примеры обновленных записей из basic_wardrobe_items
SELECT 
    'basic_wardrobe_items' as table_name,
    id::text,
    name_ru,
    image_url
FROM basic_wardrobe_items 
WHERE image_url LIKE '%storage.yandexcloud.net/modemorphs3%'
LIMIT 3;
