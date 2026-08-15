# MCP Development Bridge

Authenticated MCP development bridge for running coding tools on a Linux or WSL development machine through ChatGPT.

```text
ChatGPT
   |
   | HTTPS + OAuth
   v
Cloudflare Tunnel
   |
   v
1MCP on 127.0.0.1:3050
   |
   +-- filesystem provider
   `-- shell provider
```

The project keeps public software generic while deployment identity and mutable state remain local. A deployment chooses a trust profile explicitly; there is no silent profile default.

## Trust profiles

### `restricted`

Recommended for general installations. Uses a conservative command policy and limits file access to configured workspace roots.

### `trusted-dev`

First-class mode for dedicated agentic development machines. Command execution has the effective permissions of the Linux user running the bridge. Files, processes, network resources, credentials, and tools available to that account may therefore be reachable by the agent.

`trusted-dev` is deliberate unrestricted development authority, not a hidden or unsupported mode.

## Quick start

Prerequisites include Node.js, npm/npx, `uv`/`uvx`, `cloudflared`, `curl`, `flock`, and a configured Cloudflare Tunnel hostname pointing at the local 1MCP origin.

```bash
cp .env.example .env
# edit MCP_WORKSPACE_ROOT and MCP_PUBLIC_URL

scripts/setup.sh --profile restricted
# or deliberately:
scripts/setup.sh --profile trusted-dev

bin/start
bin/status
```

Setup renders deployment state outside the Git checkout, by default under:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/
```

Transient lifecycle state defaults to:

```text
${XDG_RUNTIME_DIR:-/run/user/$UID}/mcp-dev-bridge/
```

Install user-session autostart with:

```bash
scripts/install-systemd-user.sh
systemctl --user start mcp-dev-bridge.service
```

The installer does not automatically remove or disable an older service installation.

## Public lifecycle interface

```bash
bin/start
bin/status
bin/stop
```

Legacy `scripts/start.sh`, `scripts/status.sh`, and `scripts/stop.sh` remain compatibility wrappers during migration.

## Current development surface

The bridge evaluated CodeDB and removed it after its independent benchmark failed the required post-edit freshness gate; the benchmark evidence remains under `docs/benchmarks/`. The remaining experimental `dev` provider uses pinned Pi primitives for workspace-relative `read`, exact guarded multi-`edit`, and atomic create-only `write`. Under `trusted-dev` it also exposes native-command `bash`; under `restricted` it deliberately omits Pi Bash and the existing allowlisted shell remains responsible for Shell. Dev results are plain model-facing text: source, one diff, a short create acknowledgement, or terminal output. The legacy filesystem and shell providers remain during A/B and are removed only by an explicit cutover.

## Important 1MCP 0.34.4 compatibility behavior

This project pins `@1mcp/agent@0.34.4` and preserves two verified workarounds:

- lifecycle launches the real 1MCP Node entrypoint directly instead of relying on `serve --background`;
- `scripts/setup.sh` automatically verifies/applies the OAuth consent CSP compatibility patch from `form-action 'self'` to `form-action 'self' https:` so ChatGPT can complete the HTTPS OAuth consent redirect. Setup refuses to patch blindly if the pinned upstream file no longer has the expected shape.

See [Operations](docs/operations.md) for details.

## Documentation

- [Architecture](docs/architecture.md)
- [Installation](docs/installation.md)
- [Configuration](docs/configuration.md)
- [Operations](docs/operations.md)
- [Security and trust profiles](docs/security.md)
- [Development](docs/development.md)
- [Acceptance procedure](docs/acceptance.md)
- [Migrating an existing local bridge](docs/migration-from-local-bridge.md)

Engineering design history is kept under `docs/superpowers/` but is not part of the primary public documentation.

## Publication note

The current private development Git history contains historical machine-specific deployment values. Before making a public repository, review/export or squash the intended public history rather than assuming a clean current working tree sanitizes older commits.

## License

MIT. See [LICENSE](LICENSE).
