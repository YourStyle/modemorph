-- Создаем таблицу для сочетаний
CREATE TABLE IF NOT EXISTS combinations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  combination_type TEXT NOT NULL CHECK (combination_type IN ('items', 'materials')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Создаем таблицу для элементов сочетаний
CREATE TABLE IF NOT EXISTS combination_elements (
  id BIGSERIAL PRIMARY KEY,
  combination_id BIGINT NOT NULL REFERENCES combinations(id) ON DELETE CASCADE,
  basic_item_id BIGINT REFERENCES basic_wardrobe_items(id) ON DELETE CASCADE,
  basic_material_id BIGINT REFERENCES basic_materials(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Проверяем, что указан либо basic_item_id, либо basic_material_id, но не оба
  CONSTRAINT check_element_type CHECK (
    (basic_item_id IS NOT NULL AND basic_material_id IS NULL) OR
    (basic_item_id IS NULL AND basic_material_id IS NOT NULL)
  )
);

-- Создаем индексы
CREATE INDEX IF NOT EXISTS idx_combinations_type ON combinations(combination_type);
CREATE INDEX IF NOT EXISTS idx_combination_elements_combination_id ON combination_elements(combination_id);
CREATE INDEX IF NOT EXISTS idx_combination_elements_basic_item_id ON combination_elements(basic_item_id);
CREATE INDEX IF NOT EXISTS idx_combination_elements_basic_material_id ON combination_elements(basic_material_id);

-- Настраиваем RLS
ALTER TABLE combinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE combination_elements ENABLE ROW LEVEL SECURITY;

-- Политики для combinations
CREATE POLICY "Allow read for authenticated users" ON combinations
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert for authenticated users" ON combinations
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow update for authenticated users" ON combinations
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow delete for authenticated users" ON combinations
    FOR DELETE USING (auth.role() = 'authenticated');

-- Политики для combination_elements
CREATE POLICY "Allow read for authenticated users" ON combination_elements
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert for authenticated users" ON combination_elements
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow update for authenticated users" ON combination_elements
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow delete for authenticated users" ON combination_elements
    FOR DELETE USING (auth.role() = 'authenticated');
