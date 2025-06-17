-- Проверяем и исправляем RLS политики для wardrobe_items

-- Проверяем текущие политики
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

-- Проверяем включен ли RLS
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename = 'wardrobe_items';

-- Временно отключаем RLS для админских операций
ALTER TABLE wardrobe_items DISABLE ROW LEVEL SECURITY;

-- Или создаем политику для админов если RLS нужен
DO $$
BEGIN
    -- Удаляем старые политики
    DROP POLICY IF EXISTS "Admin can manage all wardrobe items" ON wardrobe_items;
    
    -- Создаем новую политику для админов
    CREATE POLICY "Admin can manage all wardrobe items"
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
    
    RAISE NOTICE 'Создана политика для админов';
END $$;

-- Включаем RLS обратно
ALTER TABLE wardrobe_items ENABLE ROW LEVEL SECURITY;

-- Проверяем финальные политики
SELECT 
    policyname, 
    cmd, 
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'wardrobe_items';

SELECT 'RLS политики обновлены для админского доступа' as status;
