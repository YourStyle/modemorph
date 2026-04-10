-- Seed data placeholder
-- Actual data is imported via: python scripts/import_data.py
-- This file only ensures critical defaults exist if import hasn't run yet.

-- Default credit packs (column names match actual schema)
INSERT INTO credit_packs (name, credits, price_rub, is_active) VALUES
    ('10 кредитов', 10, 99, true),
    ('40 кредитов', 40, 299, true),
    ('100 кредитов', 100, 599, true),
    ('200 кредитов', 200, 999, true)
ON CONFLICT DO NOTHING;
