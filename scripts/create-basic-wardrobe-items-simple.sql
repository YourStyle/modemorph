-- Создаем таблицу базовых вещей (упрощенная версия)
CREATE TABLE IF NOT EXISTS basic_wardrobe_items (
  id BIGSERIAL PRIMARY KEY,
  name_ru TEXT NOT NULL,
  name_en TEXT,
  type_id BIGINT,
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Создаем индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_basic_wardrobe_items_name_ru ON basic_wardrobe_items(name_ru);
CREATE INDEX IF NOT EXISTS idx_basic_wardrobe_items_name_en ON basic_wardrobe_items(name_en);
CREATE INDEX IF NOT EXISTS idx_basic_wardrobe_items_type_id ON basic_wardrobe_items(type_id);

-- Настраиваем безопасность (RLS)
ALTER TABLE basic_wardrobe_items ENABLE ROW LEVEL SECURITY;

-- Создаем политики доступа для базовых вещей
CREATE POLICY "Allow read for authenticated users" ON basic_wardrobe_items
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert for authenticated users" ON basic_wardrobe_items
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow update for authenticated users" ON basic_wardrobe_items
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow delete for authenticated users" ON basic_wardrobe_items
    FOR DELETE USING (auth.role() = 'authenticated');
