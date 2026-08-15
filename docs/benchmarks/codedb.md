# CodeDB Harness Benchmark

**Date:** 2026-08-15  
**Candidate:** CodeDB `0.2.5840` (`core`, lean MCP, telemetry disabled)  
**Project:** `/home/hamza/repo/satori` at `719335c56305b6ce4ba91de1b410398049b069ac`

## Verdict

**CodeDB = REMOVE**

CodeDB produced materially smaller task evidence, but it failed the required post-edit freshness/reliability gate. The persistent MCP index did not automatically observe either new files or edits to an already-indexed tracked source file. An explicit `codedb_read` of the changed file refreshed the index, after which `codedb_search` immediately found the new content, but that recovery call is not the watcher behavior promised by the architecture.

Because KEEP requires baseline correctness/reliability **and** a material navigation/context benefit, the context win does not override the failed freshness requirement.

The candidate has therefore been removed from the tracked MCP template and source scripts. Raw evidence remains outside Git; this report remains in Git.

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

Freshness failed independently of the context benchmark.

The original Satori checkout disappeared during an early probe and was then freshly cloned back to the same HEAD. To rule out a stale cache from the removed checkout, the CodeDB external index was explicitly rebuilt:

```text
codedb /home/hamza/repo/satori index
✓ index ready 1058 files
```

After that rebuild, fresh MCP processes repeatedly reported:

```text
scan: loading_snapshot
```

and the sequence did not advance during passive edit probes.

Three automatic-freshness probes were attempted:

1. new Git-ignored file under `piolium/tmp/` — not discovered by `codedb_search`;
2. new non-ignored file under `packages/mcp/src/` — not discovered by `codedb_search`;
3. guarded edit to existing indexed `packages/mcp/src/core/search-retrieval-order.ts` — new unique content not discovered by `codedb_search` during the polling window.

For the tracked-file probe, exact original bytes were backed up first and restoration was hash-guarded so a concurrent external edit could not be overwritten. The file was restored exactly and `git status` returned clean for that path.

A final diagnostic proved the distinction between stale search index and raw file access:

```text
edit existing indexed file with a unique token
codedb_search(unique token)       -> missing
codedb_read(changed file range)   -> returned current changed bytes
codedb_search(unique token)       -> found immediately
```

Therefore CodeDB can refresh a changed file when it is explicitly read, but the tested MCP configuration did **not** provide the required automatic watcher/index freshness after external Pi-style edits.

## Why REMOVE despite context savings

Positive evidence:

- 46.5% fewer model-visible result tokens on the controlled trace;
- 34.2% lower combined schema+request+result token accounting;
- 22.4% fewer request tokens and shallower request objects;
- useful bounded reads, caller discovery, and task-shaped context;
- correct semantic-search call chain recovered.

Blocking evidence:

- post-edit search freshness failed after a fresh clone and explicit index rebuild;
- `codedb_status` remained in `loading_snapshot` state on persistent MCP runs;
- an explicit `codedb_read` was required to make changed content searchable;
- CodeDB added 22.8% more advertised schema tokens than the old filesystem+shell surface;
- the controlled trace did not reduce call count and was 21.2% slower through the same temporary 1MCP path.

The freshness failure is a correctness/reliability failure for the planned `Code -> Files edit -> Code re-check` loop, so the independent decision is **REMOVE**.
