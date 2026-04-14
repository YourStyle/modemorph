-- User item dislikes — items the user doesn't want recommended
CREATE TABLE IF NOT EXISTS user_item_dislikes (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    item_id BIGINT NOT NULL,
    item_source TEXT NOT NULL DEFAULT 'wardrobe_items', -- 'wardrobe_items' or 'wardrobe_user_items'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_item_dislikes_unique
    ON user_item_dislikes (user_id, item_id, item_source);

CREATE INDEX IF NOT EXISTS idx_user_item_dislikes_user
    ON user_item_dislikes (user_id);
