-- Recommendation feedback logs — tracks what was shown and what was clicked
CREATE TABLE IF NOT EXISTS recommendation_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    rec_session_id TEXT NOT NULL,       -- unique per recommendation generation
    item_id BIGINT NOT NULL,
    item_score FLOAT,                   -- CLIP score at time of recommendation
    position INT,                       -- position in the result list (0-based)
    source TEXT DEFAULT 'clip',         -- 'clip', 'gemini', 'mix'
    action TEXT,                        -- NULL=shown, 'click', 'save', 'dislike', 'try_on'
    action_at TIMESTAMPTZ,              -- when the action happened
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_logs_user ON recommendation_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_rec_logs_session ON recommendation_logs (rec_session_id);
CREATE INDEX IF NOT EXISTS idx_rec_logs_item ON recommendation_logs (item_id);
