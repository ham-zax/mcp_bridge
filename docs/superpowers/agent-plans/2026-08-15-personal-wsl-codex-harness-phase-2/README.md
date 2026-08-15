# Personal WSL Codex Harness Phase 2 — Parallel Agent Coordination

**Date:** 2026-08-15
**Authority:** `docs/superpowers/plans/2026-08-15-personal-wsl-codex-harness-phase-2.md`
**Execution shape:** Hybrid — independent task worktrees with one integration branch and explicit convergence gates.

## Current frontier — 2026-08-15

The original Wave-1 split below is retained as execution history. The authoritative current state is:

```text
INTEGRATION BRANCH
feat/personal-harness-wave1-integration
accepted live Task-7 / Files-Code-Terminal milestone: 6d7e76c2812947cc2f9dab2c0616373efb80c85e
combined automated gate: PASS
live Task-7 product gate: TERMINAL_ACCEPTED

COMPLETE / INTEGRATED
Tasks 1-6.6 personal Files/Bash + apply_patch + toolbox + durable tmux/broker foundation
Task 7      COMPLETE + LIVE_ACCEPTED; real ChatGPT verdict TERMINAL_ACCEPTED
Tasks 9-10 rooted CodeDB router + code_search / code_context / code_symbol facade
Task 11     RTK decision -> no harness integration; explicit helper only
Task 12     concurrency trigger evidence retained
Task 12.5   SAME_PATH_ATOMICITY_FIXED + CANCELLATION_SAFETY_FIXED; MODEL_VISIBLE_HASH_NEEDED = NO
Task 13     FINAL: FORMAT_TRIGGER_NOT_FIRED; production codec work NONE

TASK 8 DESIGN
SPLIT_LAYER
one personal wait(...) action preferred
independent durable Terminal wait cursor
coding-agent lifecycle DEFERRED_WITH_TRIGGER
schema/context value gate required before product activation
implementation not started

NEXT FRONTIER
Task 8 implementation on a fresh worktree
-> local restart/cancellation/schema-value qualification
-> fresh rollback anchor of the accepted Task-7 live system
-> Task-8 live activation + Actions Refresh
-> real ChatGPT wait/resume acceptance
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

The Task-6.5 Herdr verdict is complete and Task 7 subsequently passed the real ChatGPT product path. Task 8 is no longer blocked on evidence: its focused design/implementation plan is coordinator-reviewed and ready for implementation. Herdr lifecycle behavior remains reference evidence only.
Tasks 9-10 Code router/facade are complete.
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

The combined Phase-2 harness through Task 7, Task 12.5 cancellation safety, and the final Task 13 format audit is assembled on `feat/personal-harness-wave1-integration`. The complete local automated gate is green, the candidate was rollback-gated live-activated, Actions were refreshed, and real ChatGPT Terminal acceptance passed with `TERMINAL_ACCEPTED`. The currently accepted runtime milestone remains `6d7e76c2812947cc2f9dab2c0616373efb80c85e` while Task 8 stays isolated until its own qualification.

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

**Task 7 is COMPLETE + LIVE_ACCEPTED.** Real ChatGPT proved connector/Code access, incremental zero-duplicate Terminal reads, resize, retained exit 7, broker-only restart survival with identical tmux/pane PIDs, exact-PTY human takeover with model write/resize/close blocked, model observation during takeover, control restoration after detach, and normal cleanup.

**Task 8 design is COMPLETE + COORDINATOR REVIEWED; implementation is next.** The selected architecture is `SPLIT_LAYER`: Terminal keeps private generation/transcript facts; one durable personal `wait(...)` action in `dev` owns named timeout/check/resume for Terminal output/exit plus minimal local readiness conditions. Agent lifecycle remains deferred with trigger. Before product activation, the implementation must pass an actual schema/context-value benchmark, and a fresh rollback bundle must snapshot the accepted Task-7 deployment rather than relying on the older pre-Task-7 rollback.

A post-acceptance same-name Terminal reopen probe found stale transcript replay from the prior incarnation. That does not invalidate `TERMINAL_ACCEPTED` for the qualified unique-name workflow, but Task-8 Task 1 must fix it with fresh per-incarnation state plus generation-guarded explicit reads before waits depend on session identity.

Task 12.5 is FINAL + INTEGRATED with both `SAME_PATH_ATOMICITY_FIXED` and `CANCELLATION_SAFETY_FIXED`; model-visible revision/hash fields are not needed. Task 13 is FINAL + INTEGRATED: inspection of the finished Task-7 MCP confirms six Terminal tools, native `TextContent` only, no `structuredContent`, incremental/native terminal reads, concise list output, and concise administrative acknowledgements, so the format trigger remains not fired. Final consolidation follows Task-8 implementation and real wait/resume product acceptance.

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
