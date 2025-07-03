-- Create wardrobe_user_items table matching wardrobe_items structure
CREATE TABLE IF NOT EXISTS wardrobe_user_items (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_name TEXT,
  size_type TEXT,
  material TEXT,
  style TEXT,
  has_print TEXT,
  color TEXT,
  shade TEXT,
  has_details TEXT,
  url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_basic BOOLEAN DEFAULT FALSE,
  basic_item_id BIGINT,
  notes TEXT,
  basic_material_id BIGINT,
  is_hidden BOOLEAN DEFAULT FALSE,
  image_url TEXT
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_wardrobe_user_items_user_id ON wardrobe_user_items(user_id);
CREATE INDEX IF NOT EXISTS idx_wardrobe_user_items_item_name ON wardrobe_user_items(item_name);
CREATE INDEX IF NOT EXISTS idx_wardrobe_user_items_color ON wardrobe_user_items(color);
CREATE INDEX IF NOT EXISTS idx_wardrobe_user_items_material ON wardrobe_user_items(material);
CREATE INDEX IF NOT EXISTS idx_wardrobe_user_items_is_basic ON wardrobe_user_items(is_basic);
CREATE INDEX IF NOT EXISTS idx_wardrobe_user_items_is_hidden ON wardrobe_user_items(is_hidden);
CREATE INDEX IF NOT EXISTS idx_wardrobe_user_items_created_at ON wardrobe_user_items(created_at);

-- Enable Row Level Security
ALTER TABLE wardrobe_user_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only see their own items
CREATE POLICY "Users can view their own wardrobe items" ON wardrobe_user_items
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own items
CREATE POLICY "Users can insert their own wardrobe items" ON wardrobe_user_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own items
CREATE POLICY "Users can update their own wardrobe items" ON wardrobe_user_items
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own items
CREATE POLICY "Users can delete their own wardrobe items" ON wardrobe_user_items
  FOR DELETE USING (auth.uid() = user_id);

-- Admins can view all items
CREATE POLICY "Admins can view all wardrobe items" ON wardrobe_user_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.user_id = auth.uid() 
      AND user_profiles.is_admin = true
    )
  );

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_wardrobe_user_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_wardrobe_user_items_updated_at
  BEFORE UPDATE ON wardrobe_user_items
  FOR EACH ROW
  EXECUTE FUNCTION update_wardrobe_user_items_updated_at();

-- Add comments
COMMENT ON TABLE wardrobe_user_items IS 'User-specific wardrobe items matching wardrobe_items structure';
COMMENT ON COLUMN wardrobe_user_items.user_id IS 'Reference to the user who owns this item';
COMMENT ON COLUMN wardrobe_user_items.basic_item_id IS 'Reference to basic_wardrobe_items if this is based on a basic item';
COMMENT ON COLUMN wardrobe_user_items.basic_material_id IS 'Reference to basic_materials if this uses a basic material';
