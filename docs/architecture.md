# Architecture

## Runtime path

```text
ChatGPT
  -> HTTPS + OAuth
Cloudflare Tunnel
  -> loopback origin
1MCP :3050
  -> Dev
  -> Code       (personal only)
  -> Terminal   (personal only)
  -> Local      (personal only, tag:browser)
       -> private inner 1MCP -> Browser
Linux / WSL host
```

1MCP is the single public MCP gateway. Cloudflare supplies the public HTTPS transport; providers remain local stdio processes.

An optional WebSession adapter runs separately on loopback `:3051` for constrained non-MCP clients. Cloudflare may route only `/probe/*` and `/v1/*` to it while `/mcp`, OAuth, and discovery remain on 1MCP `:3050`. The adapter exposes a universal readable-GET facade plus a preferred bearer-authenticated JSON POST facade; both normalize into the same SQLite-backed durable operation core with nonce idempotency, explicit capability revocation, operation-scoped read continuations, immutable bounded text chunks, and universal-GET proof-of-read confirmation. The adapter authenticates back to the existing public 1MCP gateway with its own persisted authorization-code/PKCE credential and never bypasses 1MCP to reach providers directly. WebSession does not define a second tool-permission model: OAuth scope is resolved from live 1MCP metadata (currently `tag:code tag:dev tag:terminal`, matching main), discovery mirrors the live 1MCP tool descriptors, and calls use the exact upstream tool names and arguments.

WebSession is not part of the normal bridge lifecycle: `bin/start`, `bin/stop`, `bin/status`, the watchdog, and `mcp-dev-bridge.service` continue to own only the existing 1MCP path. The adapter is authorized with `bin/adapter auth` and started explicitly with `bin/adapter start`; public adapter ingress is configured separately and never replaces `/mcp`.

## Capability boundaries

### Dev

Dev owns Files, native Bash, regular-file topology operations, durable waits, and the personal Windows-host sleep boundary.

Personal surface:

```text
read edit write file_ops wait bash pc_sleep
```

`edit` owns guarded exact mutation of existing text across one or more files; callers inspect with `read`, `rg`, Code, or ast-grep and widen `oldText` until unique when needed. `write` owns new text-file creation, and `file_ops` owns move/delete for existing regular files. Syntax-shaped discovery/codemods use ast-grep through Bash and normally feed guarded `edit`; an existing authoritative `.patch`/`.diff` artifact uses native `git apply --check -- "$patch" && git apply -- "$patch"`.

`wait` owns durable named wait state and generic local readiness checks. Terminal-specific waits use private broker transcript/session observations, but `wait` is not a Terminal MCP action.

`pc_sleep` is personal-only. It requires explicit confirmation, optionally registers one replaceable Windows Task Scheduler `WakeToRun` task, returns an acknowledgement, and then asks Windows to enter sleep after a short grace period. It does not provide on-demand wake while the host is already asleep.

### Code

Code owns:

```text
code_search code_context code_symbol
```

The router resolves the nearest canonical Git root for the requested cwd and keeps one correctly rooted CodeDB child per active repository. Per-call project switching and the raw CodeDB catalog are hidden from the model-facing surface. First use may start a persistent CodeDB child and create or update substantial on-disk index state, so Code is not a cost-free read abstraction; on large or unfamiliar repositories with unknown CodeDB state, start with Dev Bash/`rg` plus focused `read` unless indexing-backed repository intelligence is specifically needed. This is model-routing guidance, not an enforced size threshold.

### Terminal

Terminal owns exactly seven actions:

```text
terminal_open terminal_read terminal_send terminal_resize terminal_list terminal_yield terminal_close
```

tmux is the PTY/process lifetime authority. A separate broker owns session metadata, transcripts, model cursors, generation identity, and human/model control leases. Each live pane streams transcript bytes through `pipe-pane`; when a retained pane dies, a pane-local finalizer closes that pipe with real EOF and restores the same dead pane state so the transcript writer exits instead of remaining attached for the lifetime of the retained session. A personal frontend helper owns presentation only: it may launch Kitty under WSLg or Windows Terminal through WSL re-entry, and either path attaches to the exact existing tmux session through `wsl-term present`. MCP owns the agent interface, broker owns authority, tmux owns lifetime, and the frontend never becomes a process-lifetime owner.

## Durable Terminal data flow

```text
Terminal MCP -> Unix socket -> broker -> tmux pane / transcript
      |                  |
      |                  +-> generation + model cursor + human lease
      |
      +-> frontend.mjs
            |-> Kitty / WSLg -> wsl-term present -> exact tmux PTY
            `-> Windows Terminal / wsl.exe
                     `-> wsl-term present -> same tmux PTY

Dev wait -> private broker observation -> independent wait cursor
```

Normal Terminal reads and output waits therefore do not consume each other's cursor. The GUI path is presentation only: normal Terminal sessions remain headless by default, and a designated read-only frontend keeps model mutation/resize authority until control is explicitly yielded to the human.

## State boundaries

By default:

```text
bridge persistent state  ${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge
bridge runtime state     ${XDG_RUNTIME_DIR:-/run/user/$UID}/mcp-dev-bridge
Terminal state           ${XDG_STATE_HOME:-$HOME/.local/state}/wsl-agent-terminal
Terminal broker socket   ${XDG_RUNTIME_DIR:-/run/user/$UID}/wsl-agent-terminal.sock
```

1MCP receives one external writable application root because its config, PID, and OAuth/session data live together beneath that root.

## Lifecycle boundaries

The bridge supervises one config-scoped 1MCP process, one cloudflared process, and one watchdog. Lifecycle operations use an exclusive lock and validated process ownership.

The optional WebSession adapter has independent manual lifetime. `bin/adapter start|stop|status` owns only that process; `bin/adapter auth|auth-status` owns its separate 1MCP OAuth credential and `bin/adapter issue-cap` is an explicit operator capability-issuance action. Normal bridge startup and user-systemd startup do not enable the adapter.

Personal Terminal lifetime is split into two user services:

```text
wsl-agent-tmux.service             PTY/process lifetime
wsl-agent-terminal-broker.service  broker/transcript/control state
```

Restart the broker without restarting tmux when only broker/provider code changes.

### Local tool broker

Personal Browser capability is model-facing through one `local` provider under `tag:browser`. It exposes exactly:

```text
tool_list tool_schema tool_call
```

The Local broker owns stable logical `{server, tool}` routing and connects over stdio to a private inner 1MCP running in normal direct mode. V1 keeps no broker catalog/schema cache: discovery and schema lookup consult current inner `tools/list`, while `tool_call` dispatches the qualified inner tool directly and returns the downstream `CallToolResult` unchanged. Discovery is bounded with an opaque self-contained cursor; downstream catalog churn does not change the outer three-tool surface.

### Browser

Browser remains the private resource-local execution owner behind Local. The private inner 1MCP publishes the Browser facade as logical server `browser`; the facade exposes the complete Chrome DevTools MCP catalog internally and dispatches each call to the child selected by `browser_target`:

```text
Local tool_call(server="browser", ...)
  -> private inner 1MCP direct
  -> browser facade
       +-- windows (default) -> Windows cmd/npx -> normal native Windows Chrome profile
       `-- linux             -> Linux npx -> managed visible Chrome through WSLg
```

The facade inherits the WSLg display/runtime environment needed by its Linux child. Its Windows child uses `%LOCALAPPDATA%\\Google\\Chrome\\User Data` so normal-profile discovery remains username-independent in tracked source. It still returns downstream `CallToolResult` objects unchanged, so screenshots remain native image content rather than wrapper JSON/text.

## Trust/profile separation

Public `restricted` and `trusted-dev` configurations do not gain private Code, Terminal, Local/Browser, `wait`, or personal Terminal-socket dependencies. The private `personal` profile is an explicit separate composition.
