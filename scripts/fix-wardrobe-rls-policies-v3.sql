-- Исправляем RLS политики с правильным названием поля is_admin

-- Проверяем структуру таблицы user_profiles
SELECT 
    column_name, 
    data_type 
FROM information_schema.columns 
WHERE table_name = 'user_profiles'
ORDER BY column_name;

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

-- Создаем политику с правильным названием поля is_admin
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'user_profiles'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_profiles' 
        AND column_name = 'is_admin'
    ) THEN
        CREATE POLICY "Admin can manage all wardrobe items"
        ON wardrobe_items
        FOR ALL
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM user_profiles 
                WHERE user_profiles.id::text = auth.uid()::text
                AND user_profiles.is_admin = true
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM user_profiles 
                WHERE user_profiles.id::text = auth.uid()::text
                AND user_profiles.is_admin = true
            )
        );
        
        RAISE NOTICE 'Создана политика для админов с полем is_admin';
    ELSE
        RAISE NOTICE 'Таблица user_profiles или поле is_admin не найдены';
    END IF;
END $$;

-- Включаем RLS обратно
ALTER TABLE wardrobe_items ENABLE ROW LEVEL SECURITY;

-- Проверяем созданные политики
SELECT 
    policyname, 
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'wardrobe_items';

-- Тестируем доступ админа
SELECT 
    'Проверка админского доступа:' as test,
    EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_profiles.id::text = auth.uid()::text
        AND user_profiles.is_admin = true
    ) as is_admin_check;

SELECT 'RLS политики исправлены с правильным полем is_admin' as status;
