# Agent 2 Mission — Personal Linux CLI Toolbox

## Mission

Deliver the zero-schema Linux CLI toolbox for the personal coding harness so Bash/Terminal can use a richer native environment without adding MCP actions.

This mission corresponds to **Task 5** of:

`docs/superpowers/plans/2026-08-15-personal-wsl-codex-harness-phase-2.md`

The master plan is authoritative for behavior. This mission file is authoritative for Wave-1 ownership and coordination.

## Can start

Immediately from the shared coordination baseline.

This mission does **not** depend on Agent 1's personal-path implementation because toolbox detection/setup runs directly inside WSL. It must not try to compensate for the not-yet-merged personal profile.

## Branch / worktree

```text
branch:   feat/personal-harness-agent-2-toolbox
worktree: /home/hamza/repo/satori_bridge/.worktrees/personal-harness-agent-2
```

## Read first

- `CONTRIBUTING.md`
- `docs/superpowers/plans/2026-08-15-personal-wsl-codex-harness-phase-2.md`
- `docs/superpowers/agent-plans/2026-08-15-personal-wsl-codex-harness-phase-2/README.md`
- current setup/install scripts to follow repository conventions without modifying unrelated lifecycle behavior.

## Ownership

Wave-1 ownership is intentionally isolated from Agent 1's root harness files:

```text
scripts/check-personal-toolbox.sh
scripts/setup-personal-toolbox.sh
docs/personal/toolbox.md
tests/personal-toolbox.sh
```

If `docs/personal/` does not exist, create it.

Do **not** edit `tests/harness.sh` in Wave 1 even though the master plan ultimately wants toolbox coverage connected to root verification. The integrator will wire the focused test after merge. This is a deliberate coordination override to keep write ownership disjoint.

## Cross-agent contracts you must preserve

The toolbox is a capability layer under Bash/Terminal, not an MCP provider.

```text
new MCP actions              0
native/raw Bash              unchanged
default user                 hamza
sudo password automation     forbidden
```

The checker/setup must distinguish the real ast-grep CLI from unrelated `/usr/bin/sg` binaries.

Do not globally upgrade unrelated toolchains just to make versions uniform.

## Required behavior

The focused checker must report required/optional status and actual versions for the personal coding baseline.

Required baseline should include at least:

```text
git
rg
jq
sed
awk
grep
find
node
npm
pnpm
python3
systemctl
journalctl
tmux
```

Recommended/explicitly qualified tools include:

```text
fd
bat
ast-grep
```

For missing tools:

- determine an approved reproducible installation source;
- do not use an unpinned `curl | sh` pattern;
- make setup idempotent;
- install only missing approved tools;
- leave already-present Node/Git/Python/systemd installations untouched;
- if sudo is required during manual setup, allow normal interactive sudo rather than storing/passing a password.

Document practical coding-agent usage examples rather than a generic package list.

## Coordination boundary

Do not modify:

```text
config/**
providers/pi-dev/**
providers/terminal/**
systemd/**
scripts/render-config.mjs
scripts/smoke-local.sh
tests/harness.sh
tests/publication.sh
```

Do not implement `apply_patch`; it is blocked on Agent 1's final personal Files path contract.

## Acceptance

The mission is complete when:

- `tests/personal-toolbox.sh` verifies checker behavior without depending on MCP live state;
- checker output distinguishes missing required, missing optional, and present tools;
- setup is idempotent;
- ast-grep detection cannot falsely accept the Linux shadow-package `sg` command;
- representative native commands work;
- no MCP schemas/actions were added;
- scripts pass shell syntax checks;
- `git diff --check` passes.

At minimum run:

```bash
bash tests/personal-toolbox.sh
bash scripts/check-personal-toolbox.sh
bash -n scripts/check-personal-toolbox.sh scripts/setup-personal-toolbox.sh tests/personal-toolbox.sh
git diff --check
```

If the setup script intentionally needs sudo or external package installation, test detection/idempotence automatically and report any manual install acceptance separately.

## Out of scope

- No personal profile/path-mode changes.
- No root harness integration during Wave 1.
- No MCP wrapper for ordinary CLI tools.
- No RTK integration.
- No Terminal provider implementation.
- No broad system upgrades.

## Commit policy

Commit your mission on your branch. Keep the commit isolated to toolbox scripts/tests/docs.

## Handoff

Return the coordinator handoff format and explicitly include:

- required/optional tool matrix and observed versions;
- anything installed and exact source/version;
- proof ast-grep detection is correct;
- focused tests run;
- exact commit hash;
- one integration note telling the final integrator how `tests/personal-toolbox.sh` should be incorporated into shared verification.
