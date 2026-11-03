#!/usr/bin/env bash
# Runs one pipeline command on the server, pushes new forecast log entries, and alerts on failure.
set -uo pipefail
cd /opt/depower || exit 1
job="$1"
retry_later=75  # the forecast isn't ready yet and a later timer will retry, so no alert

output=$(docker compose -f deploy/compose.yaml --profile jobs run --rm pipeline epf "$job" 2>&1)
status=$?
printf '%s\n' "$output"
detail=$(printf '%s\n' "$output" | tail -n 1 | cut -c1-400)

# Pushing the log needs a git checkout with a deploy key. Without one, the log stays on this server.
if [ -d .git ]; then
    git add data/forecast_log
    if ! git diff --cached --quiet; then
        git commit -q -m "chore(forecast): add log entry from $job"
        if ! { git pull -q --rebase origin main && git push -q origin main; }; then
            [ "$status" -eq 0 ] && detail="the forecast log could not be pushed to GitHub"
            [ "$status" -eq 0 ] && status=1
        fi
    fi
fi

if [ "$status" -ne 0 ] && [ "$status" -ne "$retry_later" ] && [ -n "${EPF_ALERT_WEBHOOK:-}" ]; then
    python3 -c 'import json,sys; print(json.dumps({"job":sys.argv[1],"status":int(sys.argv[2]),"detail":sys.argv[3]}))' \
        "$job" "$status" "$detail" |
        curl -fsS -m 20 -X POST -H "Content-Type: application/json" -d @- "$EPF_ALERT_WEBHOOK" >/dev/null ||
        echo "alert could not be sent" >&2
fi
exit "$status"
