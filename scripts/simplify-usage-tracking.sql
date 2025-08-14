-- Drop the duplicate daily_usage table and use only daily_usage_limits
DROP TABLE IF EXISTS daily_usage CASCADE;

-- Ensure daily_usage_limits has correct structure
DROP TABLE IF EXISTS daily_usage_limits CASCADE;

CREATE TABLE daily_usage_limits (
  id SERIAL PRIMARY KEY,
  user_profile_id INTEGER REFERENCES user_profiles(id) ON DELETE CASCADE,
  wardrobe_items_today INTEGER DEFAULT 5,
  ai_requests_today INTEGER DEFAULT 1,
  ideas_viewed_today INTEGER DEFAULT 10,
  outfits_saved_today INTEGER DEFAULT 999,
  last_reset_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_profile_id)
);

-- Fix user_subscriptions table structure
ALTER TABLE user_subscriptions DROP COLUMN IF EXISTS start_date;
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- RLS policies
ALTER TABLE daily_usage_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own daily limits" ON daily_usage_limits 
FOR SELECT USING (
  user_profile_id IN (
    SELECT id FROM user_profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own daily limits" ON daily_usage_limits 
FOR ALL USING (
  user_profile_id IN (
    SELECT id FROM user_profiles WHERE user_id = auth.uid()
  )
);

-- Admins can read all daily limits for non-admin users
CREATE POLICY "Admins can read user daily limits" ON daily_usage_limits 
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE user_id = auth.uid() AND is_admin = true
  )
  AND user_profile_id IN (
    SELECT id FROM user_profiles WHERE is_admin = false
  )
);

-- Function to reset daily limits if needed
CREATE OR REPLACE FUNCTION reset_daily_limits_if_needed(p_user_profile_id INTEGER)
RETURNS VOID AS $$
DECLARE
  has_subscription BOOLEAN := FALSE;
BEGIN
  -- Check if user has active subscription
  SELECT EXISTS(
    SELECT 1 FROM user_subscriptions us
    JOIN user_profiles up ON up.user_id = us.user_id
    WHERE up.id = p_user_profile_id
    AND us.status = 'active' 
    AND us.expires_at > NOW()
  ) INTO has_subscription;

  -- Reset limits if it's a new day
  INSERT INTO daily_usage_limits (
    user_profile_id, 
    wardrobe_items_today, 
    ai_requests_today, 
    ideas_viewed_today, 
    outfits_saved_today,
    last_reset_date
  )
  VALUES (
    p_user_profile_id,
    5, -- wardrobe items daily limit
    CASE WHEN has_subscription THEN 20 ELSE 1 END, -- AI requests limit
    10, -- ideas viewed daily limit  
    999, -- outfits saved (no daily limit)
    CURRENT_DATE
  )
  ON CONFLICT (user_profile_id) DO UPDATE SET
    wardrobe_items_today = CASE 
      WHEN daily_usage_limits.last_reset_date < CURRENT_DATE THEN 5
      ELSE daily_usage_limits.wardrobe_items_today
    END,
    ai_requests_today = CASE 
      WHEN daily_usage_limits.last_reset_date < CURRENT_DATE THEN 
        CASE WHEN has_subscription THEN 20 ELSE 1 END
      ELSE daily_usage_limits.ai_requests_today
    END,
    ideas_viewed_today = CASE 
      WHEN daily_usage_limits.last_reset_date < CURRENT_DATE THEN 10
      ELSE daily_usage_limits.ideas_viewed_today
    END,
    outfits_saved_today = CASE 
      WHEN daily_usage_limits.last_reset_date < CURRENT_DATE THEN 999
      ELSE daily_usage_limits.outfits_saved_today
    END,
    last_reset_date = CURRENT_DATE,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to use a feature and decrement limit
CREATE OR REPLACE FUNCTION use_feature(
  p_user_profile_id INTEGER,
  p_feature_type VARCHAR(50)
) RETURNS BOOLEAN AS $$
DECLARE
  current_limit INTEGER := 0;
BEGIN
  -- Reset limits if needed
  PERFORM reset_daily_limits_if_needed(p_user_profile_id);
  
  -- Get current limit for the feature
  SELECT 
    CASE 
      WHEN p_feature_type = 'wardrobe_items' THEN wardrobe_items_today
      WHEN p_feature_type = 'ai_requests' THEN ai_requests_today
      WHEN p_feature_type = 'ideas_viewed' THEN ideas_viewed_today
      WHEN p_feature_type = 'outfits_saved' THEN outfits_saved_today
      ELSE 0
    END
  INTO current_limit
  FROM daily_usage_limits 
  WHERE user_profile_id = p_user_profile_id;
  
  -- Check if limit allows usage
  IF current_limit <= 0 THEN
    RETURN FALSE;
  END IF;
  
  -- Decrement the limit
  UPDATE daily_usage_limits
  SET 
    wardrobe_items_today = CASE 
      WHEN p_feature_type = 'wardrobe_items' THEN wardrobe_items_today - 1
      ELSE wardrobe_items_today
    END,
    ai_requests_today = CASE 
      WHEN p_feature_type = 'ai_requests' THEN ai_requests_today - 1
      ELSE ai_requests_today
    END,
    ideas_viewed_today = CASE 
      WHEN p_feature_type = 'ideas_viewed' THEN ideas_viewed_today - 1
      ELSE ideas_viewed_today
    END,
    outfits_saved_today = CASE 
      WHEN p_feature_type = 'outfits_saved' THEN outfits_saved_today - 1
      ELSE outfits_saved_today
    END,
    updated_at = NOW()
  WHERE user_profile_id = p_user_profile_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Initialize daily limits for existing users
INSERT INTO daily_usage_limits (user_profile_id)
SELECT id FROM user_profiles WHERE is_admin = false
ON CONFLICT (user_profile_id) DO NOTHING;
