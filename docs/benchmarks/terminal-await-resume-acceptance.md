# Terminal await/resume local acceptance

Date: 2026-08-16
Branch: `feat/personal-harness-agent-3-await-implementation`
Original implementation checkpoint entering qualification: `8c4715a8b5dc219ac32787ec860782871a310fd8`
Independent-review blocker fixes: `2fa0e8196ba7a8ad6ef263f89b5a014636eb36d9` (systemd resumability/environment/abort) and `46f62b08c22359d318940b56acd7833c9315c2c6` (crash-safe per-name locking).
Scope: focused-plan Task 6 local qualification and blocker requalification only. Focused-plan Task 7, live bridge activation, and ChatGPT Actions refresh were **not run**.

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
7 tests
7 pass
0 fail
```

The seven cases exercised the actual stdio personal `wait` tool plus disposable Terminal/local resources, not only direct source methods.

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
generation                    91e76131-51bc-4461-9306-9f2e8fcd3135
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
broker PID before             3337209
broker PID after              3337284

tmux PID before               3337206
tmux PID after                3337206

pane PID before               3337225
pane PID after                3337225

generation before             f78e7013-bd1b-46d1-bb79-cfffb853f19a
generation after              f78e7013-bd1b-46d1-bb79-cfffb853f19a

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

## 7. Personal schema measurement

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

## 8. `WAIT_SCHEMA_VALUE_GATE`

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
~31.5 s workflow
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

Therefore:

```text
WAIT_SCHEMA_VALUE_GATE = PASS
```

This verdict is local/offline context evidence, not a claim about hidden ChatGPT billing. Focused-plan Task 7 must still confirm that the product-visible refreshed catalog matches the locally measured schema before live acceptance.

## Final local regression gates after independent-review blockers

After both blocker fixes and the real no-user-bus requalification:

```text
Pi provider               142 / 142 PASS
Terminal                  42 / 42 PASS
harness                    6 / 6 PASS
publication               16 / 16 PASS
lifecycle                 27 / 27 PASS
Node syntax                        PASS
Bash syntax                        PASS
git diff --check                  PASS
```

The model-facing catalog remained byte-for-byte identical to the Task-5 post-wait capture at 5,293 bytes / 1,213 `o200k_base` tokens. The blocker fixes added no MCP field or tool. The ~30-second schema-value workflow was rerun and again measured 1,947 tokens for manual polling versus 1,357 for named wait, preserving the 590-token local savings and `WAIT_SCHEMA_VALUE_GATE=PASS`.

## Product gate

No live deployment mutation occurred. The next allowed action is external focused-plan Task 7 after independent implementation review and fresh rollback capture of the accepted Task-7 harness.

```text
REAL_WAIT_ACCEPTANCE: NOT_RUN
TASK8_COMPLETE: NO
```
