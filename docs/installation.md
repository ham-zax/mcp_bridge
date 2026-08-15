# Installation

## Prerequisites

The current bridge expects Linux/WSL with systemd user services and these commands available:

```text
node npm npx uv uvx cloudflared curl flock
```

A Cloudflare Tunnel must already publish the chosen HTTPS hostname to the local 1MCP origin on port 3050.

## Configure deployment identity

```bash
cp .env.example .env
```

Set at least:

```text
MCP_WORKSPACE_ROOT=/absolute/path/to/code
MCP_PUBLIC_URL=https://mcp.example.com
MCP_TUNNEL_NAME=
```

## Choose trust policy explicitly

There is no default trust profile.

```bash
scripts/setup.sh --profile restricted
```

or for a dedicated development machine where unrestricted service-user authority is intentional:

```bash
scripts/setup.sh --profile trusted-dev
```

Setup installs/verifies the pinned bridge dependencies, verifies/applies the 1MCP 0.34.4 OAuth CSP compatibility patch, and renders the selected deployment into external state.

## Start manually

```bash
bin/start
bin/status
```

## Install user-session autostart

```bash
scripts/install-systemd-user.sh
systemctl --user start mcp-dev-bridge.service
systemctl --user status mcp-dev-bridge.service
```

The installer enables the generic unit but does not automatically disable an older service installation.
