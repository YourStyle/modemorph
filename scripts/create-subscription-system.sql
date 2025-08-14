-- Create user_subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_type VARCHAR(20) CHECK (subscription_type IN ('monthly', 'yearly')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  credits_included INTEGER DEFAULT 40,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create user_credits table
CREATE TABLE IF NOT EXISTS user_credits (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  credits_balance INTEGER DEFAULT 30,
  total_earned INTEGER DEFAULT 30,
  total_spent INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create credit_transactions table for tracking usage
CREATE TABLE IF NOT EXISTS credit_transactions (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_type VARCHAR(20) CHECK (transaction_type IN ('earned', 'spent')),
  amount INTEGER NOT NULL,
  reason VARCHAR(100),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create credit_packs table for different credit packages
CREATE TABLE IF NOT EXISTS credit_packs (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  credits INTEGER NOT NULL,
  price_rub INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default credit packs
INSERT INTO credit_packs (name, credits, price_rub) VALUES
('Мини пак', 10, 99),
('Стандарт пак', 25, 199),
('Большой пак', 50, 349),
('Мега пак', 100, 599)
ON CONFLICT DO NOTHING;

-- RLS policies
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_packs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users can view own subscriptions" ON user_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own credits" ON user_credits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own transactions" ON credit_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Everyone can view credit packs" ON credit_packs FOR SELECT USING (true);

-- Function to initialize user credits for new users
CREATE OR REPLACE FUNCTION initialize_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  -- Only initialize for non-admin users
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE user_id = NEW.user_id AND is_admin = true
  ) THEN
    INSERT INTO user_credits (user_id, credits_balance, total_earned)
    VALUES (NEW.user_id, 30, 30)
    ON CONFLICT (user_id) DO NOTHING;
    
    -- Log the initial credit grant
    INSERT INTO credit_transactions (user_id, transaction_type, amount, reason, description)
    VALUES (NEW.user_id, 'earned', 30, 'welcome_bonus', 'Приветственный бонус для нового пользователя');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to initialize credits when user profile is created
CREATE TRIGGER trigger_initialize_user_credits
  AFTER INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION initialize_user_credits();

-- Function to spend credits
CREATE OR REPLACE FUNCTION spend_credits(p_user_id UUID, p_amount INTEGER, p_reason VARCHAR(100), p_description TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
  current_balance INTEGER;
BEGIN
  -- Get current balance
  SELECT credits_balance INTO current_balance
  FROM user_credits
  WHERE user_id = p_user_id;
  
  -- Check if user has enough credits
  IF current_balance IS NULL OR current_balance < p_amount THEN
    RETURN FALSE;
  END IF;
  
  -- Deduct credits
  UPDATE user_credits
  SET 
    credits_balance = credits_balance - p_amount,
    total_spent = total_spent + p_amount,
    updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Log transaction
  INSERT INTO credit_transactions (user_id, transaction_type, amount, reason, description)
  VALUES (p_user_id, 'spent', p_amount, p_reason, p_description);
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to add credits
CREATE OR REPLACE FUNCTION add_credits(p_user_id UUID, p_amount INTEGER, p_reason VARCHAR(100), p_description TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  -- Add credits
  INSERT INTO user_credits (user_id, credits_balance, total_earned)
  VALUES (p_user_id, p_amount, p_amount)
  ON CONFLICT (user_id) DO UPDATE SET
    credits_balance = user_credits.credits_balance + p_amount,
    total_earned = user_credits.total_earned + p_amount,
    updated_at = NOW();
  
  -- Log transaction
  INSERT INTO credit_transactions (user_id, transaction_type, amount, reason, description)
  VALUES (p_user_id, 'earned', p_amount, p_reason, p_description);
END;
$$ LANGUAGE plpgsql;
