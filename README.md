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
  `-- Browser   authenticated native Windows / managed WSLg Chrome
```

Not every profile enables every provider. Public/general installations use the smaller `restricted` or `trusted-dev` surfaces. The private `personal` profile adds the full WSL coding harness.

## Trust profiles

| Profile | Files | Shell | Code / Terminal / Browser | Intended use |
|---|---|---|---|---|
| `restricted` | workspace-bounded `read`, `edit`, `write` | separate allowlisted legacy shell | no | conservative public/general installs |
| `trusted-dev` | workspace-bounded `read`, `edit`, `write` | unrestricted native Bash as the Linux service user | no | dedicated trusted development hosts |
| `personal` | WSL-user paths, including absolute paths | unrestricted native Bash | yes | private Codex-like personal harness |

`trusted-dev` and `personal` deliberately carry the authority of the Linux user running the bridge. In `personal`, an explicitly authorized Browser scope can also control authenticated native Windows Chrome state. Read [Security](docs/security.md) before enabling either.

## Personal harness surface

The private personal harness is grouped into four capability domains:

```text
Dev       read edit write wait apply_patch bash pc_sleep
Code      code_search code_context code_symbol
Terminal  terminal_open terminal_read terminal_send terminal_resize terminal_list terminal_yield terminal_close
Browser   one Chrome DevTools MCP facade with resource-local Windows/Linux routing
```

A few important design choices:

- `edit` is the guarded single-file primitive; `apply_patch` is for multi-file or structural changes.
- Bash is native Bash; it is direct, native command execution.
- `wait` is a Dev action. It provides durable named waits for Terminal output/exit and local readiness conditions without consuming the normal Terminal read cursor.
- `pc_sleep` is personal-only and sleeps the Windows host after explicit confirmation, with an optional Task Scheduler wake time.
- Terminal PTYs are owned by tmux, so they survive provider, broker, and 1MCP restarts.
- Code requests are routed to the nearest canonical Git root; the raw CodeDB tool catalog is hidden behind three small actions.
- Browser control is one model-facing MCP surface. It defaults to the normal native Windows Chrome profile and accepts `browser_target=linux` when the requested state belongs to WSLg Chrome; the facade starts the corresponding resource-local Chrome DevTools MCP child internally. Browser requires the separate `tag:browser` OAuth scope.

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
- [Personal WSL harness](docs/personal/harness.md) — use the private Dev, Code, Terminal, and Browser domains
- [Engineering history](docs/history/README.md) — preserved benchmarks, plans, specs, and acceptance evidence

## Current status

The Phase-2 personal harness is merged, live-accepted, and released at:

```text
personal-harness-phase2-2026-08-16
```

The current documentation describes that accepted architecture. Older benchmark and planning documents are preserved under `docs/history/` and are intentionally not the operating manual.

## 1MCP compatibility note

The project pins 1MCP 0.36.0 after qualifying the current Dev/Code/Terminal composition, browser rich results, and config hot reload. The bridge continues to supervise the real Node entrypoint directly; the former 0.34.4 OAuth-consent CSP source patch is no longer needed because 0.36.0 handles validated callback origins upstream. Details are in [Operations](docs/operations.md).

## Public/private publication boundary

This source tree contains private-only personal-harness implementation and historical engineering evidence. Publication tests keep those paths out of the public export. Public users should rely on `restricted` or deliberately `trusted-dev` unless the private personal composition is available to them.

## License

MIT. See [LICENSE](LICENSE).
