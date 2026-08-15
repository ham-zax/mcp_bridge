# Personal WSL Codex Harness Phase 2 — Parallel Agent Coordination

**Date:** 2026-08-15
**Authority:** `docs/superpowers/plans/2026-08-15-personal-wsl-codex-harness-phase-2.md`
**Execution shape:** Hybrid — three independent Wave-1 branches/worktrees, then integration and dependency-driven Wave 2.

## Why three agents can start now

The master plan has one important dependency chain: `apply_patch` requires the personal `/home/hamza` path/authority contract, and Terminal MCP integration requires both the personal profile and the durable Terminal core. We therefore do **not** split the master plan into three arbitrary equal chunks.

Wave 1 uses three genuinely independent write domains:

```text
                    coordination baseline
                           |
          +----------------+----------------+
          |                |                |
          v                v                v
Agent 1: foundation   Agent 2: toolbox  Agent 3: terminal core
Tasks 1-3            Task 5            Task 6
          |                |                |
          +----------------+----------------+
                           |
                     integration gate
                           |
          +----------------+----------------+
          |                                 |
          v                                 v
Task 4 apply_patch                  Task 7 Terminal MCP/human attach
(after Agent 1)                     (after Agents 1 + 3)
                                            |
                                            v
                                      Task 8 await decision

Tasks 9-10 Code router/facade may start after the Wave-1 integration gate in a fresh mission.
Task 11 RTK is independent after raw Bash remains proven.
Tasks 12-14 are final evidence/consolidation work, not Wave-1 parallel work.
```

## Wave-1 mission files

- `agent-1-foundation.md` — Tasks 1-3: baseline, personal profile, unrestricted personal Files/Bash semantics.
- `agent-2-toolbox.md` — Task 5: zero-schema personal CLI toolbox.
- `agent-3-terminal-core.md` — Task 6: dedicated tmux lifetime + broker/transcript foundation.

## Worktree topology

Each coding agent gets its own branch and worktree. Do not have Wave-1 agents edit the same worktree.

```text
Agent 1
  branch:   feat/personal-harness-agent-1-foundation
  worktree: /home/hamza/repo/satori_bridge/.worktrees/personal-harness-agent-1

Agent 2
  branch:   feat/personal-harness-agent-2-toolbox
  worktree: /home/hamza/repo/satori_bridge/.worktrees/personal-harness-agent-2

Agent 3
  branch:   feat/personal-harness-agent-3-terminal-core
  worktree: /home/hamza/repo/satori_bridge/.worktrees/personal-harness-agent-3
```

All three branches start from the same coordination commit containing this folder and the canonical master plan.

## Shared contracts frozen for Wave 1

Agents may not redefine these contracts independently:

```text
personal profile name             personal
personal default cwd              /home/hamza
personal path mode                user
public path mode                  workspace
Bash                              one-shot native Bash string
Terminal tmux namespace           wsl-agent
Terminal broker socket            $XDG_RUNTIME_DIR/wsl-agent-terminal.sock
Terminal external state root      $XDG_STATE_HOME/wsl-agent-terminal
Terminal lifetime unit            wsl-agent-tmux.service
Terminal broker unit              wsl-agent-terminal-broker.service
```

If an agent discovers that one of these contracts is impossible or unsafe, it must stop at that decision and report evidence rather than silently changing the cross-agent contract.

## Ownership matrix

### Agent 1 owns

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

Agent 1 must not implement `apply_patch` in Wave 1.

### Agent 2 owns

```text
scripts/check-personal-toolbox.sh
scripts/setup-personal-toolbox.sh
docs/personal/toolbox.md
tests/personal-toolbox.sh
```

Agent 2 deliberately does **not** edit `tests/harness.sh` during Wave 1. The integrator wires the focused toolbox test into any root harness contract after merge. This avoids conflict with Agent 1.

### Agent 3 owns

```text
providers/terminal/**
systemd/wsl-agent-tmux.service.in
systemd/wsl-agent-terminal-broker.service.in
scripts/install-terminal-broker-user.sh
docs/benchmarks/terminal-preflight.md
```

Agent 3 must not edit personal MCP composition/configuration in Wave 1; Terminal registration is Task 7 after Agent 1 lands.

## Global no-overlap rules

- Do not edit files owned by another Wave-1 mission.
- Do not reset, restore, stash, cherry-pick, or rewrite another mission's branch.
- Do not modify the live `mcp-dev-bridge` composition during Wave 1.
- Agent 3 may test the **new dedicated Terminal units** because they are independent of the live bridge, but must not restart/stop 1MCP, Cloudflare, or `mcp-dev-bridge.service`.
- Do not write secrets/session tokens into Git or reports.
- Use TDD where the master plan specifies RED/GREEN.
- Preserve unrelated public-release work and public profile behavior.

## Integration gate after Wave 1

Do not start Task 4 or Task 7 integration until all three agents report one of `COMPLETE`, `BLOCKED`, or `NEEDS_DECISION`.

The integrator will:

1. review each mission commit against its mission acceptance criteria;
2. merge Agent 1 foundation first;
3. merge Agent 2 toolbox and wire its focused test into shared root verification if needed;
4. merge Agent 3 Terminal core;
5. run the full combined baseline;
6. then open fresh missions for Task 4 (`apply_patch`) and Task 7 (Terminal MCP/human attach).

## Required handoff format for every agent

```text
STATUS: COMPLETE | BLOCKED | NEEDS_DECISION
BRANCH: <branch>
COMMITS: <hashes>

BEHAVIOR DELIVERED
- ...

TESTS RUN
- command -> result

INTERFACES / CONTRACTS
- ...

DEVIATIONS
- none | ...

COORDINATION NOTES
- anything the integrator or next mission must know

RISKS / BLOCKERS
- none | ...
```
