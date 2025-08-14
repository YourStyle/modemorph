-- Drop and recreate user tables with correct foreign key references
-- This script drops empty tables to avoid dependency errors and recreates them with user_profiles.id references

BEGIN;

-- Drop existing empty tables and the duplicate profiles table
DROP TABLE IF EXISTS user_subscriptions CASCADE;
DROP TABLE IF EXISTS user_credits CASCADE; 
DROP TABLE IF EXISTS user_limits CASCADE;
DROP TABLE IF EXISTS daily_usage CASCADE;
DROP TABLE IF EXISTS credit_transactions CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Create user_credits table with user_profiles reference
CREATE TABLE user_credits (
    id BIGSERIAL PRIMARY KEY,
    user_profile_id BIGINT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    credits_balance INTEGER NOT NULL DEFAULT 0,
    total_earned INTEGER NOT NULL DEFAULT 0,
    total_spent INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create user_subscriptions table with user_profiles reference
CREATE TABLE user_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    user_profile_id BIGINT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    subscription_type VARCHAR(20) NOT NULL CHECK (subscription_type IN ('monthly', 'yearly')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
    credits_included INTEGER NOT NULL DEFAULT 40,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create user_limits table with user_profiles reference
CREATE TABLE user_limits (
    id BIGSERIAL PRIMARY KEY,
    user_profile_id BIGINT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    total_wardrobe_items INTEGER NOT NULL DEFAULT 20,
    max_saved_outfits INTEGER NOT NULL DEFAULT 20,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create daily_usage table with user_profiles reference
CREATE TABLE daily_usage (
    id BIGSERIAL PRIMARY KEY,
    user_profile_id BIGINT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    wardrobe_items_added INTEGER NOT NULL DEFAULT 0,
    ai_requests_made INTEGER NOT NULL DEFAULT 0,
    ideas_viewed INTEGER NOT NULL DEFAULT 0,
    outfits_saved INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_profile_id, usage_date)
);

-- Create credit_transactions table with user_profiles reference
CREATE TABLE credit_transactions (
    id BIGSERIAL PRIMARY KEY,
    user_profile_id BIGINT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('earned', 'spent', 'purchased')),
    amount INTEGER NOT NULL,
    description TEXT,
    feature_used VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_user_credits_user_profile_id ON user_credits(user_profile_id);
CREATE INDEX idx_user_subscriptions_user_profile_id ON user_subscriptions(user_profile_id);
CREATE INDEX idx_user_limits_user_profile_id ON user_limits(user_profile_id);
CREATE INDEX idx_daily_usage_user_profile_id ON daily_usage(user_profile_id);
CREATE INDEX idx_daily_usage_date ON daily_usage(usage_date);
CREATE INDEX idx_credit_transactions_user_profile_id ON credit_transactions(user_profile_id);

-- Enable RLS on all tables
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_credits
CREATE POLICY "Users can view own credits" ON user_credits
    FOR SELECT USING (
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

CREATE POLICY "Admins can view all user credits" ON user_credits
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_id = auth.uid() AND is_admin = true
        )
    );

CREATE POLICY "Admins can update all user credits" ON user_credits
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_id = auth.uid() AND is_admin = true
        )
    );

-- RLS Policies for user_subscriptions
CREATE POLICY "Users can view own subscriptions" ON user_subscriptions
    FOR SELECT USING (
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

CREATE POLICY "Admins can view non-admin user subscriptions" ON user_subscriptions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_id = auth.uid() AND is_admin = true
        ) AND user_profile_id IN (
            SELECT id FROM user_profiles WHERE is_admin = false
        )
    );

CREATE POLICY "Admins can manage non-admin user subscriptions" ON user_subscriptions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_id = auth.uid() AND is_admin = true
        ) AND user_profile_id IN (
            SELECT id FROM user_profiles WHERE is_admin = false
        )
    );

-- RLS Policies for user_limits
CREATE POLICY "Users can view own limits" ON user_limits
    FOR SELECT USING (
        user_profile_id IN (
            SELECT id FROM user_profiles WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Admins can view all user limits" ON user_limits
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_id = auth.uid() AND is_admin = true
        )
    );

CREATE POLICY "Admins can manage all user limits" ON user_limits
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_id = auth.uid() AND is_admin = true
        )
    );

-- RLS Policies for daily_usage
CREATE POLICY "Users can view own daily usage" ON daily_usage
    FOR SELECT USING (
        user_profile_id IN (
            SELECT id FROM user_profiles WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own daily usage" ON daily_usage
    FOR ALL USING (
        user_profile_id IN (
            SELECT id FROM user_profiles WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Admins can view all daily usage" ON daily_usage
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_id = auth.uid() AND is_admin = true
        )
    );

-- RLS Policies for credit_transactions
CREATE POLICY "Users can view own transactions" ON credit_transactions
    FOR SELECT USING (
        user_profile_id IN (
            SELECT id FROM user_profiles WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Admins can view all transactions" ON credit_transactions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_id = auth.uid() AND is_admin = true
        )
    );

CREATE POLICY "System can insert transactions" ON credit_transactions
    FOR INSERT WITH CHECK (true);

-- Database functions for credit management
CREATE OR REPLACE FUNCTION get_user_profile_id(user_uuid UUID)
RETURNS BIGINT AS $$
BEGIN
    RETURN (SELECT id FROM user_profiles WHERE user_id = user_uuid LIMIT 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION initialize_user_credits(user_profile_id BIGINT)
RETURNS VOID AS $$
BEGIN
    INSERT INTO user_credits (user_profile_id, credits_balance, total_earned)
    VALUES (user_profile_id, 30, 30)
    ON CONFLICT (user_profile_id) DO NOTHING;
    
    INSERT INTO user_limits (user_profile_id)
    VALUES (user_profile_id)
    ON CONFLICT (user_profile_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION spend_user_credits(user_profile_id BIGINT, amount INTEGER, feature TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    current_balance INTEGER;
BEGIN
    SELECT credits_balance INTO current_balance 
    FROM user_credits 
    WHERE user_credits.user_profile_id = spend_user_credits.user_profile_id;
    
    IF current_balance >= amount THEN
        UPDATE user_credits 
        SET credits_balance = credits_balance - amount,
            total_spent = total_spent + amount,
            updated_at = NOW()
        WHERE user_credits.user_profile_id = spend_user_credits.user_profile_id;
        
        INSERT INTO credit_transactions (user_profile_id, transaction_type, amount, feature_used)
        VALUES (user_profile_id, 'spent', amount, feature);
        
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION add_user_credits(user_profile_id BIGINT, amount INTEGER, description TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
    UPDATE user_credits 
    SET credits_balance = credits_balance + amount,
        total_earned = total_earned + amount,
        updated_at = NOW()
    WHERE user_credits.user_profile_id = add_user_credits.user_profile_id;
    
    INSERT INTO credit_transactions (user_profile_id, transaction_type, amount, description)
    VALUES (user_profile_id, 'earned', amount, COALESCE(description, 'Credits added'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to initialize new users with default credits
CREATE OR REPLACE FUNCTION handle_new_user_profile()
RETURNS TRIGGER AS $$
BEGIN
    -- Only initialize credits for non-admin users
    IF NOT NEW.is_admin THEN
        PERFORM initialize_user_credits(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user profiles
DROP TRIGGER IF EXISTS on_user_profile_created ON user_profiles;
CREATE TRIGGER on_user_profile_created
    AFTER INSERT ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION handle_new_user_profile();

COMMIT;
