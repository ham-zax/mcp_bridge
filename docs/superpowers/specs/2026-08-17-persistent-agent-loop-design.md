# Satori Persistent Agent Loop

**Stay alive until the mission is done.**

Date: 2026-08-17
Status: Design proposal

## Vision

A conversation does not have to behave like a single request followed by a single response.

It can become a persistent operational loop: reason, act, checkpoint, wait, wake, accept steering, reassess, and continue until the mission reaches a verified terminal state.

The important change is not a longer timeout. The important change is a different execution model.

Instead of trying to keep one remote call open for hours, the agent externalizes durable state, works in bounded tool calls, and repeatedly returns to a durable wait. Each wakeup becomes another chance to inspect reality, process new steering, perform work, and decide whether the mission is complete.

The result is a conversation that can behave less like a transient chat reply and more like a resident agent.

> The heartbeat does not keep a Linux process alive. It keeps the reasoning cycle available: wake, inspect, decide, act, checkpoint, and wait again.

The mission ends because its completion criteria were verified, because an operator explicitly stopped it, or because continuation became impossible and the mission state was safely checkpointed. It does not end merely because a heartbeat returned, a subtask finished, or a temporary wait expired.

## What has already been demonstrated

The current harness has demonstrated the key primitives required for this model:

- one active assistant turn remained alive for 39 minutes 19.529 seconds;
- five inbound steering interruptions were incorporated without abandoning the held workflow;
- unrelated side work was completed while a durable wait remained pending;
- stop conditions were changed repeatedly during the same active turn;
- durable named waits survived many short MCP/RPC invocations;
- repeated pending wait results re-entered reasoning and acted as cooperative heartbeats;
- the durable wait lifetime remained separate from the lifetime of any individual RPC call.

These results demonstrate the mechanics for a persistent agent loop. They do not establish a guaranteed maximum ChatGPT active-turn lifetime. A one-day or two-day mission must therefore be designed for both continuous execution and deterministic recovery.

## Core principle: mission lifetime is not RPC lifetime

The system has three distinct lifetimes and they must never be conflated.

```text
Mission lifetime
    hours / days / until verified completion

Durable wait lifetime
    up to the wait engine limit per lease
    currently 1..86400 seconds

One MCP/RPC invocation
    intentionally short and bounded
    wait hold currently 0..15 seconds
```

The mission is the durable concept.

A wait is only one lease inside that mission.

An RPC is only one short interaction used to advance or observe the mission.

This separation is what makes long-running behavior practical.

## Persistent Agent Loop

```text
                    +---------------------+
                    |       MISSION       |
                    | goal + stop rules   |
                    +----------+----------+
                               |
                               v
                    +---------------------+
             +----->|       REASON        |
             |      | choose next action  |
             |      +----------+----------+
             |                 |
             |                 v
             |      +---------------------+
             |      |        WORK         |
             |      | tools / files / PTY |
             |      +----------+----------+
             |                 |
             |                 v
             |      +---------------------+
             |      |     CHECKPOINT      |
             |      | persist what matters|
             |      +----------+----------+
             |                 |
             |                 v
             |      +---------------------+
             |      |      HEARTBEAT      |
             |      | durable wait/resume |
             |      +----------+----------+
             |                 |
             |                 v
             |      +---------------------+
             |      | PROCESS STEERING    |
             |      | if any has arrived  |
             |      +----------+----------+
             |                 |
             |                 v
             |      +---------------------+
             |      | MISSION COMPLETE?   |
             |      +-----+----------+----+
             |            |          |
             |            | no       | yes
             +------------+          v
                               verify result
                                     |
                                     v
                                  FINISH
```

The loop is cooperative rather than continuously blocking. A pending wait result is a scheduling point: the agent may process steering, inspect state, perform another tool action, or simply resume the same named wait.

## Mission state

Long-running work should have an explicit mission record outside model memory. The exact representation can vary, but the logical fields should include:

```text
mission_id
objective
success_criteria
stop_conditions
current_phase
completed_work
pending_work
known_blockers
important_artifacts
active_waits
last_checkpoint
next_intended_action
recovery_notes
```

The mission record is not intended to mirror every thought. It records only the state required to resume correctly after compaction, interruption, model replacement, or an unexpected hard cutoff.

For repository work, a local untracked checkpoint file is a suitable default unless the mission itself requires committed state.

## Heartbeat semantics

A heartbeat is not a timer notification pushed into the model. In the current harness it is a cooperative pull cycle:

```text
reason
  -> wait(name, hold_seconds <= 15)
  -> pending
  -> reasoning regains control
  -> inspect steering / do work / resume
```

The durable wait keeps the underlying condition and absolute deadline alive across these short calls.

### Recommended heartbeat cadence

Heartbeat cadence should reflect the mission, not a fixed ritual.

- Interactive or rapidly changing work: approximately 15-60 seconds.
- Builds, deployments, CI, or service readiness: 30 seconds to several minutes.
- Slow external dependencies: several minutes or longer.
- Long quiet monitoring: sparse wakeups unless a real condition can wake the agent directly.

The existing 15-second maximum `hold_seconds` is a harness policy for one invocation, not a requirement that every mission must perform meaningful work every 15 seconds.

Repeated heartbeats should not create busywork. If nothing changed, resume the wait.

## Steering protocol

Inbound steering is treated as a first-class event in the active loop.

At the next cooperative reasoning boundary:

1. read the new instruction;
2. determine whether it supplements, reprioritizes, pauses, replaces, or terminates the mission;
3. persist any mission-state change that matters for recovery;
4. perform the requested work when it is compatible with the mission;
5. resume the original durable workflow unless the steering explicitly replaced or terminated it.

A steering message must not implicitly destroy the active wait or mission context.

Examples:

```text
"Give a checkpoint."
    -> report current state
    -> resume mission

"While waiting, inspect these logs."
    -> perform side task
    -> checkpoint findings
    -> resume same wait

"Change the stop time to 30 minutes from now."
    -> update stop condition
    -> cancel superseded stop wait if necessary
    -> arm replacement stop wait
    -> continue

"Stop now."
    -> checkpoint
    -> cancel active waits
    -> verify shutdown state
    -> finish
```

## Work while waiting

A durable wait does not mean the agent is locked into passive idling.

Once a wait invocation returns `pending`, the underlying named wait remains alive. The agent may then:

- edit files;
- run bounded commands;
- inspect repository state;
- interact with a persistent Terminal process;
- review logs;
- handle an unrelated steering task;
- create checkpoints;
- evaluate whether completion conditions have become satisfied through another source;
- resume the same wait afterward.

This is the core property that turns waiting into cooperative scheduling rather than sleeping.

## Long process model

Processes that must outlive an RPC belong in a durable process substrate, normally Terminal/tmux or systemd.

```text
ChatGPT reasoning
      |
      +-- launch / inspect durable process in Terminal
      |
      +-- arm wait for output / exit / readiness
      |
      +-- heartbeat
      |
      +-- perform other work
      |
      +-- resume wait
      |
      +-- react when condition matches
```

A long build, server, watch process, or coding agent should not be represented as one giant Bash call merely to keep the reasoning turn occupied.

## Completion contract

The loop must be conservative about declaring completion.

Do not end merely because:

- one wait timed out;
- one heartbeat returned;
- a single subtask completed;
- no work is immediately actionable;
- a process exited unexpectedly;
- a steering message temporarily diverted attention;
- one tool call failed;
- the agent has been active for a long time.

End only when one of these terminal conditions holds:

### Verified success

All mission success criteria are satisfied and the required verification has run successfully.

### Explicit termination

An operator explicitly instructs the mission to stop.

### Irrecoverable or unsafe continuation

The mission cannot continue safely or meaningfully. Before ending, persist enough checkpoint state for deterministic recovery and clearly record the blocker.

The final answer should summarize the verified terminal state, not merely announce that the loop has stopped.

## Wait leases and multi-day missions

The current wait engine supports a maximum durable timeout of 86400 seconds, or 24 hours.

A mission may last longer than one wait lease.

For a two-day mission:

```text
MISSION: 48h or until complete

lease A: <= 24h
    |
    +-- heartbeat / work / steering
    |
    +-- checkpoint before expiry
    |
    v
renew
    |
lease B: <= 24h
    |
    +-- continue until mission completion
```

Lease renewal should preserve mission identity and state. A new wait name may be used for the new lease, but it must not be mistaken for a new mission.

A lease expiry is therefore a maintenance event, not a mission completion event.

## Hard-cutoff recovery

The active ChatGPT turn may eventually encounter an external platform cutoff that is not controlled by the local harness.

The protocol should assume that such a cutoff is possible even if its exact limit is unknown.

The defense is checkpoint discipline.

Before long quiet periods, after meaningful work, after steering changes, and before wait-lease renewal, persist enough state that a successor turn can answer:

```text
What is the mission?
What has already been completed?
What is currently running?
What waits or external conditions matter?
What was the next intended action?
What would count as completion?
```

Recovery flow:

```text
new turn / recovered session
        |
        v
load mission checkpoint
        |
        v
inspect real external state
        |
        v
reconcile stale waits/processes
        |
        v
resume from next valid action
```

The design target is therefore not an "immortal invocation." It is a **persistent mission with opportunistically continuous reasoning**.

## Failure handling

### Tool-call failure

Record the failure, determine whether it is transient, retry only when justified, and keep the mission alive unless the failure satisfies a real stop condition.

### Wait source unavailable

Preserve the same durable wait when possible, restore the source, and resume by name. Do not silently re-arm a different boundary unless the original wait is genuinely gone or intentionally replaced.

### Connector/RPC timeout

Treat it as a transport failure, not evidence that the underlying Linux process or durable wait stopped. Reconnect, inspect external state, and resume from durable mission state.

### Unexpected process exit

Inspect evidence and decide whether the process completed, failed, or must be restarted. Process exit alone is not mission completion.

### Checkpoint corruption or missing state

Stop autonomous mutation until real external state has been inspected sufficiently to reconstruct a trustworthy mission state.

## Operating modes

### Mission Agent

"Keep working until the acceptance criteria pass."

The loop alternates between implementation, verification, repair, and waits for long-running processes. Completion is tied to verified criteria.

### Watch Agent

"Stay with this deployment/build/service and act when its state changes."

Most cycles are waits. Work is triggered by readiness, output, exit, service state, or steering.

### Resident Human-Steered Agent

"Remain active. Preserve the main mission while accepting new instructions as they arrive."

The agent functions as a resident collaborator: it can pause, inspect, perform side work, reprioritize, and resume without losing mission continuity.

### Long Research or Data Agent

"Iteratively gather, process, checkpoint, and continue until the research objective is satisfied."

External calls remain bounded while the mission record carries progress across long pauses and possible turn replacement.

## Anti-patterns

Do not implement the persistent loop as:

- one enormous Bash command;
- `sleep` inside a shell loop merely to keep a session alive;
- one MCP call expected to survive for hours;
- repeated creation of new waits that silently reset the intended deadline;
- a heartbeat that performs meaningless mutation just to prove activity;
- a mission whose only durable state exists in model context;
- automatic completion when a wait lease expires;
- pretending that a 24-hour local wait proves a 24-hour ChatGPT active-turn guarantee.

## Proposed operating protocol

A future agent following this design should use this compact loop:

```text
1. Define mission objective and verified completion criteria.
2. Create or load durable mission checkpoint.
3. Inspect real external state before acting.
4. Choose and perform the next bounded action.
5. Persist material progress.
6. If waiting is required, arm or resume a durable named wait.
7. On each pending return:
      a. process new steering;
      b. perform any useful side work;
      c. update checkpoint when material state changed;
      d. resume the wait when appropriate.
8. When a condition matches or times out, reassess the mission; do not assume completion.
9. Renew wait leases before their maximum lifetime when the mission is still active.
10. Before any intentional finish, run completion verification.
11. End only on verified success, explicit termination, or safely checkpointed impossibility.
```

## Product and tool-description implications

Once further long-duration testing is complete, the model-facing tool and Skill guidance should teach the following concepts explicitly:

```text
wait creates durable named condition/timer state.

The durable deadline can span many MCP calls. `hold_seconds` controls only one invocation; `pending` does not cancel or reset the wait.

A pending wait result is a cooperative scheduling point. Process steering or perform useful work, then resume the same named wait when appropriate.

Long processes belong in Terminal/systemd and are observed with wait. Do not depend on one long RPC for multi-minute or multi-hour work.

Mission completion is separate from wait completion. A timeout, heartbeat, or lease expiry means reassess, not automatically finish.

For missions longer than one wait lease, checkpoint and renew the lease while preserving mission identity.
```

The harness now provides a native durable `timer` condition for relative and timezone-qualified absolute wakeups. Heartbeats remain cooperative/pull-based rather than server-pushed; timer matches improve scheduling semantics without changing that active-turn model.

## Success criteria for the design

This design is successful when an agent can:

- remain in one active reasoning workflow for as long as the product permits;
- survive repeated short RPC boundaries without losing mission continuity;
- perform arbitrary useful work between wait resumptions;
- accept multiple steering changes without abandoning the original mission unless explicitly replaced;
- persist enough mission state to recover after an unexpected hard cutoff;
- renew waits for missions exceeding one wait lease;
- avoid premature completion;
- terminate cleanly when verified success or an explicit stop condition is reached.

## Closing

A traditional chat turn waits for an answer.

A persistent agent loop waits for reality.

It can watch a build finish, follow a deployment through failure and recovery, keep a coding mission moving for hours, accept new priorities mid-flight, and return to the original objective without losing its place.

The durable wait is only the heartbeat. The checkpoint is only the memory. The tools are only the hands.

The real unit of persistence is the mission.

**Stay alive until the mission is done.**
