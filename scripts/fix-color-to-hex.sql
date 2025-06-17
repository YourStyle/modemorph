-- Диагностика: проверяем все ограничения в таблице wardrobe_items
SELECT 
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint 
WHERE conrelid = 'wardrobe_items'::regclass;

-- Проверяем текущие значения в поле color
SELECT color, COUNT(*) as count
FROM wardrobe_items 
WHERE color IS NOT NULL
GROUP BY color
ORDER BY count DESC;

-- Удаляем все неправильные ограничения и связи
ALTER TABLE wardrobe_items DROP CONSTRAINT IF EXISTS wardrobe_items_color_check;
ALTER TABLE wardrobe_items DROP CONSTRAINT IF EXISTS wardrobe_items_color_unique;
ALTER TABLE wardrobe_items DROP CONSTRAINT IF EXISTS color_id_constraint;
ALTER TABLE wardrobe_items DROP CONSTRAINT IF EXISTS color_material_constraint;

-- Удаляем неправильные индексы
DROP INDEX IF EXISTS idx_wardrobe_items_color_id;
DROP INDEX IF EXISTS idx_wardrobe_items_color_material;
DROP INDEX IF EXISTS idx_color_id_relationship;
DROP INDEX IF EXISTS idx_color_material_relationship;

-- Удаляем проблемные триггеры
DROP TRIGGER IF EXISTS color_id_trigger ON wardrobe_items;
DROP TRIGGER IF EXISTS color_material_trigger ON wardrobe_items;

-- Создаем резервную копию
CREATE TABLE IF NOT EXISTS wardrobe_items_backup AS 
SELECT * FROM wardrobe_items;

-- Конвертируем текстовые названия цветов и числовые ID в hex формат
UPDATE wardrobe_items 
SET color = CASE 
    -- Числовые ID в hex
    WHEN color = '1' THEN '#000000'  -- черный
    WHEN color = '2' THEN '#FFFFFF'  -- белый
    WHEN color = '3' THEN '#808080'  -- серый
    WHEN color = '4' THEN '#0000FF'  -- синий
    WHEN color = '5' THEN '#FF0000'  -- красный
    WHEN color = '6' THEN '#008000'  -- зеленый
    WHEN color = '7' THEN '#FFFF00'  -- желтый
    WHEN color = '8' THEN '#8B4513'  -- коричневый
    WHEN color = '9' THEN '#FFC0CB'  -- розовый
    WHEN color = '10' THEN '#800080' -- фиолетовый
    
    -- Русские названия в hex
    WHEN LOWER(color) = 'черный' THEN '#000000'
    WHEN LOWER(color) = 'белый' THEN '#FFFFFF'
    WHEN LOWER(color) = 'серый' THEN '#808080'
    WHEN LOWER(color) = 'синий' THEN '#0000FF'
    WHEN LOWER(color) = 'красный' THEN '#FF0000'
    WHEN LOWER(color) = 'зеленый' THEN '#008000'
    WHEN LOWER(color) = 'желтый' THEN '#FFFF00'
    WHEN LOWER(color) = 'коричневый' THEN '#8B4513'
    WHEN LOWER(color) = 'розовый' THEN '#FFC0CB'
    WHEN LOWER(color) = 'фиолетовый' THEN '#800080'
    WHEN LOWER(color) = 'оранжевый' THEN '#FFA500'
    WHEN LOWER(color) = 'голубой' THEN '#87CEEB'
    WHEN LOWER(color) = 'бежевый' THEN '#F5F5DC'
    WHEN LOWER(color) = 'золотой' THEN '#FFD700'
    WHEN LOWER(color) = 'серебряный' THEN '#C0C0C0'
    
    -- Английские названия в hex
    WHEN LOWER(color) = 'black' THEN '#000000'
    WHEN LOWER(color) = 'white' THEN '#FFFFFF'
    WHEN LOWER(color) = 'gray' OR LOWER(color) = 'grey' THEN '#808080'
    WHEN LOWER(color) = 'blue' THEN '#0000FF'
    WHEN LOWER(color) = 'red' THEN '#FF0000'
    WHEN LOWER(color) = 'green' THEN '#008000'
    WHEN LOWER(color) = 'yellow' THEN '#FFFF00'
    WHEN LOWER(color) = 'brown' THEN '#8B4513'
    WHEN LOWER(color) = 'pink' THEN '#FFC0CB'
    WHEN LOWER(color) = 'purple' THEN '#800080'
    WHEN LOWER(color) = 'orange' THEN '#FFA500'
    WHEN LOWER(color) = 'navy' THEN '#000080'
    WHEN LOWER(color) = 'beige' THEN '#F5F5DC'
    WHEN LOWER(color) = 'gold' THEN '#FFD700'
    WHEN LOWER(color) = 'silver' THEN '#C0C0C0'
    
    -- Если уже hex формат, оставляем как есть
    WHEN color ~ '^#[0-9A-Fa-f]{6}$' THEN color
    
    -- По умолчанию серый для неизвестных цветов
    ELSE '#808080'
END
WHERE color IS NOT NULL;

-- Добавляем ограничение для проверки hex формата
ALTER TABLE wardrobe_items 
ADD CONSTRAINT color_hex_format_check 
CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');

-- Проверяем результат
SELECT 
    color, 
    COUNT(*) as count,
    CASE 
        WHEN color ~ '^#[0-9A-Fa-f]{6}$' THEN 'Valid HEX'
        ELSE 'Invalid Format'
    END as format_status
FROM wardrobe_items 
WHERE color IS NOT NULL
GROUP BY color
ORDER BY count DESC;

-- Финальная проверка
SELECT 
    'Total items' as metric,
    COUNT(*) as value
FROM wardrobe_items

UNION ALL

SELECT 
    'Items with color' as metric,
    COUNT(*) as value
FROM wardrobe_items 
WHERE color IS NOT NULL

UNION ALL

SELECT 
    'Valid HEX colors' as metric,
    COUNT(*) as value
FROM wardrobe_items 
WHERE color ~ '^#[0-9A-Fa-f]{6}$';
