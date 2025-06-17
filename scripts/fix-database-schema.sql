-- Удаляем таблицу clothing_types и связанные поля
DROP TABLE IF EXISTS clothing_types CASCADE;

-- Удаляем поле type_ref из wardrobe_items
ALTER TABLE wardrobe_items DROP COLUMN IF EXISTS type_ref;

-- Добавляем поле image_url в basic_wardrobe_items, если его нет
ALTER TABLE basic_wardrobe_items ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Добавляем поле image_url в basic_materials, если его нет
ALTER TABLE basic_materials ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Переименовываем поле name в basic_wardrobe_items в name_ru, если нужно
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'basic_wardrobe_items' AND column_name = 'name') THEN
        ALTER TABLE basic_wardrobe_items RENAME COLUMN name TO name_ru;
    END IF;
END $$;

-- Добавляем поле name_en в basic_wardrobe_items, если его нет
ALTER TABLE basic_wardrobe_items ADD COLUMN IF NOT EXISTS name_en TEXT;

-- Переименовываем поле type в basic_wardrobe_items в item_type, если нужно
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'basic_wardrobe_items' AND column_name = 'type') THEN
        ALTER TABLE basic_wardrobe_items RENAME COLUMN type TO item_type;
    END IF;
END $$;

-- Переименовываем поле name в basic_materials в name_ru, если нужно
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'basic_materials' AND column_name = 'name') THEN
        ALTER TABLE basic_materials RENAME COLUMN name TO name_ru;
    END IF;
END $$;

-- Добавляем поле name_en в basic_materials, если его нет
ALTER TABLE basic_materials ADD COLUMN IF NOT EXISTS name_en TEXT;

-- Исправляем связь basic_item_id в wardrobe_items
-- Сначала удаляем старое ограничение, если оно есть
ALTER TABLE wardrobe_items DROP CONSTRAINT IF EXISTS fk_basic_item_id;

-- Добавляем правильное ограничение внешнего ключа
ALTER TABLE wardrobe_items 
ADD CONSTRAINT fk_basic_item_id 
FOREIGN KEY (basic_item_id) 
REFERENCES basic_wardrobe_items(id) 
ON DELETE SET NULL;

-- Переименовываем basic_item_ref в basic_item_id, если нужно
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wardrobe_items' AND column_name = 'basic_item_ref') THEN
        -- Если basic_item_id уже существует, удаляем basic_item_ref
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wardrobe_items' AND column_name = 'basic_item_id') THEN
            ALTER TABLE wardrobe_items DROP COLUMN basic_item_ref;
        ELSE
            ALTER TABLE wardrobe_items RENAME COLUMN basic_item_ref TO basic_item_id;
        END IF;
    END IF;
END $$;

-- Добавляем поле basic_material_id в wardrobe_items, если его нет
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS basic_material_id BIGINT;

-- Переименовываем material_ref в basic_material_id, если нужно
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wardrobe_items' AND column_name = 'material_ref') THEN
        -- Если basic_material_id уже существует, копируем данные и удаляем material_ref
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wardrobe_items' AND column_name = 'basic_material_id') THEN
            UPDATE wardrobe_items SET basic_material_id = material_ref WHERE material_ref IS NOT NULL;
            ALTER TABLE wardrobe_items DROP COLUMN material_ref;
        ELSE
            ALTER TABLE wardrobe_items RENAME COLUMN material_ref TO basic_material_id;
        END IF;
    END IF;
END $$;

-- Добавляем ограничение внешнего ключа для basic_material_id
ALTER TABLE wardrobe_items DROP CONSTRAINT IF EXISTS fk_basic_material_id;
ALTER TABLE wardrobe_items 
ADD CONSTRAINT fk_basic_material_id 
FOREIGN KEY (basic_material_id) 
REFERENCES basic_materials(id) 
ON DELETE SET NULL;

-- Создаем индексы для внешних ключей
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_basic_item_id ON wardrobe_items(basic_item_id);
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_basic_material_id ON wardrobe_items(basic_material_id);

-- Добавляем некоторые базовые типы одежды в basic_wardrobe_items, если таблица пустая
INSERT INTO basic_wardrobe_items (name_ru, name_en, item_type, description)
SELECT * FROM (VALUES
    ('Футболка', 'T-shirt', 't-shirt', 'Базовая футболка'),
    ('Рубашка', 'Shirt', 'shirt', 'Классическая рубашка'),
    ('Джинсы', 'Jeans', 'jeans', 'Джинсовые брюки'),
    ('Платье', 'Dress', 'dress', 'Женское платье'),
    ('Куртка', 'Jacket', 'jacket', 'Верхняя одежда'),
    ('Свитер', 'Sweater', 'sweater', 'Теплый свитер'),
    ('Юбка', 'Skirt', 'skirt', 'Женская юбка'),
    ('Брюки', 'Pants', 'pants', 'Классические брюки')
) AS v(name_ru, name_en, item_type, description)
WHERE NOT EXISTS (SELECT 1 FROM basic_wardrobe_items LIMIT 1);

-- Добавляем некоторые базовые материалы, если таблица пустая
INSERT INTO basic_materials (name_ru, name_en, description, properties)
SELECT * FROM (VALUES
    ('Хлопок', 'Cotton', 'Натуральное волокно', 'Дышащий, мягкий, гипоаллергенный'),
    ('Шерсть', 'Wool', 'Натуральное животное волокно', 'Теплый, влагоотводящий'),
    ('Шелк', 'Silk', 'Натуральное волокно', 'Гладкий, блестящий, элегантный'),
    ('Лен', 'Linen', 'Натуральное растительное волокно', 'Прочный, дышащий'),
    ('Полиэстер', 'Polyester', 'Синтетическое волокно', 'Прочный, быстросохнущий'),
    ('Деним', 'Denim', 'Хлопковая ткань', 'Прочный, износостойкий'),
    ('Кашемир', 'Cashmere', 'Премиальная шерсть', 'Мягкий, теплый, роскошный'),
    ('Вискоза', 'Viscose', 'Полусинтетическое волокно', 'Мягкий, драпируемый')
) AS v(name_ru, name_en, description, properties)
WHERE NOT EXISTS (SELECT 1 FROM basic_materials LIMIT 1);
