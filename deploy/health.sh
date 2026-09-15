#!/usr/bin/env bash
# Poll /api/health until the application answers, or give up.
#
# Probes from INSIDE the app container rather than through the tunnel. Going out
# to media.cg1618.com and back would make Cloudflare's availability part of the
# deploy's success condition, so a tunnel hiccup would roll back perfectly good
# code - and the tunnel is the one component a deploy cannot fix.
#
# /api/health is not "/". The catch-all route serves the SPA for any path, so a
# probe against "/" returns 200 with the database down. /api/health opens a
# session, reads alembic_version and compares it to the head the running code
# expects, so it also fails when the schema and the image disagree - which is
# the state a half-rolled-back deploy leaves behind and the state that every
# weaker probe reports as healthy.
#
# Usage: health.sh [timeout-seconds]   (default 180)

set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.prod.yml)
timeout="${1:-180}"
deadline=$(( $(date +%s) + timeout ))

# entrypoint.sh runs `alembic upgrade head` before uvicorn binds, so connection
# refusals early in the window are normal rather than failure. Only the deadline
# decides, which is why this loops rather than checking once after a sleep.
while [ "$(date +%s)" -lt "${deadline}" ]; do
    if "${COMPOSE[@]}" exec -T app python -c \
        "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health', timeout=5)" \
        >/dev/null 2>&1; then
        echo "healthy"
        exit 0
    fi
    sleep 5
done

echo "not healthy after ${timeout}s" >&2
# The logs are the only thing that says WHY, and the caller is a workflow step
# nobody is watching. Without this the failure reaches the owner as a bare
# non-zero exit.
"${COMPOSE[@]}" logs --tail 20 app >&2 || true
exit 1
