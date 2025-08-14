-- Add end_date field to user_subscriptions table
ALTER TABLE user_subscriptions 
ADD COLUMN end_date timestamptz;

-- Update existing subscriptions to set end_date based on expires_at
UPDATE user_subscriptions 
SET end_date = expires_at 
WHERE end_date IS NULL;

-- Update the database function to handle end_date
CREATE OR REPLACE FUNCTION get_user_subscription_status(user_profile_id_param int8)
RETURNS TABLE (
  subscription_type varchar,
  status varchar,
  start_date timestamptz,
  end_date timestamptz,
  credits_included int4,
  is_active boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    us.subscription_type,
    us.status,
    us.start_date,
    us.end_date,
    us.credits_included,
    (us.status = 'active' AND us.end_date > NOW()) as is_active
  FROM user_subscriptions us
  WHERE us.user_profile_id = user_profile_id_param
  ORDER BY us.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
