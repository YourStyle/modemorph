-- Удаляем поле item_type из таблицы basic_wardrobe_items
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'basic_wardrobe_items' 
        AND column_name = 'item_type'
    ) THEN
        ALTER TABLE basic_wardrobe_items DROP COLUMN item_type;
        RAISE NOTICE 'Поле item_type удалено из таблицы basic_wardrobe_items';
    ELSE
        RAISE NOTICE 'Поле item_type не найдено в таблице basic_wardrobe_items';
    END IF;
END $$;

-- Удаляем поле item_type из таблицы wardrobe_items
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'wardrobe_items' 
        AND column_name = 'item_type'
    ) THEN
        ALTER TABLE wardrobe_items DROP COLUMN item_type;
        RAISE NOTICE 'Поле item_type удалено из таблицы wardrobe_items';
    ELSE
        RAISE NOTICE 'Поле item_type не найдено в таблице wardrobe_items';
    END IF;
END $$;

-- Проверяем результат
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_name IN ('basic_wardrobe_items', 'wardrobe_items')
    AND column_name = 'item_type';

-- Если результат пустой, значит поля успешно удалены
