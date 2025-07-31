-- Create weather cache table
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

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_weather_cache_city_updated 
ON weather_cache (city_name, updated_at DESC);

-- Create index for location-based lookups
CREATE INDEX IF NOT EXISTS idx_weather_cache_location 
ON weather_cache (latitude, longitude, updated_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE weather_cache ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all authenticated users to read weather data
CREATE POLICY "Allow authenticated users to read weather" ON weather_cache
  FOR SELECT TO authenticated USING (true);

-- Create policy to allow all authenticated users to insert weather data
CREATE POLICY "Allow authenticated users to insert weather" ON weather_cache
  FOR INSERT TO authenticated WITH CHECK (true);

-- Create policy to allow all authenticated users to update weather data
CREATE POLICY "Allow authenticated users to update weather" ON weather_cache
  FOR UPDATE TO authenticated USING (true);
