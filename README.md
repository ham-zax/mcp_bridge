# WebSession MCP Bridge

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
  +-- Terminal  persistent tmux-backed PTYs
  `-- Local     stable tool_list / tool_schema / tool_call
        `-- private inner 1MCP -> Browser -> Windows / WSLg Chrome
```

Not every profile enables every provider. Public/general installations use the smaller `restricted` or `trusted-dev` surfaces. The private `personal` profile adds the full WSL coding harness.

## Trust profiles

| Profile | Files | Shell | Code / Terminal / Local-Browser | Intended use |
|---|---|---|---|---|
| `restricted` | workspace-bounded `read`, `edit`, `write` | separate allowlisted legacy shell | no | conservative public/general installs |
| `trusted-dev` | workspace-bounded `read`, `edit`, `write` | unrestricted native Bash as the Linux service user | no | dedicated trusted development hosts |
| `personal` | WSL-user paths, including absolute paths | unrestricted native Bash | yes | private Codex-like personal harness |

`trusted-dev` and `personal` deliberately carry the authority of the Linux user running the bridge. In `personal`, an explicitly authorized Browser scope can also control authenticated native Windows Chrome state. Read [Security](docs/security.md) before enabling either.

## Personal harness surface

The private personal harness keeps three small direct domains plus one stable Local broker domain:

```text
Dev       read edit write file_ops wait bash pc_sleep
Code      code_search code_context code_symbol
Terminal  terminal_open terminal_read terminal_send terminal_resize terminal_list terminal_yield terminal_close
Local     tool_list tool_schema tool_call -> logical server "browser"
Browser   private facade behind Local, with resource-local Windows/Linux routing
```

A few important design choices:

- `edit` is the guarded existing-text primitive across one or many files; `write` creates new text files; `file_ops` moves or deletes existing regular files.
- Bash is native Bash. Syntax-shaped discovery/codemods use ast-grep through Bash and normally feed guarded `edit`; an existing authoritative `.patch`/`.diff` artifact uses `git apply --check -- "$patch" && git apply -- "$patch"`.
- `wait` is a Dev action. It provides durable named waits for Terminal output/exit and local readiness conditions without consuming the normal Terminal read cursor.
- `pc_sleep` is personal-only and sleeps the Windows host after explicit confirmation, with an optional Task Scheduler wake time.
- Terminal PTYs are owned by tmux, so they survive provider, broker, and 1MCP restarts.
- Code requests are routed to the nearest canonical Git root; the raw CodeDB tool catalog is hidden behind three small actions.
- Browser control is model-facing through exactly three Local broker tools. Agents discover/call the stable logical server `browser`; `browser_target=linux` stays inside the selected Browser tool arguments. The private Browser facade starts the corresponding resource-local Chrome DevTools MCP child internally, while the outer Local provider is authorized by the generic `tag:local` OAuth domain.

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

For the private `personal` profile, the normal install is one explicit bootstrap:

```bash
scripts/bootstrap-personal.sh --enable-startup
```

`--enable-startup` is the consent boundary: the bootstrap qualifies the local toolbox, installs/verifies the pinned 1MCP bridge runtime and providers, renders personal configuration, installs `wsl-term`, and then installs/enables/starts the user-systemd services and user linger so the harness comes back automatically when this WSL user manager starts later. Omit the flag to perform the preparation without changing persistent startup state. This does **not** configure Windows to launch WSL automatically. See [Personal harness](docs/personal/harness.md).

## Day-to-day operations

```bash
bin/start
bin/status
bin/stop
```

Public/general optional user-session autostart:

```bash
scripts/install-systemd-user.sh
systemctl --user start mcp-dev-bridge.service
```

For Terminal lifetime and broker operations, recovery, logs, safe restarts, and source cutovers, see [Operations](docs/operations.md).

## Documentation

- [Documentation index](docs/README.md) — choose the right guide quickly
- [Getting started](docs/getting-started.md) — install and connect
- [Operations](docs/operations.md) — run, inspect, restart, and recover
- [Personal WSL harness](docs/personal/harness.md) — use the private Dev, Code, Terminal, and Local-routed Browser domains
- [Engineering history](docs/history/README.md) — preserved benchmarks, plans, specs, and acceptance evidence

## Current status

The Phase-2 personal harness is merged, live-accepted, and released at:

```text
personal-harness-phase2-2026-08-16
```

The current documentation describes that accepted architecture. Older benchmark and planning documents are preserved under `docs/history/` and are intentionally not the operating manual.

## 1MCP compatibility note

The project pins 1MCP 0.36.0 after qualifying the current Dev/Code/Terminal composition, direct-mode rich Browser results, and config hot reload. Personal Browser tools sit behind a repository-owned Local broker and a private inner 1MCP running in normal direct mode; stock lazy `tool_invoke` is not used because it wraps rich results. The bridge continues to supervise the public 1MCP Node entrypoint directly. Details are in [Operations](docs/operations.md).

## Public/private publication boundary

This source tree contains private-only personal-harness implementation and historical engineering evidence. Publication tests keep those paths out of the public export. Public users should rely on `restricted` or deliberately `trusted-dev` unless the private personal composition is available to them.

## License

MIT. See [LICENSE](LICENSE).
