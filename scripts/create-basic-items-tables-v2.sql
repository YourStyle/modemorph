-- Создаем таблицу типов одежды
CREATE TABLE IF NOT EXISTS clothing_types (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name_ru TEXT NOT NULL,
  name_en TEXT NOT NULL,
  category TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Создаем индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_clothing_types_code ON clothing_types(code);
CREATE INDEX IF NOT EXISTS idx_clothing_types_category ON clothing_types(category);

-- Создаем таблицу базовых вещей с дополнительными полями
CREATE TABLE IF NOT EXISTS basic_wardrobe_items (
  id BIGSERIAL PRIMARY KEY,
  name_ru TEXT NOT NULL,
  name_en TEXT NOT NULL,
  type_id BIGINT REFERENCES clothing_types(id),
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Создаем индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_basic_wardrobe_items_name_ru ON basic_wardrobe_items(name_ru);
CREATE INDEX IF NOT EXISTS idx_basic_wardrobe_items_name_en ON basic_wardrobe_items(name_en);
CREATE INDEX IF NOT EXISTS idx_basic_wardrobe_items_type_id ON basic_wardrobe_items(type_id);

-- Создаем таблицу базовых материалов
CREATE TABLE IF NOT EXISTS basic_materials (
  id BIGSERIAL PRIMARY KEY,
  name_ru TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description TEXT,
  properties TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Создаем индекс для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_basic_materials_name_ru ON basic_materials(name_ru);
CREATE INDEX IF NOT EXISTS idx_basic_materials_name_en ON basic_materials(name_en);

-- Настраиваем безопасность (RLS)
ALTER TABLE clothing_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE basic_wardrobe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE basic_materials ENABLE ROW LEVEL SECURITY;

-- Создаем политики доступа для типов одежды
CREATE POLICY "Allow read for authenticated users" ON clothing_types
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert for authenticated users" ON clothing_types
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow update for authenticated users" ON clothing_types
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow delete for authenticated users" ON clothing_types
    FOR DELETE USING (auth.role() = 'authenticated');

-- Создаем политики доступа для базовых вещей
CREATE POLICY "Allow read for authenticated users" ON basic_wardrobe_items
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert for authenticated users" ON basic_wardrobe_items
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow update for authenticated users" ON basic_wardrobe_items
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow delete for authenticated users" ON basic_wardrobe_items
    FOR DELETE USING (auth.role() = 'authenticated');

-- Создаем политики доступа для базовых материалов
CREATE POLICY "Allow read for authenticated users" ON basic_materials
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert for authenticated users" ON basic_materials
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow update for authenticated users" ON basic_materials
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow delete for authenticated users" ON basic_materials
    FOR DELETE USING (auth.role() = 'authenticated');

-- Добавляем связь между wardrobe_items и basic_wardrobe_items
ALTER TABLE wardrobe_items 
ADD COLUMN IF NOT EXISTS basic_item_ref BIGINT,
ADD CONSTRAINT fk_basic_item_ref 
FOREIGN KEY (basic_item_ref) 
REFERENCES basic_wardrobe_items(id) 
ON DELETE SET NULL;

-- Добавляем связь между wardrobe_items и basic_materials
ALTER TABLE wardrobe_items 
ADD COLUMN IF NOT EXISTS material_ref BIGINT,
ADD CONSTRAINT fk_material_ref 
FOREIGN KEY (material_ref) 
REFERENCES basic_materials(id) 
ON DELETE SET NULL;

-- Добавляем связь между wardrobe_items и clothing_types
ALTER TABLE wardrobe_items 
ADD COLUMN IF NOT EXISTS type_ref BIGINT,
ADD CONSTRAINT fk_type_ref 
FOREIGN KEY (type_ref) 
REFERENCES clothing_types(id) 
ON DELETE SET NULL;

-- Создаем индексы для внешних ключей
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_basic_item_ref ON wardrobe_items(basic_item_ref);
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_material_ref ON wardrobe_items(material_ref);
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_type_ref ON wardrobe_items(type_ref);

-- Заполняем таблицу clothing_types начальными данными из существующих типов
INSERT INTO clothing_types (code, name_ru, name_en, category)
SELECT DISTINCT 
  item_type as code, 
  COALESCE(
    CASE
      WHEN item_type = 'blouse' THEN 'Блузка'
      WHEN item_type = 'lonsleeve' THEN 'Лонгслив'
      WHEN item_type = 'shirt' THEN 'Рубашка'
      WHEN item_type = 't-shirt' THEN 'Футболка'
      WHEN item_type = 'tank-top' THEN 'Майка'
      WHEN item_type = 'cardigan' THEN 'Кардиган'
      WHEN item_type = 'hoodie' THEN 'Худи'
      WHEN item_type = 'hoddie' THEN 'Худи'
      WHEN item_type = 'pullover' THEN 'Пуловер'
      WHEN item_type = 'suit-jacket' THEN 'Пиджак'
      WHEN item_type = 'sweatshirt' THEN 'Свитшот'
      WHEN item_type = 'turtleneck' THEN 'Водолазка'
      WHEN item_type = 'vest' THEN 'Жилет'
      WHEN item_type = 'dress' THEN 'Платье'
      WHEN item_type = 'skirt' THEN 'Юбка'
      WHEN item_type = 'jeans' THEN 'Джинсы'
      WHEN item_type = 'pants' THEN 'Брюки'
      WHEN item_type = 'sporty-pants' THEN 'Спортивные брюки'
      WHEN item_type = 'classic' THEN 'Классический костюм'
      WHEN item_type = 'knitted-suit' THEN 'Вязаный костюм'
      WHEN item_type = 'tracksuit' THEN 'Спортивный костюм'
      WHEN item_type = 'coat' THEN 'Пальто'
      WHEN item_type = 'fur-coat' THEN 'Шуба'
      WHEN item_type = 'fur-coat-dark-brown' THEN 'Шуба темно-коричневая'
      WHEN item_type = 'parka' THEN 'Парка'
      WHEN item_type = 'puffer-jacket' THEN 'Пуховик'
      WHEN item_type = 'sheepskin-coat' THEN 'Дубленка'
      ELSE item_type
    END, 
    item_type
  ) as name_ru,
  item_type as name_en,
  CASE
    WHEN item_type IN ('blouse', 'lonsleeve', 'shirt', 't-shirt', 'tank-top') THEN 'light-upper'
    WHEN item_type IN ('cardigan', 'hoodie', 'hoddie', 'pullover', 'suit-jacket', 'sweatshirt', 'turtleneck', 'vest') THEN 'warm-upper'
    WHEN item_type IN ('dress', 'skirt') THEN 'dresses-skirts'
    WHEN item_type IN ('jeans', 'pants', 'sporty-pants') THEN 'pants'
    WHEN item_type IN ('classic', 'knitted-suit', 'tracksuit') THEN 'sets'
    WHEN item_type IN ('coat', 'fur-coat', 'fur-coat-dark-brown', 'parka', 'puffer-jacket', 'sheepskin-coat') THEN 'outerwear'
    ELSE 'other'
  END as category
FROM wardrobe_items
WHERE item_type IS NOT NULL
ON CONFLICT (code) DO NOTHING;
