-- Обновление URL изображений с старого blob-хранилища на новое
-- Заменяем https://qkoy1wcphb97gms9.public.blob.vercel-storage.com 
-- на https://bgkosez9szawb1ks.public.blob.vercel-storage.com

BEGIN;

-- Обновляем таблицу wardrobe_user_items
UPDATE wardrobe_user_items 
SET image_url = REPLACE(
    image_url, 
    'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com',
    'https://bgkosez9szawb1ks.public.blob.vercel-storage.com'
)
WHERE image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%';

-- Получаем количество обновленных записей в wardrobe_user_items
SELECT 
    'wardrobe_user_items' as table_name,
    COUNT(*) as updated_records
FROM wardrobe_user_items 
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%';

-- Обновляем таблицу basic_wardrobe_items
UPDATE basic_wardrobe_items 
SET image_url = REPLACE(
    image_url, 
    'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com',
    'https://bgkosez9szawb1ks.public.blob.vercel-storage.com'
)
WHERE image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%';

-- Получаем количество обновленных записей в basic_wardrobe_items
SELECT 
    'basic_wardrobe_items' as table_name,
    COUNT(*) as updated_records
FROM basic_wardrobe_items 
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%';

-- Обновляем таблицу wardrobe_items
UPDATE wardrobe_items 
SET image_url = REPLACE(
    image_url, 
    'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com',
    'https://bgkosez9szawb1ks.public.blob.vercel-storage.com'
)
WHERE image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%';

-- Получаем количество обновленных записей в wardrobe_items
SELECT 
    'wardrobe_items' as table_name,
    COUNT(*) as updated_records
FROM wardrobe_items 
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%';

-- Проверяем, остались ли записи со старыми URL
SELECT 
    'Remaining old URLs check' as info,
    (
        SELECT COUNT(*) FROM wardrobe_user_items 
        WHERE image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%'
    ) +
    (
        SELECT COUNT(*) FROM basic_wardrobe_items 
        WHERE image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%'
    ) +
    (
        SELECT COUNT(*) FROM wardrobe_items 
        WHERE image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%'
    ) as remaining_old_urls;

-- Показываем общую статистику по всем таблицам
SELECT 
    'SUMMARY' as info,
    (
        SELECT COUNT(*) FROM wardrobe_user_items 
        WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%'
    ) as wardrobe_user_items_new_urls,
    (
        SELECT COUNT(*) FROM basic_wardrobe_items 
        WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%'
    ) as basic_wardrobe_items_new_urls,
    (
        SELECT COUNT(*) FROM wardrobe_items 
        WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%'
    ) as wardrobe_items_new_urls;

COMMIT;

-- Дополнительная проверка: показываем примеры обновленных URL
SELECT 
    'wardrobe_user_items examples' as table_name,
    id,
    item_name,
    image_url
FROM wardrobe_user_items 
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%'
LIMIT 5;

SELECT 
    'basic_wardrobe_items examples' as table_name,
    id,
    name_ru,
    image_url
FROM basic_wardrobe_items 
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%'
LIMIT 5;

SELECT 
    'wardrobe_items examples' as table_name,
    id,
    item_name,
    image_url
FROM wardrobe_items 
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%'
LIMIT 5;
