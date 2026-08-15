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

- `filesystem`: `npx -y @modelcontextprotocol/server-filesystem /home/hamza/repo`. Roots are enforced server-side; allows access to `/home/hamza/repo` and all of its subfolders. First `npx` run downloads the package (slow once).
- `shell`: `uvx --from mcp-shell-server==1.1.8 python scripts/mcp-shell-server.py` with `ALLOW_COMMANDS` (`git,pnpm,node,npx,rg,grep,ls,cat,pwd,bash,sh`), `ALLOW_PATTERNS=.*`, and `MCP_SHELL_ALLOW_DANGEROUS=ALL`.
  - Built-in dangerous command blocks (`bash`, `ssh`, `sed`, `xargs`, `env`, etc.) and argument/operator validation are neutralized by `scripts/mcp-shell-server.py` to allow full developer workflow access (including `bash -c`, pipes, redirects, subshells).
  - Timeout: 30 s default / 300 s max timeout, 1 MiB output cap.

Why these commands:

| Command | Used for |
|---|---|
| `git` | status / diff / log / show / restore / add / commit |
| `pnpm` | `pnpm test`, `pnpm run check`, `pnpm semantic:verify`, `pnpm build`, focused package tests |
| `node`, `npx` | `node ...`, `npx ...` one-offs |
| `rg`, `grep` | search inside both repos |
| `ls`, `cat`, `pwd` | orientation |
| `bash`, `sh` | pipelines, multi-step scripts, subshells |

**CWD convention:** the shell server's implicit working directory is the CWD of the `1mcp serve` process — started with CWD `/home/hamza/repo` (`scripts/start.sh` does this). Always pass an explicit `directory` ("satori" or "trufflehog") per call. Boundary: trusted operator on private machine.

### `profiles/hamza-local-dev.yaml` — tunnel-client profile

`mcp.server_urls[0]` = `http://127.0.0.1:3050/mcp` (channel `main`), `startup_wait_timeout: 60s` (waits for the 1MCP listener before the first poll), loopback admin UI on `:8080`, secrets via `env:` refs only.

### `.env` — secrets

```bash
cp .env.example .env
# fill CONTROL_PLANE_API_KEY
set -a; source .env; set +a
```

## 3. Route B (public HTTPS tunnel → 1MCP)

ChatGPT custom MCP apps attach a **remote** MCP endpoint: Workspace/User Settings → Apps → Create → endpoint → auth (if applicable) → **Scan Tools** → draft (Dev label). Verified against the current help article (help.openai.com/en/articles/12584461). No Platform Tunnels RBAC, no Runtime API key, no `tunnel-client`.

### Expose 1MCP

1MCP binds `http://127.0.0.1:3050` (localhost only — do not rebind to `0.0.0.0`); the MCP endpoint is `/mcp`.

For Route B, Cloudflare Tunnel exposes the endpoint over HTTPS:
* **Cloudflare Tunnel (`hamza-wsl` / `mcp.hamza.my.id`)**:
  ```bash
  scripts/tunnel-up.sh     # starts cloudflared tunnel, 1MCP with --enable-auth, and background watchdog
  ```
  Endpoint: `https://mcp.hamza.my.id/mcp` (or custom `$TUNNEL_NAME` / `$TUNNEL_URL`).
* **Stop**: `scripts/tunnel-down.sh` stops the tunnel and watchdog, leaving local 1MCP active. Use `scripts/stop.sh` to stop all processes.

### Create the ChatGPT app

1. **Developer mode must be enabled.** On Business, only workspace **Admins/Owners** can enable it (Workspace Settings → Permissions & Roles → Connected Data Developer mode, or the toggle during app creation). Route B still needs this boss step; it only removes the Platform-tunnel RBAC one.
2. Workspace **Settings → Apps → Create** (or User Settings → Apps → Create if you're an authorized admin).
3. Name `Hamza Local Dev`; MCP endpoint `https://mcp.hamza.my.id/mcp` (or your configured tunnel URL).
4. Authentication: start with **None** for the first proof — then harden (below).
5. **Scan Tools** → expect 15 tools: `filesystem_1mcp_*` (14) + `shell_1mcp_shell_execute` (1).
6. Keep it as a **draft** (Dev label). Test in a new chat, tools render after selecting the app.
7. First prompt: *"Hamza Local Dev is enabled. Read `/home/hamza/repo/satori/package.json` using the app. Do not modify anything."*

### Security: what Route B trades away — and the hardening ladder

Route B makes the endpoint **publicly reachable** while the tunnel runs, and the tool inventory includes filesystem write + shell execution. That is a real change of risk posture versus Route A (outbound polling, endpoint never exposed). Mitigations, in order of preference:

1. **1MCP OAuth (`--enable-auth --external-url https://<tunnel>`)** — ChatGPT's Scan Tools flow supports OAuth ("if your server uses OAuth, complete the authorization prompt"). In `1MCP` v0.34.4, the consent page CSP requires patching `form-action 'self'` to `form-action 'self' https:;` in `@1mcp/agent/build/auth/sdkOAuthServerProvider.js` so browsers permit the `302` redirect back to `chatgpt.com` (handled automatically in `scripts/setup.sh`). Verify 1MCP advertises `refresh_token` in metadata.
2. **Ephemeral windows + random URL** (Quick Tunnel): tunnel only up while working, down after. This is *not authentication* — treat it as the baseline discipline, not the guarantee.
3. **Skip tunnel-level SSO** (Cloudflare Access, ngrok OAuth): those protect browser sessions, not server-side MCP clients like ChatGPT's — they cannot complete an interactive login. Don't invest there.
4. **Route A remains the "never public" option** — same 1MCP stack, `scripts/start.sh`, no exposure at all. Sections 4–7 below.

Known ChatGPT quirks (help article): tools are a **frozen snapshot** — changes to 1MCP inventory after creation need a refresh/recreate; app updates after publish are not automatic on Business (recreate+republish); deep research uses custom apps read/fetch only; agent mode doesn't use custom apps; write actions may prompt for confirmation; web only, no mobile.

## 4. Route A: Tunnel + keys (OpenAI side, ~5 min)

1. **Tunnel**: `https://platform.openai.com/settings/organization/tunnels` → create tunnel (needs Tunnels Read + Manage; if self-serve is disabled ask the org admin) — or `tunnel-client admin tunnels create` with `OPENAI_ADMIN_KEY`. Copy `tunnel_<32 hex>` into `profiles/hamza-local-dev.yaml` → `control_plane.tunnel_id`. After `create`, wait ~25–30 s for the tunnel to become ready.
2. **Runtime API key**: `https://platform.openai.com/settings/organization/api-keys` → create Runtime API key for the principal that holds Tunnels **Read + Use** → export as `CONTROL_PLANE_API_KEY`.

Validate before running anything: `tunnel-client doctor --profile hamza-local-dev` (works from `~/.config/tunnel-client/` — generated via `tunnel-client init --sample sample_mcp_with_dcr --profile hamza-local-dev --tunnel-id <ID> --mcp-server-url http://127.0.0.1:3050/mcp`, or copy this repo's profile next to it).

## 5. Route A: Start the stack (local, in this order)

```bash
scripts/start.sh
```

This: starts 1MCP as a background supervised runtime (scope = `config/`, crash-retry ×5, logs at `config/logs/server.log`), then runs `tunnel-client run --profile hamza-local-dev` in the foreground.

> Known issue: on this machine `1mcp serve --background` via the npm bin shim fails (1MCP 0.34.4 `resolveSelfInvocation` bug — the supervisor re-spawns `node serve ...` because the shim has no `.js` suffix). `scripts/start.sh` works around it by invoking the entry as `node "$(npm root -g)/@1mcp/agent/build/index.js" serve --background`. See README "Known issue".

Verify:

```bash
scripts/status.sh
curl http://127.0.0.1:8080/readyz   # tunnel client ready
1mcp serve --status --config-dir config   # exit 0 = running + ready
```

Local tool-surface check without the tunnel: `scripts/smoke-local.sh`, then `1mcp inspect filesystem` / `1mcp inspect shell` (tools are exposed on the wire as `{server}_1mcp_{tool}`, e.g. `filesystem_1mcp_read_text_file`, `shell_1mcp_shell_execute`).

Diagnose at any time: tunnel-client admin UI `http://127.0.0.1:8080/ui` (request history, log export includes redacted runtime YAML). Stop: `scripts/stop.sh`.

## 6. Route A: ChatGPT Business connector

Keep the daemon running — the connector must discover the tunnel while `tunnel-client run` is healthy.

1. `chatgpt.com/#settings/Connectors` → **Connect to MCP** (or "Create connector") with the tunnel URL/token from Tunnels management for tunnel `<ID>`.
2. After pairing, the connector lists the MCP endpoint; tools from `filesystem` and `shell` should appear (tool names will be namespaced, e.g. `filesystem_*`, `shell_*` — exact prefix is whatever the ChatGPT connector renders).

## 7. Route A: ChatGPT Business developer-mode app (private)

1. ChatGPT **Business** plan → Settings → Developer mode → create app.
2. Attach the connector from step 5; keep the app private to you (do not publish org-wide — the trust model is "trusted operator").
3. Select the app in the chat selector and run the acceptance test: `ACCEPTANCE.md`.

Exact UI labels vary by rollout; they move but the flow (connector ← tunnel, app ← connector) does not.

## 8. Security settings recap (both routes)

| Layer | Measure |
|---|---|
| Transport (Route A) | outbound-only long-poll; MCP server never exposed inbound; `cloudflared` bundled by tunnel-client |
| Transport (Route B) | cover with HTTPS only; ephemeral randomized URL up only while working (scripts/tunnel-up.sh / tunnel-down.sh); preferred hardening = 1MCP `--enable-auth` OAuth (verify `offline_access` refresh-token metadata; help article requires it) — tunnel-level SSO does not work for server-side MCP clients |
| 1MCP | binds `localhost:3050` only; no auth (loopback). If you ever need auth: `--enable-auth` — different deployment, do the OAuth/PRMD readout first (tunnel-client expects a DCR-friendly server for that path) |
| Filesystem | explicit allowed roots, enforced |
| Shell | fully relaxed via `scripts/mcp-shell-server.py` (`MCP_SHELL_ALLOW_DANGEROUS=ALL`, `ALLOW_PATTERNS=.*`); **not** a sandbox — arbitrary command execution as user `hamza`; trust boundary is private machine / operator trust |
| Keys | `.env`-only, `env:` refs in profiles; `OPENAI_ADMIN_KEY` never used by the daemon |

## 9. Evolution (never code a custom bridge)

- Replace shell server → edit `config/mcp.json` (nothing above changes).
- Add database/browser servers → `1mcp mcp add postgres -- ...` / `1mcp mcp add playwright -- ...`.
- Enforce repo confinement below MCP → bubblewrap or dedicated Linux user wrapping `uvx mcp-shell-server`.
- Two apps later, not one → revisit; today one endpoint is the right interface.