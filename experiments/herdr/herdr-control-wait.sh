#!/usr/bin/env bash
set -euo pipefail

HERDR_BIN="${HERDR_BIN:-/tmp/herdr-v0.8.0}"
EXPECTED_SHA256="b872ea7e40fa2cb17e857ac9b62b1bf26db7b403c622f5d2f3f5b35f6e9acd28"
ROOT="$(mktemp -d -t herdr-control-wait-XXXXXX)"
SESSION="agent3-control-wait-$$"
SERVER_PID=""

cleanup() {
  set +e
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    "$HERDR_BIN" server stop >/dev/null 2>&1 || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
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
SERVER_PID=$!
for _ in $(seq 1 200); do
  if "$HERDR_BIN" status server --json 2>/dev/null | jq -e '.running == true' >/dev/null; then
    break
  fi
  sleep 0.02
done
"$HERDR_BIN" status server --json | jq -e '.running == true and .version == "0.8.0" and .protocol == 19' >/dev/null

wait_prompt() {
  local pane="$1" text=""
  for _ in $(seq 1 150); do
    text="$($HERDR_BIN pane read "$pane" --source visible --lines 24 2>/dev/null || true)"
    if printf '%s' "$text" | grep -q '\$'; then
      return 0
    fi
    sleep 0.02
  done
  echo "prompt not ready for $pane" >&2
  return 1
}

pane_present() {
  local pane="$1"
  "$HERDR_BIN" pane list | jq -e --arg pane "$pane" '[.result.panes[].pane_id == $pane] | any' >/dev/null
}

new_workspace() {
  local label="$1" cwd="${2:-/home/hamza}"
  "$HERDR_BIN" workspace create --cwd "$cwd" --label "$label" --no-focus
}

# Primary shell: Ctrl-C and navigation keys.
primary_json="$(new_workspace control-primary)"
primary="$(printf '%s' "$primary_json" | jq -r '.result.root_pane.pane_id')"
wait_prompt "$primary"

"$HERDR_BIN" pane run "$primary" "printf 'HERDR_CTRL_C_START\\n'; sleep 30; printf 'HERDR_CTRL_C_BAD\\n'" >/dev/null
for _ in $(seq 1 100); do
  fg="$($HERDR_BIN pane process-info --pane "$primary" | jq -r '.result.process_info.foreground_processes[0].name // empty')"
  [ "$fg" = "sleep" ] && break
  sleep 0.02
done
"$HERDR_BIN" pane send-keys "$primary" ctrl+c >/dev/null
for _ in $(seq 1 100); do
  fg="$($HERDR_BIN pane process-info --pane "$primary" | jq -r '.result.process_info.foreground_processes[0].name // empty')"
  [ "$fg" = "bash" ] && break
  sleep 0.02
done
ctrl_c_read="$($HERDR_BIN pane read "$primary" --source recent-unwrapped --lines 40)"

"$HERDR_BIN" pane run "$primary" "printf 'HERDR_NAV_MARKER\\n'" >/dev/null
sleep 0.08
"$HERDR_BIN" pane send-keys "$primary" up enter >/dev/null
sleep 0.12
nav_read="$($HERDR_BIN pane read "$primary" --source recent-unwrapped --lines 50)"

# Ctrl-D after prompt readiness.
ctrld_json="$(new_workspace ctrld-ready)"
ctrld="$(printf '%s' "$ctrld_json" | jq -r '.result.root_pane.pane_id')"
wait_prompt "$ctrld"
ctrld_pid="$($HERDR_BIN pane process-info --pane "$ctrld" | jq -r '.result.process_info.shell_pid')"
"$HERDR_BIN" pane send-keys "$ctrld" ctrl+d >/dev/null
for _ in $(seq 1 120); do
  if ! pane_present "$ctrld"; then break; fi
  sleep 0.02
done
ctrld_present=false
if pane_present "$ctrld"; then ctrld_present=true; fi
ctrld_alive=false
if kill -0 "$ctrld_pid" 2>/dev/null; then ctrld_alive=true; fi

# Direct controller + observer semantics, resize, model API bypass, control return.
control_json="$(new_workspace human-control)"
control_pane="$(printf '%s' "$control_json" | jq -r '.result.root_pane.pane_id')"
control_terminal="$(printf '%s' "$control_json" | jq -r '.result.root_pane.terminal_id')"
wait_prompt "$control_pane"

control_fifo="$ROOT/control.fifo"
mkfifo "$control_fifo"
exec 9<>"$control_fifo"
"$HERDR_BIN" terminal session control "$control_pane" --cols 80 --rows 24 <"$control_fifo" >"$ROOT/control.ndjson" 2>"$ROOT/control.err" &
controller_pid=$!
"$HERDR_BIN" terminal session observe "$control_pane" --cols 80 --rows 24 >"$ROOT/observer.ndjson" 2>"$ROOT/observer.err" &
observer_pid=$!
for _ in $(seq 1 150); do
  [ -s "$ROOT/control.ndjson" ] && [ -s "$ROOT/observer.ndjson" ] && break
  sleep 0.02
done

"$HERDR_BIN" terminal session control "$control_pane" --cols 80 --rows 24 </dev/null >"$ROOT/competing.ndjson" 2>"$ROOT/competing.err" || true
competing_reason="$(jq -r 'select(.type == "terminal.closed") | .reason' "$ROOT/competing.ndjson" | tail -n1)"

printf '%s\n' '{"type":"terminal.resize","cols":101,"rows":33,"cell_width_px":8,"cell_height_px":16}' >&9
human_b64="$( { printf '%s' "printf 'HERDR_HUMAN_MARKER\\n'"; printf '\r'; } | base64 -w0 )"
printf '{"type":"terminal.input","bytes":"%s"}\n' "$human_b64" >&9
sleep 0.12
# Deliberately use the model-like pane API while the direct human controller owns the PTY.
"$HERDR_BIN" pane run "$control_pane" "stty size; printf 'HERDR_MODEL_BYPASS_MARKER\\n'" >/dev/null
sleep 0.18
control_read="$($HERDR_BIN pane read "$control_pane" --source recent-unwrapped --lines 60)"
printf '%s\n' '{"type":"terminal.release"}' >&9
exec 9>&-
for _ in $(seq 1 100); do
  kill -0 "$controller_pid" 2>/dev/null || break
  sleep 0.02
done
kill "$observer_pid" 2>/dev/null || true
wait "$observer_pid" 2>/dev/null || true

observer_decoded="$ROOT/observer.decoded"
: > "$observer_decoded"
while IFS= read -r line; do
  [ "$(printf '%s' "$line" | jq -r '.type')" = "terminal.frame" ] || continue
  printf '%s' "$line" | jq -r '.bytes' | base64 -d >> "$observer_decoded"
done < "$ROOT/observer.ndjson"
frame_dims="$(jq -r 'select(.type == "terminal.frame") | [.width,.height] | @tsv' "$ROOT/control.ndjson" | sort -u | tr '\n' ';')"

control2_fifo="$ROOT/control2.fifo"
mkfifo "$control2_fifo"
exec 8<>"$control2_fifo"
"$HERDR_BIN" terminal session control "$control_pane" --cols 80 --rows 24 <"$control2_fifo" >"$ROOT/control2.ndjson" 2>"$ROOT/control2.err" &
controller2_pid=$!
for _ in $(seq 1 100); do [ -s "$ROOT/control2.ndjson" ] && break; sleep 0.02; done
returned_b64="$( { printf '%s' "printf 'HERDR_CONTROL_RETURNED\\n'"; printf '\r'; } | base64 -w0 )"
printf '{"type":"terminal.input","bytes":"%s"}\n{"type":"terminal.release"}\n' "$returned_b64" >&8
exec 8>&-
for _ in $(seq 1 100); do kill -0 "$controller2_pid" 2>/dev/null || break; sleep 0.02; done
sleep 0.08
control_return_read="$($HERDR_BIN pane read "$control_pane" --source recent-unwrapped --lines 80)"

# Exact PTY human attachment using an actual pseudo-terminal via script(1).
attach_json="$(new_workspace exact-attach)"
attach_pane="$(printf '%s' "$attach_json" | jq -r '.result.root_pane.pane_id')"
attach_terminal="$(printf '%s' "$attach_json" | jq -r '.result.root_pane.terminal_id')"
wait_prompt "$attach_pane"
set +e
{ sleep 0.25; printf '%s\r' "printf 'HERDR_DIRECT_ATTACH_MARKER\\n'"; sleep 0.3; printf '\002'; sleep 0.08; printf 'q'; } \
  | TERM=xterm-256color timeout 5s script -qefc "$HERDR_BIN terminal attach $attach_terminal" "$ROOT/attach.typescript" >"$ROOT/attach.stdout" 2>"$ROOT/attach.stderr"
attach_rc=$?
set -e
sleep 0.12
attach_read="$($HERDR_BIN pane read "$attach_pane" --source recent-unwrapped --lines 40)"
attach_present=false
if pane_present "$attach_pane"; then attach_present=true; fi

# Observer/client disconnect and reconnect preserve the running foreground process.
disc_json="$(new_workspace disconnect)"
disc_pane="$(printf '%s' "$disc_json" | jq -r '.result.root_pane.pane_id')"
wait_prompt "$disc_pane"
"$HERDR_BIN" pane run "$disc_pane" "bash -lc 'i=0; while :; do printf \\\"HERDR_DISC_TICK:%s\\\\n\\\" \\\"\$i\\\"; i=\$((i+1)); sleep 0.1; done'" >/dev/null
sleep 0.2
disc_pid_before="$($HERDR_BIN pane process-info --pane "$disc_pane" | jq -r '.result.process_info.foreground_process_group_id')"
"$HERDR_BIN" terminal session observe "$disc_pane" --cols 80 --rows 24 >"$ROOT/disc1.ndjson" 2>/dev/null &
disc_obs=$!
for _ in $(seq 1 100); do [ -s "$ROOT/disc1.ndjson" ] && break; sleep 0.02; done
kill "$disc_obs" 2>/dev/null || true
wait "$disc_obs" 2>/dev/null || true
sleep 0.3
disc_pid_after="$($HERDR_BIN pane process-info --pane "$disc_pane" | jq -r '.result.process_info.foreground_process_group_id')"
disc_alive=false
if kill -0 "$disc_pid_before" 2>/dev/null; then disc_alive=true; fi
"$HERDR_BIN" terminal session observe "$disc_pane" --cols 80 --rows 24 >"$ROOT/disc2.ndjson" 2>/dev/null &
disc_obs2=$!
for _ in $(seq 1 100); do [ -s "$ROOT/disc2.ndjson" ] && break; sleep 0.02; done
kill "$disc_obs2" 2>/dev/null || true
wait "$disc_obs2" 2>/dev/null || true
"$HERDR_BIN" pane send-keys "$disc_pane" ctrl+c >/dev/null || true

# Immediate-output race: observer succeeds; snapshot-polling wait can miss the short-lived pane.
imm_obs_json="$(new_workspace immediate-observer)"
imm_obs_pane="$(printf '%s' "$imm_obs_json" | jq -r '.result.root_pane.pane_id')"
"$HERDR_BIN" terminal session observe "$imm_obs_pane" --cols 80 --rows 24 >"$ROOT/imm-observer.ndjson" 2>/dev/null &
imm_obs_pid=$!
for _ in $(seq 1 100); do [ -s "$ROOT/imm-observer.ndjson" ] && break; sleep 0.02; done
"$HERDR_BIN" pane run "$imm_obs_pane" "printf 'HERDR_IMMEDIATE_OBSERVER\\n'; exit" >/dev/null
for _ in $(seq 1 100); do kill -0 "$imm_obs_pid" 2>/dev/null || break; sleep 0.02; done
kill "$imm_obs_pid" 2>/dev/null || true
wait "$imm_obs_pid" 2>/dev/null || true
imm_decoded="$ROOT/imm.decoded"
: > "$imm_decoded"
while IFS= read -r line; do
  [ "$(printf '%s' "$line" | jq -r '.type')" = "terminal.frame" ] || continue
  printf '%s' "$line" | jq -r '.bytes' | base64 -d >> "$imm_decoded"
done < "$ROOT/imm-observer.ndjson"

imm_wait_json="$(new_workspace immediate-wait)"
imm_wait_pane="$(printf '%s' "$imm_wait_json" | jq -r '.result.root_pane.pane_id')"
"$HERDR_BIN" pane wait-output "$imm_wait_pane" --regex '^HERDR_IMMEDIATE_WAIT$' --timeout 3000 >"$ROOT/imm-wait.out" 2>"$ROOT/imm-wait.err" &
imm_wait_pid=$!
sleep 0.08
"$HERDR_BIN" pane run "$imm_wait_pane" "printf 'HERDR_IMMEDIATE_WAIT\\n'; exit" >/dev/null
set +e
wait "$imm_wait_pid"
imm_wait_rc=$?
set -e
imm_wait_error="$(jq -r '.error.code // empty' "$ROOT/imm-wait.err" 2>/dev/null || true)"

# Regex wait latency; then ordinary foreground completion, which has no native process wait.
wait_pane="$primary"
regex_start="$(date +%s%N)"
"$HERDR_BIN" pane wait-output "$wait_pane" --regex '^HERDR_REGEX_READY_[0-9]+$' --timeout 3000 >"$ROOT/regex.json" 2>"$ROOT/regex.err" &
regex_pid=$!
sleep 0.22
"$HERDR_BIN" pane run "$wait_pane" "printf 'HERDR_REGEX_READY_42\\n'" >/dev/null
wait "$regex_pid"
regex_end="$(date +%s%N)"
regex_line="$(jq -r '.result.matched_line' "$ROOT/regex.json")"

"$HERDR_BIN" pane run "$wait_pane" "sleep 0.45" >/dev/null
sleep 0.04
process_polls=0
process_start="$(date +%s%N)"
while :; do
  process_polls=$((process_polls + 1))
  process_fg="$($HERDR_BIN pane process-info --pane "$wait_pane" | jq -r '.result.process_info.foreground_processes[0].name // empty')"
  [ "$process_fg" = "bash" ] && break
  [ "$process_polls" -ge 40 ] && break
  sleep 0.05
done
process_end="$(date +%s%N)"

# Pinned bundled Codex detector fixture (no remote manifest updates).
cat > "$ROOT/codex-blocked.txt" <<'EOF'
› Run a command

allow command?
press enter to confirm or esc to cancel
EOF
codex_fixture="$($HERDR_BIN agent explain --file "$ROOT/codex-blocked.txt" --agent codex --json)"

# Deterministic event-driven agent wait path using official lifecycle reports.
agent_json="$(new_workspace lifecycle /tmp)"
agent_pane="$(printf '%s' "$agent_json" | jq -r '.result.root_pane.pane_id')"
"$HERDR_BIN" pane report-agent "$agent_pane" --source agent3bench --agent pi --state idle --seq 1 >/dev/null
"$HERDR_BIN" agent wait "$agent_pane" --until working --timeout 3000 >"$ROOT/agent-working.json" &
agent_work_wait=$!
sleep 0.12
agent_work_start="$(date +%s%N)"
"$HERDR_BIN" pane report-agent "$agent_pane" --source agent3bench --agent pi --state working --seq 2 >/dev/null
wait "$agent_work_wait"
agent_work_end="$(date +%s%N)"

"$HERDR_BIN" agent wait "$agent_pane" --until blocked --timeout 3000 >"$ROOT/agent-blocked.json" &
agent_block_wait=$!
sleep 0.12
agent_block_start="$(date +%s%N)"
"$HERDR_BIN" pane report-agent "$agent_pane" --source agent3bench --agent pi --state blocked --seq 3 --message 'approval required' >/dev/null
wait "$agent_block_wait"
agent_block_end="$(date +%s%N)"

"$HERDR_BIN" pane report-agent "$agent_pane" --source agent3bench --agent pi --state working --seq 4 >/dev/null
"$HERDR_BIN" agent wait "$agent_pane" --until done --timeout 3000 >"$ROOT/agent-done.json" &
agent_done_wait=$!
sleep 0.12
agent_done_start="$(date +%s%N)"
"$HERDR_BIN" pane report-agent "$agent_pane" --source agent3bench --agent pi --state idle --seq 5 >/dev/null
wait "$agent_done_wait"
agent_done_end="$(date +%s%N)"
"$HERDR_BIN" pane release-agent "$agent_pane" --source agent3bench --agent pi --seq 6 >/dev/null || true

server_log="$ROOT/config/herdr/sessions/$SESSION/herdr-server.log"
remote_count=0
if [ -d "$ROOT/state/herdr/agent-detection/remote" ]; then
  remote_count="$(find "$ROOT/state/herdr/agent-detection/remote" -type f | wc -l)"
fi

jq -n \
  --arg version "$version" \
  --arg sha256 "$sha" \
  --arg competingReason "$competing_reason" \
  --arg frameDims "$frame_dims" \
  --argjson ctrlCStart "$(printf '%s\n' "$ctrl_c_read" | grep -Fxc HERDR_CTRL_C_START || true)" \
  --argjson ctrlCBad "$(printf '%s\n' "$ctrl_c_read" | grep -Fxc HERDR_CTRL_C_BAD || true)" \
  --argjson navCount "$(printf '%s\n' "$nav_read" | grep -Fxc HERDR_NAV_MARKER || true)" \
  --argjson ctrlDPresent "$ctrld_present" \
  --argjson ctrlDAlive "$ctrld_alive" \
  --argjson humanRead "$(printf '%s\n' "$control_read" | grep -Fxc HERDR_HUMAN_MARKER || true)" \
  --argjson humanObserved "$(strings "$observer_decoded" | tr -d '\n' | grep -c HERDR_HUMAN_MARKER || true)" \
  --argjson modelBypass "$(printf '%s\n' "$control_read" | grep -Fxc HERDR_MODEL_BYPASS_MARKER || true)" \
  --argjson sttyResize "$(printf '%s\n' "$control_read" | grep -Fxc '33 101' || true)" \
  --argjson controlReturned "$(printf '%s\n' "$control_return_read" | grep -Fxc HERDR_CONTROL_RETURNED || true)" \
  --argjson attachRc "$attach_rc" \
  --argjson attachMarker "$(printf '%s\n' "$attach_read" | grep -Fxc HERDR_DIRECT_ATTACH_MARKER || true)" \
  --argjson attachPresent "$attach_present" \
  --arg discPidBefore "$disc_pid_before" \
  --arg discPidAfter "$disc_pid_after" \
  --argjson discAlive "$disc_alive" \
  --argjson reconnectFrames "$(grep -c '"type":"terminal.frame"' "$ROOT/disc2.ndjson" || true)" \
  --argjson immObserverMarker "$(strings "$imm_decoded" | tr -d '\n' | grep -c HERDR_IMMEDIATE_OBSERVER || true)" \
  --argjson immWaitRc "$imm_wait_rc" \
  --arg immWaitError "$imm_wait_error" \
  --arg regexLine "$regex_line" \
  --argjson regexMs "$(( (regex_end - regex_start) / 1000000 ))" \
  --argjson processPolls "$process_polls" \
  --arg processFinal "$process_fg" \
  --argjson processMs "$(( (process_end - process_start) / 1000000 ))" \
  --arg codexManifestSource "$(printf '%s' "$codex_fixture" | jq -r '.manifest_source')" \
  --arg codexManifestVersion "$(printf '%s' "$codex_fixture" | jq -r '.manifest_version')" \
  --arg codexState "$(printf '%s' "$codex_fixture" | jq -r '.state')" \
  --arg codexRule "$(printf '%s' "$codex_fixture" | jq -r '.matched_rule.id')" \
  --argjson workingMs "$(( (agent_work_end - agent_work_start) / 1000000 ))" \
  --argjson blockedMs "$(( (agent_block_end - agent_block_start) / 1000000 ))" \
  --argjson doneMs "$(( (agent_done_end - agent_done_start) / 1000000 ))" \
  --argjson remoteManifestFiles "$remote_count" \
  --argjson configParseErrors "$(grep -c 'config parse error' "$server_log" || true)" \
  --argjson updateChecks "$(grep -c 'checking for updates' "$server_log" || true)" \
  '{
    binary:{version:$version,sha256:$sha256},
    configPin:{remoteManifestFiles:$remoteManifestFiles,configParseErrors:$configParseErrors,updateChecks:$updateChecks},
    keys:{ctrlCStart:$ctrlCStart,ctrlCBad:$ctrlCBad,navigationMarkerCount:$navCount,ctrlDPanePresent:$ctrlDPresent,ctrlDShellAlive:$ctrlDAlive},
    humanControl:{secondDirectControllerReason:$competingReason,frameDimensions:$frameDims,humanMarkerInPaneRead:$humanRead,humanMarkerInObserver:$humanObserved,modelPaneApiBypassMarker:$modelBypass,stty33x101InObserver:$sttyResize,controlReturnedMarker:$controlReturned},
    exactAttach:{exitCode:$attachRc,markerSeen:$attachMarker,paneSurvivedDetach:$attachPresent},
    clientDisconnect:{foregroundPidBefore:$discPidBefore,foregroundPidAfter:$discPidAfter,aliveAfterObserverDisconnect:$discAlive,reconnectFrames:$reconnectFrames},
    immediateOutput:{prearmedObserverMarker:$immObserverMarker,prearmedWaitExitCode:$immWaitRc,prearmedWaitError:$immWaitError},
    waits:{regexMatchedLine:$regexLine,regexElapsedMs:$regexMs,ordinaryProcessPolls:$processPolls,ordinaryProcessElapsedMs:$processMs,ordinaryProcessFinalForeground:$processFinal},
    codexBundledDetector:{source:$codexManifestSource,version:$codexManifestVersion,state:$codexState,rule:$codexRule},
    lifecycleWait:{workingWakeMs:$workingMs,blockedWakeMs:$blockedMs,doneWakeMs:$doneMs,workingStatus:(input|.result.agent.agent_status)}
  }' "$ROOT/agent-working.json" \
  | jq --slurpfile blocked "$ROOT/agent-blocked.json" --slurpfile done "$ROOT/agent-done.json" \
    '.lifecycleWait.blockedStatus=$blocked[0].result.agent.agent_status | .lifecycleWait.doneStatus=$done[0].result.agent.agent_status'
