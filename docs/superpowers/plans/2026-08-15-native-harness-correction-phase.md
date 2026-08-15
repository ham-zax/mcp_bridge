# Native WSL Harness Correction Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-run the Pi, CodeDB, and GCF decisions with corrected experiment boundaries, temporarily restore a reproducible live A/B provider surface without rewriting product history, and finish with evidence-backed final provider/format verdicts.

**Architecture:** Keep the product implementation baseline `41491ac` intact beneath the correction-spec commits. A tracked evaluation renderer reconstructs only the `e99579a` A/B provider composition while delegating state rendering to the current `render-config.mjs`; all OAuth/state/systemd lifecycle behavior remains current. Pi is rechecked against the best incumbent operations and through the real ChatGPT path, CodeDB is requalified as a repository-rooted MCP process, and GCF generic/graph profiles receive separately scoped verdicts.

**Tech Stack:** Bash/systemd user service; Node.js 24.19.0; 1MCP 0.34.4; `@earendil-works/pi-coding-agent@0.84.1`; `@modelcontextprotocol/sdk@1.30.0`; Zod 4.4.3; CodeDB 0.2.5840 SHA-256 `f784c931b053031ca9928173828130c504f769c9e94bf5c2666ab71091747966`; `gcf-python==2.6.0`; `tiktoken==0.13.0` with `o200k_base`.

## Global Constraints

- Frozen correction spec: `docs/superpowers/specs/2026-08-15-native-harness-correction-phase-design.md` at/after commit `64d8ddc`.
- Protected product implementation baseline: `41491ac feat: cut over to Pi dev provider`; do not revert, amend, reset, or temporarily check out this commit to recreate A/B.
- `e99579a` is authoritative only for the old A/B provider/template/profile semantics. Never execute its setup, lifecycle, state-management, or service-control code as the active bridge controller.
- Current HEAD's OAuth migration, external-state, systemd lifecycle, process-ownership, and self-hosting protections remain authoritative.
- Preserve the existing external state home and durable OAuth client-registration/access-token continuity. Do not delete/rotate registrations or valid access-token sessions just to change provider composition. Streamable HTTP transport sessions may naturally be recreated.
- Never stop/restart the bridge from an MCP Shell/Bash process that belongs to the 1MCP instance being replaced. Live cutovers run from a direct WSL terminal, the user systemd manager, or another out-of-process controller.
- Raw benchmark captures stay under `${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/correction/` and never enter Git.
- No OAuth tokens, dynamic client secrets, live session contents, or unsanitized machine identity enter tracked benchmark docs.
- A failed gate must be classified `candidate`, `adapter/integration`, or `benchmark/experiment-design`, then independently reproduced before a final REMOVE-style verdict.
- Do not synthesize a graph payload merely to make GCF graph mode benchmarkable. If no genuine graph-shaped model-facing payload exists, use `DEFERRED_NO_GRAPH_PAYLOAD`.
- Do not build a multi-repository CodeDB router until one correctly rooted CodeDB process proves material value.
- Do not restart or re-render the live bridge until Task 2's explicit external-control checkpoint.

## Planned File Responsibilities

- `scripts/render-evaluation-ab.mjs` — temporary, tracked evaluation-only renderer that delegates state rendering to current `render-config.mjs` and imports only provider/profile semantics from `e99579a`; deleted after the correction decision.
- `docs/benchmarks/harness-correction.md` — single correction-phase record tying activation evidence and the independent Pi/CodeDB/GCF verdicts together.
- `docs/benchmarks/pi-dev.md` — corrected Pi incumbent comparison plus real ChatGPT-path acceptance.
- `docs/benchmarks/codedb.md` — rooted-watcher requalification and Pi-era incremental-value decision.
- `docs/benchmarks/structured-formats.md` — corrected GCF generic/graph profile verdicts.
- Product renderer/setup/template files change only in Task 7 and only as required by the final verdicts.

---

### Task 1: Add a Reproducible A/B Evaluation Renderer Without Regressing Current State/Lifecycle Semantics

**Files:**
- Create: `scripts/render-evaluation-ab.mjs`
- Modify: `tests/harness.sh`
- Modify: `tests/publication.sh`

**Interfaces:**
- Consumes: current `renderConfig({profile, envFile, stateDir, repoRoot})` from `scripts/render-config.mjs`.
- Consumes: provider/template/profile content only from Git ref `e99579a`.
- Produces: `renderEvaluationAb({profile, envFile, stateDir, repoRoot}) -> {configPath, bridgeEnvPath, metadataPath}`.
- Produces temporary generated provider set `dev + filesystem + shell` for both A/B profiles; this does not alter current product template composition.
- Produces non-secret metadata at `<state-dir>/evaluation-ab.json` recording provider source ref, implementation baseline, rendering HEAD, profile, and generated provider names.

- [ ] **Step 1: Add a failing harness fixture for trusted A/B rendering and OAuth-state preservation**

Add this test to `tests/harness.sh` before the `run_test` block:

```bash
test_evaluation_ab_renderer_uses_old_provider_semantics_only() {
  local tmp
  tmp="$(mktemp -d)" || return 1
  cat > "$tmp/deployment.env" <<'ENV'
MCP_WORKSPACE_ROOT=/tmp/example-workspace
MCP_PUBLIC_URL=https://mcp.example.test
MCP_TUNNEL_NAME=
ENV
  mkdir -p "$tmp/state/1mcp/sessions/sessions/server"
  printf '%s\n' fixture > "$tmp/state/1mcp/sessions/sessions/server/session_cli_fixture.json"

  node "$ROOT/scripts/render-evaluation-ab.mjs" \
    --profile trusted-dev \
    --env-file "$tmp/deployment.env" \
    --state-dir "$tmp/state" \
    --repo-root "$ROOT" >/dev/null || { rm -rf "$tmp"; return 1; }

  node - "$tmp/state/1mcp/mcp.json" "$tmp/state/evaluation-ab.json" "$ROOT" <<'NODE'
const fs = require('fs');
const [configFile, metadataFile, root] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
const names = Object.keys(config.mcpServers ?? {}).sort();
if (JSON.stringify(names) !== JSON.stringify(['dev', 'filesystem', 'shell'])) process.exit(1);
if (config.mcpServers.dev.args[0] !== `${root}/providers/pi-dev/server.mjs`) process.exit(1);
if (config.mcpServers.dev.env.MCP_DEV_SHELL_MODE !== 'unrestricted') process.exit(1);
if (config.mcpServers.filesystem.args[1] !== '@modelcontextprotocol/server-filesystem@2026.7.10') process.exit(1);
if (config.mcpServers.shell.env.MCP_SHELL_ALLOW_DANGEROUS !== 'ALL') process.exit(1);
if (metadata.provider_source_ref !== 'e99579a') process.exit(1);
if (metadata.implementation_baseline_ref !== '41491ac') process.exit(1);
if (metadata.profile !== 'trusted-dev') process.exit(1);
NODE
  local rc=$?
  [ "$rc" -eq 0 ] || { rm -rf "$tmp"; return 1; }
  [ "$(cat "$tmp/state/1mcp/sessions/sessions/server/session_cli_fixture.json")" = fixture ] || { rm -rf "$tmp"; return 1; }
  grep -Fq "BRIDGE_STATE_DIR='$tmp/state'" "$tmp/state/bridge.env" || { rm -rf "$tmp"; return 1; }
  rm -rf "$tmp"
}
```

Register:

```bash
run_test 'evaluation A/B renderer reuses old provider semantics without old lifecycle' test_evaluation_ab_renderer_uses_old_provider_semantics_only
```

- [ ] **Step 2: Add a failing publication guard that forbids old lifecycle execution**

Add to `tests/publication.sh`:

```bash
test_evaluation_ab_renderer_is_provider_only() {
  local f="$ROOT/scripts/render-evaluation-ab.mjs"
  [ -f "$f" ] || return 1
  grep -Fq "e99579a" "$f" || return 1
  grep -Fq "41491ac" "$f" || return 1
  grep -Fq "./render-config.mjs" "$f" || return 1
  ! grep -Eq 'git (checkout|reset|restore)|scripts/(start|stop|setup)\.sh|bin/(start|stop)|systemctl' "$f"
}
```

Register it with the publication tests.

- [ ] **Step 3: Run the focused tests and observe RED**

Run:

```bash
bash tests/harness.sh
bash tests/publication.sh
```

Expected: only the new evaluation-renderer assertions fail because `scripts/render-evaluation-ab.mjs` does not exist yet.

- [ ] **Step 4: Implement `scripts/render-evaluation-ab.mjs` using the current renderer plus provider-only Git reads**

Create the file with this structure:

```js
#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderConfig } from './render-config.mjs';

const PROVIDER_SOURCE_REF = 'e99579a';
const IMPLEMENTATION_BASELINE_REF = '41491ac';

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) throw new Error(`invalid profile env line: ${raw}`);
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function replaceStrings(value, replacements) {
  if (typeof value === 'string') {
    let out = value;
    for (const [token, replacement] of Object.entries(replacements)) out = out.split(token).join(replacement);
    return out;
  }
  if (Array.isArray(value)) return value.map((item) => replaceStrings(item, replacements));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceStrings(item, replacements)]));
  }
  return value;
}

function gitShow(repoRoot, spec) {
  return execFileSync('git', ['-C', repoRoot, 'show', spec], { encoding: 'utf8' });
}

async function atomicJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await fs.chmod(tmp, 0o600);
  await fs.rename(tmp, file);
}

export async function renderEvaluationAb({ profile, envFile, stateDir, repoRoot }) {
  const rendered = await renderConfig({ profile, envFile, stateDir, repoRoot });
  const current = JSON.parse(await fs.readFile(rendered.configPath, 'utf8'));
  const baselineTemplate = JSON.parse(gitShow(repoRoot, `${PROVIDER_SOURCE_REF}:config/templates/mcp.json`));
  const baselineProfile = parseEnv(gitShow(repoRoot, `${PROVIDER_SOURCE_REF}:config/profiles/${profile}.env`));
  const dev = current.mcpServers?.dev;
  if (!dev) throw new Error('current renderer did not produce dev provider');
  if (!baselineTemplate.mcpServers?.filesystem || !baselineTemplate.mcpServers?.shell) {
    throw new Error('A/B source ref is missing filesystem or shell provider');
  }

  const historical = replaceStrings(baselineTemplate, {
    __WORKSPACE_ROOT__: dev.env.MCP_DEV_WORKSPACE_ROOT,
    __REPO_ROOT__: path.resolve(repoRoot),
    __SHELL_ALLOW_COMMANDS__: baselineProfile.MCP_SHELL_ALLOW_COMMANDS ?? '',
    __SHELL_ALLOW_PATTERNS__: baselineProfile.MCP_SHELL_ALLOW_PATTERNS ?? '',
    __SHELL_ALLOW_DANGEROUS__: baselineProfile.MCP_SHELL_ALLOW_DANGEROUS ?? '',
    __SHELL_MODE__: baselineProfile.MCP_SHELL_MODE ?? '',
    __DEV_STATE_DIR__: dev.env.MCP_DEV_STATE_DIR,
    __DEV_MAX_OUTPUT_BYTES__: dev.env.MCP_DEV_MAX_OUTPUT_BYTES,
  });

  current.mcpServers.filesystem = historical.mcpServers.filesystem;
  current.mcpServers.shell = historical.mcpServers.shell;
  await atomicJson(rendered.configPath, current);

  const metadataPath = path.join(rendered.stateDir, 'evaluation-ab.json');
  await atomicJson(metadataPath, {
    kind: 'temporary-provider-ab',
    provider_source_ref: PROVIDER_SOURCE_REF,
    implementation_baseline_ref: IMPLEMENTATION_BASELINE_REF,
    rendering_head: execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    profile,
    providers: Object.keys(current.mcpServers).sort(),
  });
  return { ...rendered, metadataPath };
}
```

Append this CLI layer; do not add any service-control command to this script:

```js
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (['--profile', '--env-file', '--state-dir', '--repo-root'].includes(arg)) {
      const value = argv[++i];
      if (!value) throw new Error(`missing value for ${arg}`);
      out[arg.slice(2)] = value;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return out;
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (!args.profile) throw new Error('--profile is required');
    const result = await renderEvaluationAb({
      profile: args.profile,
      envFile: args['env-file'],
      stateDir: args['state-dir'],
      repoRoot: path.resolve(args['repo-root'] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..')),
    });
    console.log(`A/B config: ${result.configPath}`);
    console.log(`A/B metadata: ${result.metadataPath}`);
  } catch (error) {
    console.error(`render-evaluation-ab: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
```

- [ ] **Step 5: Run focused and regression tests GREEN**

Run:

```bash
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
(cd providers/pi-dev && npm test)
node --check scripts/render-evaluation-ab.mjs scripts/render-config.mjs
bash -n scripts/*.sh tests/*.sh
git diff --check
```

Expected: all pass; no live service is touched.

- [ ] **Step 6: Commit the evaluation renderer**

```bash
git add scripts/render-evaluation-ab.mjs tests/harness.sh tests/publication.sh
git commit -m "test: add reproducible provider A/B renderer"
```

---

### Task 2: Restore the Live A/B Surface From Outside the MCP Process Tree

**Files:**
- Create external evidence only: `${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/correction/live-ab/`
- Modify: `docs/benchmarks/harness-correction.md`

**Interfaces:**
- Consumes: `scripts/render-evaluation-ab.mjs` from Task 1.
- Produces live trusted-dev provider set exactly `dev + filesystem + shell`.
- Preserves current systemd unit, current bridge root, current external state home, and durable OAuth continuity.
- Produces an activation record containing rendering HEAD, provider-source ref `e99579a`, before/after provider names, health output, and non-secret durable-OAuth filenames/counts.

- [ ] **Step 1: Verify source state is clean and create the external activation-evidence directory**

From the current worktree, run:

```bash
git status --short
```

Expected: clean before the live checkpoint.

The direct WSL commands in Step 2 create `${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/correction/live-ab/`; do not create the tracked correction report until observed activation evidence exists.

- [ ] **Step 2: From a direct WSL terminal, capture pre-change state without session contents**

Run outside MCP:

```bash
set -euo pipefail
export HOME="$(getent passwd "$(id -u)" | cut -d: -f6)"
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
WORKTREE=/home/hamza/repo/satori_bridge/.worktrees/native-wsl-pi-codedb-harness
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge"
OUT="$STATE/benchmarks/correction/live-ab"
mkdir -p "$OUT"

git -C "$WORKTREE" rev-parse HEAD > "$OUT/head-before.txt"
node -e 'const fs=require("fs"); const c=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); console.log(Object.keys(c.mcpServers||{}).sort().join("\n"));' \
  "$STATE/1mcp/mcp.json" > "$OUT/providers-before.txt"
find "$STATE/1mcp/sessions/sessions/server" -maxdepth 1 -type f \
  \( -name 'session_cli_*.json' -o -name 'session_sess-*.json' \) \
  -printf '%f\n' 2>/dev/null | sort > "$OUT/durable-oauth-names-before.txt"
"$WORKTREE/bin/status" > "$OUT/status-before.txt"
```

Do not copy or print session file contents.

- [ ] **Step 3: Stop, render A/B with current machinery, and start using external systemd control**

Still from the same direct WSL terminal:

```bash
systemctl --user stop mcp-dev-bridge.service
node "$WORKTREE/scripts/render-evaluation-ab.mjs" \
  --profile trusted-dev \
  --env-file "$STATE/bridge.env" \
  --state-dir "$STATE" \
  --repo-root "$WORKTREE" | tee "$OUT/render.txt"
systemctl --user start mcp-dev-bridge.service
```

Do not run `git checkout e99579a`, old `scripts/setup.sh`, old `scripts/start.sh`, or old lifecycle scripts.

- [ ] **Step 4: Verify live provider composition, health, and OAuth continuity**

Run:

```bash
node -e 'const fs=require("fs"); const c=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); console.log(Object.keys(c.mcpServers||{}).sort().join("\n"));' \
  "$STATE/1mcp/mcp.json" | tee "$OUT/providers-after.txt"
"$WORKTREE/bin/status" | tee "$OUT/status-after.txt"
curl -fsS --max-time 10 https://mcp.hamza.my.id/health/ready > "$OUT/public-health.json"
find "$STATE/1mcp/sessions/sessions/server" -maxdepth 1 -type f \
  \( -name 'session_cli_*.json' -o -name 'session_sess-*.json' \) \
  -printf '%f\n' 2>/dev/null | sort > "$OUT/durable-oauth-names-after.txt"
```

Expected:

```text
providers-after:
dev
filesystem
shell

bin/status:
issues: 0
```

The before/after durable OAuth filename sets must retain the existing registration/session identities; transient `transport/streamable_session_*` files are not compared.

- [ ] **Step 5: Refresh ChatGPT Actions and verify the A/B catalog in a fresh session**

In ChatGPT:

```text
Workspace/plugin -> Actions -> Refresh
start a fresh session
```

Expected visible development actions include `dev_*`, `filesystem_*`, and `shell_1mcp_shell_execute`; no `ui_experiment_*` or CodeDB actions are present yet.

- [ ] **Step 6: Create the correction report from observed activation facts and commit**

Create `docs/benchmarks/harness-correction.md` only now, using the evidence files from Steps 2-5. It must contain these fixed sections:

```text
Native Harness Correction Report
Failure-classification rule
Live A/B activation
Pi correction
CodeDB requalification
GCF correction
Final verdicts
```

Populate `Live A/B activation` with the observed rendering HEAD, provider source ref `e99579a`, provider names before/after, status issues count, public health status, durable OAuth filename/count continuity without contents, and ChatGPT refresh outcome. The later sections may contain only the classification rule and a statement that their experiment has not executed yet; do not invent verdicts.

Commit:

```bash
git add docs/benchmarks/harness-correction.md
git commit -m "docs: record correction A/B activation"
```

---

### Task 3: Correct the Pi Baseline and Complete Real ChatGPT-Path Acceptance

**Files:**
- Modify: `docs/benchmarks/pi-dev.md`
- Modify: `docs/benchmarks/harness-correction.md`
- Create external evidence: `${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/correction/pi/`

**Interfaces:**
- Consumes live A/B provider set from Task 2.
- Produces corrected range-read incumbent metric using legacy Shell `sed`/`awk`, not whole-file filesystem read as the best-harness baseline.
- Produces real ChatGPT-path evidence for `dev.read`, `dev.bash`, `dev.write`, and `dev.edit`.
- Produces final Pi verdict `CUTOVER_CONFIRMED` or `REOPEN`.

- [ ] **Step 1: Re-run the fair one-call ranged-read baseline with the same source range**

Use the existing real file and line range from the Pi benchmark. Through direct MCP/provider calls or the A/B ChatGPT surface, compare:

```text
legacy Shell:
sed -n '80,119p' <absolute-source-path>

Pi dev:
read(path='satori/packages/mcp/src/core/handlers.ts', offset=80, limit=40)
```

Save exact request JSON and TextContent into the external correction evidence directory. Tokenize both request/result payloads with:

```bash
uv run --with tiktoken==0.13.0 python - "$file" <<'PY'
from pathlib import Path
import sys, tiktoken
text = Path(sys.argv[1]).read_text(encoding='utf-8')
enc = tiktoken.get_encoding('o200k_base')
print(len(text.encode('utf-8')), len(enc.encode(text)))
PY
```

Record wall time with the same timing mechanism for both sides.

- [ ] **Step 2: Keep the whole-file filesystem comparison, but relabel it accurately**

In `docs/benchmarks/pi-dev.md`, replace any wording that presents `25,155 -> 344` as the best complete incumbent-harness comparison. State explicitly:

```text
The 25,155 -> 344 figure compares the generic filesystem provider's whole-file fallback to dev.read.
The best one-call old-harness ranged baseline is legacy Shell + sed/awk and is reported separately.
```

Do not delete the Files-provider measurement; it remains valid evidence about the generic filesystem tool itself.

- [ ] **Step 3: Run a fresh real ChatGPT-path `dev.read` and `dev.bash`**

In the refreshed A/B ChatGPT session, call:

```text
dev.read(path='satori_bridge/README.md', offset=1, limit=20)
dev.bash(command='git status --short', cwd='satori_bridge/.worktrees/native-wsl-pi-codedb-harness')
```

Acceptance:

```text
read -> source/text only
bash -> terminal-like text only
no structuredContent duplicate
no embedded resource
no JSON execution record
```

Record short sanitized result excerpts and whether another call was needed to understand the result.

- [ ] **Step 4: Run fresh real ChatGPT-path disposable `dev.write` then `dev.edit`**

Use a unique fixture path under the workspace, for example:

```text
satori_bridge/.tmp/correction-pi-<timestamp>/probe.txt
```

First create the parent directory with `dev.bash(command='mkdir -p ...')`, then:

```text
dev.write(content='alpha\nbeta\n')
```

Expected TextContent:

```text
Created <relative-path>
```

Then:

```text
dev.edit(edits=[{oldText:'beta', newText:'BETA'}])
```

Expected: one useful diff, no Pi generic success prose, no structured duplicate.

Read once to verify `BETA`, then clean up the fixture with trusted `dev.bash(command='rm -rf ...')`.

- [ ] **Step 5: Classify any failure before deciding Pi**

For each failed observation, write one of:

```text
candidate failure
adapter/integration failure
benchmark/experiment-design failure
```

Then reproduce only that boundary once. Do not change Pi implementation until the classification points to Pi itself.

- [ ] **Step 6: Write the corrected Pi verdict**

`CUTOVER_CONFIRMED` requires:

```text
real ChatGPT read/bash/write/edit all match native TextContent contract
no new correctness regression
corrected incumbent comparison still leaves material overall ergonomic/context/reliability advantage
```

Otherwise use `REOPEN` and list the failed criteria.

Update both benchmark docs with observed facts/inference/policy separated.

- [ ] **Step 7: Commit Pi correction evidence**

```bash
git add docs/benchmarks/pi-dev.md docs/benchmarks/harness-correction.md
git commit -m "docs: correct Pi cutover evidence"
```

---

### Task 4: Requalify CodeDB in Its Rooted Operating Mode

**Files:**
- Modify: `docs/benchmarks/codedb.md`
- Modify: `docs/benchmarks/harness-correction.md`
- Create external evidence: `${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/correction/codedb-rooted/`

**Interfaces:**
- Consumes pinned external CodeDB binary `codedb-v0.2.5840`.
- Produces independent rooted-watcher result for external edit, new file, and Pi edit.
- Ordinary rooted calls omit `project`.
- Produces `ROOTED_FRESHNESS_PASS` or a classified failure before any KEEP/REMOVE decision.

- [ ] **Step 1: Verify the exact CodeDB binary before using it**

Run:

```bash
CODEDB_BIN="${XDG_DATA_HOME:-$HOME/.local/share}/mcp-dev-bridge/bin/codedb-v0.2.5840"
[ -x "$CODEDB_BIN" ]
"$CODEDB_BIN" --version
printf '%s  %s\n' \
  'f784c931b053031ca9928173828130c504f769c9e94bf5c2666ab71091747966' \
  "$CODEDB_BIN" | sha256sum -c -
```

Expected version: `0.2.5840`; checksum PASS.

Do not re-add CodeDB to product config yet.

- [ ] **Step 2: Create a disposable rooted repository and index it**

Use a normal non-`/tmp` path under bridge-owned external state because CodeDB refuses temporary roots:

```bash
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge"
ROOTED="$STATE/benchmarks/correction/codedb-rooted/fixture-repo"
rm -rf "$ROOTED"
mkdir -p "$ROOTED/src"
git -C "$ROOTED" init -q
printf 'export const marker = "ROOTED_OLD";\n' > "$ROOTED/src/a.ts"
git -C "$ROOTED" add src/a.ts
git -C "$ROOTED" -c user.name=fixture -c user.email=fixture@example.invalid commit -qm init
"$CODEDB_BIN" "$ROOTED" index
```

- [ ] **Step 3: Launch `codedb <repo> mcp` and capture initial status/search**

Use a direct MCP stdio client with environment:

```text
CODEDB_TOOLS_PROFILE=core
CODEDB_MCP_LEAN=1
CODEDB_NO_TELEMETRY=1
```

The stdio command must be:

```text
$CODEDB_BIN $ROOTED mcp
```

Call `codedb_status` with `{}` and `codedb_search` for `ROOTED_OLD` with no `project` field. Save raw MCP results externally.

- [ ] **Step 4: Test watcher freshness for edit and new file without `codedb_read`**

While the same rooted MCP process is alive:

```bash
printf 'export const marker = "ROOTED_EDIT_NEW";\n' > "$ROOTED/src/a.ts"
printf 'export const created = "ROOTED_CREATE_NEW";\n' > "$ROOTED/src/b.ts"
```

Poll `codedb_status` and JSON-mode `codedb_search` for up to 10 seconds, at no faster than 250 ms intervals.

Pass requires:

```text
status seq advances
files rises from 1 to 2
ROOTED_EDIT_NEW count > 0
ROOTED_OLD count == 0
ROOTED_CREATE_NEW count > 0
no explicit codedb_read used to refresh
```

- [ ] **Step 5: Repeat freshness with a Pi-produced edit**

Use `dev.edit` against a disposable file inside a repository rooted beneath the configured workspace, or use the representative real repository with a hash-guarded reversible marker edit.

The sequence is:

```text
rooted CodeDB status seq=N
dev.edit changes a unique marker
poll rooted codedb_search/status
new marker searchable and seq>N
restore exact bytes with guarded dev.edit
restored/original content searchable again
```

Do not use per-call `project` during this test.

- [ ] **Step 6: Run the alternate-project mode only as a separate adapter diagnostic**

Launch CodeDB rooted at a different neutral normal directory, then query the indexed fixture using `project=<fixture-root>`.

Record whether that alternate-project snapshot follows external changes, but label the result:

```text
adapter / alternate-project behavior
```

It must not be used as evidence against rooted watcher correctness.

- [ ] **Step 7: Update the CodeDB benchmark classification**

Replace the old unconditional `CodeDB = REMOVE` headline with the correction result:

```text
Previous verdict: REMOVE
Correction classification: adapter/architecture mismatch
Rooted watcher: PASS | FAIL
Current product verdict: RETEST_REQUIRED pending Task 5 value comparison
```

If rooted freshness fails, classify/reproduce before advancing. If it passes, proceed to Task 5.

- [ ] **Step 8: Commit rooted-freshness evidence**

```bash
git add docs/benchmarks/codedb.md docs/benchmarks/harness-correction.md
git commit -m "docs: requalify rooted CodeDB freshness"
```

---

### Task 5: Compare Pi-Only Development Against Pi + Rooted CodeDB

**Files:**
- Modify: `docs/benchmarks/codedb.md`
- Modify: `docs/benchmarks/harness-correction.md`
- Create external evidence: `${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/correction/codedb-value/`

**Interfaces:**
- Consumes only a CodeDB candidate that passed Task 4 rooted freshness.
- Compares the current four-tool trusted `dev` surface against `dev + CodeDB core` for one representative repository.
- Produces CodeDB verdict `KEEP`, `REMOVE`, or `ROUTER_EXPERIMENT`.

- [ ] **Step 1: Capture comparable schema cost**

Use the same tokenizer and normalization as earlier benchmarks.

Record:

```text
dev only: tool count/schema bytes/schema tokens
dev + rooted CodeDB: tool count/schema bytes/schema tokens
incremental CodeDB schema cost
```

Do not compare CodeDB against the obsolete 15-tool filesystem+shell surface as the final product decision.

- [ ] **Step 2: Re-run the representative repository-orientation task with Pi-only**

Use the same semantic-search tracing task from `docs/benchmarks/codedb.md` or another fixed equivalent if repository HEAD has moved. Pi-only may use `dev.bash` with `rg`, `sed`, `git`, etc., and `dev.read`.

Record exact:

```text
tool calls
request bytes/tokens
model-visible result bytes/tokens
wall time
retries
files/symbols identified
```

- [ ] **Step 3: Run the same task with rooted CodeDB + Pi**

Use rooted CodeDB for orientation/navigation and Pi only where file mutation or a missing primitive requires it.

Ordinary CodeDB calls omit `project`.

Record the same metrics and whether CodeDB reduced broad Shell search/read evidence.

- [ ] **Step 4: Include freshness in the value judgment**

After a disposable Pi edit, perform the final CodeDB re-check without an explicit refresh read. If the rooted watcher does not surface the edit reliably, CodeDB cannot receive `KEEP` regardless of token savings.

- [ ] **Step 5: Decide CodeDB using explicit rules**

Use:

```text
KEEP
  rooted freshness passes
  AND CodeDB materially improves navigation/context enough to justify the extra visible Code domain
  AND one-root deployment semantics are sufficient for the intended deployment

ROUTER_EXPERIMENT
  rooted freshness/value pass
  BUT the multi-repository workspace makes one fixed root insufficient

REMOVE
  rooted freshness fails after classified reproduction
  OR rooted CodeDB adds insufficient value relative to Pi-only
```

Do not build the router in this plan if `ROUTER_EXPERIMENT` wins.

- [ ] **Step 6: Commit the corrected CodeDB value verdict**

```bash
git add docs/benchmarks/codedb.md docs/benchmarks/harness-correction.md
git commit -m "docs: decide rooted CodeDB value"
```

---

### Task 6: Repair the GCF Generic/Graph Verdicts Against Correct Profiles

**Files:**
- Modify: `docs/benchmarks/structured-formats.md`
- Modify: `docs/benchmarks/harness-correction.md`
- Create external evidence: `${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/correction/gcf/`

**Interfaces:**
- Generic arbitrary JSON uses `gcf encode-generic` / `gcf decode-generic`.
- Graph mode uses `gcf encode` / `gcf decode` only for a genuine graph-profile payload.
- Produces `GCF generic = NOT_MATERIAL | PROMISING`.
- Produces `GCF graph = PROMISING | NOT_MATERIAL | INCOMPATIBLE | DEFERRED_NO_GRAPH_PAYLOAD`.

- [ ] **Step 1: Verify the pinned CLI semantics**

Run:

```bash
uvx --from gcf-python==2.6.0 gcf
```

Capture the help lines showing:

```text
encode/decode -> graph profile
encode-generic/decode-generic -> generic profile
```

- [ ] **Step 2: Re-run strict generic round trips on the three existing JSON captures**

For each existing `input.json` under the structured benchmark state:

```bash
uvx --from gcf-python==2.6.0 gcf encode-generic < input.json > output-generic.gcf
uvx --from gcf-python==2.6.0 gcf decode-generic < output-generic.gcf > decoded.json
jq -S . input.json > expected.json
jq -S . decoded.json > actual.json
diff -u expected.json actual.json
```

Expected: exact round trip for context/search/symbol.

Measure bytes/tokens/encode/decode wall time with the same tokenizer and process-start methodology already documented.

- [ ] **Step 3: Correct the generic headline**

The doc must no longer say generic GCF is incompatible. Decide:

```text
PROMISING if faithful generic GCF materially improves the actual model-facing representation we would otherwise send
NOT_MATERIAL if native text remains materially smaller/clearer on the paired workload
```

Current evidence is expected to support `NOT_MATERIAL`, but record the rerun rather than pre-writing the verdict.

- [ ] **Step 4: Search for a genuine graph-shaped model-facing payload**

Inspect rooted CodeDB outputs/captures from Tasks 4-5 plus any current harness result that naturally exposes structured nodes/edges/relationships.

Do not transform native dependency prose into a new graph solely for this benchmark.

- [ ] **Step 5: Either test graph GCF fairly or explicitly defer it**

If a genuine graph payload exists, run:

```bash
uvx --from gcf-python==2.6.0 gcf encode < graph-input.json > output.gcf
uvx --from gcf-python==2.6.0 gcf decode < output.gcf > decoded.json
jq -S . graph-input.json > expected.json
jq -S . decoded.json > actual.json
diff -u expected.json actual.json
```

Then measure tokens/latency and choose `PROMISING`, `NOT_MATERIAL`, or `INCOMPATIBLE` based on fidelity and value.

If no natural graph payload exists, record exactly:

```text
GCF graph = DEFERRED_NO_GRAPH_PAYLOAD
```

and explain that the old arbitrary-JSON graph failure was a benchmark/profile mismatch.

- [ ] **Step 6: Commit corrected GCF evidence**

```bash
git add docs/benchmarks/structured-formats.md docs/benchmarks/harness-correction.md
git commit -m "docs: correct GCF profile verdicts"
```

---

### Task 7: Apply the Corrected Product Decision Without Rewriting Evaluation History

**Files:**
- Modify conditionally: `config/templates/mcp.json`
- Modify conditionally: `scripts/render-config.mjs`
- Modify conditionally: `scripts/setup.sh`
- Modify conditionally: `scripts/smoke-local.sh`
- Modify conditionally: `config/profiles/*.env`
- Modify conditionally: `README.md`
- Modify conditionally: `docs/acceptance.md`
- Modify conditionally: `docs/development.md`
- Modify conditionally: `docs/security.md`
- Modify: `docs/benchmarks/harness-correction.md`
- Modify: `tests/harness.sh`
- Modify: `tests/publication.sh`
- Delete after evaluation: `scripts/render-evaluation-ab.mjs` and remove its evaluation-only assertions from `tests/harness.sh` / `tests/publication.sh`.

**Interfaces:**
- Consumes final independent verdicts from Tasks 3, 5, and 6.
- Produces one reproducible final provider composition from current tracked source.
- Does not create a Git revert of `41491ac`.

- [ ] **Step 1: Write the final decision matrix into the correction report before source changes**

Use exactly:

```text
Pi: CUTOVER_CONFIRMED | REOPEN
CodeDB: KEEP | REMOVE | ROUTER_EXPERIMENT
GCF generic: NOT_MATERIAL | PROMISING
GCF graph: PROMISING | NOT_MATERIAL | INCOMPATIBLE | DEFERRED_NO_GRAPH_PAYLOAD
```

Separate observed evidence, inference, and policy decision.

- [ ] **Step 2A: If Pi is `CUTOVER_CONFIRMED`, preserve the `dev` product composition**

The final Files/trusted-Shell product remains the current Pi-backed `dev` surface. Do not restore generic filesystem or trusted legacy shell to the product template merely because they were A/B incumbents.

Update tests/docs to remove any language that still calls Pi provisional.

- [ ] **Step 2B: If Pi is `REOPEN`, restore the old provider product surface using current lifecycle/state code**

Do not revert `41491ac`. Reconstruct provider source deliberately:

```text
config template:
  filesystem + shell

trusted-dev:
  filesystem + shell with trusted shell profile

restricted:
  filesystem + shell with restricted profile
```

Remove `dev` from the product template, Pi dependency install/smoke requirements, and temporary Pi deployment policy only if no retained component uses them. Keep the Pi benchmark history.

All lifecycle/state/OAuth files remain current HEAD versions.

- [ ] **Step 3A: If CodeDB is `REMOVE`, keep CodeDB absent from product source**

No CodeDB installer/launcher/template entry is restored. Update the benchmark headline to the corrected reason, not the invalid alternate-project watcher reason.

- [ ] **Step 3B: If CodeDB is `ROUTER_EXPERIMENT`, keep CodeDB absent from the live product for now**

Record the rooted CodeDB value win and the unresolved multi-repository routing constraint. Create a future-design pointer only; do not implement the router in this plan.

- [ ] **Step 3C: If CodeDB is `KEEP`, add one explicit rooted CodeDB provider only when single-root semantics are accepted**

Introduce deployment policy:

```text
MCP_CODE_ROOT=<absolute repository root>
```

Create `scripts/install-codedb.sh` with the exact pin/checksum used by the original experiment:

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
curl --http1.1 --fail --location --connect-timeout 15 --max-time 180 "$URL" -o "$tmp"
printf '%s  %s\n' "$CODEDB_SHA256" "$tmp" | sha256sum -c -
chmod 0755 "$tmp"
mv -f "$tmp" "$DEST"
trap - EXIT
"$DEST" --version
```

Create `scripts/codedb-mcp.sh` with rooted semantics:

```bash
#!/usr/bin/env bash
set -euo pipefail
DATA_HOME="${XDG_DATA_HOME:-${HOME:?HOME is required}/.local/share}"
CODEDB_BIN="${CODEDB_BIN:-$DATA_HOME/mcp-dev-bridge/bin/codedb-v0.2.5840}"
: "${MCP_CODE_ROOT:?MCP_CODE_ROOT is required}"
[ -x "$CODEDB_BIN" ] || { echo "CodeDB executable missing: $CODEDB_BIN" >&2; exit 127; }
[ -d "$MCP_CODE_ROOT" ] || { echo "MCP_CODE_ROOT must be an existing directory" >&2; exit 2; }
export CODEDB_TOOLS_PROFILE=core
export CODEDB_MCP_LEAN=1
export CODEDB_NO_TELEMETRY=1
exec "$CODEDB_BIN" "$MCP_CODE_ROOT" mcp
```

Add the provider to `config/templates/mcp.json`:

```json
"codedb": {
  "command": "__REPO_ROOT__/scripts/codedb-mcp.sh",
  "args": [],
  "env": {"MCP_CODE_ROOT": "__CODE_ROOT__"},
  "tags": ["code"]
}
```

Extend `scripts/render-config.mjs` to read `MCP_CODE_ROOT`, require an absolute path when CodeDB is retained, replace `__CODE_ROOT__`, and leave ordinary CodeDB tool calls without `project`. Extend setup/smoke/tests for the exact version/checksum and rooted provider command.

If the deployment requires arbitrary repository switching rather than one explicit root, use `ROUTER_EXPERIMENT` instead of forcing `KEEP`.

- [ ] **Step 4: Remove the temporary A/B renderer from final product source**

Delete `scripts/render-evaluation-ab.mjs` and remove the evaluation-only tests added in Task 1. Product rendering must come from `scripts/render-config.mjs` only. Git history preserves the exact evaluation machinery used for the correction phase.

- [ ] **Step 5: Run the complete source verification gate**

Run fresh:

```bash
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
if [ -d providers/pi-dev ]; then (cd providers/pi-dev && npm test); fi
bash -n bin/* lib/bridge/*.sh scripts/*.sh tests/*.sh
node --check scripts/render-config.mjs
[ ! -e scripts/render-evaluation-ab.mjs ] || node --check scripts/render-evaluation-ab.mjs
[ ! -d providers/pi-dev ] || node --check providers/pi-dev/*.mjs
git diff --check
```

Expected: all selected final-composition assertions pass.

- [ ] **Step 6: Commit the corrected final product decision**

Use one decision-specific message, for example:

```bash
git commit -m "feat: confirm corrected native harness composition"
```

Do not squash away the earlier benchmark/correction commits; they explain why the decision changed or was confirmed.

---

### Task 8: Deploy the Final Composition, Refresh ChatGPT, and Close the Correction Phase

**Files:**
- Modify: `docs/benchmarks/harness-correction.md`
- Modify as needed: `docs/acceptance.md`
- External evidence: `${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/correction/final/`

**Interfaces:**
- Consumes current final `scripts/render-config.mjs` product configuration from Task 7.
- Produces final live provider catalog matching tracked source, `issues: 0`, public health success, and refreshed ChatGPT actions.

- [ ] **Step 1: Capture the temporary A/B state before replacement**

From direct WSL, record non-secret provider names, current HEAD, `bin/status`, and durable OAuth registration/session filenames/counts into the external final evidence directory.

- [ ] **Step 2: Replace A/B with the final product render from current HEAD using external control**

From direct WSL/systemd, not from MCP:

```bash
set -euo pipefail
export HOME="$(getent passwd "$(id -u)" | cut -d: -f6)"
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
WORKTREE=/home/hamza/repo/satori_bridge/.worktrees/native-wsl-pi-codedb-harness
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge"

systemctl --user stop mcp-dev-bridge.service
node "$WORKTREE/scripts/render-config.mjs" \
  --profile trusted-dev \
  --env-file "$STATE/bridge.env" \
  --state-dir "$STATE" \
  --repo-root "$WORKTREE"
systemctl --user start mcp-dev-bridge.service
"$WORKTREE/bin/status"
```

If final `KEEP` CodeDB requires a new explicit deployment variable, ensure `MCP_CODE_ROOT` is present in the deployment env before rendering.

- [ ] **Step 3: Verify final provider composition and public health**

Run:

```bash
node -e 'const fs=require("fs"); const c=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); console.log(Object.keys(c.mcpServers||{}).sort().join("\n"));' \
  "$STATE/1mcp/mcp.json"
curl -fsS --max-time 10 https://mcp.hamza.my.id/health/ready
"$WORKTREE/bin/status"
```

Expected provider names must exactly match the Task 7 verdict branch; expected status is `issues: 0`.

- [ ] **Step 4: Refresh ChatGPT Actions and run a harmless final smoke call**

Perform:

```text
Workspace/plugin -> Actions -> Refresh
start a fresh session
```

Verify removed evaluation incumbents are absent and retained providers are present. Run one harmless retained tool call through ChatGPT.

- [ ] **Step 5: Finish the correction report**

Finish every correction-report section with observed results from the completed tasks. Include:

```text
final Git commit
final live providers
Pi verdict
CodeDB verdict
GCF generic verdict
GCF graph verdict
A/B restoration method
OAuth continuity outcome
final ChatGPT refresh outcome
remaining deferred work (router only if ROUTER_EXPERIMENT)
```

- [ ] **Step 6: Final verification and closeout commit**

Run:

```bash
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
if [ -d providers/pi-dev ]; then (cd providers/pi-dev && npm test); fi
git diff --check
git status --short
```

Then commit only the final evidence/doc updates:

```bash
git add docs/benchmarks/harness-correction.md docs/acceptance.md
git commit -m "docs: close harness correction phase"
```

Expected final state: clean worktree, final live provider composition reproducible from tracked source/current external deployment config, healthy bridge, and refreshed ChatGPT catalog.
