# Dual Mutation + Terminal Implementation — Agent Coordination

**Repository:** `/home/hamza/repo/websession_mcp_bridge`
**Source of truth:** `docs/superpowers/plans/2026-08-24-robust-agent-mutation-stack.md` and `docs/superpowers/plans/2026-08-24-terminal-presentation-frontends.md`
**Foundation commit:** `43decaf` (clean Browser foundation)
**Execution shape:** hybrid
**Current wave:** 2

## Current frontier

| Mission | Type | Status | Can start | Workspace | Isolation reason | Blocked by |
|---|---|---|---|---|---|---|
| Agent A — Terminal presentation frontends | mixed | integrated | complete | `/home/hamza/repo/websession_mcp_bridge-agent-a-terminal` | Wave 1 concurrent writer | none |
| Agent B — Mutation provider migration | executable | integrated | complete | `/home/hamza/repo/websession_mcp_bridge-agent-b-mutation` | Wave 1 concurrent writer | none |
| Agent B — Mutation surface migration | mixed | ready | now | `/home/hamza/repo/websession_mcp_bridge-agent-b-mutation` | single writer over shared docs/Skills after Wave 1 integration | integrated Wave 1 |

## Dependency map

```text
Browser foundation 43decaf
        |
        +---------------------------+
        |                           |
        v                           v
Agent A: Terminal Tasks 1-3    Agent B: Mutation Task 1
        |                           |
        +------------+--------------+
                     v
          integrated on main
                     |
                     v
        Mutation Task 2 surface/docs/Skills
        (Wave 2; Agent B single writer)
                     |
                     v
      combined current docs/development.md gate
                     |
          +----------+-----------+
          |                      |
          v                      v
 Terminal runtime activation   Dev runtime activation
 / live acceptance            / live catalog check
          |                      |
          +----------+-----------+
                     v
         final ChatGPT Skill activation
          + fresh-session acceptance
```

## Shared contracts

- The two authoritative plans are current requirements. Do not expand them with speculative abstractions or adjacent cleanup.
- Agent A owns the Terminal presentation edge and its repository-facing config/docs/router changes. Agent B Wave 1 must not edit those shared surface files.
- Agent B Wave 1 owns only the Pi Dev provider migration described by Mutation Plan Task 1. It must not edit routing Skills or normative docs yet.
- `providers/terminal/broker.mjs`, tmux lifetime, broker ownership, and Terminal MCP schemas remain unchanged unless the Terminal plan stop conditions are reached.
- Edit V2 and `withMutationPaths` remain authoritative for existing-text mutations/cooperating Dev serialization; Mutation Wave 1 must not redesign them.
- Tests explicitly required by the source plans are authorized. Do not add test frameworks or unrelated cases.
- Live activation is serialized after source integration and the current repository Full verification gate; neither Wave 1 agent should mutate live machine preference or restart production services.

## Workspace policy

Two separate worktrees are justified because Agents A and B will write concurrently. Their Wave 1 file ownership is intentionally disjoint to avoid shared-state coordination. Both worktrees start from one coordination commit on top of clean foundation `43decaf`.

Agents must use their assigned worktree and must not create additional worktrees. Do not edit the main checkout from an agent worktree mission.

## Integration policy

Wave 1 is integrated on `main`: Agent A Terminal commit `68ef15a` and Agent B mutation commits `06892c9` + FIFO repair `11da94b` are present through planner merge commits.

The mutation plan's shared surface/docs/Skill migration is now the active frontier and is assigned to one writer because it edits files already changed by Agent A (`skills/mcp-harness-router/SKILL.md`, `skills/SNAPSHOT_SHA256.txt`, `docs/architecture.md`, `docs/configuration.md`, `docs/personal/harness.md`). Integrate that mission before the combined repository Full verification gate.

Do not run live activation or the final combined repository gate from the Wave 2 agent branch; the planner owns those after integration.

## Execution lifetime policy

The current Wave 2 mission is an ordinary bounded implementation session. Use bounded Bash for normal commands. If a required command becomes long-running, keep it durable in Terminal and observe it with the repository wait path rather than restarting it. No persistent-agent-loop is required unless the mission unexpectedly becomes wait-heavy or user-steered across long-lived processes.

## Validation policy

Testing is authorized only where the source plans explicitly require it.

- Wave 1 required Terminal and Pi Dev tests are complete and integrated.
- Wave 2 surface migration runs only the source-plan-required Skill/checksum validation plus `git diff --check`; it does not add or expand tests.
- The planner owns the current repository-wide Full verification gate after Wave 2 integration.
- No new test framework, broad cleanup suite, or duplicated coverage.

## Future / blocked work

- Mutation surface/docs/Skill migration (Mutation Plan Task 2) — ready now as Wave 2.
- Combined repository candidate verification — blocked by completion and integration of Wave 2.
- Terminal machine-local `windows-terminal` activation and live acceptance — blocked by green combined candidate.
- Dev live `file_ops` activation/catalog acceptance — blocked by green combined candidate.
- ChatGPT Skill installation/update and fresh-session acceptance for final router/superpowers bundles — blocked by final repository Skill state; may require user UI action.

## Status log

- `2026-08-24` — Browser foundation confirmed clean at `43decaf`; both updated implementation plans read once and accepted as authoritative.
- `2026-08-24` — Wave 1 split chosen: Terminal repository implementation in Agent A; Pi Dev provider migration in Agent B; shared mutation surface deferred until integration.
- `2026-08-24` — Agent A commit `68ef15a` and Agent B commits `06892c9` + `11da94b` verified and integrated on `main`; FIFO regression independently rechecked 11/11.
- `2026-08-24` — Wave 2 materialized as one Agent B shared-surface mission on the integrated repository.
