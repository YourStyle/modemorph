-- Add missing start_date field to user_subscriptions table
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Update existing subscriptions to set start_date = created_at if null
UPDATE user_subscriptions 
SET start_date = created_at 
WHERE start_date IS NULL;

-- Ensure user_subscriptions references user_profile_id instead of user_id
-- First check if user_id column exists and migrate data
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'user_subscriptions' AND column_name = 'user_id') THEN
    
    -- Add user_profile_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_subscriptions' AND column_name = 'user_profile_id') THEN
      ALTER TABLE user_subscriptions ADD COLUMN user_profile_id INTEGER;
    END IF;
    
    -- Migrate data from user_id to user_profile_id
    UPDATE user_subscriptions 
    SET user_profile_id = up.id
    FROM user_profiles up
    WHERE user_subscriptions.user_id = up.user_id
    AND user_subscriptions.user_profile_id IS NULL;
    
    -- Drop the old user_id column and its constraints
    ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_user_id_fkey;
    ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_user_id_key;
    ALTER TABLE user_subscriptions DROP COLUMN IF EXISTS user_id;
    
    -- Add foreign key constraint for user_profile_id
    ALTER TABLE user_subscriptions 
    ADD CONSTRAINT user_subscriptions_user_profile_id_fkey 
    FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
    
    -- Add unique constraint
    ALTER TABLE user_subscriptions 
    ADD CONSTRAINT user_subscriptions_user_profile_id_key 
    UNIQUE (user_profile_id);
  END IF;
END $$;

-- Do the same for user_credits table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'user_credits' AND column_name = 'user_id') THEN
    
    -- Add user_profile_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_credits' AND column_name = 'user_profile_id') THEN
      ALTER TABLE user_credits ADD COLUMN user_profile_id INTEGER;
    END IF;
    
    -- Migrate data from user_id to user_profile_id
    UPDATE user_credits 
    SET user_profile_id = up.id
    FROM user_profiles up
    WHERE user_credits.user_id = up.user_id
    AND user_credits.user_profile_id IS NULL;
    
    -- Drop the old user_id column and its constraints
    ALTER TABLE user_credits DROP CONSTRAINT IF EXISTS user_credits_user_id_fkey;
    ALTER TABLE user_credits DROP CONSTRAINT IF EXISTS user_credits_user_id_key;
    ALTER TABLE user_credits DROP COLUMN IF EXISTS user_id;
    
    -- Add foreign key constraint for user_profile_id
    ALTER TABLE user_credits 
    ADD CONSTRAINT user_credits_user_profile_id_fkey 
    FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
    
    -- Add unique constraint
    ALTER TABLE user_credits 
    ADD CONSTRAINT user_credits_user_profile_id_key 
    UNIQUE (user_profile_id);
  END IF;
END $$;

-- Do the same for credit_transactions table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'credit_transactions' AND column_name = 'user_id') THEN
    
    -- Add user_profile_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'credit_transactions' AND column_name = 'user_profile_id') THEN
      ALTER TABLE credit_transactions ADD COLUMN user_profile_id INTEGER;
    END IF;
    
    -- Migrate data from user_id to user_profile_id
    UPDATE credit_transactions 
    SET user_profile_id = up.id
    FROM user_profiles up
    WHERE credit_transactions.user_id = up.user_id
    AND credit_transactions.user_profile_id IS NULL;
    
    -- Drop the old user_id column and its constraints
    ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_user_id_fkey;
    ALTER TABLE credit_transactions DROP COLUMN IF EXISTS user_id;
    
    -- Add foreign key constraint for user_profile_id
    ALTER TABLE credit_transactions 
    ADD CONSTRAINT credit_transactions_user_profile_id_fkey 
    FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Update database functions to use user_profile_id instead of user_id
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
