# Personal WSL Bootstrap Design

**Date:** 2026-08-17

## Goal

Make a fresh personal WSL checkout self-contained and predictable: after the operator configures deployment identity and explicitly consents to startup installation once, the personal MCP harness should install its local dependencies, render portable configuration, install the human `wsl-term` command, enable the required user services, start them immediately, and start them automatically whenever that WSL user's systemd manager starts in later WSL sessions.

The repository must not install persistent startup behavior without explicit operator consent.

## Operator contract

The canonical personal setup command is:

```bash
scripts/bootstrap-personal.sh --enable-startup
```

The `--enable-startup` flag is the explicit consent boundary. With that flag the bootstrap may install/render user-systemd units, enable user lingering, enable the units, and start them immediately. Without the flag, the bootstrap may prepare local dependencies, render personal MCP state, and install the user-level `wsl-term` command, but must not install, enable, start, stop, or restart persistent user services and must not change linger state.

This design does **not** arrange for Windows to launch WSL at Windows login/boot. It only makes the harness start automatically once the WSL distro/user systemd manager starts.

## Chosen architecture

Use one thin orchestration script over the repository's existing trusted primitives instead of creating another lifecycle implementation.

```text
scripts/bootstrap-personal.sh
  |
  +-- qualify/install personal CLI toolbox
  +-- install/verify pinned bridge runtime (1MCP + CSP compatibility)
  +-- install pinned provider npm dependencies
  +-- render personal 1MCP composition
  +-- install ~/.local/bin/wsl-term
  |
  `-- only with --enable-startup
        +-- render Terminal user units
        +-- render bridge user unit
        +-- install personal bridge ordering drop-in
        +-- enable linger for this user when needed
        +-- systemctl --user daemon-reload
        +-- enable --now tmux + broker + bridge
        `-- verify service and bridge health
```

Keep `scripts/install-systemd-user.sh`, `scripts/install-terminal-broker-user.sh`, `scripts/render-config.mjs`, `bin/start`, `bin/status`, and `bin/stop` as lower-level implementation/operator primitives. The bootstrap coordinates them; it does not duplicate their internals.

### Alternatives considered

1. **Extend `scripts/setup.sh` to own public and personal installation.** Rejected because public setup intentionally has a smaller publication/trust contract. Keeping a dedicated private bootstrap preserves that boundary.
2. **Replace all installers with one monolithic script.** Rejected because it would duplicate working unit-rendering/lifecycle logic and make public/private maintenance more coupled.
3. **Require the operator to keep following the existing manual sequence.** Rejected because it is the source of the current drift: dependency installation, rendering, service installation, startup, and CLI availability are split across several documents and commands.

## Portable personal defaults

No tracked runtime file may contain `/home/hamza` as an operational default.

For the personal profile:

- `MCP_DEV_PATH_MODE=user` remains tracked policy.
- The personal default cwd is resolved at render time from `MCP_PERSONAL_DEFAULT_CWD` when explicitly supplied in `.env`/environment; otherwise it defaults to the actual service user's `$HOME`.
- The resolved cwd is used consistently for Dev and Code.
- The Terminal broker unit uses the rendered user home as `MCP_TERMINAL_DEFAULT_CWD`.
- The raw personal MCP template contains no machine-specific home path.
- Runtime fallbacks inside Terminal and Code Router use the current process/user home (`$HOME`, with the platform home lookup as fallback), never a named user's home directory. This keeps direct/provider startup portable even if an expected rendered cwd environment variable is absent.

`MCP_WORKSPACE_ROOT` remains the public-profile workspace root. It is not silently reused as the personal home/default cwd because a copied `.env.example` value may not exist on another WSL installation.

## `wsl-term` installation

Install a user-level command at:

```text
~/.local/bin/wsl-term
```

Prefer a symlink to the repository's tracked `bin/wsl-term`, and make `bin/wsl-term` resolve its own real path so invocation through that symlink still finds the repository correctly.

The bootstrap creates `~/.local/bin` when needed. It must not require root merely to install `wsl-term`. The setup output should report whether the current shell already contains `~/.local/bin` on `PATH`; standard future WSL login shells should discover the command through the normal user-local PATH convention. The repository must not rewrite arbitrary shell startup files as part of this feature.

## Startup and lifetime semantics

The existing lifetime boundaries remain unchanged:

- `wsl-agent-tmux.service` owns the private tmux server and PTY/process lifetime.
- `wsl-agent-terminal-broker.service` requires and starts after that tmux service.
- `mcp-dev-bridge.service` owns bridge startup/reconciliation, not Terminal PTY lifetime.

For a personal startup install, add a user-systemd drop-in for `mcp-dev-bridge.service` containing only startup ordering:

```ini
[Unit]
Wants=wsl-agent-terminal-broker.service
After=wsl-agent-terminal-broker.service
```

Do not add reverse lifetime coupling, `PartOf=`, `BindsTo=`, or bridge-driven Terminal shutdown. A broker/provider/bridge restart must not make the bridge own tmux PTY lifetime.

With explicit startup consent, the bootstrap should ensure user lingering is enabled so the user's systemd manager and enabled services can remain available independently of an open interactive terminal. If enabling linger fails, fail with a clear actionable error rather than claiming startup persistence is installed.

## Dependency policy

The public and personal setup paths share `scripts/install-bridge-runtime.sh` as the single owner of the pinned 1MCP installation, HTTPS OAuth consent CSP compatibility patch, and foundational runtime prerequisite checks (`node`, `npm`, `npx`, `uv`, `uvx`, `cloudflared`, `curl`, and `flock`). Public `scripts/setup.sh` and personal `scripts/bootstrap-personal.sh` both call that helper rather than duplicating the compatibility logic.

The personal bootstrap also reuses `scripts/setup-personal-toolbox.sh` and the pinned npm lockfiles. It may install the approved user/distro CLI toolbox according to that script's existing policy and run:

```text
npm --prefix providers/pi-dev ci --omit=dev
npm --prefix providers/code-router ci --omit=dev
npm --prefix providers/terminal ci --omit=dev
```

It does not silently replace an existing incompatible Node/Python/systemd installation; those remain qualified prerequisites under the toolbox policy.

Kitty remains an optional presentation frontend, not a service/lifetime dependency. Automatic Terminal presentation uses it when available and keeps the existing exact `wsl-term attach` fallback when it is not. This bootstrap does not introduce an unpinned GUI installer.

## Idempotency and source movement

Rerunning the bootstrap from the same checkout must be safe:

- npm installs converge to lockfiles;
- rendering replaces generated state atomically;
- the `wsl-term` symlink is replaced only when it targets the wrong path;
- user units/drop-in are rerendered deterministically;
- `systemctl enable --now` is idempotent;
- already-enabled linger is left alone.

Generated provider commands and installed units still contain the canonical checkout path. If the repository is moved, rerun the bootstrap from the new checkout before deleting the old one.

## New ChatGPT boundary

The repository can make the WSL side autonomous after explicit startup installation. It cannot silently install a ChatGPT connector, complete OAuth consent, refresh ChatGPT's cached MCP schema, or install ChatGPT-hosted Skills from the local filesystem.

Documentation must reduce the fresh-client work to the unavoidable client-side steps:

1. connect ChatGPT to the configured public MCP URL and complete OAuth;
2. refresh/reopen the MCP connection when the provider catalog changes;
3. install/import desired ChatGPT Skills from the tracked `skills/` bundles when using a new ChatGPT environment.

Do not describe WSL service startup, Terminal broker startup, or `wsl-term` PATH setup as recurring manual ChatGPT setup.

## Documentation ownership

Make `README.md` the short entry point and `docs/personal/harness.md` the authoritative personal install/use guide.

Update the operating documentation so it consistently says:

- personal surface = 16 actions (Dev 6 + Code 3 + Terminal 7);
- one canonical bootstrap command;
- explicit `--enable-startup` consent semantics;
- `wsl-term` installed in `~/.local/bin`;
- enabled services start automatically with the WSL user manager;
- no Windows auto-launch is configured;
- lower-level install/start commands are advanced/recovery paths, not the normal first install.

Historical plans/benchmarks remain historical evidence and are not rewritten merely to match the new operating manual.

## Verification and acceptance

Automated tests must prove at least:

1. Personal rendering and direct Terminal/Code runtime defaults under a synthetic `HOME` use that home and contain no `/home/hamza` operational default.
2. `MCP_PERSONAL_DEFAULT_CWD` overrides the default and must be absolute.
3. The Terminal broker unit renders its default cwd from the target user's home.
4. Bootstrap without `--enable-startup` does not install units, call `systemctl enable/start`, or change linger state.
5. Bootstrap with `--enable-startup` renders all three units plus the personal ordering drop-in, enables lingering when needed, and requests `enable --now` for the correct services.
6. The user-bin installation makes `wsl-term` executable through the installed path and resolves back to the current checkout correctly.
7. Rerunning the fixture bootstrap is idempotent.
8. Public and personal setup both use the same pinned bridge-runtime installer, preserving the qualified 1MCP version and CSP patch.
9. Existing harness, lifecycle, personal-toolbox, publication, Terminal, Code Router, documentation-link, and syntax checks remain green where their contracts are affected.

Live acceptance on this machine, after code is merged into the canonical checkout, should run the new bootstrap with explicit startup consent and verify:

- current tmux PID is not restarted unnecessarily;
- Terminal broker and bridge services are enabled and active/healthy;
- user linger is `yes`;
- `command -v wsl-term` resolves from the user bin and `wsl-term list` works;
- `bin/status` reports local/public health ready and `issues: 0`.
