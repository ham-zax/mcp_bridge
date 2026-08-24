# Providers

The bridge is organized around capability boundaries, not one tool per package.

## Dev — `providers/pi-dev/`

Files, native Bash, regular-file topology operations, durable local waits, and personal Windows-host sleep.

Personal surface:

```text
read edit write file_ops wait bash pc_sleep
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
terminal_open terminal_read terminal_send terminal_resize terminal_list terminal_yield terminal_close
```

The MCP provider talks to a local broker over a Unix socket. tmux owns PTY/process lifetime; the broker owns metadata, transcript/cursor state, and human/model control leases.

## Local — `providers/local-tools/`

Private stable tool-broker surface:

```text
tool_list tool_schema tool_call
```

The Local provider connects over stdio to one private inner 1MCP in direct mode. It exposes logical `{server, tool}` identities, bounded live discovery, exact schema lookup, and raw downstream `CallToolResult` forwarding. V1 has no catalog/schema cache. The initial inner composition contains only Browser and the outer Local provider remains tagged only `browser`.

## Browser — `providers/browser/`

Browser remains the resource-local execution owner behind Local. It republishes the complete pinned Chrome DevTools MCP catalog internally, adds `browser_target`, defaults to normal Windows Chrome, and routes `browser_target=linux` to WSLg Chrome. It is not directly model-facing in the personal outer composition.

## Legacy shell — `providers/legacy-shell/`

Retained only for the public `restricted` profile's conservative allowlisted shell policy.

See [Architecture](../docs/architecture.md) and [Security](../docs/security.md) for the current boundaries.
