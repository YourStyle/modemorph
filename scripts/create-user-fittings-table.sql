-- Создание таблицы для примерок пользователей
CREATE TABLE IF NOT EXISTS user_fittings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  avatar_id UUID NOT NULL REFERENCES user_avatars(id) ON DELETE CASCADE,
  outfit_items JSONB NOT NULL, -- Массив объектов с id и source вещей
  result_image_url TEXT, -- URL результата примерки
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_user_fittings_user_id ON user_fittings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_fittings_avatar_id ON user_fittings(avatar_id);
CREATE INDEX IF NOT EXISTS idx_user_fittings_status ON user_fittings(status);
CREATE INDEX IF NOT EXISTS idx_user_fittings_created_at ON user_fittings(created_at DESC);

-- RLS политики
ALTER TABLE user_fittings ENABLE ROW LEVEL SECURITY;

-- Пользователи могут видеть только свои примерки
CREATE POLICY "Users can view own fittings" ON user_fittings
  FOR SELECT USING (auth.uid() = user_id);

-- Пользователи могут создавать свои примерки
CREATE POLICY "Users can create own fittings" ON user_fittings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Пользователи могут обновлять свои примерки
CREATE POLICY "Users can update own fittings" ON user_fittings
  FOR UPDATE USING (auth.uid() = user_id);

-- Пользователи могут удалять свои примерки
CREATE POLICY "Users can delete own fittings" ON user_fittings
  FOR DELETE USING (auth.uid() = user_id);

-- Функция для обновления updated_at
CREATE OR REPLACE FUNCTION update_user_fittings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для автоматического обновления updated_at
CREATE TRIGGER update_user_fittings_updated_at
  BEFORE UPDATE ON user_fittings
  FOR EACH ROW
  EXECUTE FUNCTION update_user_fittings_updated_at();
