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
WHERE image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%';

-- Получаем количество обновленных записей в wardrobe_user_items
SELECT 'wardrobe_user_items' as table_name, COUNT(*) as updated_count
FROM wardrobe_user_items 
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%';

-- Обновляем basic_wardrobe_items
UPDATE basic_wardrobe_items 
SET image_url = REPLACE(
  image_url, 
  'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com',
  'https://bgkosez9szawb1ks.public.blob.vercel-storage.com'
)
WHERE image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%';

-- Получаем количество обновленных записей в basic_wardrobe_items
SELECT 'basic_wardrobe_items' as table_name, COUNT(*) as updated_count
FROM basic_wardrobe_items 
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%';

-- Обновляем wardrobe_items
UPDATE wardrobe_items 
SET image_url = REPLACE(
  image_url, 
  'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com',
  'https://bgkosez9szawb1ks.public.blob.vercel-storage.com'
)
WHERE image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%';

-- Получаем количество обновленных записей в wardrobe_items
SELECT 'wardrobe_items' as table_name, COUNT(*) as updated_count
FROM wardrobe_items 
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%';

-- Проверяем, что старых URL больше нет
SELECT 
  'Remaining old URLs check' as check_name,
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

-- Показываем примеры обновленных записей
SELECT 'wardrobe_user_items examples' as table_name, id, image_url 
FROM wardrobe_user_items 
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%' 
LIMIT 3;

SELECT 'basic_wardrobe_items examples' as table_name, id, image_url 
FROM basic_wardrobe_items 
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%' 
LIMIT 3;

SELECT 'wardrobe_items examples' as table_name, id, image_url 
FROM wardrobe_items 
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%' 
LIMIT 3;

COMMIT;
