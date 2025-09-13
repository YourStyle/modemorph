-- Add gender column to wardrobe_items
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS gender text;

-- Add gender column to basic_wardrobe_items
ALTER TABLE basic_wardrobe_items ADD COLUMN IF NOT EXISTS gender text;

-- Add gender column to outfits
ALTER TABLE outfits ADD COLUMN IF NOT EXISTS gender text;
