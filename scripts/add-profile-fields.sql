-- Add new fields to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS height INTEGER,
ADD COLUMN IF NOT EXISTS weight INTEGER,
ADD COLUMN IF NOT EXISTS top_size TEXT,
ADD COLUMN IF NOT EXISTS bottom_size TEXT,
ADD COLUMN IF NOT EXISTS shoe_size INTEGER,
ADD COLUMN IF NOT EXISTS gender TEXT;

-- Add shop_url field to wardrobe_user_items table
ALTER TABLE wardrobe_user_items 
ADD COLUMN IF NOT EXISTS shop_url TEXT;
