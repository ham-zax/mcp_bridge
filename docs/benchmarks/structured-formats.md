# Structured-Format Screen — Native / JSON / TOON / GCF

**Date:** 2026-08-15  
**TOON:** `@toon-format/cli@4.1.1`  
**GCF:** `gcf-python==2.6.0` / GCF spec 3.5.3  
**Tokenizer:** `tiktoken==0.13.0`, `o200k_base`

## Task 13 final trigger audit

```text
FORMAT_TRIGGER              = FORMAT_TRIGGER_NOT_FIRED
TOON                        = REJECTED_WITH_EVIDENCE
GCF generic                 = DEFERRED_WITH_TRIGGER
GCF graph                   = DEFERRED_WITH_TRIGGER
Phase-2 production codec work = NONE
```

Task 13 audited the retained Phase-2 model-facing result classes from assembled base `0441b94` plus the frozen Task-7 Terminal contract. The trigger question was deliberately narrower than the original codec screen:

```text
Did Phase 2 introduce a new, real, repetitive structured model-facing payload
for which the best native text is materially worse?
```

The answer is **no**. No retained production payload satisfies the complete trigger standard. Source, diffs, patches, Bash output, terminal streams, and active diagnostics are semantic text artifacts rather than serialization candidates. The qualified Code facade already returns CodeDB lean native `TextContent`; the one genuinely repetitive Code class (`code_search`) is the same class for which the earlier paired codec measurements showed native text materially smaller than TOON, GCF generic, and compact JSON.

Final Task-7 implementation commit `875664c49c280b2a22f169b4d79f1526b5dd5889` has now been inspected. It preserves exactly six Terminal MCP tools; successful results use native `TextContent` only with no `structuredContent`; `terminal_read` returns incremental unread text or native snapshot text; `terminal_list` remains a concise native summary; and open/send/resize/close return concise native acknowledgements. No materially repetitive structured Terminal result was introduced. The implementation confirmation therefore closes the remaining Task-13 checkpoint without reopening codec work.

### Final model-facing payload inventory

Representative sizes below are existing Phase-2 measurements, not new codec benchmarks. `o200k_base` values are retained where prior evidence already measured them.

| Result class | Semantic shape | Representative model-visible size | Repetitive structure | Native text already compact? | Readability/debugging cost of conversion | Model needs field-level structured access? | Duplicate-representation risk | Exact semantic/round-trip sensitivity | Expected codec benefit | Trigger |
|---|---|---|---|---|---|---|---|---|---|---|
| `read` source/text | requested source/text range plus continuation hint | real 40-line range: **1,652 B / 344 tokens** | no record repetition; source syntax is the content | yes; best native `sed` baseline was 329 tokens, only 15 lower | **high** — encoding source obscures line-oriented review and copy/edit reasoning | no; line/text access is the task | high if source is retained alongside an encoding; otherwise readability is sacrificed | **high** — exact source characters/line structure matter | none demonstrated; prior generic Files duplication was dramatically worse | no |
| `edit` result | relative path plus one compact diff | two-location example: **92 B / 39 tokens** | no; diff grammar is semantic, not record overhead | yes | **high** — diff syntax is already the debugging/review language | no | any second representation would be pure duplication | **high** — changed/context lines matter | negligible/negative | no |
| `apply_patch` result | one native summary line per affected file, e.g. `M path (+2 -1)` | Task-4 corpus: **458 tokens / 23 calls (~20/call)**; category averages roughly 12–39 tokens/call | shallow repetition only for multi-file patches | yes | moderate — paths/change counts become harder to scan for no measured gain | no; this is an acknowledgement, not a bulk data API | high if both summary and codec are kept | paths/kinds/counts must remain exact | too small to justify codec/schema/runtime machinery | no |
| `write` result | one creation acknowledgement | **55 B / 19 tokens** | none | yes | conversion only adds ceremony | no | any encoded copy duplicates the acknowledgement | path must be preserved | negative | no |
| `bash` result | native command output stream plus minimal exit/truncation/timeout annotation | simple measured cases: **4–7 tokens**; bounded 5,000-byte truncation example: **1,195 B / 202 tokens** | command-dependent, not one stable record schema | yes; caller can already choose compact native commands such as `rg`, `sed -n`, `git status --short` | **high** for diffs, compiler/test diagnostics, machine-readable command output, and active failures | no generic field model exists across arbitrary commands | structured wrapping would duplicate or replace the command's own native format | **high** for diagnostics/exit evidence | generic codec has no stable semantic target; explicit `rtk test`/`rtk err` remains optional outside the harness for narrow log shaping | no |
| `code_search` | ranked path/line/symbol search text | paired 20-result capture: **2,287 B / 512 tokens** | **yes, moderately uniform records** | **yes, proven** | conversion makes ranked code navigation less directly scannable | no; path/line/symbol facts are already explicit in text | current facade has no structured duplicate; reintroducing raw JSON would add one or replace the smaller representation | search facts must be preserved, but backend object round-trip is not a model requirement | **proven negative vs native:** TOON +76.4%, GCF generic +72.3%, compact JSON +108.2% tokens | no |
| `code_context` | heterogeneous task context: headings, definitions, files, snippets, graph-neighbor prose | paired capture: **3,206 B / 784 tokens**; Task-10 bounded-change workflow: **790 request+result tokens in one call** | low/irregular mixed structure | **yes, proven** | high — headings/snippets are optimized for direct code reasoning | no stable field-level access requirement | current facade returns only lean text | snippets and relationships must remain semantically exact | **proven negative vs native:** TOON +161.9%, GCF generic +138.6% | no |
| `code_symbol` | one/few definition locations with compact hint text | paired capture: **252 B / 60 tokens**; Task-10 exact-symbol workflow remained small | little repetition at normal cardinality | **yes, proven** | conversion adds ceremony to a direct location lookup | no | current facade returns only lean text | symbol/path/line identity matters | prior TOON/GCF were already larger than native | no |
| `terminal_read` | only unread transcript text; explicit recovery cursor/snapshot only when requested | qualified broker evidence includes **28 B** immediate output and **54 B** incremental continuation; frozen MCP read cap **65,536 B** | whatever the underlying process prints; not a Terminal-owned record schema | yes — incremental unread semantics already remove replay duplication | **high** — terminal/test/debugger output and ANSI/TUI snapshots are semantic text/state | no generic field schema; the stream itself is the information | adding encoded text would duplicate the unread stream; replacing it would impair direct debugging | **high** — UTF-8 boundaries, logical byte cursor, and exact output matter | none; ordinary terminal streams are explicitly outside the codec trigger | no |
| `terminal_list` / status summary | concise per-session native lines containing live/dead state, exact dead exit status, dimensions, attachment and human-control state | final Task-7 implementation inspected; concise native `TextContent`, no material repetitive payload observed | potentially one short repeated line per session | yes; final implementation remains concise | encoding a small status list would reduce human/model scanability | named facts matter, but labels in concise text are sufficient; no consumer requires JSON fields | no `structuredContent`; a codec would replace already-concise text or create duplication | exact status/exit values matter | no demonstrated material context cost | no |
| Terminal `open` / `send` / `resize` / `close` results | concise administrative acknowledgements/errors; `send` does not echo input | final Task-7 implementation inspected; concise native `TextContent` | none/materially bounded | yes | conversion adds ceremony and risks echoing sensitive input if poorly designed | no | no `structuredContent`; an encoded copy would duplicate tiny acknowledgements | action identity/error code matters | negative/immaterial | no |
| errors and active diagnostics across Dev/Code/Terminal | stable code/message plus native diagnostic text | usually short; exceptional Bash output remains bounded/recoverable | irregular by failure class | yes | **high** — remediation evidence is the point | no generic cross-domain record schema | duplicate error objects would add context without replacing the human-readable diagnostic | **high** for exact failure evidence | excluded by trigger standard | no |

### Other Phase-2 surfaces checked

No other retained Phase-2 subsystem creates a new model-facing structured result class:

- the CLI toolbox adds **zero MCP actions** and is observed only through native Bash/Terminal output;
- automatic RTK rewriting is rejected, while explicit `rtk test` / `rtk err` are optional Bash commands rather than a new result protocol;
- Task 12.5 is explicitly provider-internal same-path mutation serialization with **no new MCP arguments and no model-visible hash/revision field**;
- the raw CodeDB 10-tool/core structured catalog remains hidden behind the three-tool facade;
- the Terminal broker newline-delimited JSON protocol is private and not model-facing;
- `wsl-term` is a human attach CLI, not an MCP model result;
- Terminal wait/resume remains blocked pending real ChatGPT Task-7 product-path acceptance and therefore contributes no retained payload class to this audit.

### Trigger-gate application

A payload would reopen codec work only if all of these were plausibly true at once: material repeated structure, substantial native-text context cost, exact semantic preservation, acceptable model comprehension, no duplicate representation, and enough expected gain to justify a new subsystem.

No audited class passes that conjunction:

- Files/Patch/Bash/Terminal streams fail at the first step because their semantic artifact **is native text**; encoding them would optimize syntax rather than remove transport overhead.
- `code_context` is irregular and already compact; prior codec representations were much larger.
- `code_symbol` is too small and low-cardinality.
- `code_search` has repeated records, but the direct paired benchmark already proves lean native text is materially smaller than every tested structured representation.
- `terminal_list` is the only new result that could superficially resemble a record list, but final Task-7 inspection confirms the production MCP renders a concise native summary with no `structuredContent` and no materially repetitive structured payload. A hypothetical large JSON session table is not evidence and is not model-facing.

Therefore Task 13 closes with **`FORMAT_TRIGGER_NOT_FIRED`** and recommends **zero production codec work for Phase 2**.

## Carry-forward codec evidence

The correction phase confirmed that `gcf encode/decode` is specifically the graph profile, while arbitrary JSON belongs on `encode-generic/decode-generic`. The earlier graph-profile failure on ordinary CodeDB JSON was therefore a benchmark/profile mismatch, not a general GCF incompatibility result.

Fresh generic-profile reruns round-tripped all three arbitrary-JSON captures exactly. Generic GCF still used materially more tokens than the paired native CodeDB model-facing text, so there is no reason to insert it into the current bridge. Its project state remains `DEFERRED_WITH_TRIGGER` rather than permanently rejected: reopen only for a future real structured payload where best native text loses materially.

No natural model-facing graph JSON exists in the current harness to test the graph profile fairly. The graph profile therefore remains `DEFERRED_WITH_TRIGGER` for a future natural graph-shaped model-facing payload rather than being declared incompatible or benchmarked against synthetic data.

## Actual payloads

Three real CodeDB payload pairs were captured from `$HOME/repo/satori`:

| Payload | Structure class | Native pair | JSON source |
|---|---|---|---|
| `codedb_context` task response | `irregular_mixed` | compact task/context text | schema-versioned context object with heterogeneous sections |
| `codedb_symbol(runSearchExecution)` | `uniform_records` | one symbol record | object containing a uniform `results` array |
| `codedb_search(handleSearchCode)` | `uniform_records` | 20 ranked search results | object containing a uniform 20-record `results` array |

The search pair omits `scope=true` because CodeDB explicitly returns `unsupported` for `format=json` with `scope=true`; native and JSON captures therefore use the same successful request without scope annotation.

Native prose was never wrapped in invented JSON.

Raw captures and generated representations are retained outside Git under:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/structured/
```

## Fidelity

| Payload | TOON round-trip | historical wrong-profile graph attempt | GCF generic round-trip |
|---|---|---|---|
| context | exact | failed as expected for non-graph input | exact |
| search | exact | failed as expected for non-graph input | exact |
| symbol | exact | failed as expected for non-graph input | exact |

No values were coerced to make a codec pass.

## Bytes and shared-tokenizer counts

| Payload | Representation | Bytes | `o200k_base` tokens |
|---|---|---:|---:|
| context | native text | 3,206 | **784** |
| context | pretty JSON | 12,708 | 3,183 |
| context | compact JSON | 9,515 | 2,389 |
| context | TOON | 8,002 | 2,053 |
| context | historical wrong-profile GCF graph output | 34 | 11* |
| context | GCF generic | 6,845 | 1,871 |
| search | native text | 2,287 | **512** |
| search | pretty JSON | 5,353 | 1,485 |
| search | compact JSON | 4,284 | 1,066 |
| search | TOON | 3,386 | 903 |
| search | historical wrong-profile GCF graph output | 47 | 14* |
| search | GCF generic | 3,360 | 882 |
| symbol | native text | 252 | **60** |
| symbol | pretty JSON | 383 | 120 |
| symbol | compact JSON | 282 | 73 |
| symbol | TOON | 248 | 73 |
| symbol | historical wrong-profile GCF graph output | 47 | 14* |
| symbol | GCF generic | 265 | 78 |

`*` The tiny historical graph-profile results are **not compression wins**. They came from feeding non-graph arbitrary JSON to a graph codec and discarded the original structure; they are retained only as evidence of the benchmark/profile mismatch.

### Relative to compact JSON

| Payload | TOON token delta | GCF generic token delta |
|---|---:|---:|
| context | -14.1% | -21.7% |
| search | -15.3% | -17.3% |
| symbol | 0.0% | +6.8% |

### Relative to the existing native CodeDB response

| Payload | TOON token overhead | GCF generic token overhead |
|---|---:|---:|
| context | **+161.9%** | +138.6% |
| search | **+76.4%** | +72.3% |
| symbol | **+21.7%** | +30.0% |

For every paired payload, the existing native model-facing text is the smallest faithful representation tested.

## Codec latency

Times are seconds for fresh CLI processes. The first pass was labeled cold and the immediate second pass warm without cache clearing, as specified by the plan.

| Payload | Codec/op | cold | warm |
|---|---|---:|---:|
| context | TOON encode | 2.08 | 1.40 |
| context | TOON decode | 2.07 | 1.41 |
| context | GCF graph encode | 0.05 | 0.05 |
| context | GCF graph decode | 0.05 | 0.05 |
| context | GCF generic encode | 0.06 | 0.05 |
| context | GCF generic decode | 0.06 | 0.05 |
| search | TOON encode | 2.04 | 2.06 |
| search | TOON decode | 1.40 | 1.36 |
| search | GCF graph encode | 0.05 | 0.05 |
| search | GCF graph decode | 0.05 | 0.05 |
| search | GCF generic encode | 0.05 | 0.05 |
| search | GCF generic decode | 0.05 | 0.05 |
| symbol | TOON encode | 1.36 | 1.36 |
| symbol | TOON decode | 1.35 | 1.37 |
| symbol | GCF graph encode | 0.05 | 0.05 |
| symbol | GCF graph decode | 0.05 | 0.06 |
| symbol | GCF generic encode | 0.05 | 0.05 |
| symbol | GCF generic decode | 0.05 | 0.05 |

TOON CLI startup is expensive enough that shelling out per model result would be unattractive even before considering that it loses to native text. A future library-level benchmark could isolate process-startup cost, but the current payload evidence gives no reason to put TOON in the live bridge.

## TOON disposition

TOON is lossless on all three actual payloads and does reduce compact JSON by about 14–15% tokens on the two larger values. However, the relevant model-facing baseline is not compact JSON: it is CodeDB's existing native text.

TOON used 21.7% to 161.9% **more** tokens than native text across all three paired payloads and added substantial CLI encode latency.

Current-payload finding: **TOON is NOT_MATERIAL** on every measured retained payload. Task-13 lifecycle state: **TOON = REJECTED_WITH_EVIDENCE** for Phase 2.

## GCF disposition and profile correction

The pinned `gcf-python==2.6.0` CLI explicitly defines:

```text
gcf encode / decode                 graph profile
gcf encode-generic / decode-generic arbitrary-JSON generic profile
```

### Generic profile

The correction phase reran all three existing arbitrary-JSON captures with `encode-generic/decode-generic` and strict sorted-JSON equality. All three round trips were exact.

Fresh measurements:

| Payload | Compact JSON tokens | GCF generic tokens | Native text tokens | Generic encode cold/warm | Generic decode cold/warm |
|---|---:|---:|---:|---:|---:|
| context | 2,389 | 1,871 | **784** | 0.04 / 0.04 s | 0.05 / 0.05 s |
| search | 1,066 | 882 | **512** | 0.04 / 0.04 s | 0.04 / 0.04 s |
| symbol | 73 | 78 | **60** | 0.04 / 0.04 s | 0.04 / 0.04 s |

Observed fact: generic GCF is lossless and reduces compact JSON for the two larger payloads, but native model-facing text remains 30.0% to 138.6% smaller in token count across the paired workload.

Current-payload finding: **GCF generic is NOT_MATERIAL** for the current bridge. Task-13 lifecycle state: **GCF generic = DEFERRED_WITH_TRIGGER** for a future real structured payload where native text loses materially.

### Graph profile

The correction phase searched the rooted CodeDB/Pi evidence for a natural model-facing graph JSON payload. None exists. `dev` intentionally emits native text; CodeDB caller/dependency tools also render native text, and a live `codedb_deps` result was dependency prose rather than JSON. Correction captures contained no natural top-level `nodes`, `edges`, or `symbols` graph payload.

The old `gcf encode` failures therefore answer only this question: "what happens if arbitrary non-graph JSON is fed to the graph profile?" They do not establish graph-profile incompatibility with genuine graph data.

Creating a synthetic graph solely to make the codec benchmarkable would violate the correction design. Historical current-payload finding: `DEFERRED_NO_GRAPH_PAYLOAD`. Task-13 lifecycle state: **GCF graph = DEFERRED_WITH_TRIGGER** for a future natural graph-shaped model-facing payload.

If a future Code-domain/Terminal feature naturally exposes a graph-shaped model-facing payload, graph GCF can be benchmarked then against that real representation.
