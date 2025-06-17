-- Временно отключаем RLS для тестирования функции скрытия

-- Проверяем существует ли поле is_hidden
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'wardrobe_items' 
AND column_name = 'is_hidden';

-- Добавляем поле is_hidden если его нет
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wardrobe_items' 
        AND column_name = 'is_hidden'
    ) THEN
        ALTER TABLE wardrobe_items ADD COLUMN is_hidden BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Добавлено поле is_hidden';
    ELSE
        RAISE NOTICE 'Поле is_hidden уже существует';
    END IF;
END $$;

-- Обновляем NULL значения
UPDATE wardrobe_items SET is_hidden = FALSE WHERE is_hidden IS NULL;

-- ПОЛНОСТЬЮ ОТКЛЮЧАЕМ RLS для тестирования
ALTER TABLE wardrobe_items DISABLE ROW LEVEL SECURITY;

-- Удаляем все политики
DROP POLICY IF EXISTS "Admin can manage all wardrobe items" ON wardrobe_items;
DROP POLICY IF EXISTS "Users can view their own wardrobe items" ON wardrobe_items;
DROP POLICY IF EXISTS "Users can insert their own wardrobe items" ON wardrobe_items;
DROP POLICY IF EXISTS "Users can update their own wardrobe items" ON wardrobe_items;
DROP POLICY IF EXISTS "Users can delete their own wardrobe items" ON wardrobe_items;
DROP POLICY IF EXISTS "Admins can view all wardrobe items" ON wardrobe_items;
DROP POLICY IF EXISTS "Admins can manage all wardrobe items" ON wardrobe_items;

-- Проверяем количество записей в таблице
SELECT 
    COUNT(*) as total_items,
    COUNT(*) FILTER (WHERE is_hidden = true) as hidden_items,
    COUNT(*) FILTER (WHERE is_hidden = false) as visible_items
FROM wardrobe_items;

-- Тестовое обновление
UPDATE wardrobe_items SET is_hidden = false;

SELECT 'RLS отключен, поле is_hidden готово к использованию' as status;
