-- Скидки: промокоды, рефералки и разовое предложение после бесплатного лимита.
--
-- Три штуки из гипотез — это одна механика с разным способом выдачи кода:
--
--   promo    — код придумал админ, вводит руками кто угодно, ограничен
--              сроком и числом применений
--   referral — код выдан пользователю навсегда, применяет ПРИГЛАШЁННЫЙ, а
--              пригласивший получает дни подписки
--   winback  — код выдан лично и молча в момент, когда кончился бесплатный
--              лимит, живёт 48 часов (гипотеза 2 из «Тарифы_V2»)
--
-- Одна таблица вместо трёх: различия — это значения полей, а не структура.
-- Три таблицы означали бы три места, где надо проверять «не просрочен ли, не
-- исчерпан ли, не применял ли этот человек его раньше».

CREATE TABLE IF NOT EXISTS discounts (
    code             TEXT PRIMARY KEY,
    kind             TEXT    NOT NULL CHECK (kind IN ('promo', 'referral', 'winback')),
    percent_off      INT     NOT NULL CHECK (percent_off BETWEEN 1 AND 100),
    -- NULL = действует на любой тариф.
    plan_type        TEXT,
    -- Чей это код: для referral — пригласивший, для winback — тот, кому выдали.
    -- У promo пусто: он ничей.
    owner_profile_id BIGINT,
    -- NULL = бессрочно. У winback здесь NOW() + 48 часов, и это единственное,
    -- что делает предложение срочным. Таймер на экране обязан читать эту дату,
    -- а не считать 48 часов у себя: иначе перезагрузка страницы продлевает акцию.
    expires_at       TIMESTAMPTZ,
    max_uses         INT CHECK (max_uses IS NULL OR max_uses > 0),
    uses             INT     NOT NULL DEFAULT 0,
    is_active        BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discounts_owner ON discounts (owner_profile_id, kind);

-- Кто чем воспользовался. UNIQUE (code, user_profile_id) — один код одному
-- человеку один раз: без него реферальная ссылка, отправленная самому себе
-- дважды, приносила бы дни дважды.
CREATE TABLE IF NOT EXISTS discount_redemptions (
    id              BIGSERIAL PRIMARY KEY,
    code            TEXT   NOT NULL,
    user_profile_id BIGINT NOT NULL,
    invoice_id      BIGINT,
    plan_type       TEXT,
    price_rub       INT,
    discounted_rub  INT,
    redeemed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (code, user_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_redemptions_user ON discount_redemptions (user_profile_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_invoice ON discount_redemptions (invoice_id);
