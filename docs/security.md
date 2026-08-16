# Security and Trust Profiles

The effective security boundary is the selected profile plus the Linux account running the bridge.

## `restricted`

Use for conservative/public installations.

- Files are confined to the configured workspace.
- Dev does not expose unrestricted Bash.
- A separate legacy shell provider enforces an allowlist policy.
- No private Code or Terminal provider is present.

## `trusted-dev`

Use only on a dedicated development host where unrestricted shell authority is intentional.

- Files remain workspace-bounded.
- Dev exposes native Bash with the permissions of the Linux service user.
- Bash may reach files, processes, network resources, developer tools, and credentials accessible to that account even when the Files tools are workspace-bounded.
- No private Code or Terminal provider is present.

## `personal`

Private Codex-like WSL authority.

- Files use user-mode paths and may accept absolute paths.
- Bash has the authority of the WSL user.
- Code can inspect Git repositories reachable by that user.
- Terminal can create and control persistent tmux-backed PTYs.
- Durable waits can observe local process/port/file/HTTP/systemd state and private Terminal state.

This profile is intentionally powerful. Treat it like giving a coding agent an interactive shell as your WSL user.

## CodeDB resource guidance

The personal Code tools are description-guided, not resource-enforced. A first Code call for a repository may start a persistent rooted CodeDB child and create or update substantial on-disk index state. On large repositories this can consume significant disk and RAM. The model-facing descriptions therefore direct large or unfamiliar repository discovery toward bounded Dev Bash/`rg` and focused `read` before CodeDB-backed intelligence when CodeDB state/cost is unknown.

There is no repository-size preflight, threshold, cgroup, or approval database in this design. Because personal Bash intentionally has the WSL user's authority, description text cannot form a privilege boundary against deliberate raw CLI use; it is routing guidance intended to prevent accidental expensive work.

## Sudo

Sudo is never an automated credential feature.

- The harness may execute `sudo` only when the operator deliberately requests it.
- Password entry belongs in an explicitly human-controlled Terminal session.
- The bridge must not store, infer, log, transmit, or auto-fill a sudo password.

## Human Terminal observation and ownership handoff

The human frontend is any suitable interactive TTY; Kitty is not a security or runtime dependency. tmux remains the PTY/process lifetime authority and the broker remains the model mutation gate.

`bin/wsl-term new <session>` creates a human-first collaborative session under a pending human lease before the tmux session is exposed, closing the create-to-attach model-write race. The attached writable client blocks model send/resize/ordinary close while model reads remain available.

`bin/wsl-term give <session>` changes the designated human client to read-only + ignore-size and releases the human lease only after the tmux transition is verified. `bin/wsl-term take <session>` establishes human blocking before making the designated client writable. `terminal_yield` uses the same take path and can only return control to a human; it cannot seize human control for the model.

`Ctrl-b T` is a direct tmux `switch-client -r` ownership toggle because tmux read-only clients ignore conditional wrapper bindings. A read-only observer cannot inject pane input until the human explicitly invokes this takeover. Before every model mutation, the broker reconciles actual client flags: any writable client or live lease blocks the model, a unique writable client becomes the designated human target, and multiple writable clients fail closed rather than being auto-resolved.

`bin/wsl-term watch <session>` starts read-only + ignore-size and does not acquire a human lease. `bin/wsl-term attach <session>` is writable human takeover/rejoin and becomes the designated human client when observed. Unknown tmux client state remains writable for fail-closed control.

Human keystrokes are never copied into a separate broker-side input log. Sudo/password input continues to travel directly from the interactive terminal through tmux to the PTY.

## Public exposure

1MCP listens on loopback. Cloudflare exposes HTTPS. OAuth remains required for the public MCP origin.

The pinned 1MCP 0.34.4 installation carries one narrow CSP compatibility patch for the HTTPS OAuth consent callback. Setup verifies the expected upstream source before applying it and fails closed if the shape changed.

## Sensitive state

Keep these outside Git:

- `.env` deployment identity;
- generated 1MCP configuration;
- OAuth/session state;
- logs and PID/runtime files;
- private Terminal state;
- credentials and tunnel secrets.

Historical engineering evidence under `docs/history/` is excluded from the public publication surface because it can contain old private-machine context.
