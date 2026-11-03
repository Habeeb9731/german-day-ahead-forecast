#!/usr/bin/env bash
# Temporary: records when SMARD files change, to confirm the availability rules in config.py.
# Logs timestamps and hashes only, never market values. Remove once the rules are confirmed.
set -uo pipefail
cd "${DEPOWER_DIR:-/opt/depower}" || exit 1

docker compose -f deploy/compose.yaml --profile jobs run --rm -T pipeline epf poll-availability
status=$?

# Publish about once an hour rather than adding a commit for every poll.
if [ "${PUBLISH:-$(( 10#$(date +%M) < 15 ))}" = "1" ] && [ -d .git ]; then
    exec 9>.git/depower.lock
    flock -w 120 9
    git add data/availability
    if ! git diff --cached --quiet; then
        git commit -q -m "chore(availability): add polls"
        git pull -q --rebase --autostash origin main && git push -q origin main || status=1
    fi
    exec 9>&-
fi
exit "$status"
