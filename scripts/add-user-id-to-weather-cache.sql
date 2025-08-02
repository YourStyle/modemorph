-- Add user_id column to weather_cache table
ALTER TABLE weather_cache 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for faster user-based lookups
CREATE INDEX IF NOT EXISTS idx_weather_cache_user_id ON weather_cache(user_id);

-- Create composite index for user_id and city_name
CREATE INDEX IF NOT EXISTS idx_weather_cache_user_city ON weather_cache(user_id, city_name);

-- Create index for faster lookups by updated_at
CREATE INDEX IF NOT EXISTS idx_weather_cache_updated_at ON weather_cache(updated_at);

-- Update RLS policies to include user_id
ALTER TABLE weather_cache ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own weather cache" ON weather_cache;
DROP POLICY IF EXISTS "Users can insert their own weather cache" ON weather_cache;
DROP POLICY IF EXISTS "Users can update their own weather cache" ON weather_cache;

-- Create new policies that consider user_id
CREATE POLICY "Users can view their own weather cache" ON weather_cache
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own weather cache" ON weather_cache
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own weather cache" ON weather_cache
    FOR UPDATE USING (auth.uid() = user_id);

-- Allow service role to access all records
CREATE POLICY "Service role can access all weather cache" ON weather_cache
    FOR ALL USING (auth.role() = 'service_role');
