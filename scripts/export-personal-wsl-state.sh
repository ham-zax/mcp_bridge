#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_HOME="${HOME:-$(getent passwd "$(id -u)" | cut -d: -f6)}"
STATE_BASE="${XDG_STATE_HOME:-$USER_HOME/.local/state}"
STATE_DIR="${MCP_BRIDGE_STATE_DIR:-$STATE_BASE/mcp-dev-bridge}"
OUTPUT=""

usage() {
  cat <<'EOF'
Usage: scripts/export-personal-wsl-state.sh [options]

Create one private migration archive for moving the personal harness to a fresh
Ubuntu WSL install. Stop mcp-dev-bridge first so OAuth/session and browser
profile state are captured consistently.

Options:
  --output PATH     Archive path (default: ~/mcp-dev-bridge-wsl-private-<timestamp>.tar.gz)
  --state-dir PATH  Persistent bridge state root override
  --help            Show this help
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --output)
      [ "$#" -ge 2 ] || { echo "missing value for --output" >&2; exit 2; }
      OUTPUT="$2"
      shift 2
      ;;
    --state-dir)
      [ "$#" -ge 2 ] || { echo "missing value for --state-dir" >&2; exit 2; }
      STATE_DIR="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

OUTPUT="${OUTPUT:-$USER_HOME/mcp-dev-bridge-wsl-private-$(date +%Y%m%d-%H%M%S).tar.gz}"
case "$OUTPUT" in
  /*) ;;
  *) OUTPUT="$PWD/$OUTPUT" ;;
esac

command -v tar >/dev/null 2>&1 || { echo "tar is required" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "node is required" >&2; exit 1; }
[ -f "$ROOT/.env" ] || { echo "missing deployment file: $ROOT/.env" >&2; exit 1; }
CONFIG_DIR="$USER_HOME/.config/mcp-dev-bridge"
[ -d "$CONFIG_DIR" ] || { echo "missing private config directory: $CONFIG_DIR" >&2; exit 1; }

if command -v systemctl >/dev/null 2>&1 && systemctl --user is-active --quiet mcp-dev-bridge.service 2>/dev/null; then
  echo "mcp-dev-bridge.service is active; stop it before exporting private state" >&2
  echo "  systemctl --user stop mcp-dev-bridge.service" >&2
  exit 1
fi

SERVER_PID_FILE="$STATE_DIR/1mcp/server.pid"
if [ -f "$SERVER_PID_FILE" ]; then
  server_pid="$(tr -cd '0-9' < "$SERVER_PID_FILE")"
  if [ -n "$server_pid" ] && kill -0 "$server_pid" 2>/dev/null; then
    echo "1MCP is still running as pid $server_pid; stop the bridge before exporting" >&2
    exit 1
  fi
fi

if [ -d "$STATE_DIR/clearcote/profiles" ]; then
  while IFS= read -r endpoint; do
    port="$(sed -n '1p' "$endpoint" 2>/dev/null || true)"
    case "$port" in
      ''|*[!0-9]*) continue ;;
    esac
    if curl --silent --fail --max-time 1 "http://127.0.0.1:$port/json/version" >/dev/null 2>&1; then
      echo "a managed Clearcote profile is still live at $endpoint; stop the bridge before exporting" >&2
      exit 1
    fi
  done < <(find "$STATE_DIR/clearcote/profiles" -name DevToolsActivePort -type f -print)
fi

manifest_root="$(mktemp -d)"
trap 'rm -rf "$manifest_root"' EXIT
mkdir -p "$manifest_root/manifest"
printf '1\n' > "$manifest_root/manifest/version"
printf '%s\n' "$USER_HOME" > "$manifest_root/manifest/source-home"
printf '%s\n' "$ROOT" > "$manifest_root/manifest/source-repo-root"
printf '%s\n' "$STATE_DIR" > "$manifest_root/manifest/source-state-dir"
date -u +%Y-%m-%dT%H:%M:%SZ > "$manifest_root/manifest/created-at"

node --input-type=module - "$ROOT/.env" "$CONFIG_DIR" "$USER_HOME" "$STATE_DIR" <<'NODE' > "$manifest_root/manifest/external-paths.txt"
import fs from 'node:fs';
import path from 'node:path';

const [envFile, configDir, home, stateDir] = process.argv.slice(2);
const bundled = [
  configDir,
  stateDir,
  path.join(home, '.cloudflared'),
  path.join(home, '.agents'),
  path.join(home, '.local', 'share', 'mcp-dev-bridge', 'x-content-memory')
].map(value => path.resolve(value));
const found = new Set();

function consider(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) return;
  const resolved = path.resolve(value);
  if (bundled.some(prefix => resolved === prefix || resolved.startsWith(`${prefix}${path.sep}`))) return;
  found.add(resolved);
}

function walk(value) {
  if (typeof value === 'string') return consider(value);
  if (Array.isArray(value)) return value.forEach(walk);
  if (value && typeof value === 'object') Object.values(value).forEach(walk);
}

for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*[A-Za-z_][A-Za-z0-9_]*=(.*)$/);
  if (!match) continue;
  let value = match[1].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  consider(value);
}

function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(full);
    else if (entry.isFile() && entry.name.endsWith('.json')) {
      try { walk(JSON.parse(fs.readFileSync(full, 'utf8'))); } catch { /* non-JSON or partial file */ }
    }
  }
}
visit(configDir);

for (const value of [...found].sort()) console.log(value);
NODE

mkdir -p "$(dirname "$OUTPUT")"
[ ! -e "$OUTPUT" ] || { echo "refusing to overwrite existing archive: $OUTPUT" >&2; exit 1; }

declare -a tar_args=(
  -czf "$OUTPUT"
  --exclude='*/DevToolsActivePort'
  --exclude='*/SingletonCookie'
  --exclude='*/SingletonLock'
  --exclude='*/SingletonSocket'
  -C "$manifest_root" manifest
)

add_path() {
  local value="$1"
  [ -e "$value" ] || return 0
  tar_args+=( -C / "${value#/}" )
}

add_path "$ROOT/.env"
add_path "$CONFIG_DIR"
add_path "$USER_HOME/.cloudflared"
add_path "$USER_HOME/.agents"
add_path "$USER_HOME/.local/share/mcp-dev-bridge/x-content-memory"
add_path "$STATE_DIR/clearcote/profiles"
add_path "$STATE_DIR/1mcp/runtime-identity.json"
add_path "$STATE_DIR/1mcp/template-context-capability.json"
add_path "$STATE_DIR/1mcp/presets.json"
add_path "$STATE_DIR/1mcp/admin"
add_path "$STATE_DIR/1mcp/sessions/sessions/.migrated-to-server"
add_path "$STATE_DIR/1mcp/sessions/sessions/server"

tar "${tar_args[@]}"
chmod 0600 "$OUTPUT"

printf 'Private WSL migration archive: %s\n' "$OUTPUT"
du -h "$OUTPUT" | awk '{print "Archive size: "$1}'
if [ -s "$manifest_root/manifest/external-paths.txt" ]; then
  echo "External paths are not bundled; restore/reclone them before bootstrap:"
  sed 's/^/  /' "$manifest_root/manifest/external-paths.txt"
else
  echo "No external absolute-path dependencies were discovered in deployment/config JSON."
fi
