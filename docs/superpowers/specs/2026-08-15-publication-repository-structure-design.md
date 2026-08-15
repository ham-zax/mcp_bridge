# Publication-Ready Repository Structure Design

## Goal

Turn the current machine-specific `satori_bridge` repository into a publishable, reusable Linux/WSL project without destabilizing the working Cloudflare OAuth bridge or prematurely implementing the later CodeDB/Pi harness.

The public project should support two policy profiles:

- `restricted` — conservative public default.
- `trusted-dev` — first-class unrestricted development mode; the shell/provider receives the same effective access as the Linux user running the bridge.

Machine identity and deployment values must not be part of tracked source.

## Non-goals

This refactor does **not** implement CodeDB, Pi, `await_until`, Terminal, RTK, GCF, a package release pipeline, Docker images, or a branded CLI.

It also does not redesign the proven 1MCP/cloudflared/watchdog lifecycle. Structural moves may change file paths, but behavior must remain equivalent and covered by the existing lifecycle suite.

## Working public identity

Use the neutral working name **MCP Development Bridge** in public documentation and service names. Do not rename the Git repository itself yet; final branding can happen before publication.

Public description:

> Authenticated MCP development bridge for running coding tools on a trusted Linux/WSL machine through ChatGPT.

## Design principles

1. **Generic core, local deployment.** Tracked source describes reusable behavior; hostnames, home directories, workspace roots, tunnel identity, and runtime state live outside tracked source.
2. **Profiles describe policy, not identity.** `trusted-dev` means unrestricted agent access as the service user. It never means `/home/hamza`, a specific domain, or a specific repository root.
3. **One public lifecycle interface.** Users operate `bin/start`, `bin/status`, and `bin/stop`; lifecycle internals stay behind that interface.
4. **Compatibility before cleanup.** Existing `scripts/start.sh`, `scripts/status.sh`, `scripts/stop.sh`, `scripts/tunnel-up.sh`, and `scripts/tunnel-down.sh` remain thin wrappers during migration so the currently installed systemd service does not break when the branch is later merged.
5. **Generated configuration is authoritative.** 1MCP runs from ignored local config generated from tracked templates + selected profile + local `.env` values.
6. **No speculative packaging.** Do not create a monorepo, publish npm packages, add release automation, or invent a full CLI until external use justifies it.

## Target repository layout

```text
.
├── README.md
├── LICENSE
├── SECURITY.md
├── CONTRIBUTING.md
├── .env.example
├── .gitignore
│
├── bin/
│   ├── start
│   ├── status
│   └── stop
│
├── lib/
│   └── bridge/
│       ├── common.sh
│       └── watchdog.sh
│
├── providers/
│   ├── README.md
│   └── legacy-shell/
│       └── server.py
│
├── config/
│   ├── templates/
│   │   └── mcp.json
│   └── profiles/
│       ├── restricted.env
│       └── trusted-dev.env
│
├── systemd/
│   └── mcp-dev-bridge.service.in
│
├── scripts/
│   ├── setup.sh
│   ├── render-config.mjs
│   ├── install-systemd-user.sh
│   ├── smoke-local.sh
│   ├── start.sh              # compatibility wrapper
│   ├── status.sh             # compatibility wrapper
│   ├── stop.sh               # compatibility wrapper
│   ├── tunnel-up.sh          # compatibility wrapper
│   └── tunnel-down.sh        # compatibility wrapper
│
├── examples/
│   └── wsl-trusted-dev/
│       ├── README.md
│       └── .env.example
│
├── tests/
│   ├── lifecycle.sh
│   └── publication.sh
│
└── docs/
    ├── architecture.md
    ├── installation.md
    ├── configuration.md
    ├── operations.md
    ├── security.md
    ├── development.md
    ├── acceptance.md
    ├── benchmarks/
    └── superpowers/
```

Directories that are local-only and ignored:

```text
.env
config/local/
run/
```

`config/logs/`, `config/sessions/`, PID files, Python caches, and other runtime artifacts remain ignored as well.

## Runtime boundary

### Public entrypoints

`bin/start`, `bin/status`, and `bin/stop` become the canonical user-facing commands.

They own no duplicated logic. Internal lifecycle logic moves under `lib/bridge/` and remains sourceable/testable. The old `scripts/*.sh` lifecycle entrypoints remain wrappers that `exec` the new canonical paths.

This gives the public project a clean interface while preserving compatibility with the already-installed `hamza-cloudflare-oauth-bridge.service` until the local machine is deliberately migrated to the generic service.

### Lifecycle invariants preserved

The refactor must preserve all current guarantees:

- exactly one config-scoped 1MCP origin;
- exactly one cloudflared process;
- exactly one watchdog;
- direct 1MCP supervision, not `serve --background`;
- exact PID/process-group ownership;
- lifecycle locking with `flock`;
- transactional startup rollback;
- local readiness before public exposure;
- public readiness before watchdog activation;
- watchdog recovery without duplicate processes;
- no global `pkill`/`pgrep` lifecycle management.

The existing 22 lifecycle tests remain behavioral gates and are updated only for path/name changes.

## Configuration boundary

### Tracked configuration

Tracked files contain templates and policy defaults only:

```text
config/templates/mcp.json
config/profiles/restricted.env
config/profiles/trusted-dev.env
.env.example
```

They contain no `/home/hamza`, `mcp.hamza.my.id`, machine hostname, tunnel ID, PID, secret, or runtime log path.

### Local deployment configuration

A user's ignored `.env` supplies deployment identity:

```text
MCP_BRIDGE_PROFILE=trusted-dev
MCP_WORKSPACE_ROOT=/home/user/code
MCP_PUBLIC_URL=https://mcp.example.com
MCP_TUNNEL_NAME=
```

For Hamza's machine the selected values remain:

```text
MCP_BRIDGE_PROFILE=trusted-dev
MCP_WORKSPACE_ROOT=/home/hamza/repo
MCP_PUBLIC_URL=https://mcp.hamza.my.id
```

Those values are examples of local state only and must not be committed to public templates.

### Generated local MCP config

`scripts/render-config.mjs` reads:

1. the tracked MCP template;
2. the selected tracked policy profile;
3. local `.env` deployment values;
4. the current repository root discovered at runtime.

It writes:

```text
config/local/mcp.json
```

The generated file is ignored and becomes the preferred 1MCP config.

During migration, runtime lookup is compatibility-aware:

```text
if config/local/mcp.json exists:
    use config/local/
else if legacy config/mcp.json exists:
    use legacy config/
else:
    fail with setup guidance
```

The legacy tracked `config/mcp.json` is removed only after the local configuration generator and migration test are working.

## Policy profiles

### `restricted`

This is the public default. It should expose only the configured workspace and a conservative shell policy appropriate for a general install. Exact allowed-command contents are an implementation detail, but the profile must never silently become unrestricted.

### `trusted-dev`

This is fully supported and tested, not hidden behind warnings or treated as unsupported.

Its contract is explicit:

> MCP command execution has the effective permissions of the Linux user running the bridge. Commands may access files, processes, network resources, credentials, and tools available to that user. Intended for dedicated development environments where this access is deliberate.

Hamza's installation uses `trusted-dev`.

## Provider boundary

Provider-specific implementation should not live in generic lifecycle scripts.

The current Python shell shim moves to:

```text
providers/legacy-shell/server.py
```

It remains transitional infrastructure until the later Pi-backed Files/Shell phase proves itself and removes it.

`providers/README.md` documents the provider boundary and reserves the directory for later implementations such as `pi-dev/` without scaffolding empty packages now.

## Systemd boundary

The tracked unit becomes a generic template:

```text
systemd/mcp-dev-bridge.service.in
```

It contains placeholders for repository root, home directory, public URL, and execution PATH where necessary.

`scripts/install-systemd-user.sh` renders and installs:

```text
~/.config/systemd/user/mcp-dev-bridge.service
```

The installer derives the current repository root and user home instead of assuming `/home/hamza/repo/satori_bridge`.

The existing installed `hamza-cloudflare-oauth-bridge.service` is not removed automatically. Migration is explicit:

1. generate local config;
2. install/enable generic unit;
3. verify generic unit starts the bridge cleanly;
4. disable the old unit;
5. leave removal of the old unit file to an explicit cleanup step.

Compatibility wrappers guarantee that merely merging the repository refactor cannot strand the currently installed old unit.

## Documentation boundary

### README

The public README becomes a landing page rather than a machine runbook:

1. what the project is;
2. architecture diagram;
3. quick start;
4. `restricted` vs `trusted-dev`;
5. supported environment assumptions;
6. lifecycle commands;
7. development-harness roadmap;
8. links to detailed docs.

No personal hostname/path appears in the public README.

### Detailed docs

- `docs/architecture.md` — transport, OAuth, 1MCP, providers, lifecycle boundaries.
- `docs/installation.md` — prerequisites, setup, Cloudflare tunnel prerequisites, systemd install.
- `docs/configuration.md` — `.env`, profiles, generated local config.
- `docs/operations.md` — start/status/stop, logs, recovery, troubleshooting.
- `docs/security.md` — trust profiles and explicit unrestricted-mode consequences.
- `docs/development.md` — repository structure, tests, provider development.
- `docs/acceptance.md` — end-to-end acceptance procedure using generic example paths.

`docs/superpowers/` remains engineering history and is not linked as primary public documentation.

The existing root `ACCEPTANCE.md` and `docs/PLAN.md` are absorbed into the new docs and removed once their useful content is preserved.

## Public repository metadata

Scaffold:

- `LICENSE` — MIT is the recommended default for this project; final publication must not occur without an explicit license.
- `SECURITY.md` — security reporting instructions and the `trusted-dev` threat model.
- `CONTRIBUTING.md` — local setup, tests, style expectations, no credentials/personal deployment values in commits.

Do not add a Code of Conduct, release automation, badges, changelog generator, Docker image, or package publishing workflow in this pass.

## Tests

Add `tests/publication.sh` for structural/publication invariants:

- tracked non-internal files contain no `/home/hamza`, `mcp.hamza.my.id`, `DESKTOP-HQOUFCO`, or `Hamza` identity strings;
- `.env`, `config/local/`, `run/`, logs/sessions/PIDs remain ignored;
- public `bin/start|status|stop` exist and are executable;
- compatibility lifecycle wrappers remain executable;
- generic systemd template contains no personal path/domain;
- setup/render step produces valid `config/local/mcp.json` from a temporary fixture;
- `restricted` and `trusted-dev` profiles both exist;
- trusted-dev generated shell policy remains deliberately unrestricted;
- lifecycle suite still passes from the reorganized paths.

The publication test should exclude `docs/superpowers/` from personal-string checks because historical engineering plans may legitimately describe the original local deployment. Public-facing source/docs/config must still be clean.

## Migration strategy

This refactor is implemented on branch `chore/publication-scaffold` in the worktree:

```text
/home/hamza/repo/satori_bridge/.worktrees/publication-scaffold
```

Implementation order:

1. add publication tests and ignored/local configuration boundary;
2. add generic templates/profiles and config renderer;
3. add public `bin/` entrypoints and move lifecycle internals with compatibility wrappers;
4. move legacy shell provider into `providers/`;
5. genericize systemd installation with compatibility-safe migration;
6. reorganize public documentation and metadata;
7. run full lifecycle + publication + live-independent smoke verification;
8. review diff before any merge into `main`;
9. perform local generated-config/systemd migration as a separate controlled merge step.

No live bridge restart is required while developing in the worktree.

## Acceptance criteria

The branch is ready for merge review only when:

1. `bash tests/lifecycle.sh` passes with all existing behavioral coverage.
2. `bash tests/publication.sh` passes.
3. Bash/Node syntax checks pass.
4. `git diff --check` passes.
5. no public tracked source/config/doc contains personal deployment identity.
6. a temporary clean-home fixture can render valid local config for both profiles.
7. `trusted-dev` is explicitly documented and testably unrestricted.
8. after the prerequisite `.worktrees/` ignore commit, no runtime/refactor files in the main checkout and no live installed service have been modified by worktree development.
9. merge instructions include the safe local config + generic systemd migration sequence.

## Deferred decisions

- Final public project/repository name.
- Whether to keep MIT or choose another license before actual publication.
- CI/release automation.
- Package distribution.
- Docker/container support.
- CodeDB/Pi/await/GCF implementation, which follows only after this repository structure is stable.
