#!/usr/bin/env bash
# ModeMorph production deploy.
# Assumes the repo is ALREADY synced to the target commit (the CD workflow does
# the git fetch/stash/pull/pop, preserving server-local docker-compose edits).
# This script: applies pending DB migrations, then rebuilds the code services.
#
# Safe to run manually on the server too:  bash scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== [1/4] DB migrations =="
bash scripts/migrate.sh

echo "== [2/4] pull pre-built images (built in CI, not on this box) =="
docker compose pull backend app

echo "== [3/4] restart code services =="
docker compose up -d backend app

echo "== [4/4] prune build cache (keep <=10GB) so the disk never fills =="
docker builder prune -f --max-used-space=10GB >/dev/null 2>&1 || true
docker image prune -f >/dev/null 2>&1 || true

echo "== status =="
docker compose ps --format '{{.Name}}: {{.Status}}' | grep -E 'backend|app' || true
echo "✅ deployed $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
