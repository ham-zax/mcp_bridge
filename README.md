# hamza_bridge (Hamza WSL Bridge)

Private developer bridge: this ChatGPT Business chat ↔ OpenAI Secure MCP Tunnel / Cloudflare Tunnel ↔ 1MCP ↔ local tool servers. No custom bridge code — assembly only.

```
This ChatGPT Business chat (private developer-mode app)
        │
        ▼
Transport — pick one:
  Route A: OpenAI Secure MCP Tunnel (tunnel-client, outbound-only, endpoint not public)
  Route B: your own public HTTPS tunnel → https://<tunnel>/mcp   ← simplest
        │
        ▼
1MCP aggregator  http://127.0.0.1:3050/mcp
        │
        ├── filesystem  @modelcontextprotocol/server-filesystem
        │     └── /home/hamza/repo (and all subfolders)
        │
        └── shell      tumf/mcp-shell-server (uvx)
              ├── git  pnpm  node  npx  rg  grep  ls  cat  pwd  bash  sh
              └── process CWD: /home/hamza/repo (convention)
```

## Layers

| Layer | Component | Interface | Config |
|---|---|---|---|
| Tool providers | filesystem MCP, mcp-shell-server | MCP tools | `config/mcp.json` |
| Composition | 1MCP `serve` | one streamable-HTTP MCP endpoint | `config/mcp.json` |
| Transport (Route A) | `tunnel-client run` (Secure MCP Tunnel) | control-plane long-poll + local MCP client | `profiles/hamza-local-dev.yaml`, `CONTROL_PLANE_API_KEY` |
| Transport (Route B) | your public HTTPS tunnel → `:3050` | forward `https://<tunnel>/mcp` | `scripts/tunnel-up.sh` |
| Product surface | ChatGPT Business developer-mode app | connector attached to the tunnel | Tunnels management + ChatGPT settings |
| Us | this conversation | — | `ACCEPTANCE.md` |

Each layer is replaceable without touching the ones above it: swap the shell server → edit `config/mcp.json`; add Playwright/Postgres MCP → `1mcp mcp add`; the ChatGPT app sees one ordinary MCP endpoint the whole time.

## Interface contract (read this before trusting the bridge)

- **Filesystem enforcement is real.** The filesystem server serves `/home/hamza/repo` and all of its subfolders. Everything outside `/home/hamza/repo` is denied server-side.
- **Shell restriction is conventional, not a sandbox — and it is currently switched off.** The allowlist (`ALLOW_COMMANDS`) and mcp-shell-server's built-in hardening (git `-c` overrides, `find -exec`, shell-operator tokens, and the `DANGEROUS_COMMANDS` set: `bash`, `ssh`, `sed`, `xargs`, `env`, …) are bypassed for this server: `scripts/mcp-shell-server.py` is run with `ALLOW_PATTERNS=.*` and `MCP_SHELL_ALLOW_DANGEROUS=ALL`, which clears the dangerous-command set and neutralizes the operator/arg checks. Verified working: `bash -c` (incl. `;`/pipes), `ssh`, `find -exec`, `git -c`, `sed`, `python3`, `xargs`. The actual boundary is: trusted operator, private machine, unauthenticated ChatGPT Business app. Anyone who can reach the endpoint can run any command as the user (`hamza`). The shell server's CWD is `/home/hamza/repo`; per-call `directory` may resolve anywhere on the box.
- If the app is ever shared with anyone else, or the machine hosts untrusted work, add an OS sandbox (bubblewrap / dedicated user / container) around mcp-shell-server **below** the MCP layer — the architecture does not change.
- `1MCP` binds `localhost:3050` only. Anything bound to `0.0.0.0` or with `--enable-auth` is a different deployment.

## Ops

```bash
scripts/start.sh        # start 1MCP (background) + tunnel-client (foreground)
scripts/status.sh       # state of both daemons + health endpoints
scripts/smoke-local.sh  # local initialize call against 1MCP, before the tunnel matters
scripts/stop.sh         # stop both
```

Admin UIs: 1MCP at `http://127.0.0.1:3050` health endpoints; tunnel-client admin UI at `http://127.0.0.1:8080/ui`, `/healthz`, `/readyz`.

## Known issues: 1MCP (v0.34.4)

### 1. `serve --background` npm shim bug
`1mcp serve --background` fails on npm-global installs with `Error: background runtime did not become ready (background process exited before becoming ready)` and no log file. Root cause: `resolveSelfInvocation()` keys off `argv[1]` ending in `.js`; the npm bin shim `~/.nvm/.../bin/1mcp` is extensionless, so the supervisor re-spawns `node serve --transport ...` (a nonexistent script) and the child dies instantly.

Workaround (what `scripts/start.sh` and `scripts/tunnel-up.sh` do): invoke the real entry explicitly —
```bash
node "$(npm root -g)/@1mcp/agent/build/index.js" serve --background --config-dir <scope>
```

### 2. OAuth Consent Page CSP redirect block
In `1MCP` v0.34.4, the OAuth consent page sends `Content-Security-Policy: ... form-action 'self'; ...`. Per W3C CSP Level 3, browsers enforce `form-action` on HTTP `302` redirects following form submissions. Because the redirect target (`https://chatgpt.com/connector/oauth/...`) is on a different domain, browsers block navigation, leaving the user stuck on the consent page after clicking "Approve".

Workaround (applied in `scripts/setup.sh`): patch `form-action 'self'` to `form-action 'self' https:;` in `@1mcp/agent/build/auth/sdkOAuthServerProvider.js`:
```bash
sed -i "s/form-action 'self'/form-action 'self' https:/g" "$(npm root -g)/@1mcp/agent/build/auth/sdkOAuthServerProvider.js"
```

## Docs

- Setup: `docs/PLAN.md`
- First live session from this chat: `ACCEPTANCE.md`
- Verified upstream docs: 1MCP (github.com/1mcp-app/agent, docs.1mcp.app), mcp-shell-server (github.com/tumf/mcp-shell-server), filesystem reference server (github.com/modelcontextprotocol/servers), tunnel-client (github.com/openai/tunnel-client).