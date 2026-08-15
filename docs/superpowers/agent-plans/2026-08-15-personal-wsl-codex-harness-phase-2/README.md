# Personal WSL Codex Harness Phase 2 — Parallel Agent Coordination

**Date:** 2026-08-15
**Authority:** `docs/superpowers/plans/2026-08-15-personal-wsl-codex-harness-phase-2.md`
**Execution shape:** Hybrid — three independent Wave-1 branches/worktrees, dependency-driven follow-up missions, then integration gates before shared production surfaces change.

## Why three agents can start now

The master plan has one important dependency chain: `apply_patch` requires the personal `/home/hamza` path/authority contract, and Terminal MCP integration requires both the personal profile and the durable Terminal core. We therefore do **not** split the master plan into three arbitrary equal chunks.

Wave 1 used three genuinely independent write domains, then the dependency frontier advanced as each mission completed:

```text
                    coordination baseline
                           |
          +----------------+----------------+
          |                |                |
          v                v                v
Agent 1: foundation   Agent 2: toolbox  Agent 3: terminal core
Tasks 1-3            Task 5            Task 6
    COMPLETE            COMPLETE           COMPLETE
          |                |                |
          |                |                +--------------------+
          |                |                                     |
          v                v                                     v
Agent 1: Wave-1 integration                         Agent 3: Herdr challenger
Agents 1 + 2 + 3                                    Task 6.5, experiment only
          |                                                     |
          +-------------------------+---------------------------+
                                    |
                                    v
                         Terminal backend decision gate
                                    |
             +----------------------+----------------------+
             |                                             |
             v                                             v
TMUX_BROKER_WINS / HERDR_NOT_MATERIAL          HERDR_WINS / HYBRID_WINS
Task 7 may proceed as written                  focused design amendment first

In parallel:
Agent 2 -> Task 4 apply_patch, based on Agent-1 foundation contract.

Task 8 await/resume waits for both Task 7 real product-path evidence and the Task-6.5 Herdr wait verdict.
Tasks 9-10 Code router/facade open after the integration gate in a fresh mission.
Task 11 RTK remains independent after raw Bash stays proven.
Tasks 12-14 are final evidence/consolidation work.
```

## Mission files

- `agent-1-foundation.md` — Tasks 1-3: baseline, personal profile, unrestricted personal Files/Bash semantics.
- `agent-2-toolbox.md` — Task 5: zero-schema personal CLI toolbox.
- `agent-3-terminal-core.md` — Task 6: dedicated tmux lifetime + broker/transcript foundation. **Completed baseline.**
- `agent-3-herdr-evaluation.md` — Task 6.5: Herdr v0.8.0 vs tmux/broker vs hybrid Terminal/await challenger. **Experiment only; no production migration.**

## Worktree topology

Each coding agent gets its own branch and worktree. Do not have Wave-1 agents edit the same worktree.

```text
Agent 1
  branch:   feat/personal-harness-agent-1-foundation
  worktree: /home/hamza/repo/satori_bridge/.worktrees/personal-harness-agent-1

Agent 2
  branch:   feat/personal-harness-agent-2-toolbox
  worktree: /home/hamza/repo/satori_bridge/.worktrees/personal-harness-agent-2

Agent 3 Task-6 baseline
  branch:   feat/personal-harness-agent-3-terminal-core
  worktree: /home/hamza/repo/satori_bridge/.worktrees/personal-harness-agent-3

Agent 3 Task-6.5 challenger
  branch:   feat/personal-harness-herdr-evaluation
  worktree: /home/hamza/repo/satori_bridge/.worktrees/personal-harness-herdr-evaluation
  base:     Agent-3 Task-6 commit 3ff8c6eb03a4dccdd393a324e5d4e6edf891cdc6 + coordination-doc update
```

The original Wave-1 branches started from coordination commit `8ff5db7`. Follow-up missions start from the dependency commit they actually need; Task 6.5 starts from Agent 3's qualified Task-6 Terminal-core commit plus this coordination-doc update.

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

### Agent 3 Task-6.5 challenger owns

```text
experiments/herdr/**
docs/benchmarks/herdr-terminal-comparison.md
```

Task 6.5 is intentionally read-only with respect to production `providers/terminal/**`, Terminal systemd units, personal MCP composition, and the live bridge. A `HERDR_WINS` or `HYBRID_WINS` result creates a design-amendment gate; it does not authorize production migration in the experiment branch.

## Global no-overlap rules

- Do not edit files owned by another Wave-1 mission.
- Do not reset, restore, stash, cherry-pick, or rewrite another mission's branch.
- Do not modify the live `mcp-dev-bridge` composition during Wave 1.
- Agent 3 may test the **new dedicated Terminal units** because they are independent of the live bridge, but must not restart/stop 1MCP, Cloudflare, or `mcp-dev-bridge.service`.
- Do not write secrets/session tokens into Git or reports.
- Use TDD where the master plan specifies RED/GREEN.
- Preserve unrelated public-release work and public profile behavior.

## Current integration and decision gates

Task 4 is already unblocked by the completed Agent-1 personal path contract and may proceed independently on its own branch.

The Wave-1 integrator will:

1. review/integrate Agent 1 foundation first;
2. integrate Agent 2 toolbox and wire its focused portable test into shared root verification;
3. integrate Agent 3 Terminal core;
4. run the full combined baseline;
5. publish the integrated HEAD for follow-up production missions.

**Task 7 must not start merely because Wave-1 integration is green.** It also waits for Task 6.5.

Task-7 gate:

```text
Task 6.5 = TMUX_BROKER_WINS | HERDR_NOT_MATERIAL
  -> Task 7 may use the current tmux/broker production plan.

Task 6.5 = HERDR_WINS | HYBRID_WINS
  -> STOP production Terminal integration.
  -> write/review focused Terminal design amendment.
  -> only then open the revised Task-7 mission.
```

Task 8 waits for the winning Terminal backend's real ChatGPT product-path acceptance plus the Herdr wait/lifecycle verdict.

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
