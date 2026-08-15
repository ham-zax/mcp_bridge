#!/usr/bin/env bash
set -euo pipefail
URL="${1:-http://127.0.0.1:3050/mcp}"
echo "== MCP initialize against $URL =="
curl -sf -X POST "$URL" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0.0"}}}'
echo
echo "(connectivity check only; full tool surface is verified from ChatGPT via ACCEPTANCE.md)"