#!/usr/bin/env bash
# Apply DB migrations that haven't been applied yet.
# Tracks applied files in a schema_migrations table so each runs exactly once.
# Safe to run on every deploy. Run from repo root or via deploy.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

PSQL="docker exec -i modemorph-postgres psql -U modemorph -d modemorph -v ON_ERROR_STOP=1"
PSQLQ="docker exec modemorph-postgres psql -U modemorph -d modemorph -tA"

$PSQL -c "CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());" >/dev/null

shopt -s nullglob
for f in backend/migrations/*.sql; do
  name="$(basename "$f")"
  if [ "$($PSQLQ -c "SELECT 1 FROM schema_migrations WHERE filename='${name}'")" = "1" ]; then
    continue
  fi
  echo "   migrate: ${name}"
  $PSQL < "$f"
  $PSQL -c "INSERT INTO schema_migrations (filename) VALUES ('${name}') ON CONFLICT DO NOTHING;" >/dev/null
done
echo "   migrations up to date"
