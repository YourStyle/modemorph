-- Add likes field to outfits table
ALTER TABLE outfits ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0;

-- Create index for sorting by likes
CREATE INDEX IF NOT EXISTS idx_outfits_likes ON outfits(likes DESC);

-- Update existing outfits with random likes (for demo purposes)
UPDATE outfits SET likes = floor(random() * 50) + 1 WHERE likes = 0;

-- Add RLS policies for viewing all outfits (for inspiration)
DROP POLICY IF EXISTS "Users can view all outfits for inspiration" ON outfits;
CREATE POLICY "Users can view all outfits for inspiration" ON outfits
  FOR SELECT USING (true);

-- Add RLS policies for outfit_items
DROP POLICY IF EXISTS "Users can view all outfit items for inspiration" ON outfit_items;
CREATE POLICY "Users can view all outfit items for inspiration" ON outfit_items
  FOR SELECT USING (true);
