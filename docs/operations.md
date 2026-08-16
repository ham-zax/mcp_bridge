# Operations

## Core commands

```bash
bin/start
bin/status
bin/stop
```

Healthy status should report one config-scoped 1MCP process, local health ready, cloudflared running, watchdog running, public health OK, and `issues: 0`.

## User-systemd bridge service

Install the generic bridge unit with:

```bash
scripts/install-systemd-user.sh
systemctl --user start mcp-dev-bridge.service
```

The generated unit uses external `bridge.env` state and the repository's public lifecycle entrypoints.

## Personal Terminal services

The private personal harness has two separate user services:

```text
wsl-agent-tmux.service
wsl-agent-terminal-broker.service
```

Install/render them with:

```bash
scripts/install-terminal-broker-user.sh
```

Then start them if needed:

```bash
systemctl --user start wsl-agent-tmux.service wsl-agent-terminal-broker.service
```

Do not restart tmux merely to deploy broker/provider code. tmux owns the PTY lifetime.

## User-systemd environment

Some non-login shells do not carry the user-bus environment even though the user manager is healthy. For diagnostics:

```bash
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"
systemctl --user status wsl-agent-tmux.service
```

## Logs and state

Default bridge state:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge
```

Default Terminal state:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/wsl-agent-terminal
```

Use `bin/status`, `systemctl --user status ...`, and `journalctl --user -u <unit>` before changing state manually.

## Safe restart order

For ordinary bridge reconciliation:

```bash
bin/stop
bin/start
```

For a personal broker-code update:

1. keep `wsl-agent-tmux.service` running;
2. rerender/install the Terminal units if their source root changed;
3. restart `wsl-agent-terminal-broker.service` only;
4. restart/reconcile the bridge if provider composition or source paths changed;
5. verify tmux PID/lifetime and bridge health.

## Safe source cutover

Rendered configuration contains absolute provider source paths. Before deleting an old checkout/worktree:

1. verify the new source tree is clean and tested;
2. render the same profile using the new `--repo-root`;
3. rerender the Terminal broker units if personal mode is active;
4. restart the broker without restarting tmux;
5. restart the bridge from a control process that is not inside the 1MCP process tree being replaced;
6. verify generated provider paths, `issues: 0`, local/public health, and a real action call;
7. only then remove the old worktree.

A tmux-owned Terminal shell is suitable as an external control process because the PTY lifetime is not owned by 1MCP.

## OAuth continuity

1MCP's `--config-dir` is also its writable OAuth/session home. When changing the state root, preserve inbound OAuth continuity with `scripts/migrate-legacy-oauth-state.sh` before replacing the live service. Do not treat Streamable HTTP transport sessions as credential state.

The superseded migration procedure is preserved under [engineering history](history/acceptance/migration-from-local-bridge.md).

## 1MCP 0.34.4 compatibility

This project intentionally:

- supervises the real 1MCP Node entrypoint instead of relying on `serve --background`;
- verifies/applies the narrow OAuth consent CSP adjustment needed for the HTTPS ChatGPT callback.

These are pinned-version compatibility behaviors. Requalify them when upgrading 1MCP.
