#!/usr/bin/env bash
# ModeMorph production deploy.
# Assumes the repo is ALREADY synced to the target commit (the CD workflow does
# the git fetch/stash/pull/pop, preserving server-local docker-compose edits).
# This script: applies pending DB migrations, then rebuilds the code services,
# then runs one-shot data backfills that need the new image.
#
# Safe to run manually on the server too:  bash scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== [1/5] DB migrations =="
bash scripts/migrate.sh

echo "== [2/5] pull pre-built images (built in CI, not on this box) =="
docker compose pull backend app

echo "== [3/5] restart code services =="
docker compose up -d backend app

# AFTER the restart on purpose: these run code out of the freshly pulled backend
# image (feed download + parsing), so running them before the pull would execute
# the previous release. Failures are logged, not fatal — see scripts/backfill.sh.
echo "== [4/5] one-shot data backfills =="
bash scripts/backfill.sh

echo "== [5/5] prune build cache (keep <=10GB) so the disk never fills =="
docker builder prune -f --max-used-space=10GB >/dev/null 2>&1 || true
docker image prune -f >/dev/null 2>&1 || true

echo "== status =="
docker compose ps --format '{{.Name}}: {{.Status}}' | grep -E 'backend|app' || true
echo "✅ deployed $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
