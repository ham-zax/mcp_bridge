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
Linux / WSL host
```

1MCP is the single public MCP gateway. Cloudflare supplies the public HTTPS transport; providers remain local stdio processes.

## Capability boundaries

### Dev

Dev owns Files, Bash, patching, and durable waits.

Personal surface:

```text
read edit write wait apply_patch bash
```

`edit` is for guarded exact known replacement across one or more existing text files. `apply_patch` is for contextual or structural mutation such as insertions, refactors, add/delete/move, or ambiguous anchors; file count alone is not the routing boundary. Native Bash remains the execution path.

`wait` owns durable named wait state and generic local readiness checks. Terminal-specific waits use private broker transcript/session observations, but `wait` is not a Terminal MCP action.

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

tmux is the PTY/process lifetime authority. A separate broker owns session metadata, transcripts, model cursors, generation identity, and human/model control leases. A personal frontend helper may launch Kitty as a human viewport and attach it to the exact tmux session, but Kitty does not own PTY/process lifetime. Restarting the broker, frontend helper, or 1MCP must not become the PTY lifetime boundary.

## Durable Terminal data flow

```text
Terminal MCP -> Unix socket -> broker -> tmux pane / transcript
      |                  |
      |                  +-> generation + model cursor + human lease
      |
      +-> personal frontend helper -> Kitty -> wsl-term present -> exact tmux PTY

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

Personal Terminal lifetime is split into two user services:

```text
wsl-agent-tmux.service             PTY/process lifetime
wsl-agent-terminal-broker.service  broker/transcript/control state
```

Restart the broker without restarting tmux when only broker/provider code changes.

## Trust/profile separation

Public `restricted` and `trusted-dev` configurations do not gain private Code, Terminal, `wait`, or personal Terminal-socket dependencies. The private `personal` profile is an explicit separate composition.
