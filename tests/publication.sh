#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILURES=0
TESTS=0

pass() { printf 'ok - %s\n' "$1"; }
fail() { printf 'not ok - %s\n' "$1"; FAILURES=$((FAILURES + 1)); }
run_test() {
  local name="$1"
  shift
  TESTS=$((TESTS + 1))
  if "$@"; then pass "$name"; else fail "$name"; fi
}
contains() { grep -Eq "$2" "$1"; }

public_tracked_files() {
  git -C "$ROOT" ls-files | while IFS= read -r path; do
    case "$path" in
      docs/superpowers/*) continue ;;
    esac
    printf '%s\n' "$path"
  done
}

test_public_entrypoints() {
  [ -x "$ROOT/bin/start" ] && [ -x "$ROOT/bin/status" ] && [ -x "$ROOT/bin/stop" ]
}

test_public_structure() {
  [ -f "$ROOT/config/templates/mcp.json" ] && \
  [ -f "$ROOT/config/profiles/restricted.env" ] && \
  [ -f "$ROOT/config/profiles/trusted-dev.env" ] && \
  [ -f "$ROOT/systemd/mcp-dev-bridge.service.in" ] && \
  [ -f "$ROOT/providers/legacy-shell/server.py" ] && \
  [ -f "$ROOT/scripts/render-config.mjs" ]
}

test_explicit_profile_contract() {
  grep -Fq -- '--profile' "$ROOT/scripts/setup.sh" || return 1
  contains "$ROOT/scripts/setup.sh" 'restricted' || return 1
  contains "$ROOT/scripts/setup.sh" 'trusted-dev' || return 1
  if contains "$ROOT/scripts/setup.sh" 'BRIDGE_SETUP_SKIP_INSTALL'; then
    local out rc
    out="$(BRIDGE_SETUP_SKIP_INSTALL=1 "$ROOT/scripts/setup.sh" 2>&1)"
    rc=$?
    [ "$rc" -ne 0 ] || return 1
    grep -q 'restricted' <<<"$out" && grep -q 'trusted-dev' <<<"$out"
  else
    return 1
  fi
}

test_profiles_are_distinct() {
  contains "$ROOT/config/profiles/trusted-dev.env" '^MCP_SHELL_ALLOW_DANGEROUS=ALL$' && \
  ! contains "$ROOT/config/profiles/restricted.env" '^MCP_SHELL_ALLOW_DANGEROUS=ALL$'
}

test_renderer_generates_both_profiles() {
  local tmp env_file state profile config
  tmp="$(mktemp -d)" || return 1
  env_file="$tmp/deployment.env"
  cat > "$env_file" <<'EOF'
MCP_WORKSPACE_ROOT=/tmp/example-workspace
MCP_PUBLIC_URL=https://mcp.example.test
MCP_TUNNEL_NAME=
EOF
  for profile in restricted trusted-dev; do
    state="$tmp/$profile"
    node "$ROOT/scripts/render-config.mjs" --profile "$profile" --env-file "$env_file" --state-dir "$state" --repo-root "$ROOT" >/dev/null || { rm -rf "$tmp"; return 1; }
    config="$state/1mcp/mcp.json"
    node -e 'const fs=require("fs"); const c=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!c.mcpServers?.filesystem || !c.mcpServers?.shell) process.exit(1)' "$config" || { rm -rf "$tmp"; return 1; }
    grep -Fq '/tmp/example-workspace' "$config" || { rm -rf "$tmp"; return 1; }
    grep -Fq "$ROOT/providers/legacy-shell/server.py" "$config" || { rm -rf "$tmp"; return 1; }
    grep -Fq "MCP_BRIDGE_PROFILE='$profile'" "$state/bridge.env" || { rm -rf "$tmp"; return 1; }
  done
  grep -Fq '"MCP_SHELL_ALLOW_DANGEROUS": "ALL"' "$tmp/trusted-dev/1mcp/mcp.json" || { rm -rf "$tmp"; return 1; }
  grep -Fq '"MCP_SHELL_ALLOW_DANGEROUS": ""' "$tmp/restricted/1mcp/mcp.json" || { rm -rf "$tmp"; return 1; }
  rm -rf "$tmp"
}

test_env_is_ignored() {
  git -C "$ROOT" check-ignore -q .env
}

test_state_defaults_are_external() {
  local common="$ROOT/lib/bridge/common.sh"
  [ -f "$common" ] || common="$ROOT/scripts/bridge-common.sh"
  contains "$common" 'XDG_RUNTIME_DIR' && \
  contains "$common" 'XDG_STATE_HOME' && \
  ! contains "$common" 'BRIDGE_RUN_DIR=.*BRIDGE_ROOT/run' && \
  ! contains "$common" 'BRIDGE_CONFIG_DIR=.*BRIDGE_ROOT/config'
}

test_no_personal_identity_in_public_files() {
  local path
  while IFS= read -r path; do
    [ -f "$ROOT/$path" ] || continue
    if grep -I -nE '/home/hamza|mcp\.hamza\.my\.id|DESKTOP-HQOUFCO|hamza-cloudflare-oauth-bridge|Hamza WSL' "$ROOT/$path" >/dev/null 2>&1; then
      echo "personal deployment identity found in $path" >&2
      return 1
    fi
  done < <(public_tracked_files)
}

test_generic_systemd_template() {
  local unit="$ROOT/systemd/mcp-dev-bridge.service.in"
  [ -f "$unit" ] && \
  contains "$unit" 'ExecStart=@REPO_ROOT@/bin/start' && \
  contains "$unit" 'ExecStop=@REPO_ROOT@/bin/stop' && \
  contains "$unit" 'EnvironmentFile=-@STATE_DIR@/bridge\.env'
}

test_systemd_installer_renders_without_live_manager() {
  local tmp target unit
  tmp="$(mktemp -d)" || return 1
  target="$tmp/systemd"
  mkdir -p "$tmp/home" "$target"
  HOME="$tmp/home" BRIDGE_STATE_DIR="$tmp/state" BRIDGE_SYSTEMD_TARGET_DIR="$target" \
    BRIDGE_SYSTEMD_DRY_RUN=1 "$ROOT/scripts/install-systemd-user.sh" >/dev/null || { rm -rf "$tmp"; return 1; }
  unit="$target/mcp-dev-bridge.service"
  [ -f "$unit" ] || { rm -rf "$tmp"; return 1; }
  ! grep -q '@[A-Z_][A-Z_]*@' "$unit" || { rm -rf "$tmp"; return 1; }
  grep -Fq "ExecStart=$ROOT/bin/start" "$unit" || { rm -rf "$tmp"; return 1; }
  grep -Fq "EnvironmentFile=-$tmp/state/bridge.env" "$unit" || { rm -rf "$tmp"; return 1; }
  if command -v systemd-analyze >/dev/null 2>&1; then
    systemd-analyze verify "$unit" >/dev/null 2>&1 || { rm -rf "$tmp"; return 1; }
  fi
  rm -rf "$tmp"
}

run_test 'public bin entrypoints exist and are executable' test_public_entrypoints
run_test 'publication directory structure exists' test_public_structure
run_test 'setup requires explicit trust profile' test_explicit_profile_contract
run_test 'trusted-dev is unrestricted while restricted is not' test_profiles_are_distinct
run_test 'renderer generates valid external state for both profiles' test_renderer_generates_both_profiles
run_test '.env remains ignored' test_env_is_ignored
run_test 'runtime and 1MCP state default outside the repository' test_state_defaults_are_external
run_test 'public tracked files contain no personal deployment identity' test_no_personal_identity_in_public_files
run_test 'generic systemd template targets public bin entrypoints' test_generic_systemd_template
run_test 'systemd installer renders a valid fixture without live manager' test_systemd_installer_renders_without_live_manager

printf '\n%s tests, %s failures\n' "$TESTS" "$FAILURES"
[ "$FAILURES" -eq 0 ]
