-- Обновление URL изображений с старого blob-хранилища на новое
-- Заменяем https://qkoy1wcphb97gms9.public.blob.vercel-storage.com 
-- на https://bgkosez9szawb1ks.public.blob.vercel-storage.com

BEGIN;

-- Обновляем wardrobe_user_items
UPDATE wardrobe_user_items 
SET image_url = REPLACE(
    image_url, 
    'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com',
    'https://bgkosez9szawb1ks.public.blob.vercel-storage.com'
)
WHERE image_url LIKE '%qkoy1wcphb97gms9.public.blob.vercel-storage.com%';

-- Обновляем basic_wardrobe_items
UPDATE basic_wardrobe_items 
SET image_url = REPLACE(
    image_url, 
    'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com',
    'https://bgkosez9szawb1ks.public.blob.vercel-storage.com'
)
WHERE image_url LIKE '%qkoy1wcphb97gms9.public.blob.vercel-storage.com%';

-- Обновляем wardrobe_items
UPDATE wardrobe_items 
SET image_url = REPLACE(
    image_url, 
    'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com',
    'https://bgkosez9szawb1ks.public.blob.vercel-storage.com'
)
WHERE image_url LIKE '%qkoy1wcphb97gms9.public.blob.vercel-storage.com%';

-- Показываем статистику обновлений
SELECT 
    'wardrobe_user_items' as table_name,
    COUNT(*) as updated_count
FROM wardrobe_user_items 
WHERE image_url LIKE '%bgkosez9szawb1ks.public.blob.vercel-storage.com%'

UNION ALL

SELECT 
    'basic_wardrobe_items' as table_name,
    COUNT(*) as updated_count
FROM basic_wardrobe_items 
WHERE image_url LIKE '%bgkosez9szawb1ks.public.blob.vercel-storage.com%'

UNION ALL

SELECT 
    'wardrobe_items' as table_name,
    COUNT(*) as updated_count
FROM wardrobe_items 
WHERE image_url LIKE '%bgkosez9szawb1ks.public.blob.vercel-storage.com%';

-- Проверяем, что старых URL не осталось
SELECT 
    'OLD URLs remaining' as check_type,
    COUNT(*) as count
FROM (
    SELECT image_url FROM wardrobe_user_items WHERE image_url LIKE '%qkoy1wcphb97gms9.public.blob.vercel-storage.com%'
    UNION ALL
    SELECT image_url FROM basic_wardrobe_items WHERE image_url LIKE '%qkoy1wcphb97gms9.public.blob.vercel-storage.com%'
    UNION ALL
    SELECT image_url FROM wardrobe_items WHERE image_url LIKE '%qkoy1wcphb97gms9.public.blob.vercel-storage.com%'
) old_urls;

-- Показываем примеры обновленных записей
SELECT 
    'wardrobe_user_items' as table_name,
    id,
    item_name,
    image_url
FROM wardrobe_user_items 
WHERE image_url LIKE '%bgkosez9szawb1ks.public.blob.vercel-storage.com%'
LIMIT 3;

COMMIT;
