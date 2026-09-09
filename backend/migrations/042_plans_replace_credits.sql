-- Кредиты уходят, остаются планы.
--
-- Кредит был второй валютой поверх подписки, и он не работал ни как валюта, ни
-- как ограничитель: за все 10 месяцев ни одного успешного платежа за пак
-- (payments со status='success' и action='buy_credits' — ноль строк). Все 18 103
-- кредита на счетах выданы руками (admin_grant, admin_gift) или приехали
-- импортом из Supabase. Продавать то, что никто не покупает, и держать ради
-- этого четыре таблицы, две PL/pgSQL-функции и отдельную вкладку в пейволле —
-- дороже, чем просто назвать вслух, что входит в тариф.
--
-- Числа взяты из «Тарифы_V2» с одной поправкой: строка «Оцифровка — ИТОГО
-- 7,75 ₽ = 2,5 вещи × 3,10 ₽» неверна. Оцифровка тарифицируется ЗА ФОТО, а не за
-- вещь: misc.py режет вещи по 4 и просит у Gemini одну картинку сеткой 2×2, а
-- кадр стоит фиксированные ~1120 токенов независимо от того, одна на нём вещь
-- или четыре. Умножать на вещи не нужно. Себестоимость планов поэтому:
--
--   недельный  299 ₽:  10×3,10 + 2×14,10 + 50×0,04 =    61,20 ₽   маржа 79%
--   месячный   699 ₽:  35×3,10 + 8×14,10 + 300×0,04 =  233,30 ₽   маржа 67%
--   годовой  6 990 ₽: 420×3,10 + 96×14,10 + 3600×0,04 = 2 799,60 ₽ маржа 60%
--   бесплатный:        5×3,10 + 1×14,10 + 10×0,04 =     30,00 ₽ на регистрацию
--
-- (в таблице стояли 125,7 / 504,1 / 6 048,6 / 56,85 — это те же планы, посчитанные
--  с ×2,5 вещи на фото и с текстовой генерацией по 0,40 ₽ вместо 0,04 ₽.)

-- ── 1. Лимиты планов ───────────────────────────────────────────────────────
--
-- Одна таблица вместо словаря в коде: SUBSCRIBER_MONTHLY_CAPS правился деплоем,
-- а цена тарифа — строкой в базе, и эти две вещи обязаны меняться вместе.
--
-- Отсутствие строки = безлимит. Так и задумано: outfits_saved стоит 4 копейки,
-- считать его дороже, чем отдать.
CREATE TABLE IF NOT EXISTS plan_limits (
    plan_type TEXT    NOT NULL,          -- free | weekly | monthly | yearly
    feature   TEXT    NOT NULL,
    cap       INTEGER NOT NULL CHECK (cap >= 0),
    period    TEXT    NOT NULL CHECK (period IN ('once', 'week', 'month')),
    PRIMARY KEY (plan_type, feature)
);

-- 'once' у бесплатного тарифа — это «разово, навсегда», как в таблице. Он не
-- восстанавливается по календарю; единственный способ получить лимит заново —
-- оплатить план (тогда сбросит смена plan_type ниже).
--
-- Годовой = месячный: 420 фото и 96 примерок из таблицы — это за год, то есть
-- те же 35 и 8 в месяц. Хранить годовую цифру и делить её на 12 в коде — способ
-- однажды не поделить.
INSERT INTO plan_limits (plan_type, feature, cap, period) VALUES
    ('free',    'wardrobe_items_anlyzed',   5, 'once'),
    ('free',    'vton_used',                1, 'once'),
    ('free',    'ai_requests',             10, 'once'),
    -- Лента идей у бесплатного остаётся на сегодняшних 100. В таблице «идеи» и
    -- «стилист» слиты в одну строку на 10, но это строка про стоимость, а не
    -- про продукт: лента по 4 копейки за просмотр стоит 4 ₽ на человека, а
    -- урезание её до десяти карточек убило бы единственный экран, который
    -- работает без единой вещи в гардеробе.
    ('free',    'ideas_viewed',           100, 'once'),
    ('weekly',  'wardrobe_items_anlyzed',  10, 'week'),
    ('weekly',  'vton_used',                2, 'week'),
    ('weekly',  'ai_requests',             50, 'week'),
    ('monthly', 'wardrobe_items_anlyzed',  35, 'month'),
    ('monthly', 'vton_used',                8, 'month'),
    ('monthly', 'ai_requests',            300, 'month'),
    ('yearly',  'wardrobe_items_anlyzed',  35, 'month'),
    ('yearly',  'vton_used',                8, 'month'),
    ('yearly',  'ai_requests',            300, 'month')
ON CONFLICT (plan_type, feature) DO UPDATE
    SET cap = EXCLUDED.cap, period = EXCLUDED.period;

-- ── 2. Счётчик потребления теперь знает, под каким планом он накоплен ───────
--
-- Без этой колонки истёкшая подписка оставляла бы после себя строку с used=30,
-- и бесплатный тариф читал бы её как «всё уже потрачено навсегда». Ровно тот
-- же класс бага, что и materialized limits=999, который чинили в 038.
ALTER TABLE subscription_usage ADD COLUMN IF NOT EXISTS plan_type TEXT NOT NULL DEFAULT 'monthly';

-- ── 3. Бесплатный тариф переезжает из limits в subscription_usage ──────────
--
-- limits хранил ОСТАТОК, subscription_usage хранит ПОТРАЧЕННОЕ. Переносим
-- только тех, кто действительно что-то израсходовал (на 09.09.2026 таких трое
-- из 302), и подрезаем перенос новым потолком: тот, кто извёл 20 запросов к
-- стилисту из старых 25, получает used=10, а не отрицательный остаток.
-- Строки 999/999/999 — легаси «безлимита», у них потрачено ноль.
INSERT INTO subscription_usage (user_profile_id, feature, used, period_started_at, plan_type)
SELECT user_profile_id, 'wardrobe_items_anlyzed', LEAST(5, 5 - wardrobe_items_anlyzed), NOW(), 'free'
FROM limits WHERE wardrobe_items_anlyzed BETWEEN 0 AND 4
ON CONFLICT (user_profile_id, feature) DO NOTHING;

INSERT INTO subscription_usage (user_profile_id, feature, used, period_started_at, plan_type)
SELECT user_profile_id, 'vton_used', LEAST(1, 2 - vton_used), NOW(), 'free'
FROM limits WHERE vton_used BETWEEN 0 AND 1
ON CONFLICT (user_profile_id, feature) DO NOTHING;

INSERT INTO subscription_usage (user_profile_id, feature, used, period_started_at, plan_type)
SELECT user_profile_id, 'ai_requests', LEAST(10, 25 - ai_requests), NOW(), 'free'
FROM limits WHERE ai_requests BETWEEN 0 AND 24
ON CONFLICT (user_profile_id, feature) DO NOTHING;

INSERT INTO subscription_usage (user_profile_id, feature, used, period_started_at, plan_type)
SELECT user_profile_id, 'ideas_viewed', LEAST(100, 100 - ideas_viewed), NOW(), 'free'
FROM limits WHERE ideas_viewed BETWEEN 0 AND 99
ON CONFLICT (user_profile_id, feature) DO NOTHING;

-- ── 4. Цены планов ─────────────────────────────────────────────────────────
--
-- Колонка credits остаётся до миграции, которая уронит кредитные таблицы;
-- ноль в ней означает «подписка ничего не начисляет», а не «начисляет ноль
-- кредитов» — начислять больше нечего.
INSERT INTO subscription_pricing (plan_type, price_rub, credits, display_name, is_active)
VALUES ('weekly', 299, 0, 'Недельный', true)
ON CONFLICT (plan_type) DO UPDATE
    SET price_rub = EXCLUDED.price_rub, credits = 0,
        display_name = EXCLUDED.display_name, is_active = true;

UPDATE subscription_pricing SET price_rub = 699,  credits = 0 WHERE plan_type = 'monthly';
UPDATE subscription_pricing SET price_rub = 6990, credits = 0 WHERE plan_type = 'yearly';

-- ── 4b. Себестоимость оцифровки — 3,10 ₽ ───────────────────────────────────
--
-- В feature_costs стояло 2,90 ₽ — замер в базе от 22.08. Рядом лежат ещё два:
-- 3,08 ₽ (15 реальных вещей, test/lite15/report.json) и 3,29 ₽ (первый замер).
-- Разброс 13%, и на объёме честнее верхняя оценка, а не самая красивая.
UPDATE feature_costs SET unit_cost_rub = 3.10 WHERE feature_name = 'wardrobe_items_anlyzed';

-- ── 5. Продажа паков закрыта ───────────────────────────────────────────────
UPDATE credit_packs SET is_active = false;

-- ── 6. Остатки кредитов → месяц подписки ───────────────────────────────────
--
-- Каждому держателю ненулевого баланса — ровно один месяц, независимо от суммы.
-- Не пропорционально номиналу: два самых больших баланса (10 090 и 7 288) —
-- ручные гранты, по номиналу они дали бы 252 и 182 месяца доступа. Денег за
-- кредиты не платил никто, так что это подарок на выход, а не возврат долга, и
-- он обязан быть конечным.
--
-- Существующая подписка продлевается, а не перетирается: GREATEST(expires_at,
-- NOW()) — тот же приём, что в вебхуке оплаты, иначе годовой подписчик обменял
-- бы 10 месяцев оставшегося доступа на один.
INSERT INTO user_subscriptions (user_profile_id, subscription_type, status, start_date, expires_at)
SELECT uc.user_profile_id, 'monthly', 'active', NOW(), NOW() + INTERVAL '1 month'
FROM user_credits uc
WHERE uc.credits_balance > 0
ON CONFLICT (user_profile_id) DO UPDATE
    SET status = 'active',
        expires_at = GREATEST(user_subscriptions.expires_at, NOW()) + INTERVAL '1 month';

INSERT INTO credit_transactions (user_profile_id, transaction_type, amount, reason, description, created_at)
SELECT user_profile_id, 'spend', -credits_balance, 'plan_migration',
       'Остаток ' || credits_balance || ' кр. обменян на 1 месяц подписки', NOW()
FROM user_credits WHERE credits_balance > 0;

UPDATE user_credits SET credits_balance = 0, updated_at = NOW() WHERE credits_balance > 0;
