# MCP Development Bridge

A small, authenticated bridge that lets ChatGPT work against a Linux or WSL development machine through MCP.

The project keeps the internet-facing layer narrow: Cloudflare handles HTTPS, 1MCP handles OAuth and MCP routing, and local providers expose development capabilities with explicit trust profiles.

## Architecture

```text
ChatGPT
  |
  | HTTPS + OAuth
  v
Cloudflare Tunnel
  |
  v
1MCP on loopback
  |
  +-- Dev       Files, Bash, durable waits
  +-- Code      repository-rooted code intelligence
  `-- Terminal  persistent tmux-backed PTYs
```

Not every profile enables every provider. Public/general installations use the smaller `restricted` or `trusted-dev` surfaces. The private `personal` profile adds the full WSL coding harness.

## Trust profiles

| Profile | Files | Shell | Code / Terminal | Intended use |
|---|---|---|---|---|
| `restricted` | workspace-bounded `read`, `edit`, `write` | separate allowlisted legacy shell | no | conservative public/general installs |
| `trusted-dev` | workspace-bounded `read`, `edit`, `write` | unrestricted native Bash as the Linux service user | no | dedicated trusted development hosts |
| `personal` | WSL-user paths, including absolute paths | unrestricted native Bash | yes | private Codex-like personal harness |

`trusted-dev` and `personal` deliberately carry the authority of the Linux user running the bridge. Read [Security](docs/security.md) before enabling either.

## Personal harness surface

The accepted private surface is 15 actions grouped into three obvious domains:

```text
Dev       read edit write wait apply_patch bash
Code      code_search code_context code_symbol
Terminal  terminal_open terminal_read terminal_send terminal_resize terminal_list terminal_close
```

A few important design choices:

- `edit` is the guarded single-file primitive; `apply_patch` is for multi-file or structural changes.
- Bash is native Bash. RTK is optional when invoked explicitly; it is not an automatic execution layer.
- `wait` is a Dev action. It provides durable named waits for Terminal output/exit and local readiness conditions without consuming the normal Terminal read cursor.
- Terminal PTYs are owned by tmux, so they survive provider, broker, and 1MCP restarts.
- Code requests are routed to the nearest canonical Git root; the raw CodeDB tool catalog is hidden behind three small actions.

See [Personal harness](docs/personal/harness.md) for the practical workflow.

## Quick start

Public/general setup uses one explicit profile:

```bash
cp .env.example .env
# edit MCP_WORKSPACE_ROOT and MCP_PUBLIC_URL

scripts/setup.sh --profile restricted
# or, deliberately:
scripts/setup.sh --profile trusted-dev

bin/start
bin/status
```

Generated configuration and OAuth/session state live outside the Git checkout by default:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/
```

Runtime state lives under:

```text
${XDG_RUNTIME_DIR:-/run/user/$UID}/mcp-dev-bridge/
```

For the private `personal` profile, use the dedicated instructions in [Personal harness](docs/personal/harness.md); `scripts/setup.sh` intentionally exposes only the public `restricted` and `trusted-dev` setup path.

## Day-to-day operations

```bash
bin/start
bin/status
bin/stop
```

Optional user-session autostart:

```bash
scripts/install-systemd-user.sh
systemctl --user start mcp-dev-bridge.service
```

For Terminal lifetime and broker operations, recovery, logs, safe restarts, and source cutovers, see [Operations](docs/operations.md).

## Documentation

- [Getting started](docs/getting-started.md)
- [Configuration](docs/configuration.md)
- [Operations](docs/operations.md)
- [Architecture](docs/architecture.md)
- [Security and trust profiles](docs/security.md)
- [Development and verification](docs/development.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Personal WSL harness](docs/personal/harness.md)
- [Personal CLI toolbox](docs/personal/toolbox.md)
- [Engineering history](docs/history/README.md) — benchmarks, plans, specs, and acceptance evidence

## Current status

The Phase-2 personal harness is merged, live-accepted, and released at:

```text
personal-harness-phase2-2026-08-16
```

The current documentation describes that accepted architecture. Older benchmark and planning documents are preserved under `docs/history/` and are intentionally not the operating manual.

## 1MCP compatibility note

The project pins 1MCP 0.34.4 and preserves two verified compatibility behaviors: direct supervision of the real Node entrypoint and a narrow OAuth consent CSP patch required for the HTTPS ChatGPT callback. The installer refuses to patch an unexpected upstream file shape. Details are in [Operations](docs/operations.md).

## Public/private publication boundary

This source tree contains private-only personal-harness implementation and historical engineering evidence. Publication tests keep those paths out of the public export. Public users should rely on `restricted` or deliberately `trusted-dev` unless the private personal composition is available to them.

## License

MIT. See [LICENSE](LICENSE).
