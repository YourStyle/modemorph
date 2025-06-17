-- Исправляем RLS политики с правильными типами данных

-- Проверяем типы колонок
SELECT 
    table_name,
    column_name, 
    data_type 
FROM information_schema.columns 
WHERE table_name IN ('user_profiles', 'wardrobe_items')
AND column_name IN ('id', 'user_id')
ORDER BY table_name, column_name;

-- Проверяем текущие политики
SELECT 
    policyname, 
    cmd, 
    qual
FROM pg_policies 
WHERE tablename = 'wardrobe_items';

-- Отключаем RLS временно
ALTER TABLE wardrobe_items DISABLE ROW LEVEL SECURITY;

-- Удаляем все старые политики
DO $$
BEGIN
    DROP POLICY IF EXISTS "Admin can manage all wardrobe items" ON wardrobe_items;
    DROP POLICY IF EXISTS "Users can view their own wardrobe items" ON wardrobe_items;
    DROP POLICY IF EXISTS "Users can insert their own wardrobe items" ON wardrobe_items;
    DROP POLICY IF EXISTS "Users can update their own wardrobe items" ON wardrobe_items;
    DROP POLICY IF EXISTS "Users can delete their own wardrobe items" ON wardrobe_items;
    DROP POLICY IF EXISTS "Admins can view all wardrobe items" ON wardrobe_items;
    DROP POLICY IF EXISTS "Admins can manage all wardrobe items" ON wardrobe_items;
    
    RAISE NOTICE 'Удалены старые политики';
END $$;

-- Создаем простую политику для админов без сравнения типов
DO $$
BEGIN
    -- Проверяем есть ли таблица user_profiles и колонка isAdmin
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'user_profiles'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_profiles' 
        AND column_name = 'isAdmin'
    ) THEN
        -- Создаем политику с правильным сравнением типов
        CREATE POLICY "Admin can manage all wardrobe items"
        ON wardrobe_items
        FOR ALL
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM user_profiles 
                WHERE user_profiles.id::text = auth.uid()::text
                AND user_profiles.isAdmin = true
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM user_profiles 
                WHERE user_profiles.id::text = auth.uid()::text
                AND user_profiles.isAdmin = true
            )
        );
        
        RAISE NOTICE 'Создана политика для админов с приведением типов';
    ELSE
        RAISE NOTICE 'Таблица user_profiles или колонка isAdmin не найдены';
    END IF;
END $$;

-- Включаем RLS обратно
ALTER TABLE wardrobe_items ENABLE ROW LEVEL SECURITY;

-- Альтернативно - можно полностью отключить RLS для упрощения
-- ALTER TABLE wardrobe_items DISABLE ROW LEVEL SECURITY;
-- SELECT 'RLS отключен для wardrobe_items' as status;

-- Проверяем финальное состояние
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename = 'wardrobe_items';

SELECT 
    policyname, 
    cmd
FROM pg_policies 
WHERE tablename = 'wardrobe_items';

SELECT 'RLS политики исправлены' as status;
