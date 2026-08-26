#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_HOME="${HOME:-$(getent passwd "$(id -u)" | cut -d: -f6)}"
STATE_BASE="${XDG_STATE_HOME:-$USER_HOME/.local/state}"
STATE_DIR="${MCP_BRIDGE_STATE_DIR:-$STATE_BASE/mcp-dev-bridge}"
ARCHIVE=""

usage() {
  cat <<'EOF'
Usage: scripts/import-personal-wsl-state.sh ARCHIVE [options]

Restore a private archive created by export-personal-wsl-state.sh into a fresh
Ubuntu WSL user profile. Run this after cloning the repository and before the
first personal bootstrap/start.

Options:
  --state-dir PATH  Persistent bridge state root override
  --help            Show this help
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --state-dir)
      [ "$#" -ge 2 ] || { echo "missing value for --state-dir" >&2; exit 2; }
      STATE_DIR="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    --*)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      [ -z "$ARCHIVE" ] || { echo "only one archive may be supplied" >&2; exit 2; }
      ARCHIVE="$1"
      shift
      ;;
  esac
done

[ -n "$ARCHIVE" ] || { usage >&2; exit 2; }
case "$ARCHIVE" in
  /*) ;;
  *) ARCHIVE="$PWD/$ARCHIVE" ;;
esac
[ -f "$ARCHIVE" ] || { echo "migration archive not found: $ARCHIVE" >&2; exit 1; }
command -v tar >/dev/null 2>&1 || { echo "tar is required" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "node is required" >&2; exit 1; }

bundle_version="$(tar -xOf "$ARCHIVE" manifest/version 2>/dev/null || true)"
[ "$bundle_version" = "1" ] || { echo "unsupported or invalid migration archive" >&2; exit 1; }
SOURCE_HOME="$(tar -xOf "$ARCHIVE" manifest/source-home)"
SOURCE_REPO="$(tar -xOf "$ARCHIVE" manifest/source-repo-root)"
SOURCE_STATE="$(tar -xOf "$ARCHIVE" manifest/source-state-dir)"
for value in "$SOURCE_HOME" "$SOURCE_REPO" "$SOURCE_STATE"; do
  case "$value" in
    /*) ;;
    *) echo "migration manifest contains a non-absolute source path" >&2; exit 1 ;;
  esac
done

home_prefix="${SOURCE_HOME#/}"
repo_prefix="${SOURCE_REPO#/}"
state_prefix="${SOURCE_STATE#/}"
while IFS= read -r member; do
  case "$member" in
    /*|../*|*/../*|*/..) echo "unsafe archive member: $member" >&2; exit 1 ;;
  esac
  case "$member" in
    manifest|manifest/*|"$home_prefix"|"$home_prefix"/*|"$repo_prefix"|"$repo_prefix"/*|"$state_prefix"|"$state_prefix"/*) ;;
    *) echo "unexpected archive member outside declared source roots: $member" >&2; exit 1 ;;
  esac
done < <(tar -tzf "$ARCHIVE")

extract_root="$(mktemp -d)"
trap 'rm -rf "$extract_root"' EXIT
tar -xzf "$ARCHIVE" -C "$extract_root"

SRC_ENV="$extract_root/${SOURCE_REPO#/}/.env"
SRC_CONFIG="$extract_root/${SOURCE_HOME#/}/.config/mcp-dev-bridge"
SRC_CLOUDFLARED="$extract_root/${SOURCE_HOME#/}/.cloudflared"
SRC_AGENTS="$extract_root/${SOURCE_HOME#/}/.agents"
SRC_X_MEMORY="$extract_root/${SOURCE_HOME#/}/.local/share/mcp-dev-bridge/x-content-memory"
SRC_CLEARCOTE="$extract_root/${SOURCE_STATE#/}/clearcote/profiles"
SRC_ONE_MCP="$extract_root/${SOURCE_STATE#/}/1mcp"

[ -f "$SRC_ENV" ] || { echo "archive is missing the deployment .env" >&2; exit 1; }
[ -d "$SRC_CONFIG" ] || { echo "archive is missing ~/.config/mcp-dev-bridge" >&2; exit 1; }

refuse_existing() {
  local source="$1" target="$2"
  [ -e "$source" ] || return 0
  [ ! -e "$target" ] || { echo "refusing to overwrite existing migration target: $target" >&2; exit 1; }
}

refuse_existing "$SRC_ENV" "$ROOT/.env"
refuse_existing "$SRC_CONFIG" "$USER_HOME/.config/mcp-dev-bridge"
refuse_existing "$SRC_CLOUDFLARED" "$USER_HOME/.cloudflared"
refuse_existing "$SRC_AGENTS" "$USER_HOME/.agents"
refuse_existing "$SRC_X_MEMORY" "$USER_HOME/.local/share/mcp-dev-bridge/x-content-memory"
refuse_existing "$SRC_CLEARCOTE" "$STATE_DIR/clearcote/profiles"
refuse_existing "$SRC_ONE_MCP" "$STATE_DIR/1mcp"

install -d -m 0700 "$USER_HOME/.config" "$USER_HOME/.local/share" "$STATE_DIR"
cp -a "$SRC_ENV" "$ROOT/.env"
chmod 0600 "$ROOT/.env"
cp -a "$SRC_CONFIG" "$USER_HOME/.config/mcp-dev-bridge"
[ ! -d "$SRC_CLOUDFLARED" ] || cp -a "$SRC_CLOUDFLARED" "$USER_HOME/.cloudflared"
[ ! -d "$SRC_AGENTS" ] || cp -a "$SRC_AGENTS" "$USER_HOME/.agents"
if [ -d "$SRC_X_MEMORY" ]; then
  install -d -m 0700 "$USER_HOME/.local/share/mcp-dev-bridge"
  cp -a "$SRC_X_MEMORY" "$USER_HOME/.local/share/mcp-dev-bridge/x-content-memory"
fi
if [ -d "$SRC_CLEARCOTE" ]; then
  install -d -m 0700 "$STATE_DIR/clearcote"
  cp -a "$SRC_CLEARCOTE" "$STATE_DIR/clearcote/profiles"
fi
if [ -d "$SRC_ONE_MCP" ]; then
  cp -a "$SRC_ONE_MCP" "$STATE_DIR/1mcp"
fi
chmod 0700 "$USER_HOME/.config/mcp-dev-bridge" "$STATE_DIR"

node --input-type=module - "$SOURCE_HOME" "$USER_HOME" \
  "$ROOT/.env" \
  "$USER_HOME/.config/mcp-dev-bridge" \
  "$USER_HOME/.cloudflared" \
  "$USER_HOME/.agents" \
  "$USER_HOME/.local/share/mcp-dev-bridge/x-content-memory" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';

const [from, to, ...roots] = process.argv.slice(2);
const before = Buffer.from(from);
const after = Buffer.from(to);
if (before.equals(after)) process.exit(0);

function rewrite(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 8 * 1024 * 1024) return;
  const data = fs.readFileSync(file);
  if (data.includes(0)) return;
  const text = data.toString('utf8');
  if (!text.includes(from)) return;
  fs.writeFileSync(file, text.split(from).join(to), { mode: stat.mode & 0o777 });
}

function visit(value) {
  if (!fs.existsSync(value)) return;
  const stat = fs.lstatSync(value);
  if (stat.isSymbolicLink()) return;
  if (stat.isFile()) return rewrite(value);
  if (!stat.isDirectory()) return;
  for (const entry of fs.readdirSync(value)) visit(path.join(value, entry));
}
for (const root of roots) visit(root);
NODE

external_paths="$(tar -xOf "$ARCHIVE" manifest/external-paths.txt 2>/dev/null || true)"
echo "Private WSL state restored."
if [ -n "$external_paths" ]; then
  echo "Restore or reclone these external source paths under the equivalent new-home locations before starting workflows:"
  while IFS= read -r value; do
    [ -n "$value" ] || continue
    case "$value" in
      "$SOURCE_HOME"/*) printf '  %s -> %s/%s\n' "$value" "$USER_HOME" "${value#"$SOURCE_HOME"/}" ;;
      *) printf '  %s\n' "$value" ;;
    esac
  done <<< "$external_paths"
fi
cat <<EOF

Next:
1. Ensure Ubuntu WSL has Node.js 24+, npm, uv/uvx, cloudflared, and systemd enabled.
2. Run: scripts/bootstrap-personal.sh --enable-startup
3. Run: bin/status
4. Reconnect/refresh the ChatGPT MCP client if its connection does not resume automatically.
EOF
