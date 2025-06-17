-- Создаем таблицу базовых вещей
CREATE TABLE IF NOT EXISTS basic_wardrobe_items (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Создаем индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_basic_wardrobe_items_name ON basic_wardrobe_items(name);
CREATE INDEX IF NOT EXISTS idx_basic_wardrobe_items_type ON basic_wardrobe_items(type);

-- Создаем таблицу базовых материалов
CREATE TABLE IF NOT EXISTS basic_materials (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  properties TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Создаем индекс для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_basic_materials_name ON basic_materials(name);

-- Настраиваем безопасность (RLS)
ALTER TABLE basic_wardrobe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE basic_materials ENABLE ROW LEVEL SECURITY;

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

-- Создаем индексы для внешних ключей
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_basic_item_ref ON wardrobe_items(basic_item_ref);
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_material_ref ON wardrobe_items(material_ref);
