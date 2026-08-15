# Personal WSL Codex-Like Harness Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the private WSL bridge into a durable Codex-like local coding harness: unrestricted file and Bash access as user `hamza`, Codex-style patching, a rich native CLI toolbox, persistent tmux-backed terminal sessions with human takeover, a small multi-repository Code intelligence facade, and evidence-gated output/context optimizations.

**Architecture:** Keep Cloudflare + OAuth + 1MCP as transport. Keep Files/Shell in the Pi-backed `dev` provider, but add a private `personal` profile whose filesystem boundary is the Linux user account rather than a workspace sandbox and whose stable default directory is `/home/hamza`. Add a separate `terminal` MCP provider backed by a small Unix-socket broker and a dedicated tmux server so PTYs survive ChatGPT/1MCP/provider restarts. Add a separate `code` MCP provider only after a rooted-CodeDB child-process router proves useful across multiple repositories. Public-release profiles remain isolated from all private-only capability.

**Tech Stack:** Node.js >= 22.19, `@modelcontextprotocol/sdk` 1.30.0, `@earendil-works/pi-coding-agent` 0.84.1, Bash, tmux >= 3.4, user systemd, Git, CodeDB 0.2.5840 for the first router experiment, ast-grep 0.45.0 for the CLI-toolbox phase, optional RTK after raw Bash/Terminal are proven.

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
- `apply_patch` does not replace `edit` or `write` until its own correctness/ergonomics benchmark produces an explicit `PATCH_WINS`, `BOTH_EARN_PLACE`, or `EDIT_WINS` verdict.
- The Code domain must never return to exposing CodeDB's entire 10-tool catalog directly without an explicit later decision.
- `await` semantics are designed only after Terminal is live and measured.
- RTK remains optional output shaping with a permanent raw/native bypass.
- Stronger model-visible hash/CAS is evidence-triggered; current exact-edit/snapshot guards remain until repeated real or reproducible silent-lost-update evidence justifies a focused CAS design. Do not add stronger model-visible CAS inline merely because synthetic stress exists.
- GCF/TOON remain evidence-triggered for genuinely structured bulk payloads; they are not mandatory Phase-2 implementation work and are not applied to source, patches, normal terminal output, or active diagnostics unless a new real payload class triggers a focused benchmark.
- One designated integrator owns staging and commits during shared-tree work.

---

## Target Model-Facing Surface

The plan is allowed to change the exact final count based on benchmark gates, but the intended mental model is:

```text
FILES / SHELL
  read
  apply_patch     # if experiment wins
  write
  bash
  edit            # retained only if patch does not clearly replace it

TERMINAL
  terminal_open
  terminal_read
  terminal_send
  terminal_resize
  terminal_list
  terminal_close
  # any wait/resume action exists only if the post-Terminal sub-spec qualifies it

CODE
  code(...)                         # candidate A
  # OR a small explicit facade      # candidate B
  code_search / code_context / code_symbol
```

The goal is not "four actions forever." The goal is four obvious capability domains with native representations and the smallest practical schemas.

---

## File Structure

### Existing private Dev provider

- Modify: `providers/pi-dev/server.mjs` — private path mode, optional `apply_patch`, final personal tool registration.
- Modify: `providers/pi-dev/boundary.mjs` — add unrestricted-user path resolution without weakening public workspace confinement.
- Modify: `providers/pi-dev/files.mjs` — route public/private path policies and retain strict-edit/create semantics.
- Modify: `providers/pi-dev/shell.mjs` — private absolute/relative cwd semantics and later optional RTK policy.
- Modify: `providers/pi-dev/render.mjs` — patch/RTK result rendering only when required.
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

### Await/resume

- Create a focused `docs/superpowers/specs/YYYY-MM-DD-terminal-await-design.md` only after real Terminal product-path evidence exists.
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
- Consumes: Terminal broker socket.
- Produces: six MCP tools and a human attach CLI.

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
- Consumes: real ChatGPT -> Cloudflare -> OAuth -> 1MCP -> Terminal latency/read/poll behavior from Task 7 product acceptance.
- Produces: `NO_WAIT_TOOL_NEEDED` or an approved focused wait/resume design. This task does **not** predeclare a `terminal_wait` API.

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
Terminal-specific waiting
```

against:

```text
generic local condition/wait service
```

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

### Task 11: Run Selective RTK as an Optional Bash Output Experiment

**Files:**
- Modify: `providers/pi-dev/shell.mjs`
- Modify: `providers/pi-dev/server.mjs`
- Modify: `providers/pi-dev/test/shell.test.mjs`
- Create/Modify: `docs/benchmarks/rtk.md`
- Modify: `config/profiles/personal.env` only if the experiment wins.

**Interfaces:**
- Consumes: proven raw Pi Bash.
- Produces: `RTK_KEEP` or `RTK_REMOVE`; raw execution remains permanently available.

- [ ] **Step 1: Install/verify one stable RTK binary for the experiment**

Record exact version/checksum in `docs/benchmarks/rtk.md` before integration. Do not install client hooks into unrelated agents.

- [ ] **Step 2: Add RED tests for optional policy**

Internal policy modes:

```text
raw
rtk-auto
```

If `rtk-auto` is active, use RTK's rewrite mechanism only for commands it explicitly recognizes. Unsupported commands execute unchanged.

- [ ] **Step 3: Preserve an explicit raw bypass**

Add optional Bash input:

```text
raw?: boolean
```

`raw=true` always executes the original native Bash command without RTK rewriting.

- [ ] **Step 4: Benchmark at least 20 real commands**

Include:

```text
git status
git diff
git log
rg
pnpm/npm test
cargo/go/python test if available in real repos
pipelines
redirections
failing tests
commands where exact raw diagnostics matter
```

Measure correctness first, then context reduction. Any silent semantic change or lost debugging evidence is a blocker for default-on use.

- [ ] **Step 5: Apply verdict**

```text
RTK_KEEP   -> personal profile may default to rtk-auto, raw bypass remains
RTK_REMOVE -> remove integration; raw Pi Bash remains unchanged
```

- [ ] **Step 6: Commit**

```bash
(cd providers/pi-dev && npm test)
git add providers/pi-dev docs/benchmarks/rtk.md config/profiles/personal.env
git commit -m "feat: decide selective RTK output policy"
```

Use a `docs:` commit if RTK is removed and only benchmark evidence remains.

---

### Task 12: Run Concurrency Regression and Keep Stronger CAS Deferred Unless Its Trigger Fires

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
- Consumes: verdicts from Tasks 4, 8, 10, 11, 12, and 13, including any approved focused await/CAS/format follow-up work.
- Produces: final private `personal` profile and documented Codex-like workflow.

- [ ] **Step 1: Remove losing experimental actions/providers**

No losing tool remains advertised merely because it was implemented during an experiment.

Expected final domains:

```text
Dev       -> read, write, bash, plus apply_patch/edit according to PATCH_WINS | BOTH_EARN_PLACE | EDIT_WINS
Terminal  -> six persistent PTY actions, plus only the wait/resume actions approved by the Task 8 focused sub-spec
Code      -> only the Task 10 winning facade shape
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
| Personal unrestricted WSL Files/Bash | IMPLEMENT_THIS_PHASE |
| Codex-style apply_patch | EXPERIMENT_THIS_PHASE |
| Native CLI toolbox / ast-grep | IMPLEMENT_THIS_PHASE |
| Persistent tmux Terminal | IMPLEMENT_THIS_PHASE |
| Human PTY takeover | IMPLEMENT_THIS_PHASE |
| Terminal wait/resume | DEFERRED_PENDING_TERMINAL_EVIDENCE: Task 8 focused sub-spec gate |
| Multi-repo rooted CodeDB router | EXPERIMENT_THIS_PHASE |
| Small Code facade | EXPERIMENT_THIS_PHASE |
| Selective RTK | EXPERIMENT_THIS_PHASE |
| Stronger model-visible CAS | DEFERRED_WITH_TRIGGER: repeated real or reproducible silent lost-update evidence |
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
Wave 0  Task 1 current private baseline + capability ledger
Wave 1  Tasks 2-3 private path/profile foundation
Wave 2  Task 4 apply_patch + Task 5 CLI toolbox (parallel-safe with file ownership)
Wave 3  Tasks 6-7 Terminal core + MCP/human attach
Wave 4  Task 8 evidence-driven await/resume sub-spec decision
Wave 5  Tasks 9-10 Code router + facade
Wave 6  Tasks 11-13 RTK / concurrency / structured-format decisions
Wave 7  Task 14 final integration/live acceptance
```

Only use parallel agents when owned paths do not overlap. A designated integrator owns `config/templates/*`, `scripts/render-config.mjs`, `tests/harness.sh`, the live deployment, and Git staging/commits whenever two lanes converge.

---

## Self-Review Checklist

Before execution begins, verify:

- [ ] Public release work and personal-harness work are treated as independent projects; simultaneous edits use explicit worktree/file ownership rather than an architectural prerequisite.
- [ ] Private/public profile separation is explicit.
- [ ] `/home/hamza` default and unrestricted personal path semantics are represented in Tasks 2-3.
- [ ] `apply_patch` uses the three-way `PATCH_WINS | BOTH_EARN_PLACE | EDIT_WINS` gate and does not silently replace proven edit/write semantics.
- [ ] tmux owns PTY lifetime; broker/MCP do not, and the production two-unit systemd restart test proves broker restart preserves tmux and PTY PIDs.
- [ ] Human takeover is single-writer and sudo passwords are never broker-logged.
- [ ] Terminal model-cursor state is broker-owned per session, bounded/recoverable, and never silently reinterprets rotated bytes or becomes a hidden global cursor.
- [ ] `await` follows real Terminal product-path evidence and no `terminal_wait` signature is frozen before a focused sub-spec.
- [ ] CodeDB children are rooted per repo; no per-call `project=` architecture returns.
- [ ] CodeDB raw 10-tool surface is not exposed directly.
- [ ] RTK is optional with raw bypass.
- [ ] Stronger CAS and structured codecs remain evidence-triggered.
- [ ] Final live restart happens outside the MCP process tree being replaced.
- [ ] ChatGPT Actions Refresh + fresh-session acceptance is a mandatory gate after provider changes.

---

## Execution Handoff

Plan complete. At execution time create an isolated worktree using `superpowers:using-git-worktrees` from the current private `main` baseline selected for Phase 2, then choose one execution mode:

1. **Subagent-Driven (recommended)** — use `superpowers:subagent-driven-development`, one fresh worker per independently reviewable task, with integration checkpoints at each wave boundary.
2. **Inline Execution** — use `superpowers:executing-plans`, implementing tasks sequentially with review checkpoints.

If public-release work is simultaneously mutating the private repository, either use disjoint worktrees/path ownership or pause only the conflicting integration step. Do not block the personal harness as an architectural prerequisite.
