#!/bin/sh
# Generate crontab with real env var values baked in,
# then start alpine crond in foreground.

BACKEND="http://backend:8080"
AUTH='-H "X-Cron-Secret: '"${CRON_SECRET}"'"'

call() {
  # $1 = endpoint path
  echo "curl -sf -X POST ${BACKEND}/api/cron/${1} -H \"X-Cron-Secret: ${CRON_SECRET}\" -H \"Content-Type: application/json\" >> /proc/1/fd/1 2>&1"
}

cat > /etc/crontabs/root << EOF
# ── ModeMorph Cron Schedule (UTC) ─────────────────────────
# Partner feed processing — 03:00 UTC daily
0 3 * * * $(call "process-feeds")

# Outfit recommendations regen — 04:30 UTC daily (after feeds done)
30 4 * * * $(call "generate-recommendations")

# Weather refresh — every hour
0 * * * * $(call "refresh-weather")

# CLIP cluster rebuild — 05:00 UTC every Sunday
0 5 * * 0 $(call "rebuild-clusters")

# Style analysis for new catalog items — 06:00 UTC daily
0 6 * * * $(call "analyze-styles")

# Gender classification for new items — 06:30 UTC daily
30 6 * * * $(call "classify-gender")
# ───────────────────────────────────────────────────────────
EOF

echo "[cron] Schedule loaded:"
cat /etc/crontabs/root
echo "[cron] Starting crond..."
exec crond -f -l 2
