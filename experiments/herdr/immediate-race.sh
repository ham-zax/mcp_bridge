#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERDR_BIN="${HERDR_BIN:-/tmp/herdr-v0.8.0}"
EXPECTED_SHA256="b872ea7e40fa2cb17e857ac9b62b1bf26db7b403c622f5d2f3f5b35f6e9acd28"
TRIALS="${TRIALS:-12}"

version="$($HERDR_BIN --version)"
sha="$(sha256sum "$HERDR_BIN" | awk '{print $1}')"
[ "$version" = "herdr 0.8.0" ] || { echo "unexpected Herdr version: $version" >&2; exit 1; }
[ "$sha" = "$EXPECTED_SHA256" ] || { echo "unexpected Herdr sha256: $sha" >&2; exit 1; }

current_hits=0
current_capture_misses=0
current_auxiliary_failures=0
for _ in $(seq 1 "$TRIALS"); do
  current_out="$(mktemp)"
  if (cd "$ROOT_DIR/providers/terminal" && node --test --test-name-pattern='immediate process output is captured from its first bytes' test/broker.test.mjs >"$current_out" 2>&1); then
    current_hits=$((current_hits + 1))
  elif grep -q 'timed out waiting for immediate output marker' "$current_out"; then
    current_capture_misses=$((current_capture_misses + 1))
  elif grep -q 'timed out waiting for immediate dead pane status' "$current_out"; then
    # The test checks marker capture before this later assertion, so this specific failure
    # still proves the first bytes were captured.
    current_hits=$((current_hits + 1))
    current_auxiliary_failures=$((current_auxiliary_failures + 1))
  else
    echo 'unclassified current immediate-output test failure:' >&2
    cat "$current_out" >&2
    rm -f "$current_out"
    exit 2
  fi
  rm -f "$current_out"
done

root="$(mktemp -d -t herdr-immediate-stress-XXXXXX)"
mkdir -p "$root/config" "$root/state"
cat > "$root/config.toml" <<'EOF'
onboarding = false
[update]
version_check = false
manifest_check = false
EOF
export XDG_CONFIG_HOME="$root/config"
export XDG_STATE_HOME="$root/state"
export HERDR_CONFIG_PATH="$root/config.toml"
export HERDR_SESSION="agent3-immediate-$$"
export SHELL=/bin/bash

server_pid=""
cleanup() {
  set +e
  if [ -n "$server_pid" ] && kill -0 "$server_pid" 2>/dev/null; then
    "$HERDR_BIN" server stop >/dev/null 2>&1 || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -rf "$root"
}
trap cleanup EXIT

"$HERDR_BIN" server >"$root/server.out" 2>"$root/server.err" &
server_pid=$!
for _ in $(seq 1 150); do
  "$HERDR_BIN" status server --json 2>/dev/null | jq -e '.running == true' >/dev/null && break
  sleep 0.02
done

herdr_hits=0
herdr_total_frames=0
for n in $(seq 1 "$TRIALS"); do
  workspace="$($HERDR_BIN workspace create --cwd /home/hamza --label "imm-$n" --no-focus)"
  pane="$(printf '%s' "$workspace" | jq -r '.result.root_pane.pane_id')"
  stream="$root/observe-$n.ndjson"
  decoded="$root/decoded-$n.bin"
  "$HERDR_BIN" terminal session observe "$pane" --cols 80 --rows 24 >"$stream" 2>/dev/null &
  observer_pid=$!
  for _ in $(seq 1 150); do [ -s "$stream" ] && break; sleep 0.01; done
  marker="HERDR_IMMEDIATE_STRESS_$n"
  "$HERDR_BIN" pane run "$pane" "printf '$marker\\n'; exit" >/dev/null
  for _ in $(seq 1 150); do kill -0 "$observer_pid" 2>/dev/null || break; sleep 0.01; done
  kill "$observer_pid" 2>/dev/null || true
  wait "$observer_pid" 2>/dev/null || true
  : > "$decoded"
  while IFS= read -r line; do
    [ "$(printf '%s' "$line" | jq -r '.type')" = "terminal.frame" ] || continue
    printf '%s' "$line" | jq -r '.bytes' | base64 -d >> "$decoded"
  done < "$stream"
  frames="$(grep -c '"type":"terminal.frame"' "$stream" || true)"
  herdr_total_frames=$((herdr_total_frames + frames))
  if grep -aFq "$marker" "$decoded"; then
    herdr_hits=$((herdr_hits + 1))
  fi
done

jq -n \
  --argjson trials "$TRIALS" \
  --argjson currentHits "$current_hits" \
  --argjson currentCaptureMisses "$current_capture_misses" \
  --argjson currentAuxiliaryFailures "$current_auxiliary_failures" \
  --argjson herdrHits "$herdr_hits" \
  --argjson herdrTotalFrames "$herdr_total_frames" \
  --arg version "$version" \
  --arg sha256 "$sha" \
  '{
    trials:$trials,
    current:{hits:$currentHits,misses:$currentCaptureMisses,captureRate:($currentHits/$trials),auxiliaryPostCaptureFailures:$currentAuxiliaryFailures},
    herdrPrearmedObserver:{hits:$herdrHits,misses:($trials-$herdrHits),captureRate:($herdrHits/$trials),totalFrames:$herdrTotalFrames},
    herdrBinary:{version:$version,sha256:$sha256}
  }'
