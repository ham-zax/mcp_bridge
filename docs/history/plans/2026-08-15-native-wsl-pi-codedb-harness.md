# CodeDB + Pi Native WSL Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evaluate and, if they pass independent evidence gates, adopt pinned CodeDB for Code and a workspace-confined Pi-backed `dev` provider whose model-facing language is source, diffs, diagnostics, and terminal text rather than RPC-shaped JSON.

**Architecture:** Build on the publication scaffold. CodeDB is an independent candidate. Files use workspace-relative paths beneath immutable `MCP_DEV_WORKSPACE_ROOT`; trusted Shell uses one native Bash command string with optional relative cwd. Pi keeps rich internal execution/edit records, while the MCP renderer exposes native `TextContent` only. A neutral stateless format screen compares native text, compact JSON, TOON, and GCF on actual CodeDB payloads.

**Tech Stack:** 1MCP 0.34.4; CodeDB 0.2.5840 Linux x86_64 SHA-256 `f784c931b053031ca9928173828130c504f769c9e94bf5c2666ab71091747966`; `@earendil-works/pi-coding-agent` 0.84.1; `@modelcontextprotocol/sdk` 1.30.0; Zod 4.4.3; Node.js 24.19.0; TOON `@toon-format/cli` 4.1.1; GCF spec 3.5.3 via `gcf-python` 2.6.0; `tiktoken` 0.13.0 (`o200k_base`); Bash/systemd user service.

## Global Constraints

- Execute implementation on a new branch/worktree based on `chore/publication-scaffold` (currently `b9732b9`), not directly on `main` and not by modifying the preserved publication branch.
- Keep the publication boundaries: tracked template at `config/templates/mcp.json`, generated writable 1MCP state outside Git, providers under `providers/`.
- Preserve explicit profile selection. No setup/render path silently selects `restricted` or `trusted-dev`.
- `trusted-dev` remains first-class unrestricted Linux-user authority through Bash.
- `restricted` never receives Pi Bash in this plan; its legacy allowlisted shell remains until a separate native restricted-shell design exists.
- Preserve the verified 1MCP 0.34.4 OAuth CSP patch (`form-action 'self' https:`) and fail-closed source-shape check.
- Do not run a nested Pi agent/model/session. Reuse only Pi primitive factories/operations.
- Files are available in both profiles and are always confined to immutable `MCP_DEV_WORKSPACE_ROOT`.
- Model-facing Files paths are relative only. Reject absolute paths and every `..` segment.
- Existing read/edit targets and new-write parents must resolve through `realpath` beneath the workspace root; reject symlink escapes.
- Pi fuzzy edit fallback is disabled by an exact unique-match guard after BOM removal/newline normalization only.
- Existing-file mutation uses Pi multi-edit plus best-effort snapshot-before-write conflict detection. Initial `write` is atomic create-only with `wx`/`O_EXCL`.
- Shell uses Pi `createLocalBashOperations()`, not Pi `createBashTool()`. Normal non-zero exits are data.
- Visible Bash schema is only `command`, optional workspace-relative `cwd`, and optional `timeout_seconds`.
- Shell output limit is deployment policy `MCP_DEV_MAX_OUTPUT_BYTES` (default 1,048,576), not a model-facing request field.
- Forward MCP `extra.signal` into Pi execution.
- Dev primitives emit plain `TextContent` only. Do not emit `structuredContent` or embedded resources in this plan.
- Bash renders terminal text; edit renders one useful diff without Pi success prose; read renders source/text; write renders a short creation acknowledgement.
- CodeDB, Pi, TOON, and GCF have independent verdicts and independent rollback paths.
- The stateless structured-format screen compares native text where applicable, pretty JSON, compact JSON, TOON 4.1.1, and GCF 3.5.3 on the same eligible CodeDB values.
- After any provider addition/removal: restart the bridge if the server composition changed, verify bridge health, refresh the ChatGPT workspace/plugin Actions, start a fresh MCP-backed session, and verify the expected catalog. The client refresh rule is exactly Refresh + fresh session; do not invent a PC/WSL reboot or extra client-cache ritual.
- `await_until`, Terminal, RTK, live format interception, Serena, `apply_patch`, and tool facades are not implemented in this plan.
- One designated **integrator** owns staging, commits, merges, and the shared Git index. Helpers edit/test assigned paths but do not commit.
- Do not reset, stash, clean, or overwrite unrelated user work.

---

## Target File Structure

```text
scripts/
  install-codedb.sh
  codedb-mcp.sh

providers/
  pi-dev/
    package.json
    package-lock.json
    boundary.mjs
    files.mjs
    shell.mjs
    render.mjs
    server.mjs
    test/
      boundary.test.mjs
      files.test.mjs
      shell.test.mjs
      render.test.mjs
      server.test.mjs

config/
  templates/mcp.json
  profiles/restricted.env
  profiles/trusted-dev.env

scripts/render-config.mjs
scripts/setup.sh
scripts/smoke-local.sh

tests/
  lifecycle.sh
  publication.sh
  harness.sh

docs/benchmarks/
  codedb.md
  structured-formats.md
  pi-dev.md
```

Raw benchmark captures belong under ignored runtime/state paths, not in Git.

---

# Phase 1 — CodeDB

### Task 1: Pin and Launch CodeDB Without Client-Side Installer Side Effects

**Files:**
- Create: `scripts/install-codedb.sh`
- Create: `scripts/codedb-mcp.sh`
- Create: `tests/harness.sh`
- Modify: `config/templates/mcp.json`
- Modify: `scripts/smoke-local.sh`

**Interfaces:**
- Binary path default: `${XDG_DATA_HOME:-$HOME/.local/share}/mcp-dev-bridge/bin/codedb-v0.2.5840`
- Launcher: `scripts/codedb-mcp.sh` stdio MCP server.
- Provider name: `codedb`.

- [ ] **Step 1: Add failing CodeDB pin/launcher/template tests**

Create `tests/harness.sh` with this initial contract:

```bash
#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILURES=0
TESTS=0
pass() { printf 'ok - %s\n' "$1"; }
fail() { printf 'not ok - %s\n' "$1"; FAILURES=$((FAILURES + 1)); }
run_test() { local name="$1"; shift; TESTS=$((TESTS + 1)); if "$@"; then pass "$name"; else fail "$name"; fi; }
contains() { grep -Eq "$2" "$1"; }

test_codedb_pin() {
  contains "$ROOT/scripts/install-codedb.sh" 'CODEDB_VERSION="0\.2\.5840"' &&
  contains "$ROOT/scripts/install-codedb.sh" 'f784c931b053031ca9928173828130c504f769c9e94bf5c2666ab71091747966'
}

test_codedb_launcher() {
  contains "$ROOT/scripts/codedb-mcp.sh" 'CODEDB_TOOLS_PROFILE="core"' &&
  contains "$ROOT/scripts/codedb-mcp.sh" 'CODEDB_MCP_LEAN="1"' &&
  contains "$ROOT/scripts/codedb-mcp.sh" 'CODEDB_NO_TELEMETRY="1"' &&
  contains "$ROOT/scripts/codedb-mcp.sh" 'cd /tmp'
}

test_codedb_template() {
  node - "$ROOT/config/templates/mcp.json" <<'NODE'
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!cfg.mcpServers?.codedb) process.exit(1);
if (cfg.mcpServers.codedb.command !== '__REPO_ROOT__/scripts/codedb-mcp.sh') process.exit(1);
NODE
}

run_test 'CodeDB version/checksum are pinned' test_codedb_pin
run_test 'CodeDB launcher forces core lean no-telemetry mode' test_codedb_launcher
run_test 'CodeDB exists in reusable MCP template' test_codedb_template

printf '\n%d tests, %d failures\n' "$TESTS" "$FAILURES"
[ "$FAILURES" -eq 0 ]
```

- [ ] **Step 2: Run RED**

```bash
chmod +x tests/harness.sh
bash tests/harness.sh
```

Expected: CodeDB tests fail because installer/launcher/template entry do not exist yet.

- [ ] **Step 3: Implement the exact CodeDB installer**

Create `scripts/install-codedb.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

CODEDB_VERSION="0.2.5840"
CODEDB_SHA256="f784c931b053031ca9928173828130c504f769c9e94bf5c2666ab71091747966"
DATA_HOME="${XDG_DATA_HOME:-${HOME:?HOME is required}/.local/share}"
INSTALL_DIR="${CODEDB_INSTALL_DIR:-$DATA_HOME/mcp-dev-bridge/bin}"
DEST="$INSTALL_DIR/codedb-v$CODEDB_VERSION"
URL="https://github.com/justrach/codedb/releases/download/v$CODEDB_VERSION/codedb-linux-x86_64"

mkdir -p "$INSTALL_DIR"
tmp="$(mktemp "$INSTALL_DIR/.codedb.XXXXXX")"
trap 'rm -f "$tmp"' EXIT
curl -fL "$URL" -o "$tmp"
printf '%s  %s\n' "$CODEDB_SHA256" "$tmp" | sha256sum -c -
chmod 0755 "$tmp"
mv -f "$tmp" "$DEST"
trap - EXIT
"$DEST" --version
printf '%s\n' "$DEST"
```

This deliberately downloads the release asset directly rather than using CodeDB's convenience installer, so it cannot auto-register client hooks or DeepWiki integrations.

- [ ] **Step 4: Implement the deterministic stdio launcher**

Create `scripts/codedb-mcp.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

DATA_HOME="${XDG_DATA_HOME:-${HOME:?HOME is required}/.local/share}"
CODEDB_BIN="${CODEDB_BIN:-$DATA_HOME/mcp-dev-bridge/bin/codedb-v0.2.5840}"
[ -x "$CODEDB_BIN" ] || {
  echo "CodeDB executable missing: $CODEDB_BIN" >&2
  echo "run scripts/install-codedb.sh" >&2
  exit 127
}

export CODEDB_TOOLS_PROFILE="core"
export CODEDB_MCP_LEAN="1"
export CODEDB_NO_TELEMETRY="1"
cd /tmp
exec "$CODEDB_BIN" mcp
```

- [ ] **Step 5: Add CodeDB to the tracked template**

Add sibling entry under `mcpServers` in `config/templates/mcp.json`:

```json
"codedb": {
  "command": "__REPO_ROOT__/scripts/codedb-mcp.sh",
  "args": [],
  "tags": ["code"]
}
```

Keep `filesystem` and `shell` unchanged during Phase 1.

- [ ] **Step 6: Add smoke preflight**

At the top of `scripts/smoke-local.sh`, after `set -euo pipefail`, add:

```bash
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/lib/bridge/common.sh"

if [ -f "$BRIDGE_CONFIG_DIR/mcp.json" ] && node - "$BRIDGE_CONFIG_DIR/mcp.json" <<'NODE'
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
process.exit(cfg.mcpServers?.codedb ? 0 : 1);
NODE
then
  DATA_HOME="${XDG_DATA_HOME:-${HOME:?HOME is required}/.local/share}"
  CODEDB_BIN="${CODEDB_BIN:-$DATA_HOME/mcp-dev-bridge/bin/codedb-v0.2.5840}"
  [ -x "$CODEDB_BIN" ] || {
    echo "CodeDB is configured but the pinned binary is missing: $CODEDB_BIN" >&2
    echo "run scripts/install-codedb.sh" >&2
    exit 1
  }
fi
```

Keep the existing HTTP initialize probe below this block. Do not launch a second 1MCP process from the smoke script.

- [ ] **Step 7: Run GREEN and baseline suites**

```bash
chmod +x scripts/install-codedb.sh scripts/codedb-mcp.sh tests/harness.sh
bash -n scripts/*.sh tests/*.sh
node -e "JSON.parse(require('fs').readFileSync('config/templates/mcp.json','utf8')); console.log('json ok')"
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
git diff --check
```

Expected: all pass.

- [ ] **Step 8: Install and verify the release asset**

```bash
./scripts/install-codedb.sh
"${XDG_DATA_HOME:-$HOME/.local/share}/mcp-dev-bridge/bin/codedb-v0.2.5840" --version
```

Expected: version `0.2.5840`; checksum verification succeeds.

- [ ] **Step 9: Integrator-only commit**

Only the designated integrator executes:

```bash
git add scripts/install-codedb.sh scripts/codedb-mcp.sh tests/harness.sh config/templates/mcp.json scripts/smoke-local.sh
git commit -m "feat: add pinned CodeDB provider"
```

Helpers skip this step.

---

### Task 2: Verify CodeDB Through Generated Config, Refresh ChatGPT, and Run the Independent Benchmark

**Files:**
- Modify: `tests/harness.sh`
- Create: `docs/benchmarks/codedb.md`

**Interfaces:**
- Uses `scripts/render-config.mjs --profile trusted-dev`.
- Every CodeDB call supplies explicit absolute `project`.
- Produces CodeDB verdict evidence independently of TOON/GCF results.

- [ ] **Step 1: Add generated-config assertion**

Append a fixture to `tests/harness.sh` that renders `trusted-dev` into a temporary state directory and requires `filesystem`, `shell`, and `codedb` during A/B:

```bash
tmp="$(mktemp -d)"
cat > "$tmp/deployment.env" <<'ENV'
MCP_WORKSPACE_ROOT=/tmp/example-workspace
MCP_PUBLIC_URL=https://mcp.example.test
MCP_TUNNEL_NAME=
ENV
node "$ROOT/scripts/render-config.mjs" \
  --profile trusted-dev \
  --env-file "$tmp/deployment.env" \
  --state-dir "$tmp/state" \
  --repo-root "$ROOT" >/dev/null
node - "$tmp/state/1mcp/mcp.json" "$ROOT" <<'NODE'
const fs = require('fs');
const [file, root] = process.argv.slice(2);
const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
for (const name of ['filesystem', 'shell', 'codedb']) {
  if (!cfg.mcpServers?.[name]) process.exit(1);
}
if (cfg.mcpServers.codedb.command !== `${root}/scripts/codedb-mcp.sh`) process.exit(1);
NODE
rm -rf "$tmp"
```

- [ ] **Step 2: Verify local stdio startup and capture schema cost**

Create a one-server temporary config and let 1MCP connect directly:

```bash
tmp="$(mktemp -d)"
cat > "$tmp/mcp.json" <<EOF
{
  "version": "1.0.0",
  "mcpServers": {
    "codedb": {
      "command": "$PWD/scripts/codedb-mcp.sh",
      "args": []
    }
  }
}
EOF
1mcp mcp tokens --config "$tmp/mcp.json" --format json > "$tmp/tokens.json"
jq -e '.servers[] | select(.serverName == "codedb" and .connected == true)' "$tmp/tokens.json" >/dev/null
jq -r '.servers[] | select(.serverName == "codedb") | .breakdown.tools[].name' "$tmp/tokens.json" | sort
mkdir -p "${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge"
cp "$tmp/tokens.json" "${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/codedb-tools-tokens.json"
rm -rf "$tmp"
```

Record actual tool names, tool count, schema bytes if available, and estimated schema tokens in `docs/benchmarks/codedb.md`.

- [ ] **Step 3: Activate the provider only at the intentional live-deployment checkpoint**

After the implementation branch is deliberately made the deployment root:

```bash
scripts/setup.sh --profile trusted-dev
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"
systemctl --user restart mcp-dev-bridge.service
bin/status
```

Expected: bridge `issues: 0`. Direct provider discovery from Step 2 already proves the CodeDB server catalog.

Do not point the live service at a temporary worktree merely to satisfy this step.

- [ ] **Step 4: Refresh ChatGPT's catalog using the proven client workflow**

Perform exactly:

```text
ChatGPT workspace/plugin -> Actions -> Refresh
start a fresh session using this MCP
verify the CodeDB actions are present
```

A bridge restart alone is not the ChatGPT catalog acceptance test. Do not require extra client-cache diagnostics beyond this refresh + fresh-session workflow.

- [ ] **Step 5: Run the old-primitives baseline task**

Use:

```text
Trace the Satori semantic-search request from its entry point through retrieval/ranking to response projection. Name concrete files and functions and cite the evidence used for each hop.
```

Record:

```text
tool calls
whole-file reads
repeated reads
irrelevant reads
wall time
correct file/function call chain
total advertised filesystem+shell schema bytes/tokens
representative request argument bytes/tokens
number of request fields/nesting depth
model-visible result bytes/tokens
follow-up calls needed to recover missing evidence
```

Use the actual runtime catalog rather than assuming a fixed old-tool count.

- [ ] **Step 6: Run the CodeDB-first version of the same task**

Every CodeDB call uses:

```text
project="/home/hamza/repo/satori"
```

Record the identical metrics plus index freshness after a disposable edit. Use CodeDB for discovery/context and old Files/Shell only when required for evidence.

- [ ] **Step 7: Write the preliminary CodeDB benchmark document**

`docs/benchmarks/codedb.md` must contain:

- both metric tables;
- actual runtime CodeDB tool names/count;
- schema/request/result context measurements;
- call-chain correctness;
- freshness result;
- preliminary CodeDB `KEEP` or `REMOVE` evidence;
- no TOON/GCF verdict yet.

- [ ] **Step 8: Integrator-only commit**

```bash
git add tests/harness.sh docs/benchmarks/codedb.md
git commit -m "docs: benchmark CodeDB harness"
```

Helpers skip this step.

---

### Task 3: Run the Neutral Native/JSON/TOON/GCF Screen, Then Apply Independent Verdicts

**Files:**
- Create: `docs/benchmarks/structured-formats.md`
- Modify: `docs/benchmarks/codedb.md`
- If CodeDB verdict is `REMOVE`: remove its implementation/config paths and update tests/docs.

**Interfaces:**
- TOON pin: `@toon-format/cli@4.1.1`.
- GCF pin: `gcf-python==2.6.0`, implementing GCF spec 3.5.3.
- Shared tokenizer: `tiktoken==0.13.0`, encoding `o200k_base`.
- Raw captures live under ignored external state, never public Git.

- [ ] **Step 1: Capture actual native and JSON-valued CodeDB outputs**

For each CodeDB tool used in Task 2, save the actual model-facing `content[].text` response under:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/codedb/native/
```

For tools that support a real JSON mode, capture that mode separately. At minimum, call `codedb_context` once in its normal native mode and once with `format=json` for the same task and token budget.

Create a private TSV manifest:

```text
tool	mode	structure_class	raw_bytes	json_eligible	capture_path
```

Allowed `structure_class` values:

```text
uniform_records
deep_nested
irregular_mixed
graph_like
native_text
```

A capture is JSON-eligible only when trimmed text begins with `{` or `[` and `jq -e .` succeeds. Do not wrap native prose in invented JSON merely to increase format coverage.

- [ ] **Step 2: Produce four comparable representations for each eligible JSON value**

For every eligible `input.json`:

```bash
jq . input.json > pretty.json
jq -c . input.json > compact.json
npx -y @toon-format/cli@4.1.1 --encode < input.json > output.toon
uvx --from gcf-python==2.6.0 gcf encode < input.json > output.gcf
```

The native CodeDB text for the same semantic task is retained as `native.txt` when available; it is a model-facing baseline, not a JSON round-trip candidate.

- [ ] **Step 3: Verify strict round-trip fidelity**

```bash
npx -y @toon-format/cli@4.1.1 --decode < output.toon > toon-decoded.json
uvx --from gcf-python==2.6.0 gcf decode < output.gcf > gcf-decoded.json
jq -S . input.json > expected.sorted.json
jq -S . toon-decoded.json > toon.sorted.json
jq -S . gcf-decoded.json > gcf.sorted.json
diff -u expected.sorted.json toon.sorted.json
diff -u expected.sorted.json gcf.sorted.json
```

Any failure is recorded as `INCOMPATIBLE`; do not coerce numbers, keys, nulls, or strings to make a codec pass.

- [ ] **Step 4: Measure bytes, one shared tokenizer, and latency**

For each `native.txt`, `pretty.json`, `compact.json`, `output.toon`, and `output.gcf`, run the same tokenizer:

```bash
uv run --with tiktoken==0.13.0 python - "$file" <<'PY'
from pathlib import Path
import sys
import tiktoken
p = Path(sys.argv[1])
text = p.read_text(encoding="utf-8")
enc = tiktoken.get_encoding("o200k_base")
print(f"{p.name}\tbytes={len(text.encode('utf-8'))}\ttokens={len(enc.encode(text))}")
PY
```

Measure cold and warm encode/decode wall time separately. Run this block twice without clearing caches; label the first pass cold and the second warm:

```bash
/usr/bin/time -f 'toon_encode_wall=%e' npx -y @toon-format/cli@4.1.1 --encode < input.json > /dev/null
/usr/bin/time -f 'toon_decode_wall=%e' npx -y @toon-format/cli@4.1.1 --decode < output.toon > /dev/null
/usr/bin/time -f 'gcf_encode_wall=%e' uvx --from gcf-python==2.6.0 gcf encode < input.json > /dev/null
/usr/bin/time -f 'gcf_decode_wall=%e' uvx --from gcf-python==2.6.0 gcf decode < output.gcf > /dev/null
```

Use the same machine and payload for all measurements. Record structure class with every row.

- [ ] **Step 5: Write independent format verdicts**

Create `docs/benchmarks/structured-formats.md` with:

```text
conversion coverage by calls and bytes
per-payload structure class
native/pretty JSON/compact JSON/TOON/GCF bytes
o200k_base token counts
round-trip result
cold/warm encode/decode latency

TOON = PROMISING | NOT_MATERIAL | INCOMPATIBLE
GCF  = PROMISING | NOT_MATERIAL | INCOMPATIBLE
```

`PROMISING` requires material savings on enough representative payloads without fidelity failure or unacceptable latency. Neither vendor's published benchmark is acceptance evidence for this workload.

- [ ] **Step 6: Apply the independent CodeDB decision**

CodeDB `KEEP` requires at least baseline correctness/reliability plus materially better navigation, evidence focus, or context efficiency.

If `KEEP`:

```text
retain CodeDB installer/launcher/template entry
record KEEP in docs/benchmarks/codedb.md
continue to Phase 2
```

If `REMOVE`:

```bash
rm scripts/install-codedb.sh scripts/codedb-mcp.sh
```

Then remove `codedb` from `config/templates/mcp.json`, its smoke assertions, and temporary public docs; update `tests/harness.sh` to require its absence; retain both benchmark documents.

Run:

```bash
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
git diff --check
```

Continue to Phase 2 regardless of the CodeDB, TOON, or GCF verdicts.

- [ ] **Step 7: Refresh the ChatGPT catalog if CodeDB was removed**

After rollback:

```text
restart bridge and verify health
verify generated config no longer contains CodeDB
ChatGPT workspace/plugin -> Actions -> Refresh
start a fresh MCP-backed session
verify CodeDB actions are absent
```

- [ ] **Step 8: Integrator-only commit**

Commit the benchmark evidence and the exact CodeDB keep/rollback result. Helpers do not commit.

---

# Phase 2 — Pi-backed Files + trusted-dev Shell

### Task 4: Scaffold a Reproducible Pi Dev Provider With Separate Boundary and Renderer Modules

**Files:**
- Create: `providers/pi-dev/package.json`
- Create: `providers/pi-dev/package-lock.json`
- Create: `providers/pi-dev/boundary.mjs`
- Create: `providers/pi-dev/files.mjs`
- Create: `providers/pi-dev/shell.mjs`
- Create: `providers/pi-dev/render.mjs`
- Create: `providers/pi-dev/server.mjs`
- Create: `providers/pi-dev/test/boundary.test.mjs`
- Create: `providers/pi-dev/test/files.test.mjs`
- Create: `providers/pi-dev/test/shell.test.mjs`
- Create: `providers/pi-dev/test/render.test.mjs`
- Create: `providers/pi-dev/test/server.test.mjs`
- Modify: `tests/harness.sh`

**Interfaces:**
- Exact direct pins: Pi 0.84.1; MCP SDK 1.30.0; Zod 4.4.3.
- `boundary.mjs` owns workspace-relative path/cwd resolution.
- `files.mjs` owns Pi file operations.
- `shell.mjs` returns internal execution records.
- `render.mjs` converts internal records to native TextContent strings.
- `server.mjs` exposes only the selected tools; no Pi agent/session/model APIs.

- [ ] **Step 1: Create exact package metadata**

`providers/pi-dev/package.json`:

```json
{
  "name": "mcp-dev-bridge-pi-dev",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=22.19.0" },
  "scripts": {
    "test": "node --test test/*.test.mjs",
    "start": "node server.mjs"
  },
  "dependencies": {
    "@earendil-works/pi-coding-agent": "0.84.1",
    "@modelcontextprotocol/sdk": "1.30.0",
    "zod": "4.4.3"
  }
}
```

Generate/install reproducibly:

```bash
cd providers/pi-dev
npm install --package-lock-only
npm ci
```

- [ ] **Step 2: Add package and file-structure assertions**

Extend `tests/harness.sh` to parse `providers/pi-dev/package.json`, require the three exact versions, and require all five provider modules plus all five test files.

- [ ] **Step 3: Create explicit failing stubs, not fake success paths**

```js
// boundary.mjs
export async function canonicalWorkspaceRoot() { throw new Error('not implemented'); }
export async function resolveExistingWorkspacePath() { throw new Error('not implemented'); }
export async function resolveNewWorkspacePath() { throw new Error('not implemented'); }
export async function resolveWorkspaceCwd() { throw new Error('not implemented'); }
```

```js
// files.mjs
export async function runRead() { throw new Error('not implemented'); }
export async function runEdit() { throw new Error('not implemented'); }
export async function runWrite() { throw new Error('not implemented'); }
```

```js
// shell.mjs
export async function runBash() { throw new Error('not implemented'); }
```

```js
// render.mjs
export function renderBashText() { throw new Error('not implemented'); }
export function renderEditText() { throw new Error('not implemented'); }
export function renderWriteText() { throw new Error('not implemented'); }
```

```js
// server.mjs
throw new Error('not implemented');
```

- [ ] **Step 4: Run scaffold checks**

```bash
cd providers/pi-dev
npm test || true
node --check boundary.mjs files.mjs shell.mjs render.mjs server.mjs
cd ../..
bash tests/harness.sh
```

Expected: dependency/structure checks pass; behavior tests are implemented in Tasks 5-7.

- [ ] **Step 5: Integrator-only commit**

```bash
git add providers/pi-dev tests/harness.sh
git commit -m "build: scaffold pinned Pi dev provider"
```

Helpers skip this step.

---

### Task 5: Implement Workspace-Confined Pi Files With Exact Edit and Exclusive Create

**Files:**
- Modify: `providers/pi-dev/boundary.mjs`
- Modify: `providers/pi-dev/files.mjs`
- Modify: `providers/pi-dev/test/boundary.test.mjs`
- Modify: `providers/pi-dev/test/files.test.mjs`

**Interfaces:**

```js
canonicalWorkspaceRoot(root) -> Promise<string>
resolveExistingWorkspacePath(root, relativePath) -> Promise<string>
resolveNewWorkspacePath(root, relativePath) -> Promise<string>
resolveWorkspaceCwd(root, relativeCwd?) -> Promise<string>

runRead({workspaceRoot, path, offset?, limit?}, signal?) -> Pi result
runEdit({workspaceRoot, path, edits}, signal?) -> Pi result with details.diff
runWrite({workspaceRoot, path, content}, signal?) -> Pi result
```

The model-facing MCP schema does not include `workspaceRoot`; `server.mjs` injects it from `MCP_DEV_WORKSPACE_ROOT`.

- [ ] **Step 1: Write failing workspace-boundary tests**

Replace `providers/pi-dev/test/boundary.test.mjs` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  canonicalWorkspaceRoot,
  resolveExistingWorkspacePath,
  resolveNewWorkspacePath,
  resolveWorkspaceCwd
} from '../boundary.mjs';

const tempDir = prefix => fs.mkdtemp(path.join(os.tmpdir(), prefix));

test('workspace root must be an absolute existing directory', async () => {
  await assert.rejects(() => canonicalWorkspaceRoot('relative/root'), /absolute/);
  const root = await tempDir('pi-boundary-root-');
  assert.equal(await canonicalWorkspaceRoot(root), await fs.realpath(root));
});

test('existing path is workspace-relative and canonicalized inside root', async () => {
  const root = await tempDir('pi-boundary-existing-');
  await fs.mkdir(path.join(root, 'repo'));
  await fs.writeFile(path.join(root, 'repo', 'x.txt'), 'x');
  assert.equal(
    await resolveExistingWorkspacePath(root, 'repo/x.txt'),
    await fs.realpath(path.join(root, 'repo', 'x.txt'))
  );
});

test('absolute file path is rejected even when it exists', async () => {
  const root = await tempDir('pi-boundary-absolute-');
  const outside = path.join(await tempDir('pi-boundary-outside-'), 'x.txt');
  await fs.writeFile(outside, 'outside');
  await assert.rejects(() => resolveExistingWorkspacePath(root, outside), /relative/);
});

test('parent traversal is rejected before filesystem access', async () => {
  const root = await tempDir('pi-boundary-traversal-');
  await assert.rejects(() => resolveExistingWorkspacePath(root, '../outside.txt'), /\.\./);
  await assert.rejects(() => resolveNewWorkspacePath(root, 'repo/../../outside.txt'), /\.\./);
});

test('existing symlink escape is rejected', async () => {
  const root = await tempDir('pi-boundary-symlink-');
  const outside = await tempDir('pi-boundary-symlink-outside-');
  await fs.writeFile(path.join(outside, 'secret.txt'), 'secret');
  await fs.symlink(path.join(outside, 'secret.txt'), path.join(root, 'secret-link'));
  await assert.rejects(() => resolveExistingWorkspacePath(root, 'secret-link'), /outside workspace/);
});

test('new file through symlinked outside parent is rejected', async () => {
  const root = await tempDir('pi-boundary-write-link-');
  const outside = await tempDir('pi-boundary-write-outside-');
  await fs.symlink(outside, path.join(root, 'outside-parent'));
  await assert.rejects(() => resolveNewWorkspacePath(root, 'outside-parent/new.txt'), /outside workspace/);
});

test('new file requires an existing canonical parent inside workspace', async () => {
  const root = await tempDir('pi-boundary-write-parent-');
  await fs.mkdir(path.join(root, 'repo'));
  assert.equal(
    await resolveNewWorkspacePath(root, 'repo/new.txt'),
    path.join(await fs.realpath(path.join(root, 'repo')), 'new.txt')
  );
  await assert.rejects(() => resolveNewWorkspacePath(root, 'missing/new.txt'), /parent.*exist/i);
});

test('bash cwd defaults to root and accepts only relative inside directories', async () => {
  const root = await tempDir('pi-boundary-cwd-');
  await fs.mkdir(path.join(root, 'repo'));
  assert.equal(await resolveWorkspaceCwd(root), await fs.realpath(root));
  assert.equal(await resolveWorkspaceCwd(root, 'repo'), await fs.realpath(path.join(root, 'repo')));
  await assert.rejects(() => resolveWorkspaceCwd(root, '/tmp'), /relative/);
  await assert.rejects(() => resolveWorkspaceCwd(root, '../outside'), /\.\./);
});
```

- [ ] **Step 2: Write failing Files behavior tests**

Replace `providers/pi-dev/test/files.test.mjs` with tests for ranged read, multi-edit, fuzzy rejection, CRLF preservation, observed edit conflict, create-only write, and concurrent create:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStrictEditOperations, runRead, runEdit, runWrite } from '../files.mjs';

const tempDir = prefix => fs.mkdtemp(path.join(os.tmpdir(), prefix));

test('read honors Pi offset and limit within workspace', async () => {
  const workspaceRoot = await tempDir('pi-read-');
  await fs.mkdir(path.join(workspaceRoot, 'repo'));
  await fs.writeFile(path.join(workspaceRoot, 'repo', 'x.txt'), 'one\ntwo\nthree\nfour\n');
  const result = await runRead({ workspaceRoot, path: 'repo/x.txt', offset: 2, limit: 2 });
  const text = result.content.filter(x => x.type === 'text').map(x => x.text).join('\n');
  assert.match(text, /two/);
  assert.match(text, /three/);
  assert.doesNotMatch(text, /four/);
});

test('edit performs multiple exact disjoint replacements and returns a diff', async () => {
  const workspaceRoot = await tempDir('pi-edit-');
  await fs.mkdir(path.join(workspaceRoot, 'repo'));
  const file = path.join(workspaceRoot, 'repo', 'x.txt');
  await fs.writeFile(file, 'alpha\nbeta\ngamma\n');
  const result = await runEdit({
    workspaceRoot,
    path: 'repo/x.txt',
    edits: [
      { oldText: 'alpha', newText: 'ALPHA' },
      { oldText: 'gamma', newText: 'GAMMA' }
    ]
  });
  assert.equal(await fs.readFile(file, 'utf8'), 'ALPHA\nbeta\nGAMMA\n');
  assert.match(result.details.diff, /ALPHA/);
  assert.match(result.details.diff, /GAMMA/);
});

test('fuzzy-only Unicode quote match is rejected', async () => {
  const workspaceRoot = await tempDir('pi-fuzzy-');
  await fs.writeFile(path.join(workspaceRoot, 'x.txt'), 'const x = “hello”;\n');
  await assert.rejects(
    () => runEdit({
      workspaceRoot,
      path: 'x.txt',
      edits: [{ oldText: 'const x = "hello";', newText: 'const x = "bye";' }]
    }),
    /exact text.*not found/i
  );
});

test('CRLF file accepts LF oldText and preserves CRLF', async () => {
  const workspaceRoot = await tempDir('pi-crlf-');
  const file = path.join(workspaceRoot, 'x.txt');
  await fs.writeFile(file, 'alpha\r\nbeta\r\n');
  await runEdit({
    workspaceRoot,
    path: 'x.txt',
    edits: [{ oldText: 'alpha\nbeta', newText: 'ALPHA\nbeta' }]
  });
  assert.equal(await fs.readFile(file, 'utf8'), 'ALPHA\r\nbeta\r\n');
});

test('edit operation detects a changed snapshot before write', async () => {
  const workspaceRoot = await tempDir('pi-conflict-');
  const file = path.join(workspaceRoot, 'x.txt');
  await fs.writeFile(file, 'alpha\n');
  const ops = createStrictEditOperations([{ oldText: 'alpha', newText: 'ALPHA' }]);
  await ops.access(file);
  await ops.readFile(file);
  await fs.writeFile(file, 'other\n');
  await assert.rejects(() => ops.writeFile(file, 'ALPHA\n'), /changed during edit/i);
  assert.equal(await fs.readFile(file, 'utf8'), 'other\n');
});

test('write creates a new file and refuses an existing path', async () => {
  const workspaceRoot = await tempDir('pi-write-');
  await runWrite({ workspaceRoot, path: 'new.txt', content: 'first\n' });
  await assert.rejects(
    () => runWrite({ workspaceRoot, path: 'new.txt', content: 'second\n' }),
    /already exists|use edit/i
  );
  assert.equal(await fs.readFile(path.join(workspaceRoot, 'new.txt'), 'utf8'), 'first\n');
});

test('two concurrent creates for one absent path yield exactly one success', async () => {
  const workspaceRoot = await tempDir('pi-write-race-');
  const settled = await Promise.allSettled([
    runWrite({ workspaceRoot, path: 'race.txt', content: 'A\n' }),
    runWrite({ workspaceRoot, path: 'race.txt', content: 'B\n' })
  ]);
  assert.equal(settled.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(settled.filter(x => x.status === 'rejected').length, 1);
  assert.match(await fs.readFile(path.join(workspaceRoot, 'race.txt'), 'utf8'), /^(A|B)\n$/);
});
```

- [ ] **Step 3: Run RED**

```bash
cd providers/pi-dev
node --test test/boundary.test.mjs test/files.test.mjs
```

Expected: failures against the scaffold stubs.

- [ ] **Step 4: Implement the workspace boundary**

Replace `providers/pi-dev/boundary.mjs` with:

```js
import fs from 'node:fs/promises';
import path from 'node:path';

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function requireRelative(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty workspace-relative path`);
  }
  if (value.includes('\0')) throw new Error(`${label} contains a NUL byte`);
  if (path.isAbsolute(value)) throw new Error(`${label} must be workspace-relative`);
  if (value.split('/').includes('..')) throw new Error(`${label} must not contain .. segments`);
  return value;
}

export async function canonicalWorkspaceRoot(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) {
    throw new Error('MCP_DEV_WORKSPACE_ROOT must be an absolute path');
  }
  const real = await fs.realpath(root);
  const stat = await fs.stat(real);
  if (!stat.isDirectory()) throw new Error('MCP_DEV_WORKSPACE_ROOT must be a directory');
  return real;
}

export async function resolveExistingWorkspacePath(root, relativePath) {
  const canonicalRoot = await canonicalWorkspaceRoot(root);
  requireRelative(relativePath, 'path');
  const target = await fs.realpath(path.resolve(canonicalRoot, relativePath));
  if (!isWithin(canonicalRoot, target)) throw new Error('path resolves outside workspace');
  const stat = await fs.stat(target);
  if (!stat.isFile()) throw new Error('path must resolve to a file');
  return target;
}

export async function resolveNewWorkspacePath(root, relativePath) {
  const canonicalRoot = await canonicalWorkspaceRoot(root);
  requireRelative(relativePath, 'path');
  const unresolved = path.resolve(canonicalRoot, relativePath);
  let parent;
  try {
    parent = await fs.realpath(path.dirname(unresolved));
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error('write parent must already exist');
    throw error;
  }
  const stat = await fs.stat(parent);
  if (!stat.isDirectory()) throw new Error('write parent must be a directory');
  if (!isWithin(canonicalRoot, parent)) throw new Error('write parent resolves outside workspace');
  return path.join(parent, path.basename(unresolved));
}

export async function resolveWorkspaceCwd(root, relativeCwd) {
  const canonicalRoot = await canonicalWorkspaceRoot(root);
  if (relativeCwd === undefined || relativeCwd === '') return canonicalRoot;
  requireRelative(relativeCwd, 'cwd');
  const target = await fs.realpath(path.resolve(canonicalRoot, relativeCwd));
  if (!isWithin(canonicalRoot, target)) throw new Error('cwd resolves outside workspace');
  const stat = await fs.stat(target);
  if (!stat.isDirectory()) throw new Error('cwd must resolve to a directory');
  return target;
}
```

- [ ] **Step 5: Implement guarded Pi Files operations**

Replace `providers/pi-dev/files.mjs` with:

```js
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  createEditTool,
  createReadTool,
  createWriteTool
} from '@earendil-works/pi-coding-agent';
import {
  canonicalWorkspaceRoot,
  resolveExistingWorkspacePath,
  resolveNewWorkspacePath
} from './boundary.mjs';

function normalizeExactText(text) {
  const withoutBom = text.startsWith('\uFEFF') ? text.slice(1) : text;
  return withoutBom.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function exactOccurrenceCount(content, needle) {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  while (true) {
    const index = content.indexOf(needle, from);
    if (index === -1) return count;
    count += 1;
    from = index + 1;
  }
}

function validateExactEdits(buffer, edits) {
  const content = normalizeExactText(buffer.toString('utf8'));
  for (let i = 0; i < edits.length; i += 1) {
    const oldText = normalizeExactText(edits[i].oldText);
    if (!oldText) throw new Error(`edits[${i}].oldText must not be empty`);
    const count = exactOccurrenceCount(content, oldText);
    if (count === 0) throw new Error(`edits[${i}] exact text was not found; fuzzy matching is disabled`);
    if (count > 1) throw new Error(`edits[${i}] exact text is not unique (${count} occurrences)`);
  }
}

export function createStrictEditOperations(edits) {
  let snapshot = null;
  let snapshotPath = null;
  return {
    access: absolutePath => fs.access(absolutePath, constants.R_OK | constants.W_OK),
    readFile: async absolutePath => {
      const buffer = await fs.readFile(absolutePath);
      validateExactEdits(buffer, edits);
      snapshot = Buffer.from(buffer);
      snapshotPath = absolutePath;
      return buffer;
    },
    writeFile: async (absolutePath, content) => {
      if (!snapshot || snapshotPath !== absolutePath) throw new Error('edit snapshot is missing');
      const current = await fs.readFile(absolutePath);
      if (!current.equals(snapshot)) throw new Error('file changed during edit; reread and reconcile');
      await fs.writeFile(absolutePath, content, 'utf8');
    }
  };
}

const exclusiveWriteOperations = {
  mkdir: async dir => {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) throw new Error('write parent must be a directory');
  },
  writeFile: (absolutePath, content) => fs.writeFile(
    absolutePath,
    content,
    { encoding: 'utf8', flag: 'wx' }
  )
};

export async function runRead({ workspaceRoot, path, offset, limit }, signal) {
  const root = await canonicalWorkspaceRoot(workspaceRoot);
  const target = await resolveExistingWorkspacePath(root, path);
  const tool = createReadTool(root);
  return tool.execute(randomUUID(), { path: target, offset, limit }, signal);
}

export async function runEdit({ workspaceRoot, path, edits }, signal) {
  const root = await canonicalWorkspaceRoot(workspaceRoot);
  const target = await resolveExistingWorkspacePath(root, path);
  const tool = createEditTool(root, { operations: createStrictEditOperations(edits) });
  return tool.execute(randomUUID(), { path: target, edits }, signal);
}

export async function runWrite({ workspaceRoot, path, content }, signal) {
  const root = await canonicalWorkspaceRoot(workspaceRoot);
  const target = await resolveNewWorkspacePath(root, path);
  const tool = createWriteTool(root, { operations: exclusiveWriteOperations });
  try {
    return await tool.execute(randomUUID(), { path: target, content }, signal);
  } catch (error) {
    if (error?.code === 'EEXIST' || /EEXIST/.test(error?.message ?? '')) {
      throw new Error('file already exists; use edit for existing files');
    }
    throw error;
  }
}
```

- [ ] **Step 6: Run GREEN**

```bash
cd providers/pi-dev
node --test test/boundary.test.mjs test/files.test.mjs
```

Expected: all boundary and Files tests pass.

- [ ] **Step 7: Integrator-only commit**

```bash
git add providers/pi-dev/boundary.mjs providers/pi-dev/files.mjs \
  providers/pi-dev/test/boundary.test.mjs providers/pi-dev/test/files.test.mjs
git commit -m "feat: add workspace-confined Pi file primitives"
```

Helpers skip this step.

---

### Task 6: Implement Pi Bash With Workspace-Relative Cwd and Internal Execution Records

**Files:**
- Modify: `providers/pi-dev/shell.mjs`
- Modify: `providers/pi-dev/test/shell.test.mjs`

**Interfaces:**

```js
runBash({
  workspaceRoot,
  command,
  cwd?,
  timeout_seconds = 30,
  maxOutputBytes,
  stateDir
}, signal?)
  -> {
       cwd, exit_code, output, output_bytes, duration_ms,
       timed_out, cancelled, truncated, full_output_path,
       timeout_seconds
     }
```

`maxOutputBytes` and `stateDir` are server/deployment inputs. They are never model-facing MCP arguments.

- [ ] **Step 1: Write failing Shell tests**

Replace `providers/pi-dev/test/shell.test.mjs` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runBash } from '../shell.mjs';

const tempDir = prefix => fs.mkdtemp(path.join(os.tmpdir(), prefix));

async function waitForDeath(pid, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`process ${pid} is still alive`);
}

test('native compound command runs from immutable workspace root by default', async () => {
  const workspaceRoot = await tempDir('pi-bash-root-');
  await fs.writeFile(path.join(workspaceRoot, 'id'), 'ROOT\n');
  const result = await runBash({
    workspaceRoot,
    command: "cat id && printf 'one\\ntwo\\n' | tail -1",
    maxOutputBytes: 1024 * 1024,
    stateDir: await tempDir('pi-bash-state-')
  });
  assert.equal(result.exit_code, 0);
  assert.equal(result.cwd, await fs.realpath(workspaceRoot));
  assert.match(result.output, /ROOT/);
  assert.match(result.output, /two/);
});

test('relative cwd selects a directory below workspace', async () => {
  const workspaceRoot = await tempDir('pi-bash-cwd-');
  await fs.mkdir(path.join(workspaceRoot, 'repo'));
  await fs.writeFile(path.join(workspaceRoot, 'repo', 'id'), 'REPO\n');
  const result = await runBash({
    workspaceRoot,
    cwd: 'repo',
    command: 'cat id',
    maxOutputBytes: 1024 * 1024,
    stateDir: await tempDir('pi-bash-cwd-state-')
  });
  assert.equal(result.cwd, await fs.realpath(path.join(workspaceRoot, 'repo')));
  assert.match(result.output, /REPO/);
});

test('normal non-zero exit is returned as data', async () => {
  const workspaceRoot = await tempDir('pi-bash-exit-');
  const result = await runBash({
    workspaceRoot,
    command: "printf 'no-match\\n'; exit 7",
    maxOutputBytes: 1024 * 1024,
    stateDir: await tempDir('pi-bash-exit-state-')
  });
  assert.equal(result.exit_code, 7);
  assert.equal(result.timed_out, false);
  assert.equal(result.cancelled, false);
  assert.match(result.output, /no-match/);
});

test('timeout kills a background descendant', async () => {
  const workspaceRoot = await tempDir('pi-bash-timeout-');
  const pidFile = path.join(workspaceRoot, 'child.pid');
  const result = await runBash({
    workspaceRoot,
    command: `sleep 30 & echo $! > ${JSON.stringify(pidFile)}; wait`,
    timeout_seconds: 0.2,
    maxOutputBytes: 1024 * 1024,
    stateDir: await tempDir('pi-bash-timeout-state-')
  });
  assert.equal(result.timed_out, true);
  assert.equal(result.exit_code, null);
  const pid = Number((await fs.readFile(pidFile, 'utf8')).trim());
  await waitForDeath(pid);
});

test('AbortSignal cancels and kills descendants', async () => {
  const workspaceRoot = await tempDir('pi-bash-cancel-');
  const pidFile = path.join(workspaceRoot, 'child.pid');
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 150);
  const result = await runBash({
    workspaceRoot,
    command: `sleep 30 & echo $! > ${JSON.stringify(pidFile)}; wait`,
    timeout_seconds: 30,
    maxOutputBytes: 1024 * 1024,
    stateDir: await tempDir('pi-bash-cancel-state-')
  }, controller.signal);
  assert.equal(result.cancelled, true);
  assert.equal(result.exit_code, null);
  const pid = Number((await fs.readFile(pidFile, 'utf8')).trim());
  await waitForDeath(pid);
});

test('large output is bounded and full output is retained', async () => {
  const workspaceRoot = await tempDir('pi-bash-output-');
  const stateDir = await tempDir('pi-bash-output-state-');
  const result = await runBash({
    workspaceRoot,
    command: `node -e "process.stdout.write('x'.repeat(5000))"`,
    maxOutputBytes: 1024,
    stateDir
  });
  assert.equal(result.exit_code, 0);
  assert.equal(result.truncated, true);
  assert.ok(Buffer.byteLength(result.output) <= 1024);
  assert.ok(result.full_output_path);
  assert.equal((await fs.readFile(result.full_output_path)).length, 5000);
  assert.equal(result.output_bytes, 5000);
});

test('timeout policy rejects values above 300 seconds', async () => {
  const workspaceRoot = await tempDir('pi-bash-limit-');
  const stateDir = await tempDir('pi-bash-limit-state-');
  await assert.rejects(() => runBash({
    workspaceRoot,
    command: 'true',
    timeout_seconds: 301,
    maxOutputBytes: 1024 * 1024,
    stateDir
  }), /300/);
});
```

- [ ] **Step 2: Run RED**

```bash
cd providers/pi-dev
node --test test/shell.test.mjs
```

- [ ] **Step 3: Implement the internal Bash execution record**

Replace `providers/pi-dev/shell.mjs` with:

```js
import {
  closeSync,
  mkdirSync,
  openSync,
  unlinkSync,
  writeSync
} from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createLocalBashOperations } from '@earendil-works/pi-coding-agent';
import { resolveWorkspaceCwd } from './boundary.mjs';

const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_TIMEOUT_SECONDS = 300;
const MAX_POLICY_BYTES = 16 * 1024 * 1024;

function positiveNumber(name, value, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > max) {
    throw new Error(`${name} must be > 0 and <= ${max}`);
  }
}

function boundedTail(current, chunk, limit) {
  if (chunk.length >= limit) return Buffer.from(chunk.subarray(chunk.length - limit));
  if (current.length + chunk.length <= limit) return Buffer.concat([current, chunk]);
  const keep = limit - chunk.length;
  return Buffer.concat([current.subarray(current.length - keep), chunk]);
}

export async function runBash({
  workspaceRoot,
  command,
  cwd,
  timeout_seconds = DEFAULT_TIMEOUT_SECONDS,
  maxOutputBytes,
  stateDir
}, signal) {
  if (typeof command !== 'string' || command.length === 0) {
    throw new Error('command must be a non-empty string');
  }
  positiveNumber('timeout_seconds', timeout_seconds, MAX_TIMEOUT_SECONDS);
  positiveNumber('MCP_DEV_MAX_OUTPUT_BYTES', maxOutputBytes, MAX_POLICY_BYTES);
  if (typeof stateDir !== 'string' || !path.isAbsolute(stateDir)) {
    throw new Error('MCP_DEV_STATE_DIR must be an absolute path');
  }

  const resolvedCwd = await resolveWorkspaceCwd(workspaceRoot, cwd);
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const spool = path.join(stateDir, `bash-${Date.now()}-${randomUUID()}.log`);
  const fd = openSync(spool, 'wx', 0o600);

  const ops = createLocalBashOperations();
  const started = process.hrtime.bigint();
  let tail = Buffer.alloc(0);
  let outputBytes = 0;
  let exitCode = null;
  let timedOut = false;
  let cancelled = false;
  let unexpected = null;

  const onData = data => {
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
    writeSync(fd, chunk);
    outputBytes += chunk.length;
    tail = boundedTail(tail, chunk, maxOutputBytes);
  };

  try {
    ({ exitCode } = await ops.exec(command, resolvedCwd, {
      onData,
      signal,
      timeout: timeout_seconds
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'aborted') cancelled = true;
    else if (message.startsWith('timeout:')) timedOut = true;
    else unexpected = error;
  } finally {
    closeSync(fd);
  }

  if (unexpected) {
    try { unlinkSync(spool); } catch {}
    throw unexpected;
  }

  const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  const truncated = outputBytes > maxOutputBytes;
  if (!truncated) {
    try { unlinkSync(spool); } catch {}
  }

  return {
    cwd: resolvedCwd,
    exit_code: timedOut || cancelled ? null : exitCode,
    output: tail.toString('utf8'),
    output_bytes: outputBytes,
    duration_ms: Math.round(durationMs),
    timed_out: timedOut,
    cancelled,
    truncated,
    full_output_path: truncated ? spool : null,
    timeout_seconds
  };
}
```

- [ ] **Step 4: Run GREEN**

```bash
cd providers/pi-dev
node --test test/shell.test.mjs
```

Expected: compound commands, relative cwd, non-zero exit, timeout, cancellation, and truncation all pass.

- [ ] **Step 5: Integrator-only commit**

```bash
git add providers/pi-dev/shell.mjs providers/pi-dev/test/shell.test.mjs
git commit -m "feat: add native Pi shell execution record"
```

Helpers skip this step.

---

### Task 7: Render Native TextContent and Expose the Minimal Profile-Aware MCP Surface

**Files:**
- Modify: `providers/pi-dev/render.mjs`
- Modify: `providers/pi-dev/server.mjs`
- Modify: `providers/pi-dev/test/render.test.mjs`
- Modify: `providers/pi-dev/test/server.test.mjs`

**Interfaces:**
- `trusted-dev` / `MCP_DEV_SHELL_MODE=unrestricted`: exactly `bash`, `edit`, `read`, `write`.
- `restricted` / `MCP_DEV_SHELL_MODE=allowlist`: exactly `edit`, `read`, `write`; legacy shell remains separate.
- Files schemas contain no cwd or workspace-root field.
- Bash schema contains only `command`, optional relative `cwd`, and optional `timeout_seconds`.
- Every successful dev result uses `content`; none uses `structuredContent` or embedded resources.

- [ ] **Step 1: Write failing renderer tests**

Replace `providers/pi-dev/test/render.test.mjs` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBashText, renderEditText, renderWriteText } from '../render.mjs';

function record(overrides = {}) {
  return {
    cwd: '/workspace/repo',
    exit_code: 0,
    output: '',
    output_bytes: 0,
    duration_ms: 1,
    timed_out: false,
    cancelled: false,
    truncated: false,
    full_output_path: null,
    timeout_seconds: 30,
    ...overrides
  };
}

test('successful terminal output remains plain terminal text', () => {
  assert.equal(renderBashText(record({ output: ' M src/foo.ts\n' })), ' M src/foo.ts\n');
});

test('empty successful command gets a minimal acknowledgement', () => {
  assert.equal(renderBashText(record()), 'Command completed.');
});

test('non-zero exit appends only the meaningful status', () => {
  assert.equal(
    renderBashText(record({ exit_code: 1, output: 'Tests: 1 failed, 83 passed\n' })),
    'Tests: 1 failed, 83 passed\n[exit 1]'
  );
});

test('truncation points to the full output handle', () => {
  assert.equal(
    renderBashText(record({
      output: 'tail\n',
      truncated: true,
      full_output_path: '/state/dev/bash-a82f.log'
    })),
    'tail\n[truncated · full: /state/dev/bash-a82f.log]'
  );
});

test('timeout is rendered as a native exceptional annotation', () => {
  assert.equal(
    renderBashText(record({ timed_out: true, exit_code: null, timeout_seconds: 30 })),
    '[timed out after 30s]'
  );
});

test('edit renderer returns one path plus diff without Pi success prose', () => {
  const text = renderEditText('repo/src/foo.ts', '  old\n- value\n+ VALUE');
  assert.equal(text, 'repo/src/foo.ts\n  old\n- value\n+ VALUE');
  assert.doesNotMatch(text, /Successfully replaced|Done!/);
});

test('write renderer is a short creation acknowledgement', () => {
  assert.equal(renderWriteText('repo/src/new.ts'), 'Created repo/src/new.ts');
});
```

- [ ] **Step 2: Implement the native renderer**

Replace `providers/pi-dev/render.mjs` with:

```js
function appendLines(output, annotations) {
  const base = output ?? '';
  if (annotations.length === 0) return base || 'Command completed.';
  if (!base) return annotations.join('\n');
  return `${base.endsWith('\n') ? base : `${base}\n`}${annotations.join('\n')}`;
}

export function renderBashText(result) {
  const annotations = [];
  if (result.truncated && result.full_output_path) {
    annotations.push(`[truncated · full: ${result.full_output_path}]`);
  }
  if (result.timed_out) {
    annotations.push(`[timed out after ${result.timeout_seconds}s]`);
  } else if (result.cancelled) {
    annotations.push('[cancelled]');
  } else if (result.exit_code !== 0) {
    annotations.push(`[exit ${result.exit_code}]`);
  }
  return appendLines(result.output, annotations);
}

export function renderEditText(relativePath, diff) {
  return diff ? `${relativePath}\n${diff}` : `Updated ${relativePath}`;
}

export function renderWriteText(relativePath) {
  return `Created ${relativePath}`;
}
```

- [ ] **Step 3: Write failing stdio MCP tests**

Replace `providers/pi-dev/test/server.test.mjs` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const server = path.resolve(here, '..', 'server.mjs');
const tempDir = prefix => fs.mkdtemp(path.join(os.tmpdir(), prefix));

async function fixture(mode = 'unrestricted', maxBytes = '1048576') {
  const workspaceRoot = await tempDir('pi-dev-workspace-');
  const stateDir = await tempDir('pi-dev-state-');
  const env = {
    MCP_DEV_SHELL_MODE: mode,
    MCP_DEV_WORKSPACE_ROOT: workspaceRoot,
    MCP_DEV_STATE_DIR: stateDir,
    MCP_DEV_MAX_OUTPUT_BYTES: maxBytes
  };
  return { workspaceRoot, stateDir, env };
}

async function withClient(env, fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [server],
    env: { ...process.env, ...env },
    stderr: 'pipe'
  });
  const client = new Client({ name: 'pi-dev-test', version: '1.0.0' });
  await client.connect(transport);
  try { return await fn(client); }
  finally { await client.close(); }
}

function textOf(result) {
  assert.equal(result.structuredContent, undefined);
  assert.ok(result.content.every(block => block.type === 'text'));
  return result.content.map(block => block.text).join('\n');
}

test('trusted-dev exposes four tools and minimal schemas', async () => {
  const { env } = await fixture('unrestricted');
  await withClient(env, async client => {
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(x => x.name).sort(), ['bash', 'edit', 'read', 'write']);
    const bash = listed.tools.find(x => x.name === 'bash');
    assert.deepEqual(Object.keys(bash.inputSchema.properties).sort(), ['command', 'cwd', 'timeout_seconds']);
    const read = listed.tools.find(x => x.name === 'read');
    assert.deepEqual(Object.keys(read.inputSchema.properties).sort(), ['limit', 'offset', 'path']);
    for (const tool of listed.tools) {
      assert.equal(JSON.stringify(tool.inputSchema).includes('max_output_bytes'), false);
      assert.equal(JSON.stringify(tool.inputSchema).includes('workspaceRoot'), false);
    }
  });
});

test('restricted omits unrestricted Pi bash', async () => {
  const { env } = await fixture('allowlist');
  await withClient(env, async client => {
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(x => x.name).sort(), ['edit', 'read', 'write']);
  });
});

test('read returns plain text and rejects absolute paths', async () => {
  const { workspaceRoot, env } = await fixture();
  await fs.writeFile(path.join(workspaceRoot, 'x.txt'), 'alpha\nbeta\n');
  await withClient(env, async client => {
    const ok = await client.callTool({ name: 'read', arguments: { path: 'x.txt', offset: 1, limit: 1 } });
    assert.match(textOf(ok), /alpha/);
    const denied = await client.callTool({ name: 'read', arguments: { path: '/etc/passwd' } });
    assert.equal(denied.isError, true);
    assert.match(textOf(denied), /relative/);
  });
});

test('edit returns one diff artifact without generic success prose', async () => {
  const { workspaceRoot, env } = await fixture();
  await fs.writeFile(path.join(workspaceRoot, 'x.txt'), 'alpha\nbeta\n');
  await withClient(env, async client => {
    const result = await client.callTool({
      name: 'edit',
      arguments: { path: 'x.txt', edits: [{ oldText: 'alpha', newText: 'ALPHA' }] }
    });
    const text = textOf(result);
    assert.match(text, /^x\.txt\n/);
    assert.match(text, /ALPHA/);
    assert.doesNotMatch(text, /Successfully replaced|Done!/);
  });
});

test('write returns a short acknowledgement', async () => {
  const { workspaceRoot, env } = await fixture();
  await withClient(env, async client => {
    const result = await client.callTool({
      name: 'write',
      arguments: { path: 'new.txt', content: 'new\n' }
    });
    assert.equal(textOf(result), 'Created new.txt');
    assert.equal(await fs.readFile(path.join(workspaceRoot, 'new.txt'), 'utf8'), 'new\n');
  });
});

test('bash returns terminal text rather than JSON record', async () => {
  const { workspaceRoot, env } = await fixture();
  await fs.mkdir(path.join(workspaceRoot, 'repo'));
  await withClient(env, async client => {
    const result = await client.callTool({
      name: 'bash',
      arguments: { cwd: 'repo', command: "printf ' M src/foo.ts\\n'; exit 1" }
    });
    const text = textOf(result);
    assert.equal(text, ' M src/foo.ts\n[exit 1]');
    assert.throws(() => JSON.parse(text));
  });
});

test('bash cwd parameter rejects absolute and traversal values', async () => {
  const { env } = await fixture();
  await withClient(env, async client => {
    for (const cwd of ['/tmp', '../outside']) {
      const result = await client.callTool({
        name: 'bash',
        arguments: { cwd, command: 'pwd' }
      });
      assert.equal(result.isError, true);
      assert.match(textOf(result), /relative|\.\./);
    }
  });
});

test('trusted-dev command body remains unrestricted outside workspace', async () => {
  const { env } = await fixture();
  await withClient(env, async client => {
    const result = await client.callTool({
      name: 'bash',
      arguments: { command: "head -1 /etc/os-release" }
    });
    assert.match(textOf(result), /^(NAME|PRETTY_NAME)=/);
  });
});

test('deployment output limit is applied without appearing in schema', async () => {
  const { env } = await fixture('unrestricted', '1024');
  await withClient(env, async client => {
    const result = await client.callTool({
      name: 'bash',
      arguments: { command: `node -e "process.stdout.write('x'.repeat(5000))"` }
    });
    const text = textOf(result);
    assert.match(text, /\[truncated · full: .*\]/);
    assert.ok(Buffer.byteLength(text) < 1300);
  });
});
```

- [ ] **Step 4: Run RED**

```bash
cd providers/pi-dev
node --test test/render.test.mjs test/server.test.mjs
```

- [ ] **Step 5: Implement the profile-aware MCP server**

Replace `providers/pi-dev/server.mjs` with:

```js
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { canonicalWorkspaceRoot } from './boundary.mjs';
import { runRead, runEdit, runWrite } from './files.mjs';
import { runBash } from './shell.mjs';
import { renderBashText, renderEditText, renderWriteText } from './render.mjs';

const mode = process.env.MCP_DEV_SHELL_MODE;
if (!['allowlist', 'unrestricted'].includes(mode)) {
  console.error('MCP_DEV_SHELL_MODE must be allowlist or unrestricted');
  process.exit(2);
}

const workspaceRoot = await canonicalWorkspaceRoot(process.env.MCP_DEV_WORKSPACE_ROOT);
const stateDir = process.env.MCP_DEV_STATE_DIR;
if (typeof stateDir !== 'string' || !path.isAbsolute(stateDir)) {
  console.error('MCP_DEV_STATE_DIR must be an absolute path');
  process.exit(2);
}

const maxOutputBytes = Number(process.env.MCP_DEV_MAX_OUTPUT_BYTES ?? '1048576');
if (!Number.isInteger(maxOutputBytes) || maxOutputBytes <= 0 || maxOutputBytes > 16 * 1024 * 1024) {
  console.error('MCP_DEV_MAX_OUTPUT_BYTES must be an integer from 1 to 16777216');
  process.exit(2);
}

const server = new McpServer({ name: 'pi-dev', version: '0.1.0' });
const relativePath = z.string().min(1).describe('Path relative to the configured workspace root');

async function invoke(fn) {
  try {
    return await fn();
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }]
    };
  }
}

server.registerTool('read', {
  description: 'Read source/text below the configured workspace root',
  inputSchema: {
    path: relativePath,
    offset: z.number().int().positive().optional(),
    limit: z.number().int().positive().optional()
  }
}, async (args, extra) => invoke(async () => {
  const result = await runRead({ workspaceRoot, ...args }, extra.signal);
  if (result.content.some(block => block.type !== 'text')) {
    throw new Error('dev.read supports text files only');
  }
  return { content: result.content };
}));

server.registerTool('edit', {
  description: 'Apply one or more exact, disjoint replacements below the workspace root',
  inputSchema: {
    path: relativePath,
    edits: z.array(z.object({ oldText: z.string().min(1), newText: z.string() })).min(1)
  }
}, async (args, extra) => invoke(async () => {
  const result = await runEdit({ workspaceRoot, ...args }, extra.signal);
  return { content: [{ type: 'text', text: renderEditText(args.path, result.details?.diff) }] };
}));

server.registerTool('write', {
  description: 'Create a new text file below the workspace root; fails if it already exists',
  inputSchema: { path: relativePath, content: z.string() }
}, async (args, extra) => invoke(async () => {
  await runWrite({ workspaceRoot, ...args }, extra.signal);
  return { content: [{ type: 'text', text: renderWriteText(args.path) }] };
}));

if (mode === 'unrestricted') {
  server.registerTool('bash', {
    description: 'Run one native Bash command string; cwd is optional and workspace-relative',
    inputSchema: {
      command: z.string().min(1),
      cwd: z.string().min(1).optional(),
      timeout_seconds: z.number().positive().max(300).optional()
    }
  }, async (args, extra) => invoke(async () => {
    const result = await runBash({
      workspaceRoot,
      ...args,
      maxOutputBytes,
      stateDir
    }, extra.signal);
    return { content: [{ type: 'text', text: renderBashText(result) }] };
  }));
}

await server.connect(new StdioServerTransport());
```

- [ ] **Step 6: Run the provider suite**

```bash
cd providers/pi-dev
npm test
node --check boundary.mjs files.mjs shell.mjs render.mjs server.mjs
```

Expected: all tests pass; no dev result contains `structuredContent`; Bash schema contains no output-limit field.

- [ ] **Step 7: Integrator-only commit**

```bash
git add providers/pi-dev/render.mjs providers/pi-dev/server.mjs \
  providers/pi-dev/test/render.test.mjs providers/pi-dev/test/server.test.mjs
git commit -m "feat: expose native-text Pi dev MCP"
```

Helpers skip this step.

---

### Task 8: Register Workspace Policy and Pi Provider in the Publication Renderer

**Files:**
- Modify: `config/templates/mcp.json`
- Modify: `config/profiles/restricted.env`
- Modify: `config/profiles/trusted-dev.env`
- Modify: `.env.example`
- Modify: `scripts/render-config.mjs`
- Modify: `scripts/setup.sh`
- Modify: `scripts/smoke-local.sh`
- Modify: `tests/publication.sh`
- Modify: `tests/harness.sh`
- Modify: `README.md`
- Modify: `docs/acceptance.md`

**Interfaces:**
- Profile policy: `MCP_SHELL_MODE=allowlist|unrestricted`.
- Deployment policy: `MCP_WORKSPACE_ROOT`, optional `MCP_DEV_MAX_OUTPUT_BYTES` (default `1048576`).
- Rendered provider env: `MCP_DEV_SHELL_MODE`, `MCP_DEV_WORKSPACE_ROOT`, `MCP_DEV_STATE_DIR`, `MCP_DEV_MAX_OUTPUT_BYTES`.

- [ ] **Step 1: Add failing profile/render tests**

Extend `tests/publication.sh` so the renderer fixture asserts:

```bash
grep -Fqx 'MCP_SHELL_MODE=allowlist' "$ROOT/config/profiles/restricted.env" || return 1
grep -Fqx 'MCP_SHELL_MODE=unrestricted' "$ROOT/config/profiles/trusted-dev.env" || return 1

node - "$tmp/restricted/1mcp/mcp.json" "$tmp/trusted-dev/1mcp/mcp.json" <<'NODE'
const fs = require('fs');
const [restrictedFile, trustedFile] = process.argv.slice(2);
const restricted = JSON.parse(fs.readFileSync(restrictedFile, 'utf8'));
const trusted = JSON.parse(fs.readFileSync(trustedFile, 'utf8'));
for (const cfg of [restricted, trusted]) {
  for (const name of ['filesystem', 'shell', 'dev']) {
    if (!cfg.mcpServers?.[name]) process.exit(1);
  }
  const env = cfg.mcpServers.dev.env;
  if (env.MCP_DEV_WORKSPACE_ROOT !== '/tmp/example-workspace') process.exit(1);
  if (env.MCP_DEV_MAX_OUTPUT_BYTES !== '1048576') process.exit(1);
  if (!env.MCP_DEV_STATE_DIR.endsWith('/dev')) process.exit(1);
}
if (restricted.mcpServers.dev.env.MCP_DEV_SHELL_MODE !== 'allowlist') process.exit(1);
if (trusted.mcpServers.dev.env.MCP_DEV_SHELL_MODE !== 'unrestricted') process.exit(1);
NODE
```

Extend `test_public_structure()` to require:

```bash
[ -f "$ROOT/providers/pi-dev/server.mjs" ] && \
[ -f "$ROOT/providers/pi-dev/package.json" ] && \
[ -f "$ROOT/providers/pi-dev/package-lock.json" ]
```

Run `bash tests/publication.sh`; expect RED.

- [ ] **Step 2: Add profile and deployment policy keys**

Append to `config/profiles/restricted.env`:

```dotenv
MCP_SHELL_MODE=allowlist
```

Append to `config/profiles/trusted-dev.env`:

```dotenv
MCP_SHELL_MODE=unrestricted
```

Add to `.env.example`:

```dotenv
# Model-visible Bash never controls this. Increase only as deployment policy.
MCP_DEV_MAX_OUTPUT_BYTES=1048576
```

- [ ] **Step 3: Add the dev provider to the tracked template**

Add this sibling under `mcpServers` in `config/templates/mcp.json`:

```json
"dev": {
  "command": "node",
  "args": ["__REPO_ROOT__/providers/pi-dev/server.mjs"],
  "env": {
    "MCP_DEV_SHELL_MODE": "__SHELL_MODE__",
    "MCP_DEV_WORKSPACE_ROOT": "__WORKSPACE_ROOT__",
    "MCP_DEV_STATE_DIR": "__DEV_STATE_DIR__",
    "MCP_DEV_MAX_OUTPUT_BYTES": "__DEV_MAX_OUTPUT_BYTES__"
  },
  "tags": ["dev"]
}
```

- [ ] **Step 4: Extend renderer validation and substitutions**

Add `MCP_DEV_MAX_OUTPUT_BYTES` to the deployment-environment override list in `scripts/render-config.mjs`.

Immediately after reading profile values, add:

```js
const shellMode = profileValues.MCP_SHELL_MODE;
if (!['allowlist', 'unrestricted'].includes(shellMode)) {
  throw new Error(`profile ${profile} must set MCP_SHELL_MODE=allowlist or unrestricted`);
}

const devMaxOutputBytesRaw = deployment.MCP_DEV_MAX_OUTPUT_BYTES ?? '1048576';
const devMaxOutputBytes = Number(devMaxOutputBytesRaw);
if (!Number.isInteger(devMaxOutputBytes) || devMaxOutputBytes <= 0 || devMaxOutputBytes > 16 * 1024 * 1024) {
  throw new Error('MCP_DEV_MAX_OUTPUT_BYTES must be an integer from 1 to 16777216');
}
```

Extend template replacements with:

```js
__SHELL_MODE__: shellMode,
__DEV_STATE_DIR__: path.join(stateDir, 'dev'),
__DEV_MAX_OUTPUT_BYTES__: String(devMaxOutputBytes),
```

`__WORKSPACE_ROOT__` already resolves from deployment config and is reused by both the legacy filesystem provider and the new dev boundary.

- [ ] **Step 5: Install and verify pinned Pi dependencies without weakening the OAuth patch**

Inside the existing non-skipped install block in `scripts/setup.sh`, after prerequisite verification, add:

```bash
echo "== installing pinned Pi dev provider dependencies =="
npm --prefix "$DIR/providers/pi-dev" ci --omit=dev
PI_PACKAGE="$DIR/providers/pi-dev/node_modules/@earendil-works/pi-coding-agent/package.json"
PI_VERSION="$(node -p "require(process.argv[1]).version" "$PI_PACKAGE")"
[ "$PI_VERSION" = "0.84.1" ] || {
  echo "unexpected Pi version: $PI_VERSION" >&2
  exit 1
}
echo "  Pi coding primitives: @earendil-works/pi-coding-agent@$PI_VERSION"
```

Do not move, remove, or loosen the existing verified 1MCP CSP patch block.

In `scripts/smoke-local.sh`, after sourcing `lib/bridge/common.sh`, verify any rendered `dev` entry has:

```text
installed Pi package version = 0.84.1
MCP_DEV_WORKSPACE_ROOT is absolute
MCP_DEV_STATE_DIR is absolute
MCP_DEV_MAX_OUTPUT_BYTES is a positive integer
MCP_DEV_SHELL_MODE is allowlist or unrestricted
```

Use a Node JSON assertion against `$BRIDGE_CONFIG_DIR/mcp.json`; do not start a second 1MCP process.

- [ ] **Step 6: Update A/B public documentation**

Replace the paragraph under `README.md` -> `## Current development surface` with:

```markdown
The bridge is evaluating two replaceable development-harness candidates behind the existing Cloudflare OAuth + 1MCP transport. CodeDB is present only if its independent benchmark verdict is `KEEP`. The experimental `dev` provider uses pinned Pi primitives for workspace-relative `read`, exact guarded multi-`edit`, and atomic create-only `write`. Under `trusted-dev` it also exposes native-command `bash`; under `restricted` it deliberately omits Pi Bash and the existing allowlisted shell remains responsible for Shell. Dev results are plain model-facing text: source, one diff, a short create acknowledgement, or terminal output. The legacy filesystem and shell providers remain during A/B and are removed only by an explicit cutover.
```

Replace the Files/Shell portions of `docs/acceptance.md` during A/B with:

```markdown
## 4. Files providers during A/B

Verify the legacy filesystem provider still enforces its root. Then verify `dev.read`, `dev.edit`, and `dev.write` use paths relative to the configured workspace. Absolute paths, `..` traversal, existing symlink escapes, and new-file creation through a symlinked outside parent must fail. Verify two concurrent creates for one absent path yield exactly one success.

## 5. Shell profile and native result boundary during A/B

For `restricted`, verify `dev` advertises `read`, `edit`, and `write` but not `bash`; the separate legacy shell must still enforce restricted policy.

For `trusted-dev`, verify `dev.bash` accepts one native command string with optional workspace-relative cwd. Successful output must appear as terminal text, a normal non-zero exit must append `[exit N]`, and the result must not expose `structuredContent` or a JSON execution record.
```

- [ ] **Step 7: Run all non-live verification**

```bash
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
(cd providers/pi-dev && npm test)
bash -n scripts/*.sh tests/*.sh
node --check scripts/render-config.mjs providers/pi-dev/*.mjs
git diff --check
```

Expected: all green; both rendered profiles carry the same workspace/output policy and different Shell modes.

- [ ] **Step 8: Integrator-only commit**

Commit the A/B registration, policy rendering, tests, and docs. Do not remove old providers yet.

---

### Task 9: Benchmark Runtime Semantics and Context Cost, Then Decide Pi

**Files:**
- Create: `docs/benchmarks/pi-dev.md`

**Interfaces:**
- Produces `CUTOVER` or `KEEP_OLD_PROVIDERS`.
- Benchmark compares actual runtime catalogs and model-visible text, not assumed tool counts.

- [ ] **Step 1: Activate the A/B provider set at the intentional live checkpoint**

Only after the implementation branch is deliberately the deployment root:

```bash
scripts/setup.sh --profile trusted-dev
systemctl --user restart mcp-dev-bridge.service
bin/status
```

Expected: bridge `issues: 0`. The stdio provider tests already prove the trusted-dev tool list is exactly `bash`, `edit`, `read`, and `write`.

Render a separate restricted fixture and verify its generated composition contains `dev` plus the legacy `shell`, while direct stdio `dev` discovery lists only `edit`, `read`, and `write` under `MCP_DEV_SHELL_MODE=allowlist`.

- [ ] **Step 2: Refresh ChatGPT and verify the A/B catalog in a fresh session**

Perform:

```text
ChatGPT workspace/plugin -> Actions -> Refresh
start a fresh session using this MCP
verify the expected CodeDB/dev/legacy A/B actions are present
```

This is the complete client catalog-refresh workflow established by the live experiment. Do not add a PC/WSL reboot or extra client-cache ritual.

- [ ] **Step 3: Capture old and new schema cost with one tokenizer**

Save normalized `tools/list` JSON for:

```text
old filesystem + old shell
new dev trusted-dev
new dev restricted
CodeDB if retained
```

For each catalog, record:

```text
advertised tool count
raw schema bytes
o200k_base schema tokens
per-tool schema bytes/tokens
number of top-level request fields
maximum request-schema nesting depth
```

Use the same tokenizer command as Task 3 (`tiktoken==0.13.0`, `o200k_base`). Do not hardcode the previous catalog as “15 tools”; use actual discovery output.

- [ ] **Step 4: Compare representative request cost**

Capture the exact argument JSON for equivalent workflows:

```text
old ranged file read vs dev.read(path, offset, limit)
old edit operation vs dev.edit(path, edits)
old shell argv representation vs dev.bash(command, cwd?, timeout_seconds?)
old create operation vs dev.write(path, content)
```

Record serialized request bytes/tokens, field count, and nesting depth. The canonical new Bash request should normally be:

```json
{
  "command": "git status --short && git diff --stat"
}
```

and Files paths should look like:

```json
{
  "path": "satori/src/foo.ts",
  "offset": 80,
  "limit": 40
}
```

- [ ] **Step 5: Run the old-provider baseline workflow**

On disposable fixtures plus one real read-only repository workflow, record:

```text
tool calls
wall time
correctness/retries
model-visible result bytes/tokens
follow-up calls needed to recover missing evidence
whole-file or irrelevant output
```

Exercise ranged read, two-location edit, create, compound command, non-zero command, and verbose output.

- [ ] **Step 6: Run the Pi workflow and mandatory boundary/semantic cases**

Test and record:

```text
1. workspace-relative ranged read
2. absolute Files path -> rejected
3. .. traversal -> rejected
4. existing symlink escape -> rejected
5. create through symlinked outside parent -> rejected
6. two-location exact multi-edit -> one diff TextContent
7. fuzzy-only Unicode/whitespace candidate -> rejected
8. two simultaneous creates -> exactly one success
9. Bash default cwd = workspace root
10. Bash relative cwd works
11. compound Bash with pipe + && + redirect
12. exit 7 -> terminal text ending [exit 7], not tool error or JSON record
13. AbortSignal cancellation -> descendant killed
14. timeout -> descendant killed and native timeout annotation
15. configured output limit -> tail + recoverable truncation handle
16. every dev result has no structuredContent or embedded resource
17. edit result contains no Pi success prose and needs no immediate diff recovery call
18. Bash schema contains no max_output_bytes/workspace-root observability fields
19. Bash absolute cwd parameter -> rejected
20. Bash `..` cwd parameter -> rejected
21. trusted-dev Bash command itself can intentionally read a harmless outside-workspace file such as `/etc/os-release`
```

For each representative result, record model-visible bytes/tokens and whether another call was needed to understand the outcome.

- [ ] **Step 7: Write the Pi verdict document**

Create `docs/benchmarks/pi-dev.md` with side-by-side tables for:

```text
runtime correctness
schema bytes/tokens
request bytes/tokens and field count
model-visible result bytes/tokens
follow-up call debt
wall time/retries
boundary/security cases
```

`CUTOVER` requires every mandatory boundary and execution semantic to pass, no regression in reliability, and a material improvement in schema/request/result context or follow-up-call debt.

Otherwise use `KEEP_OLD_PROVIDERS` and name every failed criterion.

- [ ] **Step 8: Integrator-only evidence commit**

```bash
git add docs/benchmarks/pi-dev.md
git commit -m "docs: benchmark Pi dev provider"
```

---

### Task 10: Apply Pi Cutover or Full Loser Rollback, Then Refresh ChatGPT

**Files:**
- Modify based on verdict: `config/templates/mcp.json`, `scripts/render-config.mjs`, profiles, `.env.example`, setup/smoke/tests/docs.
- If loser: delete `providers/pi-dev/` while retaining `docs/benchmarks/pi-dev.md`.

**Interfaces:**
- Successful cutover intentionally leaves trusted-dev and restricted with different Shell backends.

- [ ] **Step 1: If verdict is `CUTOVER`, remove the generic filesystem provider**

Delete `filesystem` from `config/templates/mcp.json` for both profiles.

Keep the legacy `shell` object in the template because restricted still uses it. After template substitution and before writing generated config, retain profile-aware composition:

```js
if (profile === 'trusted-dev') {
  delete rendered.mcpServers.shell;
}
```

Do not delete legacy `shell` for restricted.

Final generated provider sets:

```text
trusted-dev: [codedb if retained], dev
restricted:  [codedb if retained], dev, shell
```

- [ ] **Step 2: If verdict is `CUTOVER`, finalize setup, smoke checks, docs, and tests**

- Remove the obsolete filesystem dependency/preflight and its public documentation.
- Keep `mcp-shell-server==1.1.8` and `providers/legacy-shell/server.py` for restricted.
- Document Files as workspace-confined Pi primitives in both profiles.
- Document trusted-dev Shell as native Pi Bash and restricted Shell as the legacy allowlisted transitional backend.
- Preserve `MCP_DEV_WORKSPACE_ROOT` and `MCP_DEV_MAX_OUTPUT_BYTES` deployment policy.
- Assert exact generated provider sets for both profiles.
- Assert final dev results remain TextContent-only.

- [ ] **Step 3: If verdict is `KEEP_OLD_PROVIDERS`, remove the candidate completely**

Delete `dev` from `config/templates/mcp.json`; remove Pi install/smoke logic; remove `MCP_SHELL_MODE`, `MCP_DEV_MAX_OUTPUT_BYTES`, and temporary dev documentation when they no longer serve another retained component; delete `providers/pi-dev/`; restore the publication-scaffold description of the old providers.

Keep `docs/benchmarks/pi-dev.md` as evidence. Generated configs must contain no `dev` provider.

- [ ] **Step 4: Run automated verification for the chosen path**

```bash
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
if [ -d providers/pi-dev ]; then (cd providers/pi-dev && npm test); fi
bash -n scripts/*.sh tests/*.sh
node --check scripts/render-config.mjs
[ ! -d providers/pi-dev ] || node --check providers/pi-dev/*.mjs
git diff --check
```

- [ ] **Step 5: Restart and verify final bridge health**

```bash
systemctl --user restart mcp-dev-bridge.service
bin/status
```

Verify `issues: 0`. Generated-config and provider tests already prove the server-side winner/loser composition.

- [ ] **Step 6: Refresh ChatGPT and verify the final catalog in a fresh session**

Perform:

```text
ChatGPT workspace/plugin -> Actions -> Refresh
start a fresh session using this MCP
verify winning actions are present
verify removed/rolled-back actions are absent
```

Repeat this step whether the result is cutover or rollback. Restarting 1MCP without refreshing the workspace/plugin is not sufficient client acceptance; Refresh + fresh session is the complete ChatGPT-side cache/catalog step.

- [ ] **Step 7: Integrator-only decision commit**

Commit the exact cutover or rollback. Helpers do not commit.

---

## Final Verification

Run fresh on the implementation branch:

```bash
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
if [ -d providers/pi-dev ]; then (cd providers/pi-dev && npm test); fi
bash -n scripts/*.sh tests/*.sh
node --check scripts/render-config.mjs
[ ! -d providers/pi-dev ] || node --check providers/pi-dev/*.mjs
git diff --check
git status --short
```

After intentional deployment integration:

```bash
bin/status
systemctl --user is-enabled mcp-dev-bridge.service
systemctl --user is-active mcp-dev-bridge.service
```

Then complete the client gate:

```text
refresh ChatGPT workspace/plugin Actions
start a fresh MCP-backed session
verify final action catalog
exercise retained CodeDB with explicit project
exercise retained dev Bash as native terminal text
```

## Deferred Separate Plans

1. **Live stateless structured-format A/B** — compare native CodeDB TextContent, TOON TextContent, and GCF TextContent through the real ChatGPT -> OAuth -> Cloudflare -> 1MCP path. Re-pin versions at execution time.
2. **GCF session/delta** — only if stateless GCF wins; prove conversation-scoped state isolation separately.
3. **`apply_patch` facade** — after Pi cutover, compare Pi `edit(path, edits)` with a Codex-style textual patch facade on schema/request cost, call count, correctness, and multi-file ergonomics.
4. **Terminal + long-wait control flow / `await_until`** — measure real transport lifetime and concurrent resume behavior first.
5. **RTK** — only after raw Pi Bash semantics are proven.
6. **Full Files hash/CAS** — add only if exact guarded multi-edit plus exclusive create is insufficient in real shared-tree work.
7. **Restricted native Pi Bash policy** — restricted keeps the legacy allowlisted shell until separately designed.
8. **Tool facades/hiding** — only after component selection is stable.

## Self-Review Checklist

- Files have no model-facing cwd/workspace-root and are workspace-relative by construction.
- Absolute paths, traversal, existing symlink escape, and outside-parent creation are tested.
- Bash schema contains only command, optional relative cwd, and optional timeout.
- Bash cwd rejects absolute/traversal values while trusted-dev command authority itself remains unrestricted as the Linux service user.
- Output limit is deployment policy, not a request field.
- Internal Shell records stop at the renderer; model output is terminal TextContent.
- Read/edit/write use source, one diff, and short create acknowledgement respectively.
- No dev primitive emits structuredContent or embedded resources.
- Pi fuzzy fallback is rejected and create-only write uses `O_EXCL`.
- CodeDB, Pi, TOON, and GCF decisions are independent.
- Format screen compares native, pretty JSON, compact JSON, TOON, and GCF with one tokenizer.
- Benchmarks include schema, request, result, and follow-up-call context cost.
- Every catalog activation/removal includes Actions Refresh plus a fresh session.
- `apply_patch`, live codecs, stateful GCF, Terminal, RTK, and `await_until` remain deferred.
- One integrator owns Git commits/index.
