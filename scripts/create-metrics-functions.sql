-- Create database functions for incrementing metrics
CREATE OR REPLACE FUNCTION increment_views(outfit_id bigint)
RETURNS void AS $$
BEGIN
  UPDATE outfits 
  SET views_count = COALESCE(views_count, 0) + 1
  WHERE id = outfit_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_saves(outfit_id bigint)
RETURNS void AS $$
BEGIN
  UPDATE outfits 
  SET saves_count = COALESCE(saves_count, 0) + 1
  WHERE id = outfit_id;
END;
$$ LANGUAGE plpgsql;
