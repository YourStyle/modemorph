-- Create weather_cache table for caching weather data by location
CREATE TABLE IF NOT EXISTS weather_cache (
  id SERIAL PRIMARY KEY,
  city_name VARCHAR(255) NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  temperature INTEGER NOT NULL,
  condition VARCHAR(50) NOT NULL,
  description VARCHAR(255) NOT NULL,
  humidity INTEGER NOT NULL,
  wind_speed INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_weather_cache_city ON weather_cache(city_name);
CREATE INDEX IF NOT EXISTS idx_weather_cache_location ON weather_cache(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_weather_cache_updated_at ON weather_cache(updated_at);

-- Create composite index for location-based searches
CREATE INDEX IF NOT EXISTS idx_weather_cache_location_time ON weather_cache(latitude, longitude, updated_at);

-- Enable RLS
ALTER TABLE weather_cache ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all authenticated users to read weather data
CREATE POLICY "Allow authenticated users to read weather data" ON weather_cache
  FOR SELECT TO authenticated USING (true);

-- Create policy to allow all authenticated users to insert weather data
CREATE POLICY "Allow authenticated users to insert weather data" ON weather_cache
  FOR INSERT TO authenticated WITH CHECK (true);

-- Create policy to allow all authenticated users to update weather data
CREATE POLICY "Allow authenticated users to update weather data" ON weather_cache
  FOR UPDATE TO authenticated USING (true);

-- Create policy to allow all authenticated users to delete old weather data
CREATE POLICY "Allow authenticated users to delete old weather data" ON weather_cache
  FOR DELETE TO authenticated USING (true);

-- Add comment
COMMENT ON TABLE weather_cache IS 'Cache table for weather data to reduce API calls';
