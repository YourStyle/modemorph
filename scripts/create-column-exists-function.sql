-- Создаем функцию для проверки существования колонки в таблице
CREATE OR REPLACE FUNCTION column_exists(table_name text, column_name text)
RETURNS boolean AS $$
DECLARE
  exists_bool boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = $1
    AND column_name = $2
  ) INTO exists_bool;
  
  RETURN exists_bool;
END;
$$ LANGUAGE plpgsql;
