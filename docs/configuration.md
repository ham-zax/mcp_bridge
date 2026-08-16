# Configuration

Configuration is built from three inputs:

```text
tracked template + explicit trust profile + local deployment identity
                              -> generated external state
```

## Deployment identity

Local machine-specific values come from `.env` (or another file passed with `--env-file`):

```text
MCP_WORKSPACE_ROOT=/absolute/path/to/code
MCP_PUBLIC_URL=https://mcp.example.com
MCP_TUNNEL_NAME=
MCP_DEV_MAX_OUTPUT_BYTES=1048576
```

Do not put trust policy or secrets in that file.

## Profiles

### `restricted`

- Dev Files: workspace-bounded `read`, `edit`, `write`.
- Shell: separate allowlisted legacy shell.
- No Code provider.
- No Terminal provider.

### `trusted-dev`

- Dev Files: workspace-bounded `read`, `edit`, `write`.
- Dev Bash: unrestricted native Bash as the Linux service user.
- No Code provider.
- No Terminal provider.

### `personal`

Private-only profile:

```text
Dev       read edit write wait apply_patch bash
Code      code_search code_context code_symbol
Terminal  terminal_open terminal_read terminal_send terminal_resize terminal_list terminal_close
```

Its tracked private profile must provide an absolute user-mode default cwd. The renderer uses that same default for Dev and Code. Terminal communicates through the private broker socket.

## Rendering

Public/general setup calls the renderer for you. Direct rendering is also supported:

```bash
node scripts/render-config.mjs \
  --profile trusted-dev \
  --env-file .env
```

The renderer accepts `restricted`, `trusted-dev`, and `personal`.

Useful overrides:

```text
--env-file PATH
--state-dir PATH
--repo-root PATH
```

## Generated state

Default persistent root:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge
```

Important files:

```text
bridge.env        selected profile, public URL, workspace/default cwd, source root
1mcp/mcp.json     rendered provider composition
1mcp/             1MCP writable application/OAuth/session state
dev/              private Dev durable state when enabled
```

Transient process state is kept under `${XDG_RUNTIME_DIR:-/run/user/$UID}/mcp-dev-bridge`.

## Source root matters

Generated provider commands contain the repository root used during rendering. If you move or delete that checkout/worktree, render again from the new source root before removing the old one. See [Operations: safe source cutover](operations.md#safe-source-cutover).

## Output policy

`MCP_DEV_MAX_OUTPUT_BYTES` is deployment policy, not a model-facing tool argument. Increase it only when the operator deliberately wants a larger model-visible Bash result budget.
