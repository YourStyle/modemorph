-- Drop existing table if it exists to recreate with correct structure
DROP TABLE IF EXISTS user_avatars CASCADE;

-- Create user_avatars table
CREATE TABLE user_avatars (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes
CREATE INDEX idx_user_avatars_user_id ON user_avatars(user_id);
CREATE INDEX idx_user_avatars_is_primary ON user_avatars(user_id, is_primary);

-- Enable RLS
ALTER TABLE user_avatars ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own avatars" ON user_avatars
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own avatars" ON user_avatars
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own avatars" ON user_avatars
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own avatars" ON user_avatars
  FOR DELETE USING (auth.uid() = user_id);

-- Create trigger to ensure only one primary avatar per user
CREATE OR REPLACE FUNCTION ensure_single_primary_avatar()
RETURNS TRIGGER AS $$
BEGIN
  -- If setting this avatar as primary, unset all other primary avatars for this user
  IF NEW.is_primary = true THEN
    UPDATE user_avatars 
    SET is_primary = false 
    WHERE user_id = NEW.user_id AND id != NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ensure_single_primary_avatar
  BEFORE INSERT OR UPDATE ON user_avatars
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_primary_avatar();

-- Create storage bucket for avatars
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies
CREATE POLICY "Users can upload their own avatars" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view their own avatars" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'avatars' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own avatars" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );
