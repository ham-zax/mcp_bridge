# Personal WSL Codex-Like Harness Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the private WSL bridge into a durable Codex-like local coding harness: unrestricted file and Bash access as user `hamza`, Codex-style patching, a rich native CLI toolbox, persistent tmux-backed terminal sessions with human takeover, a small multi-repository Code intelligence facade, and evidence-gated output/context optimizations.

**Architecture:** Keep Cloudflare + OAuth + 1MCP as transport. Files/Shell live in the Pi-backed private `dev` provider with Linux-user authority and `/home/hamza` as the stable default directory. Terminal is a separate provider over a thin Unix-socket broker and a dedicated tmux lifetime authority; Herdr v0.8.0 was benchmarked and rejected as the production backend/hybrid because it did not preserve our process-lifetime or transcript semantics. Code is a separate private provider exposing the qualified three-action facade over one correctly rooted CodeDB child per active repository. Public-release profiles remain isolated from all private-only capability.

**Tech Stack:** Node.js >= 22.19, `@modelcontextprotocol/sdk` 1.30.0, `@earendil-works/pi-coding-agent` 0.84.1, Bash, tmux >= 3.4, user systemd, Git, CodeDB 0.2.5840 for rooted repository intelligence, ast-grep 0.45.0 for the CLI toolbox, and optional explicit `rtk test`/`rtk err` invocations through native Bash. Herdr v0.8.0 and RTK 0.43/0.45 remain benchmark evidence, not production harness dependencies.

## Global Constraints

- The public-release/export project and the personal harness are independent. Do not make personal-harness execution depend on the public export finishing; coordinate only when both projects would mutate the same private files.
- `satori_bridge` is the current private engineering/personal harness source, but implementation must not depend on that repository name because the private repository may be renamed later. The public export remains a separate product and independently releasable.
- Private `personal` mode is intentionally unrestricted inside WSL as Linux user `hamza`; the effective authority boundary is the permissions of that user account.
- `sudo` may be invoked explicitly through Bash or Terminal, but the harness must never store, infer, log, transmit, or auto-fill a sudo password.
- Stable default directory for private mode is `/home/hamza`. There is no hidden mutable global `cd` state.
- Absolute paths are accepted in private mode. Relative paths resolve from `/home/hamza` unless an operation has an explicit `cwd`.
- Public `restricted`/`trusted-dev` semantics remain unchanged by private-only work unless a later public project explicitly promotes a proven feature.
- MCP JSON is transport. Model-facing source, diffs, terminal output, diagnostics, and command results remain native `TextContent` by default.
- Do not expose every useful CLI as a new MCP action.
- Terminal PTYs must survive ChatGPT disconnects, Cloudflare reconnects, 1MCP restarts, MCP-provider restarts, and terminal-broker restarts. They are allowed to die when the WSL instance itself stops.
- Terminal human attachment is single-writer: human attachment blocks model input/resize/ordinary close but does not block model observation.
- Terminal output is incremental and bounded; old output may rotate, but cursor semantics must never silently return the wrong bytes.
- The tmux/broker implementation is the selected Terminal backend. Herdr v0.8.0 was benchmarked as a challenger and the final verdict is `TMUX_BROKER_WINS`; Herdr and the Herdr/tmux hybrid are rejected as production Terminal backends with retained evidence.
- Herdr's coding-agent lifecycle detection/wait model remains reference evidence for Task 8 only. Do not add Herdr as a runtime dependency merely to reuse that concept.
- Before Task 7 integration, retained dead `remain-on-exit` panes must reconcile without aborting broker startup; the focused fix is Task 6.6.
- `apply_patch` does not replace `edit` or `write` until its own correctness/ergonomics benchmark produces an explicit `PATCH_WINS`, `BOTH_EARN_PLACE`, or `EDIT_WINS` verdict.
- The Code domain must never return to exposing CodeDB's entire 10-tool catalog directly without an explicit later decision.
- `await` semantics are designed only after Terminal is live and measured.
- Native Bash remains the sole harness execution path. Automatic/selective RTK integration is rejected with evidence. `rtk test` and `rtk err` may be invoked explicitly through Bash as optional local helpers, with native/full output as recovery; no RTK classifier, MCP action, schema field, or hook belongs in the harness.
- The stronger-consistency trigger has fired: repeated real same-file `apply_patch`/`edit` races produced silent lost updates. The approved next step is focused provider-internal canonical-path mutation serialization; model-visible hash fields remain unapproved until that atomic enforcement is proven and real stale-read workflows still justify them.
- GCF/TOON remain evidence-triggered for genuinely structured bulk payloads; they are not mandatory Phase-2 implementation work and are not applied to source, patches, normal terminal output, or active diagnostics unless a new real payload class triggers a focused benchmark.
- One designated integrator owns staging and commits during shared-tree work.

---

## Current Implementation Status — 2026-08-15

The task prose below remains executable/reproducible history, but this table is the authoritative current frontier.

| Area | Status | Evidence / integration state |
|---|---|---|
| Tasks 1-3 — baseline, personal profile, unrestricted Files/Bash | **COMPLETE + INTEGRATED** | Wave integration lineage through `2f5baae` |
| Task 4 — `apply_patch` | **COMPLETE + INTEGRATED** | `BOTH_EARN_PLACE`; integrated at `2f5baae` |
| Task 5 — CLI toolbox | **COMPLETE + INTEGRATED** | portable contract wired into harness |
| Task 6 — durable tmux/broker | **COMPLETE + INTEGRATED** | broker/tmux lifetime separation proven |
| Task 6.5 — Herdr challenger | **COMPLETE** | `TMUX_BROKER_WINS`; benchmark source `792e9b5`; integrated evidence `cf11ef6` |
| Task 6.6 — retained dead-pane reconciliation | **COMPLETE** | source `3ade00f`; integrated fix `44000c6`; mixed live/dead double-restart test passes |
| Task 7 — Terminal MCP + human takeover | **NEXT TERMINAL CRITICAL PATH** | unblocked after Task 6.6 integration |
| Task 8 — await/resume | **PENDING TASK-7 PRODUCT EVIDENCE** | Herdr answer `PARTIALLY`; generic conditions still require focused design |
| Task 9 — rooted multi-repo CodeDB router | **COMPLETE** | source `d010aaf`; integrated `46fcb48` |
| Task 10 — small Code facade | **COMPLETE** | `CODE_SMALL_EXPLICIT_FACADE`; source `fa46650`; integrated `a04cf41` |
| Task 11 — RTK | **COMPLETE / NO HARNESS INTEGRATION** | RTK 0.45 verdict: explicit helper only; evidence integrated through `aac4f3f` |
| Task 12 — concurrency/CAS trigger | **COMPLETE; TRIGGER FIRED** | source `c01e52b`; integrated `61ae4af`; focused design created |
| Task 12.5 — atomic same-path mutation enforcement | **NEXT FILES HARDENING TASK** | required before final acceptance; no model-visible hash field yet |
| Task 13 — structured-format trigger audit | **PENDING** | default expectation remains `FORMAT_TRIGGER_NOT_FIRED` |
| Task 14 — final consolidation/live acceptance | **PENDING** | follows Terminal, await decision, Task 12.5, and format audit |

Current assembled integration branch:

```text
feat/personal-harness-wave1-integration
head after current evidence integration: ed67415
```

The source task branches remain intact for provenance. Do not squash them yet; squash/rewrite history only at the final merge boundary after the remaining production surfaces pass live acceptance.

---

## Target Model-Facing Surface

The plan is allowed to change the exact final count based on benchmark gates, but the intended mental model is:

```text
FILES / SHELL
  read
  edit            # guarded simple exact replacement
  apply_patch     # retained for multi-file / structural mutation
  write           # create-oriented
  bash            # always native Bash; RTK is never an automatic layer

TERMINAL
  terminal_open
  terminal_read
  terminal_send
  terminal_resize
  terminal_list
  terminal_close
  # wait/resume actions exist only if Task 8's focused sub-spec qualifies them

CODE
  code_search
  code_context
  code_symbol
```

Qualified decisions already frozen:

```text
apply_patch verdict     BOTH_EARN_PLACE
Code facade verdict     CODE_SMALL_EXPLICIT_FACADE
Terminal backend        TMUX_BROKER_WINS
RTK harness integration REJECTED_WITH_EVIDENCE
```

The goal is not "four actions forever." The goal is four obvious capability domains with native representations and the smallest practical schemas.

---

## File Structure

### Existing private Dev provider

- Modify: `providers/pi-dev/server.mjs` — private path mode, optional `apply_patch`, final personal tool registration.
- Modify: `providers/pi-dev/boundary.mjs` — add unrestricted-user path resolution without weakening public workspace confinement.
- Modify: `providers/pi-dev/files.mjs` — route public/private path policies and retain strict-edit/create semantics.
- Modify: `providers/pi-dev/shell.mjs` — private absolute/relative cwd semantics; native Bash remains the only harness execution policy.
- Modify: `providers/pi-dev/render.mjs` — native Bash/edit/patch rendering; no RTK-specific production rendering.
- Create: `providers/pi-dev/patch.mjs` — Codex-style patch parser/preflight/apply engine.
- Create: `providers/pi-dev/test/patch.test.mjs`.
- Modify: existing Pi tests under `providers/pi-dev/test/`.

### Private profile/rendering

- Create: `config/profiles/personal.env`.
- Create: `config/templates/mcp-personal.json`.
- Modify: `scripts/render-config.mjs` — accept/select private `personal` profile while preserving public templates.
- Modify: `scripts/smoke-local.sh` — validate personal provider composition separately from public profiles.
- Modify: `tests/harness.sh` and `tests/publication.sh` — prove private-only files never enter the public export.

### CLI toolbox

- Create: `scripts/check-personal-toolbox.sh`.
- Create: `scripts/setup-personal-toolbox.sh`.
- Create: `docs/personal/toolbox.md`.

### Persistent Terminal

- Create: `providers/terminal/package.json` and lockfile.
- Create: `providers/terminal/protocol.mjs` — internal Unix-socket request/response schema.
- Create: `providers/terminal/tmux.mjs` — dedicated tmux-server operations.
- Create: `providers/terminal/transcript.mjs` — transcript/cursor/rotation behavior.
- Create: `providers/terminal/broker.mjs` — long-lived local broker.
- Create: `providers/terminal/broker-client.mjs` — MCP/CLI client.
- Create: `providers/terminal/mcp-server.mjs` — six model-facing Terminal actions.
- Create: `providers/terminal/cli.mjs` and `bin/wsl-term` — human list/attach interface.
- Create: `providers/terminal/test/*.test.mjs`.
- Create: `systemd/wsl-agent-tmux.service.in` — dedicated tmux lifetime authority.
- Create: `systemd/wsl-agent-terminal-broker.service.in` — broker only; restarting it must not stop tmux/PTYs.
- Create: `scripts/install-terminal-broker-user.sh`.
- Modify: `systemd/mcp-dev-bridge.service.in` only for ordering/wants; bridge restarts must never own Terminal PTY lifetime.

### Herdr challenger experiment

- Create: `experiments/herdr/` — disposable scripts/adapters only; never production provider code during the benchmark.
- Create: `docs/benchmarks/herdr-terminal-comparison.md` — same-workload comparison of tmux/broker, Herdr, and a possible hybrid.
- Pin: Herdr `v0.8.0` for the experiment; record the exact Linux artifact/digest actually used.

### Await/resume

- Create a focused `docs/superpowers/specs/YYYY-MM-DD-terminal-await-design.md` only after real Terminal product-path evidence and the Herdr challenger verdict exist.
- Modify Terminal or create a generic condition/wait provider only if that focused sub-spec is approved; do not freeze `terminal_wait` in advance.

### Code router

- Create: `providers/code-router/package.json` and lockfile.
- Create: `providers/code-router/repo-root.mjs`.
- Create: `providers/code-router/codedb-child.mjs`.
- Create: `providers/code-router/pool.mjs`.
- Create: `providers/code-router/server.mjs`.
- Create: `providers/code-router/test/*.test.mjs`.
- Create: `docs/benchmarks/code-router.md`.

### Evidence/consolidation

- Create: `docs/benchmarks/personal-harness-phase-2.md`.
- Modify: `docs/architecture.md` only after each subsystem is proven.
- Modify: private operations/config docs as provider composition becomes final.

---

### Task 1: Freeze the Current Private Baseline and Carry-Forward Ledger

**Files:**
- Read: current `config/templates/mcp.json`, profiles, renderer, Pi provider, lifecycle tests.
- Create: `docs/benchmarks/personal-harness-phase-2.md`.

**Interfaces:**
- Consumes: the current private `main` baseline, regardless of whether public-export work is complete.
- Produces: a recorded private baseline commit, live provider catalog, schema/token counts, tool versions, service health, and explicit carry-forward ledger before Phase 2 mutations.

- [ ] **Step 1: Capture Git/runtime baseline**

Run:

```bash
git status --short --branch
git log -8 --oneline
node --version
tmux -V
git --version
rg --version
jq --version
sg --version || true
fd --version || true
bat --version || true
pnpm --version
```

If public-release work is simultaneously active, record that fact and coordinate file ownership. Do not block Phase 2 merely because the independent public export is unfinished.

- [ ] **Step 2: Capture the current private harness baseline**

Record in `docs/benchmarks/personal-harness-phase-2.md`:

```markdown
## Baseline

- Private HEAD: `<actual git rev-parse HEAD>`
- Live profile: `<actual rendered profile>`
- Live providers: `<actual tools/list provider names>`
- Pi tools: `<actual names>`
- Bridge health: `<actual bin/status summary>`
- tmux: `<actual version>`
- advertised tool count: `<actual>`
- tools/list schema bytes: `<actual>`
- estimated o200k_base schema tokens: `<actual>`
```

Also record representative request bytes/tokens for `read`, `edit`, `write`, and `bash`. Use actual measured values; do not copy expected counts from this plan.

- [ ] **Step 3: Verify the proven primitive behavior**

Using disposable files/processes, prove:

```text
ranged read
exact unique edit
ambiguous/missing edit rejection
create-only write
existing-file write rejection
native Bash pipe
non-zero exit annotation
timeout descendant termination
large-output truncation + recoverable full-output path
valid UTF-8 bounded tail
```

- [ ] **Step 4: Record the carry-forward ledger**

Seed the benchmark document with every later capability in one explicit state:

```text
Pi read/edit/write/bash foundation      IMPLEMENTED
personal user-boundary migration        IMPLEMENT_THIS_PHASE
apply_patch                             EXPERIMENT_THIS_PHASE
CLI toolbox                             IMPLEMENT_THIS_PHASE
persistent Terminal                     IMPLEMENT_THIS_PHASE
human PTY attach                        IMPLEMENT_THIS_PHASE
await/resume                            DEFERRED_PENDING_TERMINAL_EVIDENCE
CodeDB multi-repo router                EXPERIMENT_THIS_PHASE
Code facade                             EXPERIMENT_THIS_PHASE
RTK                                     EXPERIMENT_THIS_PHASE
stronger CAS/hash                       DEFERRED_WITH_TRIGGER
TOON                                    REJECTED_WITH_EVIDENCE
GCF generic                             DEFERRED_WITH_TRIGGER
GCF graph                               DEFERRED_WITH_TRIGGER
Windows-host control                    OUT_OF_SCOPE
```

- [ ] **Step 5: Run the existing full baseline**

```bash
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
(cd providers/pi-dev && npm test)
bash -n bin/* lib/bridge/*.sh scripts/*.sh tests/*.sh
node --check scripts/render-config.mjs providers/pi-dev/*.mjs
git diff --check
```

Expected: all current suites pass before Phase 2 changes.

- [ ] **Step 6: Commit the baseline evidence**

```bash
git add docs/benchmarks/personal-harness-phase-2.md
git commit -m "docs: record personal harness phase 2 baseline"
```

---

### Task 2: Add a Private `personal` Profile Without Weakening Public Profiles

**Files:**
- Create: `config/profiles/personal.env`
- Create: `config/templates/mcp-personal.json`
- Modify: `scripts/render-config.mjs`
- Modify: `tests/harness.sh`
- Modify: `tests/publication.sh`
- Modify: `scripts/smoke-local.sh`

**Interfaces:**
- Consumes: public `restricted`/`trusted-dev` rendering.
- Produces: private profile `personal`, default cwd `/home/hamza`, and private-only provider composition.

- [ ] **Step 1: Add failing profile-separation tests**

Add assertions equivalent to:

```js
const personal = await renderFixture('personal');
if (personal.profile !== 'personal') process.exit(1);
if (personal.mcpServers.dev.env.MCP_DEV_PATH_MODE !== 'user') process.exit(1);
if (personal.mcpServers.dev.env.MCP_DEV_DEFAULT_CWD !== '/home/hamza') process.exit(1);
```

Add a public-export assertion that these paths are absent from the public allowlist/export:

```text
config/profiles/personal.env
config/templates/mcp-personal.json
providers/terminal/
providers/code-router/
bin/wsl-term
```

- [ ] **Step 2: Run tests and observe RED**

```bash
bash tests/harness.sh
bash tests/publication.sh
```

Expected: personal profile is unknown and private-only export assertions fail until implementation exists.

- [ ] **Step 3: Create the personal profile**

`config/profiles/personal.env`:

```dotenv
MCP_SHELL_MODE=unrestricted
MCP_DEV_PATH_MODE=user
MCP_DEV_DEFAULT_CWD=/home/hamza
```

- [ ] **Step 4: Create a private template**

Start `config/templates/mcp-personal.json` with one Pi-backed `dev` provider and explicit private env:

```json
{
  "$schema": "https://docs.1mcp.app/schemas/v1.0.0/mcp-config.json",
  "version": "1.0.0",
  "mcpServers": {
    "dev": {
      "command": "node",
      "args": ["__REPO_ROOT__/providers/pi-dev/server.mjs"],
      "env": {
        "MCP_DEV_SHELL_MODE": "unrestricted",
        "MCP_DEV_PATH_MODE": "user",
        "MCP_DEV_DEFAULT_CWD": "/home/hamza",
        "MCP_DEV_STATE_DIR": "__DEV_STATE_DIR__",
        "MCP_DEV_MAX_OUTPUT_BYTES": "__DEV_MAX_OUTPUT_BYTES__"
      },
      "tags": ["dev"]
    }
  }
}
```

- [ ] **Step 5: Extend the renderer**

Use `personal` as a third profile and select `mcp-personal.json` only for that profile. Public profiles continue selecting the public template.

```js
const allowedProfiles = ['restricted', 'trusted-dev', 'personal'];
const templateName = profile === 'personal' ? 'mcp-personal.json' : 'mcp.json';
```

Persist `MCP_BRIDGE_PROFILE=personal` in `bridge.env` exactly like existing profiles.

- [ ] **Step 6: Make smoke validation profile-aware**

For `personal`, require `dev` and private path mode. Do not yet require `terminal` or `code`; those arrive in later tasks.

- [ ] **Step 7: Run GREEN tests and commit**

```bash
bash tests/harness.sh
bash tests/publication.sh
node --check scripts/render-config.mjs
git diff --check
git add config/profiles/personal.env config/templates/mcp-personal.json scripts/render-config.mjs scripts/smoke-local.sh tests/harness.sh tests/publication.sh
git commit -m "feat: add private personal harness profile"
```

---

### Task 3: Make Private Files/Bash Unrestricted Inside WSL User Authority

**Files:**
- Modify: `providers/pi-dev/boundary.mjs`
- Modify: `providers/pi-dev/files.mjs`
- Modify: `providers/pi-dev/shell.mjs`
- Modify: `providers/pi-dev/server.mjs`
- Modify: `providers/pi-dev/test/boundary.test.mjs`
- Modify: `providers/pi-dev/test/files.test.mjs`
- Modify: `providers/pi-dev/test/shell.test.mjs`
- Modify: `providers/pi-dev/test/server.test.mjs`

**Interfaces:**
- Consumes: `MCP_DEV_PATH_MODE=workspace|user` and `MCP_DEV_DEFAULT_CWD`.
- Produces: public confinement unchanged; private mode accepts absolute paths and relative paths rooted at `/home/hamza`.

- [ ] **Step 1: Add failing private-path tests**

Add tests for:

```js
await resolveUserPath('/home/hamza', '.gitconfig');
await resolveUserPath('/home/hamza', '/etc/os-release');
await resolveUserCwd('/home/hamza', '/tmp');
await resolveUserCwd('/home/hamza', 'repo');
```

Retain all existing workspace-confinement tests and assert they still reject absolute/outside paths in public workspace mode.

- [ ] **Step 2: Observe RED**

```bash
(cd providers/pi-dev && node --test test/boundary.test.mjs test/files.test.mjs test/shell.test.mjs)
```

Expected: user-mode resolver/functions do not yet exist.

- [ ] **Step 3: Add user-mode resolvers without deleting workspace resolvers**

In `boundary.mjs`, implement:

```js
export async function canonicalDefaultCwd(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new Error('MCP_DEV_DEFAULT_CWD must be an absolute path');
  }
  const real = await fs.realpath(value);
  const stat = await fs.stat(real);
  if (!stat.isDirectory()) throw new Error('MCP_DEV_DEFAULT_CWD must be a directory');
  return real;
}

export async function resolveUserPath(defaultCwd, value, { mustExist = true } = {}) {
  if (typeof value !== 'string' || value.length === 0) throw new Error('path must be non-empty');
  if (value.includes('\0')) throw new Error('path contains a NUL byte');
  requirePiStablePath(value, 'path');
  const candidate = path.isAbsolute(value) ? value : path.resolve(defaultCwd, value);
  if (!mustExist) return candidate;
  return fs.realpath(candidate);
}

export async function resolveUserCwd(defaultCwd, value) {
  const candidate = value === undefined || value === ''
    ? defaultCwd
    : (path.isAbsolute(value) ? value : path.resolve(defaultCwd, value));
  const real = await fs.realpath(candidate);
  const stat = await fs.stat(real);
  if (!stat.isDirectory()) throw new Error('cwd must resolve to a directory');
  return real;
}
```

Keep the Pi Unicode-space fail-closed rule unless Pi's path backend is replaced.

- [ ] **Step 4: Route Files by path mode**

`runRead`, `runEdit`, and `runWrite` accept `{ pathMode, defaultCwd, workspaceRoot }`. In `workspace` mode, preserve the current confined resolvers. In `user` mode, resolve absolute or relative paths without containment checks while retaining exact-edit/snapshot/create-only behavior.

- [ ] **Step 5: Route Bash cwd by path mode**

In user mode:

```text
bash(command="git status")                  -> cwd /home/hamza
bash(command="git status", cwd="repo/x") -> /home/hamza/repo/x
bash(command="pwd", cwd="/tmp")          -> /tmp
```

Do not add mutable shell-global cwd state.

- [ ] **Step 6: Update server startup and schemas**

Validate:

```text
MCP_DEV_PATH_MODE=workspace -> require MCP_DEV_WORKSPACE_ROOT
MCP_DEV_PATH_MODE=user      -> require MCP_DEV_DEFAULT_CWD
```

In personal mode, path descriptions say that relative paths resolve from the configured default and absolute paths are accepted.

- [ ] **Step 7: Add real-access acceptance tests**

Use harmless read-only targets:

```text
/etc/os-release
/home/hamza/.gitconfig   # only if present in fixture/live acceptance
/tmp                     # Bash cwd
```

Do not test secrets or credential contents.

- [ ] **Step 8: Run provider suite and commit**

```bash
(cd providers/pi-dev && npm test)
node --check providers/pi-dev/*.mjs
git diff --check
git add providers/pi-dev
git commit -m "feat: add unrestricted personal WSL path mode"
```

---

### Task 4: Build and Benchmark Codex-Style `apply_patch`

**Files:**
- Create: `providers/pi-dev/patch.mjs`
- Create: `providers/pi-dev/test/patch.test.mjs`
- Modify: `providers/pi-dev/server.mjs`
- Modify: `providers/pi-dev/render.mjs`
- Modify: `docs/benchmarks/personal-harness-phase-2.md`

**Interfaces:**
- Consumes: private path resolver and current exact-edit/create-only semantics.
- Produces: experimental `apply_patch(patch, cwd?)` in personal mode; verdict `PATCH_WINS`, `BOTH_EARN_PLACE`, or `EDIT_WINS`.

- [ ] **Step 1: Add parser/preflight RED tests**

Cover this exact grammar:

```text
*** Begin Patch
*** Update File: relative/or/absolute/path
@@
-old
+new
*** Add File: path
+new file contents
*** Delete File: path
*** End Patch
```

Also cover `*** Move to: new/path` on an Update block.

Tests must prove:

```text
invalid header rejected
missing End Patch rejected
update context mismatch rejected
ambiguous update rejected
add refuses existing path
delete requires existing file
move refuses existing destination
all blocks are preflighted before any mutation starts
```

- [ ] **Step 2: Observe RED**

```bash
(cd providers/pi-dev && node --test test/patch.test.mjs)
```

Expected: module/tool absent.

- [ ] **Step 3: Implement parser and pure in-memory patch application**

Expose internal functions:

```js
export function parsePatch(text) { /* returns validated file operations */ }
export function applyUpdateHunks(originalText, hunks) { /* returns new text */ }
```

Update hunks use exact context; no fuzzy matching.

- [ ] **Step 4: Implement full preflight before writes**

For every file operation, resolve its path, read/snapshot current bytes, and compute final bytes before mutating any path. Abort the entire patch on any invalid block or stale precondition.

For execution:

```text
Add    -> exclusive create (`wx`)
Update -> snapshot compare immediately before write
Delete -> snapshot compare immediately before unlink
Move   -> destination must not exist; source snapshot must still match
```

Do not claim multi-file kernel-atomicity; report a conflict if an external writer changes a file during application.

- [ ] **Step 5: Register personal-only `apply_patch`**

Schema:

```js
inputSchema: {
  patch: z.string().min(1),
  cwd: z.string().min(1).optional()
}
```

`cwd` follows the personal explicit/stable cwd model and defaults to `/home/hamza`; absolute patch paths remain allowed in personal mode.

Result should not duplicate the full patch. Return one useful native diff/summary or concise diagnostic; do not emit `structuredContent`.

- [ ] **Step 6: Run the patch-vs-edit benchmark**

Use at least 20 representative mutations:

```text
single-line change
multi-hunk same-file change
three-file change
new file + existing file update
move + update
conflict after read
ambiguous context failure
```

Record:

```text
schema tokens
request tokens
model-visible result tokens
tool-call count
correctness
conflict behavior
multi-file success rate
```

Decision:

```text
PATCH_WINS
  -> patch is clearly better as the primary modification primitive without lower correctness

BOTH_EARN_PLACE
  -> patch materially wins multi-file/structural work while edit remains clearly better for simple guarded replacements

EDIT_WINS
  -> patch does not justify its extra visible schema/behavior
```

- [ ] **Step 7: Apply the verdict conservatively**

If `PATCH_WINS`, keep `edit` available until final real-product acceptance and retire it only during Task 14 consolidation. If `BOTH_EARN_PLACE`, retain both with clearly distinct descriptions. If `EDIT_WINS`, remove the experimental model-facing `apply_patch` after recording the evidence. `write` remains independently create-only.

- [ ] **Step 8: Commit**

```bash
(cd providers/pi-dev && npm test)
git add providers/pi-dev docs/benchmarks/personal-harness-phase-2.md
git commit -m "feat: add Codex-style patch experiment"
```

---

### Task 5: Establish the Personal Linux CLI Toolbox

**Files:**
- Create: `scripts/check-personal-toolbox.sh`
- Create: `scripts/setup-personal-toolbox.sh`
- Create: `docs/personal/toolbox.md`
- Modify: `tests/harness.sh`

**Interfaces:**
- Consumes: unrestricted `dev.bash`.
- Produces: predictable local CLI capabilities with zero new MCP schemas.

- [ ] **Step 1: Add a failing toolbox contract**

The checker must verify at minimum:

```text
git
rg
jq
fd
bat
tmux
node
npm
corepack
python3
uv
ast-grep
```

Use executable/version probes rather than path assumptions.

- [ ] **Step 2: Verify current failure is specifically ast-grep naming/availability**

Run:

```bash
bash scripts/check-personal-toolbox.sh
```

Expected before setup: fail if the real ast-grep CLI is unavailable; `/usr/bin/sg` from the Linux `shadow` package must not be mistaken for ast-grep.

- [ ] **Step 3: Implement explicit ast-grep installation**

Pin ast-grep CLI `0.45.0` and install it through its official package path. The setup script must verify:

```bash
ast-grep --version
```

or the official binary name that reports `0.45.0`; never accept `/usr/bin/sg` merely because it exists.

- [ ] **Step 4: Make the rest of the toolbox non-destructive**

For tools already present, report versions and leave them untouched. Do not globally upgrade Node, Git, Python, or systemd as part of this phase.

- [ ] **Step 5: Document native usage patterns**

`docs/personal/toolbox.md` includes examples such as:

```bash
rg 'foo' repo/
ast-grep run -p '$A == $B' -l ts repo/
jq -r '.name' package.json
fd package.json /home/hamza/repo
journalctl --user -u mcp-dev-bridge.service -n 100
```

- [ ] **Step 6: Run acceptance and commit**

```bash
bash scripts/check-personal-toolbox.sh
bash tests/harness.sh
git diff --check
git add scripts/check-personal-toolbox.sh scripts/setup-personal-toolbox.sh docs/personal/toolbox.md tests/harness.sh
git commit -m "feat: establish personal WSL CLI toolbox"
```

---

### Task 6: Implement the Durable tmux Terminal Broker Core

**Files:**
- Create: `providers/terminal/package.json`
- Create: `providers/terminal/protocol.mjs`
- Create: `providers/terminal/tmux.mjs`
- Create: `providers/terminal/transcript.mjs`
- Create: `providers/terminal/broker.mjs`
- Create: `providers/terminal/test/broker.test.mjs`
- Create: `providers/terminal/test/transcript.test.mjs`
- Create: `systemd/wsl-agent-tmux.service.in`
- Create: `systemd/wsl-agent-terminal-broker.service.in`
- Create: `scripts/install-terminal-broker-user.sh`
- Create: `docs/benchmarks/terminal-preflight.md`

**Interfaces:**
- Consumes: local tmux >= 3.4.
- Produces: Unix socket `$XDG_RUNTIME_DIR/wsl-agent-terminal.sock`, dedicated tmux server `tmux -L wsl-agent`, state root `$XDG_STATE_HOME/wsl-agent-terminal`, and durable named PTYs.

- [ ] **Step 1: Write failing broker lifecycle tests**

Use a temporary tmux socket/state directory. Prove the intended durability boundary:

```text
open named session
process produces output
kill broker process
PTY/process still exists in tmux
restart broker
same session is discoverable
WSL/tmux-server stop ends the process
```

- [ ] **Step 2: Write failing transcript/cursor tests**

Test monotonically increasing byte offsets, rotation, UTF-8-safe reads, and stale cursor handling:

```text
read cursor 0 -> output + next cursor
read next cursor -> only new output
rotate old bytes -> stale cursor yields CURSOR_EXPIRED + bounded recovery tail
```

- [ ] **Step 3: Define the private broker protocol**

`protocol.mjs` uses newline-delimited JSON only on the local Unix socket. It is not model-facing. Initial operations:

```text
session.open
session.list
session.read
session.send
session.resize
session.close
lease.acquire_human
lease.release_human
```

- [ ] **Step 4: Implement dedicated tmux operations**

Always invoke:

```text
tmux -L wsl-agent ...
```

For new sessions:

```text
new-session -d -s <name> -c <cwd> <command-or-shell>
set-option -t <name> remain-on-exit on
pipe-pane -o -t <name>:0.0 <append-transcript-command>
```

Session names must match:

```regex
^[A-Za-z0-9._-]{1,64}$
```

- [ ] **Step 5: Implement transcript retention**

Use bridge-owned files with mode `0600` beneath a `0700` state root. Default transcript budget per session: 16 MiB. Rotation preserves logical cursor generation; it must never silently reinterpret an old cursor as a new offset.

- [ ] **Step 6: Implement broker recovery**

On broker start, enumerate only the dedicated `wsl-agent` tmux server and reconcile session metadata from tmux. Do not kill unknown/manual tmux servers.

- [ ] **Step 7: Install tmux lifetime and broker as separate user services**

Use two independent units:

```text
wsl-agent-tmux.service
wsl-agent-terminal-broker.service
```

Required topology:

```text
systemd --user
  |
  +-- wsl-agent-tmux.service
  |      |
  |      +-- tmux -L wsl-agent server
  |             +-- PTY children
  |             +-- pipe-pane transcript writers
  |
  +-- wsl-agent-terminal-broker.service
         +-- broker only
```

The broker unit may require/order after the tmux unit, but restarting the broker must not restart or stop the tmux lifetime unit. New pane processes must be forked by the already-running tmux server, not by the broker service. Do not use `KillMode=process` as a workaround for mixed ownership in one cgroup.

- [ ] **Step 8: Add the production systemd durability gate**

Through the actual user-systemd topology:

```text
start both units
open a long-lived terminal session
record tmux server PID
record PTY child PID
record broker PID
restart only wsl-agent-terminal-broker.service
```

Then prove:

```text
broker PID changed
tmux server PID did not change
PTY child PID did not change
same tmux session still exists
transcript capture continued
new broker reconciled the existing session
```

Also prove that explicitly stopping `wsl-agent-tmux.service` ends the dedicated Terminal lifetime boundary. A unit test that merely kills the Node broker process is insufficient.

- [ ] **Step 9: Add the immediate-output transcript race test**

Open a session whose command prints immediately and exits. Prove the first emitted bytes are present in the transcript; session creation must not race ahead of `pipe-pane` capture setup and silently lose initial output.

- [ ] **Step 10: Run broker tests and commit**

```bash
(cd providers/terminal && npm test)
node --check providers/terminal/*.mjs
bash -n scripts/install-terminal-broker-user.sh
git diff --check
git add providers/terminal systemd/wsl-agent-tmux.service.in systemd/wsl-agent-terminal-broker.service.in scripts/install-terminal-broker-user.sh docs/benchmarks/terminal-preflight.md
git commit -m "feat: add durable tmux terminal broker"
```

---

### Task 6.5: Benchmark Herdr Against the Qualified tmux/Broker Baseline

**Status:** **COMPLETE.** Final Terminal verdict: `TMUX_BROKER_WINS`. Await/resume verdict: `HERDR_MAKES_CUSTOM_AWAIT_UNNECESSARY = PARTIALLY`. Herdr remains benchmark/reference evidence only; do not reopen the backend decision during Phase 2 without new contradictory evidence.

**Files:**
- Create: `experiments/herdr/` — disposable benchmark/prototype scripts only.
- Create: `docs/benchmarks/herdr-terminal-comparison.md`.
- Do not modify production `providers/terminal/**`, systemd Terminal units, personal MCP composition, or the live bridge during this task.

**Interfaces:**
- Consumes: the completed Task 6 tmux/broker implementation and Herdr `v0.8.0` pinned from the official release.
- Produces one Terminal-backend verdict:

```text
TMUX_BROKER_WINS
HERDR_WINS
HYBRID_WINS
HERDR_NOT_MATERIAL
```

- Produces one independent wait/resume verdict:

```text
HERDR_MAKES_CUSTOM_AWAIT_UNNECESSARY = YES | PARTIALLY | NO
```

This is a challenger experiment, not a migration task. A Herdr or hybrid win requires a focused design amendment before Task 7 production integration.

- [ ] **Step 1: Pin and verify Herdr**

Verify architecture with `uname -m`, obtain the matching official `v0.8.0` release artifact, and verify the SHA-256 digest against GitHub release metadata before execution. Record:

```text
version
target architecture
artifact name
sha256
install/test path
```

Do not use floating `latest`, `master`, or an unverified installer in the benchmark.

- [ ] **Step 2: Freeze three candidate shapes**

Compare these exact architectural candidates without silently changing them mid-benchmark:

```text
A — TMUX_BROKER
model-facing adapter
  -> our broker
  -> dedicated tmux lifetime authority

B — HERDR
thin model-facing adapter/prototype
  -> Herdr local CLI/socket API
  -> Herdr PTY/runtime

C — HYBRID
our bounded model-facing read/cursor policy where it adds measured value
  -> Herdr for PTY ownership, human attach, lifecycle/wait primitives
```

The hybrid prototype may exist only under `experiments/herdr/**`; do not modify production Terminal code.

- [ ] **Step 3: Build one same-workload benchmark corpus**

Run equivalent scenarios against every candidate that can support them:

```text
open interactive shell
start a long-running server/watch command
read initial output
read only newly relevant output again
send ordinary text
send ENTER / CTRL_C / CTRL_D
resize
non-zero process exit + final output
large/noisy output
immediate-output-and-exit process
alternate-screen/TUI inspection
human attach to the exact PTY
read-only/model observation while human controls input
human detach/control return
client/provider disconnect and reconnect
backend control-process restart
wait for output pattern
wait for ordinary process completion/readiness
recognized coding-agent working/blocked/idle/done wait, where supported
```

Do not weaken the tmux baseline workload to make Herdr look better or vice versa.

- [ ] **Step 4: Measure durability boundaries explicitly**

For the existing Task 6 baseline, retain the already-proven broker-restart property:

```text
broker restarts
tmux server PID unchanged
PTY child PID unchanged
transcript continues
```

For Herdr, distinguish at least:

```text
client/adapter disconnect
1MCP/provider-equivalent disconnect
Herdr server still running
full Herdr server restart
```

Record exactly which PTYs/processes survive, which are reconstructed/resumed, and which are lost. Do not treat process reconstruction as identical to preserving the same PTY/process.

- [ ] **Step 5: Compare human takeover semantics**

Measure whether Herdr can provide the required personal contract without extra custom locking machinery:

```text
attach to exact session
single writable controller
read-only observer remains possible
second writer is rejected or requires explicit takeover
control returns cleanly after detach
sudo-password interaction does not require password transport through MCP
```

Record what Herdr provides natively versus what a harness adapter would still need to enforce.

- [ ] **Step 6: Compare model-read/context behavior**

Use the same noisy terminal workloads and measure:

```text
bytes/tokens returned on first read
bytes/tokens returned on repeated read with no meaningful new output
duplicate text re-injected
large-output recovery behavior
TUI/current-screen recovery quality
truncation signaling
latency
```

Compare Herdr's pane/agent read model against Task 6's monotonic transcript cursor model. If the hybrid candidate adds a thin cursor/dedup layer, measure the extra code and whether it actually reduces context.

- [ ] **Step 7: Evaluate Herdr waiting before Task 8 designs a custom await service**

Exercise Herdr's available pane-output waiting and recognized-agent lifecycle waiting. Measure:

```text
output-pattern wait
agent working -> blocked/idle/done transition wait
client polling avoided
cancellation/timeout behavior
reconnect behavior
false-positive/stale-agent risk
```

Then answer independently:

```text
HERDR_MAKES_CUSTOM_AWAIT_UNNECESSARY = YES | PARTIALLY | NO
```

`YES` means Task 8 should first try to expose/translate Herdr's event-driven wait semantics instead of inventing a parallel condition service. `PARTIALLY` must name the missing condition classes. `NO` must cite concrete failed requirements.

- [ ] **Step 8: Measure ownership and operational cost**

Record for each candidate:

```text
additional long-lived processes
idle RSS/CPU
number of custom production LOC we would own
number of systemd units/services
restart/recovery complexity
external dependency surface
upgrade/migration risk
model-facing schema impact
```

Do not score Herdr merely on feature count; score the amount of custom infrastructure it lets us delete while preserving our durability/context requirements.

- [ ] **Step 9: Classify any failure before verdict**

For every failed scenario, label it:

```text
candidate
adapter/prototype
benchmark
```

Reproduce candidate failures independently before using them to reject a backend.

- [ ] **Step 10: Record verdict and consequence**

`docs/benchmarks/herdr-terminal-comparison.md` must contain:

```text
version/digest
same-workload matrix
context/latency measurements
durability matrix
human-takeover matrix
wait/lifecycle matrix
operational ownership comparison
Terminal verdict
await verdict
```

Decision rules:

```text
TMUX_BROKER_WINS
  -> Task 7 executes its current tmux/broker design.

HERDR_NOT_MATERIAL
  -> Task 7 executes its current tmux/broker design; retain Herdr evidence only.

HERDR_WINS
  -> STOP before Task 7 implementation; write/review a focused Terminal design amendment that replaces the backend while preserving the six-tool model-facing goal unless evidence also justifies changing that surface.

HYBRID_WINS
  -> STOP before Task 7 implementation; write/review a focused Terminal design amendment naming the exact responsibilities retained by our adapter and delegated to Herdr.
```

- [ ] **Step 11: Commit experiment evidence only**

```bash
git add experiments/herdr docs/benchmarks/herdr-terminal-comparison.md
git diff --cached --check
git commit -m "docs: evaluate Herdr terminal backend"
```

If the experiment needs small helper code, it remains under `experiments/herdr/**` and must not be wired into production composition in this task.

---

### Task 6.6: Harden Reconciliation for Retained Dead tmux Panes

**Status:** **COMPLETE ON INTEGRATION BRANCH.** Source commit `3ade00f`; integrated as `44000c6`.

**Files:**
- Modify: `providers/terminal/tmux.mjs`.
- Modify: `providers/terminal/test/broker.test.mjs`.

**Interfaces:**
- Consumes: Task 6 tmux/broker session metadata and `remain-on-exit` panes.
- Produces: broker restart/reconciliation that treats exited retained panes as valid inspectable sessions instead of trying to reinstall a transcript pipe on a dead pane.

Required invariant:

```text
live pane
  -> reconcile transcript pipe
  -> same tmux / PTY lifetime
  -> transcript continues

dead remain-on-exit pane
  -> DO NOT reinstall pipe-pane
  -> preserve final transcript
  -> preserve exact pane exit status
  -> remain readable/listable until close/retention
```

Acceptance corpus:

```text
A = live and producing output
B = exited:0 remain-on-exit
C = exited:7 remain-on-exit
restart broker
restart broker a second time
```

Pass criteria:

```text
A keeps the same tmux server and PTY PID and continues output
B remains readable/listable with exit 0
C remains readable/listable with exit 7
logical cursors do not silently reset or renumber
second restart is idempotent
immediate-output and CURSOR_EXPIRED/CURSOR_AHEAD behavior remain intact
```

Fresh integrated tests pass 18/18 in `providers/terminal`.

---

### Task 7: Add Human Takeover and the Terminal MCP Surface

**Files:**
- Create: `providers/terminal/broker-client.mjs`
- Create: `providers/terminal/mcp-server.mjs`
- Create: `providers/terminal/cli.mjs`
- Create: `bin/wsl-term`
- Create: `providers/terminal/test/mcp-server.test.mjs`
- Create: `providers/terminal/test/human-lease.test.mjs`
- Create: `docs/benchmarks/terminal-chatgpt-acceptance.md`
- Modify: `config/templates/mcp-personal.json`
- Modify: `scripts/render-config.mjs`
- Modify: `scripts/smoke-local.sh`
- Modify: `tests/harness.sh`

**Interfaces:**
- Consumes: the selected tmux/broker backend plus the completed Task 6.6 retained-dead-pane reconciliation fix.
- Produces: exactly six MCP tools plus the `wsl-term` human attach CLI.

- [ ] **Step 0: Verify the now-frozen Terminal prerequisites**

Before coding, prove the integration base contains:

```text
Task 6.5 verdict = TMUX_BROKER_WINS
Task 6.6 mixed live/dead reconciliation test passes
broker restart preserves tmux/PTY lifetime
immediate-output first-byte test passes
```

Herdr is not a Task-7 runtime dependency and no backend redesign gate remains.

- [ ] **Step 1: Write failing MCP schema tests**

Require exactly:

```text
terminal_open
terminal_read
terminal_send
terminal_resize
terminal_list
terminal_close
```

Schemas:

```text
terminal_open(name, command?, cwd?)
terminal_read(name, cursor?, snapshot?)
terminal_send(name, text?, key?)
terminal_resize(name, cols, rows)
terminal_list()
terminal_close(name, force?)
```

`terminal_send` requires exactly one of `text` or `key`.

- [ ] **Step 2: Write failing human-lease tests**

While a human lease exists:

```text
read -> allowed
list -> allowed
send -> HUMAN_HAS_CONTROL
resize -> HUMAN_HAS_CONTROL
close(force=false) -> HUMAN_HAS_CONTROL
close(force=true) -> allowed only with explicit force
```

If the attach client disappears, reconcile the lease against actual tmux clients and release a stale lease.

- [ ] **Step 3: Implement compact model-facing reads with broker-owned model cursor**

Normal `terminal_read(name)` returns only output not yet consumed by the model-side cursor and advances that cursor. Do not require cursor retransmission during ordinary use.

Example native result:

```text
PASS src/foo.test.ts
...
```

An explicit `cursor` is a recovery/resynchronization control, not normal ceremony. If the requested cursor was rotated away, return explicit `CURSOR_EXPIRED` plus a bounded recovery option rather than silently substituting different bytes. `snapshot=true` uses `tmux capture-pane -p` for TUI/debugger recovery instead of replaying the transcript. A bounded `tail` recovery parameter may be added if tests prove it useful.

- [ ] **Step 4: Implement keys without raw byte ceremony**

Support at least:

```text
ENTER
CTRL_C
CTRL_D
CTRL_Z
ESC
TAB
BACKSPACE
UP
DOWN
LEFT
RIGHT
```

Map them internally to tmux `send-keys` operations.

- [ ] **Step 5: Implement `wsl-term` human attachment**

CLI commands:

```bash
wsl-term list
wsl-term attach tests
```

`attach` flow:

```text
acquire human lease from broker
attach to tmux -L wsl-agent session
on normal detach/exit, release lease
on crash, broker later reconciles against tmux clients
```

The broker must not log typed input. In particular, sudo passwords entered with terminal echo disabled are never mirrored into broker logs.

- [ ] **Step 6: Register private Terminal provider**

Add to `mcp-personal.json`:

```json
"terminal": {
  "command": "node",
  "args": ["__REPO_ROOT__/providers/terminal/mcp-server.mjs"],
  "env": {
    "MCP_TERMINAL_SOCKET": "__TERMINAL_SOCKET__",
    "MCP_TERMINAL_READ_MAX_BYTES": "65536"
  },
  "tags": ["terminal"]
}
```

Renderer derives the socket from the user runtime directory rather than putting a machine-secret value in Git.

- [ ] **Step 7: Run full local tests**

```bash
(cd providers/terminal && npm test)
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
node --check providers/terminal/*.mjs scripts/render-config.mjs
git diff --check
```

- [ ] **Step 8: Perform real product-path acceptance and record it separately**

Write the observed product-path evidence to `docs/benchmarks/terminal-chatgpt-acceptance.md`.

After rendering `personal`, restarting externally, Actions Refresh, and a fresh ChatGPT session, verify:

```text
open tests session
read initial output
send text
send Ctrl-C
resize
list
human attach from WSL
model send blocked during attach
human detach
model send works again
restart 1MCP/provider
same terminal session remains alive
restart broker
same tmux PTY remains alive and is rediscovered
```

Do not restart the bridge from a Shell/Terminal process owned by the bridge being replaced.

- [ ] **Step 9: Commit**

```bash
git add providers/terminal bin/wsl-term docs/benchmarks/terminal-chatgpt-acceptance.md config/templates/mcp-personal.json scripts/render-config.mjs scripts/smoke-local.sh tests/harness.sh
git commit -m "feat: expose persistent terminal sessions"
```

---

### Task 8: Derive Await/Resume Semantics From Real Terminal Evidence

**Files:**
- Modify: `docs/benchmarks/personal-harness-phase-2.md`
- Conditional Create: `docs/superpowers/specs/YYYY-MM-DD-terminal-await-design.md`
- Conditional provider files only after that focused sub-spec is reviewed and approved.

**Interfaces:**
- Consumes: real ChatGPT -> Cloudflare -> OAuth -> 1MCP -> Terminal latency/read/poll behavior from Task 7 product acceptance plus Task 6.5's reference evidence that Herdr-style coding-agent lifecycle waits are useful but do not cover generic local readiness.
- Produces: `NO_WAIT_TOOL_NEEDED` or an approved focused wait/resume design. This task does **not** predeclare a `terminal_wait` API and does **not** introduce Herdr as a runtime dependency.

- [ ] **Step 1: Measure real polling debt before designing another subsystem**

Run at least:

```text
30-second test process
2-minute build/watch cycle
port-ready dev server
output-regex readiness marker
normal process exit
file appearance/change where relevant
HTTP/service readiness where relevant
```

Record number of `terminal_read` calls, wall time, context returned, reconnect behavior, and whether polling is materially wasteful.

- [ ] **Step 2: Classify the observed condition types**

Distinguish actual needs such as:

```text
process exit
output pattern
port readiness
file existence/change
HTTP readiness
systemd/service state
```

Do not add hypothetical conditions merely to make the first abstraction look generic.

- [ ] **Step 3: Decide the ownership boundary**

Compare:

```text
our tmux/broker transcript/process state
```

against:

```text
Terminal-specific harness waiting
```

and, only for condition classes Terminal cannot own cleanly:

```text
generic local condition/wait service
```

Task 6.5's `PARTIALLY` verdict means Herdr is reference design evidence, not an available backend primitive. Borrow the concept of explicit coding-agent states (`working`, `idle`, `blocked`, `done`, `unknown`) only if real Task-7 usage shows that local coding-agent lifecycle polling is material. Do not add Herdr as a dependency just to obtain those states.

For output waiting, prefer the already-durable transcript/cursor data source over snapshot polling. For broader conditions such as process exit, port readiness, file change, HTTP health, or systemd state, design only the minimal condition ownership that Task-7 evidence actually requires.

Use observed request lifetime, reconnect semantics, state ownership, cancellation, polling cost, and context cost as criteria. If normal incremental reads are sufficient, record `NO_WAIT_TOOL_NEEDED` and stop.

- [ ] **Step 4: If a wait abstraction is justified, write a focused sub-spec before code**

`docs/superpowers/specs/YYYY-MM-DD-terminal-await-design.md` must define:

```text
condition representation
poll/check ownership
timeout
cancellation
minimum polling interval
persistent state
reconnect behavior
completion evidence
notification/resume semantics
```

Do not freeze `terminal_wait(...)`, `await_condition(...)`, or any other signature until this evidence-driven sub-spec is approved.

- [ ] **Step 5: Implement only the approved minimal abstraction via TDD**

If the sub-spec is approved, add only its first qualified condition set. The wait/control process must never own or kill the underlying Terminal PTY merely because a wait times out or is cancelled.

- [ ] **Step 6: Run real-product acceptance**

Prove:

```text
start long-running work
continue other work
wait/check/resume using the approved abstraction
receive completion evidence
avoid rereading the whole terminal transcript
```

- [ ] **Step 7: Commit the decision and optional implementation separately**

If `NO_WAIT_TOOL_NEEDED`, commit evidence with a `docs:` commit. If implementation occurs, commit the approved sub-spec first and implementation second.

---

### Task 9: Build the Multi-Repository Rooted CodeDB Router

**Status:** **COMPLETE.** Source commit `d010aaf`; integrated as `46fcb48`. The router uses one correctly rooted CodeDB 0.2.5840 child per canonical Git root, rejects per-call `project=` switching, and uses an explicit maximum of four active/pending repositories with no implicit eviction.

**Files:**
- Create: `providers/code-router/package.json`
- Create: `providers/code-router/repo-root.mjs`
- Create: `providers/code-router/codedb-child.mjs`
- Create: `providers/code-router/pool.mjs`
- Create: `providers/code-router/server.mjs`
- Create: `providers/code-router/test/repo-root.test.mjs`
- Create: `providers/code-router/test/pool.test.mjs`
- Create: `providers/code-router/test/freshness.test.mjs`
- Create: `docs/benchmarks/code-router.md`

**Interfaces:**
- Consumes: verified CodeDB 0.2.5840 binary and Git repositories.
- Produces: one rooted CodeDB child per active canonical repository root; no per-call `project=` switching.

- [ ] **Step 1: Write repo-root RED tests**

`resolveRepoRoot(cwd)` must use Git's actual root:

```text
/home/hamza/repo/a/src -> /home/hamza/repo/a
/home/hamza/repo/b      -> /home/hamza/repo/b
non-git directory       -> clear error
```

Use `git -C <cwd> rev-parse --show-toplevel` via `execFile`, not a shell string.

- [ ] **Step 2: Write child-pool RED tests with a deliberately simple bounded lifecycle**

Initial policy:

```text
key: canonical Git root
maximum active children: 4
spawn: codedb <root> mcp
CODEDB_TOOLS_PROFILE=core
CODEDB_MCP_LEAN=1
CODEDB_NO_TELEMETRY=1
```

Tests prove reuse of the same child, distinct children for distinct repos, concurrent A/B use, explicit behavior when the maximum-active bound is reached, graceful child shutdown, repository disappearance handling, and recovery after a crashed child.

Do not implement elaborate LRU/idle-eviction machinery in the first router. Add eviction/reuse sophistication only after real workloads demonstrate the need.

- [ ] **Step 3: Implement CodeDB stdio child wrapper**

Use the MCP SDK client over stdio. Never pass `project=` for normal routed calls; the child itself is rooted at the target repo.

- [ ] **Step 4: Prove freshness through Pi mutations**

With two disposable Git repos:

```text
spawn routed child A
spawn routed child B
Pi write/edit repo A
CodeDB A observes new/changed token after polling window
CodeDB B remains independent
Pi write/edit repo B
CodeDB B observes change
```

No explicit `codedb_read` refresh is allowed in the freshness proof.

- [ ] **Step 5: Commit the internal router before exposing model tools**

```bash
(cd providers/code-router && npm test)
git add providers/code-router docs/benchmarks/code-router.md
git commit -m "feat: add rooted multi-repo CodeDB router"
```

---

### Task 10: Expose a Small Code Domain and Re-Benchmark Its Value

**Status:** **COMPLETE.** Final verdict `CODE_SMALL_EXPLICIT_FACADE`. Source commit `fa46650`; integrated as `a04cf41`. The retained model-facing Code surface is exactly `code_search`, `code_context`, and `code_symbol`; raw CodeDB tools remain hidden.

**Files:**
- Modify: `providers/code-router/server.mjs`
- Create: `providers/code-router/test/server.test.mjs`
- Modify: `config/templates/mcp-personal.json`
- Modify: `scripts/render-config.mjs`
- Modify: `scripts/smoke-local.sh`
- Modify: `docs/benchmarks/code-router.md`

**Interfaces:**
- Consumes: rooted child pool.
- Produces one benchmark-qualified Code facade; do not preselect the final action count.

- [ ] **Step 1: Prototype facade A — one operation-oriented Code action**

Candidate shape:

```text
code(operation, query?, path?, symbol?, cwd?, limit?)
```

Keep the operation vocabulary narrow and obvious. `cwd` defaults to `/home/hamza`; the router resolves its Git root internally.

- [ ] **Step 2: Prototype facade B — small explicit Code surface**

Candidate shapes:

```text
code_search(query, cwd?, limit?)
code_context(task, cwd?, limit?)
code_symbol(name, cwd?)
```

Map both prototypes to the smallest appropriate CodeDB core operations. Do not expose the other CodeDB tools directly.

- [ ] **Step 3: Keep results native/lean**

Return CodeDB lean text directly as `TextContent`. Do not wrap it in JSON or `structuredContent`.

- [ ] **Step 4: Benchmark facade A vs facade B vs Pi-only navigation**

Use the same corrected tasks for every surface:

```text
find implementation from symptom
trace caller/callee relationship
locate a symbol definition
investigate change across two repositories
recover context after a Pi file mutation
```

Measure:

```text
visible tool count
schema tokens
request tokens
result tokens
tool calls
follow-up-call debt
freshness after Pi edits
wall time
correctness
model operation-selection errors
```

- [ ] **Step 5: Freeze one evidence-backed verdict**

Possible outcomes:

```text
CODE_SINGLE_FACADE
CODE_SMALL_EXPLICIT_FACADE
CODE_ROUTER_REDESIGN
NO_CODE_FACADE
```

A Code action stays visible only if it provides independent value over `dev.bash`/`rg`/`ast-grep` after paying schema cost. Do not treat a facade-design failure as a CodeDB candidate defect.

- [ ] **Step 6: Register the winning Code provider in personal mode**

After live Actions Refresh, verify only the winning facade actions appear; no raw `codedb_*` actions are exposed.

- [ ] **Step 7: Commit**

```bash
git add providers/code-router config/templates/mcp-personal.json scripts/render-config.mjs scripts/smoke-local.sh docs/benchmarks/code-router.md
git commit -m "feat: expose routed code intelligence"
```

---

### Task 11: Decide RTK's Place Under Native Bash

**Status:** **COMPLETE. No production RTK integration.** Evidence commits `e099b62` and `56d1551` are integrated as `202f4d6` and `aac4f3f`.

**Final harness policy:**

```text
normal executor          native one-shot Bash command string
normal output            native Bash output
automatic RTK rewrite    none
harness RTK classifier   none
new MCP actions          none
new Bash schema fields   none

explicit optional use    rtk test / rtk err when deliberately selected
raw recovery             native Bash or RTK full-output log
```

RTK 0.45 real-development-flow evidence showed a 13.2% aggregate result-token reduction across three workflows, almost entirely from `rtk test`. Routine repository navigation saved 0%; `rtk rg` did not materially beat native `rg`; native `sed -n` remained better for focused source ranges; `git diff --check` still removed remediation evidence; and `git diff --name-only` still damaged its machine-readable contract.

Therefore:

```text
RTK automatic/selective harness shaping  REJECTED_WITH_EVIDENCE
RTK explicit local CLI helper             OPTIONAL_OUTSIDE_HARNESS_ARCHITECTURE
```

Do not spend further Phase-2 engineering effort on RTK unless a future version materially changes these failure contracts. Native Bash remains the source of truth.

---

### Task 12: Run Concurrency Regression and Keep Stronger CAS Deferred Unless Its Trigger Fires

**Status:** **COMPLETE; TRIGGER FIRED.** Source commit `c01e52b`; integrated as `61ae4af`. Repeated real same-file patch/patch, patch/edit, and delete/update races produced `SILENT_LOST_UPDATE`. The focused design is `docs/superpowers/specs/2026-08-15-personal-files-cas-trigger-design.md`. Model-visible hashes are **not** approved by this result.

**Files:**
- Modify: `providers/pi-dev/test/files.test.mjs`
- Modify: `providers/pi-dev/test/patch.test.mjs` only if patch qualified.
- Modify: `docs/benchmarks/personal-harness-phase-2.md`
- Conditional Create: a focused CAS design/spec only if a reproducible silent-lost-update defect is found.

**Interfaces:**
- Consumes: exact edit, the Task 4 patch verdict, and create-only write.
- Produces: `CAS_DEFERRED` unless repeated real or reproducible silent-lost-update evidence justifies a separate CAS project.

- [ ] **Step 1: Keep high-value concurrent regression tests**

Run representative races such as:

```text
two edits to the same snapshot
two patches touching the same file
patch + edit race
write same new path race
multi-file patch while one file changes externally
```

Pass criterion: no silent lost update. A rejected conflict is acceptable.

- [ ] **Step 2: Classify any failure before changing the API**

For every failure, classify:

```text
candidate mutation defect
adapter/test defect
benchmark/stress artifact
```

Reproduce independently. Synthetic stress by itself is not permission to add model-visible hash/CAS fields.

- [ ] **Step 3: Apply the trigger rule**

If current guards reject safely or serialize without silent loss, record `CAS_DEFERRED` and stop.

If a silent lost update is reproducibly demonstrated, capture the minimal reproducer and open a focused CAS design specifying the smallest required precondition semantics. Do not improvise a new model-facing CAS contract inside this task.

- [ ] **Step 4: Commit regression evidence only**

```bash
(cd providers/pi-dev && npm test)
git add providers/pi-dev/test docs/benchmarks/personal-harness-phase-2.md
git commit -m "test: preserve personal harness mutation conflict safety"
```

---

### Task 12.5: Make Same-Path Files Mutations Atomic for Cooperating Harness Calls

**Status:** **NEXT FILES HARDENING TASK.** This task implements the already-reviewed focused design; it does not redesign the model-facing Files schemas.

**Files:**
- Create: `providers/pi-dev/mutation-coordinator.mjs`.
- Create: `providers/pi-dev/test/mutation-coordinator.test.mjs`.
- Modify: `providers/pi-dev/files.mjs`.
- Modify: `providers/pi-dev/patch.mjs`.
- Modify: `providers/pi-dev/test/files.test.mjs`.
- Modify: `providers/pi-dev/test/patch.test.mjs`.
- Modify: `docs/benchmarks/personal-harness-phase-2.md`.

**Interfaces:**
- Consumes: existing implicit whole-file snapshot checks used by `edit` and `apply_patch`.
- Produces: provider-internal exclusive mutation serialization keyed by canonical absolute path. The exclusive critical section must cover the final snapshot read/compare **and** the corresponding write/unlink/create transition for cooperating Files mutations.
- Produces **no new MCP arguments** and no model-visible hash/revision field.

- [ ] **Step 1: Turn the four Task-12 trigger TODOs into failing regression tests**

Require repeated real primitive runs for:

```text
overlapping patch/patch, same region
disjoint patch/patch, same file
patch/edit, same file
delete/update, same snapshot
```

Before implementation these tests must reproduce the current failure class: both operations may report success while one valid change disappears or contradicts the other.

- [ ] **Step 2: Add coordinator unit tests**

Define an internal coordinator keyed by canonical absolute target path. Tests must prove:

```text
same path -> mutation critical sections do not overlap
different paths -> operations may proceed concurrently
multiple-path acquisition -> stable canonical ordering prevents deadlock
release occurs on success and thrown failure
```

Do not use one global mutation mutex.

- [ ] **Step 3: Route exact edit through the coordinator**

For an existing-file edit, hold the path lease across:

```text
final read
snapshot comparison
write
```

Retain exact/ambiguous-match behavior and the current native diff result.

- [ ] **Step 4: Route patch mutations through the same coordinator**

Update/delete must share the exact same path coordinator as `edit`.

For Move, acquire source and destination in stable canonical-path order and hold both across destination validation/exclusive create and source recheck/removal.

Add/create remains exclusive-create and must not regress its existing `wx` conflict behavior.

Multi-file patch remains non-transactional. `PATCH_PARTIAL` is still required if an earlier target committed and a later target fails.

- [ ] **Step 5: Prove the Task-12 failures are gone without serializing disjoint paths**

Run at least the original stress counts:

```text
50x overlapping patch/patch
50x disjoint patch/patch on same file
50x patch/edit on same file
50x delete/update
30x independent mutations on different files
```

Pass criterion:

```text
0 SILENT_LOST_UPDATE
same-path operations either preserve both valid disjoint effects or reject one explicitly
disjoint-path concurrency still succeeds without global serialization
```

- [ ] **Step 6: Preserve the native Bash boundary honestly**

Document that arbitrary native Bash/external writers do not participate in the in-process coordinator. Keep the existing stale-snapshot detection for changes visible before the final comparison; do not claim universal cross-process CAS.

- [ ] **Step 7: Re-evaluate model-visible revision/hash fields only after atomic enforcement passes**

If real stale-read workflows remain painful after this fix, open a separate evidence gate for a compact revision token enforced inside the same critical section. Otherwise keep model-visible hashes absent.

- [ ] **Step 8: Run the complete Pi regression gate and commit**

```bash
(cd providers/pi-dev && npm test)
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
node --check providers/pi-dev/*.mjs
git diff --check
```

Commit only the coordinator, affected Files/Patch code/tests, and updated evidence.

---

### Task 13: Audit the Structured-Format Trigger; Reopen Codecs Only if It Fires

**Files:**
- Modify: `docs/benchmarks/structured-formats.md`
- Conditional provider changes only after a benchmark win.

**Interfaces:**
- Consumes: final Code/Terminal result shapes.
- Produces: `FORMAT_TRIGGER_NOT_FIRED` by default. A new focused codec benchmark/spec is opened only if a real structured model-facing payload demonstrates that best native text is materially worse.

- [ ] **Step 1: Inventory final model-facing payload classes**

Classify actual results from:

```text
Files
Bash
Terminal
Code facade
```

Source, patch, terminal text, and diagnostics remain excluded from codec experiments.

- [ ] **Step 2: Apply the trigger gate before running any codec work**

Ask:

```text
Did Phase 2 create a real repetitive structured model-facing payload
where the best native textual representation is materially worse?
```

If **no**, record `FORMAT_TRIGGER_NOT_FIRED` and stop. Do not spend a mandatory phase re-benchmarking TOON/GCF.

If **yes**, create a focused structured-format benchmark/spec and compare only the eligible payload using:

```text
native text
compact JSON
TOON
GCF generic
GCF graph only if the payload is naturally graph-shaped
```

Require exact semantic fidelity, latency measurement, and direct ChatGPT-path comprehension before adoption.

- [ ] **Step 3: Commit the trigger decision**

```bash
git add docs/benchmarks/structured-formats.md
git commit -m "docs: audit structured-format trigger for final harness"
```

Any codec implementation, if triggered, belongs to the focused follow-up project rather than being improvised inside this task.

---

### Task 14: Final Personal-Harness Consolidation and Live Acceptance

**Files:**
- Modify: `docs/architecture.md`
- Modify: private configuration/operations docs.
- Modify: `scripts/smoke-local.sh`
- Modify: `tests/harness.sh`
- Modify: `tests/lifecycle.sh` only where new private services require it.

**Interfaces:**
- Consumes: frozen Task-4/6.5/10/11/12 verdicts plus the implemented Task 12.5 consistency fix, Task 7 live Terminal acceptance, Task 8 wait/resume decision, and Task 13 format-trigger audit.
- Produces: final private `personal` profile and documented Codex-like workflow.

- [ ] **Step 1: Remove losing experimental actions/providers**

No losing tool remains advertised merely because it was implemented during an experiment.

Expected final domains:

```text
Dev       -> read, edit, apply_patch, write, bash
Terminal  -> six persistent PTY actions, plus only the wait/resume actions approved by the Task 8 focused sub-spec
Code      -> code_search, code_context, code_symbol
```

- [ ] **Step 2: Measure the final catalog**

Record actual:

```text
tool count
tools/list schema bytes/tokens
representative request tokens
representative result tokens
```

Do not enforce an arbitrary four-tool ceiling. Flag any action whose schema cost is high relative to observed use.

- [ ] **Step 3: Run the complete automated gate**

```bash
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
bash tests/public-export.sh
(cd providers/pi-dev && npm test)
(cd providers/terminal && npm test)
(cd providers/code-router && npm test)
bash scripts/check-personal-toolbox.sh
bash -n bin/* lib/bridge/*.sh scripts/*.sh tests/*.sh
node --check scripts/render-config.mjs providers/pi-dev/*.mjs providers/terminal/*.mjs providers/code-router/*.mjs
git diff --check
```

If a conditional provider was not retained, omit only its nonexistent test command.

- [ ] **Step 4: Render the personal live deployment**

Use an external control process or user systemd. Never execute a bridge replacement from inside an MCP Shell/Terminal process owned by the 1MCP instance being replaced.

Preserve existing OAuth identity/session continuity exactly as hardened by the current migration machinery.

- [ ] **Step 5: Perform ChatGPT catalog acceptance**

After provider composition is live:

```text
ChatGPT workspace/plugin -> Actions -> Refresh
start a fresh MCP-backed session
```

Verify removed actions are absent and all retained actions are present.

- [ ] **Step 6: Run one complete Codex-like end-to-end workflow through ChatGPT**

Use a disposable or explicitly selected repository:

```text
Code: locate implementation
Files: read focused source
Patch/Edit: change multiple locations
Bash: run focused tests and git diff
Terminal: start watch/dev process and keep it alive
Human: attach, interact, detach
Terminal: model resumes control
Code: re-check fresh repository intelligence
Bash: run final verification
```

Pass criteria:

```text
no absolute-path ceremony required for normal /home/hamza work
no hidden mutable cwd
no lost terminal process across bridge/provider restart
human takeover blocks model writes
no stale CodeDB result after Pi mutation
no duplicate structuredContent for native artifacts
no silent mutation conflict
bridge issues: 0
public health: OK
```

- [ ] **Step 7: Commit final consolidation**

```bash
git add docs/architecture.md docs/benchmarks docs/personal \
  config/profiles/personal.env config/templates/mcp-personal.json \
  scripts/render-config.mjs scripts/smoke-local.sh scripts/check-personal-toolbox.sh scripts/setup-personal-toolbox.sh \
  providers/pi-dev providers/terminal providers/code-router \
  tests/harness.sh tests/lifecycle.sh systemd/wsl-agent-tmux.service.in systemd/wsl-agent-terminal-broker.service.in bin/wsl-term
git commit -m "feat: complete personal Codex-like WSL harness phase 2"
```

---

## Carry-Forward Ledger

Every capability below must remain in one explicit state so it cannot silently disappear between projects:

| Capability | Phase-2 status |
|---|---|
| Personal unrestricted WSL Files/Bash | IMPLEMENTED + INTEGRATED |
| Codex-style apply_patch | IMPLEMENTED + INTEGRATED: `BOTH_EARN_PLACE` with `edit` |
| Native CLI toolbox / ast-grep | IMPLEMENTED + INTEGRATED |
| Persistent tmux Terminal baseline | IMPLEMENTED + INTEGRATED |
| Herdr Terminal backend / hybrid | REJECTED_WITH_EVIDENCE: `TMUX_BROKER_WINS` |
| Herdr coding-agent lifecycle concept | DEFERRED_WITH_TRIGGER: real local coding-agent lifecycle polling becomes material |
| Retained dead-pane reconciliation | IMPLEMENTED ON INTEGRATION BRANCH: Task 6.6 |
| Human PTY takeover | IMPLEMENT_THIS_PHASE: Task 7 next Terminal production task |
| Terminal wait/resume | DEFERRED_PENDING_TERMINAL_EVIDENCE: Task 7 -> Task 8 focused sub-spec gate |
| Multi-repo rooted CodeDB router | IMPLEMENTED ON INTEGRATION BRANCH |
| Small Code facade | IMPLEMENTED ON INTEGRATION BRANCH: `code_search`, `code_context`, `code_symbol` |
| Automatic/selective RTK harness integration | REJECTED_WITH_EVIDENCE |
| Explicit `rtk test` / `rtk err` helper | OPTIONAL_OUTSIDE_HARNESS_ARCHITECTURE |
| Same-path mutation atomicity | IMPLEMENT_THIS_PHASE: Task 12.5 triggered by reproducible silent lost updates |
| Model-visible revision/hash field | DEFERRED_WITH_TRIGGER: only after Task 12.5 if real stale-read ergonomics still require it |
| TOON | REJECTED_WITH_EVIDENCE: not material on current payloads |
| GCF generic | DEFERRED_WITH_TRIGGER: real structured payload where best native text loses |
| GCF graph | DEFERRED_WITH_TRIGGER: natural graph-shaped model-facing payload |
| Serena/alternative code intelligence | DEFERRED_WITH_TRIGGER: rooted CodeDB facade fails accuracy/diagnostic requirements |
| Additional MCP facades | DEFERRED_WITH_TRIGGER: measured schema/tool-choice debt |
| Windows-host control | OUT_OF_SCOPE: WSL-user authority boundary |
| Password vault / automatic sudo | REJECTED_FOR_THIS_PROJECT |

---

## Execution Ordering and Parallelism

Do not execute all tasks concurrently. Recommended waves:

```text
Wave 0-3.5  COMPLETE: Tasks 1-6.5
Wave 3.6      COMPLETE ON INTEGRATION BRANCH: Task 6.6 dead-pane reconciliation
Wave 4        NEXT TERMINAL PATH: Task 7 tmux/broker MCP + human takeover + real ChatGPT acceptance
Wave 5        Task 8 evidence-driven await/resume sub-spec decision
Wave 6        COMPLETE ON INTEGRATION BRANCH: Tasks 9-10 Code router + explicit facade
Wave 7A       COMPLETE: Task 11 RTK decision — no harness integration
Wave 7B       COMPLETE TRIGGER / NEXT FIX: Task 12 -> Task 12.5 atomic same-path mutation enforcement
Wave 7C       Task 13 structured-format trigger audit
Wave 8        Task 14 final integration/live acceptance
```

Only use parallel agents when owned paths do not overlap. A designated integrator owns `config/templates/*`, `scripts/render-config.mjs`, `tests/harness.sh`, the live deployment, and Git staging/commits whenever two lanes converge.

---

## Self-Review Checklist

Before execution begins, verify:

- [ ] Public release work and personal-harness work are treated as independent projects; simultaneous edits use explicit worktree/file ownership rather than an architectural prerequisite.
- [ ] Private/public profile separation is explicit.
- [ ] `/home/hamza` default and unrestricted personal path semantics are represented in Tasks 2-3.
- [ ] `apply_patch` uses the three-way `PATCH_WINS | BOTH_EARN_PLACE | EDIT_WINS` gate and does not silently replace proven edit/write semantics.
- [ ] tmux owns PTY lifetime in the qualified Task 6 baseline; broker/MCP do not, and the production two-unit systemd restart test proves broker restart preserves tmux and PTY PIDs.
- [x] Herdr v0.8.0 was evaluated as a same-workload Terminal/await challenger; `TMUX_BROKER_WINS` and Herdr is not a production dependency.
- [x] Retained dead `remain-on-exit` panes reconcile without broker-start failure; the mixed live/dead double-restart regression passes.
- [ ] Human takeover is single-writer and sudo passwords are never broker-logged.
- [ ] Terminal model-cursor state is broker-owned per session, bounded/recoverable, and never silently reinterprets rotated bytes or becomes a hidden global cursor.
- [ ] `await` follows real Terminal product-path evidence plus the Herdr wait/lifecycle verdict, and no `terminal_wait` signature is frozen before a focused sub-spec.
- [x] CodeDB children are rooted per repo; no per-call `project=` architecture returns.
- [x] CodeDB raw 10-tool surface is hidden; the qualified facade is `code_search`, `code_context`, `code_symbol`.
- [x] Automatic RTK integration is rejected; native Bash remains the harness path and explicit RTK helpers stay optional outside the architecture.
- [x] The mutation-consistency trigger fired and a focused atomic same-path design exists; Task 12.5 implements it before any model-visible hash field is considered.
- [ ] Structured codecs remain evidence-triggered and Task 13 still has to audit the final payloads.
- [ ] Final live restart happens outside the MCP process tree being replaced.
- [ ] ChatGPT Actions Refresh + fresh-session acceptance is a mandatory gate after provider changes.

---

## Execution Handoff

Plan complete. At execution time create an isolated worktree using `superpowers:using-git-worktrees` from the current private `main` baseline selected for Phase 2, then choose one execution mode:

1. **Subagent-Driven (recommended)** — use `superpowers:subagent-driven-development`, one fresh worker per independently reviewable task, with integration checkpoints at each wave boundary.
2. **Inline Execution** — use `superpowers:executing-plans`, implementing tasks sequentially with review checkpoints.

If public-release work is simultaneously mutating the private repository, either use disjoint worktrees/path ownership or pause only the conflicting integration step. Do not block the personal harness as an architectural prerequisite.
