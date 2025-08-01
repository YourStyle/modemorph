-- Add new fields to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS height INTEGER,
ADD COLUMN IF NOT EXISTS weight INTEGER,
ADD COLUMN IF NOT EXISTS top_size TEXT,
ADD COLUMN IF NOT EXISTS bottom_size TEXT,
ADD COLUMN IF NOT EXISTS shoe_size TEXT,
ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('мужской', 'женский', 'другой'));

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_gender ON profiles(gender);
