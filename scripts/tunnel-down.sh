#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$DIR/run/watchdog.pid" ]; then
  kill "$(cat "$DIR/run/watchdog.pid")" 2>/dev/null || true
  rm -f "$DIR/run/watchdog.pid"
fi
if [ -f "$DIR/run/cloudflared.pid" ]; then
  kill "$(cat "$DIR/run/cloudflared.pid")" 2>/dev/null || true
  rm -f "$DIR/run/cloudflared.pid"
fi
pkill -f "cloudflared tunnel run" 2>/dev/null || true

echo "tunnel + watchdog stopped; 1MCP still up on 127.0.0.1:3050 (local only)"
echo "  (run scripts/tunnel-up.sh to expose it again)"