#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$DIR/run"
cd /home/hamza/repo

RC=0
1mcp serve --status --config-dir "$DIR/config" >/dev/null 2>&1 || RC=$?
if [ "$RC" -eq 3 ]; then
  echo "== starting 1MCP runtime (scope: $DIR/config) =="
  1mcp serve --background --config-dir "$DIR/config"
elif [ "$RC" -ne 0 ]; then
  echo "1MCP runtime state:" >&2
  1mcp serve --status --config-dir "$DIR/config" >&2 || true
  echo "use scripts/stop.sh then start again, or 1mcp serve --restart --config-dir $DIR/config" >&2
  exit "$RC"
else
  echo "1MCP runtime already running (scope: $DIR/config)"
fi

if [ -z "${CONTROL_PLANE_API_KEY:-}" ]; then
  echo "CONTROL_PLANE_API_KEY is not set (see .env.example)" >&2
  exit 1
fi
if ! grep -q "REPLACE_ME" "$DIR/profiles/hamza-local-dev.yaml"; then
  :
else
  echo "profiles/hamza-local-dev.yaml still has placeholder tunnel_id" >&2
  exit 1
fi

echo "== starting tunnel-client (foreground; Ctrl-C to stop) =="
echo "   admin UI: http://127.0.0.1:8080/ui   health: http://127.0.0.1:8080/readyz"
tunnel-client run --profile hamza-local-dev