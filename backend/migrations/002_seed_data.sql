-- Seed data will be imported via the Python import script
-- This file is a placeholder for manual seed data

-- Default feature costs
INSERT INTO feature_costs (feature_key, credit_cost) VALUES
    ('wardrobe_items_anlyzed', 1),
    ('ai_requests', 1),
    ('ideas_viewed', 1),
    ('outfits_saved', 1),
    ('vton_used', 2)
ON CONFLICT DO NOTHING;

-- Default subscription pricing
INSERT INTO subscription_pricing (name, price_rub, duration_days) VALUES
    ('monthly', 299, 30),
    ('yearly', 2399, 365)
ON CONFLICT DO NOTHING;

-- Default credit packs
INSERT INTO credit_packs (name, credits, price_rub, is_active) VALUES
    ('10 кредитов', 10, 99, true),
    ('40 кредитов', 40, 299, true),
    ('100 кредитов', 100, 599, true),
    ('200 кредитов', 200, 999, true)
ON CONFLICT DO NOTHING;
