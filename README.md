# WebSession MCP Bridge

Turn a Linux or WSL development machine into an authenticated MCP workstation for agents such as ChatGPT.

The bridge keeps files, processes, terminals, repositories, and browser state on the machine where they already live. It exposes a small set of intent-oriented MCP capabilities instead of publishing every backend tool directly into the model context.

The current repository has two release levels: the base bridge (`restricted` and `trusted-dev`) is the public/general surface; the full WSL workstation stack is implemented and qualified as the `personal` profile, but the publication policy still classifies its Code, Terminal, Local/Browser, bootstrap, and Skill files as private-only. That is a packaging boundary inherited from the original single-machine deployment, not a requirement of the architecture.

## What the workstation exposes

Agents should reason about four capability domains rather than individual backend packages:

| Capability | Use it for | Important boundary |
|---|---|---|
| **Dev** | files, guarded edits, native Bash, durable waits, local host actions | execution has the authority of the selected trust profile |
| **Code** | repository structure, symbols, semantic context, callers/dependencies | routes to the nearest canonical Git root; raw CodeDB tools stay hidden |
| **Terminal** | long-running or interactive commands and human handoff | tmux owns PTY/process lifetime; the broker owns transcript and control state |
| **Local** | high-cardinality local capabilities without bloating the outer MCP catalog | exposes only `tool_list`, `tool_schema`, and `tool_call`; Browser is currently the main downstream domain |

The full workstation composition is deliberately small at the client boundary:

```text
Dev       read edit write file_ops wait bash pc_sleep
Code      code_search code_context code_symbol
Terminal  terminal_open terminal_read terminal_send terminal_resize terminal_list terminal_yield terminal_close
Local     tool_list tool_schema tool_call
            |-- browser-fast  observe / execute
            `-- browser       Chrome DevTools diagnostics
```

`browser-fast` is for routine interaction. `browser` keeps the full Chrome DevTools MCP surface for network, console, performance, Lighthouse, heap, screenshots, and detailed debugging.

## Architecture

```text
MCP client (for example ChatGPT)
  |
  | HTTPS + OAuth
  v
Cloudflare Tunnel
  |
  v
1MCP on loopback
  |
  +-- Dev
  +-- Code
  +-- Terminal --------> broker --------> tmux PTYs
  `-- Local
        |
        `-- private inner 1MCP
              |-- browser-fast ---------> Agent Browser
              `-- browser --------------> Chrome DevTools MCP
                         |
                         +-- Windows: dedicated persistent MCP Chrome
                         `-- Linux: managed visible Chrome through WSLg
```

Cloudflare is the current public HTTPS transport and 1MCP is the OAuth/MCP gateway. Providers remain local stdio processes. The Local broker exists so adding or upgrading a large downstream tool catalog does not force the entire catalog into every client session.

## Choose an authority profile

There is no silent default. Pick the authority you intend to give the agent.

| Profile | Authority | Current distribution |
|---|---|---|
| `restricted` | workspace-bounded files plus an allowlisted legacy shell | public/general |
| `trusted-dev` | workspace-bounded files plus unrestricted Bash as the Linux service user | public/general; use only on a dedicated trusted development host |
| `personal` | WSL-user paths, native Bash, Code, persistent Terminal, waits, Local/Browser, optional Windows host sleep | full workstation implementation in this source tree; still publication-gated |

`trusted-dev` and `personal` can act with the Linux account's authority. The `personal` Local domain can additionally control its dedicated Windows MCP Chrome profile after explicit `tag:local` authorization. Read [Security](docs/security.md) before enabling either powerful profile.

## Quick start

### Base bridge

Prerequisites are a Linux or WSL user environment with Node.js/npm, `uv`/`uvx`, `cloudflared`, `curl`, and `flock`, plus a Cloudflare Tunnel hostname that reaches the local 1MCP origin.

```bash
cp .env.example .env
# Set MCP_WORKSPACE_ROOT and MCP_PUBLIC_URL.

scripts/setup.sh --profile restricted
# or, deliberately:
scripts/setup.sh --profile trusted-dev

bin/start
bin/status
```

Healthy status should report the local bridge ready, Cloudflare running, the watchdog running, the public health check passing, and `issues: 0`.

### Full WSL workstation

The full workstation path additionally expects a working systemd user manager. WSLg is required only for visible Linux GUI integration such as the Linux browser target or the Kitty presentation frontend. Native Windows browser control also requires Windows interoperability, Google Chrome, and a Windows `node.exe` discoverable by `where node`.

```bash
cp .env.example .env
# Set MCP_PUBLIC_URL. MCP_PERSONAL_DEFAULT_CWD is optional.

scripts/bootstrap-personal.sh --enable-startup
```

`--enable-startup` is an explicit consent boundary. It installs/renders the user-systemd units, enables user linger when needed, and starts the bridge, tmux lifetime service, and Terminal broker. Omit the flag to prepare dependencies, configuration, and `wsl-term` without changing persistent startup state. The bootstrap does not configure Windows itself to launch WSL.

The repository cannot silently install or replace ChatGPT Skills or client authorization. See [Personal WSL harness](docs/personal/harness.md) for the current source-checkout workflow.

Generated configuration and OAuth/session state live outside Git by default:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/
```

Transient bridge state lives under:

```text
${XDG_RUNTIME_DIR:-/run/user/$UID}/mcp-dev-bridge/
```

## How an agent should route work

Use the narrowest domain that owns the task:

| Task | Route |
|---|---|
| inspect or mutate known files; Git/build/test; bounded command | Dev |
| understand symbols/callers/dependencies after initial repository orientation | Code |
| command must persist, needs a PTY, or may need human input | Terminal |
| routine navigation/forms/clicks in a resource-local browser | Local -> `browser-fast` |
| network/console/performance/screenshot/DevTools investigation | Local -> `browser` |

For large or unfamiliar repositories, begin with bounded Bash/`rg` and focused reads before paying the cost of a new CodeDB index unless indexed intelligence is specifically useful.

For `browser-fast`, observe first and pass the returned `active_tab` to `execute`. Execution validates that exact pinned CDP target before using observation refs. `observe` is the recovery/rebind boundary if the old target disappears. A click follows exactly one newly created target before later actions; multiple new targets stop the sequence rather than guessing. Failed, partial, or unknown actions are never automatically replayed.

## Why Windows Chrome and WSLg are separate targets

This split came from runtime qualification, not from a preference for two browser implementations.

### WSLg is the Linux GUI compatibility layer

The Linux browser target and the Kitty Terminal frontend run as Linux processes beside the WSL filesystem, processes, and network namespace. WSLg gives those processes visible GUI/audio integration without requiring a separate X server.

A daemon or user-systemd service cannot be assumed to inherit the graphical variables from an interactive shell. Where a GUI child needs them, the harness supplies or derives only that child's WSLg environment from the observed WSLg endpoints:

```text
XDG_RUNTIME_DIR=/mnt/wslg/runtime-dir
WAYLAND_DISPLAY=wayland-0
DISPLAY=:0
PULSE_SERVER=unix:/mnt/wslg/PulseServer
```

The broker/tmux parent environment is not rewritten just to make a GUI launcher work. During Linux Chrome qualification, Chrome selected X11 through WSLg by default; the project therefore treats WSLg as the compatibility boundary and does not claim native Wayland unless a future configuration explicitly selects it.

Terminal follows the same principle. tmux owns the PTY lifetime. Kitty/WSLg and Windows Terminal are presentation adapters that attach to the existing PTY; closing or replacing a frontend must not own the shell process.

### Windows uses a dedicated MCP Chrome profile

The earlier attempt to attach automation to the everyday Windows Chrome profile proved unreliable; direct qualification of that normal-profile debugging endpoint produced `403 Forbidden`. The current design does not require `chrome://inspect` and never copies or attaches the user's normal Chrome data directory.

Instead, the harness owns:

```text
%LOCALAPPDATA%\mcp-dev-bridge\chrome-profile
```

It launches visible Chrome with that custom `--user-data-dir` and `--remote-debugging-port=0`, waits for the profile's `DevToolsActivePort`, health-checks the loopback endpoint, and reuses the browser while it remains healthy. Chrome chooses the debugging port, so the product does not reserve a global `9222`.

Both Windows browser surfaces share that one profile and endpoint:

```text
browser-fast -> Agent Browser 0.34.0 -> direct CDP WebSocket
browser      -> Chrome DevTools MCP   -> loopback browser URL
```

This gives the agent persistent cookies/sign-ins in an automation-specific browser without granting MCP control over everyday Chrome. The debugging listener remains loopback-only.

Native Agent Browser on Windows also has a client/daemon lifetime wrinkle when invoked through WSL interoperability: the persistent daemon can inherit output handles from a short-lived CLI and keep the WSL call open. The harness uses a one-shot Windows Node helper that redirects CLI stdout/stderr to bounded files and waits for the CLI process exit, so the daemon does not become the lifetime owner of the WSL invocation.

## Day-to-day operation

```bash
bin/start
bin/status
bin/stop
```

For the base bridge, optional user-session autostart is:

```bash
scripts/install-systemd-user.sh
systemctl --user start mcp-dev-bridge.service
```

For Terminal lifetime, broker recovery, logs, safe restarts, source cutovers, Browser runtime details, and the optional constrained-client WebSession adapter, see [Operations](docs/operations.md).

## Current packaging boundary

The full workstation is not yet packaged as a general public product. `tests/publication.sh` still excludes the following implementation families from the public export:

```text
personal profile/config
Code router
Terminal provider + tmux/broker units
Local broker
Browser + Browser Fast providers
personal bootstrap
tracked ChatGPT Skills
wsl-term
```

Those exclusions were useful while the workstation was being developed against one private deployment. They are now the clearest productization boundary: before calling the full workstation generally installable, these components need portable preflight/install behavior, public documentation, a supported platform matrix, and publication tests that prove the exported package contains them without carrying machine identity or private runtime state.

## Compatibility and security notes

- The project currently pins 1MCP 0.36.0 after qualification of the current provider composition, direct-mode rich Browser results, config reload, and OAuth behavior. Upgrade it deliberately rather than treating it as an unqualified interchangeable dependency.
- 1MCP listens on loopback; Cloudflare supplies the public HTTPS route. OAuth remains required for the public MCP origin.
- The Local broker is one authorization domain. Every downstream MCP admitted behind the same `tag:local` grant must legitimately share that authority.
- Browser debugging endpoints are local implementation details and are not intentionally published beyond loopback.
- Sudo/password/MFA input belongs in a human-controlled Terminal client, not in MCP arguments or agent-visible logs.

See [Security](docs/security.md) for the full trust model.

## Documentation

- [Documentation index](docs/README.md) — choose the right guide
- [Getting started](docs/getting-started.md) — prerequisites, configuration, install, and connection
- [Architecture](docs/architecture.md) — provider, lifecycle, Terminal, Local, and Browser ownership
- [Operations](docs/operations.md) — run, inspect, restart, recover, and upgrade a deployment
- [Security](docs/security.md) — authority profiles and trust boundaries
- [Personal WSL harness](docs/personal/harness.md) — current full-workstation source-checkout workflow
- [Development](docs/development.md) — repository layout and verification
- [Engineering history](docs/history/README.md) — benchmarks, superseded plans, and acceptance evidence

## License

MIT. See [LICENSE](LICENSE).
