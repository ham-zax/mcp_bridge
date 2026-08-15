#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

1mcp serve --status --config-dir "$DIR/config" || true
echo
echo "== 1MCP health =="
curl -sf -m 3 http://127.0.0.1:3050/health/ready && echo || echo "1MCP /health/ready: unreachable"
echo
echo "== tunnel-client (127.0.0.1:8080) =="
curl -sf -m 3 http://127.0.0.1:8080/healthz && echo || echo "/healthz: unreachable"
curl -sf -m 3 http://127.0.0.1:8080/readyz && echo || echo "/readyz: unreachable"
echo
echo "== Route B / cloudflared =="
if pgrep -af "cloudflared tunnel run" >/dev/null 2>&1; then
  echo "cloudflared: running"
else
  echo "cloudflared: stopped"
fi
if [ -f "$DIR/run/watchdog.pid" ] && kill -0 "$(cat "$DIR/run/watchdog.pid")" 2>/dev/null; then
  echo "watchdog:    running (pid $(cat "$DIR/run/watchdog.pid"))"
else
  echo "watchdog:    stopped"
fi
if [ -f "$DIR/run/tunnel.url" ]; then
  URL="$(cat "$DIR/run/tunnel.url")"
  echo "public URL:  $URL"
fi
echo
echo "== overview =="
echo "  tunnel-client UI: http://127.0.0.1:8080/ui"
echo "  1MCP endpoint:   http://127.0.0.1:3050/mcp"