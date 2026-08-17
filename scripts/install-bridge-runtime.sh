#!/usr/bin/env bash
set -euo pipefail

ONE_MCP_VERSION="0.34.4"
SHELL_MCP_VERSION="1.1.8"

echo "== installing pinned 1MCP aggregator =="
npm install -g "@1mcp/agent@$ONE_MCP_VERSION"

echo "== verifying pinned 1MCP native log rotation =="
LOGGING_CONFIG="$(npm root -g)/@1mcp/agent/build/logger/loggingConfig.js"
LOGGER_IMPL="$(npm root -g)/@1mcp/agent/build/logger/logger.js"
node --input-type=module - "$LOGGING_CONFIG" "$LOGGER_IMPL" <<'NODE'
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const [loggingConfigPath, loggerPath] = process.argv.slice(2);
const { resolveLoggingConfig } = await import(pathToFileURL(loggingConfigPath).href);
const { resolved } = resolveLoggingConfig({ structured: { file: '/tmp/one-mcp.log', maxSize: '10m', maxFiles: 5 } });
if (resolved.maxSize !== 10 * 1024 * 1024 || resolved.maxFiles !== 5) {
  throw new Error('pinned 1MCP did not resolve structured maxSize/maxFiles as expected');
}
const loggerSource = fs.readFileSync(loggerPath, 'utf8');
if (!loggerSource.includes('maxsize: options.maxSize') || !loggerSource.includes('maxFiles: options.maxFiles')) {
  throw new Error('pinned 1MCP logger does not expose native size/file-count rotation');
}
NODE
echo "  verified native log rotation (structured maxSize/maxFiles)"

echo "== applying verified upstream 1MCP patch =="
SDK_PROVIDER="$(npm root -g)/@1mcp/agent/build/auth/sdkOAuthServerProvider.js"
if [ ! -f "$SDK_PROVIDER" ]; then
  echo "expected 1MCP OAuth provider missing: $SDK_PROVIDER" >&2
  exit 1
fi
if grep -Fq "form-action 'self' https:" "$SDK_PROVIDER"; then
  echo "  OAuth consent CSP patch already applied"
elif grep -Fq "form-action 'self'" "$SDK_PROVIDER"; then
  sed -i "s/form-action 'self'/form-action 'self' https:/g" "$SDK_PROVIDER"
  grep -Fq "form-action 'self' https:" "$SDK_PROVIDER" || {
    echo "failed to verify OAuth consent CSP patch" >&2
    exit 1
  }
  echo "  patched OAuth consent CSP (form-action https:) in $SDK_PROVIDER"
else
  echo "unexpected 1MCP $ONE_MCP_VERSION OAuth provider contents; refusing blind patch" >&2
  exit 1
fi

echo "== verifying MCP Development Bridge prerequisites =="
for cmd in node npm npx uv uvx cloudflared curl flock; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "$cmd missing" >&2; exit 1; }
done

echo "  1MCP:           @1mcp/agent@$ONE_MCP_VERSION"
echo "  shell MCP:      mcp-shell-server==$SHELL_MCP_VERSION"
echo "  cloudflared:    $(cloudflared --version 2>/dev/null | head -n1)"
echo "  node:           $(node -v)"
