---
name: persistent-agent-loop
description: Use when a task must remain active across extended waiting, repeated tool work, user steering, process observation, multi-hour mission execution, or execution of a planner-generated workflow that may outlive one ordinary turn.
---

# Persistent Agent Loop

## Core invariant

Keep the **mission** alive across short tool/RPC boundaries. A heartbeat, `pending` wait result, timer firing, subtask completion, or temporary lack of work is a scheduling event, not mission completion.

End only when one of these is true:

1. the mission completion criteria are verified;
2. the user explicitly stops or replaces the mission; or
3. continuation is impossible or unsafe and the recoverable state has been checkpointed.

## Use the cooperative loop

```text
reason -> act -> checkpoint if meaningful -> wait -> reassess -> continue
```

- Treat `wait(...)=pending` as a cooperative scheduling point. The named wait remains durable; process new steering or do other useful tool work, then resume by the same name when appropriate.
- Do not manufacture activity. If nothing changed, resume the wait.
- User steering has priority over the previous next action. Decide whether it supplements, reprioritizes, replaces, or stops the mission; preserve the original mission unless steering changes it.
- For persistent commands, servers, builds, or interactive work, keep process lifetime in Terminal and use `wait` for output/readiness/exit observation.
- Keep Terminal work headless by default. If live human visibility is useful from the start, use `terminal_open(..., present:true)` so the exact private tmux PTY is visible in Kitty while tmux/broker remain the lifetime and ownership authority. For an already-running headless session, passive viewing can be offered through the human-side `wsl-term present <session>` frontend; use `terminal_yield` only when human input/control is actually useful.
- Treat ordinary steering, status requests, progress questions, and compatible side tasks as in-mission events, not implicit termination. Answer or perform them, update/checkpoint material state when needed, then continue the mission unless completion is verified or the user explicitly stops/replaces it.

## Compose with agent-workflow-planner

If `agent-workflow-planner` is available and the mission still needs explicit decomposition, dependency ordering, execution phases, or substantial replanning, use that Skill for the planning layer and keep this Skill responsible for execution lifetime.

- Let `agent-workflow-planner` own **what should happen and in what order**.
- Let `persistent-agent-loop` own **how the mission stays alive while that plan is executed**: durable waits, timers, steering, checkpoints, persistent-process observation, lease renewal, and completion gating.
- When producing a ready-to-run plan or agent prompt for work that is expected to be long-lived, tell the executing agent to use `persistent-agent-loop` for the execution phase.
- Normalize long-lived planned phases around a concrete wake strategy: `timer` when time itself should wake the mission; an event wait when external state should wake it; Terminal + event wait when a persistent process owns the work.
- If major steering invalidates the current plan, consult `agent-workflow-planner` again when useful, then resume the persistent loop with the revised plan.
- Do not require the planner for a simple long wait or already well-specified mission, and do not duplicate the persistent-loop protocol inside the planner.

## Use native timers for time-based wakeups

Use Dev `wait` with `{kind:"timer", after_seconds:N}` for relative wakeups, or `{kind:"timer", at:"2026-08-17T09:00:00+05:30"}` for an absolute timezone-qualified wakeup.

Do not use Bash `sleep`, repeated polling, or an impossible file/process condition as a timer.

Choose the wakeup condition dynamically from mission semantics: use `timer` when time itself is the reason to wake; use an event condition such as Terminal output/exit, process exit, TCP readiness, file state, HTTP readiness, or systemd state when external reality is the reason to wake. Prefer the event condition when it can wake the mission earlier and more precisely than a periodic timer.

`timeout_seconds` is the durable safety deadline, not the timer itself. Keep it **strictly later** than the timer target because the safety deadline wins ties. It supports at most 86400 seconds; `timer.after_seconds` supports at most 86399 seconds. `hold_seconds` only controls one MCP invocation and remains at most 15 seconds.

## Keep long missions recoverable

Checkpoint only meaningful mission state: goal, completion criteria, verified progress, durable process/wait identifiers, artifacts, steering decisions, blockers, and the next intended action. Never checkpoint secrets.

For missions that may span more than 24 hours, renew waits as <=24-hour leases after a checkpoint. Do not increase `hold_seconds` or pretend a single ChatGPT turn is guaranteed to live forever.

## Read the detailed protocol when needed

Read [references/protocol.md](references/protocol.md) before any mission expected to span more than about 30 minutes, accept repeated user steering, cross a 24-hour lease boundary, or require hard-cutoff recovery; follow its state, steering, lease, and recovery rules.

## Completion gate

Before ending a mission:

- re-read the completion criteria;
- run fresh verification appropriate to the task;
- distinguish verified completion from temporary idleness;
- cancel obsolete waits only when they are no longer part of the mission;
- leave a durable checkpoint if the mission cannot safely continue.

Never claim uninterrupted multi-day execution merely because the local wait state can survive that long. Report only the continuity actually observed.
