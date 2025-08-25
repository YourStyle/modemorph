-- Create feature costs configuration table for admin management
CREATE TABLE IF NOT EXISTS feature_costs (
  id SERIAL PRIMARY KEY,
  feature_name VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  cost_credits INTEGER NOT NULL DEFAULT 0,
  cost_subscription_credits INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default feature costs
INSERT INTO feature_costs (feature_name, display_name, cost_credits, cost_subscription_credits, description) VALUES
('wardrobe_digitization', 'Оцифровка вещи', 5, 2, 'Стоимость добавления новой вещи в гардероб через ИИ анализ'),
('ai_try_on', 'Примерка на аватаре', 3, 1, 'Стоимость генерации образа на аватаре пользователя'),
('ideas_viewing', 'Просмотр идей', 2, 0, 'Стоимость просмотра дополнительных идей образов (за 5 просмотров)'),
('outfit_creation', 'Создание образа', 1, 0, 'Стоимость сохранения нового образа в коллекцию'),
('ai_assistant', 'ИИ-стилист', 2, 1, 'Стоимость запроса к ИИ-ассистенту по стилю')
ON CONFLICT (feature_name) DO UPDATE SET
  cost_credits = EXCLUDED.cost_credits,
  cost_subscription_credits = EXCLUDED.cost_subscription_credits,
  updated_at = NOW();

-- Enable RLS
ALTER TABLE feature_costs ENABLE ROW LEVEL SECURITY;

-- Allow all users to read feature costs
CREATE POLICY "Anyone can read feature costs" ON feature_costs FOR SELECT USING (true);

-- Only admins can modify feature costs
CREATE POLICY "Admins can modify feature costs" ON feature_costs FOR ALL USING (
  EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE user_id = auth.uid() AND is_admin = true
  )
);

-- Function to get feature cost based on subscription status
CREATE OR REPLACE FUNCTION get_feature_cost(
  p_user_profile_id INTEGER,
  p_feature_name VARCHAR(50)
) RETURNS INTEGER AS $$
DECLARE
  has_subscription BOOLEAN := FALSE;
  regular_cost INTEGER := 0;
  subscription_cost INTEGER := 0;
BEGIN
  -- Check if user has active subscription
  SELECT EXISTS(
    SELECT 1 FROM user_subscriptions 
    WHERE user_profile_id = p_user_profile_id 
    AND status = 'active' 
    AND expires_at > NOW()
  ) INTO has_subscription;
  
  -- Get costs for the feature
  SELECT cost_credits, cost_subscription_credits
  INTO regular_cost, subscription_cost
  FROM feature_costs 
  WHERE feature_name = p_feature_name AND is_active = true;
  
  -- Return appropriate cost based on subscription status
  IF has_subscription THEN
    RETURN subscription_cost;
  ELSE
    RETURN regular_cost;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Update spend_credits function to use configurable costs
CREATE OR REPLACE FUNCTION spend_credits(
  p_user_profile_id INTEGER,
  p_amount INTEGER,
  p_reason VARCHAR(100),
  p_description TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  current_balance INTEGER := 0;
  actual_cost INTEGER := 0;
BEGIN
  -- Get current balance
  SELECT credits_balance INTO current_balance
  FROM user_credits 
  WHERE user_profile_id = p_user_profile_id;
  
  -- If no credits record exists, create one with 0 balance
  IF current_balance IS NULL THEN
    INSERT INTO user_credits (user_profile_id, credits_balance, total_earned, total_spent)
    VALUES (p_user_profile_id, 0, 0, 0);
    current_balance := 0;
  END IF;
  
  -- Get actual cost based on feature and subscription status
  SELECT get_feature_cost(p_user_profile_id, p_reason) INTO actual_cost;
  
  -- Use provided amount if no configured cost found
  IF actual_cost IS NULL OR actual_cost = 0 THEN
    actual_cost := p_amount;
  END IF;
  
  -- Check if user has enough credits
  IF current_balance < actual_cost THEN
    RETURN FALSE;
  END IF;
  
  -- Deduct credits
  UPDATE user_credits 
  SET 
    credits_balance = credits_balance - actual_cost,
    total_spent = total_spent + actual_cost,
    updated_at = NOW()
  WHERE user_profile_id = p_user_profile_id;
  
  -- Log transaction
  INSERT INTO credit_transactions (
    user_profile_id, 
    transaction_type, 
    amount, 
    description,
    feature_used
  ) VALUES (
    p_user_profile_id, 
    'spend', 
    -actual_cost, 
    COALESCE(p_description, 'Credits spent for ' || p_reason),
    p_reason
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
