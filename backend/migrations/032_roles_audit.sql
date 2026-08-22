-- Roles (user / analyst / admin) and an audit trail for staff mutations.
--
-- Until now there was one boolean, user_profiles.is_admin, and no record of who
-- did what. The endpoints that mint credits, gift subscriptions, broadcast to
-- every user and change prices left no trace at all.
--
-- WHY is_admin STAYS. It is not redundant: four handlers branch on it to WIDEN
-- what a caller sees (wardrobe.py returns the whole catalog instead of the
-- user's items, outfits.py returns every outfit). An analyst must never trip
-- those, so `role` is the new source of truth and `is_admin` is kept as a
-- derived mirror of (role = 'admin') by trigger. That way every existing
-- is_admin check keeps its exact current meaning, and adding a role cannot
-- silently widen anyone's data access.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_role_check') THEN
        ALTER TABLE user_profiles
          ADD CONSTRAINT user_profiles_role_check
          CHECK (role IN ('user', 'analyst', 'admin'));
    END IF;
END $$;

-- Seed from the boolean that has been carrying this meaning so far.
UPDATE user_profiles SET role = 'admin' WHERE is_admin AND role <> 'admin';

-- Keep the mirror honest in both directions, so a forgotten UPDATE on either
-- column cannot produce an account that is admin by one test and not the other.
CREATE OR REPLACE FUNCTION public.sync_is_admin_with_role()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.role IS NOT DISTINCT FROM OLD.role
       AND NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
        -- Someone set the legacy flag directly; translate it into a role.
        NEW.role := CASE WHEN NEW.is_admin THEN 'admin' ELSE 'user' END;
    END IF;
    NEW.is_admin := (NEW.role = 'admin');
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_is_admin_with_role ON user_profiles;
CREATE TRIGGER trg_sync_is_admin_with_role
    BEFORE INSERT OR UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.sync_is_admin_with_role();

CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles (role) WHERE role <> 'user';

-- Written by middleware for every non-GET /api/admin/* call, including the ones
-- that get 403'd — a denied attempt is exactly what a super admin wants to see.
-- Deliberately not a foreign key on actor_user_id: an audit row must survive the
-- deletion of the account it describes.
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id             BIGSERIAL PRIMARY KEY,
    occurred_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_user_id  UUID,
    actor_email    TEXT,
    actor_role     TEXT,
    method         TEXT        NOT NULL,
    path           TEXT        NOT NULL,
    status_code    INTEGER,
    body           JSONB,
    ip             TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_occurred ON admin_audit_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON admin_audit_log (actor_user_id, occurred_at DESC);
