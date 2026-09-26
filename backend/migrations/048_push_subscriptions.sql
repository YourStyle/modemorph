-- Web Push подписки браузеров/PWA (2026-09-25).
--
-- До этого единственный канал уведомлений — бот, то есть только профили с
-- telegram_id. Веб-пользователи (вход по почте, установленное PWA) не получали
-- ничего. Одна строка — одно устройство/браузер; endpoint выдаёт push-сервис
-- (FCM, Apple, Mozilla) и он уникален. 404/410 от сервиса = подписка мертва,
-- services/webpush.py удаляет строку сам.
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id              bigserial PRIMARY KEY,
    user_profile_id bigint NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    endpoint        text NOT NULL UNIQUE,
    p256dh          text NOT NULL,
    auth            text NOT NULL,
    user_agent      text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_profile_idx ON push_subscriptions (user_profile_id);

-- VAPID-пара, которой сервер подписывает веб-пуши. Одна строка (id = 1),
-- заводится сама при первом обращении (services/webpush.py), руками в .env
-- ничего класть не нужно. Смена ключа осиротит все подписки — не трогать.
CREATE TABLE IF NOT EXISTS push_vapid (
    id          int PRIMARY KEY CHECK (id = 1),
    public_key  text NOT NULL,
    private_key text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
