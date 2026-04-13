-- Add style analysis columns to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS dominant_style VARCHAR(50);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS style_tags TEXT;
