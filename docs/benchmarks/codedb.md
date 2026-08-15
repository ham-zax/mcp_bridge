# CodeDB Harness Benchmark

**Date:** 2026-08-15  
**Candidate:** CodeDB `0.2.5840` (`core`, lean MCP, telemetry disabled)  
**Project:** `$HOME/repo/satori` at `719335c56305b6ce4ba91de1b410398049b069ac`

## Correction verdict

```text
Previous verdict: REMOVE
Correction classification: adapter / architecture mismatch
Rooted watcher: PASS
Current product verdict: ROUTER_EXPERIMENT
```

The original context benchmark remains useful, but its freshness gate launched one neutral-root MCP process and used the optional per-call `project=<other-project>` switch for the Satori repository. The correction phase independently reproduced that alternate-project path as a snapshot-style adapter path that did not follow external changes. That result is not evidence that CodeDB's primary rooted watcher is defective.

With the exact same pinned `0.2.5840` binary launched as `codedb <repository-root> mcp`, ordinary calls omitted `project` and automatic freshness passed for an external edit, a newly created file, a Pi `dev.edit`, and a Pi restore. No explicit `codedb_read` was used to refresh the index.

The tracked CodeDB product integration remains absent while Task 5 evaluates whether the correctly rooted Code domain adds enough value over the Pi-era four-tool `dev` surface. Raw evidence remains outside Git; this report records the corrected classification.

## Pin and local startup evidence

The exact release asset installed successfully after SHA-256 verification:

```text
version: 0.2.5840
sha256: f784c931b053031ca9928173828130c504f769c9e94bf5c2666ab71091747966
binary used for benchmark: ~/.local/share/mcp-dev-bridge/bin/codedb-v0.2.5840
```

On this WSL host the GitHub release body repeatedly stalled at zero bytes over the default HTTP/2 transfer. For the implementation experiment the installer used HTTP/1.1 plus finite connect/transfer timeouts; the resulting full asset matched the exact planned checksum.

Direct 1MCP discovery connected successfully and advertised exactly 10 `core` tools:

```text
codedb_tree
codedb_outline
codedb_symbol
codedb_search
codedb_callers
codedb_context
codedb_deps
codedb_read
codedb_status
codedb_find
```

No convenience installer or CodeDB client-registration command was used.

## Advertised schema cost

### 1MCP built-in estimate

| Surface | Tools | Estimated schema tokens |
|---|---:|---:|
| old filesystem + shell | 15 | 1,987 |
| CodeDB core | 10 | 2,441 |

CodeDB advertises **22.8% more schema tokens** than the complete old filesystem+shell surface despite exposing five fewer tools.

### Independently normalized schema serialization

Every tool was individually inspected and normalized to compact `{name, description, inputSchema}` JSON, then tokenized with `tiktoken==0.13.0` / `o200k_base`.

| Surface | Tools | Bytes | Tokens |
|---|---:|---:|---:|
| old filesystem + shell | 15 | 8,797 | 1,839 |
| CodeDB core | 10 | 10,788 | 2,368 |

The independent serialization agrees with the 1MCP estimate: CodeDB's always-visible schema is heavier than the old surface by itself.

Raw schema captures are retained under external state:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/schema/
```

## Controlled semantic-search trace

Task:

> Trace the Satori semantic-search request from its entry point through retrieval/ranking to response projection. Name concrete files and functions and cite the evidence used for each hop.

For the final comparison, one temporary localhost-only 1MCP instance exposed the old filesystem/shell providers and CodeDB simultaneously. Both sides therefore paid the same 1MCP CLI/HTTP aggregation overhead. The real bridge was not restarted or reconfigured.

### Correct call chain recovered

The evidence supports this request path:

1. `packages/mcp/src/tools/search_codebase.ts` — `searchCodebaseTool.execute()` validates/authorizes input and calls `executionContext.toolHandlers.handleSearchCode(...)` at the provider boundary.
2. `packages/mcp/src/core/handlers.ts` — `Handlers.handleSearchCode()` delegates to `this.searchRequestCoordinator.attempt(args, 0)`.
3. `packages/mcp/src/core/search-request-coordinator.ts` — `SearchRequestCoordinator.attempt()` resolves query/rerank context and calls `runSearchExecution(...)`.
4. `packages/mcp/src/core/search-execution.ts` — `runSearchExecution()` performs retrieval/filtering and calls `rerankSearchCandidates(...)`; its `ok` outcome carries the scored candidates, ranking provenance, freshness, and reranker diagnostics.
5. `packages/mcp/src/core/search-request-coordinator.ts` — the coordinator calls `finalizeSearchResults(...)`, attaches the frozen grouped result set when applicable, and serializes the returned envelope with `this.hints.stringifyToolJson(envelope)`.

Both old and CodeDB traces reached this chain. One CodeDB `codedb_search` path-filter query returned zero while the server reported `scan: loading_snapshot`, so the successful chain evidence relied on the task context, caller data, and explicit bounded reads rather than counting that failed search as useful evidence.

### Runtime and model-visible evidence

| Metric | old primitives | CodeDB | Delta |
|---|---:|---:|---:|
| evidence calls | 8 | 8 | no improvement |
| wall time through same temp 1MCP | 5.00 s | 6.06 s | CodeDB +21.2% |
| model-visible result bytes | 48,137 | 22,858 | CodeDB -52.5% |
| model-visible result tokens | 9,602 | 5,135 | CodeDB -46.5% |
| request bytes | 1,270 | 1,118 | CodeDB -12.0% |
| request tokens | 397 | 308 | CodeDB -22.4% |
| request max JSON depth | 2 | 1 | CodeDB shallower |

The old first broad `rg` produced a large noisy candidate set before a focused search isolated `handleSearchCode`, `runSearchExecution`, and `finalizeSearchResults`. CodeDB's task context plus ranged reads/caller data used much less model-visible text, although the initial context also admitted irrelevant generic keyword matches such as `projection`, `functions`, and `evidence`.

### Combined one-task context accounting

Using the 1MCP schema-token estimate plus the controlled requests/results:

| Cost | old | CodeDB |
|---|---:|---:|
| advertised schema tokens | 1,987 | 2,441 |
| request tokens | 397 | 308 |
| result tokens | 9,602 | 5,135 |
| combined | 11,986 | 7,884 |

CodeDB reduced this combined accounting by **34.2%** despite its heavier schema. That is a real context benefit.

Raw task/request captures are retained under:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/task2-controlled/
```

## Freshness / watcher gate

### Original experiment: alternate-project adapter path

The original experiment rebuilt the Satori index but ran CodeDB MCP from a neutral root and supplied the Satori path through the optional per-call `project` field. In that configuration, passive edit/new-file probes stayed stale and an explicit `codedb_read` could refresh a changed file. Those observations remain valid for that adapter shape.

The correction phase reproduced the distinction directly. A CodeDB process rooted at a different normal directory queried an indexed fixture using `project=<fixture-root>`. After an external edit, the alternate-project status sequence remained unchanged (`2 -> 2`), the new marker count stayed `0`, and the old marker count stayed `1` during the polling window. Classification: **adapter / alternate-project behavior**.

### Corrected experiment: primary rooted watcher

The corrected gate launched the exact pinned binary as:

```text
codedb <fixture-repository> mcp
```

Ordinary `codedb_status` and `codedb_search` calls used no `project` field. Starting from one indexed file:

```text
initial seq:              1
initial files:            1
initial old marker count: 1
```

While the same MCP process remained alive, the existing file was externally changed and a second source file was created. Without calling `codedb_read`, polling converged to:

```text
final seq:                3
final files:              2
edited-new marker count:  1
old marker count:         0
created-new marker count: 1
```

A separate Pi-integration fixture then changed a rooted file through `dev.edit`. CodeDB advanced `seq 1 -> 2`, found the Pi-produced new marker, and stopped returning the old marker. Restoring through `dev.edit` advanced `seq 2 -> 3`, restored the original marker, and removed the temporary one from search. Again, no per-call `project` and no `codedb_read` refresh were used.

Observed fact: **ROOTED_FRESHNESS_PASS**. The previous stale result came from the alternate-project architecture, not the primary rooted watcher.

## Why the previous REMOVE verdict is reopened

Positive evidence that still stands:

- 46.5% fewer model-visible result tokens on the original controlled trace;
- 34.2% lower combined schema+request+result token accounting against the old harness;
- 22.4% fewer request tokens and shallower request objects;
- useful bounded reads, caller discovery, and task-shaped context;
- correct semantic-search call chain recovered;
- corrected rooted watcher freshness now passes, including after Pi edits.

Evidence that must be re-evaluated against the current product rather than reused mechanically:

- CodeDB's visible schema cost, because the relevant baseline is now four-tool Pi `dev`, not the obsolete 15-tool filesystem+shell surface;
- call count and wall time on the repository-orientation task;
- whether one fixed repository root is sufficient for the intended multi-repository workspace.

Inference: the reliability blocker used for the previous removal was an architecture/adapter mismatch. It no longer justifies `REMOVE`.

## Pi-era value comparison

The correction phase compared the current four-tool trusted `dev` surface against `dev +` correctly rooted CodeDB on the same semantic-search tracing task.

### Incremental schema cost

| Surface | Tools | Normalized schema bytes | Estimated tokens |
|---|---:|---:|---:|
| Pi `dev` only | 4 | 1,737 | 408 |
| rooted CodeDB only | 10 | 10,788 | 2,368 |
| Pi + rooted CodeDB | 14 | 12,524 | 2,774 |

Observed fact: CodeDB adds roughly 2.4k always-visible schema tokens to the four-tool Pi surface, so navigation savings must amortize a large fixed cost.

### Same-task evidence trace

Both sides used eight direct MCP calls against the same repository commit and recovered the same concrete request-chain files/functions. The CodeDB trace used rooted calls with no `project` override.

| Metric | Pi only | Pi + rooted CodeDB | Delta |
|---|---:|---:|---:|
| task calls | 8 | 8 | same |
| request bytes | 847 | 838 | -1.1% |
| request tokens | 232 | 212 | -8.6% |
| result bytes | 48,329 | 22,751 | -52.9% |
| result tokens | 9,618 | 5,115 | -46.8% |
| direct provider wall time | 52.7 ms | 504.2 ms | CodeDB ~9.6x slower, +451 ms absolute |
| schema + requests + results | 10,258 tokens | 8,101 tokens | CodeDB -21.0% |

Observed fact: even after paying the full combined CodeDB schema cost, this multi-step trace used about 2.2k fewer estimated tokens with CodeDB. The direct execution penalty remained below one second but was materially slower than Pi-native Bash/read operations.

### First-touch quality diagnostic

The original `codedb_context(task)` result was compact but noisy and did not identify the real request chain; a seeded path-filtered `handleSearchCode` search also returned zero. This limits how much of the fixed trace can be interpreted as autonomous orientation quality.

A more natural follow-up search for the likely tool name `search_codebase` did show CodeDB's useful search behavior:

| Search | Request tokens | Result tokens | Direct wall |
|---|---:|---:|---:|
| Pi `dev.bash` + `rg` | 33 | 1,255 | 18.2 ms |
| rooted `codedb_search` | 16 | 592 | 1.45 ms |

The CodeDB search returned the primary `packages/mcp/src/tools/search_codebase.ts` match near the top while using about half the request/result tokens. The value case is therefore strongest for ranked search, bounded code reads, and caller/navigation primitives—not for treating `codedb_context` as an infallible first-touch answer.

### Freshness in the representative repository

A final Pi-produced source fixture in the representative repository advanced rooted CodeDB `seq 1080 -> 1081` on create and `1081 -> 1082` on edit. Both markers became searchable without `project` or `codedb_read`; the disposable file was then removed and the Git path remained clean.

### Multi-repository constraint and verdict

At measurement time the configured workspace contained 30 top-level Git repositories. A single fixed `MCP_CODE_ROOT` would therefore make rooted CodeDB reliable for only one repository, while the alternate-project switch is exactly the path that failed automatic freshness.

Inference: correctly rooted CodeDB has enough compression/navigation value to justify continuing the experiment, but the current one-root deployment shape is not sufficient for the intended workspace.

Policy decision: **CodeDB = ROUTER_EXPERIMENT.** Do not re-add a single fixed-root CodeDB provider to the final live product yet. The next Code-domain experiment should preserve one rooted CodeDB process per active repository behind a small routing boundary without exposing a large new model-facing catalog.
