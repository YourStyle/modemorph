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
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%';

-- Откатываем basic_wardrobe_items
UPDATE basic_wardrobe_items 
SET image_url = REPLACE(
  image_url, 
  'https://bgkosez9szawb1ks.public.blob.vercel-storage.com',
  'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com'
)
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%';

-- Откатываем wardrobe_items
UPDATE wardrobe_items 
SET image_url = REPLACE(
  image_url, 
  'https://bgkosez9szawb1ks.public.blob.vercel-storage.com',
  'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com'
)
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%';

-- Показываем результат отката
SELECT 'Rollback completed' as status, 
       COUNT(*) as old_urls_restored
FROM (
  SELECT image_url FROM wardrobe_user_items WHERE image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%'
  UNION ALL
  SELECT image_url FROM basic_wardrobe_items WHERE image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%'
  UNION ALL
  SELECT image_url FROM wardrobe_items WHERE image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%'
) restored_urls;

COMMIT;
