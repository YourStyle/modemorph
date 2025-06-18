-- Создаем таблицу связи между базовыми вещами и материалами
CREATE TABLE IF NOT EXISTS basic_item_materials (
    id SERIAL PRIMARY KEY,
    basic_item_id INTEGER NOT NULL REFERENCES basic_wardrobe_items(id) ON DELETE CASCADE,
    basic_material_id INTEGER NOT NULL REFERENCES basic_materials(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(basic_item_id, basic_material_id)
);

-- Включаем RLS
ALTER TABLE basic_item_materials ENABLE ROW LEVEL SECURITY;

-- Создаем политику для basic_item_materials
CREATE POLICY "Users can manage basic item materials" ON basic_item_materials
    FOR ALL USING (true);

-- Создаем индексы для производительности
CREATE INDEX IF NOT EXISTS idx_basic_item_materials_item_id ON basic_item_materials(basic_item_id);
CREATE INDEX IF NOT EXISTS idx_basic_item_materials_material_id ON basic_item_materials(basic_material_id);
