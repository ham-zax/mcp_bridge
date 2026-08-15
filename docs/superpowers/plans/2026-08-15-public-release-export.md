# Public Release Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a clean, launch-quality public repository at `/home/hamza/repo/mcp-dev-bridge-public` from an explicit deny-by-default export contract while keeping `satori_bridge` private and preserving its live deployment.

**Architecture:** Harden the private product source so the released trust profiles are simple (`restricted = read/edit/write`, `trusted-dev = read/edit/write/bash`), rewrite the user-facing docs as public product material, and add a private transactional exporter that stages only an explicit allowlist. The exporter validates privacy, product semantics, tests, and Git independence before creating or updating a separate public repository with fresh history.

**Tech Stack:** Bash, Node.js >=22.19, 1MCP 0.34.4, Pi coding primitives 0.84.1, Git, GitHub Actions, systemd user services, Cloudflare Tunnel.

## Global Constraints

- `satori_bridge` remains the private engineering source of truth; do not publish its Git history.
- Do not export `docs/superpowers/**`, `docs/benchmarks/**`, logs, sessions, runtime state, worktree metadata, `node_modules`, `__pycache__`, or `.pyc` files.
- The public repository must be generated from an explicit allowlist, never by copying the private tree and pruning it afterward.
- The public `restricted` profile exposes only `read`, `edit`, and `write`.
- The public `trusted-dev` profile exposes `read`, `edit`, `write`, and unrestricted `bash` as the Linux service user.
- Built-in 1MCP OAuth must not be described as a human identity perimeter for arbitrary internet users.
- Public positioning is a self-hosted Linux/WSL bridge for ChatGPT, not OpenAI software and not a multi-user SaaS.
- The public destination must start with fresh Git history, no remote, and no linkage to private Git objects or refs.
- The private live bridge must not be restarted or rerendered as part of this publication pass.
- Publication failures are fail-closed and must not partially replace the public destination.

---

## File Structure

### Private source changes

- Modify: `config/templates/mcp.json` — remove the legacy Shell provider; keep only the Pi-backed `dev` provider.
- Modify: `config/profiles/restricted.env` — set the Pi shell mode to disabled without legacy-shell allowlist variables.
- Modify: `config/profiles/trusted-dev.env` — retain unrestricted Pi Bash.
- Modify: `providers/pi-dev/server.mjs` — accept `disabled|unrestricted` and register Bash only for `unrestricted`.
- Delete: `providers/legacy-shell/server.py` — no longer part of the released product.
- Modify: `scripts/render-config.mjs` — render a single `dev` provider for both profiles and remove legacy Shell substitutions/deletion logic.
- Modify: `scripts/setup.sh` — remove `mcp-shell-server`, `uv`, and `uvx` requirements; retain pinned 1MCP/Pi installation and fail-closed CSP patch.
- Modify: `scripts/smoke-local.sh` — expect exactly one `dev` provider for both profiles and `disabled|unrestricted` Pi shell mode.
- Modify: `tests/harness.sh` — lock the final two-profile Pi-only surface.
- Modify: `tests/publication.sh` — lock public product semantics and remove legacy-shell/migration-history assumptions.
- Modify: `tests/lifecycle.sh` — test the canonical `bin/` lifecycle directly and remove compatibility-wrapper/legacy-shell dependencies from the public suite.

### Public documentation/source

- Rewrite: `README.md`
- Rewrite: `SECURITY.md`
- Rewrite: `CONTRIBUTING.md`
- Rewrite: `.env.example`
- Rewrite: `.gitignore`
- Rewrite: `docs/acceptance.md`
- Rewrite: `docs/architecture.md`
- Rewrite: `docs/configuration.md`
- Rewrite: `docs/development.md`
- Rewrite: `docs/installation.md`
- Rewrite: `docs/operations.md`
- Rewrite: `docs/security.md`
- Create: `.github/workflows/ci.yml`

### Private publication machinery

- Create: `publication/public-files.txt` — exact public allowlist.
- Create: `scripts/export-public-release.mjs` — transactional staged exporter and validator.
- Create: `tests/public-export.sh` — exporter/privacy/independence regression tests.

### Public destination

- Create/update: `/home/hamza/repo/mcp-dev-bridge-public`
- Initialize: independent Git repository with initial commit `Initial public release`.

---

### Task 1: Make the released trust profiles Pi-only

**Files:**
- Modify: `config/templates/mcp.json`
- Modify: `config/profiles/restricted.env`
- Modify: `config/profiles/trusted-dev.env`
- Modify: `providers/pi-dev/server.mjs`
- Delete: `providers/legacy-shell/server.py`
- Modify: `scripts/render-config.mjs`
- Modify: `scripts/setup.sh`
- Modify: `scripts/smoke-local.sh`
- Modify: `tests/harness.sh`
- Modify: `tests/publication.sh`

**Interfaces:**
- Consumes: existing `dev` MCP provider and `renderConfig(options)`.
- Produces: both profiles render exactly one provider named `dev`; restricted uses `MCP_DEV_SHELL_MODE=disabled`, trusted-dev uses `MCP_DEV_SHELL_MODE=unrestricted`.

- [ ] **Step 1: Change the harness tests first**

Replace the final-composition assertions with:

```js
const keys = cfg => Object.keys(cfg.mcpServers ?? {}).sort();
if (JSON.stringify(keys(restricted)) !== JSON.stringify(['dev'])) process.exit(1);
if (JSON.stringify(keys(trusted)) !== JSON.stringify(['dev'])) process.exit(1);
if (restricted.mcpServers.dev.env.MCP_DEV_SHELL_MODE !== 'disabled') process.exit(1);
if (trusted.mcpServers.dev.env.MCP_DEV_SHELL_MODE !== 'unrestricted') process.exit(1);
```

Add static assertions that `config/templates/mcp.json`, `scripts/setup.sh`, and the released provider paths contain no `mcp-shell-server`, `legacy-shell`, `MCP_SHELL_ALLOW_COMMANDS`, or `uvx` dependency used for Shell.

Also remove `tests/publication.sh`'s dependency on an already-initialized Git repository. Replace `public_tracked_files()` with a release-candidate iterator:

```bash
public_candidate_files() {
  if [ -f "$ROOT/publication/public-files.txt" ]; then
    sed '/^[[:space:]]*$/d;/^[[:space:]]*#/d' "$ROOT/publication/public-files.txt"
  else
    find "$ROOT" -type f \
      -not -path "$ROOT/.git/*" \
      -not -path "$ROOT/providers/pi-dev/node_modules/*" \
      -not -path "$ROOT/docs/superpowers/*" \
      -not -path "$ROOT/docs/benchmarks/*" \
      -not -path "$ROOT/docs/migration-from-local-bridge.md" \
      -not -path "$ROOT/config/logs/*" \
      -not -path "$ROOT/config/sessions/*" \
      -not -path "$ROOT/run/*" \
      -not -path "$ROOT/publication/*" \
      -not -path "$ROOT/tests/public-export.sh" \
      -not -path "$ROOT/scripts/export-public-release.mjs" \
      -printf '%P\n' | sort
  fi
}
```

Use `public_candidate_files` for identity/copy scans. Replace the `.env` Git-ignore assertion with a direct `.gitignore` contract:

```bash
grep -Fqx '.env' "$ROOT/.gitignore"
```

This lets the same public test suite run in a staged tree before Git initialization.

Update `tests/lifecycle.sh` in the same RED step:

- `test_scripts_are_executable` requires `scripts/setup.sh`, `bin/start`, `bin/status`, `bin/stop`, `lib/bridge/watchdog.sh`, and the lifecycle test itself; it no longer requires compatibility wrapper scripts.
- `test_dependencies_are_pinned` requires 1MCP `0.34.4` and Pi `0.84.1`; it must reject `mcp-shell-server` rather than require it.
- delete `test_compatibility_wrappers_are_thin` and its `run_test` line.
- full-stack fixtures call `"$ROOT/bin/start"` and `"$ROOT/bin/stop"` directly instead of `scripts/start.sh`/`scripts/stop.sh`.

Remove the legacy OAuth migration/guide tests from `tests/publication.sh`; those private migration artifacts are intentionally not part of the public release contract.

- [ ] **Step 2: Verify the changed tests fail for the current source**

Run:

```bash
bash tests/harness.sh
bash tests/publication.sh
```

Expected: failures showing restricted still renders `dev + shell` and legacy Shell source/dependencies remain.

- [ ] **Step 3: Replace the MCP template with the single-provider shape**

`config/templates/mcp.json` must contain only:

```json
{
  "$schema": "https://docs.1mcp.app/schemas/v1.0.0/mcp-config.json",
  "version": "1.0.0",
  "mcpServers": {
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
  }
}
```

- [ ] **Step 4: Simplify profile files**

`config/profiles/restricted.env`:

```dotenv
MCP_SHELL_MODE=disabled
```

`config/profiles/trusted-dev.env`:

```dotenv
MCP_SHELL_MODE=unrestricted
```

- [ ] **Step 5: Teach the Pi provider the explicit disabled mode**

In `providers/pi-dev/server.mjs`, change startup validation to:

```js
const mode = process.env.MCP_DEV_SHELL_MODE;
if (!['disabled', 'unrestricted'].includes(mode)) {
  console.error('MCP_DEV_SHELL_MODE must be disabled or unrestricted');
  process.exit(2);
}
```

Keep Bash registration guarded by:

```js
if (mode === 'unrestricted') {
  // register bash
}
```

- [ ] **Step 6: Remove legacy Shell rendering code**

In `scripts/render-config.mjs`:

```js
const shellMode = profileValues.MCP_SHELL_MODE;
if (!['disabled', 'unrestricted'].includes(shellMode)) {
  throw new Error(`profile ${profile} must set MCP_SHELL_MODE=disabled or unrestricted`);
}
```

Remove `__SHELL_ALLOW_COMMANDS__`, `__SHELL_ALLOW_PATTERNS__`, and `__SHELL_ALLOW_DANGEROUS__` replacements and remove the `if (profile === 'trusted-dev') delete rendered.mcpServers.shell` block because the template no longer contains Shell.

- [ ] **Step 7: Remove the legacy Shell package/runtime requirement**

Delete `providers/legacy-shell/server.py`.

In `scripts/setup.sh`:

```bash
ONE_MCP_VERSION="0.34.4"
```

Remove `SHELL_MCP_VERSION`, the shell-MCP status line, and `uv uvx` from the prerequisite loop. The prerequisite loop becomes:

```bash
for cmd in node npm npx cloudflared curl flock; do
```

Update help text to:

```text
--profile restricted   Workspace-confined Read/Edit/Write only
--profile trusted-dev  Read/Edit/Write plus unrestricted Bash as the Linux service user
```

- [ ] **Step 8: Update smoke semantics**

In `scripts/smoke-local.sh`, the expected provider set for both known profiles is `['dev']`. Validate:

```js
if (!['disabled', 'unrestricted'].includes(env.MCP_DEV_SHELL_MODE)) {
  throw new Error('MCP_DEV_SHELL_MODE must be disabled or unrestricted');
}
```

Update the final human-facing line to:

```text
(connectivity check only; final tool surface: restricted Read/Edit/Write, trusted-dev Read/Edit/Write/Bash)
```

- [ ] **Step 9: Run the product regression gate**

Run:

```bash
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
npm --prefix providers/pi-dev test
bash -n bin/* lib/bridge/*.sh scripts/*.sh tests/*.sh
node --check scripts/render-config.mjs
node --check providers/pi-dev/server.mjs
```

Expected: all pass. Do not restart or rerender the live service.

- [ ] **Step 10: Commit the profile hardening**

```bash
git add config providers/pi-dev scripts tests

git commit -m "feat: simplify public trust profiles"
```

---

### Task 2: Rewrite the README and user docs as launch-quality public product material

**Files:**
- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `CONTRIBUTING.md`
- Modify: `.env.example`
- Modify: `.gitignore`
- Modify: `docs/acceptance.md`
- Modify: `docs/architecture.md`
- Modify: `docs/configuration.md`
- Modify: `docs/development.md`
- Modify: `docs/installation.md`
- Modify: `docs/operations.md`
- Modify: `docs/security.md`

**Interfaces:**
- Consumes: final Task 1 profile behavior.
- Produces: public-facing documentation with no candidate/correction/build-history narrative.

- [ ] **Step 1: Add documentation assertions before rewriting**

Extend `tests/publication.sh` with a `test_public_product_copy()` check requiring the README to contain these literal anchors:

```text
Four native coding primitives
restricted
trusted-dev
Public beta
not affiliated with or endorsed by OpenAI
```

Require `docs/security.md` to contain:

```text
workspace-confined
Linux service user
identity perimeter
refresh token
multi-user SaaS
```

Reject these patterns from **public copy files only** (`README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `examples/**/*.md`, and `docs/*.md`). Do not scan test/code source for narrative keywords because publication tests legitimately name the strings they reject.

```text
correction phase
CUTOVER_CONFIRMED
ROUTER_EXPERIMENT
Previous verdict
worktree
CodeDB
GCF
legacy shell
```

- [ ] **Step 2: Verify the new doc assertions fail**

Run:

```bash
bash tests/publication.sh
```

Expected: failure on the current README/security/internal-development wording.

- [ ] **Step 3: Rewrite `README.md` with this public structure**

The first screen must use this product story:

```markdown
# MCP Development Bridge

**Four native coding primitives for ChatGPT on your Linux or WSL workspace: Read, Edit, Write, and optional trusted Bash.**

MCP Development Bridge is a self-hosted development bridge built for people who want ChatGPT to work against a real local codebase without exposing a huge generic tool catalog. File operations stay workspace-relative; edits are exact and guarded; writes are create-only; and trusted machines can opt into native Bash semantics.

> Independent open-source project. Not affiliated with or endorsed by OpenAI. ChatGPT is a trademark of OpenAI.
```

Then use these sections in this order:

```text
Why this bridge
Four native primitives
Choose your trust profile
How it works
Quick start
Behavior that matters
Security model
Operations
Public beta status
Documentation
Contributing
License
```

The trust table must communicate:

```text
restricted  Read/Edit/Write       workspace-confined file operations
trusted-dev Read/Edit/Write/Bash  Bash has Linux service-user authority
```

Do not mention CodeDB, GCF, correction phases, benchmark verdicts, worktrees, or private publication history.

- [ ] **Step 4: Rewrite installation/configuration docs around user decisions**

`docs/installation.md` must lead with:

```text
Requirements
1. Clone
2. Configure .env
3. Choose a profile
4. Run setup
5. Install/start the user service
6. Connect ChatGPT
7. Verify
```

State Node.js `>=22.19`, npm/npx, `cloudflared`, `curl`, `flock`, and Linux/WSL with systemd user services for the supplied unit. Do not list `uv`/`uvx`.

`docs/configuration.md` must explain only:

```text
MCP_WORKSPACE_ROOT
MCP_PUBLIC_URL
MCP_TUNNEL_NAME
MCP_DEV_MAX_OUTPUT_BYTES
restricted vs trusted-dev
state-dir override
```

Use generic examples such as `/home/alice/code` and `https://mcp.example.com`.

- [ ] **Step 5: Rewrite architecture/security/operations docs**

`docs/architecture.md` should contain the compact path:

```text
ChatGPT
  -> authenticated MCP route
  -> 1MCP on loopback
  -> dev provider
  -> configured Linux/WSL workspace
```

`docs/security.md` must explicitly state:

- Read/Edit/Write reject absolute paths, `..` traversal, and symlink escapes outside the workspace.
- `trusted-dev` Bash is not sandboxed and has Linux service-user authority.
- 1MCP OAuth authorization is not itself a human owner/team identity perimeter.
- public exposure requires an authenticated perimeter appropriate to the deployment/connectivity model.
- pinned 1MCP uses finite-lived access-token sessions and has no refresh-token exchange; reconnect may be required.
- this beta is not a multi-user SaaS isolation boundary.

`docs/operations.md` must focus on `bin/start`, `bin/status`, `bin/stop`, external XDG state, watchdog recovery, logs, and safe upgrade/re-render steps.

- [ ] **Step 6: Rewrite contributor/acceptance docs**

`docs/development.md` should describe only the public code layout and commands:

```bash
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
npm --prefix providers/pi-dev ci
npm --prefix providers/pi-dev test
```

`docs/acceptance.md` should be an external installation/release checklist: render both profiles into temporary state, assert exact tools, run local initialize smoke, inspect status, and perform one harmless Read/Write/Edit/Bash smoke according to profile.

`CONTRIBUTING.md` should point contributors to `docs/development.md`, require tests for behavior changes, and forbid committing runtime state/secrets.

Rewrite `examples/wsl-trusted-dev/README.md` as a generic trusted-dev example with no internal history and make `examples/wsl-trusted-dev/.env.example` use generic workspace/domain values only.

- [ ] **Step 7: Tighten `.env.example` and `.gitignore`**

`.env.example` must contain only generic placeholders and comments for the four supported deployment inputs.

`.gitignore` must include at least:

```gitignore
.env
run/
config/logs/
config/sessions/
node_modules/
**/node_modules/
__pycache__/
*.pyc
.worktrees/
```

- [ ] **Step 8: Run documentation/publication tests**

```bash
bash tests/publication.sh
bash tests/harness.sh
git diff --check
```

Expected: pass and no internal narrative in public-facing files.

- [ ] **Step 9: Commit the public product voice**

```bash
git add README.md SECURITY.md CONTRIBUTING.md .env.example .gitignore docs tests/publication.sh

git commit -m "docs: prepare public beta documentation"
```

---

### Task 3: Add portable public CI

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `tests/publication.sh`

**Interfaces:**
- Consumes: Task 1 product tests and Task 2 public documentation.
- Produces: a portable GitHub Actions gate that does not require a live tunnel, systemd user bus, or ChatGPT authorization.

- [ ] **Step 1: Add a publication assertion that CI exists**

Require `.github/workflows/ci.yml` and the strings:

```text
setup-node
node-version: '24'
npm --prefix providers/pi-dev ci
npm --prefix providers/pi-dev audit --omit=dev
tests/harness.sh
tests/publication.sh
tests/lifecycle.sh
```

- [ ] **Step 2: Verify the CI assertion fails before creating the workflow**

Run:

```bash
bash tests/publication.sh
```

Expected: CI contract failure.

- [ ] **Step 3: Create `.github/workflows/ci.yml`**

Use:

```yaml
name: CI

on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm
          cache-dependency-path: providers/pi-dev/package-lock.json
      - name: Install Pi provider dependencies
        run: npm --prefix providers/pi-dev ci
      - name: Shell syntax
        run: bash -n bin/* lib/bridge/*.sh scripts/*.sh tests/*.sh
      - name: Node syntax
        run: |
          node --check scripts/render-config.mjs
          node --check providers/pi-dev/server.mjs
      - name: Harness tests
        run: bash tests/harness.sh
      - name: Publication tests
        run: bash tests/publication.sh
      - name: Lifecycle tests
        run: bash tests/lifecycle.sh
      - name: Pi provider tests
        run: npm --prefix providers/pi-dev test
      - name: Dependency audit
        run: npm --prefix providers/pi-dev audit --omit=dev
```

- [ ] **Step 4: Run the same portable gate locally**

```bash
npm --prefix providers/pi-dev ci
bash -n bin/* lib/bridge/*.sh scripts/*.sh tests/*.sh
node --check scripts/render-config.mjs
node --check providers/pi-dev/server.mjs
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
npm --prefix providers/pi-dev test
npm --prefix providers/pi-dev audit --omit=dev
```

Expected: all pass.

- [ ] **Step 5: Commit CI**

```bash
git add .github/workflows/ci.yml tests/publication.sh

git commit -m "ci: add public release verification"
```

---

### Task 4: Build the private deny-by-default export contract

**Files:**
- Create: `publication/public-files.txt`
- Create: `scripts/export-public-release.mjs`
- Create: `tests/public-export.sh`

**Interfaces:**
- Consumes: private source root and exact manifest.
- Produces: validated staging tree and destination update at `/home/hamza/repo/mcp-dev-bridge-public`.

- [ ] **Step 1: Write failing exporter tests**

`tests/public-export.sh` must create temporary fixture destinations and assert:

1. all exported files are listed by `publication/public-files.txt`;
2. forbidden paths cannot appear;
3. missing allowlisted source fails;
4. a dirty existing destination fails without mutation;
5. a known private identifier injected into an allowlisted file fails staging;
6. initial export contains no `.git` copied from private source;
7. the exporter does not configure a remote;
8. a successful export contains the expected public README, CI, provider, profile, and docs.

Use a test-only destination override:

```bash
node scripts/export-public-release.mjs --destination "$tmp/public" --no-git-init
```

and a test-only source override only for fixture copies:

```bash
node scripts/export-public-release.mjs --source "$tmp/private" --destination "$tmp/public" --no-git-init
```

- [ ] **Step 2: Verify exporter tests fail because the exporter/manifest do not exist**

Run:

```bash
bash tests/public-export.sh
```

Expected: failure on missing exporter/manifest.

- [ ] **Step 3: Create the exact manifest**

`publication/public-files.txt` must enumerate only these product paths/subtrees:

```text
.env.example
.gitignore
.github/workflows/ci.yml
CONTRIBUTING.md
LICENSE
README.md
SECURITY.md
bin/start
bin/status
bin/stop
config/profiles/restricted.env
config/profiles/trusted-dev.env
config/templates/mcp.json
examples/wsl-trusted-dev/.env.example
examples/wsl-trusted-dev/README.md
lib/bridge/common.sh
lib/bridge/watchdog.sh
providers/pi-dev/.gitignore
providers/pi-dev/boundary.mjs
providers/pi-dev/files.mjs
providers/pi-dev/package-lock.json
providers/pi-dev/package.json
providers/pi-dev/render.mjs
providers/pi-dev/server.mjs
providers/pi-dev/shell.mjs
providers/pi-dev/test/boundary.test.mjs
providers/pi-dev/test/files.test.mjs
providers/pi-dev/test/render.test.mjs
providers/pi-dev/test/server.test.mjs
providers/pi-dev/test/shell.test.mjs
scripts/install-systemd-user.sh
scripts/render-config.mjs
scripts/setup.sh
scripts/smoke-local.sh
systemd/mcp-dev-bridge.service.in
tests/harness.sh
tests/lifecycle.sh
tests/publication.sh
docs/acceptance.md
docs/architecture.md
docs/configuration.md
docs/development.md
docs/installation.md
docs/operations.md
docs/security.md
```

Do not include the exporter, manifest, `tests/public-export.sh`, compatibility wrappers, migration helper, legacy Shell, benchmarks, or superpowers docs.

- [ ] **Step 4: Implement CLI parsing and staging in `scripts/export-public-release.mjs`**

Supported arguments:

```text
--source PATH       default: private repo root
--destination PATH  default: /home/hamza/repo/mcp-dev-bridge-public
--no-git-init       test mode; populate validated destination without git init/commit
--help
```

Resolve the manifest from the real private repo containing the exporter, not from an arbitrary fixture source.

For every manifest line:

```js
const sourcePath = path.join(sourceRoot, relativePath);
const targetPath = path.join(stageRoot, relativePath);
await fs.stat(sourcePath); // fail if missing or not a regular file
await fs.mkdir(path.dirname(targetPath), { recursive: true });
await fs.copyFile(sourcePath, targetPath);
```

Never call recursive copy on the private repository root.

- [ ] **Step 5: Implement fail-closed staging validation**

Walk staging and reject paths matching:

```js
const forbiddenPathPatterns = [
  /^\.git(?:\/|$)/,
  /^docs\/superpowers(?:\/|$)/,
  /^docs\/benchmarks(?:\/|$)/,
  /^config\/logs(?:\/|$)/,
  /^config\/sessions(?:\/|$)/,
  /^run(?:\/|$)/,
  /(^|\/)node_modules(?:\/|$)/,
  /(^|\/)__pycache__(?:\/|$)/,
  /\.pyc$/,
  /(^|\/)\.worktrees(?:\/|$)/,
];
```

Run two separate text scans.

Scan **all exported text files** for private identity/credential forms:

```js
const forbiddenPrivateTextPatterns = [
  /\/home\/hamza(?:\/|\b)/i,
  /mcp\.hamza\.my\.id/i,
  /DESKTOP-HQOUFCO/i,
  /hamza-cloudflare-oauth-bridge/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:access_token|client_secret|api[_-]?key)\s*[:=]/i,
];
```

Then scan only public copy files (`README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `examples/**/*.md`, `docs/*.md`) for internal engineering narrative:

```js
const forbiddenNarrativePatterns = [
  /docs\/superpowers/i,
  /docs\/benchmarks/i,
  /\bCUTOVER_CONFIRMED\b/i,
  /\bROUTER_EXPERIMENT\b/i,
  /\bcorrection phase\b/i,
  /\bCodeDB\b/i,
  /\bGCF\b/i,
  /\blegacy shell\b/i,
];
```

The credential scan deliberately allows generic documentation words such as `token`; it rejects assignment-like secret forms and private-key material.

- [ ] **Step 6: Validate public semantics inside staging**

Parse `config/templates/mcp.json` and require exactly `dev`.

Require:

```text
config/profiles/restricted.env -> MCP_SHELL_MODE=disabled
config/profiles/trusted-dev.env -> MCP_SHELL_MODE=unrestricted
```

Reject `legacy-shell` and `mcp-shell-server` from all exported product source. Reject `CodeDB`, `GCF`, and internal correction-phase language only from public copy files so the publication test suite can name forbidden narrative patterns without failing its own exporter scan.

- [ ] **Step 7: Run staged tests before destination update**

Execute from staging with `child_process.spawnSync` and inherited output:

```text
npm --prefix providers/pi-dev ci --ignore-scripts=false
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
npm --prefix providers/pi-dev test
npm --prefix providers/pi-dev audit --omit=dev
bash -n bin/* lib/bridge/*.sh scripts/*.sh tests/*.sh
node --check scripts/render-config.mjs
node --check providers/pi-dev/server.mjs
```

Use explicit argument arrays rather than `shell: true` for Node-spawned commands. For the `bash -n` glob step, invoke `bash -lc` with only stage-owned static paths.

The staged dependency install is verification-only. After tests, remove generated dependencies and re-run path/text validation before destination update:

```js
await fs.rm(path.join(stageRoot, 'providers', 'pi-dev', 'node_modules'), { recursive: true, force: true });
await validateStaging(stageRoot);
```

This prevents verification artifacts from entering the public snapshot.

- [ ] **Step 8: Implement transactional destination replacement**

Rules:

- If destination does not exist, rename validated staging into place.
- If destination exists and contains `.git`, require `git status --porcelain` to be empty before update.
- Preserve existing public `.git` on future exports; replace only the working tree using a backup/rename transaction.
- If validation or replacement fails, leave the previous destination available.
- Never read/copy private `.git`.

For initial creation with Git enabled, initialize only after the validated staging tree is in the destination. Configure a repository-local neutral publication identity so a private developer email cannot leak into the first public commit:

```text
git init -b main
git config user.name "MCP Development Bridge"
git config user.email "noreply@mcp-dev-bridge.invalid"
git add .
git commit -m "Initial public release"
```

Then verify:

```text
git rev-list --count HEAD == 1
git remote == empty
git log -1 --format=%an == MCP Development Bridge
git log -1 --format=%ae == noreply@mcp-dev-bridge.invalid
```

- [ ] **Step 9: Make exporter tests pass**

Run:

```bash
bash tests/public-export.sh
```

Expected: all exporter/privacy/transaction tests pass.

- [ ] **Step 10: Commit private publication machinery**

```bash
git add publication/public-files.txt scripts/export-public-release.mjs tests/public-export.sh

git commit -m "feat: add deny-by-default public exporter"
```

---

### Task 5: Create the independent public repository

**Files:**
- Create/update: `/home/hamza/repo/mcp-dev-bridge-public/**`

**Interfaces:**
- Consumes: Task 4 exporter.
- Produces: one-commit independent public repository with no remote.

- [ ] **Step 1: Verify private source is clean before export**

Run:

```bash
git status --short
```

Expected: empty.

- [ ] **Step 2: Run the full private release gate**

```bash
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
bash tests/public-export.sh
npm --prefix providers/pi-dev test
npm --prefix providers/pi-dev audit --omit=dev
git diff --check
```

Expected: all pass.

- [ ] **Step 3: Create the public tree through the exporter**

Run:

```bash
node scripts/export-public-release.mjs --destination /home/hamza/repo/mcp-dev-bridge-public
```

Expected: exporter reports staged validation success, destination creation, one initial commit, and no remote.

- [ ] **Step 4: Prove Git independence**

Run:

```bash
git -C /home/hamza/repo/mcp-dev-bridge-public rev-list --count HEAD
git -C /home/hamza/repo/mcp-dev-bridge-public log --oneline --decorate -3
git -C /home/hamza/repo/mcp-dev-bridge-public remote -v
git -C /home/hamza/repo/mcp-dev-bridge-public rev-parse --git-common-dir
```

Expected:

```text
1
<hash> Initial public release
```

No remote output, the Git common dir resolves inside `mcp-dev-bridge-public/.git`, and the commit author is `MCP Development Bridge <noreply@mcp-dev-bridge.invalid>` rather than a private developer email.

- [ ] **Step 5: Verify forbidden/private material is absent**

Run searches from the public tree for:

```text
/home/hamza
mcp.hamza.my.id
DESKTOP-HQOUFCO
hamza-cloudflare-oauth-bridge
docs/superpowers
docs/benchmarks
CUTOVER_CONFIRMED
ROUTER_EXPERIMENT
correction phase
CodeDB
GCF
```

Expected: zero matches.

Also verify these paths are absent:

```text
docs/superpowers
docs/benchmarks
config/logs
config/sessions
run
providers/legacy-shell
publication
scripts/export-public-release.mjs
tests/public-export.sh
```

- [ ] **Step 6: Run public tests from the public repository itself**

```bash
npm --prefix providers/pi-dev ci
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
npm --prefix providers/pi-dev test
npm --prefix providers/pi-dev audit --omit=dev
bash -n bin/* lib/bridge/*.sh scripts/*.sh tests/*.sh
node --check scripts/render-config.mjs
node --check providers/pi-dev/server.mjs
git diff --check
git status --short
```

Expected: all pass and public working tree clean.

- [ ] **Step 7: Confirm private live deployment was untouched**

Run read-only checks from the private checkout:

```bash
bin/status
```

Expected: the existing trusted-dev bridge remains healthy. Do not run `bin/start`, `bin/stop`, setup, render, or systemd lifecycle commands as part of publication.

---

### Task 6: Final public-facing release review

**Files:**
- Public repository only; modify public-facing copy only if the review finds wording/polish defects, then mirror the same source changes back into private `satori_bridge` before re-exporting.

**Interfaces:**
- Consumes: created public repository.
- Produces: final human-review candidate, still with no remote/push.

- [ ] **Step 1: Review the README as a first-time visitor**

Check that the first screen answers:

```text
What is this?
Why would I use it?
What tools does it expose?
What is restricted vs trusted?
How do I start?
Is it official OpenAI software? (No.)
```

Reject copy that is dominated by implementation history, benchmark numbers, or security boilerplate before the value proposition.

- [ ] **Step 2: Review docs as one coherent path**

Follow this reader journey without private knowledge:

```text
README -> Installation -> Configuration -> Security -> Operations -> Acceptance
```

Every command and profile statement must agree with the exported source.

- [ ] **Step 3: Verify beta claims are accurate**

Require the public copy to say:

- self-hosted Linux/WSL;
- public beta;
- `restricted` is file-only workspace confinement;
- `trusted-dev` Bash is unrestricted service-user authority;
- OAuth authorization is not a complete human identity perimeter;
- finite-lived/no-refresh 1MCP authorization may require reconnect;
- not multi-user SaaS;
- independent/not endorsed by OpenAI.

- [ ] **Step 4: If copy changes are needed, change private source and re-export**

Do not hand-edit the public repository as the source of truth. Apply wording changes to `satori_bridge`, run Task 5 gates again, and regenerate the public tree so future exports remain reproducible.

- [ ] **Step 5: Final completion evidence**

Record:

```text
private source HEAD
public HEAD
public commit count = 1
public remote count = 0
private status clean
public status clean
all public tests pass
live private bridge healthy
```

At this point the public tree is ready for the user's final manual review. GitHub repository creation, adding a remote, and pushing remain explicitly out of scope.
