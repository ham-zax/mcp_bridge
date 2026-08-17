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
MCP_DEV_MAX_SPOOL_BYTES=67108864
MCP_DEV_SPOOL_TTL_SECONDS=604800
MCP_DEV_SPOOL_MAX_TOTAL_BYTES=536870912
MCP_ONE_MCP_LOG_MAX_SIZE_BYTES=10485760
MCP_ONE_MCP_LOG_MAX_FILES=5
MCP_PERSONAL_DEFAULT_CWD=
```

`MCP_PERSONAL_DEFAULT_CWD` is optional and applies only to the private personal profile. Leave it empty/unset to use the actual WSL user's `$HOME`. Do not put trust policy or secrets in this file.

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
Terminal  terminal_open terminal_read terminal_send terminal_resize terminal_list terminal_yield terminal_close
```

The renderer resolves one absolute personal default cwd from `MCP_PERSONAL_DEFAULT_CWD` when supplied, otherwise from the actual WSL user's `$HOME`, and uses it for both Dev and Code. No tracked personal profile/template carries a machine-specific home path. Terminal communicates through the private broker socket. Code has no repository-size preflight or threshold: first use may start a persistent CodeDB child and create or update substantial on-disk index state, potentially consuming significant disk and RAM. Tool descriptions steer large or unfamiliar repository discovery toward Dev Bash/`rg` and focused `read` first; that guidance is not runtime enforcement.

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
1mcp/config.toml  rendered 1MCP application policy, including bounded native logging
1mcp/             1MCP writable application/OAuth/session state
logs/one-mcp.log  current native 1MCP application log; rotated siblings stay in logs/
dev/              private Dev durable state when enabled
```

Transient process state is kept under `${XDG_RUNTIME_DIR:-/run/user/$UID}/mcp-dev-bridge`.

## Source root matters

Generated provider commands contain the repository root used during rendering. If you move or delete that checkout/worktree, render again from the new source root before removing the old one. See [Operations: safe source cutover](operations.md#safe-source-cutover).

## Output policy

`MCP_DEV_MAX_OUTPUT_BYTES` is deployment policy, not a model-facing tool argument. Increase it only when the operator deliberately wants a larger model-visible Bash result budget.

Pi Dev also bounds retained Bash diagnostics independently of the model-visible tail. `MCP_DEV_MAX_SPOOL_BYTES` is an internal deployment/provider limit with a 64 MiB default and a 256 MiB maximum; the renderer propagates it into the Dev provider environment but it never appears as a model-facing MCP tool argument. `MCP_DEV_SPOOL_TTL_SECONDS` defaults to 604800 seconds (7 days), and `MCP_DEV_SPOOL_MAX_TOTAL_BYTES` defaults to 536870912 bytes (512 MiB) and must be at least the per-spool cap. Finalized spools are pruned on provider startup and after truncated Bash commands: expired files are removed, legacy oversized files are capped, and the oldest finalized files are evicted until the aggregate budget is satisfied. Active `.log.active` spools are excluded from GC. When command output exceeds the per-spool cap, `output_bytes` still counts the full observed stream, the model still receives the configured bounded tail, and any retained-output file is explicitly labeled as capped rather than complete.


## 1MCP log policy

1MCP application logging uses the pinned runtime's native Winston file transport rather than an unbounded shell `>>` capture. The renderer writes a structured `[logging]` block to `1mcp/config.toml` and keeps the log under the private bridge state directory. `MCP_ONE_MCP_LOG_MAX_SIZE_BYTES` defaults to 10485760 bytes (10 MiB) and is constrained to 1..64 MiB; `MCP_ONE_MCP_LOG_MAX_FILES` defaults to 5 and is constrained to 1..10. The parent `logs/` directory is mode 0700, and bridge startup uses `umask 077`.

A fresh 1MCP launch suppresses the duplicate console stream after native file logging is configured and removes the legacy runtime `one-mcp.log` append file. `scripts/smoke-local.sh` requires the generated `config.toml`, so after upgrading an existing installation re-render/bootstrap the deployment before the first restart. If startup health fails, the lifecycle helper prints a bounded tail from the native log when available.
