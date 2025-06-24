-- Добавляем поле image_url в таблицу wardrobe_items
ALTER TABLE wardrobe_items 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Создаем индекс для быстрого поиска по image_url
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_image_url ON wardrobe_items(image_url);

-- Добавляем комментарий к полю
COMMENT ON COLUMN wardrobe_items.image_url IS 'URL изображения в Vercel Blob Storage';
