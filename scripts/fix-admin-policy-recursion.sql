-- Fix infinite recursion in user_profiles RLS policies
-- The issue: admin policy was checking is_admin from the same table it was protecting

-- Drop the problematic admin policy that causes infinite recursion
DROP POLICY IF EXISTS "Admins can view all user profiles" ON "public"."user_profiles";

-- Keep only the simple user policy that allows users to view their own profile
-- This policy doesn't cause recursion because it only checks auth.uid()
-- ALTER POLICY "Users can view own profile" ON "public"."user_profiles" 
-- TO public USING (auth.uid() = user_id);

-- Create a security definer function that can safely check admin status
-- This function runs with elevated privileges and bypasses RLS
CREATE OR REPLACE FUNCTION public.is_user_admin(user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE user_id = user_uuid AND is_admin = true
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_user_admin(uuid) TO authenticated;

-- Note: The admin users API will need to use this function for authorization
-- instead of relying on RLS policies to avoid recursion
