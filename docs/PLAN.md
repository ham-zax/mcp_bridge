# Cloudflare OAuth Bridge — setup and operations

This repository has one supported runtime architecture:

```text
ChatGPT
  -> https://mcp.hamza.my.id/mcp
  -> Cloudflare Tunnel
  -> 1MCP OAuth on 127.0.0.1:3050
  -> filesystem + unrestricted developer shell
```

Earlier alternate transport experiments are retired and are not part of this repository's active design.

## 1. Prerequisites

Verified on this WSL machine:

| Tool | Expected |
|---|---|
| Node | v24.19.0 |
| npm | available from the active NVM install |
| pnpm | 10.28.2 |
| Python / uv / uvx | available |
| cloudflared | installed in `~/.local/bin` |
| curl / flock / setsid | available |

WSL uses systemd. This repo ships a systemd user unit for automatic startup; install it with `scripts/install-systemd-user.sh`.

## 2. Install and verify dependencies

Run:

```bash
cd /home/hamza/repo/satori_bridge
scripts/setup.sh
```

The setup script installs/verifies these exact privileged dependency versions:

```text
@1mcp/agent@0.34.4
@modelcontextprotocol/server-filesystem@2026.7.10
mcp-shell-server==1.1.8
```

It also verifies the pinned 1MCP OAuth consent implementation and applies the repository's CSP redirect patch.

## 3. MCP inventory

`config/mcp.json` defines two local MCP providers.

### Filesystem

```text
@modelcontextprotocol/server-filesystem@2026.7.10
root: /home/hamza/repo
```

The filesystem server enforces the root itself.

### Shell

```text
mcp-shell-server==1.1.8
```

The shell provider is intentionally relaxed through `scripts/mcp-shell-server.py` with:

```text
ALLOW_PATTERNS=.*
MCP_SHELL_ALLOW_DANGEROUS=ALL
```

This is a trusted-development-machine configuration, not a shell sandbox.

The 1MCP process starts with CWD `/home/hamza/repo`. Agent shell calls should still provide explicit `directory` values whenever possible.

## 4. Cloudflare and OAuth configuration

The default public origin is:

```text
https://mcp.hamza.my.id
```

The public MCP endpoint is:

```text
https://mcp.hamza.my.id/mcp
```

Optional overrides:

```bash
export TUNNEL_URL=https://mcp.hamza.my.id
export TUNNEL_NAME=
```

These values may also be copied from `.env.example` into your own environment handling. The bridge does not require a secret `.env` file for its default setup.

1MCP is always launched as the OAuth-enabled public-origin backend:

```text
serve
--config-dir /home/hamza/repo/satori_bridge/config
--enable-auth
--external-url https://mcp.hamza.my.id
```

It binds only to `127.0.0.1:3050`. `cloudflared` publishes that loopback service.

## 5. Start

Canonical start command:

```bash
cd /home/hamza/repo/satori_bridge
scripts/start.sh
```

Startup is transactional:

```text
acquire lifecycle lock
  -> disable old watchdog intent
  -> reconcile exactly one OAuth-enabled 1MCP
  -> wait for local /health/ready
  -> start/reuse cloudflared
  -> wait for public /health/ready
  -> mark Cloudflare OAuth Bridge enabled
  -> start watchdog
  -> release lifecycle lock
```

If a required component fails before the transaction is committed, startup removes the partial bridge state and returns failure.

For backward compatibility only:

```bash
scripts/tunnel-up.sh
```

is an alias to `scripts/start.sh`.

## 6. Inspect

Run:

```bash
scripts/status.sh
```

A healthy stack should report:

```text
desired state: running
exactly one config-scoped 1MCP process
listener :3050 PID = server.pid PID = bridge one-mcp.pid
local health: ready
cloudflared: running
watchdog: running
public health: ok
issues: 0
```

Useful direct probes:

```bash
curl -fsS http://127.0.0.1:3050/health/ready
curl -fsS https://mcp.hamza.my.id/health/ready
```

`status.sh` deliberately diagnoses:

- duplicate 1MCP processes for this repository's config directory;
- 1MCP PID/listener mismatches;
- stale managed PID files;
- an enabled bridge missing 1MCP, cloudflared, watchdog, local health, or public health;
- disabled desired state with managed processes still present.

## 7. Watchdog

The watchdog is started only after the public endpoint is healthy.

Every reconciliation cycle:

1. checks that the desired-running marker still exists;
2. acquires the same `flock` lifecycle lock used by manual `start.sh` and `stop.sh`;
3. reconciles exactly one correctly configured OAuth 1MCP runtime;
4. reconciles the bridge-owned `cloudflared` process;
5. releases the lock.

This prevents manual startup and watchdog recovery from simultaneously killing/starting the same components.

If the desired-running marker is removed, the watchdog exits instead of resurrecting the bridge.

## 8. Stop

Canonical stop command:

```bash
scripts/stop.sh
```

It:

```text
acquires lifecycle lock
  -> disables desired-running state
  -> stops watchdog
  -> stops exact bridge-owned cloudflared
  -> stops config-scoped 1MCP
  -> clears runtime state
  -> releases lifecycle lock
```

For backward compatibility only, `scripts/tunnel-down.sh` aliases `scripts/stop.sh`.

## 9. ChatGPT connector

The ChatGPT MCP app/connector points to:

```text
https://mcp.hamza.my.id/mcp
```

1MCP supplies the OAuth flow and exposes the composed filesystem/shell tool inventory. If the tool inventory changes materially, refresh/recreate the connector as required by the product UI.

## 10. Tests

Before treating lifecycle changes as complete, run:

```bash
bash tests/lifecycle.sh
bash -n scripts/*.sh tests/lifecycle.sh
git diff --check
scripts/status.sh
```

The regression suite uses isolated fake processes and must not intentionally restart the live bridge.

## 11. WSL boot behavior

Install/enable autostart once:

```bash
scripts/install-systemd-user.sh
```

This installs `systemd/hamza-cloudflare-oauth-bridge.service` into `~/.config/systemd/user/`, reloads the user manager, and enables the unit for `default.target` without forcing an immediate restart.

The machine already has:

```text
systemd=true
user linger enabled for hamza
```

so after the unit is enabled, a fresh WSL distro start can launch the canonical bridge automatically without an interactive shell login. The service calls `scripts/start.sh` on start and `scripts/stop.sh` on stop.

The unit uses an explicit PATH containing the current NVM Node v24.19.0 installation and `~/.local/bin`. If Node is moved/upgraded to a different NVM version path, update the unit or rerun the installer after updating the checked-in unit.
