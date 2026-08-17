# Active-Turn Wait Experiment Wrap-Up

Date: 2026-08-17
Canonical timestamp zone for experiment evidence: `Asia/Kolkata` (`+05:30`)

## Purpose

Record what we have actually demonstrated about long-lived ChatGPT turns using the personal WSL harness, durable Dev waits, repeated MCP/RPC calls, arbitrary tool work between waits, and heartbeat-like reasoning wakeups. This file is intended to become the source material for later revisions to tool descriptions and the repository-owned `mcp-harness-router` Skill.

## Important correction: the 11-minute turn did not auto-close

The active-turn experiment ended after about 11 minutes 15 seconds because the experiment itself had an explicit stop condition: write six numbered notes, separated by nominal two-minute durable waits, then verify the log and return the final answer.

The sixth note was written at `2026-08-17 05:32:27.568 +0530`, after which ChatGPT deliberately completed the turn. There is no evidence from this experiment that ChatGPT has an 11-minute active-turn ceiling.

The user reports having had normal ChatGPT runs lasting 30-40 minutes or longer. Nothing observed in this experiment conflicts with that. A longer active-turn-duration ceiling, if one exists, remains unmeasured here.

## Evidence from the completed run

Source log: [`timer-ping-test.log`](../../timer-ping-test.log)

Observed numbered writes:

```text
Note 1 | 2026-08-17 05:21:12.568 +0530 | tool=mcp-harness-local.dev_1mcp_bash
Note 2 | 2026-08-17 05:23:23.935 +0530 | tool=mcp-harness-local.dev_1mcp_bash
Note 3 | 2026-08-17 05:25:39.964 +0530 | tool=mcp-harness-local.dev_1mcp_bash
Note 4 | 2026-08-17 05:27:56.554 +0530 | tool=mcp-harness-local.dev_1mcp_bash
Note 5 | 2026-08-17 05:30:13.163 +0530 | tool=mcp-harness-local.dev_1mcp_bash
Note 6 | 2026-08-17 05:32:27.568 +0530 | tool=mcp-harness-local.dev_1mcp_bash
```

Measured write-to-write intervals:

```text
Note 1 -> 2: 131.367 s
Note 2 -> 3: 136.029 s
Note 3 -> 4: 136.590 s
Note 4 -> 5: 136.609 s
Note 5 -> 6: 134.405 s
```

The requested durable wait deadline was 120 seconds. The additional 11-17 seconds per interval came from reasoning, MCP invocation, wait-arm/resume, and write-call overhead. Therefore durable-wait timeout is appropriate for "at least N seconds before continuing" semantics, not precision wall-clock scheduling.

## What is demonstrated

### 1. Active-turn persistence

PASS for at least approximately 11 minutes 15 seconds.

One assistant turn remained open while ChatGPT repeatedly reasoned, invoked MCP tools, resumed durable waits, wrote files, and finally completed only after the sixth write.

This is evidence for multi-minute active-turn persistence. It is not evidence for any maximum duration.

### 2. Durable wait survives individual RPC boundaries

PASS.

A named Dev wait stores durable state under the provider state directory. The absolute wait deadline survives individual `wait` invocations. A later name-only resume checks the same wait rather than re-arming or restarting its deadline.

Current Pi Dev constants:

```text
timeout_seconds: default 300, range 1..86400
hold_seconds:    default 10, range 0..15
```

The durable timeout is the wait lifetime. `hold_seconds` is only the maximum time one particular wait RPC intentionally remains open.

### 3. The 15-second hold is local harness policy

PASS by source inspection.

`MAX_HOLD_SECONDS = 15` is defined by the repository's Pi Dev implementation and schema. It is not an MCP protocol limit and not a 1MCP protocol limit.

The reason for keeping wait invocations short is to avoid relying on one long connector request. The repository has separately observed a ChatGPT connector/RPC request-duration ceiling around a minute. That external request ceiling and the local 15-second hold are two different boundaries.

### 4. Arbitrary tool work can happen while a durable wait remains pending

PASS, with a sequential-RPC qualification.

Once a wait invocation returns `pending`, the named wait remains alive. ChatGPT can then call other tools, inspect or edit files, run Bash, reason about new information, and later resume the same wait.

While an individual wait RPC itself is currently outstanding, this reasoning thread is blocked on that RPC result; it does not simultaneously issue a second sequential tool call. The useful concurrency is therefore:

```text
wait RPC -> pending
             |
             +-> arbitrary reasoning/tool work
             |
             +-> resume same durable wait later
```

This is materially different from a Bash `sleep`, because the durable condition state is externalized and resumable between model/tool interactions.

### 5. Heartbeat-like reasoning wakeups work, but they are pull-based

PASS for pull/resume heartbeat behavior.

Repeated `wait(... hold_seconds<=15)` calls returned `pending` before the durable deadline. Each returned tool result re-entered the reasoning loop and allowed ChatGPT to decide what to do next.

This behaves like a cooperative heartbeat:

```text
reason -> wait RPC -> pending -> reason -> wait RPC -> pending -> ... -> timeout/match
```

It is not currently a push heartbeat. The harness does not independently inject a message into ChatGPT every 15 seconds. ChatGPT must issue/resume the wait call to receive the next `pending` result.

### 6. Timezone discrepancy can be eliminated at the evidence layer

PASS.

Experiment timestamps were generated with an explicit timezone instead of trusting the process default:

```bash
TZ=Asia/Kolkata date '+%Y-%m-%d %H:%M:%S.%3N %z'
```

This produced consistent `+0530` evidence even when the WSL process environment had previously reported a different local zone.

## What remains unproven

### Mid-turn user steering

Demonstrated in the follow-up steering experiment.

One active assistant turn ran from `2026-08-17 05:39:55.599 +0530` through `2026-08-17 06:19:15.128 +0530` and incorporated **five** user steering interruptions without abandoning the held workflow. The user was able to:

1. inject a no-op steering checkpoint;
2. request unrelated side work (three random essay files), after which the same durable-wait workflow resumed;
3. change the planned stop condition to 30 minutes total;
4. replace that with a three-minute stop; and
5. replace that again with 30 minutes from the fifth steering message.

The same conversation turn continued after each interruption. This demonstrates that, in this observed ChatGPT session, inbound user steering can be incorporated at cooperative tool/reasoning boundaries while an active long-running workflow is in progress.

This remains an observed product behavior rather than a formal guarantee about every client/model/runtime combination.

### Long-duration active-turn persistence

Now demonstrated for **39 minutes 19.529 seconds** in a controlled run with repeated wait RPCs, arbitrary tool work, and five user steering interruptions.

The wait engine supports deadlines up to 86400 seconds (24 hours), but that does not prove one ChatGPT active reasoning turn will remain schedulable for 24 hours. These are separate layers and must not be conflated.

Recommended duration tests, if desired:

```text
30 minutes
60 minutes
4 hours
24 hours
```

Each should use sparse evidence writes plus durable waits and should define an explicit stop condition so an intentional completion is not mistaken for a platform timeout.

### Precision timer / absolute-time wakeup

Not provided by the current wait condition vocabulary.

Current conditions are event/condition oriented (`terminal_output`, `terminal_exit`, `process_exit`, `tcp_listen`, `file_exists`, `file_changed`, `http_ready`, `systemd_user`). There is no native `time_reached` or elapsed-time condition.

Using a deliberately unmet condition and relying on `timeout_seconds` is useful for experiments but adds model/RPC overhead to the observed cadence. If precise heartbeat or wall-clock scheduling becomes a requirement, consider a native absolute-time wait condition rather than extending a single RPC hold.

## Candidate future tool-description guidance

Do not copy this wording blindly; update only after the remaining experiments.

Suggested conceptual guidance:

```text
wait creates durable named condition state. timeout_seconds is the absolute durable deadline and can span many MCP calls. hold_seconds controls only how long the current wait invocation stays open; returning pending does not cancel or reset the wait. Resume by name after doing other work. Use Terminal + wait for long-running process observation rather than one long Bash/RPC call. The current 15-second hold cap is harness policy, while the connector has a separate observed request-duration ceiling around a minute.
```

Steering guidance supported by the completed experiment:

```text
During long active-turn workflows, treat each pending wait result as a cooperative scheduling point: process new user steering or perform other tool work, then resume the same named wait when appropriate.
```

Potential addition only if a future native timer/heartbeat condition is implemented and verified:

```text
Use absolute-time/heartbeat waits for scheduled wakeups; do not emulate precision scheduling with repeated RPC holds or Bash sleep loops.
```

## Current repository state during this experimentation

The experiment logs, steering essays, and this wrap-up are deliberately kept separate from production behavior changes and remain uncommitted. The repository-owned router Skill durability/RPC guidance was separately committed as `c5637a5` before the steering experiment. Do not commit or publish the experimental evidence until the user explicitly decides it should be integrated.
