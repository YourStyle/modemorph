-- Store a pending "gift" payload that the frontend renders as a welcome sheet
-- on next app entry. Shape:
--   { subscription_type, credits, sheet: {title, body, bullets[], cta_text}, granted_at }
-- NULL means no gift pending.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS pending_gift JSONB;
