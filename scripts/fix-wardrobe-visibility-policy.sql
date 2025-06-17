-- Убедимся что у пользователей есть права на обновление поля is_hidden
-- Сначала проверим существующие политики
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'wardrobe_items';

-- Создаем или обновляем политику для обновления записей
DROP POLICY IF EXISTS "Users can update their own wardrobe items" ON wardrobe_items;

CREATE POLICY "Users can update their own wardrobe items"
ON wardrobe_items
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Убедимся что RLS включен
ALTER TABLE wardrobe_items ENABLE ROW LEVEL SECURITY;

-- Проверим что поле is_hidden существует
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wardrobe_items' 
        AND column_name = 'is_hidden'
    ) THEN
        ALTER TABLE wardrobe_items ADD COLUMN is_hidden BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Обновим существующие записи если поле было только что добавлено
UPDATE wardrobe_items SET is_hidden = FALSE WHERE is_hidden IS NULL;
