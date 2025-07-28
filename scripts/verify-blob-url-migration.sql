-- Скрипт для проверки успешности миграции URL изображений

-- Проверяем количество записей с новыми URL
SELECT 
    'NEW URLs count' as check_type,
    table_name,
    COUNT(*) as count
FROM (
    SELECT 'wardrobe_user_items' as table_name, image_url 
    FROM wardrobe_user_items 
    WHERE image_url LIKE '%bgkosez9szawb1ks.public.blob.vercel-storage.com%'
    
    UNION ALL
    
    SELECT 'basic_wardrobe_items' as table_name, image_url 
    FROM basic_wardrobe_items 
    WHERE image_url LIKE '%bgkosez9szawb1ks.public.blob.vercel-storage.com%'
    
    UNION ALL
    
    SELECT 'wardrobe_items' as table_name, image_url 
    FROM wardrobe_items 
    WHERE image_url LIKE '%bgkosez9szawb1ks.public.blob.vercel-storage.com%'
) new_urls
GROUP BY table_name;

-- Проверяем, что старых URL не осталось
SELECT 
    'OLD URLs remaining' as check_type,
    table_name,
    COUNT(*) as count
FROM (
    SELECT 'wardrobe_user_items' as table_name, image_url 
    FROM wardrobe_user_items 
    WHERE image_url LIKE '%qkoy1wcphb97gms9.public.blob.vercel-storage.com%'
    
    UNION ALL
    
    SELECT 'basic_wardrobe_items' as table_name, image_url 
    FROM basic_wardrobe_items 
    WHERE image_url LIKE '%qkoy1wcphb97gms9.public.blob.vercel-storage.com%'
    
    UNION ALL
    
    SELECT 'wardrobe_items' as table_name, image_url 
    FROM wardrobe_items 
    WHERE image_url LIKE '%qkoy1wcphb97gms9.public.blob.vercel-storage.com%'
) old_urls
GROUP BY table_name;

-- Общая статистика по изображениям
SELECT 
    'Total images' as stat_type,
    table_name,
    COUNT(*) as total_count,
    COUNT(CASE WHEN image_url IS NOT NULL AND image_url != '' THEN 1 END) as with_images
FROM (
    SELECT 'wardrobe_user_items' as table_name, image_url FROM wardrobe_user_items
    UNION ALL
    SELECT 'basic_wardrobe_items' as table_name, image_url FROM basic_wardrobe_items
    UNION ALL
    SELECT 'wardrobe_items' as table_name, image_url FROM wardrobe_items
) all_items
GROUP BY table_name;

-- Анализ всех типов URL в базе
SELECT 
    'URL analysis' as analysis_type,
    CASE 
        WHEN image_url LIKE '%bgkosez9szawb1ks.public.blob.vercel-storage.com%' THEN 'New Blob Storage'
        WHEN image_url LIKE '%qkoy1wcphb97gms9.public.blob.vercel-storage.com%' THEN 'Old Blob Storage'
        WHEN image_url LIKE '%blob.vercel-storage.com%' THEN 'Other Blob Storage'
        WHEN image_url LIKE 'http%' THEN 'External URL'
        WHEN image_url IS NULL OR image_url = '' THEN 'No Image'
        ELSE 'Other'
    END as url_type,
    COUNT(*) as count
FROM (
    SELECT image_url FROM wardrobe_user_items
    UNION ALL
    SELECT image_url FROM basic_wardrobe_items
    UNION ALL
    SELECT image_url FROM wardrobe_items
) all_urls
GROUP BY url_type
ORDER BY count DESC;
