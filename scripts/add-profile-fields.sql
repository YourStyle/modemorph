-- Добавляем новые поля в таблицу user_profiles

-- Добавляем поля для физических параметров пользователя
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS height INTEGER, -- рост в см
ADD COLUMN IF NOT EXISTS weight DECIMAL(5,2), -- вес в кг
ADD COLUMN IF NOT EXISTS top_size VARCHAR(10), -- размер верхней одежды
ADD COLUMN IF NOT EXISTS bottom_size VARCHAR(10), -- размер нижней одежды
ADD COLUMN IF NOT EXISTS shoe_size VARCHAR(10), -- размер обуви
ADD COLUMN IF NOT EXISTS gender VARCHAR(20); -- пол

-- Добавляем комментарии к полям
COMMENT ON COLUMN user_profiles.height IS 'Рост пользователя в сантиметрах';
COMMENT ON COLUMN user_profiles.weight IS 'Вес пользователя в килограммах';
COMMENT ON COLUMN user_profiles.top_size IS 'Размер верхней одежды (S, M, L, XL, 42, 44, и т.д.)';
COMMENT ON COLUMN user_profiles.bottom_size IS 'Размер нижней одежды (S, M, L, XL, 42, 44, и т.д.)';
COMMENT ON COLUMN user_profiles.shoe_size IS 'Размер обуви (36, 37, 38, и т.д.)';
COMMENT ON COLUMN user_profiles.gender IS 'Пол пользователя (мужской, женский, другой)';
