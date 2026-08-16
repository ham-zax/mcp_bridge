# Personal Harness Phase 2 Baseline and Carry-Forward Ledger

**Date:** 2026-08-15
**Baseline commit:** `8ff5db7a2b78559f52e5c4e8e3c8580ebf15cbb9`
**Tokenizer:** `tiktoken==0.13.0`, `o200k_base` via `uv run`
**Scope:** pre-Phase-2 private harness evidence before Tasks 2-3 mutate profile or path semantics

## Baseline

- Private HEAD: `8ff5db7a2b78559f52e5c4e8e3c8580ebf15cbb9`
- Live profile: `trusted-dev`
- Live providers: `dev`
- Pi tools: `read`, `edit`, `write`, `bash`
- Bridge health: desired `running`; one config-scoped 1MCP process; local health ready; Cloudflare transport running; watchdog running; public health OK; `issues: 0`
- Node: `v24.19.0`
- tmux: `3.4`
- Git: `2.43.0`
- ripgrep: `14.1.0`
- jq: `1.7`
- fd: `10.4.1`
- bat: `0.26.1`
- npm: `12.0.2`
- pnpm: unavailable on the baseline `PATH`
- `sg`: present as the Linux `shadow` utility, not ast-grep
- advertised tool count: `4`
- tools/list normalized schema bytes: `1,721`
- estimated `o200k_base` schema tokens: `403`

The schema measurement used the actual rendered `dev` command/environment, called MCP `tools/list` through `@modelcontextprotocol/sdk`, normalized each tool to compact `{name,description,inputSchema}` JSON, and then tokenized the resulting bytes with the tokenizer above.

Raw schema/request captures are kept outside Git under:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/personal-harness-phase-2/
```

No OAuth/session state, public URL, credentials, or secret contents are part of the tracked benchmark.

### Representative request cost

Representative arguments were serialized as compact JSON and measured directly.

| Tool | Representative shape | Bytes | `o200k_base` tokens |
|---|---|---:|---:|
| `read` | source path + `offset=1` + `limit=40` | 74 | 21 |
| `edit` | one path + two exact replacements | 133 | 40 |
| `write` | one new path + two-line content | 69 | 18 |
| `bash` | native `git status --short && git diff --stat` + relative cwd | 73 | 19 |
| **Total** | — | **349** | **98** |

These are offline context estimates, not claims about hidden ChatGPT billing or exact internal context allocation.

## Proven Primitive Behavior

A disposable pre-change probe plus the existing Pi provider suite established the behaviors that must survive the personal path migration:

| Primitive | Baseline result |
|---|---|
| ranged read | PASS |
| exact unique edit | PASS |
| ambiguous edit rejection | PASS |
| missing edit rejection | PASS |
| create-only write | PASS |
| existing-file write rejection | PASS |
| native Bash pipe | PASS |
| non-zero exit annotation | PASS — exit `7` remained visible in native text |
| timeout descendant termination | PASS |
| large-output truncation + recoverable full-output path | PASS — 5,000 produced bytes retained while model-visible output was bounded |
| valid UTF-8 bounded tail | PASS — no replacement character at a 5-byte cap |

The full pre-change Pi suite passed `42/42`, including workspace confinement, symlink escape rejection, snapshot conflict detection, concurrent exclusive create, cancellation process-tree cleanup, output bounds, and model-facing native TextContent behavior.

## Baseline Verification

Run before any Phase-2 production change:

```text
bash tests/harness.sh                                      PASS (4 tests, 0 failures)
bash tests/publication.sh                                  PASS (15 tests, 0 failures)
bash tests/lifecycle.sh                                    PASS (27 tests, 0 failures)
(cd providers/pi-dev && npm test)                          PASS (42 tests, 0 failures)
bash -n bin/* lib/bridge/*.sh scripts/*.sh tests/*.sh      PASS
node --check scripts/render-config.mjs providers/pi-dev/*.mjs PASS
git diff --check                                           PASS
```

## Parallel-Work Coordination Snapshot

Wave-1 Agent 2 and Agent 3 are active in separate worktrees from the same coordination baseline. A separate public-release export worktree is also active at `2c14d99b51b9aedfb3640bbf1648c4fb88e9804d`.

The public-release branch currently changes several files that Agent 1 must also change for Tasks 2-3, including the renderer, smoke validation, harness/publication tests, and Pi provider server/tests. Agent 1 will not edit, reset, cherry-pick, or otherwise rewrite that branch. The Wave-1 integrator must resolve those independent changes at the integration gate while preserving public-profile behavior.

## Carry-Forward Ledger

```text
Pi read/edit/write/bash foundation      IMPLEMENTED
personal user-boundary migration        IMPLEMENT_THIS_PHASE
apply_patch                             BOTH_EARN_PLACE
CLI toolbox                             IMPLEMENT_THIS_PHASE
persistent Terminal                     IMPLEMENT_THIS_PHASE
human PTY attach                        IMPLEMENT_THIS_PHASE
await/resume                            DEFERRED_PENDING_TERMINAL_EVIDENCE
CodeDB multi-repo router                EXPERIMENT_THIS_PHASE
Code facade                             EXPERIMENT_THIS_PHASE
RTK                                     EXPERIMENT_THIS_PHASE
stronger CAS/hash                       DEFERRED_WITH_TRIGGER
TOON                                    REJECTED_WITH_EVIDENCE
GCF generic                             DEFERRED_WITH_TRIGGER
GCF graph                               DEFERRED_WITH_TRIGGER
Windows-host control                    OUT_OF_SCOPE
```

Task 1 changes no live bridge composition and introduces no new model-facing capability. Its purpose is to freeze the actual pre-change state and the safety properties that Tasks 2-3 must preserve.

## Task 4 — Codex-Style `apply_patch` Experiment

**Verdict:** `BOTH_EARN_PLACE`

The experiment keeps `edit` visible. `apply_patch` materially improves multi-file and structural mutation workflows, while `edit` remains the clearer low-ceremony interface for simple guarded single-file replacements. Final retirement of either primitive remains a Task-14/live-acceptance decision.

### Implemented contract

`apply_patch(patch, cwd?)` is registered only when `MCP_DEV_PATH_MODE=user`. Workspace/public mode keeps the pre-existing catalog and confinement behavior.

Personal path resolution reuses the Agent-1 policy directly:

```text
patch cwd        -> resolveUserCwd(MCP_DEV_DEFAULT_CWD, cwd)
relative target  -> resolveUserPath(resolvedPatchCwd, target)
absolute target  -> resolveUserPath(resolvedPatchCwd, absoluteTarget)
```

There is no patch-specific root, mutable cwd, or alternate path sandbox.

Mutation semantics are intentionally conservative:

- the complete patch is parsed before filesystem mutation;
- every source/destination is preflighted before the first mutation;
- update hunks use exact line context and reject missing or ambiguous matches;
- Add uses exclusive create (`wx`);
- Update compares its preflight snapshot immediately before write;
- Delete compares its preflight snapshot immediately before unlink;
- Move refuses an existing destination, rechecks the source snapshot, creates the destination exclusively, then rechecks before source removal;
- multi-file kernel transactionality is **not** claimed;
- if a failure occurs after any mutation begins, the diagnostic identifies confirmed applied work, the failed operation, and any target whose post-write state must be reread;
- successful results are compact native text summaries such as `M path (+1 -1)`, not `structuredContent`.

### Benchmark method

The comparison used 23 paired cases against identical disposable starting trees. Except for the controlled conflict race described below, both sides ran through the real personal MCP server. The current baseline used the existing model-facing primitive needed to express each task: `edit` for guarded replacement, `write` when creation was required, and native `bash` for move/delete operations that `edit` cannot represent. Final token measurements use symmetric `patch/case-N/...` and `edit/case-N/...` path lengths; patch `cwd` shortening was deliberately excluded from the token comparison and is covered separately by acceptance tests.

Corpus:

| Category | Cases | Baseline workflow |
|---|---:|---|
| simple single-line update | 5 | one `edit` |
| multi-hunk same-file update | 4 | one multi-edit `edit` |
| three-file update | 4 | three `edit` calls |
| create + update | 3 | `edit` + `write` |
| move + update | 2 | `edit` + `bash mv` |
| delete | 2 | `bash rm` |
| ambiguous exact context | 1 | one `edit`, expected rejection |
| missing exact context | 1 | one `edit`, expected rejection |
| snapshot conflict | 1 | controlled preflight/read race on both engines |
| **Total** | **23** | — |

The conflict case uses the internal snapshot operations directly because an external writer cannot be deterministically injected between preflight/read and mutation inside one MCP request. Both sides were forced to observe an external replacement after their snapshot and before mutation; both rejected and preserved the external bytes.

Token accounting uses `tiktoken==0.13.0`, `o200k_base`, matching the Phase-2 baseline. Request cost is compact serialized tool arguments. Result cost is the actual model-visible TextContent. Schema cost is normalized compact `{name,description,inputSchema}` JSON from real `tools/list` output. These are offline context estimates, not claims about hidden ChatGPT billing or exact internal context allocation.

### Schema cost

| Surface | Bytes | `o200k_base` tokens |
|---|---:|---:|
| `edit` schema | 639 | 145 |
| `apply_patch` schema | 740 | 159 |
| personal catalog without `apply_patch` | 2,240 | 497 |
| personal catalog with `apply_patch` | 2,981 | 656 |
| incremental catalog cost | **741** | **159** |

The final patch schema costs 159 tokens, 14 more than `edit`, because it exposes the move grammar and partial-application caveat explicitly. Keeping both visible therefore adds 159 catalog tokens and one advertised action during the experiment.

### Corpus results

| Category | Correct patch / baseline | Calls patch / baseline | Request tokens patch / baseline | Result tokens patch / baseline |
|---|---:|---:|---:|---:|
| simple | 5/5 / 5/5 | 5 / 5 | 210 / 180 | 65 / 120 |
| multi-hunk | 4/4 / 4/4 | 4 / 4 | 204 / 188 | 52 / 148 |
| multi-file | 4/4 / 4/4 | 4 / 12 | 320 / 360 | 156 / 228 |
| create + update | 3/3 / 3/3 | 3 / 6 | 162 / 150 | 78 / 87 |
| move + update | 2/2 / 2/2 | 2 / 4 | 94 / 96 | 42 / 44 |
| delete | 2/2 / 2/2 | 2 / 2 | 48 / 32 | 24 / 6 |
| ambiguity rejection | 1/1 / 1/1 | 1 / 1 | 32 / 26 | 13 / 14 |
| missing-context rejection | 1/1 / 1/1 | 1 / 1 | 32 / 26 | 13 / 15 |
| snapshot conflict rejection | 1/1 / 1/1 | 1 / 1 | 30 / 25 | 15 / 9 |
| **Total** | **23/23 / 23/23** | **23 / 36** | **1,132 / 1,083** | **458 / 671** |

Both surfaces were correct on all 23 cases. The seven true multi-file/create+update cases succeeded 7/7 on both sides.

Across the whole corpus, `apply_patch` used 36.1% fewer tool calls and 31.7% fewer result tokens. Its request arguments were 4.5% larger overall, while request + result tokens fell from 1,754 to 1,590 (9.4% lower). Including one full catalog exposure on each side yields 2,246 visible tokens with patch versus 2,251 for the current catalog/workflow: effectively context-neutral at this corpus size because the extra 159-token schema consumes almost all aggregate text savings.

The category split matters more than the aggregate:

- **Simple guarded update:** both use one call; `edit` request arguments averaged 36 tokens versus 42 for patch (16.7% lower for `edit`). Patch's compact summary lowers result cost, but the structured `oldText/newText` shape requires less translation ceremony and no extra tool schema, so `edit` remains the clearer primitive for this job.
- **Multi-file update:** patch reduced four scenarios from 12 calls to 4, request tokens from 360 to 320, and result tokens from 228 to 156. Request + result cost fell 19.0% before catalog cost.
- **Create + update:** patch compressed `edit` + `write` into one call, but request + result cost was essentially tied (240 patch versus 237 baseline tokens). The win is call/tool-switch reduction rather than context size.
- **Move + update:** patch used one operation instead of `edit` plus `bash mv`, halving calls with a small request/result-token reduction.
- **Delete-only:** native Bash remains substantially cheaper than patch; patch's value is not universal replacement of every mutation path.
- **Conflict/ambiguity:** both approaches rejected safely and preserved the expected bytes; patch did not buy lower correctness by reducing calls, and its failure requests are somewhat larger.

### Verdict rationale

`PATCH_WINS` is too strong because simple exact replacements remain easier to state through `edit`, and delete-only work is cheaper through native Bash. `EDIT_WINS` is contradicted by the multi-file/structural measurements. Therefore the evidence supports exactly:

```text
BOTH_EARN_PLACE
```

During Phase 2, keep both visible with distinct descriptions: `edit` for guarded single-file replacements and `apply_patch` for multi-file/structural mutation. Re-evaluate retirement only after real ChatGPT-path acceptance during consolidation.

## Task 12 — Concurrency Regression and CAS Trigger

**Verdict:** `CAS_TRIGGER_FIRED_FOCUSED_DESIGN_REQUIRED`

Task 12 started from the intended default `DEFERRED_WITH_TRIGGER`. The trigger fired because repeated real personal-primitive races produced silent lost updates, not merely ordinary conflicts or synthetic stress failures.

No production CAS implementation, hash field, Files schema change, or public-profile change is included in this task. The focused follow-up design is recorded at:

```text
docs/superpowers/specs/2026-08-15-personal-files-cas-trigger-design.md
```

Raw stress evidence is retained outside Git under the normal user state directory:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/task12-concurrency/
```

### Classification rules

```text
SAFE_CONFLICT
  stale/conflicting mutation is rejected explicitly and requires reread/reconcile

SILENT_LOST_UPDATE
  both actors report success while one valid mutation disappears or is contradicted

PARTIAL_APPLICATION
  an earlier mutation committed, a later operation failed, and the diagnostic reports applied/failed state

BENCHMARK_ARTIFACT
  synthetic timing or harness behavior does not represent the actual primitive contract
```

The CAS trigger is **not** “a conflict occurred.” It is repeated real or reproducible `SILENT_LOST_UPDATE` that the current guard cannot reliably prevent.

### Real primitive concurrency corpus

All repeated cases below used exported personal Files operations with `pathMode=user` against real temporary files. The main corpus used 50 iterations for same-file mutation races and 30 for exclusive-create/disjoint-path races.

| Scenario | Runs | Classification / result |
|---|---:|---|
| two actors edit the same exact region | 50 | 50 `SAFE_CONFLICT` |
| actor edits stale exact region after another actor changes it | 1 | `SAFE_CONFLICT` |
| overlapping `apply_patch` on the same region | 50 | **50 `SILENT_LOST_UPDATE`** |
| disjoint `apply_patch` changes on one file | 50 | **50 `SILENT_LOST_UPDATE`** |
| `apply_patch` versus exact `edit` on one file | 50 | **50 `SILENT_LOST_UPDATE`** |
| create/create on one absent personal path | 30 | 30 `SAFE_CONFLICT` |
| two moves race for one destination | 30 | 30 `SAFE_CONFLICT` |
| delete/update from the same patch snapshot | 50 | **50 `SILENT_LOST_UPDATE`** |
| multi-file patch with second precondition made stale | 1 | `PARTIAL_APPLICATION`, explicit `PATCH_PARTIAL` |
| independent edits in different files | 30 | 30 safe independent successes |
| concurrent edit/patch/write on disjoint paths | 30 | 30 safe independent successes |
| edit snapshot then native Bash mutation before final write | 1 | `SAFE_CONFLICT` |

An independent preliminary probe also reproduced the two most important mixed cases at 80/80: disjoint patch/patch on one file and patch/edit on one file.

### Silent-lost-update evidence

The disjoint patch/patch case is the cleanest trigger. Both actors start from the same bytes, one changing an early exact region and one changing a late exact region. Both calls return fulfilled, but the final file contains only one valid change. No conflict or partial-application diagnostic is emitted.

The same defect occurs for overlapping patches: both patch calls can report success while only the last whole-file result survives.

The patch/edit case proves the race crosses the retained `BOTH_EARN_PLACE` primitives: a patch and guarded exact edit can both return success while one valid disjoint change disappears.

The delete/update race demonstrates a state contradiction rather than only lost text: both patch operations can return success and the update can leave the file present after the concurrent delete also reported success.

These outcomes are `SILENT_LOST_UPDATE`, not `SAFE_CONFLICT`.

### Root cause

Patch preflight stores whole-file `before` bytes and computes a whole-file `after` buffer. At application time update/delete perform a snapshot comparison and then mutate in a separate asynchronous step. The comparison does not remain protected through the write/unlink.

A deterministic timing trace, run only after the real race reproduced, showed the exact interleaving:

```text
A reads original snapshot
B reads original snapshot
A accepts snapshot
B accepts snapshot
A writes precomputed full-file result
B writes precomputed full-file result
both return fulfilled
one result survives
```

The trace is root-cause instrumentation, not the trigger evidence itself. The trigger comes from the repeated unsimulated `runPatch` / `runEdit` results above.

### Existing guards that remain correct

Task 12 also verifies that the current guard set is useful and must be preserved:

- exact same-region edit/edit rejects one actor explicitly;
- a stale exact anchor rejects after another actor changes that region;
- create-only `write` keeps one-winner `wx` semantics;
- move destination races reject one actor while preserving the losing source;
- changes visible before the edit/patch final snapshot check are rejected;
- a stale later operation in a multi-file patch produces explicit `PATCH_PARTIAL` after an earlier confirmed mutation;
- disjoint canonical paths can mutate concurrently without interference.

Therefore Task 12 does **not** recommend replacing existing exact/snapshot/create-only guards. It opens a focused atomicity/CAS follow-up around the same-path check-to-mutate window.

### Current ledger recommendation

The Task-1 ledger entry remains useful historical baseline:

```text
stronger CAS/hash  DEFERRED_WITH_TRIGGER
```

Task 12 supersedes its current status with:

```text
stronger CAS/hash  TRIGGER_FIRED_FOCUSED_DESIGN_REQUIRED
```

The focused design deliberately does **not** approve model-visible hash fields yet. A standalone expected hash checked before the current write would inherit the same check-then-write race. The first follow-up step should make the existing implicit snapshot precondition atomic for cooperating same-path Files mutations, while preserving disjoint-path concurrency and current partial-application semantics. A model-visible revision/hash should be added only if a later focused benchmark proves it is still necessary after atomic enforcement.

`apply_patch` remains `BOTH_EARN_PLACE`, `edit` remains the guarded simple replacement primitive, `write` remains create-only, personal path semantics remain unchanged, and public `restricted` / `trusted-dev` behavior remains unchanged.

## Task 12.5 — Atomic Same-Path Mutation Enforcement

**Verdict:** `SAME_PATH_ATOMICITY_FIXED` + `CANCELLATION_SAFETY_FIXED`

Task 12.5 implements the focused follow-up without changing any model-facing Files schema. The proven defect was the scheduling window between the final snapshot comparison and the corresponding mutation, not the absence of a SHA/revision field.

### Coordinator contract

The Pi Files provider now has one shared provider-internal mutation coordinator keyed by canonical absolute filesystem target. `edit` and `apply_patch` import the same coordinator module; there are no separate per-tool lock maps.

For an existing-file exact edit, the coordinator lease covers:

```text
final read
snapshot comparison
write
```

For patch update/delete, the lease covers the same final snapshot check plus write/unlink. Patch Add remains exclusive-create (`wx`) and is also executed under its target lease. Move acquires both source and destination leases using the coordinator's stable canonical-path ordering, then holds both through destination validation/exclusive create, source recheck, and source removal.

The coordinator is per canonical path rather than global. Different canonical files can enter mutation critical sections concurrently. Missing targets are canonicalized through their real parent directory so symlinked parent aliases to the same destination cannot create split locks.

Multi-file `apply_patch` remains explicitly non-transactional: each file operation takes only its own lease(s), and an earlier committed operation followed by a later stale/failing target still reports `PATCH_PARTIAL`.

### Queued-cancellation safety follow-up

Independent review found that the original coordinator queued only bare grant callbacks. An `AbortSignal` canceled while waiting was therefore invisible to the queue: after the holder released, the canceled request could still acquire ownership and mutate. Patch could fulfill after cancellation; edit could reject through Pi's request layer after its write had already occurred.

The coordinator acquisition path is now abort-aware. An already-aborted request rejects before acquisition; a queued waiter removes itself on abort; a grant is followed by an abort check; and the signal is checked synchronously immediately before the protected mutation callback begins. The linearization rule is:

```text
if cancellation is observed before the protected mutation callback begins,
that callback does not begin
```

If multi-path acquisition is canceled while waiting for a later sorted key, the normal `finally` release path drops every earlier acquired lease in reverse order. Once a callback has legitimately begun, this change does not invent rollback or new transactional semantics.

Cancellation regressions cover queued patch/edit mutation, canceled-waiter queue cleanup, a later live waiter, partial multi-path acquisition release, and abort/grant boundary stress. Independent review of the committed fix returned `SAFE_TO_INTEGRATE = YES`, including 100/100 queued patch cancellations, 100/100 queued edit cancellations, 200/200 already-aborted callback suppressions, 100/100 canceled-waiter queue-progress runs, 100/100 multi-path cancellation releases, and three 300-iteration abort/grant boundary schedules with zero bad outcomes.

### RED evidence before implementation

The four Task-12 TODOs were first converted into real regressions and run against the unmodified provider. All four failed immediately on iteration 0 with the expected silent-loss class:

```text
overlapping patch/patch          both fulfilled when exactly one result could survive
disjoint patch/patch same file   both fulfilled but one valid effect disappeared
patch/edit same file             both fulfilled but one valid effect disappeared
delete/update same snapshot      both fulfilled despite contradictory final state
```

Coordinator unit tests were also written before implementation. The initial test run failed because the coordinator module did not yet exist; a later canonical-alias test independently failed against the first implementation because two symlinked parent aliases could enter concurrently. The coordinator was then tightened to canonicalize both existing and missing targets before keying locks.

### Post-fix stress matrix

The required post-fix stress corpus ran against the real exported provider primitives:

| Scenario | Runs | Safe conflict | Serializable both-success | Silent lost update | Other |
|---|---:|---:|---:|---:|---:|
| overlapping patch/patch, same region | 50 | 50 | 0 | **0** | 0 |
| disjoint patch/patch, same file | 50 | 50 | 0 | **0** | 0 |
| patch/edit, same file | 50 | 50 | 0 | **0** | 0 |
| delete/update, same preflight snapshot | 50 | 50 | 0 | **0** | 0 |
| disjoint edit/patch/write path batches | 30 | 30 all-success batches | — | **0** | 0 |

Total reproduced `SILENT_LOST_UPDATE` after the fix: **0**.

Raw post-fix stress evidence is retained outside Git at:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/task12-5-mutation-atomicity/post-fix-stress.json
```

The observed same-file outcome in this run was conservative serialization: one actor committed and the stale actor rejected explicitly. The contract also permits both disjoint effects to succeed when the second operation preflights after the first mutation and therefore computes from the newer state.

### Existing semantics preserved

The full regression suite continues to verify:

- exact-edit missing/ambiguous anchors still reject;
- same-region edit/edit still has one explicit loser;
- stale edit snapshots still reject;
- create/create remains exclusive-create;
- patch Add remains exclusive-create;
- move destination races remain exclusive;
- move source/destination acquisition uses one stable sorted canonical-path order;
- later stale targets in multi-file patching still produce explicit `PATCH_PARTIAL` after earlier committed work;
- personal `{ pathMode: user, defaultCwd }` resolution is unchanged;
- public restricted/trusted-dev catalogs and workspace confinement are unchanged.

### Native Bash / hard-link / external-writer boundary

This is an **in-process cooperating Files mutation coordinator keyed by canonical pathname**, not universal cross-process or inode-level CAS. Native Bash and arbitrary external writers do not participate in the lock.

`realpath` canonicalization collapses symlink aliases, including missing-target aliases through a real parent, but two distinct hard-link pathnames remain distinct coordinator keys even when they reference the same inode. Hard-link alias serialization is therefore outside the current same-canonical-path guarantee; this follow-up does not add inode-level locking.

The existing snapshot checks remain valuable: if an external mutation becomes visible before the final comparison, edit/patch rejects it. An external writer that races after that final comparison is outside this coordinator's guarantee. Task 12.5 makes no stronger cross-process claim.

### Model-visible revision/hash decision

```text
MODEL_VISIBLE_HASH_NEEDED = NO
```

The reproduced cooperating same-path defect is eliminated with the existing implicit snapshot precondition once its final compare+mutation is atomic inside the provider. No actual stale-read workflow evidence in Task 12.5 requires `expected_sha256`, `revision`, `etag`, `if_hash`, or an equivalent MCP field.

A future revision token remains evidence-triggered only. If later real stale-read ergonomics justify one, it must be enforced inside the same coordinator critical section rather than replacing atomic enforcement.

## Final carry-forward audit

Phase-2 consolidation closed every original ledger item explicitly:

```text
Pi Files/Bash foundation                IMPLEMENTED + LIVE
personal user-boundary migration        IMPLEMENTED + LIVE
apply_patch                             IMPLEMENTED + LIVE; BOTH_EARN_PLACE with edit
CLI toolbox                             IMPLEMENTED
persistent Terminal                     IMPLEMENTED + LIVE_ACCEPTED
human PTY attach                        IMPLEMENTED + LIVE_ACCEPTED
await/resume                            IMPLEMENTED + LIVE_ACCEPTED; REAL_WAIT_ACCEPTANCE=PASS
CodeDB multi-repo router                IMPLEMENTED
Code facade                             IMPLEMENTED + LIVE; code_search/context/symbol
automatic/selective RTK harness layer   REJECTED_WITH_EVIDENCE
explicit rtk test / rtk err             OPTIONAL_OUTSIDE_HARNESS
stronger same-path consistency          IMPLEMENTED without model-visible hash field
model-visible revision/hash             NOT_NEEDED_CURRENTLY; reopen on real stale-read evidence
TOON                                    REJECTED_WITH_EVIDENCE
GCF generic                             DEFERRED_WITH_TRIGGER
GCF graph                               DEFERRED_WITH_TRIGGER
coding-agent lifecycle detection        DEFERRED_WITH_TRIGGER
Windows-host control                    OUT_OF_SCOPE
password vault / automatic sudo         REJECTED_FOR_THIS_PROJECT
```

The final live/tool/context evidence is consolidated in `docs/benchmarks/personal-harness-final.md`.
