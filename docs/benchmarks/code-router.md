# Rooted Multi-Repository CodeDB Router — Task 9

**Date:** 2026-08-15
**Base:** `9bd8cacb44c7c099923ed4f4a8d63a31966a5086`
**Scope:** Phase-2 Task 9 internal router only; no model-facing Code facade or live MCP composition
**CodeDB:** `0.2.5840`, core tools, lean MCP output, telemetry disabled

## Result

```text
ROOTED_ROUTER = QUALIFIED_FOR_TASK_10
MODEL_FACADE  = NOT_DECIDED_HERE
```

Task 9 preserves the corrected CodeDB architecture: **one active Git repository maps to one CodeDB MCP child rooted at that repository**. The router never launches a neutral process and never supplies `project=<other-repo>` on ordinary calls.

The exact external binary was reverified before use:

```text
path:    ~/.local/share/mcp-dev-bridge/bin/codedb-v0.2.5840
version: codedb 0.2.5840
sha256:  f784c931b053031ca9928173828130c504f769c9e94bf5c2666ab71091747966
```

## Internal contract

### Repository discovery

`resolveRepoRoot(cwd)`:

1. canonicalizes the requested cwd;
2. executes `git -C <canonical-cwd> rev-parse --show-toplevel` with `execFile`, never a shell string;
3. canonicalizes the returned Git root;
4. uses that canonical root as the child-pool key.

Observed tests prove:

- nested directories resolve to their containing repository;
- an independently initialized nested Git repository wins over its outer repository;
- symlinked cwd aliases resolve to the same canonical key;
- directories outside Git fail explicitly with `NO_REPOSITORY`.

### Rooted CodeDB child

A real child is started as:

```text
codedb <canonical-repository-root> mcp
```

with:

```text
CODEDB_TOOLS_PROFILE=core
CODEDB_MCP_LEAN=1
CODEDB_NO_TELEMETRY=1
```

The child wrapper rejects any call whose argument object contains `project`, including attempts to switch to the same root. Repository selection belongs exclusively to the router.

Task 9 does **not** instantiate `McpServer`, register Code MCP tools, or modify tracked MCP composition. `server.mjs` is an internal composition boundary for Task 10 to consume later.

### Router call shape

Internal callers use:

```js
await router.call({
  cwd,
  tool: 'codedb_search',
  arguments: { query: '...' }
});
```

The result is:

```text
{ repoRoot: <canonical selected root>, result: <raw CodeDB MCP result> }
```

This is an internal API, not a model-facing schema.

## Lifecycle and capacity policy

The first policy is deliberately simple:

```text
pool key                  canonical Git repository root
maximum active/pending    4 repositories
same root                 reuse existing child
same-root concurrent open share one pending spawn
different roots           may spawn/run concurrently
fifth new root            ROUTER_CAPACITY; no eviction
LRU / idle eviction       not implemented
shutdown                   close all children
```

Capacity never evicts an existing repository implicitly. Requests to already-active roots continue to work while the pool is full.

Crash handling is bounded: if a CodeDB child is dead when a routed read-only CodeDB call fails, that child is removed, one replacement is started for the same canonical root, and the call is retried once. There is no retry loop.

Repository disappearance handling covers both forms tested here:

- the repository directory is removed;
- the directory remains but loses its Git repository identity (`.git` removed or the root no longer resolves to itself).

In either case the obsolete child is closed and its capacity slot is released. Shutdown is idempotent and rejects later work with `ROUTER_CLOSED`.

## Rooted watcher evidence through Pi Files semantics

The strongest acceptance used two independent normal (non-`/tmp`) Git repositories under external bridge state. Each repository was indexed once, then one rooted CodeDB child was started per repo. Ordinary CodeDB calls omitted `project` and no `codedb_read` refresh was used.

For **each** repository the sequence was:

1. `codedb_search` for the future marker returned 0 results;
2. create a new TypeScript file through the existing Pi Files `runWrite({ pathMode: 'user', defaultCwd: <repo> })` semantics;
3. poll rooted `codedb_search` at 250 ms intervals until the marker appeared;
4. modify the marker through guarded Pi Files `runEdit(...)` semantics;
5. poll until the new marker appeared and the old marker count reached 0;
6. search the other rooted child and prove the first repository's marker remained absent there.

Observed watcher convergence:

| Repository | Pi create -> searchable | Pi edit -> new searchable | old marker gone | Cross-repo count |
|---|---:|---:|---:|---:|
| A | 1,798 ms / 8 polls | 2,057 ms / 9 polls | 7 ms / 1 poll | 0 |
| B | 2,057 ms / 9 polls | 2,060 ms / 9 polls | 5 ms / 1 poll | 0 |

This is **ROOTED_WATCHER_PASS** for two independent repositories. The watcher, not an explicit refresh call, followed both Files mutations.

The disposable repositories were removed after the run. Raw benchmark measurements are retained outside Git at:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/code-router/task9-latest.json
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/code-router/task9-latency-samples.json
```

## Multi-repository and recovery evidence

Two cold repository requests issued concurrently created exactly two distinct rooted CodeDB MCP children. The pool reported two active roots and both child PIDs were alive.

A real crash/recovery probe then killed repository A's CodeDB MCP PID while repository B remained active. The next routed search for A:

- detected the dead A child;
- started a replacement rooted at A;
- returned A's current marker;
- changed A's PID;
- left B's PID unchanged.

Measured recovery to a successful routed search was **26.0 ms**. Active process count after recovery was exactly **2 CodeDB MCP child processes for 2 active repository roots**. After router shutdown, both known PIDs were dead.

## Runtime measurements

The benchmark used already-indexed tiny fixture repositories so child startup measures router/stdio-MCP startup rather than repository indexing. Indexing the final fixture pair took about 13–16 ms each.

| Measurement | Observed |
|---|---:|
| one-time router construction + binary verification | 14.0 ms |
| single cold child -> first `codedb_status`, 7 samples | median **30.3 ms**, mean 34.5 ms, range 24.9–52.2 ms |
| two cold roots concurrently -> both statuses, 5 samples | median **40.5 ms**, mean 46.3 ms, range 37.2–72.8 ms |
| warm routed `codedb_status`, 20 calls, mean | 5.90 ms |
| warm routed `codedb_status`, p50 | 5.63 ms |
| same child direct `codedb_status`, 20 calls, mean | 0.277 ms |
| measured router overhead, mean difference | **5.62 ms/call** |
| crash -> replacement + successful search | 26.0 ms |
| two-child shutdown | 2,002 ms |

The ~5–6 ms warm routing cost is dominated by canonical Git-root discovery (`git rev-parse`) on every call plus pool lookup. Task 9 intentionally does not add a cwd/root cache because the nearest nested Git root must remain authoritative and a stale cache could misroute a newly created nested repository. This overhead is small relative to watcher latency and most nontrivial CodeDB queries, but Task 10 should include it in facade-level measurements.

Shutdown uses the MCP SDK stdio transport's graceful close path. On this CodeDB build the transport consumed its approximately 2-second grace period before termination; all child processes were nevertheless confirmed dead afterward.

## Automated coverage

The focused package suite covers:

```text
canonical containing root
nearest nested Git root
symlink canonicalization
NO_REPOSITORY
same-root child reuse
separate children per repo
same-root pending-spawn deduplication
parallel different-root spawn
maximum-active capacity and no eviction
child crash replacement/retry
repository directory disappearance
Git-identity disappearance
clean shutdown
pinned CodeDB version/checksum
real rooted CodeDB child + project override rejection
two-repo rooted watcher create/edit freshness
real child kill/restart recovery
```

The real automated watcher test uses ordinary external file writes to keep `providers/code-router` tests self-contained. The separate acceptance above used the actual Pi Files `runWrite` and `runEdit` implementations, satisfying the Task-9 Files-mutation gate without adding a production dependency from the Code router to the Pi provider.

## Task-10 handoff

Task 9 qualifies the rooted child-process router only. It deliberately leaves these decisions open:

```text
code(operation, ...)
vs
code_search / code_context / code_symbol
vs
NO_CODE_FACADE
```

Task 10 should consume `createCodeRouter()` and benchmark a small facade against Pi-only navigation. It must not expose CodeDB's raw 10-tool catalog and must continue omitting `project` from rooted child calls.

---

# Small Model-Facing Code Facade — Task 10

**Date:** 2026-08-15
**Base:** `d010aafcb551bbd7cfe4774ef58165cfacb665a3`
**Scope:** Phase-2 Task 10 only: compare two small model-facing facades over the already-qualified rooted router, then retain only the winner
**Tokenizer:** `tiktoken 0.13.0`, `o200k_base`

## Verdict

```text
CODE_SMALL_EXPLICIT_FACADE
```

The winning model-facing Code surface is:

```text
code_search(query, cwd?, limit?)
code_context(task, cwd?, limit?)
code_symbol(name, cwd?)
```

The raw CodeDB catalog remains hidden. Repository selection still belongs exclusively to the Task-9 router: the facade supplies `cwd`, the router resolves the nearest canonical containing Git root, and the rooted child receives no `project` argument.

Candidate A and Candidate B were both correct on the controlled six-task corpus. Candidate A is slightly cheaper in always-visible schema, but its overloaded conditional schema admits obvious operation/field mismatches that Candidate B expresses as required fields at the MCP validation boundary. The total measured request+result traffic was effectively tied, so the explicit schema contract is worth Candidate B's small schema premium.

This is not a verdict that CodeDB should replace native Pi navigation. Pi/native `rg` remains the preferred path for exact literal lookup and immediate post-edit verification. The retained independent value is compact task-oriented code context, where one `code_context` call materially reduced model-visible output and follow-up calls.

## Candidate A — single facade schema

One visible Code tool:

```text
code(operation, query?, path?, symbol?, cwd?, limit?)
```

The measured MCP input contract was equivalent to:

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": ["search", "context", "symbol"]
    },
    "query": {
      "type": "string",
      "minLength": 1,
      "description": "search text, or task text when operation=context"
    },
    "path": {
      "type": "string",
      "minLength": 1,
      "description": "optional search path glob; only meaningful for operation=search"
    },
    "symbol": {
      "type": "string",
      "minLength": 1,
      "description": "required by the handler when operation=symbol"
    },
    "cwd": {
      "type": "string",
      "minLength": 1
    },
    "limit": {
      "type": "integer",
      "exclusiveMinimum": 0,
      "maximum": 4000
    }
  },
  "required": ["operation"]
}
```

Backend mapping during the benchmark:

```text
operation=search   -> codedb_search(query, scope=true, compact=true, max_results?, path_glob?)
operation=context  -> codedb_context(task=query, detail=compact, max_tokens?)
operation=symbol   -> codedb_symbol(name=symbol, body=false)
```

The weakness is visible in the schema itself: operation-specific requiredness cannot be expressed by this flat shape. `query`, `symbol`, `path`, and `limit` all remain visible together even when several are irrelevant to the chosen operation.

## Candidate B — small explicit facade schema

Three visible Code tools:

```text
code_search(query, cwd?, limit?)
code_context(task, cwd?, limit?)
code_symbol(name, cwd?)
```

Measured contracts:

```json
{
  "code_search": {
    "required": ["query"],
    "properties": {
      "query": { "type": "string", "minLength": 1 },
      "cwd": { "type": "string", "minLength": 1 },
      "limit": { "type": "integer", "exclusiveMinimum": 0, "maximum": 200 }
    }
  },
  "code_context": {
    "required": ["task"],
    "properties": {
      "task": { "type": "string", "minLength": 3 },
      "cwd": { "type": "string", "minLength": 1 },
      "limit": { "type": "integer", "minimum": 256, "maximum": 4000 }
    }
  },
  "code_symbol": {
    "required": ["name"],
    "properties": {
      "name": { "type": "string", "minLength": 1 },
      "cwd": { "type": "string", "minLength": 1 }
    }
  }
}
```

Production mapping:

```text
code_search  -> codedb_search(query, scope=true, compact=true, max_results?)
code_context -> codedb_context(task, detail=compact, max_tokens?)
code_symbol  -> codedb_symbol(name, body=false)
```

The production server returns CodeDB lean `TextContent` directly. It does not add JSON envelopes or `structuredContent`.

## Shared task corpus and correctness oracle

Both facade candidates and the corrected Pi-only baseline used the same six tasks. Ground truth was established independently with native repository inspection before scoring CodeDB results.

| Task | Correctness oracle |
|---|---|
| find implementation from a symptom/question | `search_codebase.ts` -> `handlers.ts` -> `search-request-coordinator.ts` -> `search-execution.ts` -> `search-result-finalization.ts` |
| locate exact symbol definition | `runSearchExecution` at `packages/mcp/src/core/search-execution.ts:966` |
| trace usage/caller relationship | production `finalizeSearchResults` use at `search-request-coordinator.ts:2282` plus definition at `search-result-finalization.ts:185` |
| gather bounded context for a change | coordinator, execution, finalization, and reranker-provenance context |
| investigate two repositories | `runSearchExecution` in `satori` plus `CodeRouter` boundary in this bridge repository |
| recover context after Files mutation | absent marker -> Pi `write` -> Code watcher observes -> Pi `edit` -> Code observes new marker and old marker disappears |

All three evaluated surfaces finished **6/6 correct** after benchmark defects were removed from the scoring harness.

## Candidate A vs Candidate B measurements

Schema was measured from MCP `tools/list` JSON using compact JSON serialization and `o200k_base`. The complete-catalog figures include the existing personal Pi tools (`read`, `edit`, `write`, `bash`) so the incremental Code cost is visible in context.

| Metric | Candidate A | Candidate B |
|---|---:|---:|
| Code tools added | **1** | **3** |
| complete visible tools with Pi | **5** | **7** |
| Code-only schema bytes | **1,087** | **1,534** |
| Code-only schema tokens | **233** | **343** |
| complete schema bytes | **3,324** | **3,771** |
| complete schema tokens | **730** | **840** |
| task calls | 32 | 32 |
| request tokens | 1,487 | **1,333** |
| result tokens | **4,960** | 5,116 |
| request + result tokens | **6,447** | 6,449 |
| complete schema + request + result | **7,177** | 7,289 |
| direct MCP call time, summed | 626 ms | **502 ms** |
| task wall time, summed | 4,671 ms | **4,552 ms** |
| follow-up-call debt | 21 | 21 |
| correctness | 6/6 | 6/6 |

Candidate A is only 112 tokens cheaper after paying one complete schema plus the full measured corpus. Candidate B saves 154 request tokens, and request+result cost is effectively identical: a two-token difference over the corpus.

### Operation/request-shape pressure

A deterministic schema-pressure probe submitted the analogous obvious wrong-field intent to each facade:

| Intent mistake | Candidate A | Candidate B |
|---|---|---|
| symbol intent supplies search-style field | schema accepts; handler returns `INVALID_ARGUMENT` | MCP `-32602` input validation rejects missing `name` |
| context intent supplies symbol-style field | schema accepts; handler returns `INVALID_ARGUMENT` | MCP `-32602` rejects missing `task` |
| search intent supplies symbol-style field | schema accepts; handler returns `INVALID_ARGUMENT` | MCP `-32602` rejects missing `query` |

So A admitted **3/3** obvious operation/field mismatches past schema validation; B admitted **0/3** of the analogous missing-required-field mistakes. This is the decisive facade-level difference because the measured traffic and correctness are otherwise tied.

No independent model operation-selection rate is claimed. Three attempts to obtain a separate model-selection sample were unavailable for benchmark-environment reasons: the Codex CLI workspace was out of credits; the installed Gemini individual client was no longer eligible; and a Pi/OpenAI-Codex selection-only run exceeded the local connector's call ceiling before a model result. These are classified as benchmark failures and are not scored against either facade or CodeDB.

The controlled corpus supplied `cwd`, so neither candidate needed to ask the user for repository location. Candidate A nevertheless advertises irrelevant `path` plus overloaded `query`/`symbol`/`limit` fields on every operation. Candidate B exposes only the fields needed for each intent. If no path inside a repository is known, both surfaces may still require one because the configured personal default cwd itself is outside a Git repository on this host; that is a frozen router boundary, not an A/B distinction.

## Pi-only versus retained Code value

The corrected Pi-only surface used the same personal primitives: native `bash`/`rg` plus bounded `read`, and the existing `write`/`edit` semantics for mutation.

Aggregate comparison:

| Metric | Pi-only | Candidate B + Pi |
|---|---:|---:|
| visible tools | **4** | 7 |
| schema tokens | **499** | 840 |
| task calls | **13** | 32 |
| request tokens | **654** | 1,333 |
| result tokens | **4,519** | 5,116 |
| request + result | **5,173** | 6,449 |
| direct MCP call time, summed | **107 ms** | 502 ms |
| task wall time, summed | **146 ms** | 4,552 ms |
| follow-up debt | **2** | 21 |
| correctness | 6/6 | 6/6 |

The aggregate is intentionally unfavorable to Code because the mutation task polls CodeDB watcher convergence while Pi can read the just-written file immediately. The retained decision therefore depends on task-level independent value rather than aggregate replacement.

| Task | Pi req+result / calls | Candidate B req+result / calls | Finding |
|---|---:|---:|---|
| implementation from symptom | 2,054 / 1 | **1,470 / 5** | Code reduces visible output but incurs recovery-call debt |
| exact symbol | **46 / 1** | 147 / 1 | native exact `rg` is better |
| usage relationship | 224 / 1 | **143 / 1** | Code modestly reduces visible text |
| bounded change context | 2,289 / 3 | **790 / 1** | strong independent Code value: 1,499-token reduction and two fewer calls |
| two repositories | **102 / 1** | 386 / 2 | native literals are better when both targets are already known |
| post-mutation freshness | **458 / 6** | 3,513 / 22 | Pi direct verification is decisively better than watcher polling |

Candidate B adds **341 complete-schema tokens** over Pi-only (`840 - 499`). A single bounded-context task saved **1,499 request+result tokens** and two follow-up calls versus the corrected Pi trace. That measured independent value is sufficient to retain a small Code facade; it is not sufficient to hide or replace Pi/native navigation.

Recommended usage boundary:

```text
known literal / exact file / immediate edit verification -> Pi bash/rg/read
known or guessed structured definition                  -> code_symbol
exploratory ranked text                                 -> code_search
first-touch bounded change orientation                  -> code_context
```

## Multi-repository production acceptance

The winning production `providers/code-router/server.mjs` was exercised over stdio against three explicitly indexed repositories at once:

1. a representative indexed application repository (`<code-repo>`);
2. the Task-10 `satori_bridge` worktree;
3. a disposable Git repository under external benchmark state.

Observed production catalog:

```text
code_search
code_context
code_symbol
```

Production calls proved:

- `code_symbol(runSearchExecution, cwd=satori)` found `search-execution.ts:966`;
- `code_search(CodeRouter, cwd=<bridge-worktree>)` found `providers/code-router/server.mjs`;
- `code_context(...)` recovered the requested execution/finalization change context;
- exactly **3** distinct CodeDB MCP child processes were active for the **3** selected canonical roots;
- no neutral CodeDB process or per-call `project` routing was used;
- after MCP client shutdown, **0** of those rooted child PIDs remained.

The Task-9 pool capacity remains **4 active or pending roots** with explicit `ROUTER_CAPACITY` at the fifth new root. This benchmark found no evidence requiring a higher limit, eviction, LRU, or cwd-root cache.

The production Code-only `tools/list` payload is structurally identical to Candidate B's benchmark schema: **1,534 bytes**. Compact serialization of the production key order measured **345 `o200k_base` tokens**; the apples-to-apples A/B benchmark serialization measured the same structure at 343 tokens. The two-token difference is serialization order, not a schema difference.

## Post-mutation production freshness

The production facade was tested with the actual Pi MCP Files semantics, not direct filesystem writes:

1. `code_search` proved the future marker absent;
2. Pi `write` created a new TypeScript file;
3. rooted `code_search` polled at 250 ms until the watcher saw it;
4. Pi guarded `edit` changed the marker;
5. rooted `code_search` observed the new marker;
6. the next old-marker check returned zero;
7. no `codedb_read` or explicit CodeDB refresh was used.

Observed on the final production run:

| Event | Result |
|---|---:|
| before write | 0 results |
| Pi write -> rooted Code searchable | **2,055 ms / 9 polls** |
| Pi edit -> new marker searchable | **2,048 ms / 9 polls** |
| old marker gone | **8 ms / 1 poll** |
| rooted CodeDB children before close | 3 |
| matching rooted children after close | **0** |

This preserves the Task-9 watcher invariant through the winning model-facing facade.

## Failure classification ledger

Failures were classified before being used as evidence against CodeDB:

| Event | Classification | Disposition |
|---|---|---|
| prototype closed router immediately after `server.connect()` | `adapter/facade` | fixed prototype lifecycle before scoring |
| Codex selection probe had no credits | `benchmark` | not scored |
| single-file Pi `rg` omitted filename and tripped a filename-based oracle | `benchmark` | corrected oracle to content evidence |
| second repository had not been explicitly indexed before a symbol probe | `benchmark` | indexed root before scoring |
| `.mjs` `CodeRouter` absent from `codedb_symbol` but present in rooted `codedb_search` | `candidate` | recorded symbol-language coverage limitation; used search for that task |
| Gemini individual client no longer eligible | `benchmark` | not scored |
| Pi/OpenAI-Codex selection probe exceeded connector call ceiling | `benchmark` | not scored |
| `codedb_context` did not recover the complete front-to-back implementation chain alone | `candidate` | counted additional recovery calls as follow-up debt |
| first production stdio facade left rooted children alive after client close | `adapter/facade` | systematic debugging found stdin-EOF lifecycle gap; fixed and regression-tested |

The stdio lifecycle root cause was in the facade wrapper: the MCP SDK's `StdioServerTransport` listens to stdin data/errors but does not convert stdin EOF into `transport.onclose`. The client therefore waited for its close grace period and signalled the process before router shutdown had run. The production runtime now funnels stdin EOF, `SIGTERM`, `SIGINT`, and transport close into one idempotent shutdown promise that awaits router child cleanup. A real rooted-child regression and the three-root production rerun both pass.

## Personal profile integration

Only the private `personal` composition gained the qualified Code provider:

```text
personal     -> dev + code
restricted   -> dev + shell   (unchanged)
trusted-dev  -> dev           (unchanged)
```

The personal renderer sets `MCP_CODE_DEFAULT_CWD` from the existing absolute personal default cwd. `scripts/smoke-local.sh` validates the private provider command/path, exact MCP SDK and Zod package pins, installed SDK version, and the absence of raw `codedb` composition.

No live bridge process was restarted and no live Actions Refresh was performed in this branch. The public `scripts/setup.sh` remains public-profile-only and was deliberately not broadened to install private Code dependencies. Before a personal live refresh, install this provider's pinned local dependencies with:

```bash
npm --prefix providers/code-router ci --omit=dev
```

Then the coordinator can render/select the personal profile and perform Actions Refresh from outside the bridge process that owns the live session.

## Raw evidence location

Benchmark artifacts are intentionally outside Git:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/code-router/task10/direct-raw.json
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/code-router/task10/direct-metrics.json
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/code-router/task10/schema-pressure.json
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/code-router/task10/production-raw.json
```
