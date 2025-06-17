-- Создаем таблицу user_profiles если она не существует
CREATE TABLE IF NOT EXISTS user_profiles (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Добавляем RLS политики
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Политика для чтения собственного профиля
CREATE POLICY "Users can read own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = user_id);

-- Политика для обновления собственного профиля
CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = user_id);

-- Политика для админов - могут читать все профили
CREATE POLICY "Admins can read all profiles" ON user_profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_id = auth.uid() AND is_admin = true
        )
    );

-- Добавляем всех существующих пользователей как админов
INSERT INTO user_profiles (user_id, is_admin)
SELECT id, true
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_profiles WHERE user_id IS NOT NULL)
ON CONFLICT (user_id) DO UPDATE SET is_admin = true;

-- Создаем функцию для автоматического создания профиля при регистрации
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (user_id, is_admin)
    VALUES (NEW.id, false);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Создаем триггер для автоматического создания профиля
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
