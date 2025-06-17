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

-- Настраиваем безопасность (RLS)
ALTER TABLE clothing_types ENABLE ROW LEVEL SECURITY;

-- Создаем политики доступа для типов одежды
CREATE POLICY "Allow read for authenticated users" ON clothing_types
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert for authenticated users" ON clothing_types
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow update for authenticated users" ON clothing_types
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow delete for authenticated users" ON clothing_types
    FOR DELETE USING (auth.role() = 'authenticated');

-- Добавляем связь между wardrobe_items и clothing_types (если таблица wardrobe_items существует)
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'wardrobe_items'
  ) THEN
    -- Проверяем, существует ли уже колонка type_ref
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'wardrobe_items' AND column_name = 'type_ref'
    ) THEN
      ALTER TABLE wardrobe_items 
      ADD COLUMN type_ref BIGINT,
      ADD CONSTRAINT fk_type_ref 
      FOREIGN KEY (type_ref) 
      REFERENCES clothing_types(id) 
      ON DELETE SET NULL;
      
      CREATE INDEX IF NOT EXISTS idx_wardrobe_items_type_ref ON wardrobe_items(type_ref);
    END IF;
  END IF;
END $$;

-- Заполняем таблицу clothing_types начальными данными из существующих типов
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'wardrobe_items'
  ) AND EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'wardrobe_items' AND column_name = 'item_type'
  ) THEN
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
  END IF;
END $$;
