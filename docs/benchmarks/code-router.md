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
