-- Включаем RLS для таблицы weather_cache
ALTER TABLE weather_cache ENABLE ROW LEVEL SECURITY;

-- Политика для чтения: пользователи могут читать свои записи и общие записи
CREATE POLICY "Users can read their own weather cache and public cache" ON weather_cache
    FOR SELECT USING (
        auth.uid() = user_id OR user_id IS NULL
    );

-- Политика для вставки: пользователи могут создавать записи для себя
CREATE POLICY "Users can insert their own weather cache" ON weather_cache
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
    );

-- Политика для обновления: пользователи могут обновлять свои записи
CREATE POLICY "Users can update their own weather cache" ON weather_cache
    FOR UPDATE USING (
        auth.uid() = user_id
    ) WITH CHECK (
        auth.uid() = user_id
    );

-- Политика для удаления: пользователи могут удалять свои записи
CREATE POLICY "Users can delete their own weather cache" ON weather_cache
    FOR DELETE USING (
        auth.uid() = user_id
    );
