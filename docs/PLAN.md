# Installation plan — Hamza Local Dev bridge

Architecture: ChatGPT Business app → Secure MCP Tunnel → 1MCP → {filesystem, shell}. No custom bridge code.

## 0. Prerequisites (verified on this machine)

| Tool | Version | Checked |
|---|---|---|
| node | v24.19.0 | ✅ |
| pnpm | 10.28.2 | ✅ |
| npm | 12.0.2 | ✅ |
| python3 / uv / uvx | 3.12.3 / 0.11.18 (mcp-shell-server runs via uvx — no pip install) | ✅ |
| ports 3050 (1MCP), 8080 (tunnel-client admin UI) | free | ✅ |

Nothing of this stack is installed yet (`1mcp`, `tunnel-client` absent; no stale config dirs).

## 1. Install packages

```bash
npm install -g @1mcp/agent        # aggregator (Apache-2.0)
```

`tunnel-client` (go binary + bundled cloudflared, Apache-2.0): install via the platform Tunnels page — `https://platform.openai.com/settings/organization/tunnels` has the supported Linux amd64 download — or `github.com/openai/tunnel-client/releases`. Extract `tunnel-client` (+ sibling `cloudflared`) to `~/.local/bin`. Homebrew is macOS-only. Verify: `tunnel-client --version` and `tunnel-client help quickstart`.

Optional re-run: `scripts/setup.sh` automates steps 1 + checks.

## 2. Config files (already in this repo)

### `config/mcp.json` — 1MCP inventory

- `filesystem`: `npx -y @modelcontextprotocol/server-filesystem /home/hamza/repo/satori /home/hamza/repo/trufflehog`. Roots are enforced server-side; anything outside is denied. First `npx` run downloads the package (slow once).
- `shell`: `uvx mcp-shell-server` with `ALLOW_COMMANDS`: `git,pnpm,node,npx,rg,grep,ls,cat,pwd`. Explicitly absent: `bash sh ssh curl wget env sudo rm xargs timeout sed less vim` and any exec-vector tools.

Why this allowlist:

| Command | Used for |
|---|---|
| `git` | status / diff / log / show / restore / add / commit (mcp-shell-server's built-in hardening rejects `git -c` overrides and `git config` writes) |
| `pnpm` | `pnpm test`, `pnpm run check`, `pnpm semantic:verify`, `pnpm build`, focused package tests |
| `node`, `npx` | `node ...`, `npx ...` one-offs |
| `rg`, `grep` | search inside both repos |
| `ls`, `cat`, `pwd` | orientation |

Shell server hardening that comes with the package (defense in depth, *not* a sandbox): argv-only execution (no shell-string parsing), rejected exec vectors (`find -exec`, `env`, `xargs`, wrappers, shell launchers), contained redirection (relative to the working dir only), isolated child environment (no inherited secrets; `MCP_SHELL_CHILD_ENV_ALLOWLIST` opt-in), 30 s default / 300 s max timeout, 1 MiB output cap, structured audit logs with redaction.

**CWD convention:** the shell server's implicit working directory is the CWD of the `1mcp serve` process — start 1MCP with CWD `/home/hamza/repo` (`scripts/start.sh` does this). Always pass an explicit `directory` ("satori" or "trufflehog") per call. This is convention, not enforcement: `git -C`, absolute `rg` paths, `cat` outside the repos still work. OS sandbox (bubblewrap / dedicated user) closes this later without changing the architecture.

### `profiles/hamza-local-dev.yaml` — tunnel-client profile

`mcp.server_urls[0]` = `http://127.0.0.1:3050/mcp` (channel `main`), `startup_wait_timeout: 60s` (waits for the 1MCP listener before the first poll), loopback admin UI on `:8080`, secrets via `env:` refs only.

### `.env` — secrets

```bash
cp .env.example .env
# fill CONTROL_PLANE_API_KEY
set -a; source .env; set +a
```

## 3. Tunnel + keys (OpenAI side, ~5 min)

1. **Tunnel**: `https://platform.openai.com/settings/organization/tunnels` → create tunnel (needs Tunnels Read + Manage; if self-serve is disabled ask the org admin) — or `tunnel-client admin tunnels create` with `OPENAI_ADMIN_KEY`. Copy `tunnel_<32 hex>` into `profiles/hamza-local-dev.yaml` → `control_plane.tunnel_id`. After `create`, wait ~25–30 s for the tunnel to become ready.
2. **Runtime API key**: `https://platform.openai.com/settings/organization/api-keys` → create Runtime API key for the principal that holds Tunnels **Read + Use** → export as `CONTROL_PLANE_API_KEY`.

Validate before running anything: `tunnel-client doctor --profile hamza-local-dev` (works from `~/.config/tunnel-client/` — generated via `tunnel-client init --sample sample_mcp_with_dcr --profile hamza-local-dev --tunnel-id <ID> --mcp-server-url http://127.0.0.1:3050/mcp`, or copy this repo's profile next to it).

## 4. Start the stack (local, in this order)

```bash
scripts/start.sh
```

This: starts 1MCP as a background supervised runtime (scope = `config/`, crash-retry ×5, logs at `config/logs/server.log`), then runs `tunnel-client run --profile hamza-local-dev` in the foreground.

Verify:

```bash
scripts/status.sh
curl http://127.0.0.1:8080/readyz   # tunnel client ready
1mcp serve --status --config-dir config   # exit 0 = running + ready
```

Diagnose at any time: tunnel-client admin UI `http://127.0.0.1:8080/ui` (request history, log export includes redacted runtime YAML). Stop: `scripts/stop.sh`.
Without the tunnel: `scripts/smoke-local.sh` proves 1MCP + both providers locally.

## 5. ChatGPT Business connector

Keep the daemon running — the connector must discover the tunnel while `tunnel-client run` is healthy.

1. `chatgpt.com/#settings/Connectors` → **Connect to MCP** (or "Create connector") with the tunnel URL/token from Tunnels management for tunnel `<ID>`.
2. After pairing, the connector lists the MCP endpoint; tools from `filesystem` and `shell` should appear (tool names will be namespaced, e.g. `filesystem_*`, `shell_*` — exact prefix is whatever the ChatGPT connector renders).

## 6. ChatGPT Business developer-mode app (private)

1. ChatGPT **Business** plan → Settings → Developer mode → create app.
2. Attach the connector from step 5; keep the app private to you (do not publish org-wide — the trust model is "trusted operator").
3. Select the app in the chat selector and run the acceptance test: `ACCEPTANCE.md`.

Exact UI labels vary by rollout; they move but the flow (connector ← tunnel, app ← connector) does not.

## 7. Security settings recap

| Layer | Measure |
|---|---|
| Transport | outbound-only long-poll; MCP server never exposed inbound; `cloudflared` bundled by tunnel-client |
| 1MCP | binds `localhost:3050` only; no auth (loopback). If you ever need auth: `--enable-auth` — different deployment, do the OAuth/PRMD readout first (tunnel-client expects a DCR-friendly server for that path) |
| Filesystem | explicit allowed roots, enforced |
| Shell | allowlist + built-in hardening + isolated env + audit logs + 300 s timeout cap; **not** a sandbox — convention only, fine for a private app on your machine |
| Keys | `.env`-only, `env:` refs in profiles; `OPENAI_ADMIN_KEY` never used by the daemon |

## 8. Evolution (never code a custom bridge)

- Replace shell server → edit `config/mcp.json` (nothing above changes).
- Add database/browser servers → `1mcp mcp add postgres -- ...` / `1mcp mcp add playwright -- ...`.
- Enforce repo confinement below MCP → bubblewrap or dedicated Linux user wrapping `uvx mcp-shell-server`.
- Two apps later, not one → revisit; today one endpoint is the right interface.