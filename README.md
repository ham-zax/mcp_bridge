# satori_bridge

Private developer bridge: this ChatGPT Business chat ↔ OpenAI Secure MCP Tunnel ↔ 1MCP ↔ local tool servers. No custom bridge code — assembly only.

```
This ChatGPT Business chat (private developer-mode app)
        │
        ▼
Secure MCP Tunnel (OpenAI-hosted, outbound-only from this machine)
        │  tunnel-client daemon, long-poll loop
        ▼
1MCP aggregator  http://127.0.0.1:3050/mcp
        │
        ├── filesystem  @modelcontextprotocol/server-filesystem
        │     └── /home/hamza/repo/satori
        │     └── /home/hamza/repo/trufflehog
        │
        └── shell      tumf/mcp-shell-server (uvx)
              ├── git  pnpm  node  npx  rg  grep  ls  cat  pwd
              └── process CWD: /home/hamza/repo (convention)
```

## Layers

| Layer | Component | Interface | Config |
|---|---|---|---|
| Tool providers | filesystem MCP, mcp-shell-server | MCP tools | `config/mcp.json` |
| Composition | 1MCP `serve` | one streamable-HTTP MCP endpoint | `config/mcp.json` |
| Transport | `tunnel-client run` (Secure MCP Tunnel) | control-plane long-poll + local MCP client | `profiles/hamza-local-dev.yaml`, `CONTROL_PLANE_API_KEY` |
| Product surface | ChatGPT Business developer-mode app | connector attached to the tunnel | Tunnels management + ChatGPT settings |
| Us | this conversation | — | `ACCEPTANCE.md` |

Each layer is replaceable without touching the ones above it: swap the shell server → edit `config/mcp.json`; add Playwright/Postgres MCP → `1mcp mcp add`; the ChatGPT app sees one ordinary MCP endpoint the whole time.

## Interface contract (read this before trusting the bridge)

- **Filesystem enforcement is real.** The filesystem server only serves the two explicit roots. Everything outside them is denied server-side.
- **Shell restriction is conventional, not a sandbox.** The allowlist + mcp-shell-server's built-in argument hardening (rejects `git -c` overrides, `git config` writes, `find -exec`, `env`, `xargs`, `timeout`, `sed`/`less`/`ssh` shell-escape vectors) is defense in depth. `node`, `npx`, `pnpm` in the allowlist mean any prompt from this chat can run arbitrary code as the user. The actual boundary is: trusted operator, private machine, unauthenticated ChatGPT Business app. The shell server's CWD is `/home/hamza/repo`; per-call `directory` may resolve anywhere on the box.
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

## Docs

- Setup: `docs/PLAN.md`
- First live session from this chat: `ACCEPTANCE.md`
- Verified upstream docs: 1MCP (github.com/1mcp-app/agent, docs.1mcp.app), mcp-shell-server (github.com/tumf/mcp-shell-server), filesystem reference server (github.com/modelcontextprotocol/servers), tunnel-client (github.com/openai/tunnel-client).