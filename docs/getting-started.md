# Getting Started

This guide covers the public/general bridge path. For the private Codex-like WSL harness, continue with [Personal harness](personal/harness.md).

## 1. Prerequisites

You need a Linux or WSL user environment with:

- Node.js and npm;
- `uv` / `uvx`;
- `cloudflared`;
- `curl` and `flock`;
- a Cloudflare Tunnel hostname that reaches the local 1MCP origin.

The repository also pins provider dependencies and validates them during setup/tests.

## 2. Configure deployment identity

```bash
cp .env.example .env
```

Edit at least:

```text
MCP_WORKSPACE_ROOT=/absolute/path/to/code
MCP_PUBLIC_URL=https://mcp.example.com
MCP_TUNNEL_NAME=
```

`.env` is local deployment input and is ignored by Git.

## 3. Choose a trust profile explicitly

Conservative install:

```bash
scripts/setup.sh --profile restricted
```

Trusted dedicated development host:

```bash
scripts/setup.sh --profile trusted-dev
```

There is no silent default. Read [Security](security.md) before choosing `trusted-dev`.

The private `personal` profile is rendered through the private harness path described in [Personal harness](personal/harness.md); `scripts/setup.sh` intentionally accepts only the two public/general profiles.

## 4. Start and verify

```bash
bin/start
bin/status
```

Healthy status should report:

```text
local health: ready
cloudflared: running
watchdog: running
public health: ok
issues: 0
```

Then refresh the connector/Actions catalog in ChatGPT when provider composition changed.

## 5. Optional user-systemd autostart

```bash
scripts/install-systemd-user.sh
systemctl --user start mcp-dev-bridge.service
```

The installer renders a generic user unit; it does not silently remove an older unrelated installation.

## 6. Generated state

Persistent bridge/1MCP state defaults to:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/
```

Transient runtime state defaults to:

```text
${XDG_RUNTIME_DIR:-/run/user/$UID}/mcp-dev-bridge/
```

Do not place generated OAuth/session state inside the Git checkout.

## Next

- [Configuration](configuration.md)
- [Operations](operations.md)
- [Security](security.md)
- [Troubleshooting](troubleshooting.md)
