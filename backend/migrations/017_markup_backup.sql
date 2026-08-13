-- 017: снимок изменяемых колонок перед массовой переразметкой каталога.
-- Восстановление: UPDATE wardrobe_items w SET color=b.color, ... FROM
-- wardrobe_items_markup_backup_20260813 b WHERE w.id=b.id;
-- Идемпотентна: IF NOT EXISTS, повторный прогон ничего не делает.

CREATE TABLE IF NOT EXISTS wardrobe_items_markup_backup_20260813 AS
SELECT id, color, shade, material, gender, clothing_type, style,
       is_kids, is_hidden, temp_min, temp_max, updated_at
FROM wardrobe_items;
