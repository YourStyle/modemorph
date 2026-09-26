-- Ошибки пользователей для ежечасной сводки в бота (api/errors.py, 2026-09-26).
--
-- До этого ошибки не записывались нигде: 500 на бэкенде оставались только в
-- docker logs, а то, что видел человек в браузере («API Error 401: Missing
-- token» на онбординге), — только у него на экране. Источники:
--   backend — необработанное исключение или ответ 5xx (middleware в main.py);
--   client  — JS-ошибка, сетевой сбой, 401 после неудачного refresh
--             (lib/error-report.ts → POST /api/client-errors).
-- Крон /cron/error-digest раз в час группирует непросмотренные строки,
-- шлёт админам в бота и ставит digested. Старше 30 дней — удаляются там же.
CREATE TABLE IF NOT EXISTS error_events (
    id          bigserial PRIMARY KEY,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    source      text NOT NULL,
    location    text NOT NULL,
    message     text NOT NULL,
    detail      text,
    status      int,
    user_id     uuid,
    user_agent  text,
    digested    boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS error_events_pending_idx ON error_events (id) WHERE NOT digested;
CREATE INDEX IF NOT EXISTS error_events_time_idx ON error_events (occurred_at);
