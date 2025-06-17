-- Добавляем поле is_hidden в таблицу wardrobe_items
ALTER TABLE wardrobe_items 
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;

-- Создаем индекс для быстрого поиска скрытых элементов
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_is_hidden 
ON wardrobe_items(is_hidden);

-- Комментарий к полю
COMMENT ON COLUMN wardrobe_items.is_hidden IS 'Глобальное скрытие элемента для всех пользователей';

-- Обновляем RLS политики для учета скрытых элементов
DROP POLICY IF EXISTS "Users can view their own wardrobe items" ON wardrobe_items;
CREATE POLICY "Users can view their own wardrobe items" ON wardrobe_items
    FOR SELECT USING (auth.uid() = user_id AND NOT is_hidden);

DROP POLICY IF EXISTS "Users can insert their own wardrobe items" ON wardrobe_items;
CREATE POLICY "Users can insert their own wardrobe items" ON wardrobe_items
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own wardrobe items" ON wardrobe_items;
CREATE POLICY "Users can update their own wardrobe items" ON wardrobe_items
    FOR UPDATE USING (auth.uid() = user_id AND NOT is_hidden);

DROP POLICY IF EXISTS "Users can delete their own wardrobe items" ON wardrobe_items;
CREATE POLICY "Users can delete their own wardrobe items" ON wardrobe_items
    FOR DELETE USING (auth.uid() = user_id AND NOT is_hidden);
