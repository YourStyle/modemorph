-- TR-1..TR-4: Client-side recommendation tracking schema extensions.
-- Wires impressions, clicks, affiliate clicks, and outfit-level likes/dislikes
-- back to the rec_session_id produced by /clip/recommend, so CTR / like-rate /
-- A/B comparison can be computed against the same identifier the retrieval
-- service used at generation time.

-- ---------------------------------------------------------------------------
-- recommendation_logs: prevent duplicate impressions when an item re-enters
-- viewport during the same rec session. Clicks and other actions are NOT
-- deduped — multiple clicks on the same card are legitimate signal.
-- The "served" baseline (action IS NULL) inserted by /clip/recommend remains
-- untouched: this index only constrains rows where the user is reported to
-- have actually seen the card on screen.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_rec_logs_impression
    ON recommendation_logs (user_id, rec_session_id, item_id)
    WHERE action = 'impression';

-- ---------------------------------------------------------------------------
-- user_likes: outfits saved as standalone rows still use outfit_id (FK to
-- outfits). Section-level likes coming from /api/rec-event reference a
-- suggestion_id string (md5-derived, not in any table) and a rec_session_id
-- so the like can be attributed to the retrieval session that surfaced it.
-- outfit_id is relaxed to NULL because section suggestions have no outfit row.
-- ---------------------------------------------------------------------------
ALTER TABLE user_likes
    ADD COLUMN IF NOT EXISTS rec_session_id TEXT,
    ADD COLUMN IF NOT EXISTS suggestion_id TEXT;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_likes' AND column_name = 'outfit_id' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE user_likes ALTER COLUMN outfit_id DROP NOT NULL;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS user_likes_user_suggestion_unique
    ON user_likes (user_id, suggestion_id) WHERE suggestion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_likes_rec_session
    ON user_likes (rec_session_id) WHERE rec_session_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- user_item_dislikes: same plumbing for outfit-level dislikes from sections.
-- item_source = 'recommendation' marks a dislike that came from the rec feed
-- and thus carries rec_session_id / suggestion_id; existing wardrobe-side
-- dislikes keep item_source = 'wardrobe_items' / 'wardrobe_user_items'.
-- ---------------------------------------------------------------------------
ALTER TABLE user_item_dislikes
    ADD COLUMN IF NOT EXISTS rec_session_id TEXT,
    ADD COLUMN IF NOT EXISTS suggestion_id TEXT;

CREATE INDEX IF NOT EXISTS idx_user_item_dislikes_rec_session
    ON user_item_dislikes (rec_session_id) WHERE rec_session_id IS NOT NULL;
