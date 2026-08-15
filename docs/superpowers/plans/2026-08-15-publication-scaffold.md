# Publication-Ready Repository Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `satori_bridge` into a generic, publishable MCP Development Bridge repository while preserving the proven Cloudflare OAuth lifecycle and keeping Hamza's live deployment untouched until an explicit later migration.

**Architecture:** Public source is generic; deployment identity comes from an ignored `.env`; trust policy is chosen explicitly with `--profile`; generated 1MCP configuration and all mutable runtime/session/log/PID state live outside the Git checkout under XDG runtime/state roots. Public lifecycle commands move to `bin/`, lifecycle internals to `lib/bridge/`, provider code to `providers/`, and legacy script paths remain compatibility wrappers.

**Tech Stack:** Bash, Node.js 24, 1MCP 0.34.4, cloudflared, systemd user services, existing filesystem MCP 2026.7.10, existing mcp-shell-server 1.1.8.

## Global Constraints

- Work only in `/home/hamza/repo/satori_bridge/.worktrees/publication-scaffold` on `chore/publication-scaffold`.
- Do not restart, stop, reconfigure, or replace the live installed bridge while implementing this branch.
- Preserve all 22 current lifecycle behaviors.
- `restricted` and `trusted-dev` are both supported; setup without `--profile` must fail.
- `trusted-dev` remains intentionally unrestricted as the Linux service user.
- Profiles contain policy only; machine paths/domain/tunnel values come from local deployment input.
- New default runtime root: `${XDG_RUNTIME_DIR:-/run/user/$UID}/mcp-dev-bridge`.
- New default persistent state root: `${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge`.
- 1MCP writable home/config directory: `$BRIDGE_STATE_DIR/1mcp`.
- Preserve compatibility fallback to legacy repository `run/` and `config/` until the local installation is deliberately migrated.
- Public tracked source/docs/config must not contain `/home/hamza`, `mcp.hamza.my.id`, `DESKTOP-HQOUFCO`, or personal service names outside `docs/superpowers/` history.
- Do not implement CodeDB, Pi, `await_until`, Terminal, RTK, or GCF in this plan.
- Do not rewrite Git history in this plan; document the need for a clean/squashed public-history review before publication.

---

### Task 1: Add Publication Invariants Before Moving Anything

**Files:**
- Create: `tests/publication.sh`
- Modify: `.gitignore`

**Interfaces:**
- Produces structural checks used by every later task.
- Test accepts temporary `HOME`, `XDG_RUNTIME_DIR`, and `XDG_STATE_HOME` overrides.

- [ ] **Step 1: Write `tests/publication.sh` with failing checks**

The test must assert:

```text
bin/start, bin/status, bin/stop exist and are executable
config/templates/mcp.json exists
config/profiles/restricted.env exists
config/profiles/trusted-dev.env exists
systemd/mcp-dev-bridge.service.in exists
providers/legacy-shell/server.py exists
scripts/render-config.mjs exists
setup without --profile exits nonzero and mentions restricted + trusted-dev
tracked public files contain no personal deployment strings
.env is ignored
runtime/state defaults resolve outside repository
trusted-dev profile contains MCP_SHELL_ALLOW_DANGEROUS=ALL
restricted profile does not contain MCP_SHELL_ALLOW_DANGEROUS=ALL
```

Use `git ls-files` and exclude `docs/superpowers/**` from personal-string scanning.

- [ ] **Step 2: Run RED**

```bash
bash tests/publication.sh
```

Expected: nonzero because the target structure does not exist.

- [ ] **Step 3: Extend `.gitignore` for compatibility/local inputs**

Keep existing ignores and ensure these remain ignored:

```text
.env
run/
config/logs/
config/sessions/
config/*.pid
__pycache__/
*.pyc
.worktrees/
```

Do not add XDG directories because they are outside the repository.

- [ ] **Step 4: Commit the failing publication contract**

```bash
git add tests/publication.sh .gitignore
git commit -m "test: define publication scaffold invariants"
```

---

### Task 2: Add Explicit Profiles, Generic Template, and External Config Renderer

**Files:**
- Create: `config/templates/mcp.json`
- Create: `config/profiles/restricted.env`
- Create: `config/profiles/trusted-dev.env`
- Create: `scripts/render-config.mjs`
- Modify: `.env.example`
- Modify: `scripts/setup.sh`
- Modify: `tests/publication.sh`

**Interfaces:**
- `scripts/render-config.mjs --profile <restricted|trusted-dev> [--env-file PATH] [--state-dir PATH] [--repo-root PATH]`
- Writes `$stateDir/bridge.env` and `$stateDir/1mcp/mcp.json`.
- `scripts/setup.sh --profile ...` installs/verifies dependencies, then invokes renderer.
- No profile argument is an error.

- [ ] **Step 1: Add generic MCP template**

Use exact placeholders:

```text
__WORKSPACE_ROOT__
__REPO_ROOT__
__SHELL_ALLOW_COMMANDS__
__SHELL_ALLOW_PATTERNS__
__SHELL_ALLOW_DANGEROUS__
```

Template keeps the existing pinned filesystem and shell providers but points the shell server at `__REPO_ROOT__/providers/legacy-shell/server.py`.

- [ ] **Step 2: Add profiles**

`restricted.env`:

```text
MCP_SHELL_ALLOW_COMMANDS=git,pnpm,node,npx,rg,grep,ls,cat,pwd,bash,sh
MCP_SHELL_ALLOW_PATTERNS=.*
MCP_SHELL_ALLOW_DANGEROUS=
```

`trusted-dev.env`:

```text
MCP_SHELL_ALLOW_COMMANDS=git,pnpm,node,npx,rg,grep,ls,cat,pwd,bash,sh
MCP_SHELL_ALLOW_PATTERNS=.*
MCP_SHELL_ALLOW_DANGEROUS=ALL
```

- [ ] **Step 3: Make `.env.example` generic**

It must contain:

```text
MCP_WORKSPACE_ROOT=/home/user/code
MCP_PUBLIC_URL=https://mcp.example.com
MCP_TUNNEL_NAME=
```

It must not contain a profile selection.

- [ ] **Step 4: Implement renderer**

Renderer requirements:

```text
profile required and validated
repo root discovered or passed explicitly
env file parsed as simple KEY=VALUE lines
MCP_WORKSPACE_ROOT and MCP_PUBLIC_URL required
state dir defaults to XDG_STATE_HOME/HOME
state dir created mode 0700
1mcp dir created mode 0700
bridge.env records selected profile + deployment values + repo root
mcp.json generated by recursive placeholder replacement
output written atomically
no personal defaults
```

- [ ] **Step 5: Update setup CLI**

`setup.sh` accepts only:

```text
--profile restricted
--profile trusted-dev
--env-file PATH
--state-dir PATH
--help
```

No profile -> exit 2 and explain both modes.

After current dependency verification, run the renderer and print generic `bin/start`, `bin/status`, `bin/stop` next steps.

- [ ] **Step 6: Run focused tests**

```bash
bash tests/publication.sh
node --check scripts/render-config.mjs
bash -n scripts/setup.sh tests/publication.sh
```

Expected at this checkpoint: profile/config assertions pass. The script may remain nonzero only because `bin/`, `providers/legacy-shell/`, or the generic systemd template are intentionally created in later tasks.

- [ ] **Step 7: Commit**

```bash
git add config/templates config/profiles scripts/render-config.mjs scripts/setup.sh .env.example tests/publication.sh
git commit -m "feat: add explicit deployment profiles"
```

---

### Task 3: Move Mutable State Outside Git With Legacy Fallback

**Files:**
- Modify then later move: `scripts/bridge-common.sh`
- Modify: `scripts/start.sh`
- Modify: `scripts/status.sh`
- Modify: `scripts/stop.sh`
- Modify: `scripts/watchdog.sh`
- Modify: `tests/lifecycle.sh`
- Modify: `tests/publication.sh`

**Interfaces:**
- `BRIDGE_STATE_DIR`: override or XDG state default.
- `BRIDGE_RUN_DIR`: override, otherwise external runtime root when generated state exists; legacy `$BRIDGE_ROOT/run` fallback when legacy deployment is detected.
- `BRIDGE_CONFIG_DIR`: override, otherwise `$BRIDGE_STATE_DIR/1mcp` when generated `mcp.json` exists; legacy `$BRIDGE_ROOT/config` fallback.
- `bridge.env` is sourced when present and maps `MCP_PUBLIC_URL`, `MCP_TUNNEL_NAME`, `MCP_WORKSPACE_ROOT` to runtime variables.

- [ ] **Step 1: Add failing lifecycle tests for path selection**

Cover:

```text
fresh generated deployment selects external runtime and state/config dirs
legacy config + legacy run markers select repository compatibility dirs
explicit BRIDGE_RUN_DIR/BRIDGE_CONFIG_DIR overrides win
no personal URL/workspace fallback remains
```

- [ ] **Step 2: Run RED lifecycle tests**

```bash
bash tests/lifecycle.sh
```

- [ ] **Step 3: Implement external state selection in common lifecycle code**

Keep compatibility detection deterministic and source-only; do not mutate live state during sourcing beyond creating the selected runtime directory.

Require public URL at start time instead of defaulting to a personal domain.

Resolve workspace in order:

```text
BRIDGE_WORKSPACE_ROOT override
MCP_WORKSPACE_ROOT from bridge.env
filesystem root parsed from selected mcp.json
BRIDGE_ROOT as final compatibility-safe CWD
```

- [ ] **Step 4: Update start/status/watchdog to use resolved values**

No `mcp.hamza.my.id` fallback may remain.

- [ ] **Step 5: Run GREEN**

```bash
bash tests/lifecycle.sh
bash tests/publication.sh || true
bash -n scripts/*.sh tests/*.sh
```

Expected at this checkpoint: all lifecycle tests pass. Publication assertions for external path selection pass; any remaining publication failure must be limited to the not-yet-created `bin/`, provider, or systemd target paths from Tasks 4-5.

- [ ] **Step 6: Commit**

```bash
git add scripts/bridge-common.sh scripts/start.sh scripts/status.sh scripts/stop.sh scripts/watchdog.sh tests/lifecycle.sh tests/publication.sh
git commit -m "refactor: externalize bridge runtime state"
```

---

### Task 4: Establish Public `bin/`, `lib/bridge/`, and Provider Boundaries

**Files:**
- Create: `bin/start`, `bin/status`, `bin/stop`
- Move: `scripts/bridge-common.sh` -> `lib/bridge/common.sh`
- Move: `scripts/watchdog.sh` -> `lib/bridge/watchdog.sh`
- Move: `scripts/mcp-shell-server.py` -> `providers/legacy-shell/server.py`
- Create: `providers/README.md`
- Replace: `scripts/start.sh`, `scripts/status.sh`, `scripts/stop.sh` with wrappers
- Modify: `scripts/tunnel-up.sh`, `scripts/tunnel-down.sh`
- Modify: `tests/lifecycle.sh`
- Modify: `tests/publication.sh`

**Interfaces:**
- Canonical commands: `bin/start`, `bin/status`, `bin/stop`.
- Legacy wrappers `exec "$ROOT/bin/<command>"`.
- Internal lifecycle sourced from `lib/bridge/common.sh`.
- Watchdog launched from `lib/bridge/watchdog.sh`.

- [ ] **Step 1: Move internal files with `git mv`**

- [ ] **Step 2: Create canonical bin scripts from current lifecycle behavior**

Preserve startup transaction ordering, status diagnostics, stop semantics, and messages; change only generic naming and paths.

- [ ] **Step 3: Replace old lifecycle scripts with thin compatibility wrappers**

- [ ] **Step 4: Update lifecycle tests for new canonical paths and compatibility wrappers**

Maintain the same 22 behavioral cases; source common from `lib/bridge/common.sh`.

- [ ] **Step 5: Run tests**

```bash
bash tests/lifecycle.sh
bash tests/publication.sh
bash -n bin/* lib/bridge/*.sh scripts/*.sh tests/*.sh
python -m py_compile providers/legacy-shell/server.py
```

- [ ] **Step 6: Commit**

```bash
git add -A bin lib providers scripts tests config/templates/mcp.json
git commit -m "refactor: establish public bridge boundaries"
```

---

### Task 5: Genericize systemd Without Touching the Installed Legacy Unit

**Files:**
- Delete tracked: `systemd/hamza-cloudflare-oauth-bridge.service`
- Create: `systemd/mcp-dev-bridge.service.in`
- Modify: `scripts/install-systemd-user.sh`
- Modify: `tests/lifecycle.sh`
- Modify: `tests/publication.sh`

**Interfaces:**
- Installs `~/.config/systemd/user/mcp-dev-bridge.service`.
- Renders placeholders `@REPO_ROOT@`, `@USER_HOME@`, `@STATE_DIR@`, `@PATH@`.
- Does not disable/remove/start the legacy Hamza unit automatically.

- [ ] **Step 1: Add failing generic-unit tests**

Assert generic name, `bin/start`/`bin/stop`, `EnvironmentFile=-@STATE_DIR@/bridge.env`, and no personal values.

- [ ] **Step 2: Implement generic template and renderer installer**

Installer derives current repo root/home/state directory and writes rendered unit atomically before `daemon-reload` + `enable`.

It prints migration commands but does not start/stop either service.

- [ ] **Step 3: Verify template with fixture rendering**

Use a temporary HOME/systemd target in tests; do not call the live user manager in publication tests.

- [ ] **Step 4: Run tests**

```bash
bash tests/lifecycle.sh
bash tests/publication.sh
systemd-analyze verify systemd/mcp-dev-bridge.service.in || true
```

The raw `.in` file may not verify because placeholders are unresolved; publication test must verify a rendered fixture using `systemd-analyze verify` when available.

- [ ] **Step 5: Commit**

```bash
git add -A systemd scripts/install-systemd-user.sh tests
git commit -m "refactor: genericize systemd installation"
```

---

### Task 6: Rewrite Public Documentation and Repository Metadata

**Files:**
- Rewrite: `README.md`
- Create: `LICENSE`
- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`
- Create: `docs/architecture.md`
- Create: `docs/installation.md`
- Create: `docs/configuration.md`
- Create: `docs/operations.md`
- Create: `docs/security.md`
- Create: `docs/development.md`
- Move/rewrite: `ACCEPTANCE.md` -> `docs/acceptance.md`
- Remove after content migration: `docs/PLAN.md`
- Create: `examples/wsl-trusted-dev/README.md`
- Create: `examples/wsl-trusted-dev/.env.example`
- Modify: `tests/publication.sh`

**Interfaces:**
- README is generic landing page.
- `restricted` is recommended but never implicit.
- `trusted-dev` is documented neutrally as effective Linux-user authority.
- Release docs state that current Git history contains original local deployment details and must be reviewed/squashed/exported before public publication.

- [ ] **Step 1: Write generic public docs preserving lifecycle/OAuth workaround knowledge**

Do not lose the 1MCP 0.34.4 direct-supervision and OAuth CSP patch notes; move them to operations/development docs.

- [ ] **Step 2: Add MIT license and contributor/security docs**

Use `MCP Development Bridge contributors` as neutral copyright holder text.

- [ ] **Step 3: Add trusted-dev WSL example with only example values**

- [ ] **Step 4: Run publication scan**

```bash
bash tests/publication.sh
```

Expected: zero personal strings outside `docs/superpowers/`.

- [ ] **Step 5: Commit**

```bash
git add -A README.md LICENSE SECURITY.md CONTRIBUTING.md docs examples tests/publication.sh ACCEPTANCE.md
git commit -m "docs: make repository publication ready"
```

---

### Task 7: Remove Legacy Tracked Deployment Config After Migration Compatibility Is Proven

**Files:**
- Delete: `config/mcp.json`
- Delete: `config/presets.json` (currently an empty tracked deployment artifact; new external 1MCP homes may create their own runtime preset state)
- Modify: `tests/lifecycle.sh` to remove assertions that require tracked `config/mcp.json` and instead point dependency/config checks at `config/templates/mcp.json`
- Modify: `tests/publication.sh`
- Modify: docs migration instructions

**Interfaces:**
- New clean checkout requires `scripts/setup.sh --profile ...` before start.
- Already-installed legacy service remains compatible only via its installed copy until user performs explicit migration; branch does not alter that live installation.

- [ ] **Step 1: Render both profiles in isolated fixture and validate JSON**

- [ ] **Step 2: Verify lifecycle against generated fixture config**

Use test overrides; never point at the live 3050 listener.

- [ ] **Step 3: Remove tracked machine config**

- [ ] **Step 4: Run full tests**

```bash
bash tests/lifecycle.sh
bash tests/publication.sh
bash -n bin/* lib/bridge/*.sh scripts/*.sh tests/*.sh
node --check scripts/render-config.mjs
python -m py_compile providers/legacy-shell/server.py
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add -A config tests docs
git commit -m "refactor: remove tracked deployment configuration"
```

---

### Task 8: Final Branch Verification and Merge/Migration Notes

**Files:**
- Create: `docs/migration-from-local-bridge.md`
- Modify: `README.md` to link the local migration guide and public-history publication note

**Interfaces:**
- Documents safe migration for Hamza's existing service without executing it.

- [ ] **Step 1: Write migration sequence**

Document:

```text
1. merge publication branch
2. create local .env with workspace/public URL/tunnel values
3. scripts/setup.sh --profile trusted-dev
4. scripts/install-systemd-user.sh
5. stop/disable legacy hamza-cloudflare-oauth-bridge.service
6. start mcp-dev-bridge.service
7. verify bin/status + public health
8. remove old installed unit only after successful verification
```

Also document that actual public publication should use reviewed/squashed history rather than blindly exposing the current private development history.

- [ ] **Step 2: Run fresh complete verification**

```bash
bash tests/lifecycle.sh
bash tests/publication.sh
bash -n bin/* lib/bridge/*.sh scripts/*.sh tests/*.sh
node --check scripts/render-config.mjs
python -m py_compile providers/legacy-shell/server.py
git diff --check
git status --short
```

- [ ] **Step 3: Verify main checkout isolation**

From the original checkout, confirm its only staged path is still the independent native WSL Pi/CodeDB harness plan.

- [ ] **Step 4: Commit migration notes**

```bash
git add docs/migration-from-local-bridge.md README.md
git commit -m "docs: add safe local bridge migration"
```

- [ ] **Step 5: Stop before merge or live migration**

Do not merge, restart services, or migrate the local deployment without a separate explicit instruction.

## Self-Review

- All publication-spec requirements map to a task.
- Explicit profile selection is tested before implementation.
- XDG external runtime/state is implemented with legacy fallback before tracked deployment config is removed.
- Public path moves happen only after lifecycle behavior has an external-state test baseline.
- Generic systemd install does not touch the existing installed service.
- Personal-string scanning excludes only engineering-history `docs/superpowers/`.
- Public history sanitization is documented but deliberately not performed.
- CodeDB/Pi/await/GCF remain out of scope.
