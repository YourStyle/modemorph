-- Создаем таблицу связи базовых вещей с материалами
CREATE TABLE IF NOT EXISTS basic_item_materials (
  id SERIAL PRIMARY KEY,
  basic_item_id INTEGER REFERENCES basic_wardrobe_items(id) ON DELETE CASCADE,
  basic_material_id INTEGER REFERENCES basic_materials(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(basic_item_id, basic_material_id)
);

-- Включаем RLS
ALTER TABLE basic_item_materials ENABLE ROW LEVEL SECURITY;

-- Создаем политики RLS
CREATE POLICY "Users can view basic item materials" ON basic_item_materials
  FOR SELECT USING (true);

CREATE POLICY "Users can insert basic item materials" ON basic_item_materials
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update basic item materials" ON basic_item_materials
  FOR UPDATE USING (true);

CREATE POLICY "Users can delete basic item materials" ON basic_item_materials
  FOR DELETE USING (true);

-- Создаем индексы для производительности
CREATE INDEX IF NOT EXISTS idx_basic_item_materials_item_id ON basic_item_materials(basic_item_id);
CREATE INDEX IF NOT EXISTS idx_basic_item_materials_material_id ON basic_item_materials(basic_material_id);
