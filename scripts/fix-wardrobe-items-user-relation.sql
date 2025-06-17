-- Исправляем структуру таблицы wardrobe_items для работы с пользователями

-- Сначала проверим существующую структуру таблицы
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'wardrobe_items' 
ORDER BY ordinal_position;

-- Добавляем колонку user_id если её нет
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wardrobe_items' 
        AND column_name = 'user_id'
    ) THEN
        ALTER TABLE wardrobe_items ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        
        -- Создаем индекс для производительности
        CREATE INDEX IF NOT EXISTS idx_wardrobe_items_user_id ON wardrobe_items(user_id);
        
        RAISE NOTICE 'Добавлена колонка user_id в таблицу wardrobe_items';
    ELSE
        RAISE NOTICE 'Колонка user_id уже существует в таблице wardrobe_items';
    END IF;
END $$;

-- Убедимся что колонка is_hidden существует
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wardrobe_items' 
        AND column_name = 'is_hidden'
    ) THEN
        ALTER TABLE wardrobe_items ADD COLUMN is_hidden BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Добавлена колонка is_hidden в таблицу wardrobe_items';
    ELSE
        RAISE NOTICE 'Колонка is_hidden уже существует в таблице wardrobe_items';
    END IF;
END $$;

-- Обновляем существующие записи без user_id (если есть)
-- Присваиваем их первому найденному пользователю или удаляем
DO $$
DECLARE
    first_user_id UUID;
BEGIN
    -- Находим первого пользователя
    SELECT id INTO first_user_id FROM auth.users LIMIT 1;
    
    IF first_user_id IS NOT NULL THEN
        -- Обновляем записи без user_id
        UPDATE wardrobe_items 
        SET user_id = first_user_id 
        WHERE user_id IS NULL;
        
        RAISE NOTICE 'Обновлены записи без user_id, присвоен пользователь: %', first_user_id;
    ELSE
        -- Если нет пользователей, удаляем записи без user_id
        DELETE FROM wardrobe_items WHERE user_id IS NULL;
        RAISE NOTICE 'Удалены записи без user_id (нет пользователей в системе)';
    END IF;
END $$;

-- Делаем user_id обязательным полем
ALTER TABLE wardrobe_items ALTER COLUMN user_id SET NOT NULL;

-- Обновляем is_hidden для существующих записей
UPDATE wardrobe_items SET is_hidden = FALSE WHERE is_hidden IS NULL;

-- Удаляем старые RLS политики
DROP POLICY IF EXISTS "Users can view their own wardrobe items" ON wardrobe_items;
DROP POLICY IF EXISTS "Users can insert their own wardrobe items" ON wardrobe_items;
DROP POLICY IF EXISTS "Users can update their own wardrobe items" ON wardrobe_items;
DROP POLICY IF EXISTS "Users can delete their own wardrobe items" ON wardrobe_items;
DROP POLICY IF EXISTS "Admins can view all wardrobe items" ON wardrobe_items;
DROP POLICY IF EXISTS "Admins can manage all wardrobe items" ON wardrobe_items;

-- Создаем новые RLS политики
CREATE POLICY "Users can view their own wardrobe items"
ON wardrobe_items
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own wardrobe items"
ON wardrobe_items
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own wardrobe items"
ON wardrobe_items
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own wardrobe items"
ON wardrobe_items
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Политики для админов
CREATE POLICY "Admins can view all wardrobe items"
ON wardrobe_items
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_profiles.id = auth.uid() 
        AND user_profiles.isAdmin = true
    )
);

CREATE POLICY "Admins can manage all wardrobe items"
ON wardrobe_items
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

-- Включаем RLS
ALTER TABLE wardrobe_items ENABLE ROW LEVEL SECURITY;

-- Проверяем финальную структуру
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'wardrobe_items' 
ORDER BY ordinal_position;

-- Показываем созданные политики
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual
FROM pg_policies 
WHERE tablename = 'wardrobe_items';
