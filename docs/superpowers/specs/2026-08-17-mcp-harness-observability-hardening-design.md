# MCP Harness Observability Hardening Design

## Goal

Make the WSL development harness harder to misuse when ChatGPT-side output presentation is ambiguous, while fixing two concrete runtime weaknesses discovered in the live logs: a Terminal broker crash on reset client sockets and unbounded retained Bash spool files.

## Scope

Keep the existing public MCP catalog unchanged. Improve only:

1. `mcp-harness-router` operating semantics around authority, observability, health checks, Terminal reads, waits, and hard stops.
2. Terminal broker resilience to accepted-client socket errors such as `ECONNRESET`.
3. Pi Dev Bash retained-output storage so a runaway command cannot consume unbounded disk.

Do not add a new health tool, audit database, logging service, orchestration layer, or model worker.

## Evidence

The live WSL investigation established:

- the canonical repository path is visible and healthy through `mcp-harness-local`;
- `pi-dev` and Terminal providers return native MCP text/error results and do not contain UI-level `Skipped`/`redacted` placeholder generation;
- retained QAP Terminal sessions show several visibility probes actually executed inside WSL even when the session later described output as opaque;
- the Terminal broker journal recorded an unhandled `ECONNRESET` on an accepted socket, after which systemd restarted the broker;
- one retained Pi Dev Bash spool file exceeded 1.2 GB because `runBash()` writes the entire command stream to disk whenever the model-facing tail is truncated;
- Terminal transcripts and wait records are durable, while normal non-truncated `dev_bash` calls intentionally do not retain a durable spool log.

Therefore `unobservable presentation`, `provider/tool failure`, `WSL process failure`, and `repository failure` must remain distinct states.

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

## Testing

Use test-first changes:

1. Terminal regression reproduces a connection reset/abrupt client failure and proves the broker survives and serves a later request.
2. Pi Dev shell test emits output larger than a deliberately small retained-spool cap and proves:
   - process completes;
   - `output_bytes` reflects total output;
   - model tail remains bounded;
   - spool file size never exceeds the retained cap;
   - result marks retained-spool truncation.
3. Renderer test proves the new retained-spool annotation is concise and unambiguous.
4. Existing provider suites and documentation-link checks remain green, except for any already-demonstrated unrelated timing flake which must be reported rather than hidden.

## Non-goals

- No new public MCP tool.
- No durable per-invocation audit log for every Dev call.
- No change to Terminal transcript/model-cursor semantics.
- No change to human ownership/lease behavior.
- No change to wait semantics.
- No change to CodeDB routing.
- No public-web discovery of internal tools.
