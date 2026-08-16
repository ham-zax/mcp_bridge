# Terminal await/resume local acceptance

Date: 2026-08-16
Branch: `feat/personal-harness-agent-3-await-implementation`
Original implementation checkpoint entering qualification: `8c4715a8b5dc219ac32787ec860782871a310fd8`
Independent-review blocker fixes: `2fa0e8196ba7a8ad6ef263f89b5a014636eb36d9` (systemd resumability/environment/abort), `46f62b08c22359d318940b56acd7833c9315c2c6` (crash-safe per-name locking), and `a38e561a13c5fc7a8f9412d76c52a40089b37f37` (deadline/initial-arm/hold/Terminal-transport/state correctness).
Scope: focused-plan Task 6 local qualification and independent-review correctness requalification only. Focused-plan Task 7, live bridge activation, and ChatGPT Actions refresh were **not run**.

```text
WAIT_BOUNDARY                 SPLIT_LAYER
OUTPUT_WAIT_STRATEGY          DURABLE_TRANSCRIPT_OFFSETS_WITH_INDEPENDENT_WAIT_CURSOR
MODEL_FACING_WAIT_API         wait(name, condition?, timeout_seconds?, hold_seconds?, cancel?)
WAIT_STATE_DURABILITY         PASS (durable local state + pi-dev process restart + Terminal broker restart)
WAIT_SCHEMA_VALUE_GATE        PASS
AGENT_LIFECYCLE               DEFERRED_WITH_TRIGGER
LOCAL_WAIT_ACCEPTANCE         PASS
REAL_WAIT_ACCEPTANCE          NOT_RUN
TASK8_COMPLETE                NO
```

## Implementation checkpoints under qualification

```text
a6adb2d  feat: expose private terminal wait observations
ddeaa0f  feat: add durable local wait state machine
defe9b5  feat: wait on durable terminal transcript state
ddf2f5d  feat: add local readiness wait sources
8c4715a  feat: expose durable personal wait action
2fa0e81  fix: keep systemd waits resumable
46f62b0  fix: make wait locks crash-safe
a38e561  fix: harden durable wait correctness
```

The accepted live integration worktree was not modified during Tasks 3-6 and remained at:

```text
<repo>/.worktrees/personal-harness-wave1-integration
6d7e76c2812947cc2f9dab2c0616373efb80c85e
```

## Local qualification command

The disposable qualification harness is local-only under `.superpowers/web/2026-08-16-terminal-await-resume/` and is intentionally not part of the production/export surface.

```bash
node --test .superpowers/web/2026-08-16-terminal-await-resume/qualify-task6.test.mjs
```

Result:

```text
12 tests
12 pass
0 fail
```

The twelve cases exercised the actual stdio personal `wait` tool plus disposable Terminal/local resources, not only direct source methods.

## 1. Race-safe Terminal output and independent model cursor

Sequence:

```text
terminal_open task8-immediate
wait(immediate, terminal_output READY_NOW, hold=0) -> pending
terminal_send READY_NOW + ENTER
wait(immediate, hold=2) -> matched
terminal_read -> READY_NOW
terminal_read -> empty
```

Captured evidence:

```text
generation                    599d72f6-adbb-4c32-ba1e-051943e39e3d
wait cursor at arm            0
wait cursor after match       22
model cursor after wait       0
model cursor after read       22
```

Therefore wait scanning advanced only its independent durable transcript cursor. It did not call `model.read` and did not consume or rewrite the broker-owned model cursor. Normal `terminal_read` remained the sole unread-output consumption path.

## 2. Pending wait across Terminal broker restart

A named output wait was armed against `task8-broker-restart`, then only the broker process was replaced.

Captured evidence:

```text
broker PID before             3607428
broker PID after              3607497

tmux PID before               3607425
tmux PID after                3607425

pane PID before               3607444
pane PID after                3607444

generation before             679db5aa-4298-4d52-a9bb-1231cc18eaa3
generation after              679db5aa-4298-4d52-a9bb-1231cc18eaa3

wait cursor before            0
wait cursor after restart     0
```

After restart, the same named wait remained pending with the original generation/cursor. Later `AFTER_RESTART` output matched the wait, and normal `model.read` still received that unread output.

The two frozen Task-6.6 Terminal regressions were also rerun directly:

```bash
node --test \
  --test-name-pattern='broker restart reconciles mixed live and dead retained panes idempotently|immediate process output is captured from its first bytes' \
  providers/terminal/test/broker.test.mjs
```

Result:

```text
2 tests
2 pass
0 fail
```

## 3. Personal provider-process restart durability

Using one persistent `MCP_DEV_STATE_DIR`:

- a pending Terminal output wait was armed;
- a pending `file_changed` wait was armed;
- the personal `pi-dev` stdio provider process was closed;
- source state changed while no provider process was running;
- a new `pi-dev` process started with the same state directory;
- both waits resumed by the same names.

For both waits the original absolute deadline and persisted baseline were byte-for-byte equivalent before resume. The Terminal wait then matched output written while the provider was down; the file-change wait matched the mutation performed while the provider was down.

This qualifies durable named state across personal provider replacement. Terminal MCP process lifetime is not part of wait-state ownership: personal wait talks to the private broker directly. 1MCP/product restart remains a focused-plan Task-7 acceptance item and is not claimed here.

## 4. Cancellation and timeout do not mutate observed resources

Qualification covered all three control paths:

```text
request AbortSignal    -> durable wait remains pending
explicit cancel=true   -> durable wait becomes cancelled
timeout                 -> durable wait becomes timeout
```

For the aborted Terminal output wait, the same tmux pane PID remained alive after cancellation. For explicit cancel and timeout of `process_exit(pid)`, the observed long-lived process remained alive and was never signaled by the wait implementation.

The lock boundary was requalified after independent review with separate Node processes. Ownership is now a per-name Linux abstract Unix socket bind keyed by uid + canonical waits root + wait name. A live owner produces bounded `WAIT_BUSY`; SIGKILL releases ownership through the kernel; five two-contender crash-recovery rounds observed maximum same-name protected-callback concurrency of exactly 1; different names entered concurrently; a canceled process never entered after release; and legacy stale lock metadata naming an unrelated live PID could not block acquisition. PID identity is no longer part of wait-lock ownership.

## 5. First-phase local condition matrix

All first-phase generic condition kinds passed against disposable fixtures through the stdio `wait` tool:

| Condition | Disposable fixture | Result |
|---|---|---|
| `process_exit` | short-lived child process with `/proc` start-time identity | PASS |
| `tcp_listen` | loopback `net.Server` starts listening after arm | PASS |
| `file_exists` | absent file created after arm | PASS |
| `file_changed` | existing file mutated after baseline capture | PASS |
| `http_ready` | local HTTP server transitions `503 -> 204` | PASS |
| `systemd_user` | transient user service with `RemainAfterExit=yes` reaches `active` | PASS |

The disposable personal Pi provider was deliberately launched with both `XDG_RUNTIME_DIR` and `DBUS_SESSION_BUS_ADDRESS` absent, matching the observed ChatGPT connector environment. `LocalWaitSources` internally derived `/run/user/<uid>` and `unix:path=/run/user/<uid>/bus` only for the `systemctl` subprocess, and the real transient user unit matched `active/exited`. The harness used explicit user-bus values only for its external `systemd-run` setup/cleanup commands; the provider itself did not receive them.

A second real-path regression launched the first provider with an explicitly broken `DBUS_SESSION_BUS_ADDRESS`. The call returned `WAIT_SOURCE_UNAVAILABLE`, while the durable record remained `pending` with its original deadline and baseline. A replacement provider with both user-bus variables absent resumed the same wait name and matched the already-active unit through the internally derived bus environment. `systemctl` probes are bounded to 2 seconds and receive the current request `AbortSignal`; a separate real-child regression proved abort terminates the in-flight subprocess and maps to `WAIT_ABORTED`.

## 6. Transcript rotation and same-name incarnation safety

With a deliberately tiny transcript budget, an output wait was allowed to fall behind retained history. Resume returned exactly:

```text
CURSOR_EXPIRED
```

The durable record became `failed` with code `CURSOR_EXPIRED`, and its independent cursor remained at the original arm offset. It did not silently jump to the retained tail or fabricate matched/unmatched certainty.

The same-name lifecycle was also repeated:

```text
open task8-reopen -> OLD_SESSION_MARKER
arm old-generation wait
close task8-reopen
open task8-reopen -> NEW_SESSION_MARKER
resume old-generation wait -> WAIT_SOURCE_REPLACED
model.read new incarnation -> NEW_SESSION_MARKER only
```

The replacement generation never satisfied the old wait, and the new model read did not replay `OLD_SESSION_MARKER`.

**Post-Task-8 retention debt:** each same-name Terminal generation currently keeps its prior `sessions/<name>/incarnations/<generation>/` directory. This mission does not delete those directories because immediate recursive cleanup previously raced the retiring tmux `pipe-pane` writer. Old incarnations are isolated from new model/wait cursors and cannot replay into the replacement session, but a later bounded retention/GC design should reclaim them safely after writer quiescence. This is recorded as cleanup debt, not a live-activation blocker for the current Task-8 wait mission.

**Pre-existing Terminal crash-window debt:** killing the broker during `session.open` after tmux session creation but before metadata/start-gate completion can leave a gated tmux session behind. Independent review reproduced this older Terminal lifecycle window. It predates Task 8 and was deliberately not redesigned in this correctness pass; no Task-7 or live-activation claim should imply that crash window is solved.

## 7. Independent-review correctness requalification

The second independent review found temporal, cancellation, transport, destruction, and state-integrity defects without changing the accepted split-layer/schema architecture. The focused correction produced this local acceptance matrix:

```text
LATE_HTTP_AFTER_DEADLINE      TIMEOUT (completedAt - deadline = +4 ms)
LATE_MATCH_AFTER_DEADLINE     TIMEOUT (deterministic late check and late initial-arm regressions)
FAST_MATCH_BEFORE_DEADLINE    MATCHED
INITIAL_ARM_ABORT             WAIT_ABORTED; no durable record; name-only resume -> WAIT_NOT_FOUND
LOST_RESPONSE_AFTER_ARM       identical create retry keeps same baseline/deadline; source arm count remains 1
TERMINAL_BROKER_DOWN          WAIT_SOURCE_UNAVAILABLE; durable state unchanged
TERMINAL_BROKER_DOWN_ABORT    WAIT_ABORTED promptly (51 ms in qualification)
TERMINAL_BROKER_RECOVERY      same named wait resumed and matched after broker restart
HOLD_SECONDS_TOTAL_BOUND      PASS (1,004 ms for hold_seconds=1 with ~700 ms HTTP probes)
EXPLICIT_TERMINAL_CLOSE       WAIT_SOURCE_ENDED; durable failed record carries stable code
SEMANTIC_CORRUPT_STATE        WAIT_STATE_CORRUPT
```

The initial-create linearization contract is now explicit: compute the absolute deadline, obtain the source arm/baseline in memory, arbitrate the deadline, then persist the first fully armed record. If request cancellation wins before that persistence, no resumable unarmed record exists. Once armed state is durable, later request cancellation continues to preserve the same pending baseline/deadline.

Deadline arbitration occurs before source work, after awaited source work, and immediately before source-result persistence. A late `matched` result cannot beat the durable absolute deadline. For resumed calls with `hold_seconds>0`, the call budget begins near `WaitEngine.run()` entry and an internal source-operation signal distinguishes caller abort, durable deadline, and hold expiration. Hold expiration returns pending and does not become durable timeout.

The private BrokerClient now accepts an internal request signal and makes connection attempts, retry sleeps, and in-flight sockets abortable. Terminal wait transport errors normalize to transient `WAIT_SOURCE_UNAVAILABLE`; caller abort normalizes to `WAIT_ABORTED`; an absent explicitly destroyed Terminal generation normalizes to `WAIT_SOURCE_ENDED`; a reopened same-name different generation remains `WAIT_SOURCE_REPLACED`.

Version-1 wait records are now semantically validated on every read/write. Durable pending records are always fully armed with a non-null baseline and consistent definition/timeout/deadline/timestamps; terminal statuses have status-dependent completion invariants. Malformed semantic state cannot become immortal pending state or silently re-arm.

## 8. Personal schema measurement

Tokenizer/accounting matches the Phase-2 benchmarks:

```text
tiktoken==0.13.0
o200k_base
compact normalized {name,description,inputSchema} tools/list JSON
```

The pre-wait catalog was captured from the actual parent checkpoint `ddf2f5d`; the post-wait catalog was captured from the actual Task-5 implementation through MCP `tools/list`.

| Surface | Bytes | `o200k_base` tokens |
|---|---:|---:|
| personal Pi catalog before `wait` | 2,981 | 656 |
| personal Pi catalog with `wait` | 5,293 | 1,213 |
| incremental catalog tax | **2,312** | **557** |
| `wait` tool alone (single-element array framing) | 2,313 | 559 |

The actual personal Pi tool names changed only from:

```text
read edit write apply_patch bash
```

to:

```text
read edit write wait apply_patch bash
```

Restricted/trusted-dev catalogs remain unchanged, and workspace-mode Pi was separately executed from a public-style fixture in which `providers/terminal/**` did not exist.

### First-phase request shapes

```text
terminal_output {name, condition:{kind,session,literal}, hold_seconds?}
terminal_exit   {name, condition:{kind,session}, hold_seconds?}
process_exit    {name, condition:{kind,pid}, hold_seconds?}
tcp_listen      {name, condition:{kind,host?,port}, hold_seconds?}
file_exists     {name, condition:{kind,path}, hold_seconds?}
file_changed    {name, condition:{kind,path}, hold_seconds?}
http_ready      {name, condition:{kind,url,status?}, hold_seconds?}
systemd_user    {name, condition:{kind,unit,state?}, hold_seconds?}
resume          {name, hold_seconds?}
cancel          {name, cancel:true}
```

No regex, agent lifecycle, shell predicate, cron, notification, or arbitrary-command condition is present.

## 9. `WAIT_SCHEMA_VALUE_GATE`

The value benchmark used two identical disposable Terminal build/watch sessions in parallel for about 31 seconds. Each emitted one moderate compile/status line every 0.5 seconds and then `SERVER_READY`.

Manual side:

```text
terminal_read at ~0 s
terminal_read at ~10 s
terminal_read at ~20 s
terminal_read at ~31 s
```

Named-wait side:

```text
wait(name, terminal_output SERVER_READY, hold=0)
wait(name, hold=0) at ~10 s
wait(name, hold=0) at ~20 s
wait(name, hold=0) at ~31 s
```

The benchmark intentionally measures a readiness decision where intermediate build logs are not otherwise needed. Manual polling therefore imports those logs into model-visible results merely to decide whether the marker appeared; named wait scans them internally.

Command:

```bash
node --test .superpowers/web/2026-08-16-terminal-await-resume/benchmark-wait-value.test.mjs
```

Result:

```text
1 test
1 pass
0 fail
~32.6 s workflow on the latest correctness checkpoint
```

Actual token accounting:

| Metric | Manual polling | Named wait |
|---|---:|---:|
| calls | 4 | 4 |
| request tokens | 28 | 68 |
| result tokens | 1,263 | 76 |
| request + result tokens | 1,291 | 144 |
| result bytes | 5,534 | 247 |
| applicable personal Pi schema tokens | 656 | 1,213 |
| schema + request + result | **1,947** | **1,357** |

Net result:

```text
visible-token reduction        590 tokens
relative reduction             ~30.3%
incremental wait schema tax    557 tokens
```

Break-even is reached after **two additional noisy polling checks after the initial arm/check**. The initial wait schema + create call is 584 tokens more expensive than the first manual check; the next manual poll saves 396 tokens versus a name-only resume, and the following poll saves another 354 tokens, crossing break-even before the final readiness check.

Call count is intentionally equal in this bounded-resume workflow. The value comes from durable predicate/baseline state, name-only follow-ups, and preventing irrelevant transcript bytes from entering model context on every readiness poll. The final measured workflow remains context-positive even after charging the entire eight-condition schema tax once.

The correctness repair does not modify `wait-schema.mjs`, dev-provider registration, personal composition, or any model-facing field. A fresh ~32.6-second benchmark rerun again produced four calls per side and the same aggregate result bytes (manual 5,534; named wait 247). The local WSL connector currently does not have the previously used `tiktoken` Python package installed, so this focused mission did not install a new dependency solely to re-tokenize an unchanged schema surface. The saved qualified `o200k_base` accounting above remains the reference measurement; the 590-token margin is materially larger than any token-boundary variation from fresh timestamps/chunk boundaries.

Therefore:

```text
WAIT_SCHEMA_VALUE_GATE = PASS
```

This verdict is local/offline context evidence, not a claim about hidden ChatGPT billing. Focused-plan Task 7 must still confirm that the product-visible refreshed catalog matches the locally measured schema before live acceptance.

## Final local regression gates after independent-review correctness repair

After the focused correctness repair:

```text
Pi provider               160 / 160 PASS
Terminal                  45 / 45 PASS
harness                    6 / 6 PASS
publication               16 / 16 PASS
lifecycle                 27 / 27 PASS
Node syntax                        PASS
Bash syntax                        PASS
git diff --check                  PASS
```

The model-facing schema/registration paths have no diff from the independently reviewed `18b59f1` checkpoint. The qualified catalog remains 5,293 bytes / 1,213 `o200k_base` tokens with the 557-token incremental wait tax. The fresh schema-value workflow retained the same call count and aggregate result-byte totals, preserving the prior 1,947-versus-1,357 reference accounting and `WAIT_SCHEMA_VALUE_GATE=PASS`.

## Product gate

No live deployment mutation occurred. The next allowed action is external focused-plan Task 7 after independent implementation review and fresh rollback capture of the accepted Task-7 harness.

```text
REAL_WAIT_ACCEPTANCE: NOT_RUN
TASK8_COMPLETE: NO
```
