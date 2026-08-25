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
  -> Local      (personal only, tag:local)
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

`edit` owns guarded mutation of existing text across one or more files. One exact `oldText` match always wins; only zero exact matches trigger tolerance for line endings, trailing whitespace, and common Unicode punctuation or space differences, and the fallback must still be unique. Exact and tolerant edits sharing a line must be merged. Callers inspect with `read`, `rg`, Code, or ast-grep and include enough context when needed. `write` owns new text-file creation, and `file_ops` owns move/delete for existing regular files. Syntax-shaped discovery/codemods use ast-grep through Bash and normally feed guarded `edit`; an existing authoritative `.patch`/`.diff` artifact uses native `git apply --check -- "$patch" && git apply -- "$patch"`.

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

Personal local capabilities are model-facing through one `local` provider under `tag:local`. Browser capabilities are private logical servers behind it. The provider exposes exactly:

```text
tool_list tool_schema tool_call
```

The Local broker owns stable logical `{server, tool}` routing and connects over stdio to a private inner 1MCP running in normal direct mode. V1 keeps no broker catalog/schema cache: discovery and schema lookup consult current inner `tools/list`, while `tool_call` dispatches the qualified inner tool directly and returns the downstream `CallToolResult` unchanged. Discovery is bounded with an opaque self-contained cursor; downstream catalog churn does not change the outer three-tool surface.

### Browser

The private inner 1MCP currently publishes two browser surfaces in the same `tag:local` trust domain:

```text
Local
  +-- server="browser"      -> Chrome DevTools MCP facade
  |    +-- windows (default) -> dedicated persistent MCP Chrome profile
  |    `-- linux             -> managed visible Chrome through WSLg
  `-- server="browser-fast" -> compact observe/execute facade
       +-- windows (default) -> pinned native Agent Browser 0.35.0 -> same MCP Chrome profile
       `-- linux             -> pinned Agent Browser 0.35.0 batch -> WSLg Chrome
```

`browser` keeps the complete Chrome DevTools MCP catalog for network, console, performance, Lighthouse, heap, screenshots, and detailed debugging. It adds `browser_target`, strips that field before forwarding, and returns downstream `CallToolResult` objects unchanged.

`browser-fast` is an experimental routine-interaction surface with only `observe` and `execute`. `observe` returns compact interactive refs plus stable Agent Browser/CDP target IDs. It also resolves bounded read-only browser memory from `~/.config/mcp-dev-bridge/browser-memory/`: exact-host policy, exact-host site knowledge, then reusable platform knowledge whose `match.json` matches the current host/URL. Exact site lookup scales without scanning every learned company; platform scans stay limited to the reusable platform catalog. The resolver strips only leading `www.` and does not collapse arbitrary subdomains into one key. Up to six Markdown files are returned, capped at 16 KiB per file and 48 KiB total; malformed/missing local memory becomes a warning rather than a browser failure. `execute` requires the tab ID returned by `observe`, serializes the complete operation per browser target, validates that the pinned Agent Browser session is still on that exact target without switching tabs, runs mechanical actions locally, stops on the first error by default, never retries, and reports completed/failed/unknown/not-run steps plus a final observation. After each click, it compares the target set: exactly one new target is bound before later actions and final observation, zero continues on the current target, and multiple new targets stop the sequence without guessing. Other tab switching remains an Agent Browser operation through `observe(tab=...)` or an explicit `tab_switch` action.

The Linux browser-process seam is a small owner-controlled selector at `~/.config/mcp-dev-bridge/browser-fast.json`. Managed Chrome remains the default. Clearcote selects a distinct Agent Browser session and attaches it to a configured loopback CDP port, preserving the same public `observe`/`execute` interface and all tab/ref/upload behavior. The file is reread for backend calls, so selection changes require no bridge restart; operators must switch only between complete operations and discard prior refs. Windows remains on the shared dedicated Chrome runtime because the full DevTools `browser` facade and `browser-fast` intentionally share that process. Firefox is outside this seam because Agent Browser 0.35.0 is Chromium-CDP-only.

File upload reuses Agent Browser 0.35.0's native `upload` command rather than adding Browser Harness's Python/CDP runtime. The model supplies an observed input ref plus a logical `artifact` name. `browser-fast` resolves that name through `~/.config/mcp-dev-bridge/browser-artifacts.json`, requires the configured target to resolve to a regular file, and passes only the resolved approved path to Agent Browser. Windows uploads translate the WSL path with `wslpath -w`; Linux uploads keep the WSL path. Arbitrary model-supplied filesystem paths are not part of the action schema.

The memory design ports Browser Harness's MIT-licensed disk-backed domain-skill discovery idea without adding Browser Harness as a runtime/browser owner. `browser-fast` reads Markdown and platform `match.json` only; it does not execute Browser Harness-style `agent_helpers.py`, write learned memory, change Chrome lifecycle, or add another MCP tool. Provenance is recorded under `providers/browser-fast/vendor/browser-harness/`.

Learning stays outside Local browser authority. The Dev-only `providers/browser-fast/browser-memory-author.mjs` stages one exact-host observation with `propose` under `candidates/<host>/`, which `observe` never loads. A separate `promote` call creates `sites/<host>/<name>.md` with create-only semantics and removes the candidate after success. Both operations derive the exact host from the URL; provenance drops query strings and fragments. No page, successful form submission, or Browser call promotes memory automatically.

Private domain workflows are optional extensions above this generic browser layer. `bin/extension` installs/removes extension-owned browser-memory contributions and namespaced approved-artifact aliases from manifests under `extensions/<name>/`; Browser core imports no extension. Required private source paths and artifacts are preflighted before browser-memory mutation, then the resolved source map is written to the enabled extension state for the domain Skill to consume. An extension may also be source-only: `x-content` declares no Browser memory or browser artifacts and exposes only a configured private content workspace to its Skill. This keeps writing voice, hooks, audience language, topic strategy, and learned content heuristics outside Browser memory. Shared recognition knowledge such as a platform `match.json` may remain after removal, while extension-lifetime policy/strategy files and artifact aliases are removed. Exact-site memory learned later is shared Browser knowledge and is not owned by the originating extension. ChatGPT Skill installation remains a separate client-side action. Deleting or disabling an extension therefore does not require modifying `browser-fast`, `browser`, Local, or Chrome lifecycle.

Windows browser ownership is shared below both logical surfaces by one runtime. It keeps persistent browser state under `%LOCALAPPDATA%\\mcp-dev-bridge\\chrome-profile`, launches visible Google Chrome with `--user-data-dir` plus `--remote-debugging-port=0` when that profile is not already healthy, waits for that profile's `DevToolsActivePort`, and returns the resulting loopback HTTP/WebSocket endpoints. `browser` connects Chrome DevTools MCP to the HTTP endpoint with `--browserUrl`; `browser-fast` connects pinned native Agent Browser 0.35.0 to the WebSocket with `--cdp` and `--pin-tab`. The everyday Chrome data directory is never an MCP execution target. The MCP profile persists cookies, local storage, extensions, and sign-ins across Chrome restarts, so the user can sign into this visible profile once and reuse it. Agent Browser's separate one-shot Windows Node helper still owns bounded stdout/stderr capture so cold daemon startup cannot keep the WSL interop lifetime open. On Linux, `browser-fast` uses the pinned Agent Browser CLI in WSLg with `--pin-tab` and `AGENT_BROWSER_NO_XVFB=1`. Complete operations are serialized per target, normalized tab IDs prefer the CDP `targetId`, and each `observe` explicitly rebinds the chosen/current target before snapshotting so a strict pin can recover after its prior target is closed.

## Trust/profile separation

Public `restricted` and `trusted-dev` configurations do not gain private Code, Terminal, Local/Browser, `wait`, or personal Terminal-socket dependencies. The private `personal` profile is an explicit separate composition.
