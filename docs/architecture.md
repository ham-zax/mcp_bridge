# Architecture

## Runtime path

```text
ChatGPT
  -> HTTPS + OAuth
Cloudflare Tunnel
  -> loopback origin
1MCP :3050
  -> configured MCP providers
Linux / WSL development host
```

1MCP is the single public MCP gateway. The project does not add a second gateway in front of it.

## Repository boundaries

```text
bin/            public lifecycle commands
lib/bridge/     lifecycle/process supervision internals
providers/      provider-specific implementation
config/         tracked templates and trust profiles
scripts/        installation/config rendering/compatibility helpers
systemd/        generic user-service template
tests/          lifecycle and publication contracts
```

Software is generic. Deployment identity is local. Trust policy is explicit. Runtime and OAuth/session state are external to Git.

## State model

By default:

```text
runtime: ${XDG_RUNTIME_DIR:-/run/user/$UID}/mcp-dev-bridge
state:   ${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge
1MCP:    <state>/1mcp
```

1MCP 0.34.4 treats `--config-dir` as a writable application home: its config, `server.pid`, and OAuth/session storage live beneath that root. The bridge therefore gives 1MCP one external writable state directory rather than keeping mutable config beneath the source checkout.

## Lifecycle guarantees

The bridge owns exactly one config-scoped 1MCP process, one cloudflared process, and one watchdog while enabled. Lifecycle operations use an exclusive lock, validated PID/process-group ownership, transactional startup rollback, local readiness before public exposure, and public readiness before watchdog activation. Global `pkill`/`pgrep` process ownership is not used.

## Development harness direction

The architectural capability domains are Code, Files, Shell, and Terminal. Provider packages remain implementation details; those boundaries may evolve without changing the transport/lifecycle/trust-profile model.

The accepted private `personal` profile is:

```text
Dev
  read
  edit
  write
  wait
  apply_patch
  bash

Code
  code_search
  code_context
  code_symbol

Terminal
  terminal_open
  terminal_read
  terminal_send
  terminal_resize
  terminal_list
  terminal_close
```

`wait` belongs to Dev rather than Terminal. Its durable engine owns named timeout/resume state and generic local readiness checks; Terminal contributes only private generation/transcript observation through the broker. This keeps the public Terminal surface at six actions while preserving independent wait and model-read cursors.

tmux is the Terminal PTY/process lifetime authority. The Terminal broker owns metadata, transcripts, cursors, and human/model leases, but a broker/provider/1MCP restart must not become the PTY lifetime boundary.

Code is a small replaceable facade. The current implementation routes each call to the nearest canonical Git root and maintains one correctly rooted CodeDB child per active repository rather than exposing the raw CodeDB tool catalog or switching projects inside one neutral child.

Native Bash remains the execution path. RTK is not an automatic harness layer; explicit `rtk test`/`rtk err` use is optional and native output remains the recovery/source-of-truth path.

Public `restricted` and `trusted-dev` profiles remain separate and do not inherit private Code, Terminal, `wait`, or personal Terminal-socket dependencies.
