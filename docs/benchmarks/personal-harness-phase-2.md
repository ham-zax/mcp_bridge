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
