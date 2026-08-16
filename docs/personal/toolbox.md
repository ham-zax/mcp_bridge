# Personal Linux CLI Toolbox

The personal harness gets coding leverage from ordinary Linux commands executed through raw Bash or Terminal. This toolbox adds **zero MCP actions**: it qualifies native executables and installs only missing approved tools.

## Check and setup

Run the checker first:

```bash
bash scripts/check-personal-toolbox.sh
```

It prints every tool's required/optional status and observed version. Missing or invalid required tools make the checker exit non-zero; missing optional tools are reported without failing the check.

Preview setup without changing the machine:

```bash
bash scripts/setup-personal-toolbox.sh --dry-run
```

Apply only the missing approved installs:

```bash
bash scripts/setup-personal-toolbox.sh
```

The setup is idempotent. Already-qualified tools are left alone. If a distro package is genuinely missing, normal interactive `sudo` may be used by `apt-get`; the script never stores, reads, or supplies a sudo password.

## Capability contract

| Tool | Status | Qualification / role |
| --- | --- | --- |
| `git` | required | repository operations; existing installation is never globally upgraded |
| `rg` | required | fast recursive text search |
| `jq` | required | JSON inspection/transformation |
| `sed` | required | stream edits |
| `awk` | required | record-oriented text processing |
| `grep` | required | baseline text filtering |
| `find` | required | baseline filesystem traversal |
| `node` | required | `>= 22.19.0`; existing Node is never globally upgraded by toolbox setup |
| `npm` | required | Node package tooling |
| `pnpm` | required | package-manager workflow; missing installs use Corepack with a pinned package version |
| `corepack` | required | pinned package-manager activation |
| `python3` | required | Python CLI/runtime; existing Python is never globally upgraded |
| `uv` | required | Python project/package workflow |
| `systemctl` | required | user-service control; toolbox setup never upgrades systemd |
| `journalctl` | required | user-service logs; toolbox setup never upgrades systemd |
| `tmux` | required | `>= 3.4`; persistent Terminal foundation |
| `ast-grep` | required for Phase 2 acceptance | exact `0.45.0`; structural source search/rewrite |
| `fd` | optional/recommended | ergonomic file discovery |
| `bat` | optional/recommended | readable file inspection |

`ast-grep` is intentionally checked by the executable name `ast-grep` and by its version output. The checker never treats `sg` as an alias or fallback. On Linux, `/usr/bin/sg` can be the unrelated shadow-package group command; its presence is not evidence that ast-grep exists.

## Installation policy

The setup script uses bounded, reproducible sources rather than unpinned installer pipes:

- `ast-grep`: official npm package `@ast-grep/cli@0.45.0`, installed under `~/.local` with only `@ast-grep/cli` permitted to run its required install script (`--allow-scripts=@ast-grep/cli`).
- `pnpm`: Corepack installs `pnpm@11.21.0` only when `pnpm` is missing; an existing pnpm is reported and left untouched.
- `uv`: existing uv is reported and left untouched. If it is missing, setup stops for manual repair rather than bypassing Ubuntu's Python packaging policy or mutating the system Python installation.
- Small distro utilities such as `ripgrep`, `jq`, `tmux`, `fd-find`, and `bat` use Ubuntu/Debian packages only when the corresponding command is missing. `fd-find`/`bat` compatibility aliases are created under `~/.local/bin` only when the distro exposes `fdfind`/`batcat` instead of `fd`/`bat`.
- Missing or unqualified Node, npm/Corepack, Python, or systemd is reported for manual repair rather than triggering a broad toolchain replacement. Any already-present non-ast tool that fails qualification (for example an old tmux or broken pnpm probe) is likewise left untouched; the exact ast-grep pin is the deliberate exception.

There is no `curl | sh` path, no unattended sudo credential handling, and no blanket upgrade of Node, Git, Python, or systemd.

## Coding-agent usage patterns

Use `rg` for literal/regex navigation before heavier indexing:

```bash
rg 'foo' repo/
rg -n 'function resolve.*Path' /home/hamza/repo
```

Use ast-grep when syntax matters more than text:

```bash
ast-grep run -p '$A == $B' -l ts repo/
ast-grep run -p 'console.log($A)' -l js /home/hamza/repo
```

Use `jq` to inspect generated configuration or package metadata without wrapping it in a new MCP action:

```bash
jq -r '.name' package.json
jq '.mcpServers | keys' path/to/mcp.json
```

Use `fd` for fast path discovery when available, with `find` as the required baseline:

```bash
fd package.json /home/hamza/repo
find /home/hamza/repo -name package.json -print
```

Use native package/test tools directly:

```bash
pnpm test
uv run pytest
node --test
```

Use systemd's native user-service controls and logs:

```bash
systemctl --user status mcp-dev-bridge.service
journalctl --user -u mcp-dev-bridge.service -n 100
```

Use tmux directly for local observation/debugging where appropriate; the later Terminal provider owns its dedicated `wsl-agent` tmux namespace and does not require a new toolbox MCP schema.
