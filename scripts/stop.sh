#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# 1. Stop watchdog first so it doesn't resurrect 1MCP or cloudflared
if [ -f "$DIR/run/watchdog.pid" ]; then
  kill "$(cat "$DIR/run/watchdog.pid")" 2>/dev/null || true
  rm -f "$DIR/run/watchdog.pid"
fi
pkill -f "watchdog.sh" 2>/dev/null || true

# 2. Stop cloudflared (Route B)
if [ -f "$DIR/run/cloudflared.pid" ]; then
  kill "$(cat "$DIR/run/cloudflared.pid")" 2>/dev/null || true
  rm -f "$DIR/run/cloudflared.pid"
fi
pkill -f "cloudflared tunnel run" 2>/dev/null || true

# 3. Stop tunnel-client (Route A)
if [ -f "$DIR/run/tunnel-client.pid" ]; then
  PID="$(cat "$DIR/run/tunnel-client.pid")"
  kill "$PID" 2>/dev/null || true
  rm -f "$DIR/run/tunnel-client.pid"
fi
pkill -f "tunnel-client run" 2>/dev/null || true

# 4. Stop 1MCP runtime
1mcp serve --stop --config-dir "$DIR/config" || true
pkill -f "node.*@1mcp/agent.*serve" 2>/dev/null || true
echo "stopped all bridge processes"