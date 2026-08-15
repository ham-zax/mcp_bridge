# Personal WSL Codex Harness Phase 2 — Parallel Agent Coordination

**Date:** 2026-08-15
**Authority:** `docs/superpowers/plans/2026-08-15-personal-wsl-codex-harness-phase-2.md`
**Execution shape:** Hybrid — independent task worktrees with one integration branch and explicit convergence gates.

## Current frontier — 2026-08-15

The original Wave-1 split below is retained as execution history. The authoritative current state is:

```text
INTEGRATION BRANCH
feat/personal-harness-wave1-integration
combined local implementation/evidence milestone before final status-doc sync: a619da3
combined automated gate: PASS

COMPLETE / INTEGRATED
Tasks 1-6.6 personal Files/Bash + apply_patch + toolbox + durable tmux/broker foundation
Task 7      LOCAL_IMPLEMENTATION_COMPLETE + LOCAL_ACCEPTANCE_COMPLETE; REAL_CHATGPT_ACCEPTANCE_PENDING
Tasks 9-10 rooted CodeDB router + code_search / code_context / code_symbol facade
Task 11     RTK decision -> no harness integration; explicit helper only
Task 12     concurrency trigger evidence retained
Task 12.5   SAME_PATH_ATOMICITY_FIXED + CANCELLATION_SAFETY_FIXED; MODEL_VISIBLE_HASH_NEEDED = NO
Task 13     FINAL: FORMAT_TRIGGER_NOT_FIRED; production codec work NONE

NEXT FRONTIER
rollback bundle preparation
-> live bridge activation
-> Actions Refresh
-> fresh ChatGPT Terminal acceptance
-> Task 8 evidence-driven await/resume decision
-> final consolidation / Task 14
```

Do not reopen the Herdr backend or automatic RTK decisions during Phase 2 without materially contradictory new evidence. Task 12.5 has proven provider-internal atomic enforcement and cancellation safety; `MODEL_VISIBLE_HASH_NEEDED = NO` unless future real stale-read evidence reopens that trigger.

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

The Task-6.5 Herdr verdict is complete. Task 8 await/resume now remains blocked only on real Task-7 ChatGPT product-path Terminal evidence after rollback-gated live activation.
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

The combined local Phase-2 harness through Task 7, Task 12.5 cancellation safety, and the final Task 13 format audit is assembled on `feat/personal-harness-wave1-integration`. The complete local automated gate is green. Live activation remains a separate rollback-gated mission and has not been performed from this integration worktree.

Current decisions:

```text
apply_patch                     BOTH_EARN_PLACE
Terminal backend                TMUX_BROKER_WINS
Herdr runtime/hybrid            REJECTED_WITH_EVIDENCE
Code facade                     CODE_SMALL_EXPLICIT_FACADE
RTK automatic harness shaping   REJECTED_WITH_EVIDENCE
RTK explicit helper             optional outside harness architecture
same-path Files atomicity       SAME_PATH_ATOMICITY_FIXED
queued mutation cancellation    CANCELLATION_SAFETY_FIXED
Files synchronization scope     canonical-path cooperative only; not hard-link/inode or external-process serialization
model-visible revision/hash     MODEL_VISIBLE_HASH_NEEDED = NO
format trigger                  FORMAT_TRIGGER_NOT_FIRED
TOON                            REJECTED_WITH_EVIDENCE
GCF generic                     DEFERRED_WITH_TRIGGER
GCF graph                       DEFERRED_WITH_TRIGGER
production codec implementation NONE
```

**Task 7 is locally implemented, integrated, and locally accepted.** Its real ChatGPT product-path acceptance is still pending. No bridge/1MCP restart or Actions Refresh belongs to this local integration milestone.

Task 8 remains blocked on the required real product path: integrated deployment -> rollback preparation -> live bridge activation -> Actions Refresh -> fresh ChatGPT session -> real Terminal acceptance. Herdr's lifecycle states are reference evidence only; Herdr is not a runtime dependency.

Task 12.5 is FINAL + INTEGRATED with both `SAME_PATH_ATOMICITY_FIXED` and `CANCELLATION_SAFETY_FIXED`; model-visible revision/hash fields are not needed. Task 13 is FINAL + INTEGRATED: inspection of the finished Task-7 MCP confirms six Terminal tools, native `TextContent` only, no `structuredContent`, incremental/native terminal reads, concise list output, and concise administrative acknowledgements, so the format trigger remains not fired. Final consolidation follows the Task 8 evidence-driven decision after real ChatGPT acceptance.

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
