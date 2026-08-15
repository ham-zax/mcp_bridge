#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$DIR/run"
cd /home/hamza/repo

ONE_MCP_ENTRY="$(npm root -g)/@1mcp/agent/build/index.js"

RC=0
1mcp serve --status --config-dir "$DIR/config" >/dev/null 2>&1 || RC=$?
if [ "$RC" -eq 3 ]; then
  echo "== starting 1MCP runtime (scope: $DIR/config) =="
  EXTRA=()
  if [ -f "$DIR/run/tunnel.url" ]; then
    EXTRA=(--external-url "$(cat "$DIR/run/tunnel.url")")
    echo "   external-url: $(cat "$DIR/run/tunnel.url")"
  fi
  node "$ONE_MCP_ENTRY" serve --background --config-dir "$DIR/config" "${EXTRA[@]}"
elif [ "$RC" -ne 0 ]; then
  echo "1MCP runtime state:" >&2
  1mcp serve --status --config-dir "$DIR/config" >&2 || true
  echo "use scripts/stop.sh then start again" >&2
  exit "$RC"
else
  echo "1MCP runtime already running (scope: $DIR/config)"
fi

if [ "${BRIDGE_ROUTE:-tunnel}" = "public" ]; then
  echo "BRIDGE_ROUTE=public: tunnel-client not needed (Route B)."
  echo "  expose 1MCP now: scripts/tunnel-up.sh"
  exit 0
fi

if [ -z "${CONTROL_PLANE_API_KEY:-}" ]; then
  echo "CONTROL_PLANE_API_KEY is not set (see .env.example)" >&2
  exit 1
fi
if grep -q "REPLACE_ME" "$DIR/profiles/hamza-local-dev.yaml"; then
  echo "profiles/hamza-local-dev.yaml still has placeholder tunnel_id" >&2
  exit 1
fi

echo "== starting tunnel-client (foreground; Ctrl-C to stop) =="
echo "   admin UI: http://127.0.0.1:8080/ui   health: http://127.0.0.1:8080/readyz"
tunnel-client run --profile hamza-local-dev