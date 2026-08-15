#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$DIR/run"
LOG="$DIR/run/tunnel-up.log"
PID_FILE="$DIR/run/cloudflared.pid"
WATCHDOG_PID="$DIR/run/watchdog.pid"
ONE_MCP_ENTRY="$(npm root -g)/@1mcp/agent/build/index.js"
URL="https://mcp.hamza.my.id"
TUNNEL_NAME="${TUNNEL_NAME:-}"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "cloudflared already running (pid $(cat "$PID_FILE"))"
else
  if [ -n "$TUNNEL_NAME" ]; then
    echo "starting cloudflared tunnel run $TUNNEL_NAME"
    setsid cloudflared tunnel run "$TUNNEL_NAME" >>"$LOG" 2>&1 </dev/null &
  else
    echo "starting cloudflared tunnel run (default config)"
    setsid cloudflared tunnel run >>"$LOG" 2>&1 </dev/null &
  fi
  echo "$!" > "$PID_FILE"
fi

if curl -sf -m 3 http://127.0.0.1:3050/health/ready -o /dev/null; then
  echo "1MCP already running"
else
  echo "starting 1MCP (external-url $URL)"
  setsid node "$ONE_MCP_ENTRY" serve --background --enable-auth --config-dir "$DIR/config" --external-url "$URL" </dev/null >/dev/null 2>&1 &
  echo "$!" > "$DIR/run/one-mcp-supervisor.pid"
fi

if [ -f "$WATCHDOG_PID" ] && kill -0 "$(cat "$WATCHDOG_PID")" 2>/dev/null; then
  echo "watchdog already running (pid $(cat "$WATCHDOG_PID"))"
else
  echo "starting watchdog"
  setsid bash "$DIR/scripts/watchdog.sh" >>"$DIR/run/watchdog.log" 2>&1 </dev/null &
  echo "$!" > "$WATCHDOG_PID"
fi

for i in $(seq 1 45); do
  if curl -sf -m 5 "$URL/health/ready" -o /dev/null; then
    echo "tunnel up (public /health/ready OK after ${i}x3s)"
    break
  fi
  sleep 3
done
if ! curl -sf -m 5 "$URL/health/ready" -o /dev/null; then
  echo "public endpoint not healthy yet; watchdog will keep retrying." >&2
fi
echo "  MCP endpoint:  $URL/mcp"
echo "  daemons:       1MCP (self-healing via watchdog), cloudflared (self-healing via watchdog)"
echo "  stop:          scripts/tunnel-down.sh"