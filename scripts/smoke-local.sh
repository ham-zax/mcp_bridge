#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$DIR/lib/bridge/common.sh"

CONFIG="$BRIDGE_CONFIG_DIR/mcp.json"
if [ -f "$CONFIG" ]; then
  node - "$CONFIG" "$DIR" "${MCP_BRIDGE_PROFILE:-}" <<'NODE'
const fs = require('fs');
const path = require('path');
const [configFile, repoRoot, profile] = process.argv.slice(2);
const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
const dev = cfg.mcpServers?.dev;
const code = cfg.mcpServers?.code;
const terminal = cfg.mcpServers?.terminal;
if (cfg.mcpServers?.filesystem) throw new Error('filesystem provider must be absent after Pi cutover');
if (cfg.mcpServers?.codedb) throw new Error('raw codedb provider must remain hidden behind the Code facade');
if (profile) {
  const actual = Object.keys(cfg.mcpServers ?? {}).sort();
  const expected = profile === 'trusted-dev' ? ['dev'] : profile === 'restricted' ? ['dev', 'shell'] : profile === 'personal' ? ['code', 'dev', 'terminal'] : null;
  if (!expected || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`unexpected final provider set for ${profile || 'unknown'}: ${actual.join(',')}`);
  }
}
if (terminal) {
  if (profile !== 'personal') throw new Error('Terminal provider is private to the personal profile');
  if (terminal.command !== 'node') throw new Error('Terminal provider must run with node');
  const expectedServer = path.join(repoRoot, 'providers', 'terminal', 'mcp-server.mjs');
  if (JSON.stringify(terminal.args ?? []) !== JSON.stringify([expectedServer])) throw new Error('unexpected Terminal provider server path');
  const env = terminal.env ?? {};
  if (!path.isAbsolute(env.MCP_TERMINAL_SOCKET ?? '')) throw new Error('MCP_TERMINAL_SOCKET must be absolute');
  if (path.basename(env.MCP_TERMINAL_SOCKET) !== 'wsl-agent-terminal.sock') throw new Error('unexpected Terminal broker socket name');
  if (env.MCP_TERMINAL_READ_MAX_BYTES !== '65536') throw new Error('unexpected Terminal read limit');
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'providers', 'terminal', 'package.json'), 'utf8'));
  if (pkg.dependencies?.['@modelcontextprotocol/sdk'] !== '1.30.0') throw new Error('unexpected Terminal MCP SDK pin');
  if (pkg.dependencies?.zod !== '4.4.3') throw new Error('unexpected Terminal zod pin');
  const installedSdk = JSON.parse(fs.readFileSync(path.join(repoRoot, 'providers', 'terminal', 'node_modules', '@modelcontextprotocol', 'sdk', 'package.json'), 'utf8'));
  if (installedSdk.version !== '1.30.0') throw new Error(`unexpected installed Terminal MCP SDK version: ${installedSdk.version}`);
  const installedZod = JSON.parse(fs.readFileSync(path.join(repoRoot, 'providers', 'terminal', 'node_modules', 'zod', 'package.json'), 'utf8'));
  if (installedZod.version !== '4.4.3') throw new Error(`unexpected installed Terminal zod version: ${installedZod.version}`);
}
if (code) {
  if (profile !== 'personal') throw new Error('Code facade is private to the personal profile');
  if (code.command !== 'node') throw new Error('Code facade must run with node');
  const expectedServer = path.join(repoRoot, 'providers', 'code-router', 'server.mjs');
  if (JSON.stringify(code.args ?? []) !== JSON.stringify([expectedServer])) throw new Error('unexpected Code facade server path');
  const env = code.env ?? {};
  if (!path.isAbsolute(env.MCP_CODE_DEFAULT_CWD ?? '')) throw new Error('personal MCP_CODE_DEFAULT_CWD must be absolute');
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'providers', 'code-router', 'package.json'), 'utf8'));
  if (pkg.dependencies?.['@modelcontextprotocol/sdk'] !== '1.30.0') throw new Error('unexpected Code facade MCP SDK pin');
  if (pkg.dependencies?.zod !== '4.4.3') throw new Error('unexpected Code facade zod pin');
  const installedSdk = JSON.parse(fs.readFileSync(path.join(repoRoot, 'providers', 'code-router', 'node_modules', '@modelcontextprotocol', 'sdk', 'package.json'), 'utf8'));
  if (installedSdk.version !== '1.30.0') throw new Error(`unexpected installed Code facade MCP SDK version: ${installedSdk.version}`);
}
if (dev) {
  const pkgFile = path.join(repoRoot, 'providers', 'pi-dev', 'node_modules', '@earendil-works', 'pi-coding-agent', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  if (pkg.version !== '0.84.1') throw new Error(`unexpected Pi version: ${pkg.version}`);
  const env = dev.env ?? {};
  if (!path.isAbsolute(env.MCP_DEV_STATE_DIR ?? '')) throw new Error('MCP_DEV_STATE_DIR must be absolute');
  if (!/^[1-9][0-9]*$/.test(env.MCP_DEV_MAX_OUTPUT_BYTES ?? '')) throw new Error('MCP_DEV_MAX_OUTPUT_BYTES must be a positive integer');
  if (!/^[1-9][0-9]*$/.test(env.MCP_DEV_MAX_SPOOL_BYTES ?? '')) throw new Error('MCP_DEV_MAX_SPOOL_BYTES must be a positive integer');
  if (!/^[1-9][0-9]*$/.test(env.MCP_DEV_SPOOL_TTL_SECONDS ?? '')) throw new Error('MCP_DEV_SPOOL_TTL_SECONDS must be a positive integer');
  if (!/^[1-9][0-9]*$/.test(env.MCP_DEV_SPOOL_MAX_TOTAL_BYTES ?? '')) throw new Error('MCP_DEV_SPOOL_MAX_TOTAL_BYTES must be a positive integer');
  if (Number(env.MCP_DEV_SPOOL_MAX_TOTAL_BYTES) < Number(env.MCP_DEV_MAX_SPOOL_BYTES)) throw new Error('MCP_DEV_SPOOL_MAX_TOTAL_BYTES must be >= MCP_DEV_MAX_SPOOL_BYTES');
  if (!['allowlist', 'unrestricted'].includes(env.MCP_DEV_SHELL_MODE)) throw new Error('MCP_DEV_SHELL_MODE must be allowlist or unrestricted');
  if (profile === 'personal') {
    if (env.MCP_DEV_PATH_MODE !== 'user') throw new Error('personal MCP_DEV_PATH_MODE must be user');
    if (!path.isAbsolute(env.MCP_DEV_DEFAULT_CWD ?? '')) throw new Error('personal MCP_DEV_DEFAULT_CWD must be absolute');
    if (env.MCP_DEV_WORKSPACE_ROOT !== undefined) throw new Error('personal dev provider must not use MCP_DEV_WORKSPACE_ROOT');
    if (!path.isAbsolute(env.MCP_DEV_TERMINAL_SOCKET ?? '')) throw new Error('personal MCP_DEV_TERMINAL_SOCKET must be absolute');
    if (path.basename(env.MCP_DEV_TERMINAL_SOCKET) !== 'wsl-agent-terminal.sock') throw new Error('unexpected personal dev Terminal broker socket name');
  } else {
    if (env.MCP_DEV_PATH_MODE !== 'workspace') throw new Error('public MCP_DEV_PATH_MODE must be workspace');
    if (!path.isAbsolute(env.MCP_DEV_WORKSPACE_ROOT ?? '')) throw new Error('MCP_DEV_WORKSPACE_ROOT must be absolute');
    if (env.MCP_DEV_DEFAULT_CWD !== undefined) throw new Error('public dev provider must not set MCP_DEV_DEFAULT_CWD');
    if (env.MCP_DEV_TERMINAL_SOCKET !== undefined) throw new Error('public dev provider must not set MCP_DEV_TERMINAL_SOCKET');
  }
}
NODE
fi

URL="${1:-http://127.0.0.1:3050/mcp}"
echo "== MCP initialize against $URL =="
curl -sf -m 5 -X POST "$URL" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0.0"}}}'
echo
echo
echo "(connectivity check only; inspect dev plus restricted-only shell for public profiles, or dev + qualified Code and Terminal providers for personal composition)"
