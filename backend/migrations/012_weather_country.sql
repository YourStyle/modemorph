-- Migration 012: store the resolved country code on weather_cache.
-- Lets the UI show which country the weather auto-resolved to, so users on a VPN
-- (whose IP/auto-location may land in another country) can spot it and pick a
-- city manually. Idempotent.
ALTER TABLE weather_cache ADD COLUMN IF NOT EXISTS country TEXT;
