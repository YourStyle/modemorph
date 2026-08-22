-- Brand partnership pipeline — the xlsx the analyst keeps by hand.
--
-- NOT merged into partner_profiles, deliberately. That table holds B2B partners
-- who embed our widget and have a login (today: a clinic and a grocery chain).
-- These are fashion brands we are trying to get INTO the catalogue; they have no
-- account and may never have one. Same word, different relationship — conflating
-- them would mean every query about one has to remember to exclude the other.
--
-- The point of moving this off the spreadsheet is NOT a prettier table. It is the
-- join: `catalog_brand` links a lead to wardrobe_items.brand, so the "Показатели"
-- column the analyst fills in by hand becomes a query over data we already have.
-- 2MOOD and Lime are in the pipeline AND in the catalogue right now, and nothing
-- connected the two.

CREATE TABLE IF NOT EXISTS brand_leads (
    id            BIGSERIAL PRIMARY KEY,
    name          TEXT        NOT NULL,
    segment       TEXT,                    -- Масс-маркет / Средний / Премиум
    styles        TEXT,                    -- «Кэжуал, Минимализм» — как в таблице
    contact       TEXT,                    -- почта или соцсеть
    phone         TEXT,
    contact_person TEXT,
    status        TEXT        NOT NULL DEFAULT 'Не начинали',
    last_touch_at DATE,
    offer_type    TEXT,                    -- «Собрать комплект» / «Virtual try-on»
    notes         TEXT,

    -- Тестовый период
    test_start    DATE,
    test_end      DATE,
    test_status   TEXT,
    test_notes    TEXT,

    -- Ключ к каталогу: совпадает с wardrobe_items.brand. Заполняется вручную,
    -- потому что в таблице бренд зовётся «2MOOD», а в фиде «2moodstore» —
    -- угадывать соответствие автоматически значит иногда угадывать неверно.
    catalog_brand TEXT,

    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by    UUID                     -- кто трогал последним; см. admin_audit_log
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_leads_name ON brand_leads (lower(name));
CREATE INDEX IF NOT EXISTS idx_brand_leads_status ON brand_leads (status);
CREATE INDEX IF NOT EXISTS idx_brand_leads_catalog ON brand_leads (lower(catalog_brand))
    WHERE catalog_brand IS NOT NULL;
