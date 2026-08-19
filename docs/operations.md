# Operations

## Core commands

```bash
bin/start
bin/status
bin/stop
```

Healthy status should report one config-scoped 1MCP process, local health ready, cloudflared running, watchdog running, public health OK, bounded retained-diagnostic storage, and `issues: 0`. It prints both the rendered live source root and, when different, the checkout from which diagnostics are being run; live watchdog ownership is matched against the rendered root so inspecting from a candidate worktree does not create a false "watchdog stopped" result. In personal mode it also reports the Terminal broker socket and, when the user-systemd bus is directly reachable, `ActiveState` plus `NRestarts` for the broker unit. A missing user bus is reported separately from the broker socket so user-systemd observability ambiguity is not mistaken for broker failure.

## Optional Satori adapter

The constrained-client adapter is deliberately outside the normal bridge lifecycle. It does not start with `bin/start`, `mcp-dev-bridge.service`, personal bootstrap, or the watchdog.

Install its local Node dependencies once, authorize its dedicated 1MCP OAuth client, then start it explicitly:

```bash
(cd providers/satori-adapter && npm ci)
bin/adapter auth
bin/adapter auth-status
bin/adapter start
bin/adapter status
bin/adapter stop
```

`bin/adapter auth` uses dynamic registration, PKCE, and the live 1MCP authorization-code flow with a temporary loopback callback at `http://127.0.0.1:3052/callback`. The callback listener exists only during authorization. If a Windows-host browser cannot return to the WSL loopback listener after consent, use a browser running in the WSL/Linux context for the approval flow; do not copy OAuth codes into chat or persistent notes. The current live deployment issued an access token without a refresh token, so rerun `bin/adapter auth` when reauthorization is required.

Issue one short-lived adapter capability explicitly when a constrained client needs access:

```bash
bin/adapter issue-cap 3600
bin/adapter revoke-cap <capability-id>
```

Issuance prints a non-secret capability ID, the raw capability once for operator delivery, `scope: main`, and its expiry. The adapter stores only the capability hash. This bearer does not define a second per-tool permission scope: OAuth scope is resolved by the MCP SDK from live 1MCP metadata (currently `tag:code tag:dev tag:terminal`, matching main), and tool discovery mirrors the live 1MCP surface. Legacy `read`/`write` capability rows from the earlier prototype are intentionally not accepted as `main` capabilities. Revocation by ID immediately blocks tool discovery and new submissions. It does not revoke an already-issued operation-scoped read continuation URL; that continuation can only read its existing operation.

For ready-to-paste Qwen/Python and GLM bootstrap prompts, including the connection test and capability-handling rules, see [Satori client bootstrap prompts](satori-clients.md).

Transport discovery is available at `GET /v1/about`. Capability-scoped tool discovery uses `GET /v1/s/{capability}/tools` and `GET /v1/s/{capability}/tool/{tool-name-b64}` and mirrors live 1MCP tool names/descriptors. Universal submission is `GET /v1/s/{capability}/call/{client-nonce}/{request-b64}` using strict unpadded base64url JSON with an initial 256-character encoded-request budget. Qwen/Python-class clients may instead use `POST /v1/calls` with `Authorization: Bearer <capability>`, `Idempotency-Key: <client-nonce>`, `Content-Type: application/json`, and the same request envelope containing the exact 1MCP tool name and arguments. The current enhanced JSON body limit is 16 KiB. Both forms create or read the same durable SQLite operation and return an operation-scoped universal status URL.

Small completed text is returned inline. Larger text is stored as immutable UTF-8-safe chunks of at most 8192 bytes, with a current total normalized result bound of 1 MiB. A completed multi-chunk status response returns `chunk_count` and an operation-scoped `chunk_base_url`; fetch numbered chunks starting at 1.

Every universal GET submission prepares an operation and returns `state: confirmation_required`, an operation status URL, a `confirmation_base`, a separate challenge, expiry, and the exact tool name. The adapter never emits `confirmation_base + challenge` as one executable URL. Construct those two returned components and GET the resulting URL; fetching the incomplete base alone is inert. Enhanced authenticated `POST /v1/calls` dispatches without this GET-specific confirmation step. The existing `POST /v1/confirm/{operation-id}` endpoint may confirm a prepared universal operation using the operation-scoped confirmation capability and challenge.

The universal confirmation window is currently 10 minutes. Capability validity is checked again immediately before dispatch. Dispatch intent is recorded for every upstream tool call; if the worker loses the result after dispatch may have begun, the operation becomes `unknown_outcome` and must not be resubmitted automatically because Satori does not infer which upstream tools are safe to repeat.

The adapter binds to `127.0.0.1:3051`. Current deployment ingress sends only `/probe/*` and `/v1/*` to the adapter; `/mcp`, OAuth, discovery, and all other paths remain on 1MCP `:3050`. Probe evidence, adapter OAuth state, SQLite operations, and continuation-key state live privately beneath `${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/satori-adapter`; PID/runtime state stays beneath `${XDG_RUNTIME_DIR:-/run/user/$UID}/mcp-dev-bridge`.

`bin/adapter` commands never modify Cloudflare configuration. Public adapter ingress remains a separate explicit operator action. Stopping the adapter affects only adapter paths; the normal `/mcp`, OAuth, 1MCP, provider, cloudflared, and watchdog lifecycle remains independent.

## Personal installed lifecycle

The normal private WSL installation is:

```bash
scripts/bootstrap-personal.sh --enable-startup
```

The flag is the explicit startup-consent boundary. The bootstrap renders the personal MCP state, installs `wsl-term` under `~/.local/bin`, renders all user units, enables user linger, and runs `systemctl --user enable --now` for:

```text
wsl-agent-tmux.service
wsl-agent-terminal-broker.service
mcp-dev-bridge.service
```

It also installs a personal `mcp-dev-bridge.service.d/personal.conf` drop-in with `Wants=`/`After=` ordering on the broker. That is startup ordering only: the bridge does not own or stop the tmux lifetime service. Once installed, the services start when this WSL user's systemd manager starts in later WSL sessions. Nothing here configures Windows to launch WSL.

Omitting `--enable-startup` prepares dependencies/configuration and the user-local `wsl-term` command but deliberately leaves user-systemd and linger untouched.

## Public/general user-systemd bridge service

Install the generic bridge unit with:

```bash
scripts/install-systemd-user.sh
systemctl --user start mcp-dev-bridge.service
```

The generated unit uses external `bridge.env` state and the repository's public lifecycle entrypoints.

## Personal Terminal services: lower-level repair path

The private personal harness has two separate user services:

```text
wsl-agent-tmux.service
wsl-agent-terminal-broker.service
```

The personal bootstrap installs these during the normal path. To render/enable only the Terminal units during repair or source cutover, use:

```bash
scripts/install-terminal-broker-user.sh
```

Start them directly only when performing lower-level recovery:

```bash
systemctl --user start wsl-agent-tmux.service wsl-agent-terminal-broker.service
```

Do not restart tmux merely to deploy broker/provider or frontend-launch code. tmux owns the PTY lifetime. Retained-dead panes remain available for reads and exit status, but their transcript `pipe-pane` is finalized at pane death so the per-pane writer receives EOF and exits; broker reconciliation applies the same finalization to historical dead panes that still have a pipe attached.

## Personal Terminal frontend

The personal provider keeps Terminal sessions headless by default. When presentation is requested or a human handoff needs a visible client, it can launch Kitty attached to the exact tmux PTY through `wsl-term present <session>`.

Kitty discovery order is:

1. `MCP_TERMINAL_KITTY_BIN` when it names an executable;
2. `$HOME/.local/kitty.app/bin/kitty`;
3. `kitty` found on `PATH`.

The launcher inherits the explicit Terminal broker socket. If GUI variables are missing under WSL, it derives only the Kitty child environment from WSLg sockets: `/mnt/wslg/runtime-dir/wayland-0`, the WSLg X11 socket, and `/mnt/wslg/PulseServer`. It does not change the broker or tmux service environment.

If automatic presentation fails, the tmux session remains alive. Use an interactive WSL terminal and attach directly:

```bash
wsl-term attach <session>
```

Use `wsl-term present <session>` when you want a designated read-only collaborative viewport while the model keeps control; use `watch` for anonymous observation and `attach` for immediate writable human control.

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

`bin/status` reports current/rotated 1MCP log bytes against the rendered native-rotation policy, finalized Bash spool bytes against the configured aggregate budget, active Bash spool bytes separately, and oldest retained ages. It also flags the obsolete runtime `one-mcp.log` append file if one remains from a pre-hardening launch. These diagnostics are read-only; Pi Dev performs actual spool cleanup at startup and opportunistically after every Bash command.

1MCP's current log lives under `mcp-dev-bridge/logs/` and is rotated by the pinned 1MCP/Winston runtime according to `1mcp/config.toml`. Do not recreate shell `>> one-mcp.log` capture. After upgrading from a deployment that predates `config.toml`, rerun the renderer/bootstrap before restart; `scripts/smoke-local.sh` deliberately rejects stale generated state.

Use `bin/status`, `systemctl --user status ...`, and `journalctl --user -u <unit>` before changing state manually. When a non-login shell lacks the user bus, the broker socket remains the direct runtime signal; derive the bus environment as shown above before interpreting `systemctl --user` failures.

## Safe restart order

For ordinary bridge reconciliation after the rendered state is current:

```bash
bin/stop
bin/start
```

If the source update changed generated provider/application policy (including the bounded 1MCP `config.toml`), rerun `scripts/render-config.mjs` or the appropriate bootstrap first. A fresh hardened 1MCP launch removes the legacy runtime append log and begins native rotated logging.

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

For an installed personal checkout, rerunning `scripts/bootstrap-personal.sh --enable-startup` from the new canonical source root performs the normal render/unit/user-bin convergence before the old checkout is removed.

A tmux-owned Terminal shell is suitable as an external control process because the PTY lifetime is not owned by 1MCP.

## OAuth continuity

1MCP's `--config-dir` is also its writable OAuth/session home. When changing the state root, preserve inbound OAuth continuity with `scripts/migrate-legacy-oauth-state.sh` before replacing the live service. Do not treat Streamable HTTP transport sessions as credential state.

The superseded migration procedure is preserved under [engineering history](history/acceptance/migration-from-local-bridge.md).

## 1MCP 0.34.4 compatibility

This project intentionally:

- supervises the real 1MCP Node entrypoint instead of relying on `serve --background`;
- verifies that the pinned runtime supports structured native `logging.maxSize` / `logging.maxFiles` rotation before relying on it;
- verifies/applies the narrow OAuth consent CSP adjustment needed for the HTTPS ChatGPT callback.

These are pinned-version compatibility behaviors. Requalify them when upgrading 1MCP.
