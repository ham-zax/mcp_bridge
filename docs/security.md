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

## Sudo

Sudo is never an automated credential feature.

- The harness may execute `sudo` only when the operator deliberately requests it.
- Password entry belongs in an explicitly human-controlled Terminal session.
- The bridge must not store, infer, log, transmit, or auto-fill a sudo password.

## Human Terminal takeover

`bin/wsl-term attach <session>` acquires the exact tmux PTY for a human. While the human lease is active, model send/resize/ordinary close are blocked; model observation remains available. Detaching releases control back to the model.

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
