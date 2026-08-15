#!/usr/bin/env bash
set -euo pipefail

HERDR_BIN="${HERDR_BIN:-/tmp/herdr-v0.8.0}"
EXPECTED_SHA256="b872ea7e40fa2cb17e857ac9b62b1bf26db7b403c622f5d2f3f5b35f6e9acd28"
ROOT="$(mktemp -d -t herdr-handoff-XXXXXX)"
SESSION="agent3-handoff-$$"
OLD_SERVER=""

cleanup() {
  set +e
  "$HERDR_BIN" server stop >/dev/null 2>&1 || true
  [ -n "$OLD_SERVER" ] && wait "$OLD_SERVER" 2>/dev/null || true
  rm -rf "$ROOT"
}
trap cleanup EXIT

version="$($HERDR_BIN --version)"
sha="$(sha256sum "$HERDR_BIN" | awk '{print $1}')"
[ "$version" = "herdr 0.8.0" ] || { echo "unexpected Herdr version: $version" >&2; exit 1; }
[ "$sha" = "$EXPECTED_SHA256" ] || { echo "unexpected Herdr sha256: $sha" >&2; exit 1; }

mkdir -p "$ROOT/config" "$ROOT/state"
cat > "$ROOT/config.toml" <<'EOF'
onboarding = false
[update]
version_check = false
manifest_check = false
EOF
export XDG_CONFIG_HOME="$ROOT/config"
export XDG_STATE_HOME="$ROOT/state"
export HERDR_CONFIG_PATH="$ROOT/config.toml"
export HERDR_SESSION="$SESSION"
export SHELL=/bin/bash

"$HERDR_BIN" server >"$ROOT/server.out" 2>"$ROOT/server.err" &
OLD_SERVER=$!
for _ in $(seq 1 150); do
  "$HERDR_BIN" status server --json 2>/dev/null | jq -e '.running == true' >/dev/null && break
  sleep 0.02
done

workspace="$($HERDR_BIN workspace create --cwd /home/hamza --label handoff --no-focus)"
pane="$(printf '%s' "$workspace" | jq -r '.result.root_pane.pane_id')"
terminal_before="$(printf '%s' "$workspace" | jq -r '.result.root_pane.terminal_id')"
"$HERDR_BIN" pane run "$pane" "bash -lc 'i=0; while :; do printf \\\"HERDR_HANDOFF_TICK:%s\\\\n\\\" \\\"\$i\\\"; i=\$((i+1)); sleep 0.1; done'" >/dev/null
sleep 0.25
info_before="$($HERDR_BIN pane process-info --pane "$pane")"
shell_before="$(printf '%s' "$info_before" | jq -r '.result.process_info.shell_pid')"
foreground_before="$(printf '%s' "$info_before" | jq -r '.result.process_info.foreground_process_group_id')"
read_before="$($HERDR_BIN pane read "$pane" --source recent-unwrapped --lines 30)"
last_before="$(printf '%s\n' "$read_before" | grep HERDR_HANDOFF_TICK | tail -n1 || true)"

"$HERDR_BIN" server live-handoff >"$ROOT/handoff.out" 2>"$ROOT/handoff.err"
for _ in $(seq 1 200); do
  "$HERDR_BIN" status server --json 2>/dev/null | jq -e '.running == true' >/dev/null && break
  sleep 0.02
done

new_server="$(pgrep -f "^$HERDR_BIN server --handoff-import " | grep -v "^$OLD_SERVER$" | head -n1 || true)"
info_after="$($HERDR_BIN pane process-info --pane "$pane")"
shell_after="$(printf '%s' "$info_after" | jq -r '.result.process_info.shell_pid')"
foreground_after="$(printf '%s' "$info_after" | jq -r '.result.process_info.foreground_process_group_id')"
terminal_after="$($HERDR_BIN pane list | jq -r --arg pane "$pane" '.result.panes[] | select(.pane_id == $pane) | .terminal_id')"
sleep 0.25
read_after="$($HERDR_BIN pane read "$pane" --source recent-unwrapped --lines 40)"
last_after="$(printf '%s\n' "$read_after" | grep HERDR_HANDOFF_TICK | tail -n1 || true)"
old_alive=false
if kill -0 "$OLD_SERVER" 2>/dev/null; then old_alive=true; fi
shell_alive=false
if kill -0 "$shell_before" 2>/dev/null; then shell_alive=true; fi
foreground_alive=false
if kill -0 "$foreground_before" 2>/dev/null; then foreground_alive=true; fi

jq -n \
  --arg version "$version" \
  --arg sha256 "$sha" \
  --arg oldServer "$OLD_SERVER" \
  --arg newServer "$new_server" \
  --arg shellBefore "$shell_before" \
  --arg shellAfter "$shell_after" \
  --arg foregroundBefore "$foreground_before" \
  --arg foregroundAfter "$foreground_after" \
  --arg terminalBefore "$terminal_before" \
  --arg terminalAfter "$terminal_after" \
  --arg lastBefore "$last_before" \
  --arg lastAfter "$last_after" \
  --argjson oldAlive "$old_alive" \
  --argjson shellAlive "$shell_alive" \
  --argjson foregroundAlive "$foreground_alive" \
  '{
    binary:{version:$version,sha256:$sha256},
    oldServerPid:$oldServer,newServerPid:$newServer,oldServerStillAlive:$oldAlive,
    shellPidBefore:$shellBefore,shellPidAfter:$shellAfter,shellPreserved:($shellBefore==$shellAfter),shellAlive:$shellAlive,
    foregroundPidBefore:$foregroundBefore,foregroundPidAfter:$foregroundAfter,foregroundPreserved:($foregroundBefore==$foregroundAfter),foregroundAlive:$foregroundAlive,
    terminalIdBefore:$terminalBefore,terminalIdAfter:$terminalAfter,terminalIdPreserved:($terminalBefore==$terminalAfter),
    outputBefore:$lastBefore,outputAfter:$lastAfter,outputContinued:($lastBefore!=$lastAfter)
  }'
