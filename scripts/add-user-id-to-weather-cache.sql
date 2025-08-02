-- Add user_id column to weather_cache table
ALTER TABLE weather_cache ADD COLUMN IF NOT EXISTS user_id UUID;

-- Add foreign key constraint to profiles table
ALTER TABLE weather_cache 
ADD CONSTRAINT fk_weather_cache_user_id 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for faster user-based lookups
CREATE INDEX IF NOT EXISTS idx_weather_cache_user_id 
ON weather_cache (user_id, updated_at DESC);

-- Update RLS policies to include user_id
DROP POLICY IF EXISTS "Allow authenticated users to read weather" ON weather_cache;
DROP POLICY IF EXISTS "Allow authenticated users to insert weather" ON weather_cache;
DROP POLICY IF EXISTS "Allow authenticated users to update weather" ON weather_cache;

-- Create new policies that consider user_id
CREATE POLICY "Allow users to read weather" ON weather_cache
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR user_id IS NULL
  );

CREATE POLICY "Allow users to insert weather" ON weather_cache
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() OR user_id IS NULL
  );

CREATE POLICY "Allow users to update weather" ON weather_cache
  FOR UPDATE TO authenticated USING (
    user_id = auth.uid() OR user_id IS NULL
  );
