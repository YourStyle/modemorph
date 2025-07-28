-- Скрипт для отката миграции URL изображений
-- ВНИМАНИЕ: Используйте только если нужно откатить изменения!

BEGIN;

-- Откатываем wardrobe_user_items
UPDATE wardrobe_user_items 
SET image_url = REPLACE(
  image_url, 
  'https://bgkosez9szawb1ks.public.blob.vercel-storage.com',
  'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com'
)
WHERE image_url LIKE '%bgkosez9szawb1ks.public.blob.vercel-storage.com%';

-- Откатываем basic_wardrobe_items
UPDATE basic_wardrobe_items 
SET image_url = REPLACE(
  image_url, 
  'https://bgkosez9szawb1ks.public.blob.vercel-storage.com',
  'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com'
)
WHERE image_url LIKE '%bgkosez9szawb1ks.public.blob.vercel-storage.com%';

-- Откатываем wardrobe_items
UPDATE wardrobe_items 
SET image_url = REPLACE(
  image_url, 
  'https://bgkosez9szawb1ks.public.blob.vercel-storage.com',
  'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com'
)
WHERE image_url LIKE '%bgkosez9szawb1ks.public.blob.vercel-storage.com%';

-- Показываем результат отката
SELECT 
    'ROLLBACK RESULT' as action,
    'wardrobe_user_items' as table_name,
    COUNT(*) as old_urls_restored
FROM wardrobe_user_items 
WHERE image_url LIKE '%qkoy1wcphb97gms9.public.blob.vercel-storage.com%'

UNION ALL

SELECT 
    'ROLLBACK RESULT' as action,
    'basic_wardrobe_items' as table_name,
    COUNT(*) as old_urls_restored
FROM basic_wardrobe_items 
WHERE image_url LIKE '%qkoy1wcphb97gms9.public.blob.vercel-storage.com%'

UNION ALL

SELECT 
    'ROLLBACK RESULT' as action,
    'wardrobe_items' as table_name,
    COUNT(*) as old_urls_restored
FROM wardrobe_items 
WHERE image_url LIKE '%qkoy1wcphb97gms9.public.blob.vercel-storage.com%';

COMMIT;
