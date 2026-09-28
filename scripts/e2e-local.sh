#!/usr/bin/env bash
# Локальный прогон e2e-набора бэкенда против одноразового Postgres в Docker.
#
#   scripts/e2e-local.sh            # поднять базу (если нет), накатить миграции, прогнать тесты
#   scripts/e2e-local.sh --fresh    # пересоздать базу с нуля
#   scripts/e2e-local.sh --db-only  # только база + миграции, без тестов
#
# То же, что делает CI-задание e2e (.github/workflows/ci.yml), но psql не нужен
# на машине — он берётся изнутри контейнера. Боевую базу не трогает: адрес
# собирается здесь же и указывает на localhost.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="${E2E_PG_NAME:-mm_e2e_pg}"
PORT="${E2E_PG_PORT:-55439}"
FRESH=0
DB_ONLY=0
for a in "$@"; do
  case "$a" in
    --fresh) FRESH=1 ;;
    --db-only) DB_ONLY=1 ;;
  esac
done

if [ "$FRESH" = 1 ]; then
  docker rm -f "$NAME" >/dev/null 2>&1 || true
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" -e POSTGRES_USER=modemorph -e POSTGRES_PASSWORD=modemorph \
    -e POSTGRES_DB=modemorph -p "$PORT:5432" postgres:16-alpine >/dev/null
  for _ in $(seq 1 30); do
    docker exec "$NAME" pg_isready -U modemorph >/dev/null 2>&1 && break
    sleep 1
  done
  sleep 2
  echo "bootstrap + migrations"
  docker exec -i "$NAME" psql -U modemorph -d modemorph -v ON_ERROR_STOP=1 -q \
    < "$ROOT/scripts/test-db-bootstrap.sql"
  for f in "$ROOT"/backend/migrations/*.sql; do
    docker exec -i "$NAME" psql -U modemorph -d modemorph -v ON_ERROR_STOP=1 -q \
      < "$f" >/dev/null || { echo "migration failed: $(basename "$f")"; exit 1; }
  done
fi

[ "$DB_ONLY" = 1 ] && exit 0

export DATABASE_URL="postgresql+asyncpg://modemorph:modemorph@localhost:$PORT/modemorph"
export JWT_SECRET="${JWT_SECRET:-ci-secret-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx}"
export TELEGRAM_PEPPER="${TELEGRAM_PEPPER:-ci-pepper}"

cd "$ROOT/backend"
python3 -m pytest -q -p no:warnings app/api/test_e2e_*.py
python3 app/api/test_ai_chats.py
