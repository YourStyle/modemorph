-- Migration 011: make subscriptions actually expire.
--
-- Bug: the subscribe flow wrote limits = 999 ("unlimited") into the `limits`
-- table and nothing ever restored them. _is_subscriber() correctly goes false
-- when expires_at passes, but the limits table still said 999 → expired/churned
-- subscribers kept unlimited free quota.
--
-- Fix (code): subscribe + reconcile no longer write 999; unlimited-while-active
-- is computed live by _is_subscriber().
-- Fix (data, here): reset the 999 marker back to the free-tier defaults
-- (3/3/10/3/1, see me.py profile creation).
--
-- Active subscribers are unaffected: _is_subscriber() still returns unlimited for
-- them regardless of the stored value; once they expire the table now correctly
-- reflects the free tier. Idempotent.
UPDATE limits
SET wardrobe_items_anlyzed = 3,
    ai_requests            = 3,
    ideas_viewed           = 10,
    outfits_saved          = 3,
    vton_used              = 1
WHERE wardrobe_items_anlyzed >= 999
   OR ai_requests            >= 999
   OR ideas_viewed           >= 999
   OR outfits_saved          >= 999
   OR vton_used              >= 999;
