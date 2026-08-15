#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILURES=0
TESTS=0
pass() { printf 'ok - %s\n' "$1"; }
fail() { printf 'not ok - %s\n' "$1"; FAILURES=$((FAILURES + 1)); }
run_test() { local name="$1"; shift; TESTS=$((TESTS + 1)); if "$@"; then pass "$name"; else fail "$name"; fi; }

test_codedb_candidate_removed() {
  [ ! -e "$ROOT/scripts/install-codedb.sh" ] &&
  [ ! -e "$ROOT/scripts/codedb-mcp.sh" ] &&
  node - "$ROOT/config/templates/mcp.json" <<'NODE'
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (cfg.mcpServers?.codedb) process.exit(1);
NODE
}

test_final_rendered_composition() {
  local tmp profile
  tmp="$(mktemp -d)" || return 1
  cat > "$tmp/deployment.env" <<'ENV'
MCP_WORKSPACE_ROOT=/tmp/example-workspace
MCP_PUBLIC_URL=https://mcp.example.test
MCP_TUNNEL_NAME=
ENV
  for profile in restricted trusted-dev; do
    node "$ROOT/scripts/render-config.mjs" \
      --profile "$profile" \
      --env-file "$tmp/deployment.env" \
      --state-dir "$tmp/$profile" \
      --repo-root "$ROOT" >/dev/null || { rm -rf "$tmp"; return 1; }
  done
  node - "$tmp/restricted/1mcp/mcp.json" "$tmp/trusted-dev/1mcp/mcp.json" <<'NODE2'
const fs = require('fs');
const [restrictedFile, trustedFile] = process.argv.slice(2);
const restricted = JSON.parse(fs.readFileSync(restrictedFile, 'utf8'));
const trusted = JSON.parse(fs.readFileSync(trustedFile, 'utf8'));
const keys = cfg => Object.keys(cfg.mcpServers ?? {}).sort();
if (JSON.stringify(keys(restricted)) !== JSON.stringify(['dev', 'shell'])) process.exit(1);
if (JSON.stringify(keys(trusted)) !== JSON.stringify(['dev'])) process.exit(1);
if (restricted.mcpServers?.codedb || trusted.mcpServers?.codedb) process.exit(1);
if (restricted.mcpServers?.filesystem || trusted.mcpServers?.filesystem) process.exit(1);
if (restricted.mcpServers.dev.env.MCP_DEV_SHELL_MODE !== 'allowlist') process.exit(1);
if (trusted.mcpServers.dev.env.MCP_DEV_SHELL_MODE !== 'unrestricted') process.exit(1);
NODE2
  local rc=$?
  rm -rf "$tmp"
  return "$rc"
}


test_pi_provider_structure() {
  node - "$ROOT/providers/pi-dev/package.json" <<'NODE'
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const expected = {
  '@earendil-works/pi-coding-agent': '0.84.1',
  '@modelcontextprotocol/sdk': '1.30.0',
  zod: '4.4.3',
};
for (const [name, version] of Object.entries(expected)) {
  if (pkg.dependencies?.[name] !== version) process.exit(1);
}
NODE
  for file in boundary.mjs files.mjs shell.mjs render.mjs server.mjs package-lock.json; do
    [ -f "$ROOT/providers/pi-dev/$file" ] || return 1
  done
  for file in boundary.test.mjs files.test.mjs shell.test.mjs render.test.mjs server.test.mjs; do
    [ -f "$ROOT/providers/pi-dev/test/$file" ] || return 1
  done
}

test_legacy_filesystem_dependency_removed() {
  ! grep -Fq '@modelcontextprotocol/server-filesystem' "$ROOT/config/templates/mcp.json" &&
  ! grep -Fq 'FILESYSTEM_MCP_VERSION' "$ROOT/scripts/setup.sh" &&
  ! grep -Fq '@modelcontextprotocol/server-filesystem' "$ROOT/scripts/setup.sh"
}

run_test 'losing CodeDB candidate is removed from source/template' test_codedb_candidate_removed
run_test 'final rendered provider composition matches Pi cutover' test_final_rendered_composition
run_test 'Pi dev provider pins and structure are complete' test_pi_provider_structure
run_test 'legacy filesystem dependency is removed after Pi cutover' test_legacy_filesystem_dependency_removed

printf '\n%d tests, %d failures\n' "$TESTS" "$FAILURES"
[ "$FAILURES" -eq 0 ]
