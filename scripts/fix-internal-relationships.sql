-- Диагностика: проверяем все ограничения в таблице wardrobe_items
SELECT 
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint 
WHERE conrelid = 'wardrobe_items'::regclass;

-- Проверяем индексы
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'wardrobe_items';

-- Проверяем структуру таблицы
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'wardrobe_items'
ORDER BY ordinal_position;

-- Удаляем все неправильные ограничения CHECK или UNIQUE, которые могли создать связи
ALTER TABLE wardrobe_items DROP CONSTRAINT IF EXISTS wardrobe_items_color_check;
ALTER TABLE wardrobe_items DROP CONSTRAINT IF EXISTS wardrobe_items_color_unique;
ALTER TABLE wardrobe_items DROP CONSTRAINT IF EXISTS color_id_constraint;
ALTER TABLE wardrobe_items DROP CONSTRAINT IF EXISTS color_material_constraint;

-- Удаляем неправильные индексы, которые могли создать связи
DROP INDEX IF EXISTS idx_wardrobe_items_color_id;
DROP INDEX IF EXISTS idx_wardrobe_items_color_material;
DROP INDEX IF EXISTS idx_color_id_relationship;
DROP INDEX IF EXISTS idx_color_material_relationship;

-- Проверяем, нет ли триггеров, которые могли создать эти связи
SELECT 
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'wardrobe_items';

-- Удаляем возможные проблемные триггеры
DROP TRIGGER IF EXISTS color_id_trigger ON wardrobe_items;
DROP TRIGGER IF EXISTS color_material_trigger ON wardrobe_items;

-- Убеждаемся, что поле color имеет правильный тип и не имеет ограничений
ALTER TABLE wardrobe_items ALTER COLUMN color DROP NOT NULL;
ALTER TABLE wardrobe_items ALTER COLUMN color DROP DEFAULT;
ALTER TABLE wardrobe_items ALTER COLUMN color TYPE TEXT;

-- Проверяем данные в поле color - возможно там записаны ID вместо названий цветов
SELECT DISTINCT color, COUNT(*) as count
FROM wardrobe_items 
WHERE color IS NOT NULL
GROUP BY color
ORDER BY count DESC
LIMIT 20;

-- Если в поле color записаны числа (ID), то нужно их исправить
-- Сначала проверим, есть ли числовые значения
SELECT color, COUNT(*) 
FROM wardrobe_items 
WHERE color ~ '^[0-9]+$'  -- регулярное выражение для проверки, что строка содержит только цифры
GROUP BY color;

-- Создаем резервную копию данных перед исправлением
CREATE TABLE IF NOT EXISTS wardrobe_items_backup AS 
SELECT * FROM wardrobe_items;

-- Исправляем числовые значения в поле color на реальные названия цветов
UPDATE wardrobe_items 
SET color = CASE 
    WHEN color = '1' THEN 'черный'
    WHEN color = '2' THEN 'белый'
    WHEN color = '3' THEN 'серый'
    WHEN color = '4' THEN 'синий'
    WHEN color = '5' THEN 'красный'
    WHEN color = '6' THEN 'зеленый'
    WHEN color = '7' THEN 'желтый'
    WHEN color = '8' THEN 'коричневый'
    WHEN color = '9' THEN 'розовый'
    WHEN color = '10' THEN 'фиолетовый'
    ELSE color  -- оставляем как есть, если это не число от 1 до 10
END
WHERE color ~ '^[0-9]+$';

-- Финальная проверка структуры
SELECT 
    'Constraint Check' as check_type,
    COUNT(*) as count
FROM pg_constraint 
WHERE conrelid = 'wardrobe_items'::regclass
    AND contype NOT IN ('f', 'p')  -- исключаем foreign key и primary key

UNION ALL

SELECT 
    'Color Values Check' as check_type,
    COUNT(DISTINCT color) as count
FROM wardrobe_items 
WHERE color IS NOT NULL;
