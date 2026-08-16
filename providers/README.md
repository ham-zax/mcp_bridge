# Providers

The bridge is organized around capability boundaries, not one tool per package.

## Dev — `providers/pi-dev/`

Files, native Bash, patching, and durable local waits.

Personal surface:

```text
read edit write wait apply_patch bash
```

Public profiles expose a smaller subset according to their trust policy.

## Code — `providers/code-router/`

Private repository intelligence:

```text
code_search code_context code_symbol
```

Each call resolves the nearest canonical Git root and routes to a correctly rooted CodeDB child. The raw CodeDB MCP catalog is not model-facing.

## Terminal — `providers/terminal/`

Private persistent PTY control:

```text
terminal_open terminal_read terminal_send terminal_resize terminal_list terminal_close
```

The MCP provider talks to a local broker over a Unix socket. tmux owns PTY/process lifetime; the broker owns metadata, transcript/cursor state, and human/model control leases.

## Legacy shell — `providers/legacy-shell/`

Retained only for the public `restricted` profile's conservative allowlisted shell policy.

See [Architecture](../docs/architecture.md) and [Security](../docs/security.md) for the current boundaries.
