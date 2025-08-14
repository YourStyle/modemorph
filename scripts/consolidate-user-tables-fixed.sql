-- Consolidate user tables and fix relationships
-- This script removes the duplicate 'profiles' table and updates all foreign keys to reference user_profiles.id

BEGIN;

-- Step 1: Drop the old profiles table if it exists
DROP TABLE IF EXISTS profiles CASCADE;

-- Step 2: Add user_profile_id columns to all related tables
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS user_profile_id INTEGER;
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS user_profile_id INTEGER;
ALTER TABLE user_limits ADD COLUMN IF NOT EXISTS user_profile_id INTEGER;
ALTER TABLE daily_usage ADD COLUMN IF NOT EXISTS user_profile_id INTEGER;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS user_profile_id INTEGER;

-- Step 3: Populate user_profile_id columns by joining with user_profiles
UPDATE user_subscriptions 
SET user_profile_id = up.id 
FROM user_profiles up 
WHERE user_subscriptions.user_id = up.user_id;

UPDATE user_credits 
SET user_profile_id = up.id 
FROM user_profiles up 
WHERE user_credits.user_id = up.user_id;

UPDATE user_limits 
SET user_profile_id = up.id 
FROM user_profiles up 
WHERE user_limits.user_id = up.user_id;

UPDATE daily_usage 
SET user_profile_id = up.id 
FROM user_profiles up 
WHERE daily_usage.user_id = up.user_id;

UPDATE credit_transactions 
SET user_profile_id = up.id 
FROM user_profiles up 
WHERE credit_transactions.user_id = up.user_id;

-- Step 4: Drop foreign key constraints that reference auth.users
ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_user_id_fkey;
ALTER TABLE user_credits DROP CONSTRAINT IF EXISTS user_credits_user_id_fkey;
ALTER TABLE user_limits DROP CONSTRAINT IF EXISTS user_limits_user_id_fkey;
ALTER TABLE daily_usage DROP CONSTRAINT IF EXISTS daily_usage_user_id_fkey;
ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_user_id_fkey;

-- Step 5: Drop unique constraints on user_id
ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_user_id_key;
ALTER TABLE user_credits DROP CONSTRAINT IF EXISTS user_credits_user_id_key;
ALTER TABLE user_limits DROP CONSTRAINT IF EXISTS user_limits_user_id_key;

-- Step 6: Drop the old user_id columns
ALTER TABLE user_subscriptions DROP COLUMN IF EXISTS user_id;
ALTER TABLE user_credits DROP COLUMN IF EXISTS user_id;
ALTER TABLE user_limits DROP COLUMN IF EXISTS user_id;
ALTER TABLE daily_usage DROP COLUMN IF EXISTS user_id;
ALTER TABLE credit_transactions DROP COLUMN IF EXISTS user_id;

-- Step 7: Make user_profile_id NOT NULL and add foreign key constraints
ALTER TABLE user_subscriptions ALTER COLUMN user_profile_id SET NOT NULL;
ALTER TABLE user_credits ALTER COLUMN user_profile_id SET NOT NULL;
ALTER TABLE user_limits ALTER COLUMN user_profile_id SET NOT NULL;
ALTER TABLE daily_usage ALTER COLUMN user_profile_id SET NOT NULL;
ALTER TABLE credit_transactions ALTER COLUMN user_profile_id SET NOT NULL;

-- Step 8: Add foreign key constraints to user_profiles
ALTER TABLE user_subscriptions ADD CONSTRAINT user_subscriptions_user_profile_id_fkey 
  FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

ALTER TABLE user_credits ADD CONSTRAINT user_credits_user_profile_id_fkey 
  FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

ALTER TABLE user_limits ADD CONSTRAINT user_limits_user_profile_id_fkey 
  FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

ALTER TABLE daily_usage ADD CONSTRAINT daily_usage_user_profile_id_fkey 
  FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_user_profile_id_fkey 
  FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

-- Step 9: Add unique constraints where needed
ALTER TABLE user_subscriptions ADD CONSTRAINT user_subscriptions_user_profile_id_key UNIQUE (user_profile_id);
ALTER TABLE user_credits ADD CONSTRAINT user_credits_user_profile_id_key UNIQUE (user_profile_id);
ALTER TABLE user_limits ADD CONSTRAINT user_limits_user_profile_id_key UNIQUE (user_profile_id);

-- Step 10: Update RLS policies to work with user_profiles
DROP POLICY IF EXISTS "Users can view own subscriptions" ON user_subscriptions;
DROP POLICY IF EXISTS "Users can view own credits" ON user_credits;
DROP POLICY IF EXISTS "Users can view own transactions" ON credit_transactions;
DROP POLICY IF EXISTS "Users can view own daily usage" ON daily_usage;
DROP POLICY IF EXISTS "Users can update own daily usage" ON daily_usage;
DROP POLICY IF EXISTS "Users can view own limits" ON user_limits;
DROP POLICY IF EXISTS "Users can update own limits" ON user_limits;

-- Create new RLS policies that work with user_profiles
CREATE POLICY "Users can view own subscriptions" ON user_subscriptions 
  FOR SELECT USING (user_profile_id IN (SELECT id FROM user_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can view own credits" ON user_credits 
  FOR SELECT USING (user_profile_id IN (SELECT id FROM user_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can view own transactions" ON credit_transactions 
  FOR SELECT USING (user_profile_id IN (SELECT id FROM user_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can view own daily usage" ON daily_usage 
  FOR SELECT USING (user_profile_id IN (SELECT id FROM user_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own daily usage" ON daily_usage 
  FOR ALL USING (user_profile_id IN (SELECT id FROM user_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can view own limits" ON user_limits 
  FOR SELECT USING (user_profile_id IN (SELECT id FROM user_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own limits" ON user_limits 
  FOR ALL USING (user_profile_id IN (SELECT id FROM user_profiles WHERE user_id = auth.uid()));

-- Step 11: Add admin policies for reading user subscriptions (non-admin users only)
CREATE POLICY "Admins can view user subscriptions" ON user_subscriptions 
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND is_admin = true)
    AND user_profile_id IN (SELECT id FROM user_profiles WHERE is_admin = false OR is_admin IS NULL)
  );

CREATE POLICY "Admins can view user credits" ON user_credits 
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admins can update user credits" ON user_credits 
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND is_admin = true)
  );

-- Step 12: Update database functions to work with user_profiles
CREATE OR REPLACE FUNCTION initialize_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  -- Only initialize for non-admin users
  IF NEW.is_admin IS NOT TRUE THEN
    INSERT INTO user_credits (user_profile_id, credits_balance, total_earned)
    VALUES (NEW.id, 30, 30)
    ON CONFLICT (user_profile_id) DO NOTHING;
    
    -- Log the initial credit grant
    INSERT INTO credit_transactions (user_profile_id, transaction_type, amount, reason, description)
    VALUES (NEW.id, 'earned', 30, 'welcome_bonus', 'Приветственный бонус для нового пользователя');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update spend_credits function
CREATE OR REPLACE FUNCTION spend_credits(p_user_profile_id INTEGER, p_amount INTEGER, p_reason VARCHAR(100), p_description TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
  current_balance INTEGER;
BEGIN
  -- Get current balance
  SELECT credits_balance INTO current_balance
  FROM user_credits
  WHERE user_profile_id = p_user_profile_id;
  
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
  WHERE user_profile_id = p_user_profile_id;
  
  -- Log transaction
  INSERT INTO credit_transactions (user_profile_id, transaction_type, amount, reason, description)
  VALUES (p_user_profile_id, 'spent', p_amount, p_reason, p_description);
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Update add_credits function
CREATE OR REPLACE FUNCTION add_credits(p_user_profile_id INTEGER, p_amount INTEGER, p_reason VARCHAR(100), p_description TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  -- Add credits
  INSERT INTO user_credits (user_profile_id, credits_balance, total_earned)
  VALUES (p_user_profile_id, p_amount, p_amount)
  ON CONFLICT (user_profile_id) DO UPDATE SET
    credits_balance = user_credits.credits_balance + p_amount,
    total_earned = user_credits.total_earned + p_amount,
    updated_at = NOW();
  
  -- Log transaction
  INSERT INTO credit_transactions (user_profile_id, transaction_type, amount, reason, description)
  VALUES (p_user_profile_id, 'earned', p_amount, p_reason, p_description);
END;
$$ LANGUAGE plpgsql;

COMMIT;
