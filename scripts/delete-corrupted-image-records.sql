-- Скрипт для удаления записей с поврежденными image_url
-- Удаляет записи где image_url содержит ошибки загрузки

BEGIN;

-- Показать количество записей с пов��ежденными URL перед удалением
SELECT 'BEFORE DELETION - Records with corrupted image_url:' as status;

SELECT 
    'wardrobe_items' as table_name,
    COUNT(*) as corrupted_count
FROM wardrobe_items 
WHERE image_url LIKE '%"success":false%' 
   OR image_url LIKE '%"error":%'
   OR image_url LIKE '%e.getAll is not a function%'
   OR image_url LIKE '%Failed to fetch%'

UNION ALL

SELECT 
    'wardrobe_user_items' as table_name,
    COUNT(*) as corrupted_count
FROM wardrobe_user_items 
WHERE image_url LIKE '%"success":false%' 
   OR image_url LIKE '%"error":%'
   OR image_url LIKE '%e.getAll is not a function%'
   OR image_url LIKE '%Failed to fetch%'

UNION ALL

SELECT 
    'basic_wardrobe_items' as table_name,
    COUNT(*) as corrupted_count
FROM basic_wardrobe_items 
WHERE image_url LIKE '%"success":false%' 
   OR image_url LIKE '%"error":%'
   OR image_url LIKE '%e.getAll is not a function%'
   OR image_url LIKE '%Failed to fetch%';

-- Показать примеры поврежденных записей
SELECT 'EXAMPLES of corrupted records:' as status;

SELECT 
    'wardrobe_items' as table_name,
    id,
    item_name,
    LEFT(image_url, 100) as corrupted_url_preview
FROM wardrobe_items 
WHERE image_url LIKE '%"success":false%' 
   OR image_url LIKE '%"error":%'
   OR image_url LIKE '%e.getAll is not a function%'
   OR image_url LIKE '%Failed to fetch%'
LIMIT 5;

SELECT 
    'wardrobe_user_items' as table_name,
    id,
    item_name,
    LEFT(image_url, 100) as corrupted_url_preview
FROM wardrobe_user_items 
WHERE image_url LIKE '%"success":false%' 
   OR image_url LIKE '%"error":%'
   OR image_url LIKE '%e.getAll is not a function%'
   OR image_url LIKE '%Failed to fetch%'
LIMIT 5;

SELECT 
    'basic_wardrobe_items' as table_name,
    id,
    name_ru,
    LEFT(image_url, 100) as corrupted_url_preview
FROM basic_wardrobe_items 
WHERE image_url LIKE '%"success":false%' 
   OR image_url LIKE '%"error":%'
   OR image_url LIKE '%e.getAll is not a function%'
   OR image_url LIKE '%Failed to fetch%'
LIMIT 5;

-- Удаление записей с поврежденными image_url из wardrobe_items
DELETE FROM wardrobe_items 
WHERE image_url LIKE '%"success":false%' 
   OR image_url LIKE '%"error":%'
   OR image_url LIKE '%e.getAll is not a function%'
   OR image_url LIKE '%Failed to fetch%';

-- Удаление записей с поврежденными image_url из wardrobe_user_items
DELETE FROM wardrobe_user_items 
WHERE image_url LIKE '%"success":false%' 
   OR image_url LIKE '%"error":%'
   OR image_url LIKE '%e.getAll is not a function%'
   OR image_url LIKE '%Failed to fetch%';

-- Удаление записей с поврежденными image_url из basic_wardrobe_items
DELETE FROM basic_wardrobe_items 
WHERE image_url LIKE '%"success":false%' 
   OR image_url LIKE '%"error":%'
   OR image_url LIKE '%e.getAll is not a function%'
   OR image_url LIKE '%Failed to fetch%';

-- Показать результаты удаления
SELECT 'AFTER DELETION - Remaining records count:' as status;

SELECT 
    'wardrobe_items' as table_name,
    COUNT(*) as total_remaining,
    COUNT(CASE WHEN image_url IS NOT NULL AND image_url != '' THEN 1 END) as with_valid_images
FROM wardrobe_items

UNION ALL

SELECT 
    'wardrobe_user_items' as table_name,
    COUNT(*) as total_remaining,
    COUNT(CASE WHEN image_url IS NOT NULL AND image_url != '' THEN 1 END) as with_valid_images
FROM wardrobe_user_items

UNION ALL

SELECT 
    'basic_wardrobe_items' as table_name,
    COUNT(*) as total_remaining,
    COUNT(CASE WHEN image_url IS NOT NULL AND image_url != '' THEN 1 END) as with_valid_images
FROM basic_wardrobe_items;

-- Проверить, что поврежденных записей больше нет
SELECT 'VERIFICATION - Should be 0 corrupted records:' as status;

SELECT 
    'wardrobe_items' as table_name,
    COUNT(*) as remaining_corrupted
FROM wardrobe_items 
WHERE image_url LIKE '%"success":false%' 
   OR image_url LIKE '%"error":%'
   OR image_url LIKE '%e.getAll is not a function%'
   OR image_url LIKE '%Failed to fetch%'

UNION ALL

SELECT 
    'wardrobe_user_items' as table_name,
    COUNT(*) as remaining_corrupted
FROM wardrobe_user_items 
WHERE image_url LIKE '%"success":false%' 
   OR image_url LIKE '%"error":%'
   OR image_url LIKE '%e.getAll is not a function%'
   OR image_url LIKE '%Failed to fetch%'

UNION ALL

SELECT 
    'basic_wardrobe_items' as table_name,
    COUNT(*) as remaining_corrupted
FROM basic_wardrobe_items 
WHERE image_url LIKE '%"success":false%' 
   OR image_url LIKE '%"error":%'
   OR image_url LIKE '%e.getAll is not a function%'
   OR image_url LIKE '%Failed to fetch%';

COMMIT;

-- Показать финальную статистику
SELECT 'FINAL CLEANUP COMPLETE' as status;
