# Cloudflare OAuth Bridge Lifecycle Hardening Plan

**Goal:** Make the single supported Cloudflare OAuth MCP bridge deterministic, repo-scoped, dependency-pinned, rollback-safe, race-free, diagnosable, and able to start automatically with the WSL user systemd manager.

**Architecture:** ChatGPT connects to `https://mcp.hamza.my.id/mcp`; Cloudflare Tunnel forwards to an OAuth-enabled 1MCP process bound on `127.0.0.1:3050`; 1MCP composes filesystem and unrestricted developer-shell MCP providers. `scripts/bridge-common.sh` owns exact PID validation, config-scoped process discovery, readiness checks, lifecycle locking and daemon reconciliation. `scripts/start.sh`, `scripts/stop.sh`, `scripts/status.sh` and `scripts/watchdog.sh` are the canonical operational surface.

**Pinned stack:**

- `@1mcp/agent@0.34.4`
- `@modelcontextprotocol/server-filesystem@2026.7.10`
- `mcp-shell-server==1.1.8`
- Cloudflare Tunnel through the machine's existing `cloudflared` configuration

## Constraints

- Keep unrestricted shell access; this WSL machine is an explicitly trusted development environment.
- Never use global `pkill` / `pgrep` matching for lifecycle ownership.
- 1MCP discovery is scoped to this repository's exact `--config-dir`.
- Every destructive PID-file action validates the stored PID's command line first.
- Managed daemons are launched with `setsid`; stopping a validated session leader also terminates its owned process group so MCP provider children cannot be orphaned.
- Manual start/stop and watchdog reconciliation share one `flock` lifecycle lock.
- Do not use 1MCP's internal `serve --background` supervisor.
- Startup is transactional: a failure before public health is established rolls all newly-created bridge state back to stopped.
- The watchdog begins only after local and public health checks pass.
- Lifecycle regression tests use isolated run/config directories and fake binaries and must not intentionally restart the live bridge.

## Final lifecycle

### Start

```text
acquire lifecycle lock
-> disable watchdog intent / stop previous watchdog
-> reconcile exactly one OAuth-enabled 1MCP process
-> wait for local health
-> start/reuse exact bridge-owned cloudflared
-> wait for public health
-> write desired-running marker
-> start watchdog
-> release lifecycle lock
```

Any failure before the desired-running marker/watchdog commit triggers rollback of 1MCP, cloudflared, watchdog state and tunnel URL state.

### Watchdog

```text
confirm desired-running marker
-> acquire same lifecycle lock
-> re-check desired state
-> reconcile one correctly configured 1MCP runtime
-> reconcile cloudflared
-> release lock
-> sleep and repeat
```

A missing desired-running marker causes the watchdog to exit instead of resurrecting the bridge.

### Stop

```text
acquire lifecycle lock
-> remove desired-running marker
-> stop validated watchdog PID
-> stop validated cloudflared PID
-> stop config-scoped 1MCP process group
-> clear runtime state
-> release lifecycle lock
```

## Diagnostics

`scripts/status.sh` reports:

- desired running/stopped state;
- config-scoped 1MCP PIDs;
- `:3050` listener PID;
- 1MCP `server.pid` and bridge `one-mcp.pid`;
- local readiness;
- cloudflared/watchdog PID state;
- public readiness;
- duplicate 1MCP processes;
- PID/listener mismatches;
- disabled state with managed processes still alive.

## WSL boot integration

`systemd/hamza-cloudflare-oauth-bridge.service` is a user unit that calls only the canonical `scripts/start.sh` / `scripts/stop.sh` surface. `scripts/install-systemd-user.sh` copies and enables it. The user `hamza` already has systemd linger enabled, so the user manager can start the bridge when the WSL distro starts.

The unit sets an explicit PATH containing the current NVM Node v24.19.0 bin directory and `~/.local/bin`, where `cloudflared` lives.

## Verification gates

```bash
bash tests/lifecycle.sh
bash -n scripts/*.sh tests/lifecycle.sh
systemd-analyze verify systemd/hamza-cloudflare-oauth-bridge.service
git diff --check
scripts/status.sh
```

For live deployment, restart through the canonical scripts and verify exactly one 1MCP, one cloudflared and one watchdog with local/public health ready and `issues: 0`.
