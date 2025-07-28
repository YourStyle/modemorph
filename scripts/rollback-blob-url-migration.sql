-- Скрипт для отката миграции URL изображений (если что-то пошло не так)
-- ВНИМАНИЕ: Используйте только в случае необходимости отката!

BEGIN;

-- Откатываем изменения в таблице wardrobe_user_items
UPDATE wardrobe_user_items 
SET image_url = REPLACE(
    image_url, 
    'https://bgkosez9szawb1ks.public.blob.vercel-storage.com',
    'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com'
)
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%';

-- Откатываем изменения в таблице basic_wardrobe_items
UPDATE basic_wardrobe_items 
SET image_url = REPLACE(
    image_url, 
    'https://bgkosez9szawb1ks.public.blob.vercel-storage.com',
    'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com'
)
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%';

-- Откатываем изменения в таблице wardrobe_items
UPDATE wardrobe_items 
SET image_url = REPLACE(
    image_url, 
    'https://bgkosez9szawb1ks.public.blob.vercel-storage.com',
    'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com'
)
WHERE image_url LIKE 'https://bgkosez9szawb1ks.public.blob.vercel-storage.com%';

-- Показываем результат отката
SELECT 
    'ROLLBACK COMPLETED' as status,
    (
        SELECT COUNT(*) FROM wardrobe_user_items 
        WHERE image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%'
    ) as wardrobe_user_items_old_urls,
    (
        SELECT COUNT(*) FROM basic_wardrobe_items 
        WHERE image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%'
    ) as basic_wardrobe_items_old_urls,
    (
        SELECT COUNT(*) FROM wardrobe_items 
        WHERE image_url LIKE 'https://qkoy1wcphb97gms9.public.blob.vercel-storage.com%'
    ) as wardrobe_items_old_urls;

COMMIT;
