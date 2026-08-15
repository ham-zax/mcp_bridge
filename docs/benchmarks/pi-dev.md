# Pi Dev Provider Runtime and Context Benchmark

**Date:** 2026-08-15  
**Candidate:** `providers/pi-dev` using `@earendil-works/pi-coding-agent@0.84.1`  
**Tokenizer:** `tiktoken==0.13.0`, `o200k_base`  
**Verdict:** **CUTOVER**

## Decision

The Pi-backed `dev` provider passes every mandatory boundary and execution-semantic case and materially reduces the model-facing development surface. The trusted-development schema falls from 15 legacy Files/Shell tools to 4 `dev` tools, normalized schema tokens fall by 78.0%, the four representative request payloads fall by 23.3% tokens, ranged source evidence falls by 98.6% text tokens on the real repository probe, and edit/write results are substantially smaller while remaining immediately useful.

The candidate also fixes two material legacy Shell observability failures found during the benchmark: a normal non-zero process returns only stdout with no exit status, and output beyond the legacy cap becomes a tool error that discards the captured output. `dev.bash` instead appends `[exit N]` and returns a bounded tail plus a recoverable full-output handle.

The required verdict is therefore **CUTOVER**. Task 10 may remove the generic filesystem provider. Under `trusted-dev`, Pi Bash may replace the legacy Shell provider; under `restricted`, the separate legacy Shell remains by policy while Pi Bash is omitted.

## Live A/B acceptance

The implementation worktree was deliberately activated as the deployment root and the public bridge returned `issues: 0`. Live 1MCP discovery reported:

```text
filesystem  14 tools
shell        1 tool
dev          4 tools
total       19 tools
```

A separate restricted fixture exposed `dev.read`, `dev.edit`, and `dev.write` only; Pi Bash was absent and the legacy Shell remained available.

ChatGPT Actions refresh ultimately succeeded and replaced the stale pre-migration action catalog with the A/B catalog. The first refresh attempt exposed a separate publication-scaffold migration defect: changing 1MCP's writable `--config-dir` also changed its OAuth/session home, so an existing client token was initially unknown in the new state directory. OAuth continuity was restored and refresh then succeeded. That transport/state-migration issue is being hardened separately; it did not originate in the Pi provider and does not change the Pi runtime verdict.

## Evidence location

Raw schemas, requests, runtime result captures, 1MCP token reports, and benchmark helper output remain outside Git under:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/pi-dev/
```

No auth tokens or client secrets are part of the tracked benchmark document.

## Schema cost

Schemas were captured from the actual rendered stdio providers through the pinned MCP SDK and normalized as compact arrays of `{name, description, inputSchema}`. Counts below use the same `o200k_base` estimator for every surface.

| Surface | Tools | Normalized schema bytes | `o200k_base` tokens | Delta vs old tokens |
|---|---:|---:|---:|---:|
| old filesystem + shell | 15 | 8,957 | 1,854 | baseline |
| `dev` trusted-dev | 4 | 1,737 | 408 | **-78.0%** |
| `dev` restricted | 3 | 1,353 | 318 | **-82.8%** |

The independent 1MCP capability estimator corroborated the reduction:

| Surface | 1MCP tools | 1MCP estimated tokens |
|---|---:|---:|
| old filesystem + shell | 15 | 1,987 |
| `dev` trusted-dev | 4 | 476 |
| `dev` restricted | 3 | 388 |

After the planned cutover, restricted mode retains its one legacy Shell tool. Combining the normalized restricted `dev` schema with that Shell schema is about 506 tokens versus 1,854 for the old surface, still roughly a 72.7% reduction. The analogous 1MCP server estimates are 650 versus 1,987 tokens.

### Schema structural debt

The old surface advertises 15 independent tool choices. Its largest top-level request schema has 4 fields and its edit schema reaches the same nesting depth as the new edit schema. The trusted `dev` surface advertises only four primitives:

```text
read(path, offset?, limit?)
edit(path, edits)
write(path, content)
bash(command, cwd?, timeout_seconds?)
```

The principal reduction is therefore tool-selection/schema volume plus native request vocabulary, not an artificial flattening of the genuinely structured multi-edit request.

## Representative request cost

Equivalent request arguments were serialized as compact JSON and tokenized with `o200k_base`.

| Workflow | Old bytes | Old tokens | Old fields / depth | `dev` bytes | `dev` tokens | `dev` fields / depth | Token delta |
|---|---:|---:|---:|---:|---:|---:|---:|
| first 40 source lines | 78 | 25 | 2 / 1 | 73 | 22 | 3 / 1 | -12.0% |
| two-location edit | 147 | 48 | 2 / 3 | 130 | 41 | 2 / 3 | -14.6% |
| compound Git Bash | 103 | 31 | 2 / 2 | 66 | 18 | 2 / 1 | **-41.9%** |
| create file | 80 | 25 | 2 / 1 | 63 | 18 | 2 / 1 | -28.0% |
| **total** | **408** | **129** | — | **332** | **99** | — | **-23.3%** |

The Bash difference is the intended native-language boundary. Legacy Shell requires an argv representation such as:

```json
{"command":["bash","-c","git status --short && git diff --stat"],"directory":"$HOME/repo/satori"}
```

while Pi exposes the command in native Bash form:

```json
{"command":"git status --short && git diff --stat","cwd":"satori"}
```

Files similarly use workspace-relative names rather than repeating the machine-specific absolute workspace prefix.

## Representative model-facing results

### Real read-only repository range

The task was to obtain a 40-line middle range from `packages/mcp/src/core/handlers.ts` in the real Satori checkout.

The legacy filesystem tool cannot request an arbitrary middle offset, so its one-call Files baseline returns the whole file. Pi returns the requested range directly.

| Surface | Wall time | Text bytes | Text tokens | Extra representation |
|---|---:|---:|---:|---|
| legacy `read_text_file` whole-file fallback | 65.73 ms | 131,736 | 25,155 | `structuredContent` also present |
| `dev.read(offset=80, limit=40)` | 8.05 ms | 1,652 | 344 | none |

The Pi result reduces returned text by 98.7% bytes / 98.6% tokens while retaining the requested evidence.

The generic filesystem server additionally duplicated the read result inside `structuredContent.content`. On a second equivalent capture that structured representation alone serialized to 134,990 bytes / 28,876 `o200k_base` tokens. The `dev` provider emits no `structuredContent`. Because ChatGPT's exact internal context accounting is not directly observable, that duplicate is reported separately rather than asserted as a literal billing number; it is nevertheless part of the MCP result shape and was explicitly absent from every Pi result.

### Edit, write, and Shell outcomes

| Workflow | Old wall | Old TextContent | Old tokens | Pi wall | Pi TextContent | Pi tokens | Outcome |
|---|---:|---:|---:|---:|---:|---:|---|
| two-location edit | 4.57 ms | 362 B | 123 | 6.78 ms | 92 B | 39 | both correct; Pi is one compact relative-path diff |
| create | 1.93 ms | 86 B | 29 | 2.03 ms | 55 B | 19 | both correct; Pi acknowledgement is shorter and create-only |
| compound pipe + `&&` + redirect | 13.05 ms | 7 B | 3 | 9.91 ms | 8 B | 4 | both correct |
| `printf ...; exit 7` | 5.37 ms | 4 B | 1 | 5.32 ms | 13 B | 7 | legacy loses exit status; Pi returns `oops\n[exit 7]` |

Legacy filesystem edit/write also carried a duplicate `structuredContent.content`; the Pi results did not.

### Verbose output

The legacy Shell was asked to emit 1.2 MB with its 1 MiB output cap. It returned a tool error after 683.19 ms:

```text
Error executing command: stdout exceeded output limit of 1048576 bytes
```

No captured command output was recoverable from that result.

The Pi mandatory truncation case used a deliberately small 1 KiB deployment limit to make the behavior cheap to inspect. A 5,000-byte command returned a 1,195-byte / 202-token model-facing tail plus:

```text
[truncated · full: <bridge-state-path>]
```

The referenced full artifact contained exactly 5,000 bytes. This proves the output policy is bounded while evidence remains recoverable. The limit remains deployment policy and is absent from the Bash tool schema.

## Follow-up-call debt

| Situation | Legacy surface | Pi `dev` |
|---|---|---|
| middle source range | no extra call, but whole-file evidence pollution | no extra call; exact range |
| edit confirmation | diff already returned | compact diff already returned |
| safe create-only intent | preflight is needed and is still TOCTOU-prone | zero; atomic exclusive create |
| normal non-zero exit | exit status is absent; must re-run/wrap command to recover it | zero; `[exit N]` is in the same result |
| over-limit output | output is discarded; command must be re-run with manual redirection/bounding | zero to understand outcome; optional read of full handle only if needed |

Pi therefore reduces both context pollution and corrective/recovery calls for the cases where the old surface loses execution evidence.

## Mandatory Pi cases

All 21 acceptance cases passed in one disposable-fixture run against the actual provider implementation.

| # | Case | Result |
|---:|---|---|
| 1 | workspace-relative ranged read | PASS — exact requested lines plus continuation hint |
| 2 | absolute Files path | PASS — rejected |
| 3 | `..` Files traversal | PASS — rejected |
| 4 | existing symlink escape | PASS — rejected |
| 5 | create through outside-parent symlink | PASS — rejected |
| 6 | two-location exact multi-edit | PASS — one compact diff TextContent |
| 7 | fuzzy-only Unicode candidate | PASS — rejected; fuzzy fallback not reached |
| 8 | simultaneous creates | PASS — exactly one success and one create-only failure |
| 9 | Bash default cwd | PASS — immutable workspace root |
| 10 | Bash relative cwd | PASS |
| 11 | pipe + `&&` + redirect | PASS |
| 12 | exit 7 | PASS — normal result ending `[exit 7]` |
| 13 | AbortSignal cancellation | PASS — request aborted and background descendant was dead afterward |
| 14 | timeout | PASS — descendant killed and `[timed out after 0.3s]` returned |
| 15 | configured output limit | PASS — bounded tail + full-output handle, full 5,000 bytes preserved |
| 16 | native result types | PASS — 20 returned dev results checked; zero `structuredContent`/resource violations |
| 17 | edit result quality | PASS — one diff, no generic Pi success prose, no recovery call required |
| 18 | Bash schema policy leakage | PASS — only `command`, `cwd`, `timeout_seconds`; no output/workspace policy fields |
| 19 | absolute Bash `cwd` | PASS — rejected |
| 20 | `..` Bash `cwd` | PASS — rejected |
| 21 | trusted command body outside workspace | PASS — harmless `/etc/os-release` read succeeds |

Cancellation correctly surfaces to the cancelling MCP client as an abort error rather than fabricating a completed command result; the important semantic requirement is that Pi kills the descendant process tree, which the probe verified.

## Reliability observations

The benchmark did not find a Pi correctness regression. Exact multi-edit, exclusive create, symlink confinement, native command execution, timeout/cancellation process-tree cleanup, and recoverable truncation all behaved as designed.

The two legacy Shell observations are correctness/observability disadvantages rather than wins for the incumbent:

1. a command exiting 7 returned `oops` as a normal result with no exit status;
2. over-limit output became an error with no command evidence to inspect.

Pi fixes both without exposing its internal execution record as JSON.

## Verdict rationale

`CUTOVER` requires:

1. every mandatory boundary/execution semantic to pass;
2. no reliability regression;
3. a material improvement in schema/request/result context or follow-up-call debt.

Evidence satisfies all three:

```text
mandatory Pi cases              21 / 21 PASS
trusted tool count              15 -> 4
normalized schema tokens        1,854 -> 408   (-78.0%)
representative request tokens   129 -> 99      (-23.3%)
real middle-range text tokens   25,155 -> 344  (-98.6%)
edit text tokens                123 -> 39      (-68.3%)
write text tokens               29 -> 19       (-34.5%)
structuredContent               legacy Files: present; Pi dev: absent
non-zero exit status            legacy Shell: lost; Pi: inline
truncated evidence              legacy Shell: discarded; Pi: tail + handle
```

**Pi = CUTOVER.**

## Measurement limits

- Schema and request/result token counts are a common offline `o200k_base` estimate, not a claim about hidden ChatGPT billing or exact internal context allocation.
- Runtime behavior was measured through direct MCP stdio clients after the real A/B deployment and ChatGPT catalog acceptance were established. This isolates provider semantics from OAuth/network latency while using the exact rendered provider commands and environment.
- The separate OAuth-state migration defect discovered during live activation belongs to the publication/transport migration path. It is being fixed independently and is not evidence against the Pi provider.
