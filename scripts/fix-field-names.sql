-- Fix RLS policies to use correct field names based on actual database schema
-- user_subscriptions, user_credits, daily_usage_limits all use user_profile_id (not user_id)

-- Drop existing policies that use wrong field names
DROP POLICY IF EXISTS "Users can view own profile" ON "public"."user_profiles";
DROP POLICY IF EXISTS "Admins can view all user profiles" ON "public"."user_profiles";

-- Create corrected policies
-- Regular users can view their own profile (excluding admins to avoid recursion)
CREATE POLICY "Users can view own profile" ON "public"."user_profiles"
FOR SELECT TO public
USING (
  auth.uid() = user_id 
  AND NOT EXISTS (
    SELECT 1 FROM user_profiles admin_check 
    WHERE admin_check.user_id = auth.uid() 
    AND admin_check.is_admin = true
  )
);

-- Admins can view all profiles
CREATE POLICY "Admins can view all user profiles" ON "public"."user_profiles"
FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM user_profiles admin_profile 
    WHERE admin_profile.user_id = auth.uid() 
    AND admin_profile.is_admin = true
  )
);

-- Ensure other tables have correct policies using user_profile_id
-- Fix user_subscriptions policies
DROP POLICY IF EXISTS "Users can view own subscriptions" ON "public"."user_subscriptions";
DROP POLICY IF EXISTS "Admins can view all subscriptions" ON "public"."user_subscriptions";

CREATE POLICY "Users can view own subscriptions" ON "public"."user_subscriptions"
FOR SELECT TO public
USING (
  user_profile_id IN (
    SELECT id FROM user_profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Admins can view all subscriptions" ON "public"."user_subscriptions"
FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM user_profiles admin_profile 
    WHERE admin_profile.user_id = auth.uid() 
    AND admin_profile.is_admin = true
  )
);

-- Fix user_credits policies
DROP POLICY IF EXISTS "Users can view own credits" ON "public"."user_credits";
DROP POLICY IF EXISTS "Admins can view all credits" ON "public"."user_credits";

CREATE POLICY "Users can view own credits" ON "public"."user_credits"
FOR SELECT TO public
USING (
  user_profile_id IN (
    SELECT id FROM user_profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Admins can view all credits" ON "public"."user_credits"
FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM user_profiles admin_profile 
    WHERE admin_profile.user_id = auth.uid() 
    AND admin_profile.is_admin = true
  )
);
