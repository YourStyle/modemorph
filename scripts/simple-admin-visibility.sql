-- Простое админское управление видимостью без связей с пользователями

-- Добавляем поле is_hidden в wardrobe_items если его нет
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wardrobe_items' 
        AND column_name = 'is_hidden'
    ) THEN
        ALTER TABLE wardrobe_items ADD COLUMN is_hidden BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Добавлено поле is_hidden в таблицу wardrobe_items';
    ELSE
        RAISE NOTICE 'Поле is_hidden уже существует в таблице wardrobe_items';
    END IF;
END $$;

-- Устанавливаем значение по умолчанию для существующих записей
UPDATE wardrobe_items SET is_hidden = FALSE WHERE is_hidden IS NULL;

-- Создаем индекс для производительности
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_is_hidden ON wardrobe_items(is_hidden);

-- Показываем структуру таблицы
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'wardrobe_items' 
ORDER BY ordinal_position;

SELECT 'Поле is_hidden готово для админского управления' as status;
