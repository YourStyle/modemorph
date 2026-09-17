-- Недостающее звено истории: partner_profiles и wardrobe_items.partner_id.
--
-- Эти объекты есть на проде и на них ссылаются три миграции (014, 015, 033), но
-- не создаёт их НИ ОДНА. Когда-то их завели руками мимо миграций, и с тех пор
-- база перестала восстанавливаться из репозитория: накат с чистого Postgres
-- падал на 014 с «column "partner_id" does not exist», а следом валилась 015.
--
-- Обнаружено 17.09.2026 при попытке поднять одноразовую базу для e2e.
--
-- Номер 013a, а не 047: файлы накатываются в порядке имён, и на чистой базе это
-- звено обязано встать ДО 014. На проде оно тоже применится (в schema_migrations
-- его нет), но не сделает ничего — всё создаётся через IF NOT EXISTS, а
-- определения сняты с боевой схемы, а не придуманы.
--
-- Внешнего ключа wardrobe_items.partner_id -> partner_profiles(id) на проде нет,
-- поэтому и здесь его нет: задача файла — воспроизвести то, что есть, а не
-- улучшить заодно. Улучшение схемы — отдельная работа с отдельным обсуждением.

CREATE TABLE IF NOT EXISTS partner_profiles (
    id              SERIAL PRIMARY KEY,
    user_id         UUID NOT NULL UNIQUE,
    company_name    TEXT NOT NULL,
    contact_name    TEXT NOT NULL,
    website         TEXT,
    description     TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    rejected_reason TEXT,
    approved_at     TIMESTAMPTZ,
    approved_by     UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT partner_profiles_status_check
        CHECK (status IN ('pending', 'approved', 'rejected', 'suspended'))
);

-- Колонка, по которой 014 строит индекс (partner_id, source_sku). NULL у всех
-- вещей, кроме пришедших из партнёрского каталога.
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS partner_id INTEGER;
