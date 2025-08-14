-- Safe migration script to consolidate user tables and fix relationships
-- This script handles dependencies properly to avoid constraint errors

BEGIN;

-- Step 1: Drop dependent foreign key constraints first
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    -- Find and drop all foreign key constraints that reference auth.users.id
    FOR constraint_record IN
        SELECT 
            tc.table_name,
            tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu 
            ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'users'
        AND ccu.column_name = 'id'
        AND tc.table_schema = 'public'
        AND tc.table_name IN ('user_subscriptions', 'user_credits', 'user_limits', 'user_fittings', 'user_avatars', 'user_recommendations', 'user_transactions')
    LOOP
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', 
                      constraint_record.table_name, 
                      constraint_record.constraint_name);
        RAISE NOTICE 'Dropped constraint % from table %', constraint_record.constraint_name, constraint_record.table_name;
    END LOOP;
END $$;

-- Step 2: Add user_profile_id columns to all tables that need them
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS user_profile_id INTEGER;
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS user_profile_id INTEGER;
ALTER TABLE user_limits ADD COLUMN IF NOT EXISTS user_profile_id INTEGER;
ALTER TABLE user_fittings ADD COLUMN IF NOT EXISTS user_profile_id INTEGER;
ALTER TABLE user_avatars ADD COLUMN IF NOT EXISTS user_profile_id INTEGER;
ALTER TABLE user_recommendations ADD COLUMN IF NOT EXISTS user_profile_id INTEGER;
ALTER TABLE user_transactions ADD COLUMN IF NOT EXISTS user_profile_id INTEGER;

-- Step 3: Migrate data from user_id to user_profile_id
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

UPDATE user_fittings 
SET user_profile_id = up.id 
FROM user_profiles up 
WHERE user_fittings.user_id = up.user_id;

UPDATE user_avatars 
SET user_profile_id = up.id 
FROM user_profiles up 
WHERE user_avatars.user_id = up.user_id;

UPDATE user_recommendations 
SET user_profile_id = up.id 
FROM user_profiles up 
WHERE user_recommendations.user_id = up.user_id;

UPDATE user_transactions 
SET user_profile_id = up.id 
FROM user_profiles up 
WHERE user_transactions.user_id = up.user_id;

-- Step 4: Drop old user_id columns
ALTER TABLE user_subscriptions DROP COLUMN IF EXISTS user_id;
ALTER TABLE user_credits DROP COLUMN IF EXISTS user_id;
ALTER TABLE user_limits DROP COLUMN IF EXISTS user_id;
ALTER TABLE user_fittings DROP COLUMN IF EXISTS user_id;
ALTER TABLE user_avatars DROP COLUMN IF EXISTS user_id;
ALTER TABLE user_recommendations DROP COLUMN IF EXISTS user_id;
ALTER TABLE user_transactions DROP COLUMN IF EXISTS user_id;

-- Step 5: Add foreign key constraints to user_profiles
ALTER TABLE user_subscriptions 
ADD CONSTRAINT fk_user_subscriptions_user_profile 
FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

ALTER TABLE user_credits 
ADD CONSTRAINT fk_user_credits_user_profile 
FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

ALTER TABLE user_limits 
ADD CONSTRAINT fk_user_limits_user_profile 
FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

ALTER TABLE user_fittings 
ADD CONSTRAINT fk_user_fittings_user_profile 
FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

ALTER TABLE user_avatars 
ADD CONSTRAINT fk_user_avatars_user_profile 
FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

ALTER TABLE user_recommendations 
ADD CONSTRAINT fk_user_recommendations_user_profile 
FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

ALTER TABLE user_transactions 
ADD CONSTRAINT fk_user_transactions_user_profile 
FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

-- Step 6: Make user_profile_id columns NOT NULL
ALTER TABLE user_subscriptions ALTER COLUMN user_profile_id SET NOT NULL;
ALTER TABLE user_credits ALTER COLUMN user_profile_id SET NOT NULL;
ALTER TABLE user_limits ALTER COLUMN user_profile_id SET NOT NULL;
ALTER TABLE user_fittings ALTER COLUMN user_profile_id SET NOT NULL;
ALTER TABLE user_avatars ALTER COLUMN user_profile_id SET NOT NULL;
ALTER TABLE user_recommendations ALTER COLUMN user_profile_id SET NOT NULL;
ALTER TABLE user_transactions ALTER COLUMN user_profile_id SET NOT NULL;

-- Step 7: Drop the old profiles table if it exists
DROP TABLE IF EXISTS profiles CASCADE;

-- Step 8: Update RLS policies for admin access to user subscriptions
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own subscriptions" ON user_subscriptions;
DROP POLICY IF EXISTS "Users can insert own subscriptions" ON user_subscriptions;
DROP POLICY IF EXISTS "Users can update own subscriptions" ON user_subscriptions;

-- Create new policies that work with user_profiles
CREATE POLICY "Users can view own subscriptions" ON user_subscriptions
FOR SELECT USING (
    user_profile_id IN (
        SELECT id FROM user_profiles WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Admins can view all user subscriptions" ON user_subscriptions
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_id = auth.uid() AND is_admin = true
    )
);

CREATE POLICY "Users can insert own subscriptions" ON user_subscriptions
FOR INSERT WITH CHECK (
    user_profile_id IN (
        SELECT id FROM user_profiles WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can update own subscriptions" ON user_subscriptions
FOR UPDATE USING (
    user_profile_id IN (
        SELECT id FROM user_profiles WHERE user_id = auth.uid()
    )
);

-- Step 9: Update RLS policies for user_credits
DROP POLICY IF EXISTS "Users can view own credits" ON user_credits;
DROP POLICY IF EXISTS "Users can insert own credits" ON user_credits;
DROP POLICY IF EXISTS "Users can update own credits" ON user_credits;

CREATE POLICY "Users can view own credits" ON user_credits
FOR SELECT USING (
    user_profile_id IN (
        SELECT id FROM user_profiles WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Admins can view all user credits" ON user_credits
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_id = auth.uid() AND is_admin = true
    )
);

CREATE POLICY "Users can insert own credits" ON user_credits
FOR INSERT WITH CHECK (
    user_profile_id IN (
        SELECT id FROM user_profiles WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can update own credits" ON user_credits
FOR UPDATE USING (
    user_profile_id IN (
        SELECT id FROM user_profiles WHERE user_id = auth.uid()
    )
);

-- Step 10: Update database functions to work with new relationships
CREATE OR REPLACE FUNCTION get_user_credits(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    credits INTEGER;
BEGIN
    SELECT COALESCE(credits_balance, 0) INTO credits
    FROM user_credits uc
    JOIN user_profiles up ON uc.user_profile_id = up.id
    WHERE up.user_id = p_user_id;
    
    RETURN COALESCE(credits, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION spend_user_credits(p_user_id UUID, p_amount INTEGER, p_feature TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    current_credits INTEGER;
    user_profile_id INTEGER;
BEGIN
    -- Get user profile id
    SELECT id INTO user_profile_id
    FROM user_profiles
    WHERE user_id = p_user_id;
    
    IF user_profile_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Get current credits
    SELECT COALESCE(credits_balance, 0) INTO current_credits
    FROM user_credits
    WHERE user_profile_id = user_profile_id;
    
    -- Check if user has enough credits
    IF current_credits < p_amount THEN
        RETURN FALSE;
    END IF;
    
    -- Deduct credits
    UPDATE user_credits
    SET credits_balance = credits_balance - p_amount,
        total_spent = total_spent + p_amount,
        updated_at = NOW()
    WHERE user_profile_id = user_profile_id;
    
    -- Log transaction
    INSERT INTO user_transactions (user_profile_id, transaction_type, amount, description, created_at)
    VALUES (user_profile_id, 'spend', -p_amount, 'Spent on ' || p_feature, NOW());
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION add_user_credits(p_user_id UUID, p_amount INTEGER, p_description TEXT DEFAULT 'Credits added')
RETURNS BOOLEAN AS $$
DECLARE
    user_profile_id INTEGER;
BEGIN
    -- Get user profile id
    SELECT id INTO user_profile_id
    FROM user_profiles
    WHERE user_id = p_user_id;
    
    IF user_profile_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Add credits
    INSERT INTO user_credits (user_profile_id, credits_balance, total_earned, created_at, updated_at)
    VALUES (user_profile_id, p_amount, p_amount, NOW(), NOW())
    ON CONFLICT (user_profile_id)
    DO UPDATE SET
        credits_balance = user_credits.credits_balance + p_amount,
        total_earned = user_credits.total_earned + p_amount,
        updated_at = NOW();
    
    -- Log transaction
    INSERT INTO user_transactions (user_profile_id, transaction_type, amount, description, created_at)
    VALUES (user_profile_id, 'add', p_amount, p_description, NOW());
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 11: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_profile_id ON user_subscriptions(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_credits_user_profile_id ON user_credits(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_limits_user_profile_id ON user_limits(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_fittings_user_profile_id ON user_fittings(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_avatars_user_profile_id ON user_avatars(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_recommendations_user_profile_id ON user_recommendations(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_transactions_user_profile_id ON user_transactions(user_profile_id);

COMMIT;
