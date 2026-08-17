---
name: persistent-agent-loop
description: Use when a task must remain active across extended waiting, repeated tool work, user steering, process observation, or multi-hour mission execution until explicit or verified completion.
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

## Use native timers for time-based wakeups

Use Dev `wait` with `{kind:"timer", after_seconds:N}` for relative wakeups, or `{kind:"timer", at:"2026-08-17T09:00:00+05:30"}` for an absolute timezone-qualified wakeup.

Do not use Bash `sleep`, repeated polling, or an impossible file/process condition as a timer.

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
