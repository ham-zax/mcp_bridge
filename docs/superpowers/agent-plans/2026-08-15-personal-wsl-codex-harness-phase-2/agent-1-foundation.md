# Agent 1 Mission — Personal Harness Foundation

## Mission

Deliver the Phase-2 foundation that every later coding capability depends on:

1. record the current private harness baseline and carry-forward ledger;
2. add the private `personal` profile without weakening public profiles;
3. change the private Pi Files/Bash semantics from single-workspace confinement to the `hamza` WSL-user authority model with stable default cwd `/home/hamza`.

This mission corresponds to **Tasks 1-3** of:

`docs/superpowers/plans/2026-08-15-personal-wsl-codex-harness-phase-2.md`

The master plan is authoritative for behavior. This mission file is authoritative for Wave-1 ownership and coordination.

## Can start

Immediately from the shared coordination baseline.

## Branch / worktree

```text
branch:   feat/personal-harness-agent-1-foundation
worktree: /home/hamza/repo/satori_bridge/.worktrees/personal-harness-agent-1
```

## Read first

- `CONTRIBUTING.md`
- `docs/superpowers/plans/2026-08-15-personal-wsl-codex-harness-phase-2.md`
- `docs/superpowers/agent-plans/2026-08-15-personal-wsl-codex-harness-phase-2/README.md`
- current Pi provider/config/profile/lifecycle tests relevant to Tasks 1-3.

## Ownership

You own the behavior and files required by Tasks 1-3, including the following shared integration files during Wave 1:

```text
docs/benchmarks/personal-harness-phase-2.md
config/profiles/personal.env
config/templates/mcp-personal.json
scripts/render-config.mjs
scripts/smoke-local.sh
tests/harness.sh
tests/publication.sh
providers/pi-dev/boundary.mjs
providers/pi-dev/files.mjs
providers/pi-dev/shell.mjs
providers/pi-dev/server.mjs
providers/pi-dev/test/** relevant to Tasks 1-3
```

You may discover additional tightly related files required to deliver Tasks 1-3, but do not expand into another agent's Wave-1 domain.

## Cross-agent contracts you must preserve

```text
personal profile name      personal
personal path mode         user
personal default cwd       /home/hamza
public path mode           workspace
Bash                       native one-shot command string
no hidden global cwd       required
```

Public `restricted` and `trusted-dev` semantics must not be weakened merely to enable the personal profile.

Removing the private workspace sandbox must **not** remove mutation safety already proven useful:

```text
exact/unique edit behavior
best-effort conflict protection
create-only write
bounded/recoverable Bash output
process-tree timeout/cancel behavior
```

## Coordination boundary

Do not implement any of the following in Wave 1:

```text
apply_patch
personal CLI toolbox
providers/terminal/**
Terminal MCP registration
CodeDB router
RTK
await/resume
```

Agent 2 owns the toolbox. Agent 3 owns the Terminal core.

## Required behavior

At mission completion:

- the actual current baseline is recorded with measured provider/schema/context values rather than copied expectations;
- a private `personal` profile renders independently of the public profiles;
- personal relative paths resolve from `/home/hamza`;
- personal absolute Files paths are accepted wherever the `hamza` user has normal Linux access;
- personal Bash defaults to `/home/hamza` and accepts explicit relative or absolute cwd;
- no hidden cross-call cwd state exists;
- public workspace-confinement behavior still passes its existing tests;
- harmless real-access acceptance proves the private mode can reach a normal path outside the old repo workspace without reading secrets;
- the carry-forward ledger remains complete.

## Acceptance

Run the master-plan verification relevant to Tasks 1-3, including at minimum:

```bash
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
(cd providers/pi-dev && npm test)
bash -n bin/* lib/bridge/*.sh scripts/*.sh tests/*.sh
node --check scripts/render-config.mjs providers/pi-dev/*.mjs
git diff --check
```

Also verify the public profiles and personal profile independently rather than inferring one from the other.

## Out of scope

- No `apply_patch` implementation.
- No Terminal code.
- No CLI-tool installation.
- No CodeDB process/router work.
- No live ChatGPT action-catalog cutover unless the master plan explicitly requires it for Tasks 1-3.
- No weakening of public-release constraints.

## Commit policy

Commit your own coherent mission work on your branch. Prefer the task-sized commits from the master plan when practical. Do not rewrite the coordination baseline.

## Handoff

Return exactly the shared handoff format from the coordinator README and explicitly include:

- measured baseline/catalog numbers;
- final personal path/cwd contract;
- public-profile regression result;
- exact commits;
- tests actually run;
- any contract issue that would block Agent 2's later `apply_patch` work or Agent 3's later Terminal registration.
