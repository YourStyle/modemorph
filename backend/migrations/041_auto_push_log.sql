-- Журнал автопушей бота (cron.py /cron/auto-push, 2026-09-08).
--
-- Одна строка — одно отправленное сообщение одному профилю. По этой таблице
-- крон считает адаптивный интервал: каждый пуш без реакции (ни одного
-- события в usage_events за 72 часа после отправки) удваивает паузу до
-- следующего, реакция возвращает базовые 7 дней. Открытие приложения по
-- кнопке приходит в usage_events как push_open с metadata.push_id = id.
CREATE TABLE IF NOT EXISTS auto_push_log (
    id              bigserial PRIMARY KEY,
    user_profile_id bigint NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    template        text NOT NULL,
    sent_at         timestamptz NOT NULL DEFAULT now(),
    ok              boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS auto_push_log_profile_idx ON auto_push_log (user_profile_id, sent_at DESC);
