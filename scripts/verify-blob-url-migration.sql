-- Скрипт для проверки миграции URL изображений
-- Запускать после выполнения update-blob-urls-to-new-storage.sql

-- Проверяем количество записей с новыми URL в каждой таблице
SELECT 
    'NEW STORAGE URLs' as status,
    'wardrobe_user_items' as table_name,
    COUNT(*) as count
FROM wardrobe_user_items 
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%'

UNION ALL

SELECT 
    'NEW STORAGE URLs' as status,
    'basic_wardrobe_items' as table_name,
    COUNT(*) as count
FROM basic_wardrobe_items 
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%'

UNION ALL

SELECT 
    'NEW STORAGE URLs' as status,
    'wardrobe_items' as table_name,
    COUNT(*) as count
FROM wardrobe_items 
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%';

-- Проверяем, остались ли записи со старыми URL
SELECT 
    'OLD STORAGE URLs (should be 0)' as status,
    'wardrobe_user_items' as table_name,
    COUNT(*) as count
FROM wardrobe_user_items 
WHERE image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%'

UNION ALL

SELECT 
    'OLD STORAGE URLs (should be 0)' as status,
    'basic_wardrobe_items' as table_name,
    COUNT(*) as count
FROM basic_wardrobe_items 
WHERE image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%'

UNION ALL

SELECT 
    'OLD STORAGE URLs (should be 0)' as status,
    'wardrobe_items' as table_name,
    COUNT(*) as count
FROM wardrobe_items 
WHERE image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%';

-- Показываем общую статистику по всем изображениям
SELECT 
    'TOTAL IMAGES' as info,
    (
        SELECT COUNT(*) FROM wardrobe_user_items WHERE image_url IS NOT NULL AND image_url != ''
    ) as wardrobe_user_items_total,
    (
        SELECT COUNT(*) FROM basic_wardrobe_items WHERE image_url IS NOT NULL AND image_url != ''
    ) as basic_wardrobe_items_total,
    (
        SELECT COUNT(*) FROM wardrobe_items WHERE image_url IS NOT NULL AND image_url != ''
    ) as wardrobe_items_total;

-- Проверяем наличие других blob-хранилищ (если есть)
SELECT DISTINCT 
    CASE 
        WHEN image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%' THEN 'NEW STORAGE'
        WHEN image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%' THEN 'OLD STORAGE'
        WHEN image_url LIKE 'https://%.public.blob.vercel-storage.com%' THEN 'OTHER VERCEL BLOB'
        WHEN image_url LIKE 'http%' THEN 'EXTERNAL URL'
        ELSE 'OTHER'
    END as url_type,
    COUNT(*) as count
FROM (
    SELECT image_url FROM wardrobe_user_items WHERE image_url IS NOT NULL AND image_url != ''
    UNION ALL
    SELECT image_url FROM basic_wardrobe_items WHERE image_url IS NOT NULL AND image_url != ''
    UNION ALL
    SELECT image_url FROM wardrobe_items WHERE image_url IS NOT NULL AND image_url != ''
) as all_urls
GROUP BY 
    CASE 
        WHEN image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%' THEN 'NEW STORAGE'
        WHEN image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%' THEN 'OLD STORAGE'
        WHEN image_url LIKE 'https://%.public.blob.vercel-storage.com%' THEN 'OTHER VERCEL BLOB'
        WHEN image_url LIKE 'http%' THEN 'EXTERNAL URL'
        ELSE 'OTHER'
    END
ORDER BY count DESC;
