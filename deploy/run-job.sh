#!/usr/bin/env bash
# Runs one pipeline command on the server, pushes new forecast log entries, and alerts on failure.
set -uo pipefail
cd /opt/depower || exit 1
job="$1"

docker compose -f deploy/compose.yaml --profile jobs run --rm pipeline epf "$job"
status=$?

git add data/forecast_log
if ! git diff --cached --quiet; then
    git commit -q -m "chore(forecast): add log entry from $job"
    git pull -q --rebase origin main && git push -q origin main || status=1
fi

if [ "$status" -ne 0 ] && [ -n "${EPF_ALERT_WEBHOOK:-}" ]; then
    curl -fsS -m 15 -X POST -H "Content-Type: application/json" \
        -d "{\"job\":\"$job\",\"status\":$status}" "$EPF_ALERT_WEBHOOK" || true
fi
exit "$status"
