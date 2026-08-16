# Terminal MCP + Exact-PTY Human Takeover Design

**Status:** Approved by the Task-7 mission

## Goal

Expose the already-qualified `wsl-agent` tmux/broker Terminal core as a private personal MCP domain with exactly six model-facing tools, plus an exact-PTY human attach CLI. Preserve tmux as the PTY/process lifetime authority, transcript/cursor guarantees from Task 6/6.6, and public profile isolation.

## Frozen decisions and scope

- Backend: `TMUX_BROKER_WINS`.
- Herdr is not a production dependency and no Herdr/tmux hybrid is permitted.
- Task 6.6 retained-dead-pane reconciliation remains authoritative.
- Task 8 await/resume is out of scope.
- Code facade architecture is out of scope.
- Model-facing tools are exactly:
  - `terminal_open`
  - `terminal_read`
  - `terminal_send`
  - `terminal_resize`
  - `terminal_list`
  - `terminal_close`
- Broker-internal lease operations and raw tmux operations are private implementation details and must never be MCP tools.

## Architecture

```text
ChatGPT / 1MCP
    |
    v
providers/terminal/mcp-server.mjs
    |
    v
providers/terminal/broker-client.mjs
    |
    v
$XDG_RUNTIME_DIR/wsl-agent-terminal.sock
    |
    v
providers/terminal/broker.mjs
    |
    +--> persistent model cursor state
    +--> authoritative human lease policy
    +--> transcript read/recovery
    |
    v
 tmux -N -L wsl-agent
    |
    v
 exact PTY/process lifetime
```

Human control is separate from MCP:

```text
bin/wsl-term -> providers/terminal/cli.mjs
    |
    +--> private broker lease acquire/bind/release
    |
    +--> tmux -N -L wsl-agent attach-session -t <session>
```

`wsl-term` attaches directly to the exact existing tmux session. It does not proxy keystrokes through Node and therefore does not create an auxiliary input/password log.

## Model-facing tool contracts

### `terminal_open`

Inputs:

```text
name: string, required
command?: string
cwd?: string
cols?: positive integer <= 1000
rows?: positive integer <= 1000
```

Defaults:

```text
cwd=/home/hamza
command=<interactive user shell>
cols=80
rows=24
```

An omitted/empty command keeps the existing pane-entry behavior: exec `$SHELL` (fallback `/bin/bash`) directly after the first-byte startup gate is opened.

### `terminal_read`

Inputs:

```text
name: string, required
cursor?: non-negative integer
snapshot?: boolean
```

Normal `terminal_read(name)` uses a broker-owned per-session model cursor and returns only unread transcript bytes. The broker advances the stored cursor only after a successful transcript read.

An explicit `cursor` is a recovery/resynchronization control. A successful explicit read updates the broker-owned model cursor to the returned `nextCursor`; it never silently substitutes another logical offset.

`CURSOR_EXPIRED` and `CURSOR_AHEAD` remain explicit errors. `CURSOR_EXPIRED` may include the existing bounded recovery tail from the transcript layer. UTF-8 alignment and monotonic logical offsets remain unchanged.

`snapshot=true` uses current-screen tmux capture for TUI/debugger recovery. It does not consume or alter the transcript model cursor.

The model cursor is persisted under the existing private Terminal session state directory so a broker restart does not reinterpret unread/read boundaries.

### `terminal_send`

Inputs require exactly one of:

```text
text: string
key: enum
```

Recognized keys include at minimum:

```text
ENTER
CTRL_C
CTRL_D
CTRL_Z
ESC
TAB
BACKSPACE
UP
DOWN
LEFT
RIGHT
```

The MCP schema rejects text+key together and rejects neither-present calls. The MCP server maps public key names to a fixed internal tmux key token; arbitrary raw tmux key syntax is never exposed.

### `terminal_resize`

Inputs:

```text
name
cols
rows
```

Uses the existing broker/tmux resize contract and retains the <=1000 bounds.

### `terminal_list`

No inputs. Returns concise native text describing sessions, including live/dead state, exact dead exit status when present, dimensions, attachment state, and human-control state.

### `terminal_close`

Inputs:

```text
name
force?: boolean
```

Normal close is blocked by an active human lease. `force=true` is an explicit override consistent with the canonical Task-7 plan; it is not implicit and does not expose raw tmux control.

## Native MCP results

Every Terminal tool returns standard MCP `TextContent` blocks rather than JSON encoded inside a text string. Terminal output itself is emitted as text. Administrative tools render concise text summaries. Errors use MCP error results with stable Terminal error codes/messages such as `HUMAN_HAS_CONTROL`, `CURSOR_EXPIRED`, and `CURSOR_AHEAD`.

## Broker-owned model cursor

Each session has a private model-cursor record under its existing state directory. The record contains only cursor metadata, not input. Writes are atomic and mode `0600`.

Rules:

1. Opening a new session initializes its model cursor at logical offset 0.
2. Normal model reads start from the stored cursor.
3. Successful reads atomically advance to `nextCursor`.
4. Empty reads leave the same offset.
5. Explicit recovery reads move the stored cursor only to the exact returned `nextCursor`.
6. `CURSOR_EXPIRED`/`CURSOR_AHEAD` do not silently rewrite the model cursor.
7. Snapshot reads never modify it.
8. Broker restart reloads the persisted cursor.
9. Dead retained panes keep their final transcript and cursor behavior unchanged.

This is deliberately below the MCP facade so alternate model-facing clients cannot accidentally reintroduce duplicate normal reads.

## Human lease contract

The broker remains the authorization point for model mutation operations.

Without a human lease:

```text
read    allowed
list    allowed
send    allowed
resize  allowed
close   allowed
```

With a live human lease:

```text
read             allowed
list             allowed
send             HUMAN_HAS_CONTROL
resize           HUMAN_HAS_CONTROL
close(force=false) HUMAN_HAS_CONTROL
close(force=true)  allowed explicit override
```

The broker checks the lease before `session.send`, `session.resize`, and ordinary `session.close`. This is required even if the MCP wrapper validates correctly, because alternate broker API write paths must not bypass human ownership.

### Lease lifecycle and stale reconciliation

A lease has private metadata such as:

```text
leaseId
session name
clientId
acquiredAt
bound tmux client PID (once spawned)
client-observed flag
```

Attach flow:

1. `wsl-term attach <session>` asks the broker for a private human lease.
2. The CLI spawns `tmux -N -L wsl-agent attach-session -t <session>` attached to the caller's real TTY.
3. The CLI immediately binds the spawned tmux client PID to the lease through a private broker operation.
4. Broker reconciliation compares the bound PID/session with `tmux list-clients`.
5. Once that client has been observed, disappearance means the lease is stale and is released.
6. A short bounded startup grace handles the acquire->tmux-connect race. An unbound/never-observed lease that exceeds the grace is also discarded.
7. On normal tmux detach/exit, the CLI requests lease release in `finally`-style cleanup.

Lease reconciliation runs before lease-sensitive mutations and before reporting lease state so a crashed attach wrapper cannot permanently block model control.

No human key data is sent through the lease protocol. The broker stores only ownership metadata.

## `wsl-term` contract

```text
wsl-term list
wsl-term attach <session>
```

`list` obtains session state from the broker.

`attach` requires a real TTY, acquires the human lease, and attaches to the exact existing `wsl-agent` tmux session with `-N` so the CLI never auto-starts or owns the tmux server. Normal detach restores model mutation rights. Crash/stale cases are recovered by broker-vs-tmux client reconciliation.

The CLI does not separately read, mirror, or log stdin. A password entered at a sudo prompt goes directly from the user's terminal to tmux/PTY and is not copied into broker state or an auxiliary input log.

## Personal-only composition

`config/templates/mcp-personal.json` gains one `terminal` provider invoking `providers/terminal/mcp-server.mjs`. Restricted and trusted-dev templates remain unchanged.

The personal renderer derives `__TERMINAL_SOCKET__` from `XDG_RUNTIME_DIR`, falling back to `/run/user/<uid>`, and renders only the socket path plus the bounded read limit into the private Terminal provider environment.

Expected personal provider set becomes:

```text
code
dev
terminal
```

Public profiles remain exactly:

```text
restricted: dev + shell
trusted-dev: dev
```

Publication exclusions continue to classify Terminal provider code, Terminal service assets, `bin/wsl-term`, and personal configuration as private-only.

## Dependency and deployment contract

The Terminal MCP provider pins the same MCP SDK/Zod versions already qualified by the local providers:

```text
@modelcontextprotocol/sdk 1.30.0
zod 4.4.3
```

Dependency installation must remain in a private Terminal deployment path rather than introducing a public-release dependency on private Terminal files.

No Task-7 test or activation step may restart a bridge from inside a process owned by that same bridge. Local provider/composition tests must complete before any external refresh. If user-facing Actions Refresh is required, the branch stops with explicit coordinator activation steps instead of pretending to perform it.

## Acceptance strategy

Use TDD. Required local evidence includes:

- exactly six MCP tools and no private lease/raw-tmux tools;
- native `TextContent` results;
- zero-duplicate normal reads and persisted cursor semantics;
- explicit `CURSOR_EXPIRED` and `CURSOR_AHEAD` retention;
- recognized text/key sends and schema rejection of invalid combinations;
- resize and exact non-zero dead status;
- Task-6.6 mixed live/dead restart regression;
- broker restart preserving tmux/PTY and model cursor semantics;
- human attach blocking send/resize/ordinary close while reads/list remain allowed;
- stale lease recovery based on real tmux clients;
- detach restoring writes;
- immediate-first-byte gate unchanged;
- stopping `wsl-agent-tmux.service` still ending the lifetime boundary;
- Terminal, Pi, Code-router, harness, publication, lifecycle, syntax, and `git diff --check` gates.

Real ChatGPT-path acceptance is recorded separately and is `COMPLETE` only if the environment safely supports external deployment plus user-facing refresh in this mission. Otherwise it remains `PENDING` with exact activation steps.