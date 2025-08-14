-- Update credit packs with new pricing
DELETE FROM credit_packs;
INSERT INTO credit_packs (name, credits, price_rub) VALUES
('Мини пак', 5, 79),
('Стандарт пак', 10, 149),
('Большой пак', 20, 249),
('Мега пак', 30, 299);

-- Create daily usage tracking table
CREATE TABLE IF NOT EXISTS daily_usage (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date DATE DEFAULT CURRENT_DATE,
  wardrobe_digitizations INTEGER DEFAULT 0,
  ai_requests INTEGER DEFAULT 0,
  ideas_views INTEGER DEFAULT 0,
  outfits_saved INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, usage_date)
);

-- Create user limits table
CREATE TABLE IF NOT EXISTS user_limits (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  total_wardrobe_items INTEGER DEFAULT 0,
  total_saved_outfits INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- RLS policies
ALTER TABLE daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own daily usage" ON daily_usage FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own daily usage" ON daily_usage FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view own limits" ON user_limits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own limits" ON user_limits FOR ALL USING (auth.uid() = user_id);

-- Function to check and update daily usage
CREATE OR REPLACE FUNCTION check_daily_limit(
  p_user_id UUID, 
  p_usage_type VARCHAR(50), 
  p_increment INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
  current_usage INTEGER := 0;
  daily_limit INTEGER := 0;
  has_subscription BOOLEAN := FALSE;
BEGIN
  -- Check if user has active subscription
  SELECT EXISTS(
    SELECT 1 FROM user_subscriptions 
    WHERE user_id = p_user_id 
    AND status = 'active' 
    AND expires_at > NOW()
  ) INTO has_subscription;
  
  -- Get current daily usage
  SELECT 
    CASE 
      WHEN p_usage_type = 'wardrobe_digitizations' THEN COALESCE(wardrobe_digitizations, 0)
      WHEN p_usage_type = 'ai_requests' THEN COALESCE(ai_requests, 0)
      WHEN p_usage_type = 'ideas_views' THEN COALESCE(ideas_views, 0)
      WHEN p_usage_type = 'outfits_saved' THEN COALESCE(outfits_saved, 0)
      ELSE 0
    END
  INTO current_usage
  FROM daily_usage 
  WHERE user_id = p_user_id AND usage_date = CURRENT_DATE;
  
  -- Set limits based on subscription status
  CASE p_usage_type
    WHEN 'wardrobe_digitizations' THEN daily_limit := 5;
    WHEN 'ai_requests' THEN daily_limit := CASE WHEN has_subscription THEN 20 ELSE 1 END;
    WHEN 'ideas_views' THEN daily_limit := 10;
    WHEN 'outfits_saved' THEN daily_limit := 999; -- No daily limit, only total limit
    ELSE daily_limit := 0;
  END CASE;
  
  -- Check if limit would be exceeded
  IF current_usage + p_increment > daily_limit THEN
    RETURN FALSE;
  END IF;
  
  -- Update usage
  INSERT INTO daily_usage (user_id, usage_date, wardrobe_digitizations, ai_requests, ideas_views, outfits_saved)
  VALUES (
    p_user_id, 
    CURRENT_DATE,
    CASE WHEN p_usage_type = 'wardrobe_digitizations' THEN p_increment ELSE 0 END,
    CASE WHEN p_usage_type = 'ai_requests' THEN p_increment ELSE 0 END,
    CASE WHEN p_usage_type = 'ideas_views' THEN p_increment ELSE 0 END,
    CASE WHEN p_usage_type = 'outfits_saved' THEN p_increment ELSE 0 END
  )
  ON CONFLICT (user_id, usage_date) DO UPDATE SET
    wardrobe_digitizations = daily_usage.wardrobe_digitizations + 
      CASE WHEN p_usage_type = 'wardrobe_digitizations' THEN p_increment ELSE 0 END,
    ai_requests = daily_usage.ai_requests + 
      CASE WHEN p_usage_type = 'ai_requests' THEN p_increment ELSE 0 END,
    ideas_views = daily_usage.ideas_views + 
      CASE WHEN p_usage_type = 'ideas_views' THEN p_increment ELSE 0 END,
    outfits_saved = daily_usage.outfits_saved + 
      CASE WHEN p_usage_type = 'outfits_saved' THEN p_increment ELSE 0 END,
    updated_at = NOW();
    
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to check total limits
CREATE OR REPLACE FUNCTION check_total_limit(
  p_user_id UUID, 
  p_limit_type VARCHAR(50)
) RETURNS BOOLEAN AS $$
DECLARE
  current_count INTEGER := 0;
  total_limit INTEGER := 0;
BEGIN
  -- Get current totals
  SELECT 
    CASE 
      WHEN p_limit_type = 'wardrobe_items' THEN COALESCE(total_wardrobe_items, 0)
      WHEN p_limit_type = 'saved_outfits' THEN COALESCE(total_saved_outfits, 0)
      ELSE 0
    END
  INTO current_count
  FROM user_limits 
  WHERE user_id = p_user_id;
  
  -- Set total limits
  CASE p_limit_type
    WHEN 'wardrobe_items' THEN total_limit := 20;
    WHEN 'saved_outfits' THEN total_limit := 20;
    ELSE total_limit := 0;
  END CASE;
  
  RETURN current_count < total_limit;
END;
$$ LANGUAGE plpgsql;
