-- Fix the relationship between user_profiles and daily_usage_limits
-- The error occurs because daily_usage_limits references user_profiles incorrectly

-- Drop the existing daily_usage_limits table if it exists
DROP TABLE IF EXISTS daily_usage_limits CASCADE;

-- Create daily_usage_limits with correct relationship to user_profiles
CREATE TABLE daily_usage_limits (
    id BIGSERIAL PRIMARY KEY,
    user_profile_id BIGINT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    wardrobe_items_today INTEGER DEFAULT 0,
    ai_requests_today INTEGER DEFAULT 0,
    ideas_viewed_today INTEGER DEFAULT 0,
    outfits_saved_today INTEGER DEFAULT 0,
    last_reset_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for better performance
CREATE INDEX idx_daily_usage_limits_user_profile_id ON daily_usage_limits(user_profile_id);
CREATE INDEX idx_daily_usage_limits_last_reset_date ON daily_usage_limits(last_reset_date);

-- Enable RLS
ALTER TABLE daily_usage_limits ENABLE ROW LEVEL SECURITY;

-- RLS policies for daily_usage_limits
CREATE POLICY "Users can view own daily usage limits" ON daily_usage_limits
    FOR SELECT USING (
        user_profile_id IN (
            SELECT id FROM user_profiles WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own daily usage limits" ON daily_usage_limits
    FOR UPDATE USING (
        user_profile_id IN (
            SELECT id FROM user_profiles WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "System can insert daily usage limits" ON daily_usage_limits
    FOR INSERT WITH CHECK (true);

-- Admins can view all daily usage limits for non-admin users
CREATE POLICY "Admins can view all daily usage limits" ON daily_usage_limits
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_id = auth.uid() AND is_admin = true
        )
    );

-- Function to get or create daily usage limits
CREATE OR REPLACE FUNCTION get_or_create_daily_limits(p_user_profile_id BIGINT)
RETURNS daily_usage_limits AS $$
DECLARE
    limits_record daily_usage_limits;
BEGIN
    -- Try to get existing limits for today
    SELECT * INTO limits_record
    FROM daily_usage_limits
    WHERE user_profile_id = p_user_profile_id
    AND last_reset_date = CURRENT_DATE;
    
    -- If no record exists or it's from a previous day, create/reset
    IF NOT FOUND OR limits_record.last_reset_date < CURRENT_DATE THEN
        INSERT INTO daily_usage_limits (
            user_profile_id,
            wardrobe_items_today,
            ai_requests_today,
            ideas_viewed_today,
            outfits_saved_today,
            last_reset_date
        ) VALUES (
            p_user_profile_id,
            0,
            0,
            0,
            0,
            CURRENT_DATE
        )
        ON CONFLICT (user_profile_id) DO UPDATE SET
            wardrobe_items_today = 0,
            ai_requests_today = 0,
            ideas_viewed_today = 0,
            outfits_saved_today = 0,
            last_reset_date = CURRENT_DATE,
            updated_at = NOW()
        RETURNING * INTO limits_record;
    END IF;
    
    RETURN limits_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
