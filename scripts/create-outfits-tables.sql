-- Создаем таблицы для образов

-- Таблица образов
CREATE TABLE IF NOT EXISTS outfits (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  season TEXT,
  occasion TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица связей между образами и элементами гардероба
CREATE TABLE IF NOT EXISTS outfit_items (
  id BIGSERIAL PRIMARY KEY,
  outfit_id BIGINT REFERENCES outfits(id) ON DELETE CASCADE,
  wardrobe_item_id BIGINT REFERENCES wardrobe_items(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(outfit_id, wardrobe_item_id)
);

-- Включаем Row Level Security
ALTER TABLE outfits ENABLE ROW LEVEL SECURITY;
ALTER TABLE outfit_items ENABLE ROW LEVEL SECURITY;

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
