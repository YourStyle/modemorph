-- Deduplicate existing rows: keep only the newest entry per (user_id, url)
DELETE FROM user_avatars a
USING user_avatars b
WHERE a.user_id = b.user_id
  AND a.url = b.url
  AND a.created_at < b.created_at;

-- Add unique constraint so ON CONFLICT DO NOTHING works correctly
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_avatars_user_url
  ON user_avatars (user_id, url);
