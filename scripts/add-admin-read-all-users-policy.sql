-- Add RLS policy to allow admins to read all user profiles
-- This fixes the issue where admins can only see their own profile on /admin/users

-- Add policy for admins to read all user profiles
CREATE POLICY "Admins can view all user profiles" ON user_profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles admin_profile 
            WHERE admin_profile.user_id = auth.uid() 
            AND admin_profile.is_admin = true
        )
    );
