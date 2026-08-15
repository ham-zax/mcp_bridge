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

The architectural capability domains are Code, Files, Shell, and Terminal. Current provider packages are transitional implementations. Later CodeDB/Pi work may replace them without changing the transport/lifecycle/trust-profile boundaries.
