#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

1mcp serve --status --config-dir "$DIR/config" || true
echo
echo "== 1MCP health =="
curl -sf http://127.0.0.1:3050/health/ready && echo || echo "1MCP /health/ready: unreachable"
echo
echo "== tunnel-client (127.0.0.1:8080) =="
curl -sf http://127.0.0.1:8080/healthz && echo || echo "/healthz: unreachable"
curl -sf http://127.0.0.1:8080/readyz && echo || echo "/readyz: unreachable"
echo
echo "== overview =="
echo "  tunnel-client UI: http://127.0.0.1:8080/ui"
echo "  1MCP endpoint:   http://127.0.0.1:3050/mcp"