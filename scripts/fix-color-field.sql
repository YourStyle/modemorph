-- Удаляем неправильное ограничение внешнего ключа для поля color
ALTER TABLE wardrobe_items DROP CONSTRAINT IF EXISTS wardrobe_items_color_fkey;
ALTER TABLE wardrobe_items DROP CONSTRAINT IF EXISTS fk_wardrobe_items_color;

-- Убеждаемся, что поле color имеет правильный тип (text)
ALTER TABLE wardrobe_items ALTER COLUMN color TYPE TEXT;

-- Удаляем индекс для color, если он был создан как внешний ключ
DROP INDEX IF EXISTS idx_wardrobe_items_color;

-- Проверяем и исправляем другие поля, которые могли быть неправильно связаны
-- Поле shade тоже должно быть текстовым
ALTER TABLE wardrobe_items DROP CONSTRAINT IF EXISTS wardrobe_items_shade_fkey;
ALTER TABLE wardrobe_items DROP CONSTRAINT IF EXISTS fk_wardrobe_items_shade;
ALTER TABLE wardrobe_items ALTER COLUMN shade TYPE TEXT;
DROP INDEX IF EXISTS idx_wardrobe_items_shade;

-- Поле style тоже должно быть текстовым
ALTER TABLE wardrobe_items DROP CONSTRAINT IF EXISTS wardrobe_items_style_fkey;
ALTER TABLE wardrobe_items DROP CONSTRAINT IF EXISTS fk_wardrobe_items_style;
ALTER TABLE wardrobe_items ALTER COLUMN style TYPE TEXT;
DROP INDEX IF EXISTS idx_wardrobe_items_style;

-- Поле material должно быть текстовым (не связанным с basic_materials через это поле)
ALTER TABLE wardrobe_items DROP CONSTRAINT IF EXISTS wardrobe_items_material_fkey;
ALTER TABLE wardrobe_items DROP CONSTRAINT IF EXISTS fk_wardrobe_items_material;
ALTER TABLE wardrobe_items ALTER COLUMN material TYPE TEXT;
DROP INDEX IF EXISTS idx_wardrobe_items_material;

-- Поле item_type тоже должно быть текстовым
ALTER TABLE wardrobe_items DROP CONSTRAINT IF EXISTS wardrobe_items_item_type_fkey;
ALTER TABLE wardrobe_items DROP CONSTRAINT IF EXISTS fk_wardrobe_items_item_type;
ALTER TABLE wardrobe_items ALTER COLUMN item_type TYPE TEXT;
DROP INDEX IF EXISTS idx_wardrobe_items_item_type;

-- Убеждаемся, что правильные внешние ключи существуют
-- Только basic_item_id и basic_material_id должны быть внешними ключами
ALTER TABLE wardrobe_items DROP CONSTRAINT IF EXISTS fk_basic_item_id;
ALTER TABLE wardrobe_items 
ADD CONSTRAINT fk_basic_item_id 
FOREIGN KEY (basic_item_id) 
REFERENCES basic_wardrobe_items(id) 
ON DELETE SET NULL;

ALTER TABLE wardrobe_items DROP CONSTRAINT IF EXISTS fk_basic_material_id;
ALTER TABLE wardrobe_items 
ADD CONSTRAINT fk_basic_material_id 
FOREIGN KEY (basic_material_id) 
REFERENCES basic_materials(id) 
ON DELETE SET NULL;

-- Создаем правильные индексы только для внешних ключей
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_basic_item_id ON wardrobe_items(basic_item_id);
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_basic_material_id ON wardrobe_items(basic_material_id);

-- Проверяем результат
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_name='wardrobe_items'
ORDER BY tc.table_name, kcu.column_name;
