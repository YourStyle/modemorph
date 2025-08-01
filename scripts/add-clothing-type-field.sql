-- Добавляем поле clothing_type в таблицы wardrobe_items, wardrobe_user_items и basic_wardrobe_items

-- Добавляем поле в wardrobe_items
ALTER TABLE wardrobe_items 
ADD COLUMN IF NOT EXISTS clothing_type VARCHAR(50) DEFAULT 'верхняя';

-- Добавляем поле в wardrobe_user_items
ALTER TABLE wardrobe_user_items 
ADD COLUMN IF NOT EXISTS clothing_type VARCHAR(50) DEFAULT 'верхняя';

-- Добавляем поле в basic_wardrobe_items
ALTER TABLE basic_wardrobe_items 
ADD COLUMN IF NOT EXISTS clothing_type VARCHAR(50) DEFAULT 'верхняя';

-- Создаем индексы для быстрого поиска по типу одежды
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_clothing_type ON wardrobe_items(clothing_type);
CREATE INDEX IF NOT EXISTS idx_wardrobe_user_items_clothing_type ON wardrobe_user_items(clothing_type);
CREATE INDEX IF NOT EXISTS idx_basic_wardrobe_items_clothing_type ON basic_wardrobe_items(clothing_type);

-- Обновляем существующие записи с базовыми значениями (можно настроить по необходимости)
UPDATE wardrobe_items SET clothing_type = 'верхняя' WHERE clothing_type IS NULL;
UPDATE wardrobe_user_items SET clothing_type = 'верхняя' WHERE clothing_type IS NULL;
UPDATE basic_wardrobe_items SET clothing_type = 'верхняя' WHERE clothing_type IS NULL;
