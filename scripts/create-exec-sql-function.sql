-- Создаем функцию для выполнения произвольного SQL-кода
-- ВНИМАНИЕ: Эта функция потенциально опасна, так как позволяет выполнять любой SQL-код
-- Используйте ее только для миграций и только с проверенным кодом
CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS void AS $$
BEGIN
  EXECUTE sql;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Настраиваем права доступа к функции
REVOKE ALL ON FUNCTION exec_sql(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION exec_sql(text) TO authenticated;
