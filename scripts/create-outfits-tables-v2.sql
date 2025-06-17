-- Удаляем существующие таблицы если они есть (для пересоздания)
DROP TABLE IF EXISTS outfit_items CASCADE;
DROP TABLE IF EXISTS outfits CASCADE;

-- Создаем таблицу образов
CREATE TABLE outfits (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  user_id UUID NOT NULL,
  season TEXT,
  occasion TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Создаем таблицу связей между образами и элементами гардероба
CREATE TABLE outfit_items (
  id BIGSERIAL PRIMARY KEY,
  outfit_id BIGINT NOT NULL REFERENCES outfits(id) ON DELETE CASCADE,
  wardrobe_item_id BIGINT NOT NULL REFERENCES wardrobe_items(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(outfit_id, wardrobe_item_id)
);

-- Создаем индексы для лучшей производительности
CREATE INDEX idx_outfits_user_id ON outfits(user_id);
CREATE INDEX idx_outfits_created_at ON outfits(created_at);
CREATE INDEX idx_outfit_items_outfit_id ON outfit_items(outfit_id);
CREATE INDEX idx_outfit_items_wardrobe_item_id ON outfit_items(wardrobe_item_id);

-- Включаем Row Level Security
ALTER TABLE outfits ENABLE ROW LEVEL SECURITY;
ALTER TABLE outfit_items ENABLE ROW LEVEL SECURITY;

-- Удаляем существующие политики если они есть
DROP POLICY IF EXISTS "Users can view their own outfits" ON outfits;
DROP POLICY IF EXISTS "Users can create their own outfits" ON outfits;
DROP POLICY IF EXISTS "Users can update their own outfits" ON outfits;
DROP POLICY IF EXISTS "Users can delete their own outfits" ON outfits;

DROP POLICY IF EXISTS "Users can view their own outfit items" ON outfit_items;
DROP POLICY IF EXISTS "Users can create their own outfit items" ON outfit_items;
DROP POLICY IF EXISTS "Users can update their own outfit items" ON outfit_items;
DROP POLICY IF EXISTS "Users can delete their own outfit items" ON outfit_items;

-- Создаем политики доступа для образов
CREATE POLICY "Users can view their own outfits" ON outfits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own outfits" ON outfits
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own outfits" ON outfits
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own outfits" ON outfits
  FOR DELETE USING (auth.uid() = user_id);

-- Создаем политики доступа для элементов образов
CREATE POLICY "Users can view their own outfit items" ON outfit_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM outfits
      WHERE outfits.id = outfit_items.outfit_id
      AND outfits.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their own outfit items" ON outfit_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM outfits
      WHERE outfits.id = outfit_items.outfit_id
      AND outfits.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own outfit items" ON outfit_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM outfits
      WHERE outfits.id = outfit_items.outfit_id
      AND outfits.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own outfit items" ON outfit_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM outfits
      WHERE outfits.id = outfit_items.outfit_id
      AND outfits.user_id = auth.uid()
    )
  );

-- Проверяем что таблицы созданы
SELECT 'outfits table created' as status, count(*) as row_count FROM outfits;
SELECT 'outfit_items table created' as status, count(*) as row_count FROM outfit_items;
