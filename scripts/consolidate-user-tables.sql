-- Consolidate profiles and user_profiles tables, fix foreign key relationships

-- Step 1: Drop the old profiles table since we're using user_profiles
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Step 2: Ensure user_profiles has all necessary columns
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS full_name TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female')),
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS height INTEGER,
ADD COLUMN IF NOT EXISTS weight INTEGER,
ADD COLUMN IF NOT EXISTS shoe_size INTEGER,
ADD COLUMN IF NOT EXISTS top_size TEXT,
ADD COLUMN IF NOT EXISTS bottom_size TEXT;

-- Step 3: Update foreign key relationships to reference user_profiles.id instead of auth.users.id

-- Drop existing foreign key constraints and recreate them to reference user_profiles
ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_user_id_fkey;
ALTER TABLE user_credits DROP CONSTRAINT IF EXISTS user_credits_user_id_fkey;
ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_user_id_fkey;
ALTER TABLE user_likes DROP CONSTRAINT IF EXISTS user_likes_user_id_fkey;

-- Add new foreign key constraints referencing user_profiles
-- Note: We need to change the column type to INTEGER to match user_profiles.id
ALTER TABLE user_subscriptions 
ADD COLUMN IF NOT EXISTS user_profile_id INTEGER,
ADD CONSTRAINT user_subscriptions_user_profile_id_fkey 
FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

ALTER TABLE user_credits 
ADD COLUMN IF NOT EXISTS user_profile_id INTEGER,
ADD CONSTRAINT user_credits_user_profile_id_fkey 
FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

ALTER TABLE credit_transactions 
ADD COLUMN IF NOT EXISTS user_profile_id INTEGER,
ADD CONSTRAINT credit_transactions_user_profile_id_fkey 
FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

ALTER TABLE user_likes 
ADD COLUMN IF NOT EXISTS user_profile_id INTEGER,
ADD CONSTRAINT user_likes_user_profile_id_fkey 
FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

-- Step 4: Migrate existing data to use user_profiles.id
UPDATE user_subscriptions 
SET user_profile_id = (
  SELECT up.id FROM user_profiles up WHERE up.user_id = user_subscriptions.user_id
)
WHERE user_profile_id IS NULL;

UPDATE user_credits 
SET user_profile_id = (
  SELECT up.id FROM user_profiles up WHERE up.user_id = user_credits.user_id
)
WHERE user_profile_id IS NULL;

UPDATE credit_transactions 
SET user_profile_id = (
  SELECT up.id FROM user_profiles up WHERE up.user_id = credit_transactions.user_id
)
WHERE user_profile_id IS NULL;

UPDATE user_likes 
SET user_profile_id = (
  SELECT up.id FROM user_profiles up WHERE up.user_id = user_likes.user_id
)
WHERE user_profile_id IS NULL;

-- Step 5: Make the new columns NOT NULL and drop old user_id columns
ALTER TABLE user_subscriptions ALTER COLUMN user_profile_id SET NOT NULL;
ALTER TABLE user_credits ALTER COLUMN user_profile_id SET NOT NULL;
ALTER TABLE credit_transactions ALTER COLUMN user_profile_id SET NOT NULL;
ALTER TABLE user_likes ALTER COLUMN user_profile_id SET NOT NULL;

-- Drop old user_id columns
ALTER TABLE user_subscriptions DROP COLUMN IF EXISTS user_id;
ALTER TABLE user_credits DROP COLUMN IF EXISTS user_id;
ALTER TABLE credit_transactions DROP COLUMN IF EXISTS user_id;
ALTER TABLE user_likes DROP COLUMN IF EXISTS user_id;

-- Step 6: Add unique constraints where needed
ALTER TABLE user_subscriptions ADD CONSTRAINT user_subscriptions_user_profile_id_unique UNIQUE(user_profile_id);
ALTER TABLE user_credits ADD CONSTRAINT user_credits_user_profile_id_unique UNIQUE(user_profile_id);

-- Step 7: Update RLS policies

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own subscriptions" ON user_subscriptions;
DROP POLICY IF EXISTS "Users can view own credits" ON user_credits;
DROP POLICY IF EXISTS "Users can view own transactions" ON credit_transactions;
DROP POLICY IF EXISTS "Users can view own likes" ON user_likes;

-- Create new policies that work with user_profiles
CREATE POLICY "Users can view own subscriptions" ON user_subscriptions 
FOR SELECT USING (
  user_profile_id IN (
    SELECT id FROM user_profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Admins can view user subscriptions" ON user_subscriptions 
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE user_id = auth.uid() AND is_admin = true
  )
  AND user_profile_id IN (
    SELECT id FROM user_profiles WHERE is_admin = false
  )
);

CREATE POLICY "Users can view own credits" ON user_credits 
FOR SELECT USING (
  user_profile_id IN (
    SELECT id FROM user_profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Admins can view user credits" ON user_credits 
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE user_id = auth.uid() AND is_admin = true
  )
);

CREATE POLICY "Users can view own transactions" ON credit_transactions 
FOR SELECT USING (
  user_profile_id IN (
    SELECT id FROM user_profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can view own likes" ON user_likes 
FOR SELECT USING (
  user_profile_id IN (
    SELECT id FROM user_profiles WHERE user_id = auth.uid()
  )
);

-- Step 8: Update functions to work with new relationships
CREATE OR REPLACE FUNCTION initialize_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  -- Only initialize for non-admin users
  IF NOT NEW.is_admin THEN
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

-- Step 9: Create indexes for better performance
CREATE INDEX IF NOT EXISTS user_subscriptions_user_profile_id_idx ON user_subscriptions(user_profile_id);
CREATE INDEX IF NOT EXISTS user_credits_user_profile_id_idx ON user_credits(user_profile_id);
CREATE INDEX IF NOT EXISTS credit_transactions_user_profile_id_idx ON credit_transactions(user_profile_id);
CREATE INDEX IF NOT EXISTS user_likes_user_profile_id_idx ON user_likes(user_profile_id);
