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
apply_patch                             EXPERIMENT_THIS_PHASE
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
