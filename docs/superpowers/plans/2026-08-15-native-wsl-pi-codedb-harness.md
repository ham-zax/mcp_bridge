# CodeDB + Pi Native WSL Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evaluate and, if they pass evidence gates, adopt pinned CodeDB for the Code domain and a thin Pi-backed `dev` MCP provider for Files + trusted-development Shell, while preserving the generic publication scaffold, the `restricted` trust profile, and the existing Cloudflare OAuth Bridge.

**Architecture:** Build from the publication-scaffold layout, not the pre-publication tracked `config/mcp.json`. CodeDB is an independent candidate. Files reuse Pi `read/edit/write` behind strict exact-edit and atomic-create guards. Trusted Shell uses Pi `createLocalBashOperations()` behind our own structured result/cancellation contract; `restricted` keeps the legacy restricted shell until an equivalent native-shell policy is deliberately implemented. CodeDB and Pi each have independent keep/remove rollback gates.

**Tech Stack:** 1MCP 0.34.4; CodeDB 0.2.5840 Linux x86_64 SHA-256 `f784c931b053031ca9928173828130c504f769c9e94bf5c2666ab71091747966`; `@earendil-works/pi-coding-agent` 0.84.1; `@modelcontextprotocol/sdk` 1.30.0; Zod 4.4.3; Node.js 24.19.0; GCF spec v3.5.3 shadow measurement via `gcf-python` 2.6.0; Bash/systemd user service.

## Global Constraints

- Execute on a new implementation branch/worktree based on `chore/publication-scaffold` (currently `b9732b9`), not directly on `main` and not by modifying the preserved `chore/publication-scaffold` branch itself.
- The publication scaffold remains the structural base: tracked template at `config/templates/mcp.json`; generated writable 1MCP home under external state; providers under `providers/`.
- Preserve explicit profile selection. No setup/render path may silently choose `restricted` or `trusted-dev`.
- `trusted-dev` remains first-class unrestricted Linux-user authority.
- `restricted` must never gain unrestricted Pi Bash as a side effect of cutover. During this plan it keeps the legacy restricted shell.
- Preserve the 1MCP 0.34.4 OAuth CSP compatibility patch (`form-action 'self' https:`) and its fail-closed source-shape verification.
- Do not run a nested Pi agent/model/session. Reuse only exported Pi primitive factories/operations.
- Pi Files are available in both profiles. Pi Bash is registered only when the generated provider env says `MCP_DEV_SHELL_MODE=unrestricted`.
- Pi fuzzy edit fallback is not accepted. Exact matching means exact Unicode text after BOM removal and newline normalization only; no quote/dash/space/trailing-whitespace fuzzy normalization.
- Existing-file mutation uses Pi multi-edit plus a best-effort snapshot-before-write conflict guard. This is not claimed to be kernel-atomic CAS against arbitrary external writers. Initial `write` is atomic create-only (`wx`/`O_EXCL`). Full model-visible hash/CAS/versioned writes are out of scope.
- Shell uses `createLocalBashOperations()`, not Pi `createBashTool()`. Normal non-zero exits are data, not tool errors.
- Shell default timeout is 30 seconds; maximum accepted timeout is 300 seconds.
- Shell visible output is bounded to at most 1,048,576 bytes; complete combined output is spooled to a state file and returned by path only when truncation occurs.
- Forward MCP `extra.signal` into Pi process execution.
- Forward one compact Pi edit `details.diff`; omit redundant `details.patch` from model-visible results.
- CodeDB failure does not block Pi evaluation. Pi failure does not change the CodeDB verdict.
- Every losing candidate has an explicit rollback that removes it from template/generated config, smoke checks, and temporary public docs.
- Run the CodeDB shadow GCF experiment after the CodeDB benchmark, before the CodeDB keep/remove decision. It is offline/shadow only; do not insert GCF into the live bridge.
- `await_until`, Terminal, RTK, live GCF, Serena, and tool facades are not implemented in this plan.
- A single designated **integrator** owns `git add`, `git commit`, merges, and the shared Git index. Helpers/subagents edit/test assigned files but skip every commit step.
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
    files.mjs
    shell.mjs
    server.mjs
    test/
      files.test.mjs
      shell.test.mjs
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
  pi-dev.md
```

Benchmark raw captures belong under ignored runtime/state paths, not in Git.

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

### Task 2: Verify CodeDB Through Generated Config and Run the Independent Benchmark

**Files:**
- Modify: `tests/harness.sh`
- Create: `docs/benchmarks/codedb.md`

**Interfaces:**
- Uses `scripts/render-config.mjs --profile trusted-dev`.
- CodeDB calls always supply explicit absolute `project`.
- Produces verdict `KEEP` or `REMOVE` without affecting Phase 2 eligibility.

- [ ] **Step 1: Add generated-config assertion**

Append to `tests/harness.sh` a fixture that renders `trusted-dev` into a temporary state directory and asserts generated `1mcp/mcp.json` contains `filesystem`, `shell`, and `codedb`, and that the CodeDB command resolves to the current repository's `scripts/codedb-mcp.sh`.

Use this exact fixture shape:

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
for (const name of ['filesystem', 'shell', 'codedb']) if (!cfg.mcpServers?.[name]) process.exit(1);
if (cfg.mcpServers.codedb.command !== `${root}/scripts/codedb-mcp.sh`) process.exit(1);
NODE
rm -rf "$tmp"
```

- [ ] **Step 2: Verify local stdio startup without touching the live bridge**

Create a one-server temporary 1MCP config and let `1mcp mcp tokens` connect directly to the CodeDB stdio server:

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
jq -r '.servers[] | select(.serverName == "codedb") | .breakdown.tools[].name' "$tmp/tokens.json" | sort
jq -e '.servers[] | select(.serverName == "codedb" and .connected == true)' "$tmp/tokens.json" >/dev/null
rm -rf "$tmp"
```

Record the actual advertised tool names/count in `docs/benchmarks/codedb.md`; the runtime list is authoritative, not README counts.

- [ ] **Step 3: At the live-activation checkpoint, render the trusted deployment and restart only the canonical bridge**

Do this only after the implementation branch is intentionally made the live deployment root (merge/migration checkpoint). Then:

```bash
scripts/setup.sh --profile trusted-dev
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"
systemctl --user restart mcp-dev-bridge.service
bin/status
```

Expected: public/local health ready and `issues: 0`.

Do not point the live service at a temporary worktree merely to satisfy this step.

- [ ] **Step 4: Run baseline architecture-trace task**

Use the same Satori task with the old Files/Shell path:

```text
Trace the Satori semantic-search request from its entry point through retrieval/ranking to response projection. Name concrete files and functions and cite the evidence used for each hop.
```

Record:

```text
tool calls
returned bytes / estimated tokens
whole-file reads
repeated reads
irrelevant reads
wall time
correct file/function call chain
```

- [ ] **Step 5: Run CodeDB-first version of the same task**

Every CodeDB call uses:

```text
project="/home/hamza/repo/satori"
```

Use CodeDB for discovery/context and old Files/Shell only when needed for evidence. Record the identical metrics plus index freshness after a disposable edit.

- [ ] **Step 6: Write `docs/benchmarks/codedb.md`**

The document must contain the two metric tables, actual runtime core-tool list, freshness result, and preliminary `KEEP`/`REMOVE` evidence. Do not decide yet; shadow GCF runs first.

- [ ] **Step 7: Integrator-only commit benchmark evidence**

```bash
git add tests/harness.sh docs/benchmarks/codedb.md
git commit -m "docs: benchmark CodeDB harness"
```

---

### Task 3: Run the Shadow GCF Screen, Then Apply the CodeDB Keep/Remove Gate

**Files:**
- Modify: `docs/benchmarks/codedb.md`
- If verdict `REMOVE`: delete CodeDB implementation/config paths from Task 1 and update tests/docs accordingly.

**Interfaces:**
- GCF implementation pin: `gcf-python==2.6.0`, aligned with GCF spec v3.5.3.
- Raw benchmark captures live under ignored `run/benchmarks/codedb/` or external state, never public Git.

- [ ] **Step 1: Measure GCF conversion coverage before encoding anything**

For every CodeDB tool result used in the benchmark, save the raw MCP text block under ignored runtime state and classify it:

```text
convertible = trim(text) begins with "{" or "[" AND JSON.parse(text) succeeds
plain_text  = anything else
```

CodeDB documents plain-text MCP responses by default, while `codedb_context` supports `format=json`. For `codedb_context`, capture both its normal benchmark response and a `format=json` response. Do not invent JSON wrappers around plain text merely to make GCF look useful.

Write a private manifest:

```text
run/benchmarks/codedb/gcf-coverage.tsv
```

with columns:

```text
tool	mode	raw_bytes	convertible	capture_path
```

Save JSON-eligible captures as `.json`, for example:

```text
run/benchmarks/codedb/context-format-json.json
```

Record `convertible_calls / total_calls` and `convertible_bytes / total_bytes` in `docs/benchmarks/codedb.md`. Do not include secrets or unrelated private logs.

- [ ] **Step 2: Verify pinned GCF encoder and round-trip**

For every capture marked `convertible=true`:

```bash
uvx --from gcf-python==2.6.0 gcf encode < input.json > output.gcf
uvx --from gcf-python==2.6.0 gcf decode < output.gcf > decoded.json
jq -S . input.json > input.sorted.json
jq -S . decoded.json > decoded.sorted.json
diff -u input.sorted.json decoded.sorted.json
/usr/bin/time -f 'encode_wall=%e' uvx --from gcf-python==2.6.0 gcf encode < input.json > /dev/null
/usr/bin/time -f 'decode_wall=%e' uvx --from gcf-python==2.6.0 gcf decode < output.gcf > /dev/null
uvx --from gcf-python==2.6.0 gcf stats < input.json
```

Expected: lossless normalized round-trip for every eligible capture. Record JSON bytes, GCF bytes, reported token estimates, encode/decode wall time, and the conversion-coverage ratios from Step 1. If a CodeDB result contains a value outside GCF's supported numeric domain, record that as a compatibility failure rather than coercing it silently.

- [ ] **Step 3: Record shadow verdict**

Append to `docs/benchmarks/codedb.md`:

```text
GCF shadow: PROMISING | NOT_MATERIAL | INCOMPATIBLE
conversion coverage: report both eligible-call ratio and eligible-byte ratio from gcf-coverage.tsv
eligible payload savings: report measured JSON bytes, GCF bytes, and token estimate delta
```

`PROMISING` requires both material savings on eligible payloads **and** enough conversion coverage to matter on the actual CodeDB benchmark. A spectacular ratio on one rarely-used JSON response is not enough. This is only a screening result; do not change live MCP output in this plan.

- [ ] **Step 4: Apply independent CodeDB decision**

`KEEP` requires CodeDB to be at least as correct/reliable as baseline and materially improve navigation/context efficiency or evidence focus.

If `KEEP`:

```text
leave scripts/install-codedb.sh
leave scripts/codedb-mcp.sh
leave codedb in config/templates/mcp.json
continue to Phase 2
```

If `REMOVE`:

```bash
# integrator edits, not a blind git revert:
rm scripts/install-codedb.sh scripts/codedb-mcp.sh
```

Remove `codedb` from `config/templates/mcp.json`, remove CodeDB smoke assertions, update `tests/harness.sh` to assert it is absent, keep `docs/benchmarks/codedb.md`, then run:

```bash
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
git diff --check
```

Continue to Phase 2 regardless of CodeDB verdict.

- [ ] **Step 5: Integrator-only decision commit**

Commit either the retained benchmark verdict or the explicit rollback. Helpers do not commit.

---

# Phase 2 — Pi-backed Files + trusted-dev Shell

### Task 4: Scaffold a Reproducible Pi Dev Provider

**Files:**
- Create: `providers/pi-dev/package.json`
- Create: `providers/pi-dev/package-lock.json`
- Create: `providers/pi-dev/files.mjs`
- Create: `providers/pi-dev/shell.mjs`
- Create: `providers/pi-dev/server.mjs`
- Create: `providers/pi-dev/test/files.test.mjs`
- Create: `providers/pi-dev/test/shell.test.mjs`
- Create: `providers/pi-dev/test/server.test.mjs`

**Interfaces:**
- Direct pins: Pi 0.84.1; MCP SDK 1.30.0; Zod 4.4.3.
- No Pi agent/session/model APIs exposed.

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

- [ ] **Step 2: Add package-pin assertion to `tests/harness.sh`**

Parse `providers/pi-dev/package.json` with Node and require the three exact direct versions above.

- [ ] **Step 3: Create empty module exports only after RED tests exist in Tasks 5-7**

At this task boundary, create files with exported function names but no fake success behavior:

```js
// files.mjs
export async function validateCwd() { throw new Error('not implemented'); }
export async function runRead() { throw new Error('not implemented'); }
export async function runEdit() { throw new Error('not implemented'); }
export async function runWrite() { throw new Error('not implemented'); }
```

```js
// shell.mjs
export async function runBash() { throw new Error('not implemented'); }
```

Do not register MCP tools yet.

- [ ] **Step 4: Run package install/syntax checks**

```bash
npm test || true
node --check files.mjs
node --check shell.mjs
cd ../..
bash tests/harness.sh
```

Expected: package pin check passes; behavior tests are added next.

- [ ] **Step 5: Integrator-only commit scaffold**

```bash
git add providers/pi-dev tests/harness.sh
git commit -m "build: scaffold pinned Pi dev provider"
```

---

### Task 5: Implement Pi Files With Exact Edit Guard and Atomic Exclusive Create

**Files:**
- Modify: `providers/pi-dev/files.mjs`
- Modify: `providers/pi-dev/test/files.test.mjs`

**Interfaces:**

```js
validateCwd(cwd) -> Promise<string>
runRead({cwd, path, offset?, limit?}, signal?) -> Pi tool result
runEdit({cwd, path, edits}, signal?) -> Pi tool result with details.diff
runWrite({cwd, path, content}, signal?) -> Pi tool result
```

- [ ] **Step 1: Write failing Files tests**

`test/files.test.mjs` must cover all of these concrete cases:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateCwd, runRead, runEdit, runWrite, createStrictEditOperations } from '../files.mjs';

async function tempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test('cwd must be absolute and existing directory', async () => {
  await assert.rejects(() => validateCwd('relative/path'), /absolute/);
});

test('read preserves Pi offset/limit behavior', async () => {
  const cwd = await tempDir('pi-read-');
  await fs.writeFile(path.join(cwd, 'x.txt'), 'one\ntwo\nthree\nfour\n');
  const result = await runRead({ cwd, path: 'x.txt', offset: 2, limit: 2 });
  const text = result.content.map(x => x.type === 'text' ? x.text : '').join('\n');
  assert.match(text, /two/);
  assert.match(text, /three/);
  assert.doesNotMatch(text, /four/);
});

test('edit supports multiple exact disjoint replacements and returns diff', async () => {
  const cwd = await tempDir('pi-edit-');
  await fs.writeFile(path.join(cwd, 'x.txt'), 'alpha\nbeta\ngamma\n');
  const result = await runEdit({
    cwd,
    path: 'x.txt',
    edits: [
      { oldText: 'alpha', newText: 'ALPHA' },
      { oldText: 'gamma', newText: 'GAMMA' }
    ]
  });
  assert.equal(await fs.readFile(path.join(cwd, 'x.txt'), 'utf8'), 'ALPHA\nbeta\nGAMMA\n');
  assert.match(result.details.diff, /ALPHA/);
  assert.match(result.details.diff, /GAMMA/);
});

test('fuzzy-only Unicode quote match is rejected', async () => {
  const cwd = await tempDir('pi-fuzzy-');
  await fs.writeFile(path.join(cwd, 'x.txt'), 'const x = “hello”;\n');
  await assert.rejects(
    () => runEdit({ cwd, path: 'x.txt', edits: [{ oldText: 'const x = "hello";', newText: 'const x = "bye";' }] }),
    /exact text.*not found/i
  );
});

test('CRLF file accepts LF oldText without fuzzy quote/space normalization', async () => {
  const cwd = await tempDir('pi-crlf-');
  await fs.writeFile(path.join(cwd, 'x.txt'), 'alpha\r\nbeta\r\n');
  await runEdit({ cwd, path: 'x.txt', edits: [{ oldText: 'alpha\nbeta', newText: 'ALPHA\nbeta' }] });
  assert.equal(await fs.readFile(path.join(cwd, 'x.txt'), 'utf8'), 'ALPHA\r\nbeta\r\n');
});

test('edit operation detects an intervening external write before commit', async () => {
  const cwd = await tempDir('pi-conflict-');
  const file = path.join(cwd, 'x.txt');
  await fs.writeFile(file, 'alpha\n');
  const ops = createStrictEditOperations([{ oldText: 'alpha', newText: 'ALPHA' }]);
  await ops.access(file);
  await ops.readFile(file);
  await fs.writeFile(file, 'other\n');
  await assert.rejects(() => ops.writeFile(file, 'ALPHA\n'), /changed during edit/i);
  assert.equal(await fs.readFile(file, 'utf8'), 'other\n');
});

test('write creates new file but never overwrites existing file', async () => {
  const cwd = await tempDir('pi-write-');
  await runWrite({ cwd, path: 'new.txt', content: 'first\n' });
  await assert.rejects(() => runWrite({ cwd, path: 'new.txt', content: 'second\n' }), /already exists|use edit/i);
  assert.equal(await fs.readFile(path.join(cwd, 'new.txt'), 'utf8'), 'first\n');
});

test('two concurrent creates race: exactly one succeeds', async () => {
  const cwd = await tempDir('pi-write-race-');
  const settled = await Promise.allSettled([
    runWrite({ cwd, path: 'race.txt', content: 'A\n' }),
    runWrite({ cwd, path: 'race.txt', content: 'B\n' })
  ]);
  assert.equal(settled.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(settled.filter(x => x.status === 'rejected').length, 1);
  assert.match(await fs.readFile(path.join(cwd, 'race.txt'), 'utf8'), /^(A|B)\n$/);
});
```

- [ ] **Step 2: Run RED**

```bash
cd providers/pi-dev
node --test test/files.test.mjs
```

Expected: behavior tests fail against the scaffold.

- [ ] **Step 3: Implement strict Files adapter**

`files.mjs` must use these concrete mechanics:

```js
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createEditTool,
  createReadTool,
  createWriteTool
} from '@earendil-works/pi-coding-agent';

export async function validateCwd(cwd) {
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) throw new Error('cwd must be an absolute path');
  const stat = await fs.stat(cwd);
  if (!stat.isDirectory()) throw new Error('cwd must be a directory');
  return cwd;
}

function normalizeExactText(text) {
  if (text.startsWith('\uFEFF')) text = text.slice(1);
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function exactOccurrenceCount(content, needle) {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  while (true) {
    const index = content.indexOf(needle, from);
    if (index === -1) return count;
    count += 1;
    from = index + 1; // count overlapping exact occurrences too
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
  return {
    access: absolutePath => fs.access(absolutePath, constants.R_OK | constants.W_OK),
    readFile: async absolutePath => {
      const buffer = await fs.readFile(absolutePath);
      validateExactEdits(buffer, edits);
      snapshot = Buffer.from(buffer);
      return buffer;
    },
    writeFile: async (absolutePath, content) => {
      if (!snapshot) throw new Error('edit snapshot is missing');
      const current = await fs.readFile(absolutePath);
      if (!current.equals(snapshot)) throw new Error('file changed during edit; reread and reconcile');
      await fs.writeFile(absolutePath, content, 'utf8');
    }
  };
}

export async function runRead({ cwd, path: filePath, offset, limit }, signal) {
  await validateCwd(cwd);
  const tool = createReadTool(cwd);
  return tool.execute(randomUUID(), { path: filePath, offset, limit }, signal);
}

export async function runEdit({ cwd, path: filePath, edits }, signal) {
  await validateCwd(cwd);
  const tool = createEditTool(cwd, { operations: createStrictEditOperations(edits) });
  return tool.execute(randomUUID(), { path: filePath, edits }, signal);
}

const exclusiveWriteOperations = {
  mkdir: dir => fs.mkdir(dir, { recursive: true }).then(() => undefined),
  writeFile: (absolutePath, content) => fs.writeFile(absolutePath, content, { encoding: 'utf8', flag: 'wx' })
};

export async function runWrite({ cwd, path: filePath, content }, signal) {
  await validateCwd(cwd);
  const tool = createWriteTool(cwd, { operations: exclusiveWriteOperations });
  try {
    return await tool.execute(randomUUID(), { path: filePath, content }, signal);
  } catch (error) {
    if (error?.code === 'EEXIST' || /EEXIST/.test(error?.message ?? '')) {
      throw new Error('file already exists; use edit for existing files');
    }
    throw error;
  }
}
```

If Pi wraps `EEXIST` without retaining `error.code`, preserve the message check and assert it in the test.

- [ ] **Step 4: Run GREEN**

```bash
cd providers/pi-dev
node --test test/files.test.mjs
```

Expected: all Files tests pass.

- [ ] **Step 5: Integrator-only commit**

```bash
git add providers/pi-dev/files.mjs providers/pi-dev/test/files.test.mjs
git commit -m "feat: add guarded Pi file primitives"
```

---

### Task 6: Implement Native Pi Shell Operations With Structured Non-Error Exit Semantics

**Files:**
- Modify: `providers/pi-dev/shell.mjs`
- Modify: `providers/pi-dev/test/shell.test.mjs`

**Interfaces:**

```js
runBash({
  cwd,
  command,
  timeout_seconds = 30,
  max_output_bytes = 1048576,
  state_dir?
}, signal?)
  -> {
       cwd, exit_code, output, output_bytes, duration_ms,
       timed_out, cancelled, truncated, full_output_path
     }
```

- [ ] **Step 1: Write failing Shell tests**

Cover:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runBash } from '../shell.mjs';

const tempDir = prefix => fs.mkdtemp(path.join(os.tmpdir(), prefix));

test('native compound command works as one string', async () => {
  const cwd = await tempDir('pi-bash-');
  const result = await runBash({ cwd, command: "printf 'one\\ntwo\\n' | tail -1" });
  assert.equal(result.exit_code, 0);
  assert.match(result.output, /two/);
});

test('non-zero exit is normal result, not thrown error', async () => {
  const cwd = await tempDir('pi-bash-exit-');
  const result = await runBash({ cwd, command: "printf 'no-match\\n'; exit 7" });
  assert.equal(result.exit_code, 7);
  assert.equal(result.timed_out, false);
  assert.equal(result.cancelled, false);
});

test('default/explicit timeout kills a hung command tree', async () => {
  const cwd = await tempDir('pi-bash-timeout-');
  const pidFile = path.join(cwd, 'child.pid');
  const result = await runBash({
    cwd,
    command: `sleep 30 & echo $! > ${JSON.stringify(pidFile)}; wait`,
    timeout_seconds: 0.2
  });
  assert.equal(result.timed_out, true);
  assert.equal(result.exit_code, null);
  const pid = Number((await fs.readFile(pidFile, 'utf8')).trim());
  assert.throws(() => process.kill(pid, 0));
});

test('AbortSignal cancels and kills descendants', async () => {
  const cwd = await tempDir('pi-bash-cancel-');
  const pidFile = path.join(cwd, 'child.pid');
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 150);
  const result = await runBash({
    cwd,
    command: `sleep 30 & echo $! > ${JSON.stringify(pidFile)}; wait`,
    timeout_seconds: 30
  }, controller.signal);
  assert.equal(result.cancelled, true);
  const pid = Number((await fs.readFile(pidFile, 'utf8')).trim());
  assert.throws(() => process.kill(pid, 0));
});

test('large output is bounded and full output is recoverable', async () => {
  const cwd = await tempDir('pi-bash-output-');
  const stateDir = await tempDir('pi-bash-state-');
  const result = await runBash({
    cwd,
    state_dir: stateDir,
    max_output_bytes: 1024,
    command: `node -e "process.stdout.write('x'.repeat(5000))"`
  });
  assert.equal(result.exit_code, 0);
  assert.equal(result.truncated, true);
  assert.ok(Buffer.byteLength(result.output) <= 1024 + 3);
  assert.ok(result.full_output_path);
  assert.equal((await fs.readFile(result.full_output_path)).length, 5000);
  assert.equal(result.output_bytes, 5000);
});

test('timeout above 300 seconds is rejected', async () => {
  const cwd = await tempDir('pi-bash-limit-');
  await assert.rejects(() => runBash({ cwd, command: 'true', timeout_seconds: 301 }), /300/);
});
```

- [ ] **Step 2: Run RED**

```bash
cd providers/pi-dev
node --test test/shell.test.mjs
```

- [ ] **Step 3: Implement Shell with `createLocalBashOperations()`**

Replace `providers/pi-dev/shell.mjs` with:

```js
import {
  closeSync,
  mkdirSync,
  openSync,
  unlinkSync,
  writeSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createLocalBashOperations } from '@earendil-works/pi-coding-agent';
import { validateCwd } from './files.mjs';

const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_TIMEOUT_SECONDS = 300;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

function boundedTail(current, chunk, limit) {
  if (chunk.length >= limit) return Buffer.from(chunk.subarray(chunk.length - limit));
  if (current.length + chunk.length <= limit) return Buffer.concat([current, chunk]);
  const keep = limit - chunk.length;
  return Buffer.concat([current.subarray(current.length - keep), chunk]);
}

function validatePositiveNumber(name, value, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > max) {
    throw new Error(`${name} must be > 0 and <= ${max}`);
  }
}

export async function runBash({
  cwd,
  command,
  timeout_seconds = DEFAULT_TIMEOUT_SECONDS,
  max_output_bytes = DEFAULT_MAX_OUTPUT_BYTES,
  state_dir
}, signal) {
  await validateCwd(cwd);
  if (typeof command !== 'string' || command.length === 0) throw new Error('command must be a non-empty string');
  validatePositiveNumber('timeout_seconds', timeout_seconds, MAX_TIMEOUT_SECONDS);
  validatePositiveNumber('max_output_bytes', max_output_bytes, DEFAULT_MAX_OUTPUT_BYTES);

  const stateDir = path.resolve(
    state_dir ?? process.env.MCP_DEV_STATE_DIR ?? path.join(os.tmpdir(), 'mcp-dev-bridge')
  );
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
    tail = boundedTail(tail, chunk, max_output_bytes);
  };

  try {
    ({ exitCode } = await ops.exec(command, cwd, {
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
  const truncated = outputBytes > max_output_bytes;
  if (!truncated) {
    try { unlinkSync(spool); } catch {}
  }

  return {
    cwd,
    exit_code: timedOut || cancelled ? null : exitCode,
    output: tail.toString('utf8'),
    output_bytes: outputBytes,
    duration_ms: Math.round(durationMs),
    timed_out: timedOut,
    cancelled,
    truncated,
    full_output_path: truncated ? spool : null
  };
}
```

This deliberately returns the **tail** when output exceeds the byte budget; the complete combined stdout/stderr stream remains at `full_output_path`. Do not call Pi `createBashTool()` anywhere in this provider.

- [ ] **Step 4: Run GREEN**

```bash
cd providers/pi-dev
node --test test/shell.test.mjs
```

Expected: compound command, non-zero, timeout, cancellation, and truncation tests all pass.

- [ ] **Step 5: Integrator-only commit**

```bash
git add providers/pi-dev/shell.mjs providers/pi-dev/test/shell.test.mjs
git commit -m "feat: add structured Pi shell execution"
```

---

### Task 7: Expose the Profile-Aware MCP Surface and Forward One Edit Diff

**Files:**
- Modify: `providers/pi-dev/server.mjs`
- Modify: `providers/pi-dev/test/server.test.mjs`

**Interfaces:**
- `trusted-dev` / `MCP_DEV_SHELL_MODE=unrestricted`: tools are exactly `bash`, `edit`, `read`, `write`.
- `restricted` / `MCP_DEV_SHELL_MODE=allowlist`: tools are exactly `edit`, `read`, `write`; legacy shell remains separate.

- [ ] **Step 1: Write failing stdio MCP tests**

`providers/pi-dev/test/server.test.mjs` starts with these helpers and assertions:

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

async function toolNames(mode) {
  return withClient({ MCP_DEV_SHELL_MODE: mode }, async client => {
    const result = await client.listTools();
    return result.tools.map(tool => tool.name).sort();
  });
}

async function waitForFile(file, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { await fs.access(file); return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${file}`);
}

test('trusted-dev exposes four Pi tools', async () => {
  assert.deepEqual(await toolNames('unrestricted'), ['bash', 'edit', 'read', 'write']);
});

test('restricted omits unrestricted Pi bash', async () => {
  assert.deepEqual(await toolNames('allowlist'), ['edit', 'read', 'write']);
});

test('edit response forwards one useful diff', async () => {
  const cwd = await tempDir('pi-mcp-edit-');
  await fs.writeFile(path.join(cwd, 'x.txt'), 'alpha\nbeta\n');
  await withClient({ MCP_DEV_SHELL_MODE: 'unrestricted' }, async client => {
    const result = await client.callTool({
      name: 'edit',
      arguments: { cwd, path: 'x.txt', edits: [{ oldText: 'alpha', newText: 'ALPHA' }] }
    });
    const text = result.content.filter(x => x.type === 'text').map(x => x.text).join('\n');
    assert.match(text, /Successfully replaced/);
    assert.match(text, /ALPHA/);
    assert.equal((text.match(/@@/g) ?? []).length, 0, 'do not forward a second unified patch');
  });
});

test('MCP AbortSignal reaches Pi and kills the command tree', async () => {
  const cwd = await tempDir('pi-mcp-cancel-');
  const pidFile = path.join(cwd, 'child.pid');
  await withClient({ MCP_DEV_SHELL_MODE: 'unrestricted' }, async client => {
    const controller = new AbortController();
    const call = client.callTool({
      name: 'bash',
      arguments: {
        cwd,
        command: `sleep 30 & echo $! > ${JSON.stringify(pidFile)}; wait`,
        timeout_seconds: 30
      }
    }, undefined, { signal: controller.signal, timeout: 5000 });
    await waitForFile(pidFile);
    controller.abort();
    await assert.rejects(call, /abort/i);
    const pid = Number((await fs.readFile(pidFile, 'utf8')).trim());
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.throws(() => process.kill(pid, 0));
  });
});
```

- [ ] **Step 2: Implement `server.mjs`**

Replace `providers/pi-dev/server.mjs` with:

```js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runRead, runEdit, runWrite } from './files.mjs';
import { runBash } from './shell.mjs';

const mode = process.env.MCP_DEV_SHELL_MODE;
if (!['allowlist', 'unrestricted'].includes(mode)) {
  console.error('MCP_DEV_SHELL_MODE must be allowlist or unrestricted');
  process.exit(2);
}

const server = new McpServer({ name: 'pi-dev', version: '0.1.0' });

const cwdSchema = z.string().min(1).describe('Absolute existing working directory');
const pathSchema = z.string().min(1).describe('Path resolved relative to cwd, or an absolute path');

async function invoke(fn) {
  try { return await fn(); }
  catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }]
    };
  }
}

server.registerTool('read', {
  description: 'Read a file using Pi ranged-read semantics',
  inputSchema: {
    cwd: cwdSchema,
    path: pathSchema,
    offset: z.number().int().positive().optional(),
    limit: z.number().int().positive().optional()
  }
}, async (args, extra) => invoke(async () => {
  const result = await runRead(args, extra.signal);
  return { content: result.content };
}));

server.registerTool('edit', {
  description: 'Apply one or more exact, disjoint replacements to an existing file',
  inputSchema: {
    cwd: cwdSchema,
    path: pathSchema,
    edits: z.array(z.object({ oldText: z.string().min(1), newText: z.string() })).min(1)
  }
}, async (args, extra) => invoke(async () => {
  const result = await runEdit(args, extra.signal);
  const content = [...result.content];
  if (result.details?.diff) content.push({ type: 'text', text: `Diff:
${result.details.diff}` });
  return { content };
}));

server.registerTool('write', {
  description: 'Create a new file atomically; fails if the path already exists',
  inputSchema: { cwd: cwdSchema, path: pathSchema, content: z.string() }
}, async (args, extra) => invoke(async () => {
  const result = await runWrite(args, extra.signal);
  return { content: result.content };
}));

if (mode === 'unrestricted') {
  server.registerTool('bash', {
    description: 'Run one native Bash command string with bounded combined output',
    inputSchema: {
      cwd: cwdSchema,
      command: z.string().min(1),
      timeout_seconds: z.number().positive().max(300).optional(),
      max_output_bytes: z.number().int().positive().max(1048576).optional()
    }
  }, async (args, extra) => invoke(async () => {
    const result = await runBash(args, extra.signal);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }));
}

await server.connect(new StdioServerTransport());
```

Do not expose `state_dir` as an MCP argument; deployment state comes from `MCP_DEV_STATE_DIR`.

- [ ] **Step 3: Run provider suite**

```bash
cd providers/pi-dev
npm test
node --check server.mjs files.mjs shell.mjs
```

Expected: all green.

- [ ] **Step 4: Integrator-only commit**

```bash
git add providers/pi-dev/server.mjs providers/pi-dev/test/server.test.mjs
git commit -m "feat: expose profile-aware Pi dev MCP"
```

---

### Task 8: Register Pi in the Publication Renderer Without Weakening Restricted Mode

**Files:**
- Modify: `config/templates/mcp.json`
- Modify: `config/profiles/restricted.env`
- Modify: `config/profiles/trusted-dev.env`
- Modify: `scripts/render-config.mjs`
- Modify: `scripts/setup.sh`
- Modify: `scripts/smoke-local.sh`
- Modify: `tests/publication.sh`
- Modify: `tests/harness.sh`
- Modify: `README.md` and `docs/acceptance.md` during the A/B phase; remove or finalize that copy at the decision gate.

**Interfaces:**
- General policy key: `MCP_SHELL_MODE=allowlist|unrestricted`.
- Rendered Pi env key: `MCP_DEV_SHELL_MODE`.
- Rendered Pi state path: `path.join(stateDir, "dev")` (for example `${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/dev`).

- [ ] **Step 1: Add failing profile/render tests**

Append this assertion to the existing publication renderer fixture after both profiles have been rendered:

```bash
grep -Fqx 'MCP_SHELL_MODE=allowlist' "$ROOT/config/profiles/restricted.env" || return 1
grep -Fqx 'MCP_SHELL_MODE=unrestricted' "$ROOT/config/profiles/trusted-dev.env" || return 1

node - "$tmp/restricted/1mcp/mcp.json" "$tmp/trusted-dev/1mcp/mcp.json" <<'NODE'
const fs = require('fs');
const [restrictedFile, trustedFile] = process.argv.slice(2);
const restricted = JSON.parse(fs.readFileSync(restrictedFile, 'utf8'));
const trusted = JSON.parse(fs.readFileSync(trustedFile, 'utf8'));
for (const cfg of [restricted, trusted]) {
  for (const name of ['filesystem', 'shell', 'dev']) if (!cfg.mcpServers?.[name]) process.exit(1);
}
if (restricted.mcpServers.dev.env.MCP_DEV_SHELL_MODE !== 'allowlist') process.exit(1);
if (trusted.mcpServers.dev.env.MCP_DEV_SHELL_MODE !== 'unrestricted') process.exit(1);
NODE
```

Also extend `test_public_structure()` so the A/B branch requires the Pi provider package:

```bash
[ -f "$ROOT/providers/pi-dev/server.mjs" ] && \
[ -f "$ROOT/providers/pi-dev/package.json" ] && \
[ -f "$ROOT/providers/pi-dev/package-lock.json" ]
```

Run `bash tests/publication.sh`; expect RED until the profile/template/renderer changes below exist.

- [ ] **Step 2: Add `dev` to the tracked template and profile policy**

Append to `config/profiles/restricted.env`:

```dotenv
MCP_SHELL_MODE=allowlist
```

Append to `config/profiles/trusted-dev.env`:

```dotenv
MCP_SHELL_MODE=unrestricted
```

Add this sibling entry under `mcpServers` in `config/templates/mcp.json`:

```json
"dev": {
  "command": "node",
  "args": ["__REPO_ROOT__/providers/pi-dev/server.mjs"],
  "env": {
    "MCP_DEV_SHELL_MODE": "__SHELL_MODE__",
    "MCP_DEV_STATE_DIR": "__DEV_STATE_DIR__"
  },
  "tags": ["dev"]
}
```

- [ ] **Step 3: Extend renderer validation and replacements**

Immediately after reading `profileValues` in `scripts/render-config.mjs`, add:

```js
const shellMode = profileValues.MCP_SHELL_MODE;
if (!['allowlist', 'unrestricted'].includes(shellMode)) {
  throw new Error(`profile ${profile} must set MCP_SHELL_MODE=allowlist or unrestricted`);
}
```

Then extend the `replaceStrings()` replacements object with:

```js
__SHELL_MODE__: shellMode,
__DEV_STATE_DIR__: path.join(stateDir, 'dev'),
```

No profile may default to unrestricted when the key is absent or malformed.

- [ ] **Step 4: Extend setup and smoke checks without changing OAuth patch behavior**

Inside the existing `if [ "${BRIDGE_SETUP_SKIP_INSTALL:-0}" != "1" ]; then` block in `scripts/setup.sh`, after prerequisite verification, add:

```bash
echo "== installing pinned Pi dev provider dependencies =="
npm --prefix "$DIR/providers/pi-dev" ci --omit=dev
PI_VERSION="$(node -p "require(process.argv[1]).version" "$DIR/providers/pi-dev/node_modules/@earendil-works/pi-coding-agent/package.json")"
[ "$PI_VERSION" = "0.84.1" ] || {
  echo "unexpected Pi version: $PI_VERSION" >&2
  exit 1
}
echo "  Pi coding primitives: @earendil-works/pi-coding-agent@$PI_VERSION"
```

Do not move or weaken the existing 1MCP CSP source-shape verification.

In `scripts/smoke-local.sh`, after sourcing `lib/bridge/common.sh`, add:

```bash
if [ -f "$BRIDGE_CONFIG_DIR/mcp.json" ] && node - "$BRIDGE_CONFIG_DIR/mcp.json" <<'NODE'
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
process.exit(cfg.mcpServers?.dev ? 0 : 1);
NODE
then
  PI_PACKAGE="$ROOT/providers/pi-dev/node_modules/@earendil-works/pi-coding-agent/package.json"
  [ -f "$PI_PACKAGE" ] || { echo "Pi dev provider dependencies are not installed" >&2; exit 1; }
  [ "$(node -p "require(process.argv[1]).version" "$PI_PACKAGE")" = "0.84.1" ] || {
    echo "Pi dev provider version mismatch" >&2
    exit 1
  }
fi
```

Keep the existing connectivity probe below these preflights.

During A/B, replace the paragraph under `README.md` -> `## Current development surface` with:

```markdown
The bridge is evaluating two replaceable development-harness candidates behind the existing Cloudflare OAuth + 1MCP transport. CodeDB is present only if its independent Phase-1 benchmark verdict is `KEEP`. The experimental `dev` provider uses pinned Pi coding primitives for `read`, exact guarded multi-`edit`, and atomic create-only `write`. Under `trusted-dev` it also exposes native-command `bash`; under `restricted` it deliberately omits Pi Bash and the existing allowlisted shell provider remains responsible for Shell. The legacy filesystem and shell providers remain enabled during A/B comparison and are removed only by an explicit winning-candidate cutover.
```

In `docs/acceptance.md`, replace sections `## 4. Filesystem boundary` and `## 5. Shell profile` during A/B with:

```markdown
## 4. Files providers during A/B

Verify the legacy filesystem provider still enforces its configured workspace boundary. Then verify `dev.read` can read a harmless file using an explicit absolute `cwd`, `dev.edit` rejects a fuzzy-only match, and two concurrent `dev.write` calls for one absent path yield exactly one successful create. Existing files must not be overwriteable through `dev.write`.

## 5. Shell profile during A/B

For `restricted`, verify `dev` advertises `read`, `edit`, and `write` but not `bash`; verify the separate legacy shell still permits/denies commands according to the selected restricted policy.

For `trusted-dev`, verify `dev` advertises `bash` and a harmless compound Linux command returns structured `exit_code` data. Verify a normal non-zero command is returned as execution data rather than an MCP tool failure.
```

- [ ] **Step 5: Run all non-live verification**

```bash
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
(cd providers/pi-dev && npm test)
bash -n scripts/*.sh tests/*.sh
node --check scripts/render-config.mjs providers/pi-dev/*.mjs
git diff --check
```

Expected: all green.

- [ ] **Step 6: Integrator-only commit**

Commit the A/B registration and profile mapping. Do not remove old providers yet.

---

### Task 9: Benchmark Pi vs Existing Providers, Including the Failure Semantics the Review Identified

**Files:**
- Create: `docs/benchmarks/pi-dev.md`

**Interfaces:**
- Produces `CUTOVER` or `KEEP_OLD_PROVIDERS`.

- [ ] **Step 1: At the live-activation checkpoint, render trusted-dev and restart canonical service**

Only after the implementation branch is deliberately the live deployment root:

```bash
scripts/setup.sh --profile trusted-dev
systemctl --user restart mcp-dev-bridge.service
bin/status
```

Expected: `issues: 0` and public health ready.

- [ ] **Step 2: Confirm runtime tool surfaces**

For trusted-dev, `dev` must advertise exactly four tools:

```text
read edit write bash
```

For a separately rendered/tested restricted fixture, `dev` advertises only:

```text
read edit write
```

and the legacy restricted `shell` remains in generated composition.

- [ ] **Step 3: Run old-provider baseline workflow**

On disposable fixtures plus one real read-only repo workflow, record tool calls, wall time, returned bytes, retries, and correctness for:

```text
ranged read
two-location edit
create file
native compound shell command
non-zero shell outcome
verbose output
```

- [ ] **Step 4: Run Pi workflow and mandatory edge cases**

Explicitly test and record:

```text
1. ranged read
2. two-location multi-edit
3. Unicode-quote/trailing-normalization candidate that Pi alone would fuzzy-match -> dev must reject
4. two simultaneous writes to the same absent path -> one success only
5. compound command using pipe + && + redirect
6. `exit 7` -> normal result with exit_code=7
7. MCP/direct AbortSignal cancellation -> descendant killed
8. hung command with default/short test timeout -> timed_out=true, descendant killed
9. >1 MiB/noisy output -> bounded result + readable full_output_path
10. two different cwd requests -> no cwd leakage
11. edit result contains useful diff without requiring an immediate extra `git diff` just to know what changed
```

- [ ] **Step 5: Write verdict document**

`CUTOVER` requires every mandatory semantic test above to pass and the Pi path to be at least as reliable as the old providers while materially improving native-command ergonomics/schema focus.

Otherwise verdict is `KEEP_OLD_PROVIDERS` with concrete failed criteria.

- [ ] **Step 6: Integrator-only evidence commit**

```bash
git add docs/benchmarks/pi-dev.md
git commit -m "docs: benchmark Pi dev provider"
```

---

### Task 10: Apply Pi Cutover or Full Loser Rollback

**Files:**
- Modify based on verdict: `config/templates/mcp.json`, `scripts/render-config.mjs`, profiles, smoke/tests/docs.
- If loser: delete `providers/pi-dev/` and temporary Pi integration files while retaining `docs/benchmarks/pi-dev.md`.

**Interfaces:**
- Trusted-dev and restricted profiles intentionally have different Shell backends after successful cutover.

- [ ] **Step 1: If verdict is `CUTOVER`, remove generic filesystem for both profiles**

Delete `filesystem` from `config/templates/mcp.json`.

Keep the legacy `shell` object in the template because restricted still uses it.

In `scripts/render-config.mjs`, after template substitution and before writing config, add profile-aware composition:

```js
if (profile === 'trusted-dev') {
  delete rendered.mcpServers.shell;
}
```

Do **not** delete `shell` for `restricted`.

Final generated surfaces:

```text
trusted-dev providers: [codedb?], dev
restricted providers:  [codedb?], dev, shell
```

where `[codedb?]` reflects its independent Phase 1 verdict.

- [ ] **Step 2: If verdict is `CUTOVER`, update setup/smoke/docs/tests**

- Remove filesystem dependency/preflight text no longer used.
- Keep `mcp-shell-server==1.1.8` and `providers/legacy-shell/server.py` because restricted still needs them.
- Document trusted-dev Files/Shell as Pi-backed.
- Document restricted Files as Pi-backed and Shell as legacy allowlisted transitional implementation.
- Tests must render both profiles and assert the exact provider sets above.

- [ ] **Step 3: If verdict is `KEEP_OLD_PROVIDERS`, remove the losing candidate completely**

Delete `dev` from `config/templates/mcp.json`; remove `MCP_SHELL_MODE` additions that only served Pi; remove Pi install/smoke logic; delete `providers/pi-dev/`; revert temporary A/B README language. Keep `docs/benchmarks/pi-dev.md` as evidence.

Run generated config tests for both profiles and assert no `dev` provider remains.

- [ ] **Step 4: Verify whichever decision path was taken**

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

At the live checkpoint, restart once and verify:

```bash
systemctl --user restart mcp-dev-bridge.service
bin/status
```

Expected: `issues: 0`; no losing experimental provider remains exposed.

- [ ] **Step 5: Integrator-only decision commit**

Commit exact cutover or rollback paths. Helpers do not commit.

---

## Final Verification

Before declaring this plan complete, run fresh on the implementation branch:

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

Then verify the live deployment only after intentional integration/migration:

```bash
bin/status
systemctl --user is-enabled mcp-dev-bridge.service
systemctl --user is-active mcp-dev-bridge.service
```

And from ChatGPT verify the final winner surfaces, with explicit Satori `project` for CodeDB if retained and native single-string `bash` for trusted-dev if Pi retained.

## Deferred Separate Plans

These are deliberately excluded from this plan:

1. **Terminal + long-wait control flow / `await_until`** — first measure real ChatGPT -> Cloudflare -> 1MCP request lifetime and concurrent-resume requirements. Do not assume a 180-second lease is transport-safe; Cloudflare documents a 125-second default Proxy Read Timeout for proxied HTTP.
2. **RTK** — only after raw Pi Shell semantics are proven.
3. **Live GCF** — shadow results are screening evidence only. The first live candidate is a pinned `gcf-proxy` wrapped around CodeDB only, behind 1MCP and initially **without** `--session` or `--delta`. First verify CodeDB returns JSON inside MCP `content[].text`, because current `gcf-proxy` rewrites JSON-valued text blocks and does not generically transform `structuredContent`. Before either stateful flag is enabled, prove the proxy state is scoped to the same ChatGPT/MCP conversation rather than shared across independent clients. Re-pin the then-current proxy release at implementation time; current v0.11.4 is built against GCF spec v3.5.0 while the shadow screen targets spec v3.5.3.
4. **Full Files hash/CAS** — add only if exact guarded multi-edit + snapshot conflict + atomic exclusive create proves insufficient.
5. **Restricted native Pi Bash policy** — until this is deliberately designed, restricted keeps the legacy allowlisted shell.
6. **Tool facades/hiding** — only after component selection is stable.

## Self-Review Checklist

- Spec and plan agree that Pi is the Files/Shell implementation engine, not a nested agent.
- No plan step relies on Pi fuzzy edit behavior for safety.
- Create-only `write` is atomic, not `lstat` + write.
- Shell non-zero exits are data and MCP cancellation is wired through.
- Edit result preserves one useful diff.
- CodeDB and Pi decisions are independent and both have loser rollback paths.
- CodeDB benchmark includes wall time.
- Shadow GCF is restored but remains non-live.
- `await_until` is absent from implementation tasks.
- `restricted` cannot accidentally acquire unrestricted Pi Bash.
- Publication-scaffold paths are the implementation base.
- One integrator owns Git commits/index.
