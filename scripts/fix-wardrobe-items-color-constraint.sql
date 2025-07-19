-- Удаляем старое ограничение на цвет если оно существует
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'color_hex_format_check' 
        AND table_name = 'wardrobe_items'
    ) THEN
        ALTER TABLE wardrobe_items DROP CONSTRAINT color_hex_format_check;
    END IF;
END $$;

-- Добавляем новое гибкое ограничение для HEX цветов
ALTER TABLE wardrobe_items 
ADD CONSTRAINT color_hex_format_check 
CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');

-- Обновляем существующие записи с некорректными цветами на серый по умолчанию
UPDATE wardrobe_items 
SET color = '#808080' 
WHERE color IS NOT NULL 
AND NOT (color ~ '^#[0-9A-Fa-f]{6}$');

-- Добавляем комментарий к ограничению
COMMENT ON CONSTRAINT color_hex_format_check ON wardrobe_items 
IS 'Цвет должен быть в формате HEX (#RRGGBB) или NULL';
