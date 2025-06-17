-- Удаляем проблемную политику
DROP POLICY IF EXISTS "Admins can read all profiles" ON user_profiles;

-- Удаляем все существующие политики для чистоты
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;

-- Создаем простые политики без рекурсии
-- Пользователи могут читать только свой профиль
CREATE POLICY "Users can read own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = user_id);

-- Пользователи могут обновлять только свой профиль  
CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = user_id);

-- Пользователи могут создавать только свой профиль
CREATE POLICY "Users can insert own profile" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Проверяем, что политики созданы корректно
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'user_profiles';
