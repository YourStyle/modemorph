-- Добавляем поля аналитики к таблице outfits
ALTER TABLE outfits 
ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS favorites_count INTEGER DEFAULT 0;

-- Обновляем существующие записи, устанавливая значения по умолчанию
UPDATE outfits 
SET views_count = 0 
WHERE views_count IS NULL;

UPDATE outfits 
SET favorites_count = 0 
WHERE favorites_count IS NULL;

-- Добавляем индексы для лучшей производительности
CREATE INDEX IF NOT EXISTS idx_outfits_views_count ON outfits(views_count);
CREATE INDEX IF NOT EXISTS idx_outfits_favorites_count ON outfits(favorites_count);
CREATE INDEX IF NOT EXISTS idx_outfits_likes ON outfits(likes);

-- Комментарии к полям
COMMENT ON COLUMN outfits.views_count IS 'Количество просмотров образа';
COMMENT ON COLUMN outfits.favorites_count IS 'Количество добавлений в избранное';
COMMENT ON COLUMN outfits.likes IS 'Количество лайков образа';
