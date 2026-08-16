# Personal WSL Harness Phase 2 — Final Acceptance

**Date:** 2026-08-16
**Accepted integration head:** `02b3b4f32da6f672aaedf211b6abb5b3e3365680`
**Task-8 independent review:** `TASK8_CODE_ACCEPTED=YES`
**Task-8 product verdict:** `REAL_WAIT_ACCEPTANCE=PASS`
**Phase-2 product verdict:** `PERSONAL_HARNESS_PHASE2_ACCEPTED`

## Final capability surface

The private personal harness retains four capability domains with 15 model-facing actions:

```text
Dev / Files + Shell
  read
  edit
  write
  wait
  apply_patch
  bash

Terminal
  terminal_open
  terminal_read
  terminal_send
  terminal_resize
  terminal_list
  terminal_close

Code
  code_search
  code_context
  code_symbol
```

`wait` belongs to the personal Dev provider. Terminal remains exactly six model-facing actions; the private wait adapter observes Terminal through the broker without adding a seventh Terminal action.

Public `restricted` and `trusted-dev` profiles do not gain `wait`, Terminal, Code, or the private Terminal socket dependency.

## Final schema measurement

The final catalog was measured from actual MCP `tools/list` responses from the three retained personal providers and normalized as compact arrays of `{name,description,inputSchema}`. Token counts use `tiktoken==0.13.0` / `o200k_base`.

| Provider | Actions | Normalized schema bytes |
|---|---:|---:|
| Dev | 6 | 5,293 |
| Code | 3 | 1,534 |
| Terminal | 6 | 2,447 |
| **Combined** | **15** | **9,272** |

Combined final catalog: **2,173 `o200k_base` tokens**.

The Dev catalog's incremental `wait` cost remains the qualified **557-token** tax. The wait-value benchmark remains positive for noisy readiness workflows because durable predicate state prevents repeated nonmatching Terminal output from entering model context.

## Task-8 real product acceptance

The refreshed ChatGPT connector exposed the six-action Dev catalog including `wait`, and the live product path exercised all eight first-phase condition kinds.

| Condition | Live product evidence | Verdict |
|---|---|---|
| `terminal_output` | arm before marker, named resume matched, normal Terminal cursor still received the marker exactly once | PASS |
| `terminal_exit` | retained pane exit returned exact status `7` | PASS |
| `process_exit` | armed against a live disposable PID, then matched after exit | PASS |
| `tcp_listen` | armed before a loopback listener appeared, then matched | PASS |
| `file_exists` | armed before creation, then matched | PASS |
| `file_changed` | armed from an existing baseline, then matched after mutation | PASS |
| `http_ready` | armed while fixture returned `503`, then matched after transition to `204` | PASS |
| `systemd_user` | armed while transient user unit was `activating`, then matched `active/exited` | PASS |

The live Dev provider parent lacked both `XDG_RUNTIME_DIR` and `DBUS_SESSION_BUS_ADDRESS`; `systemd_user` still succeeded through the qualified internally derived user-bus environment.

### Durable/recovery semantics

- Terminal broker outage with a sufficient bounded call returned `WAIT_SOURCE_UNAVAILABLE` while leaving the named wait pending.
- Restarting only the broker preserved tmux process lifetime; the original named wait later matched output on the same Terminal incarnation.
- A named `file_changed` wait survived a full 1MCP/Dev-provider replacement and matched the change performed while the provider was unavailable.
- The first connector call during the deliberate 1MCP restart observed the expected transport transition; retry after health recovery resumed the same durable wait rather than re-arming it.

### Boundary semantics

- `hold_seconds=0`: one normal bounded arm/check; no artificial zero-millisecond deadline.
- A deliberately stalled initial Terminal source with `hold_seconds=1` returned `WAIT_HOLD_EXPIRED`, created no durable record, and name-only resume returned `WAIT_NOT_FOUND`.
- A durable deadline that expired before delayed readiness returned `timeout`; later source readiness did not overwrite that result.
- Explicit wait cancellation returned `cancelled` and did not kill the observed resource.
- Explicit Terminal destruction returned `WAIT_SOURCE_ENDED`.
- Close + same-name reopen returned `WAIT_SOURCE_REPLACED` for a wait bound to the prior generation.

The independently reviewed first-persistence linearization boundary also passed abort/commit, hold/commit, deadline/commit, and post-return-quiescence stress with no incoherent durable state.

## Shared-provider hold concurrency

Independent exact-head review used one Pi provider and two simultaneous ten-second held waits. Unrelated `read`, `bash`, and different-name wait calls remained approximately baseline-fast and completed before the holds. Verdict: `WAIT_HOLD_CONCURRENCY=PASS`.

The single ChatGPT tool scheduler used for final product acceptance does not itself provide a way to launch two tool calls concurrently from one turn, so the product pass relies on that same-provider concurrency qualification rather than pretending a sequential turn is a concurrency measurement.

## Final Codex-like workflow

One disposable Git repository was exercised through the actual refreshed connector:

```text
Code       -> code_search located the seeded arithmetic implementation
Files      -> read returned focused source
Patch      -> apply_patch changed source + test in one call
Bash       -> focused test + git diff --check + native diff passed
Terminal   -> persistent node --watch process started
Wait       -> terminal_output matched the armed readiness marker
Human path -> wsl-term attach acquired the exact-PTY human lease
Terminal   -> model send was blocked with HUMAN_HAS_CONTROL
Detach     -> lease reconciled; model control was restored
Code       -> code_search observed the new symbol after Pi mutation
Bash       -> final test + diff verification passed
```

The Task-7 manual human-attach acceptance remains authoritative for a real human controller. The final consolidation repeated the exact attach/lease path with a second PTY client to prove blocking and reconciliation without requiring another password/manual-input exercise.

## Final verification

Fresh verification on the final consolidation tree:

```text
Pi provider                 176 / 176 PASS
Terminal                     45 / 45 PASS
Code                         30 / 30 PASS
Task-8 local qualification   17 / 17 PASS
wait schema-value workflow    1 / 1 PASS
frozen Terminal               2 / 2 PASS
harness                       6 / 6 PASS
publication                  16 / 16 PASS
lifecycle                    27 / 27 PASS
personal toolbox             required_missing=0; required_invalid=0
Bash syntax                  PASS
Node syntax                  PASS
git diff --check             PASS
```

The final live bridge reported `issues: 0`; local readiness and public readiness both returned HTTP 200 after acceptance cleanup. No `rw-*`/`final-e2e-*` Terminal session or Task-8 wait record remained after cleanup.

## Retained architecture decisions

```text
apply_patch                    BOTH_EARN_PLACE with edit
Terminal backend               TMUX_BROKER_WINS
Terminal product               TERMINAL_ACCEPTED
await/resume                   IMPLEMENTED + LIVE_ACCEPTED
Code facade                    CODE_SMALL_EXPLICIT_FACADE
RTK harness integration        REJECTED_WITH_EVIDENCE
explicit rtk test / rtk err    OPTIONAL_OUTSIDE_HARNESS
same-path mutation atomicity   IMPLEMENTED
model-visible revision/hash    NOT_NEEDED_CURRENTLY
structured-format trigger      FORMAT_TRIGGER_NOT_FIRED
TOON                           REJECTED_WITH_EVIDENCE
GCF generic                    DEFERRED_WITH_TRIGGER
GCF graph                      DEFERRED_WITH_TRIGGER
coding-agent lifecycle         DEFERRED_WITH_TRIGGER
Windows-host control           OUT_OF_SCOPE
password vault / auto-sudo     REJECTED_FOR_THIS_PROJECT
```

## Known non-blocking debt

- Old Terminal incarnation directories need a bounded GC policy after writer quiescence.
- The pre-existing broker-crash window during `session.open` startup-gate setup remains outside Task 8.
- Path-keyed cooperating mutation synchronization does not claim inode/hard-link identity or synchronization with arbitrary native Bash/external writers.
- CodeDB watcher convergence is not instantaneous; immediate post-edit verification should use Files/Bash, while Code is used once the rooted watcher converges.
- Coding-agent lifecycle state detection remains evidence-triggered rather than a Phase-2 runtime dependency.

None of these debts blocks the accepted Phase-2 personal coding workflow.

## Completion state

```text
TASK8_CODE_ACCEPTED       YES
REAL_WAIT_ACCEPTANCE      PASS
TASK8_COMPLETE            YES
TASK14_CONSOLIDATION      PASS
PERSONAL_HARNESS_PHASE2   COMPLETE
```
