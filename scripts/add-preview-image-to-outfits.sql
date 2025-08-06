-- Add preview_image field to outfits table
ALTER TABLE outfits ADD COLUMN IF NOT EXISTS preview_image TEXT;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_outfits_preview_image ON outfits(preview_image);

-- Update existing outfits to have null preview_image
UPDATE outfits SET preview_image = NULL WHERE preview_image IS NULL;

-- Update RLS policies if needed
ALTER TABLE outfits ENABLE ROW LEVEL SECURITY;

-- Policy for users to see their own outfits
CREATE POLICY IF NOT EXISTS "Users can view own outfits" ON outfits
    FOR SELECT USING (auth.uid() = user_id);

-- Policy for users to insert their own outfits
CREATE POLICY IF NOT EXISTS "Users can insert own outfits" ON outfits
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy for users to update their own outfits
CREATE POLICY IF NOT EXISTS "Users can update own outfits" ON outfits
    FOR UPDATE USING (auth.uid() = user_id);

-- Policy for users to delete their own outfits
CREATE POLICY IF NOT EXISTS "Users can delete own outfits" ON outfits
    FOR DELETE USING (auth.uid() = user_id);
