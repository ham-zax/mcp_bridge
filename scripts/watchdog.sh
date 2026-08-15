#!/usr/bin/env bash
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$DIR/run"
LOG="$DIR/run/watchdog.log"
ONE_MCP_ENTRY="$(npm root -g)/@1mcp/agent/build/index.js"
TUNNEL_NAME="${TUNNEL_NAME:-}"
EXTERNAL="${TUNNEL_URL:-https://mcp.hamza.my.id}"

while true; do
  if ! curl -sf -m 3 http://127.0.0.1:3050/health/ready -o /dev/null; then
    echo "$(date -Is) 1MCP down - starting" >> "$LOG"
    1mcp serve --stop --config-dir "$DIR/config" >/dev/null 2>&1 || true
    setsid node "$ONE_MCP_ENTRY" serve --background --enable-auth --config-dir "$DIR/config" --external-url "$EXTERNAL" </dev/null >/dev/null 2>&1 &
    echo "$!" > "$DIR/run/one-mcp-supervisor.pid" 2>/dev/null || true
  fi
  if ! pgrep -af "cloudflared tunnel run" >/dev/null 2>&1; then
    echo "$(date -Is) cloudflared down - starting" >> "$LOG"
    if [ -n "$TUNNEL_NAME" ]; then
      setsid cloudflared tunnel run "$TUNNEL_NAME" >>"$DIR/run/tunnel-up.log" 2>&1 </dev/null &
    else
      setsid cloudflared tunnel run >>"$DIR/run/tunnel-up.log" 2>&1 </dev/null &
    fi
    echo "$!" > "$DIR/run/cloudflared.pid" 2>/dev/null || true
  fi
  sleep 20
done