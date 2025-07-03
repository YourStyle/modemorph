-- Добавляем новые поля в таблицу wardrobe_items
ALTER TABLE wardrobe_items 
ADD COLUMN IF NOT EXISTS is_basic BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS basic_item_id BIGINT,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Добавляем внешний ключ для связи с базовыми вещами
ALTER TABLE wardrobe_items
ADD CONSTRAINT fk_basic_item
FOREIGN KEY (basic_item_id) 
REFERENCES wardrobe_items(id)
ON DELETE SET NULL;

-- Создаем индекс для быстрого поиска базовых вещей
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_is_basic ON wardrobe_items(is_basic);
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_basic_item_id ON wardrobe_items(basic_item_id);
