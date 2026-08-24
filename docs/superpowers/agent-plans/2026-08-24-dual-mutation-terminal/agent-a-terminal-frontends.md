# Agent A — Terminal Presentation Frontends

**Repository:** `/home/hamza/repo/websession_mcp_bridge`
**Artifact type:** mixed (runtime + configuration + docs + Skill snapshot)
**Workspace:** `/home/hamza/repo/websession_mcp_bridge-agent-a-terminal`
**Isolation reason:** concurrent writable mission; this branch owns Terminal/config/docs/router targets while Agent B owns Pi Dev provider files
**Can start:** immediately
**Depends on:** clean Browser foundation `43decaf`; coordination package commit present in this worktree
**Execution lifetime:** ordinary
**Wake strategy:** none by default
**Developer visibility:** headless; do not perform live GUI/runtime activation in this mission

## Read first

- `docs/superpowers/plans/2026-08-24-terminal-presentation-frontends.md` — authoritative requirements; execute repository-facing Tasks 1-3 only
- `docs/superpowers/agent-plans/2026-08-24-dual-mutation-terminal/README.md` — ownership, dependencies, and integration boundary
- `skills/mcp-harness-router/SKILL.md` — current model-facing Terminal routing contract that this mission must make emulator-neutral

Read current code before changing it. Apply Ponytail/Causal Coding discipline: preserve the existing Terminal ownership model, reuse current presentation machinery, and add only the second launcher/config behavior required by the plan.

## Objective

Implement the repository-facing portion of the Terminal Presentation Frontends plan so the existing `ensurePresented(name)` presentation edge supports deterministic Kitty or Windows Terminal selection, with safe CMD construction and broker-first readiness semantics, while the Terminal MCP tool schema, broker authority, tmux lifetime, and `wsl-term` control model remain unchanged.

Own Terminal Plan Tasks 1-3. Do not perform Task 4/5 live activation, machine-local `.env` changes, GUI acceptance, service restarts, MCP refresh, or ChatGPT Skill installation.

## Current state

- Browser foundation is already reconciled in the shared base.
- Existing `providers/terminal/frontend.mjs` is Kitty-specific but already owns pre-launch broker checks, attachment readiness, per-session single-flight, WSLg child env, and owned Kitty cleanup.
- The updated plan requires one `MCP_TERMINAL_FRONTEND=kitty|windows-terminal` selector, one Windows command builder, distro/user/runtime derivation, and broker-aware Windows timeout wording.
- Another concurrent mission owns the Pi Dev mutation provider and will not touch this mission's files in Wave 1.

## Ownership

You own the files/behaviors required by Terminal Plan Tasks 1-3, including:

- Terminal frontend implementation and its focused existing test file;
- personal renderer/template selector contract and existing `tests/harness.sh` coverage required by the plan;
- emulator-neutral `terminal_yield` wording;
- current Terminal presentation docs;
- tracked `mcp-harness-router` wording and its checksum entry.

Neighboring mission ownership:

- Agent B owns Mutation Plan Task 1 under `providers/pi-dev/**` only.
- Do not implement mutation routing/docs/file_ops surface work.
- Integration/rollout owns live service/config activation and final combined repository verification.

## Coordination contract

Keep these boundaries stable:

- exactly seven Terminal MCP operations and unchanged schemas;
- `providers/terminal/broker.mjs`, `tmux.mjs`, protocol, broker client, `bin/wsl-term`, and Terminal service templates remain untouched unless direct evidence reaches an explicit plan stop condition;
- `humanAttached`/`humanLease` broker state remains readiness/ownership authority;
- Kitty stays tracked/default and preserves existing behavior;
- Windows Terminal presentation attaches through existing `wsl-term present` and never recreates the session command;
- repository Skill edits are snapshot state only; do not claim installed ChatGPT Skill activation.

If correctness appears to require a lower-layer broker/tmux/schema change, stop expansion and report `needs decision` rather than absorbing that work.

## Success conditions

- Personal rendering defaults to `kitty`, accepts explicit `kitty` and `windows-terminal`, rejects invalid personal values, and ignores a stray invalid selector for non-personal profiles.
- Existing Kitty launch/reuse/cleanup behavior remains intact.
- Windows Terminal launch uses the same distro, process account, `process.execPath`, `/mnt/c` spawn cwd, `wsl-term present`, and one guarded CMD command builder.
- Accepted dynamic values cannot be reinterpreted as CMD control syntax; ordinary spaces work and unsupported metacharacters fail closed or are safely escaped as required by the source plan.
- Windows readiness is broker-first: attachment wins over launcher exit; lease-at-deadline reports settling; immediate manual attach is offered only with neither lease nor attachment.
- Windows failure/timeout never performs broad Windows Terminal/taskkill cleanup or destroys the tmux session.
- `terminal_yield` model-facing wording and router Skill are emulator-neutral.
- Current docs describe Kitty + Windows Terminal presentation without changing ownership semantics.
- Branch contains a coherent commit (or small coherent commits) limited to this mission.

## Required validation

Testing is explicitly authorized by the source plan. Keep it focused:

- run the existing Terminal provider test suite after the final mission edits: `(cd providers/terminal && npm test)`;
- run `bash tests/harness.sh` for the selector/render contract;
- run the existing Skill validation/checksum checks needed for the changed router bundle, following repository conventions;
- inspect `git diff --check` for this branch.

If a fresh worktree lacks ignored provider dependencies, install only the pinned dependency tree needed by these required checks, following `docs/development.md`.

Do **not** run the repository-wide Full verification gate; the integrated candidate owns that once both plans are combined.

## Out of scope

- Terminal Plan Tasks 4-5 live activation/acceptance;
- machine-local `.env` preference changes;
- bridge/provider/broker/tmux restarts;
- ChatGPT Skills UI installation;
- broker lease redesign or timeout/cancellation protocol changes;
- generic frontend plugin registries or auto-detection;
- mutation-stack implementation or shared mutation docs.

## Working style

Inspect the actual owner/call path before editing. Prefer the existing controller and Node/platform facilities over new layers or dependencies. Keep the two launchers local and explicit; no framework. Honor the source plan's required tests but do not add unrelated cases, cleanup, or abstractions. Preserve all current behavior not named by the plan.

Commit your mission changes on the assigned branch when complete. Do not merge to `main`.

## Finish report

Return:
1. status: complete / blocked / needs decision;
2. branch/worktree and commit(s);
3. concise behavior/config/docs/Skill summary;
4. required validation run and results;
5. anything integration or Agent B's later surface mission needs to know;
6. unresolved risks, deviations, or decisions needed.
