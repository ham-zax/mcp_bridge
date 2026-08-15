# Pi Dev Provider Runtime and Context Benchmark

**Date:** 2026-08-15  
**Candidate:** `providers/pi-dev` using `@earendil-works/pi-coding-agent@0.84.1`  
**Tokenizer:** `tiktoken==0.13.0`, `o200k_base`  
**Verdict:** **CUTOVER_CONFIRMED**

## Decision

The Pi-backed `dev` provider passes every mandatory boundary and execution-semantic case and materially reduces the model-facing development surface. The trusted-development schema falls from 15 legacy Files/Shell tools to 4 `dev` tools, normalized schema tokens fall by 78.0%, the four representative request payloads fall by 23.3% tokens, edit/write results are substantially smaller, and Shell failure/truncation evidence is materially better preserved.

The correction phase found that the original 98.6% ranged-read headline was not the best complete-incumbent comparison: legacy Shell can fetch the same middle range in one call. On the corrected one-call baseline, `dev.read` uses a smaller request (22 vs 35 estimated tokens) and slightly less direct wall time (5.85 vs 7.53 ms), while its model-visible result is slightly larger (344 vs 329 tokens) because it includes a useful continuation hint. The original 25,155 -> 344 result remains valid only as a comparison against the generic filesystem provider's whole-file fallback.

Fresh calls through the real ChatGPT -> OAuth -> Cloudflare -> 1MCP path also passed for `dev.read`, `dev.bash`, `dev.write`, and `dev.edit`, with the intended native TextContent shapes and no duplicate structured representation. The corrected verdict is therefore **CUTOVER_CONFIRMED**. Under `trusted-dev`, Pi may replace the generic filesystem provider and legacy Shell; under `restricted`, the separate legacy Shell remains by policy while Pi Bash is omitted.

## Live A/B acceptance

The implementation worktree was deliberately activated as the deployment root and the public bridge returned `issues: 0`. Live 1MCP discovery reported:

```text
filesystem  14 tools
shell        1 tool
dev          4 tools
total       19 tools
```

A separate restricted fixture exposed `dev.read`, `dev.edit`, and `dev.write` only; Pi Bash was absent and the legacy Shell remained available.

ChatGPT Actions refresh ultimately succeeded and replaced the stale pre-migration action catalog with the A/B catalog. The first refresh attempt exposed a separate publication-scaffold migration defect: changing 1MCP's writable `--config-dir` also changed its OAuth/session home, so an existing client token was initially unknown in the new state directory. OAuth continuity was restored and refresh then succeeded. That transport/state-migration issue was hardened separately and did not originate in the Pi provider.

During the correction phase, the A/B deployment was restored again with current lifecycle/OAuth machinery and the current ChatGPT connector exposed the expected 19-tool surface. Fresh public-path calls then returned: source text plus continuation hint for `dev.read`, native success text for `dev.bash`, `Created <relative-path>` for `dev.write`, and one compact relative-path diff for `dev.edit`. A verification read returned the edited content and cleanup succeeded without a recovery call.

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

The generic filesystem tool cannot request an arbitrary middle offset, so its one-call Files-provider fallback returns the whole file. That remains useful evidence about that provider, but it is not the best operation available in the complete incumbent harness because legacy Shell can issue a one-call `sed` range.

### Generic Files-provider comparison

| Surface | Wall time | Text bytes | Text tokens | Extra representation |
|---|---:|---:|---:|---|
| legacy `read_text_file` whole-file fallback | 65.73 ms | 131,736 | 25,155 | `structuredContent` also present |
| `dev.read(offset=80, limit=40)` | 8.05 ms | 1,652 | 344 | none |

The 25,155 -> 344 figure therefore compares the generic filesystem provider's whole-file fallback to `dev.read`; it is **not** the best complete old-harness comparison. Within that provider-only comparison, Pi reduces returned text by 98.7% bytes / 98.6% tokens.

### Best one-call old-harness ranged baseline

The correction phase reran the same range through legacy Shell using non-login `bash -c` plus `sed`, avoiding unrelated shell-profile startup noise.

| Surface | Request bytes | Request tokens | Result bytes | Result tokens | Direct wall |
|---|---:|---:|---:|---:|---:|
| legacy Shell + `sed` | 103 | 35 | 1,596 | 329 | 7.53 ms |
| `dev.read(offset=80, limit=40)` | 75 | 22 | 1,652 | 344 | 5.85 ms |

Observed fact: the best old-harness range result is 15 estimated tokens smaller than Pi's result. Pi's result is larger because it appends a continuation hint showing how much source remains and which offset continues the read. Pi still reduces request tokens by 37.1%, avoids an absolute machine path and command-language translation, and was 22.3% faster in this isolated direct-provider run. The result-token difference by itself is not evidence for Pi.

The generic filesystem server additionally duplicated its whole-file read result inside `structuredContent.content`. On a second equivalent capture that structured representation alone serialized to 134,990 bytes / 28,876 `o200k_base` tokens. The `dev` provider emits no `structuredContent`. Because ChatGPT's exact internal context accounting is not directly observable, that duplicate is reported separately rather than asserted as a literal billing number; it is nevertheless part of the MCP result shape and was explicitly absent from every Pi result.

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
| middle source range | legacy Shell can fetch the range in one call, but requires command syntax + absolute path; generic Files falls back to whole-file evidence | no extra call; workspace-relative range + continuation hint |
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

`CUTOVER_CONFIRMED` requires:

1. every mandatory boundary/execution semantic to pass;
2. no reliability regression;
3. a material overall improvement in model-facing schema/request ergonomics, execution evidence, or follow-up-call debt after correcting unfair incumbent baselines;
4. fresh real ChatGPT-path `read`, `bash`, `write`, and `edit` calls to match the native TextContent contract.

Evidence satisfies all four:

```text
mandatory Pi cases                 21 / 21 PASS
real ChatGPT dev calls              read/bash/write/edit PASS
trusted tool count                 15 -> 4
normalized schema tokens           1,854 -> 408   (-78.0%)
representative request tokens      129 -> 99      (-23.3%)
best ranged request tokens          35 -> 22      (-37.1%)
best ranged result tokens          329 -> 344     (+4.6%; Pi larger)
generic Files whole-file tokens 25,155 -> 344     (-98.6%; provider-only comparison)
edit text tokens                   123 -> 39      (-68.3%)
write text tokens                   29 -> 19      (-34.5%)
structuredContent                  legacy Files: present; Pi dev: absent
non-zero exit status               legacy Shell: lost; Pi: inline
truncated evidence                 legacy Shell: discarded; Pi: tail + handle
```

Inference: the corrected range comparison removes the strongest token-saving claim for `dev.read`, but does not remove the broader reduction in tool/schema surface, request translation debt, duplicated Files representations, or lost Shell execution evidence.

Policy decision: **Pi = CUTOVER_CONFIRMED.**

## Measurement limits

- Schema and request/result token counts are a common offline `o200k_base` estimate, not a claim about hidden ChatGPT billing or exact internal context allocation.
- Provider microbenchmarks were measured through direct MCP stdio clients using the exact rendered provider commands/environment so OAuth/network latency did not contaminate the comparison.
- Separately, fresh `dev.read`, `dev.bash`, `dev.write`, and `dev.edit` calls were exercised through the actual ChatGPT -> OAuth -> Cloudflare -> 1MCP route and matched the intended model-visible result shapes.
- The separate OAuth-state migration defect discovered during live activation belongs to the publication/transport migration path. It is being fixed independently and is not evidence against the Pi provider.
