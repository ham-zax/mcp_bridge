# MCP Harness Observability Hardening Design

## Goal

Make the WSL development harness harder to misuse when ChatGPT-side output presentation is ambiguous, while fixing the concrete runtime/storage weaknesses discovered in live evidence: Terminal broker crashes on reset client sockets, unbounded retained Bash spool state, and unbounded 1MCP console logging. Keep repository-writer ownership explicit during long-lived agent missions.

## Scope

Keep the existing public MCP catalog unchanged. Improve only:

1. `mcp-harness-router` operating semantics around authority, observability, health checks, Terminal reads, waits, and hard stops.
2. Terminal broker resilience to accepted-client socket errors such as `ECONNRESET`.
3. Pi Dev Bash retained-output storage so a runaway command and accumulated historical spools cannot consume unbounded disk.
4. 1MCP application logging so the bridge uses the pinned runtime's native bounded rotation instead of shell append logging.
5. Read-only operator diagnostics for retained state, live/rendered source identity, and personal Terminal broker restart state.
6. `persistent-agent-loop` repository-writer semantics so PTY ownership is not confused with Git/worktree ownership.

Do not add a new public health tool, audit database, logging service, orchestration layer, scheduler, or model worker.

## Evidence

The live WSL investigation established:

- the canonical repository path is visible and healthy through `mcp-harness-local`;
- `pi-dev` and Terminal providers return native MCP text/error results and do not contain UI-level `Skipped`/`redacted` placeholder generation;
- retained QAP Terminal sessions show several visibility probes actually executed inside WSL even when the session later described output as opaque;
- the Terminal broker journal recorded an unhandled `ECONNRESET` on an accepted socket, after which systemd restarted the broker;
- one retained Pi Dev Bash spool file exceeded 1.2 GB because `runBash()` wrote the entire command stream to disk whenever the model-facing tail was truncated;
- the legacy runtime `one-mcp.log` had grown past 50 MB through unbounded shell append redirection; the pinned 1MCP 0.34.4 runtime exposes structured `logging.maxSize`/`logging.maxFiles` backed by Winston file rotation;
- Terminal broker systemd state later reported `NRestarts=1`, consistent with the observed reset crash;
- Terminal transcripts and wait records are durable, while normal non-truncated `dev_bash` calls intentionally do not retain a durable spool log.

Therefore `presentation ambiguity`, `MCP/proxy transport`, `WSL process/filesystem`, and `repository state` must remain distinct layers. A generic proxy/status string cannot override a concrete harness invocation, and a successful MCP transport response cannot by itself prove a shell/process exit succeeded.

## Router Semantics

The router remains a routing/control-plane skill, not a Git/process methodology document.

Add these rules:

- WSL repository facts come from `mcp-harness-local`; ChatGPT container/Python/Files/public web are not substitutes for the connected WSL filesystem.
- Treat opaque/hidden presentation as `UNOBSERVABLE`, not as success or failure.
- On observability uncertainty, perform one bounded canonical WSL health probe using `dev_1mcp_bash`; do not invent image/file/base64/HTTP/alternate-filesystem visibility probes.
- Load concrete MCP schemas once per session/profile and reuse them. Never public-web-search internal MCP tool names.
- `terminal_list` is for initial session identity/ownership resolution, explicit ownership handoff, or unexpected lifecycle changes; do not repeatedly relist stable sessions.
- Normal `terminal_read(name)` consumes unread transcript state. `snapshot=true` inspects current screen without consuming transcript state. Explicit cursors are recovery/replay controls only.
- Use `dev_1mcp_wait` for output/exit/readiness/file/timer conditions rather than Bash sleep/poll loops.
- A hard stop requires authoritative evidence: persistent concrete MCP/provider error, required WSL access/permission failure, human ownership blocking required mutation, unrecoverable repository state, or a protected decision requiring the user. Presentation awkwardness alone is not a hard stop.
- Do not claim `verified`, `green`, or `committed` from hidden/inferred evidence. Obtain a compact observable WSL summary first.

The canonical health probe should report at least:

```text
cwd=<pwd>
repo=<git rev-parse --show-toplevel>
head=<short HEAD>
branch=<current branch>
dirty_count=<porcelain line count>
health_exit=0
```

## Terminal Broker Resilience

Root cause: `net.createServer()` accepts a client socket, attaches a `data` handler, but does not attach an `error` handler. A reset peer can emit an unhandled socket `error` event and terminate the broker process.

Fix at the connection boundary:

- attach a socket-level error handler immediately for each accepted connection;
- treat peer transport errors as scoped to that connection;
- destroy/close that connection without terminating the broker;
- preserve normal request ordering and protocol responses for healthy clients;
- do not introduce global retry behavior in the broker.

Acceptance: an accepted client socket `error` event such as `ECONNRESET` is contained to that connection rather than becoming an unhandled process error; the existing broker integration suite must continue serving normal requests.

## Pi Dev Bash Spool Bounding

Keep model-facing semantics unchanged: the returned output remains a bounded UTF-8 tail, `output_bytes` remains the total observed output byte count, and `truncated` still means output exceeded the model-facing limit.

Change retained full-output behavior:

- introduce an internal retained-spool byte cap derived from configuration, not a public MCP argument;
- default the cap conservatively above the model-facing tail while preventing multi-gigabyte state growth;
- retain command bytes only up to the cap;
- continue counting all observed bytes even after spool retention stops;
- return whether the retained spool itself was capped;
- render an explicit annotation when a full-output handle contains only the retained prefix/capped artifact rather than the entire command stream.

No command should be killed merely because it exceeds the retained-spool cap; this feature bounds diagnostic storage, not process output.

### Aggregate lifecycle and crash recovery

Retained storage is bounded with three independent controls: a per-file cap (64 MiB default, 256 MiB maximum), a TTL (7 days default), and an aggregate finalized-spool budget (512 MiB default). `runBash()` writes to a private `.log.active` name and only finalizes a retained artifact after the command settles. GC ignores live active files, removes active files whose owner is dead or whose identity predates the maximum command lifetime, caps legacy oversized files, removes expired finalized files, and evicts oldest finalized files until the aggregate budget is met. Startup and every Bash command opportunistically run GC; no timer or cleanup daemon is added.

The retained path for the command currently returning is protected during its own GC pass so the function does not return a path it just evicted. GC failure is diagnostic-only and must not turn a successfully executed Bash command into an execution failure.

## 1MCP Native Log Rotation

The generated external 1MCP state includes `1mcp/config.toml` with a structured `[logging]` block. The log is stored under the private bridge state `logs/` directory. Defaults are 10 MiB per file and 5 files; deployment policy constrains size to 1..64 MiB and file count to 1..10. The pinned runtime installer verifies that 1MCP still resolves `maxSize`/`maxFiles` and passes them to Winston before the bridge relies on this behavior.

A fresh 1MCP launch suppresses the duplicate console stream instead of appending it to an unbounded runtime file, uses `umask 077`, and removes the legacy runtime `one-mcp.log`. If startup health fails, lifecycle code prints only a bounded tail from the native application log when available. Existing deployments must re-render/bootstrap so `config.toml` exists before the hardened smoke gate is expected to pass.

## Repository Writer Ownership

Terminal model/human ownership is a PTY-input contract, not a Git writer contract. Persistent repository missions allow one writable autonomous process per Git worktree. Concurrent read-only reviewers are allowed. Concurrent writable delegates require separate worktrees/branches from the same verified base, disjoint ownership, independent verification, and central integration. Delegates do not merge/rebase/reset/switch shared branches unless explicitly assigned that integration mutation.

## Operator Diagnostics and Cleanup

`bin/status` remains read-only. It reports rendered live source root separately from the checkout running diagnostics, matches watchdog ownership against the rendered root, reports native 1MCP log bytes versus policy, finalized/active Bash spool bytes and oldest age, flags the obsolete unbounded console log, and in personal mode reports the Terminal broker socket plus `ActiveState`/`NRestarts` when the user-systemd bus is directly reachable. Missing user-bus visibility is not treated as proof the broker is down.

Historical oversized Bash spools are migrated by the same startup GC and the legacy console log is removed on a fresh 1MCP launch. No one-off destructive migration tool is required. Live cleanup therefore occurs during an explicitly authorized re-render/restart rollout, not while merely reviewing the branch.

## Testing

Use test-first changes:

1. Terminal regression reproduces a connection reset/abrupt client failure and proves the broker survives and serves a later request.
2. Pi Dev shell test emits output larger than a deliberately small retained-spool cap and proves:
   - process completes;
   - `output_bytes` reflects total output;
   - model tail remains bounded;
   - spool file size never exceeds the retained cap;
   - result marks retained-spool truncation.
3. Aggregate-spool tests cover TTL expiry, legacy per-file truncation, aggregate eviction, concurrent commands, dead/reused active-owner cleanup, ordinary-command opportunistic GC, and protection of the currently returned retained path.
4. 1MCP renderer/lifecycle tests prove `config.toml` is generated with bounded policy, invalid policy is rejected, shell append logging is absent, and the pinned runtime capability is guarded; a direct installed-runtime exercise verifies actual size rotation.
5. Status tests cover retained-state summaries and rendered-source-root watchdog matching.
6. Skill publication checks enforce the four-layer router model, single-writer persistent-loop contract, canonical `agent-work-planner` name, and byte-accurate Skill snapshot manifest.
7. Existing provider suites and documentation-link checks remain green, except for any demonstrated unrelated timing flake which must be isolated and reported rather than hidden.

## Non-goals

- No new public MCP tool.
- No durable per-invocation audit log for every Dev call.
- No change to Terminal transcript/model-cursor semantics.
- No change to human ownership/lease behavior.
- No change to wait semantics.
- No change to CodeDB routing.
- No public-web discovery of internal tools.
