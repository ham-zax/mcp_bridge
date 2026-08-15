# Hamza WSL Cloudflare OAuth Bridge

Local development bridge for this ChatGPT workspace:

```text
ChatGPT
   |
   | HTTPS + OAuth
   v
Cloudflare Tunnel
https://mcp.hamza.my.id/mcp
   |
   v
1MCP OAuth origin
http://127.0.0.1:3050/mcp
   |
   +-- filesystem MCP
   |     `-- /home/hamza/repo
   |
   `-- shell MCP
         `-- unrestricted developer shell as Linux user `hamza`
```

This repository has **one canonical deployment**: the **Cloudflare OAuth Bridge**. Earlier alternate transport experiments are no longer part of the active design.

## Components

| Layer | Component | Responsibility |
|---|---|---|
| Public transport | `cloudflared tunnel run` | Publishes the loopback 1MCP origin at `https://mcp.hamza.my.id` |
| MCP gateway | `@1mcp/agent@0.34.4` | OAuth-enabled MCP endpoint and composition of local MCP servers |
| Filesystem | `@modelcontextprotocol/server-filesystem@2026.7.10` | Read/write access under `/home/hamza/repo` |
| Shell | `mcp-shell-server==1.1.8` | Developer command execution |
| Lifecycle | `scripts/bridge-common.sh` + watchdog | Exact PID ownership, readiness, rollback, reconciliation, diagnostics |

## Trust model

The filesystem MCP enforces `/home/hamza/repo` as its root.

The shell MCP is intentionally **not sandboxed**. `scripts/mcp-shell-server.py` runs it with `ALLOW_PATTERNS=.*` and `MCP_SHELL_ALLOW_DANGEROUS=ALL`, so shell commands may access anything available to the Linux user `hamza`. This machine is treated as a trusted, isolated development environment.

1MCP listens only on `127.0.0.1:3050`; Cloudflare is the public transport. 1MCP is always started with OAuth enabled and with the public `--external-url`.

## Operations

The canonical commands are:

```bash
scripts/start.sh       # start/reconcile Cloudflare OAuth Bridge
scripts/status.sh      # inspect desired state, PIDs, listener ownership and health
scripts/stop.sh        # stop all bridge-owned processes
scripts/smoke-local.sh # optional local MCP smoke check
```

For compatibility, `scripts/tunnel-up.sh` and `scripts/tunnel-down.sh` are thin aliases to `start.sh` and `stop.sh`. New automation and documentation should use the canonical commands above.

### Desired state

`run/cloudflare-oauth.enabled` means the bridge is intended to be running. The watchdog exits when that marker is absent.

A healthy running bridge has exactly:

```text
1 x 1MCP OAuth process
1 x cloudflared process
1 x watchdog process
```

The lifecycle scripts:

- never use global `pkill` / `pgrep` process management;
- validate PID files against command lines before killing processes;
- discover 1MCP processes by this repository's exact `--config-dir`;
- serialize manual start/stop and watchdog reconciliation with `flock`;
- start 1MCP directly instead of using 1MCP's `serve --background` supervisor;
- wait for local 1MCP readiness before exposing the origin;
- wait for public Cloudflare health before committing the desired-running state and starting the watchdog;
- roll back partial startup if any required component fails;
- clean up a launched 1MCP process if its readiness check fails.

`status.sh` reports duplicate config-scoped 1MCP processes and `server.pid` / `one-mcp.pid` / `:3050` listener mismatches.

## Configuration

Defaults are suitable for this machine:

```text
workspace root: /home/hamza/repo
1MCP origin:    http://127.0.0.1:3050
public URL:     https://mcp.hamza.my.id
```

Optional environment overrides are documented in `.env.example`:

```bash
TUNNEL_URL=https://mcp.hamza.my.id
TUNNEL_NAME=
```

`TUNNEL_NAME` is optional; when empty, `cloudflared tunnel run` uses the machine's existing Cloudflare configuration.

## Pinned privileged dependencies

- `@1mcp/agent@0.34.4`
- `@modelcontextprotocol/server-filesystem@2026.7.10`
- `mcp-shell-server==1.1.8`

Pinning is intentional because these providers expose filesystem write and unrestricted shell execution, and `scripts/setup.sh` applies a version-specific OAuth consent CSP patch to 1MCP 0.34.4.

## 1MCP 0.34.4 workarounds

### Direct bridge supervision

Do not use `1mcp serve --background` here. On this npm-global installation its nested background bootstrap timed out even though direct `serve` startup was healthy. The bridge launches the real Node entrypoint directly with `setsid` and owns lifecycle supervision itself.

### OAuth consent CSP

1MCP 0.34.4's OAuth consent page needs `form-action 'self' https:` so its form redirect can return to ChatGPT. `scripts/setup.sh` applies and verifies this patch against the pinned package version.

## WSL startup

This repo includes a systemd user unit for automatic startup when the WSL distro/user manager starts. Install/enable it once with:

```bash
cd /home/hamza/repo/satori_bridge
scripts/install-systemd-user.sh
```

The unit is `hamza-cloudflare-oauth-bridge.service` and calls only the canonical `scripts/start.sh` / `scripts/stop.sh` lifecycle. This machine already has WSL systemd enabled and `hamza` has linger enabled, so the service can start without an interactive shell login.

Useful commands:

```bash
systemctl --user status hamza-cloudflare-oauth-bridge.service
systemctl --user restart hamza-cloudflare-oauth-bridge.service
systemctl --user stop hamza-cloudflare-oauth-bridge.service
```

The unit sets an explicit PATH for the current NVM Node v24.19.0 install and `~/.local/bin` (where `cloudflared` lives). If the active Node installation path changes later, update/reinstall the unit.

## Tests

```bash
bash tests/lifecycle.sh
bash -n scripts/*.sh tests/lifecycle.sh
git diff --check
```

The lifecycle tests use isolated run/config directories and fake binaries; they do not intentionally restart the live bridge.

## More docs

- Setup and operating procedure: `docs/PLAN.md`
- End-to-end tool acceptance: `ACCEPTANCE.md`
