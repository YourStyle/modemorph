-- Create user_looks table
CREATE TABLE IF NOT EXISTS user_looks (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create looks_sections table
CREATE TABLE IF NOT EXISTS looks_sections (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create section_looks junction table (many-to-many)
CREATE TABLE IF NOT EXISTS section_looks (
  id SERIAL PRIMARY KEY,
  section_id INTEGER NOT NULL REFERENCES looks_sections(id) ON DELETE CASCADE,
  look_id INTEGER NOT NULL REFERENCES user_looks(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(section_id, look_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_looks_user_id ON user_looks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_looks_created_at ON user_looks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_looks_sections_user_id ON looks_sections(user_id);
CREATE INDEX IF NOT EXISTS idx_section_looks_section_id ON section_looks(section_id);
CREATE INDEX IF NOT EXISTS idx_section_looks_look_id ON section_looks(look_id);

-- Enable RLS
ALTER TABLE user_looks ENABLE ROW LEVEL SECURITY;
ALTER TABLE looks_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_looks ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user_looks
CREATE POLICY "Users can view their own looks" ON user_looks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own looks" ON user_looks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own looks" ON user_looks
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own looks" ON user_looks
  FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for looks_sections
CREATE POLICY "Users can view their own sections" ON looks_sections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sections" ON looks_sections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sections" ON looks_sections
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sections" ON looks_sections
  FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for section_looks
CREATE POLICY "Users can view section_looks for their sections" ON section_looks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM looks_sections 
      WHERE looks_sections.id = section_looks.section_id 
      AND looks_sections.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert section_looks for their sections" ON section_looks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM looks_sections 
      WHERE looks_sections.id = section_looks.section_id 
      AND looks_sections.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete section_looks for their sections" ON section_looks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM looks_sections 
      WHERE looks_sections.id = section_looks.section_id 
      AND looks_sections.user_id = auth.uid()
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_user_looks_updated_at BEFORE UPDATE ON user_looks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_looks_sections_updated_at BEFORE UPDATE ON looks_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
