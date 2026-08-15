# Configuration

Configuration is composed from three categories:

```text
tracked template + explicit trust profile + local deployment identity
                              -> external generated 1MCP state
```

## Deployment identity

An ignored `.env` supplies machine-specific values:

```text
MCP_WORKSPACE_ROOT=/absolute/path/to/code
MCP_PUBLIC_URL=https://mcp.example.com
MCP_TUNNEL_NAME=
```

Trust profile is intentionally not stored in `.env`; setup requires `--profile` and records the selected profile in generated state.

## Profiles

Tracked files:

```text
config/profiles/restricted.env
config/profiles/trusted-dev.env
```

Profiles describe policy only. They must not contain machine usernames, home paths, domains, tunnel identities, or repository roots.

## Rendering

`scripts/render-config.mjs` can be used directly:

```bash
node scripts/render-config.mjs \
  --profile trusted-dev \
  --env-file .env
```

Default output:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/bridge.env
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/1mcp/mcp.json
```

The containing 1MCP directory is writable because 1MCP stores runtime/auth state beneath its config root.

Tests and unusual deployments may override `--state-dir`, `BRIDGE_STATE_DIR`, `XDG_STATE_HOME`, and `XDG_RUNTIME_DIR`.

## Compatibility

During local migration the lifecycle prefers generated external state when present. If no generated deployment exists and a legacy tracked-style `config/mcp.json` exists, the compatibility path can still use the repository `config/` and `run/` directories until migration is complete.
