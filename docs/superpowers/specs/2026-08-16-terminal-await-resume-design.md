# Terminal Await/Resume Design

**Date:** 2026-08-16

**Base:** `6d7e76c2812947cc2f9dab2c0616373efb80c85e`

**Status:** COORDINATOR-REVIEWED DESIGN; IMPLEMENTATION NOT STARTED

## Decision summary

```text
WAIT_BOUNDARY                 SPLIT_LAYER
OUTPUT_WAIT_STRATEGY          durable Terminal transcript offsets; never capture-pane polling
MODEL_FACING_WAIT_API         one personal dev/Shell action: wait(...)
WAIT_STATE_DURABILITY         named 0600 state under existing personal dev state
SESSION_INSTANCE_BOUNDARY     every new Terminal open gets a new generation and fresh per-session transcript/model-cursor state
TRANSCRIPT_READ_GUARD         every wait transcript read is generation-guarded; replacement cannot satisfy an old wait
WAIT_SCHEMA_VALUE_GATE        measure actual tools/list tax and polling break-even before product activation
AGENT_LIFECYCLE               DEFERRED_WITH_TRIGGER
TASK8_IMPLEMENTATION_READY    YES
```

The selected design adds no Herdr dependency, no new Terminal MCP action, no fifth provider, no structured content, and no codec. Terminal remains the owner of terminal-native observation facts; a generic local wait engine owns timeout, cancellation, durable resume, and non-Terminal readiness checks.

## Problem statement

Persistent Terminal is now proven through the real product path, including broker-only restart while tmux and the exact PTY survive. The remaining problem is not terminal lifetime. It is how the model should wait for local state changes without repeatedly spending model turns on polling, rereading terminal screens, or holding one unbounded ChatGPT/MCP request open.

The design must cover two distinct classes of facts:

1. **Terminal-native facts** already owned by the tmux/broker architecture: durable transcript growth and retained pane exit status.
2. **Generic local-host facts** that are not Terminal state: explicit PID exit, TCP listener readiness, file state, HTTP readiness, and systemd user-service state.

The orchestration layer must remain durable across ordinary provider/broker/1MCP interruption while never becoming the owner of the underlying PTY, process, file, port, HTTP service, or systemd unit.

### Post-acceptance coordinator probe: same-name Terminal reuse

A live disposable probe after `TERMINAL_ACCEPTED` exposed one adapter defect that Task 8 must fix rather than preserve. The sequence was:

```text
open assistant-reopen-probe
emit OLD_SESSION_MARKER
read -> OLD_SESSION_MARKER
close
reopen assistant-reopen-probe
emit NEW_SESSION_MARKER
read -> OLD_SESSION_MARKER + NEW_SESSION_MARKER
```

The current `session.close` removes the tmux session but leaves the old per-name transcript directory, while the next `session.open` resets the model cursor to zero. Reusing a name can therefore replay output from the prior Terminal incarnation.

Task 8 already needs stable session generations, so the fix belongs in the same private Terminal identity work:

- a new Terminal incarnation must receive a new generation;
- broker-side same-name lifecycle operations are serialized so concurrent open/close/read/observe cannot race the incarnation transition;
- before a same-name new open becomes runnable, stale transcript/model-cursor/session metadata from the prior incarnation must be reset so old bytes cannot enter the new session;
- broker reconciliation of one still-existing tmux incarnation must preserve its generation and transcript;
- explicit transcript reads used by waits must be guarded by the expected generation so a close/reopen race cannot let bytes from a replacement session satisfy the old wait.

This is an adapter/session-state defect, not a rejection of the tmux lifetime architecture. Existing unique-name Task-7 acceptance remains valid.

## Authoritative Task-7 product evidence

The final product path passed:

```text
ChatGPT -> Cloudflare/OAuth -> 1MCP -> Terminal MCP -> broker -> tmux
```

Observed product behavior:

```text
connector heartbeat                       PASS
Code provider                             PASS
persistent shell                          PASS
incremental unread Terminal reads         PASS
second read with no new output            empty / no duplicate
resize                                    PASS
verified size                             33 101
retained non-zero status                  exit=7
```

Broker-only restart of live session `chatgpt-acceptance`:

```text
before:
  broker PID  3118267
  tmux PID    3118265
  pane PID    3135815

after:
  broker PID  3139861  changed
  tmux PID    3118265  unchanged
  pane PID    3135815  unchanged
```

The broker socket returned and ChatGPT wrote/read `AFTER_BROKER_RESTART` through the surviving PTY.

Human takeover also passed. During `wsl-term attach chatgpt-acceptance`, model reads remained allowed while model send/resize/ordinary close returned `HUMAN_HAS_CONTROL`. A human-side marker was visible through the transcript. After detach, model write control returned.

A small number of product tool invocations were intercepted before reaching MCP and succeeded on retry. This is observational product-runtime evidence only. It is not a Terminal defect and does not define a harness subsystem.

This evidence establishes the key premise for Task 8: the durable transcript and tmux lifetime boundary are trustworthy sources across broker replacement.

## Waiting scenario inventory

| Scenario | Exact observable fact | Owner | Phase-2 decision |
|---|---|---|---|
| Terminal output literal | bytes appended after a logical transcript offset | Terminal adapter | implement |
| Terminal output regex | pattern over appended transcript bytes | Terminal adapter | defer safe regex matcher; see trigger |
| Terminal pane exit | `pane_dead` + exact `pane_dead_status` for the retained pane | Terminal adapter | implement |
| Interactive shell foreground command exit | shell child returned while shell remains alive | not currently exact | do not claim/support |
| Explicit process/PID exit | Linux process identity disappears/replaced | generic engine | implement |
| Daemonized descendant completion | only observable if caller has explicit PID identity | generic engine | PID-based only; no Terminal ancestry promise |
| TCP listener readiness | connect succeeds | generic engine | implement |
| File existence | path exists at observation | generic engine | implement |
| File change | current stat fingerprint differs from arm-time baseline | generic engine | implement |
| HTTP readiness | bounded request returns accepted status | generic engine | implement |
| systemd user service state | user manager reports requested `ActiveState` | generic engine | implement |
| Coding-agent lifecycle | semantic `working/idle/blocked/done/unknown` | optional detector layer | deferred with trigger |

The initial generic condition set is intentionally declarative. It does not include a repeatedly executed shell predicate because a shell predicate could have side effects on every poll and would make durable state persist arbitrary command text.

## Architecture alternatives

### A. Terminal-specific waiting only

A seventh Terminal tool such as `terminal_wait` could wait for output and pane exit.

Advantages:

- simple ownership for transcript/pane facts;
- no cross-provider Terminal adapter.

Rejected because:

- port/file/HTTP/systemd/PID conditions are not Terminal facts;
- pushing those into Terminal would blur the four-domain model;
- a second generic wait API would then be required anyway.

### B. Generic condition provider owns everything

A separate provider could expose one generic `await_condition` and directly inspect Terminal state plus local host conditions.

Advantages:

- one conceptual API;
- generic durable handles fit naturally.

Rejected as the primary shape because:

- direct transcript-file/tmux inspection would bypass the qualified Terminal broker contract;
- a new provider creates a fifth visible domain with little benefit;
- Terminal generation/cursor rules should remain owned by Terminal.

### C. Split layer — selected

Use one generic wait engine for durable state, timeout, cancellation, polling, and resume. Register one model-facing `wait` action in the existing personal `dev` provider as a Shell/local-control primitive. Terminal conditions use a narrow private Terminal adapter; local-host conditions use generic checkers.

```text
model
  -> personal dev.wait
       -> durable wait engine
            -> Terminal adapter -> broker private observation/read protocol -> tmux/transcript
            -> local checkers   -> /proc, TCP, filesystem, HTTP, systemd --user
```

Advantages:

- one new model-facing tool total;
- no new provider/domain;
- no change to the accepted six-tool Terminal MCP catalog;
- Terminal transcript ownership remains intact;
- generic state/restart/cancellation logic is shared once.

### D. No new wait surface

The model could continue alternating `terminal_read` and `bash` checks.

This remains viable for one-off short waits, but it is rejected as the Phase-2 architecture because it cannot itself provide durable named resume state across ChatGPT/1MCP/provider interruption. It also makes the model own offsets, timeouts, retries, condition baselines, and poll cadence. Task 7 proves the lower-level state is durable enough to move that bookkeeping below the model without replacing Terminal.

## Selected boundary

### Terminal owns

Terminal continues to own:

- session identity/generation;
- per-incarnation transcript/model-cursor state and reset on a genuinely new `session.open`;
- short broker-owned per-name lifecycle serialization for incarnation-sensitive open/close/read/observe operations;
- tmux pane live/dead state;
- exact retained pane exit status;
- transcript base/end logical offsets;
- explicit transcript reads from a caller-provided logical cursor, optionally guarded by an expected generation;
- `CURSOR_EXPIRED` / `CURSOR_AHEAD` semantics;
- transcript rotation and UTF-8 boundary correctness.

Terminal does **not** own:

- generic wait deadlines;
- wait names/state machines;
- port/file/HTTP/systemd checks;
- generic PID lifecycle;
- model resume scheduling.

The Task-8 implementation may add private read-only Terminal broker observations needed by the adapter. Those operations are not MCP tools.

### Generic wait engine owns

The generic engine owns:

- durable named wait records;
- condition-specific arm-time baselines;
- bounded synchronous hold loops;
- poll scheduling and per-probe timeouts;
- explicit cancellation;
- total deadline/timeout state;
- idempotent terminal wait results;
- source-error persistence;
- garbage collection of completed wait records.

It never owns or terminates the resource being observed.

### Model-facing placement

The single `wait` action belongs in the existing personal `dev` provider next to `bash`, not in Terminal and not in a new provider. It is a Shell/local-control primitive that can reference a Terminal session through the Terminal adapter.

Public `restricted` and `trusted-dev` composition remain unchanged unless a future project explicitly qualifies this capability there. This Phase-2 design targets the personal harness only.

## Model-facing API alternatives

### One synchronous wait call

```text
wait(condition, timeout_seconds)
```

Rejected because a long request is brittle across ChatGPT, MCP, and 1MCP request lifetimes and provides no durable recovery key after disconnect.

### Start/check/cancel as multiple tools

```text
wait_start(...)
wait_check(...)
wait_cancel(...)
```

Clear but adds three model-facing actions for one control concept.

### One named multi-mode action — selected

```text
wait(
  name,
  condition?,
  timeout_seconds?,
  hold_seconds?,
  cancel?
)
```

`name` uses the existing conservative identifier shape:

```text
^[A-Za-z0-9._-]{1,64}$
```

Modes:

```text
create/arm:
  name + condition
  timeout_seconds optional
  hold_seconds optional

resume/check:
  name only
  hold_seconds optional

cancel:
  name + cancel=true
```

Validation rejects ambiguous combinations. A repeated create using an existing name is idempotent only when the normalized condition and original deadline inputs are identical; otherwise it returns `WAIT_CONFLICT`. This makes a retry after a lost response recover the same named state instead of creating an unresumable duplicate.

Defaults and bounds:

```text
timeout_seconds  default 300; range 1..86400
hold_seconds     default 10; range 0..15
```

`hold_seconds=0` creates/checks without intentionally blocking. A single MCP request never waits more than 15 seconds, even when the durable deadline is much longer.

No `wait_list`, notification, history, cron, or workflow/action graph is included in Phase 2.

## Condition representation

The first implementation uses a discriminated condition union.

### Terminal output literal

```text
{
  kind: "terminal_output",
  session: string,
  literal: string   # 1..1024 UTF-8 bytes
}
```

Only output appended after the wait is armed is eligible by default.

### Terminal pane exit

```text
{
  kind: "terminal_exit",
  session: string
}
```

Matches only the pane/session lifetime represented by the generation captured at arm time.

### Explicit process exit

```text
{
  kind: "process_exit",
  pid: positive integer
}
```

The engine captures Linux process identity at arm time using PID plus `/proc/<pid>/stat` start-time ticks. PID reuse therefore counts as exit of the original process rather than continuation.

### TCP listener readiness

```text
{
  kind: "tcp_listen",
  host?: string,       # default 127.0.0.1
  port: 1..65535
}
```

Ready means a bounded TCP connect succeeds.

### File existence

```text
{
  kind: "file_exists",
  path: string
}
```

Uses existing personal user-path semantics. An already-existing path matches immediately.

### File change

```text
{
  kind: "file_changed",
  path: string
}
```

At arm time the engine records a stat fingerprint including existence, device/inode when available, size, mtime, and ctime. A later observed fingerprint difference matches. This is a durable baseline comparison, not a journal of every transient filesystem event.

### HTTP readiness

```text
{
  kind: "http_ready",
  url: string,
  status?: 100..599
}
```

Without `status`, any final 2xx or 3xx response is ready. No request body, headers, cookies, or credentials are accepted in the first API. URL userinfo is rejected. Per-probe network timeout is bounded.

### systemd user-service state

```text
{
  kind: "systemd_user",
  unit: string,
  state?: "active" | "inactive" | "failed"
}
```

Default state is `active`. The checker uses `systemctl --user show` with argument-array execution, never shell interpolation. System-level/privileged units are outside this API.

## Output/transcript semantics

### Source

Output waits use the existing durable transcript, not `capture-pane`.

Conceptually:

```text
stable Terminal generation
  + logical transcript offset
  -> explicit transcript reads of newly appended bytes
  -> literal stream matcher
```

The Terminal adapter needs two private broker capabilities:

1. observe stable session generation, pane state, and transcript `{baseOffset,endOffset}`;
2. read transcript from an explicit cursor without touching the model cursor, while asserting the session still has the generation captured at arm time.

The second capability already exists as private `session.read`, but Task 8 must add an optional `expectedGeneration` guard. The broker checks the generation before and after the transcript read; a mismatch is returned as a private Terminal generation-mismatch error that the wait adapter maps to `WAIT_SOURCE_REPLACED`. The first capability should be added as a read-only private observation operation rather than having the generic engine inspect Terminal state files directly.

`session.observe` itself must not combine metadata from one incarnation with transcript state from another. It therefore validates a stable generation across its observation before returning.

### Arm point and immediate-output race

When a `terminal_output` wait is created, the adapter records the current transcript `endOffset`. Only later bytes are eligible.

For commands that may print immediately, the race-safe sequence is:

```text
wait(name="ready", condition=terminal_output(...), hold_seconds=0)
terminal_send(...)
wait(name="ready")
```

This preserves the Task-6 immediate-first-byte guarantee without requiring snapshot polling or guessing when a command started.

### Matching across chunks

The literal matcher persists a bounded suffix of at most `literalByteLength - 1` alongside its independent scan cursor. Cursor advancement plus overlap state is written atomically, so restart between chunks cannot miss a literal spanning two transcript reads.

The matcher does not return all scanned bytes to the model.

### Pane exit during an output wait

The adapter first drains transcript bytes currently available. If no match exists and the captured Terminal generation is retained-dead, the wait finishes as `WAIT_SOURCE_ENDED` with the exact pane exit status. It does not keep waiting until the general timeout for output that can no longer arrive.

### Session replacement

Task 8 requires a stable private Terminal session generation UUID. It is created on session open and preserved through broker reconciliation. A new session reusing the same name gets a new generation.

A wait captures the generation at arm time. If the name later resolves to another generation, the wait finishes as `WAIT_SOURCE_REPLACED`; it never silently starts watching the replacement session.

Every explicit transcript read performed by that wait carries the captured generation. A replacement racing between observation and read must fail generation validation rather than return replacement-session bytes. A successful literal match is accepted only from a generation-guarded read.

## Model cursor interaction

Output waits have an independent wait cursor.

They **never** call private `model.read` and **never** update `model-cursor.json`.

Therefore:

```text
wait scans output internally
  != model consumed output
```

After the wait matches, normal `terminal_read(name)` still returns the model's unread transcript exactly once. This keeps observation and context consumption separate.

Completion text for a literal match is concise and contains the session, condition, and logical match offsets. It does not inject all scanned output into model context. The model can then call `terminal_read` once for the actual unread terminal text.

## Cursor rotation and error semantics

A wait's independent transcript cursor remains subject to the same logical offset rules as any explicit transcript reader.

If rotation advances `baseOffset` beyond the persisted wait cursor:

```text
CURSOR_EXPIRED
```

is terminal for that wait attempt. The engine must not silently jump to the retained tail because the pattern might have appeared in the discarded region. Bounded recovery metadata may be returned for diagnosis, but the result cannot truthfully be changed to matched or unmatched.

If the wait cursor is beyond transcript `endOffset`:

```text
CURSOR_AHEAD
```

is preserved rather than reinterpreted.

These errors are persisted in the named wait record before returning so a lost response can be replayed idempotently.

## Process-exit semantics

The design distinguishes four different events.

### Terminal pane exits

Exact and supported.

A pane opened with a finite command eventually becomes retained-dead. tmux provides exact `pane_dead_status`, which is the Terminal `terminal_exit` condition.

### Interactive shell foreground command exits

Not exact and not supported as a dedicated condition in Phase 2.

When an interactive shell runs `make`, `pytest`, or another foreground child, the child may exit while the shell and pane remain alive. The current Terminal core does not capture an authoritative foreground-child identity plus exit code. Prompt reappearance, `pane_current_command`, or output heuristics are not promoted to an exact process-exit contract.

A workflow that needs an exact command exit can either:

- open a finite Terminal session whose pane exit is the command result; or
- use one-shot `bash`, whose exit result is already exact; or
- wait on an explicitly known PID using `process_exit`, which observes process lifetime but not its exit code.

### Explicit process PID exits

Supported by the generic engine using PID plus start-time identity. It reports that the original process is gone/replaced. It does not know the process's exit code unless another source owns that information.

If the requested PID is already absent when the wait is armed, the condition is immediately matched: the requested fact (that this PID is not running) already holds. If the PID exists at arm time, start-time ticks become the durable identity used for later reuse detection.

### Daemonized descendants

Terminal does not promise to discover arbitrary descendants that detach from the pane. If the model has an explicit PID it may use `process_exit`. Otherwise readiness should be expressed through a stable condition such as TCP, HTTP, file, or systemd state.

## Polling and event ownership

Phase 2 does not add an always-on wait daemon.

A `wait` call evaluates immediately and may run a bounded hold loop. When no wait request is active, the engine does not poll in the background.

This works because the selected conditions are either:

- recoverable from durable history/baseline (`terminal_output`, `terminal_exit`, `process_exit`, `file_changed`); or
- level-triggered readiness conditions where current state is the desired fact (`tcp_listen`, `file_exists`, `http_ready`, `systemd_user`).

Minimum check intervals:

```text
terminal/process/TCP/file/systemd   no faster than 250 ms
HTTP                                no faster than 500 ms
```

A condition may use a slower interval. There is no model-controlled sub-250-ms polling option.

Terminal output correctness does not depend on poll frequency because the bytes are durable; poll frequency affects wake latency only.

## Timeout model

Each wait has a persisted absolute deadline computed at arm time.

```text
timeout_seconds default 300
maximum         86400
```

The timeout applies to the durable wait across all resume calls, not separately to each MCP request.

When the deadline passes, the engine persists terminal status `timeout` before returning. Timeout is expected control flow and returns native success text rather than `isError`.

Timeout never kills or closes the observed resource.

## Cancellation model

There are two different cancellations.

### MCP/request cancellation or ChatGPT disconnect

Abort the current lock acquisition/check/hold promptly. A request canceled while queued for the per-name wait lock must be removed from contention and must never later acquire the lock and continue checking after cancellation. The durable wait record itself remains pending and may be resumed later.

This prevents both a transient ChatGPT/1MCP disconnect from destroying the logical wait and the queued-cancellation defect already found/fixed in Files mutation coordination from being reintroduced in the wait subsystem.

### Explicit model cancellation

```text
wait(name="...", cancel=true)
```

persists `cancelled` and stops future checks for that wait.

Cancellation never sends a signal, kills a process, closes a Terminal session, or changes a systemd unit.

## Restart and reconnect behavior

### ChatGPT disconnect

Current request stops. Named wait state remains on disk. Resume by calling `wait(name=...)`.

### 1MCP restart

The provider process may disappear, but named state remains. The next provider instance reloads and resumes the wait.

### Personal dev provider restart

Same as 1MCP restart. Wait state is outside process memory.

### Terminal MCP restart

No effect on wait state. The wait engine does not depend on the Terminal MCP stdio process; its Terminal adapter talks to the local broker socket using the private broker client contract.

### Terminal broker restart

The adapter uses reconnect/retry behavior. A short broker-only restart does not alter the wait cursor or generation. Transcript and tmux remain authoritative.

If the broker remains unavailable for the current bounded call, return `WAIT_SOURCE_UNAVAILABLE` while leaving the wait pending. A later resume retries the same durable state.

### tmux lifetime boundary ends

A terminal condition cannot be silently retargeted. If its captured generation is gone, it returns source-ended/not-found semantics as appropriate. Killing the tmux lifetime boundary is not caused by wait timeout or cancellation.

## Persistent state requirements

The model-facing action is part of the personal `dev` provider, so wait state lives under the existing private dev state root:

```text
$MCP_DEV_STATE_DIR/waits/<name>.json
```

Requirements:

- directory mode `0700`;
- file mode `0600`;
- atomic temp-file + rename writes;
- per-name cross-process lock uses a Linux abstract Unix socket bind keyed by uid + canonical waits root + wait name;
- kernel socket ownership releases automatically when the provider process dies, so no stale-path unlink or PID ownership inference is part of recovery;
- legacy `$MCP_DEV_STATE_DIR/waits/.locks/*` files from the pre-review implementation are ignored and cannot block a new owner;
- lock contention must fast-fail within a 250 ms arbitration window rather than extending one MCP call beyond its configured hold budget;
- canceled lock waiters never enter the protected state machine later;
- versioned state schema;
- normalized condition stored for retry conflict checking;
- arm timestamp and absolute deadline;
- condition baseline/source identity;
- independent Terminal cursor and matcher overlap when applicable;
- status: `pending | matched | timeout | cancelled | failed`;
- bounded completion evidence/error;
- completion timestamp.

Terminal states are retained for 24 hours to make a lost completion response replayable. Opportunistic garbage collection during later `wait` calls removes terminal records older than 24 hours. No background GC service is required.

No captured Terminal transcript body is persisted in wait state beyond the bounded literal-matcher overlap.

## Failure and result semantics

All model-facing results remain native text; no `structuredContent` is added.

Expected control states are successful results:

```text
pending <name> deadline=<...>
matched <name> <bounded evidence>
timeout <name>
cancelled <name>
```

Stable error conditions include:

```text
WAIT_NOT_FOUND
WAIT_CONFLICT
WAIT_BUSY
INVALID_WAIT_CONDITION
WAIT_SOURCE_UNAVAILABLE
WAIT_SOURCE_REPLACED
WAIT_SOURCE_ENDED
CURSOR_EXPIRED
CURSOR_AHEAD
```

Invalid schemas fail at MCP validation before polling begins.

Condition-specific probe failures that mean "not ready yet" are not errors. For example connection refused, a missing file under `file_exists`, HTTP non-ready status, and a systemd state mismatch leave the wait pending.

`WAIT_SOURCE_UNAVAILABLE` is transient source availability, not a durable terminal wait status. The current MCP call returns the error before the engine persists a terminal transition; the named wait keeps its original `pending` state, deadline, and baseline so a later resume retries the same source identity.

## Generic condition semantics in detail

### TCP

Each probe uses a bounded connect timeout no greater than 500 ms. Connection refused/timeout means pending. DNS/network configuration errors may be surfaced after bounded retry when they are not ordinary not-ready states.

### Files

The implementation reuses personal user-path semantics; it does not introduce another filesystem authority model. `file_changed` compares persisted fingerprints rather than keeping a long-running filesystem watcher. A transient change that fully returns to the same observable fingerprint while the provider is offline is not promised as an event journal.

### HTTP

The first API is deliberately credential-free. No custom headers, cookies, request body, or URL userinfo are accepted. Per-probe timeout is at most 2 seconds. Use `redirect: "manual"` so a readiness probe does not silently follow an unbounded or cross-origin redirect chain; an observed 2xx or 3xx status is ready when no explicit status is requested. The response body is not persisted or returned to the model.

### systemd

Only the user manager is queried. The tool never starts/stops/restarts a unit. `systemctl --user show` is invoked as an argument array with a 2-second subprocess timeout and the current wait request's `AbortSignal`.

The subprocess receives a cloned environment only; the provider never mutates `process.env`. Explicit non-empty `XDG_RUNTIME_DIR` and `DBUS_SESSION_BUS_ADDRESS` values are preserved. When absent, the WSL/Linux user-manager defaults are derived as `XDG_RUNTIME_DIR=/run/user/<uid>` and `DBUS_SESSION_BUS_ADDRESS=unix:path=<XDG_RUNTIME_DIR>/bus`. Request cancellation maps to `WAIT_ABORTED`; command/bus/timeout failures map to transient `WAIT_SOURCE_UNAVAILABLE` while durable wait state remains pending.

### PID

The engine only observes. It does not signal or reap the target process. `/proc` start-time identity protects against PID reuse.

## Coding-agent lifecycle decision

```text
AGENT_LIFECYCLE = DEFERRED_WITH_TRIGGER
```

Herdr evidence is meaningful: real Codex showed `idle -> working -> idle`, synthetic blocker evidence classified `blocked`, and Herdr's lifecycle wait concept was materially better than model-side TUI polling.

That evidence is not enough to add vendor-specific detector logic to Phase 2 today because the accepted real Terminal workflow did not demonstrate coding-agent lifecycle polling debt. Generic durable waits should land first.

### Exact reopen trigger

Reopen a focused coding-agent lifecycle subproject when either condition is recorded in real personal-harness use:

1. **Polling trigger:** two separate real coding-agent sessions each require at least three model-side `terminal_read`/snapshot checks to determine one lifecycle transition or completion; or
2. **Semantic-block trigger:** one real approval/input-blocked transition cannot be expressed reliably as a stable terminal-output literal plus pane/process/readiness condition.

Once triggered, implementation is still gated by detector qualification:

- at least 20 labeled transitions across real/synthetic fixtures;
- include `working`, `idle`, `blocked`, `done`, and `unknown`;
- include at least one real `working -> idle/done` sequence and one blocker fixture;
- no Herdr runtime dependency;
- detector state must be server-owned and must not consume the model Terminal cursor.

Until the trigger fires, the generic wait API has no `agent_state` condition kind.

## Terminal output regex decision

Regex is useful but is not in the first Phase-2 condition schema.

Reason: arbitrary JavaScript regex evaluation can make a local provider vulnerable to pathological backtracking, while the product evidence does not require regex to justify the first wait implementation. Literal readiness markers cover the race-safe Terminal pattern without another matching dependency.

### Exact regex trigger

Add `terminal_output_regex` only when two real waits need patterns that cannot be represented as stable literals without false positives or brittle command changes. The follow-up design must select a bounded, non-catastrophic matcher such as RE2-compatible semantics and retain the same transcript-offset/cursor contract.

## Security implications

The personal harness already has user-level Shell authority, but durable waiting still follows least-new-authority rules:

- no shell predicate condition;
- no arbitrary command is persisted/re-executed by the wait engine;
- no system-level systemd control;
- no process signaling;
- no Terminal write/resize/close from wait code;
- no lease bypass;
- no HTTP credentials/headers/body in the first API;
- state files are private and atomic;
- wait timeout/cancel never changes the observed resource;
- Terminal output waits are read-only and continue to work during human control;
- no separate human-keystroke log is introduced.

A no-echo human secret remains absent from the Terminal transcript by the accepted Task-7 contract; the wait layer cannot persist bytes it never receives.

## Context and token implications

The selected architecture reduces model-visible polling cost without replacing native text.

Normal repeated polling today requires a tool call and a model turn for every check. Terminal incremental reads already avoid duplicate terminal content, but the model still receives each readiness probe result and must remember timing/baselines.

With the wait engine:

- transcript scans occur below the model;
- nonmatching output is not emitted into model context;
- a pending wait returns one short line;
- a match returns bounded evidence, not the accumulated transcript;
- the model calls normal `terminal_read` after a Terminal match to receive unread output exactly once;
- generic readiness probes return no curl/systemctl/stat diagnostic noise unless there is a true error.

Schema cost is one additional personal tool, but action count alone is not the acceptance metric. The first implementation has an eight-kind discriminated condition union, so Task 8 must measure the actual emitted `tools/list` bytes/tokens before retaining it. A multi-tool start/check/cancel design would add two or three tool choices; a Terminal-specific plus generic design would add at least two. The single named action remains the preferred surface, but it must earn its persistent schema tax against the model-turn/tool-result polling it removes.

The qualification therefore records:

```text
personal schema bytes/tokens before wait
personal schema bytes/tokens with wait
incremental wait schema cost
representative 30-second readiness workflow: manual polling vs named wait
request tokens
result tokens
tool calls / follow-up debt
break-even number of avoided polling checks
```

If the complete one-tool union does not materially reduce total schema+request+result cost on a real workflow that otherwise needs at least three readiness checks, pause before product activation and compare a narrowed first-phase condition set or a split surface. Do not retain a large union merely because it is one action.

## Notification decision

No server-initiated notification/resume mechanism is required for the first implementation.

There is no qualified evidence that ChatGPT through Cloudflare/OAuth/1MCP will reliably resume model reasoning from an unsolicited local condition notification. Durable named check/resume is therefore the authority. A later notification optimization may be added only if the product path demonstrates reliable delivery and a clear reduction in model turns without weakening handle durability.

## Acceptance strategy for Task-8 implementation

Implementation acceptance must be separate from this design mission.

### Unit/local engine

Prove:

- named create is durable and retry-idempotent;
- conflicting same-name definition returns `WAIT_CONFLICT`;
- resume after provider restart uses persisted deadline/baseline;
- request abort while acquiring the per-name lock or during the current hold stops promptly, never enters later, and leaves wait pending;
- same-name lock contention fast-fails as transient `WAIT_BUSY` rather than silently exceeding the bounded-call contract;
- explicit cancel persists cancelled state and never kills the source;
- timeout persists before response and never kills the source;
- terminal output uses explicit transcript offsets and leaves model cursor unchanged;
- literal match spans transcript chunks/restarts;
- `CURSOR_EXPIRED` and `CURSOR_AHEAD` are not silently recovered;
- session generation replacement fails explicitly;
- close/reopen of the same Terminal name starts with fresh transcript/model-cursor state and cannot replay prior-incarnation bytes;
- a replacement racing an explicit wait transcript read is rejected by generation validation rather than matching replacement bytes;
- retained pane exit returns exact status;
- process PID reuse is not misclassified as the same process;
- TCP/file/HTTP/systemd level conditions behave as specified;
- terminal records GC only after retention.

### Terminal integration

Prove race-safe sequence:

```text
arm terminal_output with hold_seconds=0
send command that immediately prints marker
resume wait -> matched
terminal_read -> marker appears once in normal unread output
second terminal_read -> empty
```

Restart only the Terminal broker while the wait is pending and prove the same named wait matches afterward without cursor reset.

### 1MCP/provider restart

Create a pending named wait, restart/reconnect the personal provider/1MCP from an external controller, then resume the same name and obtain the correct result.

### Generic readiness

Use disposable local fixtures for:

- explicit PID exit;
- TCP server startup;
- file create/change;
- HTTP health transition;
- systemd user test unit state.

### Product path

After local qualification and external activation, verify from a fresh ChatGPT session:

1. arm a Terminal output wait nonblocking;
2. start output-producing work;
3. receive `pending` or `matched` in bounded calls;
4. do other model work between resume calls;
5. resume the same named wait;
6. receive concise completion evidence;
7. call `terminal_read` and receive unread terminal output once;
8. repeat with one generic readiness condition;
9. interrupt one wait request and prove the durable wait remains resumable.

Also record the schema/context value gate above. Product activation is not the place to discover that the new union costs more context than the polling it is intended to remove.

## Deferred triggers

```text
Terminal output regex
  -> two real waits require non-literal pattern matching

Coding-agent lifecycle
  -> two sessions incur >=3 lifecycle polling reads each,
     OR one real blocked/input-required transition is not expressible by stable literal/readiness waits

Server-initiated notifications
  -> product path proves reliable unsolicited resume/delivery and material turn reduction

Background wait daemon
  -> a condition is proven to require observing transient events that cannot be reconstructed from durable history/baselines/current level state

Additional dedicated wait tools
  -> one-tool schema produces measured tool-choice/schema debt or a condition needs materially different authority
```

## Final verdicts

```text
WAIT_BOUNDARY
SPLIT_LAYER

OUTPUT_WAIT_STRATEGY
DURABLE_TRANSCRIPT_OFFSETS_WITH_INDEPENDENT_WAIT_CURSOR

MODEL_FACING_WAIT_API
wait(name, condition?, timeout_seconds?, hold_seconds?, cancel?)

WAIT_STATE_DURABILITY
named persisted state survives ChatGPT disconnect, personal dev provider restart, Terminal MCP restart, Terminal broker restart, and 1MCP restart; source-specific truth is re-evaluated on resume

AGENT_LIFECYCLE
DEFERRED_WITH_TRIGGER

TASK8_IMPLEMENTATION_READY
YES

WAIT_SCHEMA_VALUE_GATE
REQUIRED_BEFORE_PRODUCT_ACTIVATION
```

No production await/resume code is implemented by this design mission.
