# Personal WSL Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide one portable, idempotent personal WSL bootstrap that prepares the harness and, only with explicit `--enable-startup` consent, installs/enables/starts persistent user services that come back automatically with the WSL user manager.

**Architecture:** Keep existing renderer, toolbox, lifecycle entrypoints, and unit installers authoritative. Add a thin personal orchestrator that installs dependencies, renders personal state, installs `wsl-term` in the user bin, and conditionally coordinates linger + user-systemd startup. Remove tracked `/home/hamza` runtime defaults and derive personal cwd from `MCP_PERSONAL_DEFAULT_CWD` or `$HOME`.

**Tech Stack:** Bash, Node.js ESM, systemd user units, npm lockfiles, WSL/systemd, existing shell test harnesses.

## Global Constraints

- Persistent startup installation requires explicit `--enable-startup`; without it the script must not install/enable/start units or change linger.
- Do not configure Windows to auto-launch WSL.
- Keep tmux as Terminal PTY/process lifetime authority; bridge startup ordering must not create reverse lifetime coupling.
- Personal default cwd = `MCP_PERSONAL_DEFAULT_CWD` when explicitly set, otherwise actual `$HOME`.
- No tracked operational `/home/hamza` defaults in personal runtime config/templates/units.
- Install `wsl-term` user-locally at `~/.local/bin/wsl-term`; do not require root for the CLI install and do not rewrite shell startup files.
- Keep Kitty optional and do not introduce an unpinned GUI installer.
- Preserve public `restricted`/`trusted-dev` setup behavior and the private publication boundary.
- Historical evidence under `docs/history/` is not rewritten for current operating changes.

---

## File structure

- Create `scripts/bootstrap-personal.sh` — the single personal orchestration entrypoint and explicit startup-consent boundary.
- Create `scripts/install-bridge-runtime.sh` — shared pinned 1MCP/CSP/prerequisite installer used by public and personal setup.
- Create `tests/personal-bootstrap.sh` — fixture-driven bootstrap/portability/idempotency regression tests without touching live systemd.
- Modify `scripts/setup.sh` — delegate pinned bridge-runtime setup to the shared helper without changing public profile rendering semantics.
- Modify `scripts/render-config.mjs` — derive portable personal default cwd and support `MCP_PERSONAL_DEFAULT_CWD`.
- Modify `config/profiles/personal.env` — retain policy only; remove machine-specific cwd.
- Modify `config/templates/mcp-personal.json` — remove machine-specific cwd literals; renderer supplies Dev/Code cwd.
- Modify `systemd/wsl-agent-terminal-broker.service.in` — render Terminal default cwd from `@USER_HOME@`.
- Modify `bin/wsl-term` — resolve its real path so user-bin symlink invocation still finds the repository.
- Modify `tests/harness.sh` — assert synthetic-home/default/override personal rendering.
- Modify `tests/lifecycle.sh` — include new bootstrap executable/consent/startup source contracts where useful.
- Modify `tests/publication.sh` — keep the private bootstrap outside public exports.
- Modify `.env.example` — document optional `MCP_PERSONAL_DEFAULT_CWD`.
- Modify `README.md`, `docs/getting-started.md`, `docs/configuration.md`, `docs/personal/harness.md`, `docs/operations.md`, `docs/personal/toolbox.md` — make bootstrap the canonical personal install path and correct the 16-action surface.

---

### Task 1: Remove machine-specific personal runtime defaults

**Files:**
- Modify: `scripts/render-config.mjs`
- Modify: `config/profiles/personal.env`
- Modify: `config/templates/mcp-personal.json`
- Modify: `systemd/wsl-agent-terminal-broker.service.in`
- Modify: `tests/harness.sh`
- Modify: `providers/terminal/tmux.mjs`
- Modify: `providers/terminal/broker.mjs`
- Modify: `providers/terminal/test/tmux.test.mjs`
- Modify: `providers/terminal/test/broker.test.mjs`
- Modify: `providers/terminal/test/systemd.test.mjs`
- Modify: `providers/code-router/server.mjs`
- Modify: `providers/code-router/test/server.test.mjs`

**Interfaces:**
- Consumes: deployment env `MCP_PERSONAL_DEFAULT_CWD` (optional), process `$HOME`, profile `MCP_DEV_PATH_MODE=user`.
- Produces: one absolute `personalDefaultCwd` used by Dev and Code; Terminal unit `MCP_TERMINAL_DEFAULT_CWD=@USER_HOME@`.
- Produces: portable direct-runtime fallback defaults for Terminal and Code Router using the current process/user home rather than a named user path.

- [ ] **Step 1: Extend the rendering regression for synthetic HOME and override behavior**

In `tests/harness.sh`, run personal rendering with `HOME="$tmp/home"` and require both Dev and Code defaults to equal that synthetic home. Add a second personal render with:

```bash
cat > "$tmp/personal-override.env" <<EOF2
MCP_PUBLIC_URL=https://mcp.example.test
MCP_TUNNEL_NAME=
MCP_PERSONAL_DEFAULT_CWD=$tmp/custom-cwd
EOF2
mkdir -p "$tmp/custom-cwd"
HOME="$tmp/home" XDG_RUNTIME_DIR="$tmp/runtime" node "$ROOT/scripts/render-config.mjs" \
  --profile personal --env-file "$tmp/personal-override.env" \
  --state-dir "$tmp/personal-override" --repo-root "$ROOT"
```

Require Dev/Code cwd to equal `$tmp/custom-cwd`. Add a negative render with `MCP_PERSONAL_DEFAULT_CWD=relative/path` and require nonzero exit plus an absolute-path error.

Also require the tracked current runtime files:

```text
config/profiles/personal.env
config/templates/mcp-personal.json
systemd/wsl-agent-terminal-broker.service.in
```

to contain no `/home/hamza`.

During exact-tree qualification, also scan production provider/runtime code for machine-specific home fallbacks. If found, add synthetic-`HOME` behavior tests before replacing those fallbacks with the current process/user home. This qualification found and fixed such defaults in Terminal's backend/broker and Code Router's facade/stdio path.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
bash tests/harness.sh
```

Expected: the personal rendering assertions fail because current files still hardcode `/home/hamza` and the renderer does not accept `MCP_PERSONAL_DEFAULT_CWD`.

- [ ] **Step 3: Implement portable render-time default resolution**

In `scripts/render-config.mjs`:

- include `MCP_PERSONAL_DEFAULT_CWD` in the deployment environment override keys;
- for `personal`, resolve:

```js
personalDefaultCwd = deployment.MCP_PERSONAL_DEFAULT_CWD || home;
```

- require it to be an absolute path;
- keep assigning it to `MCP_DEV_DEFAULT_CWD` and `MCP_CODE_DEFAULT_CWD` after template replacement.

Remove `MCP_DEV_DEFAULT_CWD` from `config/profiles/personal.env`. Remove the hardcoded Dev/Code cwd fields from `config/templates/mcp-personal.json`; renderer assignment remains authoritative. Replace the broker unit line with:

```ini
Environment=MCP_TERMINAL_DEFAULT_CWD=@USER_HOME@
```

- [ ] **Step 4: Run focused verification and verify GREEN**

Run:

```bash
bash tests/harness.sh
bash -n tests/harness.sh
node --check scripts/render-config.mjs
rg -n '/home/hamza' config/profiles/personal.env config/templates/mcp-personal.json systemd/wsl-agent-terminal-broker.service.in
```

Expected: harness passes; syntax passes; final `rg` returns no matches.

- [ ] **Step 5: Commit**

```bash
git add scripts/render-config.mjs config/profiles/personal.env config/templates/mcp-personal.json \
  systemd/wsl-agent-terminal-broker.service.in tests/harness.sh
git commit -m "fix: derive portable personal WSL defaults"
```

---

### Task 2: Add the explicit-consent personal bootstrap and user-bin install

**Files:**
- Create: `scripts/bootstrap-personal.sh`
- Create: `tests/personal-bootstrap.sh`
- Modify: `bin/wsl-term`
- Modify: `tests/lifecycle.sh`
- Modify: `tests/publication.sh`

**Interfaces:**
- Consumes: `.env` or `--env-file`, optional `--state-dir`, optional `--enable-startup`, existing toolbox/renderer/unit installers.
- Produces: rendered personal state, `~/.local/bin/wsl-term`, and only with consent three enabled/started user services plus personal bridge ordering drop-in and linger.

- [ ] **Step 1: Write a fixture-driven RED test for bootstrap consent, installation, and idempotency**

Create `tests/personal-bootstrap.sh` with temporary `HOME`, state, runtime, systemd target, user-bin, and fake `systemctl`/`loginctl` commands that append argv to log files. Use:

```text
PERSONAL_BOOTSTRAP_SKIP_INSTALL=1
PERSONAL_USER_BIN_DIR=<tmp>/home/.local/bin
BRIDGE_SYSTEMD_TARGET_DIR=<tmp>/systemd
TERMINAL_SYSTEMD_TARGET_DIR=<tmp>/systemd
XDG_RUNTIME_DIR=<tmp>/runtime
```

For the no-consent run:

```bash
HOME="$home" ... scripts/bootstrap-personal.sh --env-file "$env_file" --state-dir "$state"
```

Require rendered personal config and executable/symlinked `wsl-term`, but no systemd unit/drop-in files and empty fake systemctl/loginctl logs.

For the consent run, make fake `loginctl show-user ... -p Linger --value` return `no`, then accept `enable-linger`; make fake `systemctl` accept `--user daemon-reload`, `--user enable --now ...`, `--user is-enabled ...`, and `--user is-active ...`. Require:

```text
mcp-dev-bridge.service
wsl-agent-tmux.service
wsl-agent-terminal-broker.service
mcp-dev-bridge.service.d/personal.conf
```

and require the drop-in to contain only `Wants=`/`After=` ordering to the broker. Require fake logs to show linger enable and one `enable --now` request covering the three services. Rerun and require no duplicate/drop-in drift and no second linger enable when fake `show-user` returns `yes`.

Create a `~/.local/bin/wsl-term` symlink and invoke the installed path with an invalid command; require the error to contain the real CLI usage rather than a module/path-not-found error. This proves symlink root resolution.

- [ ] **Step 2: Run the bootstrap test and verify RED**

Run:

```bash
bash tests/personal-bootstrap.sh
```

Expected: fail because `scripts/bootstrap-personal.sh` does not exist and the current `bin/wsl-term` is not symlink-safe.

- [ ] **Step 3: Make `bin/wsl-term` symlink-safe**

Resolve the wrapper itself before deriving the repository root:

```bash
SELF="$(readlink -f "${BASH_SOURCE[0]}")"
ROOT="$(cd "$(dirname "$SELF")/.." && pwd)"
exec "${TERMINAL_NODE_BIN:-node}" "$ROOT/providers/terminal/cli.mjs" "$@"
```

- [ ] **Step 4: Implement `scripts/bootstrap-personal.sh`**

Implement these semantics in order:

1. Parse `--enable-startup`, `--env-file PATH`, `--state-dir PATH`, `--help`; reject unknown flags.
2. Derive `ROOT`, `USER_HOME`, state dir, runtime dir, common systemd target, and `${PERSONAL_USER_BIN_DIR:-$USER_HOME/.local/bin}`.
3. Unless `PERSONAL_BOOTSTRAP_SKIP_INSTALL=1`, run `scripts/setup-personal-toolbox.sh`, then `npm ci --omit=dev` for `providers/pi-dev`, `providers/code-router`, and `providers/terminal`.
4. Render personal config via `node scripts/render-config.mjs --profile personal` with the selected env/state/root.
5. Create the user bin and atomically/safely set `wsl-term` to the repository wrapper using `ln -sfn`.
6. If `--enable-startup` is absent, print that startup was not installed because consent was not given and exit successfully without invoking either systemd installer, `systemctl`, or `loginctl`.
7. With consent, call the two existing unit installers in render-only mode by setting `BRIDGE_SYSTEMD_DRY_RUN=1` and `TERMINAL_SYSTEMD_DRY_RUN=1`, passing both target-dir overrides to one common target.
8. Render `mcp-dev-bridge.service.d/personal.conf` atomically with:

```ini
[Unit]
Wants=wsl-agent-terminal-broker.service
After=wsl-agent-terminal-broker.service
```

9. Derive/validate the user bus environment and require its socket.
10. Check linger with `loginctl show-user "$USER" -p Linger --value`; if not `yes`, run `loginctl enable-linger "$USER"`, and if that fails retry once through `sudo loginctl enable-linger "$USER"` when sudo exists. Re-read and require `yes`.
11. Run `systemctl --user daemon-reload` then:

```bash
systemctl --user enable --now \
  wsl-agent-tmux.service \
  wsl-agent-terminal-broker.service \
  mcp-dev-bridge.service
```

12. Require all three to be enabled and active. Run `bin/status` as the final bridge health check.
13. Print the installed `wsl-term` path and the remaining unavoidable ChatGPT connect/refresh step.

During exact-tree review, factor the existing pinned 1MCP/CSP/prerequisite block out of public `scripts/setup.sh` into `scripts/install-bridge-runtime.sh`, and require both public setup and personal bootstrap to use it. This prevents a fresh personal clone from depending on an undocumented prior public setup.

- [ ] **Step 5: Extend lifecycle/publication source contracts**

In `tests/lifecycle.sh`, include `bootstrap-personal.sh` in executable checks and require source-level evidence of the explicit `--enable-startup` boundary, `enable --now`, and no Windows auto-launch mechanism.

In `tests/publication.sh`, classify `scripts/bootstrap-personal.sh` as private-only alongside the existing personal profile/Terminal assets.

- [ ] **Step 6: Run focused verification and verify GREEN**

Run:

```bash
bash tests/personal-bootstrap.sh
bash tests/lifecycle.sh
bash tests/publication.sh
bash -n scripts/bootstrap-personal.sh bin/wsl-term tests/personal-bootstrap.sh tests/lifecycle.sh tests/publication.sh
```

Expected: all focused tests pass with zero failures.

- [ ] **Step 7: Commit**

```bash
git add scripts/bootstrap-personal.sh bin/wsl-term tests/personal-bootstrap.sh tests/lifecycle.sh tests/publication.sh
git commit -m "feat: add unified personal WSL bootstrap"
```

---

### Task 3: Make the operating documentation match the unified install

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/getting-started.md`
- Modify: `docs/configuration.md`
- Modify: `docs/personal/harness.md`
- Modify: `docs/operations.md`
- Modify: `docs/personal/toolbox.md`

**Interfaces:**
- Consumes: the Task-1 renderer and Task-2 bootstrap contracts.
- Produces: one normal personal-install path and clearly marked lower-level recovery/operator paths.

- [ ] **Step 1: Update deployment/configuration documentation**

Add to `.env.example`:

```text
# Personal profile only; defaults to $HOME when unset.
MCP_PERSONAL_DEFAULT_CWD=
```

Update `docs/configuration.md` to say the personal default derives from that optional deployment value or `$HOME`, not from a tracked absolute path.

- [ ] **Step 2: Update README and getting-started entry points**

Correct the personal surface to 16 actions and include `terminal_yield`. Make the normal personal path:

```bash
cp .env.example .env
# set MCP_PUBLIC_URL and deployment identity
scripts/bootstrap-personal.sh --enable-startup
```

Explain immediately that `--enable-startup` is explicit consent to install/enable/start user services and linger; omit the flag for preparation without persistent startup. State that no Windows auto-launch is installed.

- [ ] **Step 3: Rewrite the personal harness setup section around the bootstrap**

Replace the current manual npm/render/systemctl sequence in `docs/personal/harness.md` with the bootstrap command. Keep direct renderer, unit installers, and `bin/start` as advanced/recovery commands, not the first-install checklist. Document `wsl-term` as `~/.local/bin/wsl-term` and use `wsl-term ...` examples for normal operator commands while retaining repository-relative paths where exact source troubleshooting is useful.

- [ ] **Step 4: Align operations/toolbox docs**

In `docs/operations.md`, describe installed/automatic service behavior and the bridge ordering drop-in. Preserve the rule never to restart tmux merely for broker/provider/frontend deployment.

In `docs/personal/toolbox.md`, state the bootstrap invokes toolbox qualification automatically and the standalone setup script remains useful for repair/inspection.

- [ ] **Step 5: Run documentation checks**

Run:

```bash
node scripts/check-doc-links.mjs
rg -n '15 actions|MCP_DEV_DEFAULT_CWD=/home/hamza|systemctl --user start wsl-agent-tmux.service wsl-agent-terminal-broker.service' README.md docs/getting-started.md docs/configuration.md docs/personal/harness.md docs/operations.md
```

Expected: links pass; stale operating instructions return no matches.

- [ ] **Step 6: Commit**

```bash
git add .env.example README.md docs/getting-started.md docs/configuration.md docs/personal/harness.md docs/operations.md docs/personal/toolbox.md
git commit -m "docs: unify personal WSL installation"
```

---

### Task 4: Exact-tree qualification and live canonical activation

**Files:**
- Verify all changed files from Tasks 1-3.
- No additional production file is planned unless verification exposes a defect.

**Interfaces:**
- Consumes: final feature-branch tree.
- Produces: verified commit suitable for fast-forward integration, then live idempotent bootstrap acceptance on canonical `main`.

- [ ] **Step 1: Run the complete affected automated qualification**

Run:

```bash
bash tests/personal-bootstrap.sh
bash tests/harness.sh
bash tests/personal-toolbox.sh
bash tests/lifecycle.sh
bash tests/publication.sh
npm --prefix providers/terminal test
node scripts/check-doc-links.mjs
node --check scripts/render-config.mjs
bash -n scripts/bootstrap-personal.sh bin/wsl-term scripts/install-systemd-user.sh scripts/install-terminal-broker-user.sh tests/personal-bootstrap.sh tests/harness.sh tests/lifecycle.sh tests/publication.sh
git diff --check
git status --short --branch
```

Require all tests/checks green and a clean committed feature branch.

- [ ] **Step 2: Inline self-review**

Review the diff against the design with separate passes for:

- explicit-consent boundary and no accidental systemd/linger mutation without `--enable-startup`;
- portable user/home/path behavior and no personal identity leakage;
- systemd lifetime ownership/order and idempotency;
- fresh-clone usability and documentation consistency;
- publication/privacy boundary.

Fix only verified issues inside scope and rerun the affected checks.

- [ ] **Step 3: Integrate into canonical `main`**

Fetch `origin/main`, require the feature branch to still descend from current local main or resolve divergence without rewriting unrelated history, then fast-forward merge the verified feature branch into canonical `/home/hamza/repo/websession_mcp_bridge`.

- [ ] **Step 4: Run live bootstrap with explicit startup consent**

Record pre-run tmux/broker/bridge PIDs and service states. From canonical `main`, run:

```bash
scripts/bootstrap-personal.sh --enable-startup
```

This current user explicitly authorized the startup-install behavior for this effort. Require the bootstrap to converge rather than creating duplicate processes or restarting the tmux lifetime service unnecessarily.

- [ ] **Step 5: Verify live installed state**

Require:

```bash
loginctl show-user "$(id -un)" -p Linger --value
systemctl --user is-enabled wsl-agent-tmux.service wsl-agent-terminal-broker.service mcp-dev-bridge.service
systemctl --user is-active wsl-agent-tmux.service wsl-agent-terminal-broker.service mcp-dev-bridge.service
command -v wsl-term
wsl-term list
bin/status
```

Expected: linger `yes`; all services enabled/active; `wsl-term` resolves from user-local bin and reaches the broker; local/public health ready; `issues: 0`; preexisting tmux server PID unchanged.

- [ ] **Step 6: Push and clean feature isolation**

Push canonical `main` only after post-merge/live verification is green. Verify local/remote SHA equality and a clean main tree, then remove/prune the clean feature worktree and delete the merged feature branch.
