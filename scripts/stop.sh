#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
1mcp serve --stop --config-dir "$DIR/config" || true
if [ -f "$DIR/run/tunnel-client.pid" ]; then
  PID="$(cat "$DIR/run/tunnel-client.pid")"
  kill "$PID" 2>/dev/null || true
fi
pkill -f "tunnel-client run" 2>/dev/null || true
echo "stopped"