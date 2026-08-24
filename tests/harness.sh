#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILURES=0
TESTS=0
pass() { printf 'ok - %s\n' "$1"; }
fail() { printf 'not ok - %s\n' "$1"; FAILURES=$((FAILURES + 1)); }
run_test() { local name="$1"; shift; TESTS=$((TESTS + 1)); if "$@"; then pass "$name"; else fail "$name"; fi; }

test_raw_codedb_surface_removed() {
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
MCP_DEV_MAX_SPOOL_BYTES=2048
MCP_DEV_SPOOL_TTL_SECONDS=3600
MCP_DEV_SPOOL_MAX_TOTAL_BYTES=8192
MCP_ONE_MCP_LOG_MAX_SIZE_BYTES=1048576
MCP_ONE_MCP_LOG_MAX_FILES=3
ENV
  mkdir -p "$tmp/runtime" "$tmp/home"
  for profile in restricted trusted-dev personal; do
    env -u MCP_DEV_MAX_SPOOL_BYTES -u MCP_DEV_SPOOL_TTL_SECONDS -u MCP_DEV_SPOOL_MAX_TOTAL_BYTES -u MCP_TERMINAL_FRONTEND \
      HOME="$tmp/home" XDG_RUNTIME_DIR="$tmp/runtime" node "$ROOT/scripts/render-config.mjs" \
      --profile "$profile" \
      --env-file "$tmp/deployment.env" \
      --state-dir "$tmp/$profile" \
      --repo-root "$ROOT" >/dev/null || { rm -rf "$tmp"; return 1; }
  done
  node - "$tmp/restricted/1mcp/mcp.json" "$tmp/trusted-dev/1mcp/mcp.json" "$tmp/personal/1mcp/mcp.json" "$tmp/personal/local-1mcp/mcp.json" "$tmp/personal/bridge.env" "$ROOT" "$tmp/runtime" "$tmp/home" <<'NODE2'
const fs = require('fs');
const [restrictedFile, trustedFile, personalFile, personalLocalFile, personalEnvFile, root, runtimeDir, personalHome] = process.argv.slice(2);
const restricted = JSON.parse(fs.readFileSync(restrictedFile, 'utf8'));
const trusted = JSON.parse(fs.readFileSync(trustedFile, 'utf8'));
const personal = JSON.parse(fs.readFileSync(personalFile, 'utf8'));
const personalLocal = JSON.parse(fs.readFileSync(personalLocalFile, 'utf8'));
const personalEnv = fs.readFileSync(personalEnvFile, 'utf8');
const keys = cfg => Object.keys(cfg.mcpServers ?? {}).sort();
if (JSON.stringify(keys(restricted)) !== JSON.stringify(['dev', 'shell'])) process.exit(1);
if (JSON.stringify(keys(trusted)) !== JSON.stringify(['dev'])) process.exit(1);
if (JSON.stringify(keys(personal)) !== JSON.stringify(['code', 'dev', 'local', 'terminal'])) process.exit(1);
if (JSON.stringify(keys(personalLocal)) !== JSON.stringify(['browser'])) process.exit(1);
if (restricted.mcpServers?.code || trusted.mcpServers?.code) process.exit(1);
if (restricted.mcpServers?.terminal || trusted.mcpServers?.terminal) process.exit(1);
if (restricted.mcpServers?.local || trusted.mcpServers?.local) process.exit(1);
if (restricted.mcpServers?.browser || trusted.mcpServers?.browser || personal.mcpServers?.browser) process.exit(1);
if (restricted.mcpServers?.codedb || trusted.mcpServers?.codedb || personal.mcpServers?.codedb) process.exit(1);
if (restricted.mcpServers?.filesystem || trusted.mcpServers?.filesystem || personal.mcpServers?.filesystem) process.exit(1);
if (restricted.mcpServers.dev.env.MCP_DEV_SHELL_MODE !== 'allowlist') process.exit(1);
if (trusted.mcpServers.dev.env.MCP_DEV_SHELL_MODE !== 'unrestricted') process.exit(1);
if (restricted.mcpServers.dev.env.MCP_DEV_MAX_SPOOL_BYTES !== '2048') process.exit(1);
if (trusted.mcpServers.dev.env.MCP_DEV_MAX_SPOOL_BYTES !== '2048') process.exit(1);
if (personal.mcpServers.dev.env.MCP_DEV_MAX_SPOOL_BYTES !== '2048') process.exit(1);
if (restricted.mcpServers.dev.env.MCP_DEV_SPOOL_TTL_SECONDS !== '3600') process.exit(1);
if (trusted.mcpServers.dev.env.MCP_DEV_SPOOL_TTL_SECONDS !== '3600') process.exit(1);
if (personal.mcpServers.dev.env.MCP_DEV_SPOOL_TTL_SECONDS !== '3600') process.exit(1);
if (restricted.mcpServers.dev.env.MCP_DEV_SPOOL_MAX_TOTAL_BYTES !== '8192') process.exit(1);
if (trusted.mcpServers.dev.env.MCP_DEV_SPOOL_MAX_TOTAL_BYTES !== '8192') process.exit(1);
if (personal.mcpServers.dev.env.MCP_DEV_SPOOL_MAX_TOTAL_BYTES !== '8192') process.exit(1);
if (restricted.mcpServers.dev.env.MCP_DEV_PATH_MODE !== 'workspace') process.exit(1);
if (trusted.mcpServers.dev.env.MCP_DEV_PATH_MODE !== 'workspace') process.exit(1);
if (restricted.mcpServers.dev.env.MCP_DEV_TERMINAL_SOCKET !== undefined) process.exit(1);
if (trusted.mcpServers.dev.env.MCP_DEV_TERMINAL_SOCKET !== undefined) process.exit(1);
if (personal.mcpServers.dev.env.MCP_DEV_SHELL_MODE !== 'unrestricted') process.exit(1);
if (personal.mcpServers.dev.env.MCP_DEV_PATH_MODE !== 'user') process.exit(1);
if (personal.mcpServers.dev.env.MCP_DEV_DEFAULT_CWD !== personalHome) process.exit(1);
if (personal.mcpServers.dev.env.MCP_DEV_WORKSPACE_ROOT !== undefined) process.exit(1);
if (personal.mcpServers.dev.env.MCP_DEV_TERMINAL_SOCKET !== runtimeDir + '/wsl-agent-terminal.sock') process.exit(1);
if (personal.mcpServers.code.command !== 'node') process.exit(1);
if (!personal.mcpServers.code.args.includes(root + '/providers/code-router/server.mjs')) process.exit(1);
if (personal.mcpServers.code.env.MCP_CODE_DEFAULT_CWD !== personalHome) process.exit(1);
if (personal.mcpServers.terminal.command !== 'node') process.exit(1);
if (!personal.mcpServers.terminal.args.includes(root + '/providers/terminal/mcp-server.mjs')) process.exit(1);
if (personal.mcpServers.terminal.env.MCP_TERMINAL_SOCKET !== runtimeDir + '/wsl-agent-terminal.sock') process.exit(1);
if (personal.mcpServers.terminal.env.MCP_TERMINAL_FRONTEND !== 'kitty') process.exit(1);
if (personal.mcpServers.terminal.env.MCP_TERMINAL_READ_MAX_BYTES !== '65536') process.exit(1);
if (personal.mcpServers.local.command !== 'node') process.exit(1);
if (!personal.mcpServers.local.args.includes(root + '/providers/local-tools/server.mjs')) process.exit(1);
if (personal.mcpServers.local.env.MCP_LOCAL_INNER_CONFIG !== personalLocalFile) process.exit(1);
if (!personal.mcpServers.local.env.MCP_LOCAL_ONE_MCP_ENTRY.endsWith('/@1mcp/agent/build/index.js')) process.exit(1);
if (JSON.stringify(personal.mcpServers.local.tags) !== JSON.stringify(['local'])) process.exit(1);
if (personalLocal.mcpServers.browser.command !== 'node') process.exit(1);
if (!personalLocal.mcpServers.browser.args.includes(root + '/providers/browser/server.mjs')) process.exit(1);
if (personalLocal.mcpServers.browser.env.XDG_RUNTIME_DIR !== runtimeDir) process.exit(1);
if (personalLocal.mcpServers.browser.env.WAYLAND_DISPLAY !== 'wayland-0') process.exit(1);
if (personalLocal.mcpServers.browser.env.DISPLAY !== ':0') process.exit(1);
if (personalLocal.mcpServers.browser.env.PULSE_SERVER !== 'unix:/mnt/wslg/PulseServer') process.exit(1);
if (personalLocal.mcpServers.browser.tags !== undefined) process.exit(1);
if (!personalEnv.includes("MCP_BRIDGE_PROFILE='personal'")) process.exit(1);
NODE2
  local rc=$?
  if [ "$rc" -eq 0 ]; then
    for profile in restricted trusted-dev personal; do
      log_cfg="$tmp/$profile/1mcp/config.toml"
      grep -Fq '[auth]' "$log_cfg" || rc=1
      grep -Fq 'sessionTtl = 43200' "$log_cfg" || rc=1
      grep -Fq '[logging]' "$log_cfg" || rc=1
      grep -Fq "file = \"$tmp/$profile/logs/one-mcp.log\"" "$log_cfg" || rc=1
      grep -Fq 'maxSize = 1048576' "$log_cfg" || rc=1
      grep -Fq 'maxFiles = 3' "$log_cfg" || rc=1
    done
  fi
  rm -rf "$tmp"
  return "$rc"
}

test_dev_spool_limit_validation() {
  local tmp value output rc
  tmp="$(mktemp -d)" || return 1
  mkdir -p "$tmp/workspace" "$tmp/runtime" "$tmp/home"
  for value in 0 -1 nope 268435457; do
    cat > "$tmp/deployment.env" <<EOF
MCP_WORKSPACE_ROOT=$tmp/workspace
MCP_PUBLIC_URL=https://mcp.example.test
MCP_TUNNEL_NAME=
MCP_DEV_MAX_SPOOL_BYTES=$value
EOF
    output="$(env -u MCP_DEV_MAX_SPOOL_BYTES -u MCP_DEV_SPOOL_TTL_SECONDS -u MCP_DEV_SPOOL_MAX_TOTAL_BYTES \
      HOME="$tmp/home" XDG_RUNTIME_DIR="$tmp/runtime" node "$ROOT/scripts/render-config.mjs" \
      --profile trusted-dev \
      --env-file "$tmp/deployment.env" \
      --state-dir "$tmp/state-$value" \
      --repo-root "$ROOT" 2>&1)"
    rc=$?
    if [ "$rc" -eq 0 ] || ! grep -Fq 'MCP_DEV_MAX_SPOOL_BYTES must be an integer from 1 to 268435456' <<<"$output"; then
      rm -rf "$tmp"
      return 1
    fi
  done

  cat > "$tmp/deployment.env" <<EOF
MCP_WORKSPACE_ROOT=$tmp/workspace
MCP_PUBLIC_URL=https://mcp.example.test
MCP_TUNNEL_NAME=
MCP_DEV_SPOOL_TTL_SECONDS=0
EOF
  output="$(env -u MCP_DEV_MAX_SPOOL_BYTES -u MCP_DEV_SPOOL_TTL_SECONDS -u MCP_DEV_SPOOL_MAX_TOTAL_BYTES \
    HOME="$tmp/home" XDG_RUNTIME_DIR="$tmp/runtime" node "$ROOT/scripts/render-config.mjs" \
    --profile trusted-dev \
    --env-file "$tmp/deployment.env" \
    --state-dir "$tmp/state-invalid-ttl" \
    --repo-root "$ROOT" 2>&1)"
  rc=$?
  if [ "$rc" -eq 0 ] || ! grep -Fq 'MCP_DEV_SPOOL_TTL_SECONDS must be an integer from 1 to 31536000' <<<"$output"; then
    rm -rf "$tmp"
    return 1
  fi

  cat > "$tmp/deployment.env" <<EOF
MCP_WORKSPACE_ROOT=$tmp/workspace
MCP_PUBLIC_URL=https://mcp.example.test
MCP_TUNNEL_NAME=
MCP_DEV_MAX_SPOOL_BYTES=2048
MCP_DEV_SPOOL_MAX_TOTAL_BYTES=1024
EOF
  output="$(env -u MCP_DEV_MAX_SPOOL_BYTES -u MCP_DEV_SPOOL_TTL_SECONDS -u MCP_DEV_SPOOL_MAX_TOTAL_BYTES \
    HOME="$tmp/home" XDG_RUNTIME_DIR="$tmp/runtime" node "$ROOT/scripts/render-config.mjs" \
    --profile trusted-dev \
    --env-file "$tmp/deployment.env" \
    --state-dir "$tmp/state-invalid-budget" \
    --repo-root "$ROOT" 2>&1)"
  rc=$?
  if [ "$rc" -eq 0 ] || ! grep -Fq 'MCP_DEV_SPOOL_MAX_TOTAL_BYTES must be >= MCP_DEV_MAX_SPOOL_BYTES' <<<"$output"; then
    rm -rf "$tmp"
    return 1
  fi

  rm -rf "$tmp"
}

test_one_mcp_log_policy_validation() {
  local tmp value output rc
  tmp="$(mktemp -d)" || return 1
  mkdir -p "$tmp/workspace" "$tmp/runtime" "$tmp/home"
  for value in 0 1048575 nope 67108865; do
    cat > "$tmp/deployment.env" <<EOF
MCP_WORKSPACE_ROOT=$tmp/workspace
MCP_PUBLIC_URL=https://mcp.example.test
MCP_ONE_MCP_LOG_MAX_SIZE_BYTES=$value
EOF
    output="$(HOME="$tmp/home" XDG_RUNTIME_DIR="$tmp/runtime" node "$ROOT/scripts/render-config.mjs" \
      --profile trusted-dev --env-file "$tmp/deployment.env" --state-dir "$tmp/log-size-$value" --repo-root "$ROOT" 2>&1)"
    rc=$?
    if [ "$rc" -eq 0 ] || ! grep -Fq 'MCP_ONE_MCP_LOG_MAX_SIZE_BYTES must be an integer from 1048576 to 67108864' <<<"$output"; then
      rm -rf "$tmp"
      return 1
    fi
  done
  for value in 0 nope 11; do
    cat > "$tmp/deployment.env" <<EOF
MCP_WORKSPACE_ROOT=$tmp/workspace
MCP_PUBLIC_URL=https://mcp.example.test
MCP_ONE_MCP_LOG_MAX_FILES=$value
EOF
    output="$(HOME="$tmp/home" XDG_RUNTIME_DIR="$tmp/runtime" node "$ROOT/scripts/render-config.mjs" \
      --profile trusted-dev --env-file "$tmp/deployment.env" --state-dir "$tmp/log-files-$value" --repo-root "$ROOT" 2>&1)"
    rc=$?
    if [ "$rc" -eq 0 ] || ! grep -Fq 'MCP_ONE_MCP_LOG_MAX_FILES must be an integer from 1 to 10' <<<"$output"; then
      rm -rf "$tmp"
      return 1
    fi
  done
  rm -rf "$tmp"
}

test_terminal_frontend_selector() {
  local tmp value output rc profile
  tmp="$(mktemp -d)" || return 1
  mkdir -p "$tmp/workspace" "$tmp/runtime" "$tmp/home"

  for value in kitty windows-terminal; do
    cat > "$tmp/deployment.env" <<EOF
MCP_WORKSPACE_ROOT=$tmp/workspace
MCP_PUBLIC_URL=https://mcp.example.test
MCP_TERMINAL_FRONTEND=$value
EOF
    env -u MCP_TERMINAL_FRONTEND HOME="$tmp/home" XDG_RUNTIME_DIR="$tmp/runtime" node "$ROOT/scripts/render-config.mjs" \
      --profile personal --env-file "$tmp/deployment.env" --state-dir "$tmp/personal-$value" --repo-root "$ROOT" >/dev/null || {
        rm -rf "$tmp"
        return 1
      }
    node - "$tmp/personal-$value/1mcp/mcp.json" "$value" <<'NODE'
const fs = require('fs');
const [configFile, expected] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
if (config.mcpServers.terminal.env.MCP_TERMINAL_FRONTEND !== expected) process.exit(1);
NODE
    rc=$?
    [ "$rc" -eq 0 ] || { rm -rf "$tmp"; return "$rc"; }
  done

  cat > "$tmp/empty.env" <<EOF
MCP_WORKSPACE_ROOT=$tmp/workspace
MCP_PUBLIC_URL=https://mcp.example.test
MCP_TERMINAL_FRONTEND=
EOF
  env -u MCP_TERMINAL_FRONTEND HOME="$tmp/home" XDG_RUNTIME_DIR="$tmp/runtime" node "$ROOT/scripts/render-config.mjs" \
    --profile personal --env-file "$tmp/empty.env" --state-dir "$tmp/personal-empty" --repo-root "$ROOT" >/dev/null || {
      rm -rf "$tmp"
      return 1
    }
  node - "$tmp/personal-empty/1mcp/mcp.json" <<'NODE'
const fs = require('fs');
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (config.mcpServers.terminal.env.MCP_TERMINAL_FRONTEND !== 'kitty') process.exit(1);
NODE
  rc=$?
  [ "$rc" -eq 0 ] || { rm -rf "$tmp"; return "$rc"; }

  cat > "$tmp/deployment.env" <<EOF
MCP_WORKSPACE_ROOT=$tmp/workspace
MCP_PUBLIC_URL=https://mcp.example.test
MCP_TERMINAL_FRONTEND=kitty
EOF
  MCP_TERMINAL_FRONTEND=windows-terminal HOME="$tmp/home" XDG_RUNTIME_DIR="$tmp/runtime" node "$ROOT/scripts/render-config.mjs" \
    --profile personal --env-file "$tmp/deployment.env" --state-dir "$tmp/process-override" --repo-root "$ROOT" >/dev/null || {
      rm -rf "$tmp"
      return 1
    }
  node - "$tmp/process-override/1mcp/mcp.json" <<'NODE'
const fs = require('fs');
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (config.mcpServers.terminal.env.MCP_TERMINAL_FRONTEND !== 'windows-terminal') process.exit(1);
NODE
  rc=$?
  [ "$rc" -eq 0 ] || { rm -rf "$tmp"; return "$rc"; }

  cat > "$tmp/invalid.env" <<EOF
MCP_WORKSPACE_ROOT=$tmp/workspace
MCP_PUBLIC_URL=https://mcp.example.test
MCP_TERMINAL_FRONTEND=invalid
EOF
  output="$(env -u MCP_TERMINAL_FRONTEND HOME="$tmp/home" XDG_RUNTIME_DIR="$tmp/runtime" node "$ROOT/scripts/render-config.mjs" \
    --profile personal --env-file "$tmp/invalid.env" --state-dir "$tmp/personal-invalid" --repo-root "$ROOT" 2>&1)"
  rc=$?
  if [ "$rc" -eq 0 ] || ! grep -Fq 'MCP_TERMINAL_FRONTEND must be one of: kitty, windows-terminal' <<<"$output"; then
    rm -rf "$tmp"
    return 1
  fi

  for profile in restricted trusted-dev; do
    env -u MCP_TERMINAL_FRONTEND HOME="$tmp/home" XDG_RUNTIME_DIR="$tmp/runtime" node "$ROOT/scripts/render-config.mjs" \
      --profile "$profile" --env-file "$tmp/invalid.env" --state-dir "$tmp/$profile-invalid" --repo-root "$ROOT" >/dev/null || {
        rm -rf "$tmp"
        return 1
      }
  done

  rm -rf "$tmp"
}

test_personal_default_cwd_override() {
  local tmp output rc
  tmp="$(mktemp -d)" || return 1
  mkdir -p "$tmp/home" "$tmp/runtime" "$tmp/custom-cwd"
  cat > "$tmp/deployment.env" <<EOF
MCP_PUBLIC_URL=https://mcp.example.test
MCP_TUNNEL_NAME=
MCP_PERSONAL_DEFAULT_CWD=$tmp/custom-cwd
EOF

  HOME="$tmp/home" XDG_RUNTIME_DIR="$tmp/runtime" node "$ROOT/scripts/render-config.mjs" \
    --profile personal \
    --env-file "$tmp/deployment.env" \
    --state-dir "$tmp/state" \
    --repo-root "$ROOT" >/dev/null || { rm -rf "$tmp"; return 1; }

  node - "$tmp/state/1mcp/mcp.json" "$tmp/custom-cwd" <<'NODE'
const fs = require('fs');
const [configFile, expected] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
if (config.mcpServers.dev.env.MCP_DEV_DEFAULT_CWD !== expected) process.exit(1);
if (config.mcpServers.code.env.MCP_CODE_DEFAULT_CWD !== expected) process.exit(1);
NODE
  rc=$?
  [ "$rc" -eq 0 ] || { rm -rf "$tmp"; return "$rc"; }

  cat > "$tmp/invalid.env" <<'EOF'
MCP_PUBLIC_URL=https://mcp.example.test
MCP_TUNNEL_NAME=
MCP_PERSONAL_DEFAULT_CWD=relative/path
EOF
  output="$(HOME="$tmp/home" XDG_RUNTIME_DIR="$tmp/runtime" node "$ROOT/scripts/render-config.mjs" \
    --profile personal \
    --env-file "$tmp/invalid.env" \
    --state-dir "$tmp/invalid-state" \
    --repo-root "$ROOT" 2>&1)"
  rc=$?
  rm -rf "$tmp"
  [ "$rc" -ne 0 ] && grep -qi 'absolute' <<<"$output"
}

test_personal_runtime_files_have_no_machine_home() {
  local private_user private_home
  private_user="ham""za"
  private_home="/home/$private_user"
  ! grep -R -nF "$private_home" \
    "$ROOT/config/profiles/personal.env" \
    "$ROOT/config/templates/mcp-personal.json" \
    "$ROOT/systemd/wsl-agent-terminal-broker.service.in" \
    "$ROOT/providers/terminal/tmux.mjs" \
    "$ROOT/providers/terminal/broker.mjs" \
    "$ROOT/providers/code-router/server.mjs" \
    "$ROOT/providers/local-tools/server.mjs" \
    "$ROOT/providers/browser/server.mjs" \
    "$ROOT/config/templates/mcp-local.json" >/dev/null
}


test_personal_smoke_validation() {
  local tmp fakebin
  tmp="$(mktemp -d)" || return 1
  fakebin="$tmp/fakebin"
  mkdir -p "$fakebin" "$tmp/home" "$tmp/runtime"
  cat > "$tmp/deployment.env" <<'ENV'
MCP_PUBLIC_URL=https://mcp.example.test
MCP_TUNNEL_NAME=
ENV
  HOME="$tmp/home" XDG_RUNTIME_DIR="$tmp/runtime" node "$ROOT/scripts/render-config.mjs" \
    --profile personal \
    --env-file "$tmp/deployment.env" \
    --state-dir "$tmp/state" \
    --repo-root "$ROOT" >/dev/null || { rm -rf "$tmp"; return 1; }
  cat > "$fakebin/curl" <<'SH'
#!/usr/bin/env bash
printf '{}'
SH
  chmod +x "$fakebin/curl"
  HOME="$tmp/home" XDG_RUNTIME_DIR="$tmp/runtime" BRIDGE_STATE_DIR="$tmp/state" PATH="$fakebin:$PATH" \
    bash "$ROOT/scripts/smoke-local.sh" http://127.0.0.1:1/mcp >/dev/null
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

run_test 'raw CodeDB surface stays removed from public composition' test_raw_codedb_surface_removed
run_test 'final rendered composition places Browser behind Local only in personal mode' test_final_rendered_composition
run_test 'Dev spool deployment override rejects invalid values' test_dev_spool_limit_validation
run_test '1MCP rotating log deployment policy rejects invalid values' test_one_mcp_log_policy_validation
run_test 'personal Terminal frontend selector defaults, overrides, and validates in profile scope' test_terminal_frontend_selector
run_test 'personal default cwd supports an absolute deployment override' test_personal_default_cwd_override
run_test 'personal runtime files carry no machine-specific home path' test_personal_runtime_files_have_no_machine_home
run_test 'personal smoke validation accepts the private provider contract' test_personal_smoke_validation
run_test 'personal toolbox contract passes' bash "$ROOT/tests/personal-toolbox.sh"
run_test 'Pi dev provider pins and structure are complete' test_pi_provider_structure
run_test 'legacy filesystem dependency is removed after Pi cutover' test_legacy_filesystem_dependency_removed

printf '\n%d tests, %d failures\n' "$TESTS" "$FAILURES"
[ "$FAILURES" -eq 0 ]
