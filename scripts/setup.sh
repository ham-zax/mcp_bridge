#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "== installing 1MCP (aggregator) =="
npm install -g @1mcp/agent

echo "== applying upstream 1MCP patches =="
SDK_PROVIDER="$(npm root -g)/@1mcp/agent/build/auth/sdkOAuthServerProvider.js"
if [ -f "$SDK_PROVIDER" ]; then
  sed -i "s/form-action 'self'/form-action 'self' https:/g" "$SDK_PROVIDER"
  echo "  patched OAuth consent CSP (form-action https:) in $SDK_PROVIDER"
fi

echo "== verifying tool-provider prerequisites =="
command -v npx >/dev/null || { echo "npx missing"; exit 1; }
uv --version >/dev/null 2>&1 || { echo "uv missing (mcp-shell-server runs via uvx)"; exit 1; }
echo "  uvx: $(uvx --version)"
echo "  node: $(node -v)  pnpm: $(pnpm -v)"

echo "== tunnel-client =="
if command -v tunnel-client >/dev/null 2>&1; then
  tunnel-client --version
else
  echo "tunnel-client not installed. On this Linux machine:"
  echo "  1. open https://platform.openai.com/settings/organization/tunnels (or github.com/openai/tunnel-client/releases)"
  echo "  2. download the linux amd64 release archive, extract tunnel-client + cloudflared to ~/.local/bin"
  echo "  3. re-run this script"
  exit 1
fi

echo "== next steps =="
echo "  1. create the tunnel + Runtime API key (see .env.example)"
echo "  2. cp .env.example .env and export CONTROL_PLANE_API_KEY"
echo "  3. fill profiles/hamza-local-dev.yaml tunnel_id"
echo "  4. scripts/start.sh"
echo "  5. docs/PLAN.md steps 5-6 (ChatGPT connector + developer-mode app)"