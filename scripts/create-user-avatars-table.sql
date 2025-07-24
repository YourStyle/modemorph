-- Создание таблицы для аватаров пользователей
CREATE TABLE IF NOT EXISTS user_avatars (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_user_avatars_user_id ON user_avatars(user_id);
CREATE INDEX IF NOT EXISTS idx_user_avatars_active ON user_avatars(user_id, is_active) WHERE is_active = true;

-- RLS политики
ALTER TABLE user_avatars ENABLE ROW LEVEL SECURITY;

-- Пользователи могут видеть только свои аватары
CREATE POLICY "Users can view own avatars" ON user_avatars
  FOR SELECT USING (auth.uid() = user_id);

-- Пользователи могут создавать свои аватары
CREATE POLICY "Users can create own avatars" ON user_avatars
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Пользователи могут обновлять свои аватары
CREATE POLICY "Users can update own avatars" ON user_avatars
  FOR UPDATE USING (auth.uid() = user_id);

-- Пользователи могут удалять свои аватары
CREATE POLICY "Users can delete own avatars" ON user_avatars
  FOR DELETE USING (auth.uid() = user_id);

-- Функция для обновления updated_at
CREATE OR REPLACE FUNCTION update_user_avatars_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для автоматического обновления updated_at
CREATE TRIGGER update_user_avatars_updated_at
  BEFORE UPDATE ON user_avatars
  FOR EACH ROW
  EXECUTE FUNCTION update_user_avatars_updated_at();
