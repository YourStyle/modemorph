-- Создаем таблицу связей пользователей с элементами гардероба
-- Не изменяем оригинальную таблицу wardrobe_items

-- Создаем таблицу связей пользователь-гардероб
CREATE TABLE IF NOT EXISTS user_wardrobe_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    wardrobe_item_id INTEGER NOT NULL REFERENCES wardrobe_items(id) ON DELETE CASCADE,
    is_hidden BOOLEAN DEFAULT FALSE,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Уникальная связь пользователь-элемент
    UNIQUE(user_id, wardrobe_item_id)
);

-- Создаем индексы для производительности
CREATE INDEX IF NOT EXISTS idx_user_wardrobe_items_user_id ON user_wardrobe_items(user_id);
CREATE INDEX IF NOT EXISTS idx_user_wardrobe_items_wardrobe_item_id ON user_wardrobe_items(wardrobe_item_id);
CREATE INDEX IF NOT EXISTS idx_user_wardrobe_items_is_hidden ON user_wardrobe_items(is_hidden);

-- Включаем RLS
ALTER TABLE user_wardrobe_items ENABLE ROW LEVEL SECURITY;

-- RLS политики для пользователей
CREATE POLICY "Users can view their own wardrobe relations"
ON user_wardrobe_items
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own wardrobe relations"
ON user_wardrobe_items
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own wardrobe relations"
ON user_wardrobe_items
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own wardrobe relations"
ON user_wardrobe_items
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- RLS политики для админов
CREATE POLICY "Admins can view all wardrobe relations"
ON user_wardrobe_items
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_profiles.id = auth.uid() 
        AND user_profiles.isAdmin = true
    )
);

CREATE POLICY "Admins can manage all wardrobe relations"
ON user_wardrobe_items
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_profiles.id = auth.uid() 
        AND user_profiles.isAdmin = true
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_profiles.id = auth.uid() 
        AND user_profiles.isAdmin = true
    )
);

-- Создаем представление для удобного получения данных пользователя
CREATE OR REPLACE VIEW user_wardrobe_view AS
SELECT 
    uwi.id as relation_id,
    uwi.user_id,
    uwi.is_hidden,
    uwi.added_at,
    wi.*
FROM user_wardrobe_items uwi
JOIN wardrobe_items wi ON uwi.wardrobe_item_id = wi.id;

-- RLS для представления
ALTER VIEW user_wardrobe_view SET (security_invoker = true);

-- Функция для добавления элемента в гардероб пользователя
CREATE OR REPLACE FUNCTION add_item_to_user_wardrobe(
    p_user_id UUID,
    p_wardrobe_item_id INTEGER
) RETURNS UUID AS $$
DECLARE
    relation_id UUID;
BEGIN
    INSERT INTO user_wardrobe_items (user_id, wardrobe_item_id)
    VALUES (p_user_id, p_wardrobe_item_id)
    ON CONFLICT (user_id, wardrobe_item_id) DO NOTHING
    RETURNING id INTO relation_id;
    
    RETURN relation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Функция для скрытия/показа элементов пользователя
CREATE OR REPLACE FUNCTION toggle_user_wardrobe_visibility(
    p_user_id UUID,
    p_hide_all BOOLEAN DEFAULT NULL,
    p_wardrobe_item_id INTEGER DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    affected_rows INTEGER;
BEGIN
    IF p_wardrobe_item_id IS NOT NULL THEN
        -- Обновляем конкретный элемент
        UPDATE user_wardrobe_items 
        SET is_hidden = NOT is_hidden
        WHERE user_id = p_user_id AND wardrobe_item_id = p_wardrobe_item_id;
        
        GET DIAGNOSTICS affected_rows = ROW_COUNT;
    ELSIF p_hide_all IS NOT NULL THEN
        -- Обновляем все элементы пользователя
        UPDATE user_wardrobe_items 
        SET is_hidden = p_hide_all
        WHERE user_id = p_user_id;
        
        GET DIAGNOSTICS affected_rows = ROW_COUNT;
    END IF;
    
    RETURN affected_rows;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Показываем созданные объекты
SELECT 'Таблица user_wardrobe_items создана' as status;
SELECT 'Представление user_wardrobe_view создано' as status;
SELECT 'Функции для работы с гардеробом созданы' as status;
