-- Скрипт для проверки успешности миграции URL изображений

-- Проверяем количество записей с новыми URL
SELECT 
  'New URLs count' as check_type,
  'wardrobe_user_items' as table_name,
  COUNT(*) as count
FROM wardrobe_user_items 
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%'

UNION ALL

SELECT 
  'New URLs count' as check_type,
  'basic_wardrobe_items' as table_name,
  COUNT(*) as count
FROM basic_wardrobe_items 
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%'

UNION ALL

SELECT 
  'New URLs count' as check_type,
  'wardrobe_items' as table_name,
  COUNT(*) as count
FROM wardrobe_items 
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%';

-- Проверяем, что старых URL не осталось
SELECT 
  'Old URLs remaining' as check_type,
  'wardrobe_user_items' as table_name,
  COUNT(*) as count
FROM wardrobe_user_items 
WHERE image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%'

UNION ALL

SELECT 
  'Old URLs remaining' as check_type,
  'basic_wardrobe_items' as table_name,
  COUNT(*) as count
FROM basic_wardrobe_items 
WHERE image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%'

UNION ALL

SELECT 
  'Old URLs remaining' as check_type,
  'wardrobe_items' as table_name,
  COUNT(*) as count
FROM wardrobe_items 
WHERE image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%';

-- Общая статистика по изображениям
SELECT 
  'Total images' as stat_type,
  'wardrobe_user_items' as table_name,
  COUNT(*) as total_records,
  COUNT(image_url) as records_with_images,
  COUNT(CASE WHEN image_url IS NOT NULL AND image_url != '' THEN 1 END) as non_empty_images
FROM wardrobe_user_items

UNION ALL

SELECT 
  'Total images' as stat_type,
  'basic_wardrobe_items' as table_name,
  COUNT(*) as total_records,
  COUNT(image_url) as records_with_images,
  COUNT(CASE WHEN image_url IS NOT NULL AND image_url != '' THEN 1 END) as non_empty_images
FROM basic_wardrobe_items

UNION ALL

SELECT 
  'Total images' as stat_type,
  'wardrobe_items' as table_name,
  COUNT(*) as total_records,
  COUNT(image_url) as records_with_images,
  COUNT(CASE WHEN image_url IS NOT NULL AND image_url != '' THEN 1 END) as non_empty_images
FROM wardrobe_items;

-- Анализ всех типов URL в базе
SELECT 
  'URL analysis' as analysis_type,
  CASE 
    WHEN image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%' THEN 'New Blob Storage'
    WHEN image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%' THEN 'Old Blob Storage'
    WHEN image_url LIKE 'https://%' THEN 'Other HTTPS'
    WHEN image_url LIKE 'http://%' THEN 'HTTP'
    WHEN image_url IS NULL THEN 'NULL'
    WHEN image_url = '' THEN 'Empty String'
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
