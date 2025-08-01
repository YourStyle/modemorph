-- Add clothing_type field to wardrobe_items table
ALTER TABLE wardrobe_items 
ADD COLUMN IF NOT EXISTS clothing_type TEXT CHECK (clothing_type IN ('верхняя', 'нижняя', 'обувь', 'аксессуары'));

-- Add clothing_type field to wardrobe_user_items table
ALTER TABLE wardrobe_user_items 
ADD COLUMN IF NOT EXISTS clothing_type TEXT CHECK (clothing_type IN ('верхняя', 'нижняя', 'обувь', 'аксессуары'));

-- Add clothing_type field to basic_wardrobe_items table
ALTER TABLE basic_wardrobe_items 
ADD COLUMN IF NOT EXISTS clothing_type TEXT CHECK (clothing_type IN ('верхняя', 'нижняя', 'обувь', 'аксессуары'));

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_clothing_type ON wardrobe_items(clothing_type);
CREATE INDEX IF NOT EXISTS idx_wardrobe_user_items_clothing_type ON wardrobe_user_items(clothing_type);
CREATE INDEX IF NOT EXISTS idx_basic_wardrobe_items_clothing_type ON basic_wardrobe_items(clothing_type);
