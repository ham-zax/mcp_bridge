# Security

WebSession MCP Bridge exposes development capabilities to ChatGPT. The security boundary is the trust profile plus the Linux account running the bridge.

## Profiles

- `restricted` keeps Files workspace-bounded and uses a separate allowlisted shell.
- `trusted-dev` keeps Files workspace-bounded but gives native Bash the authority of the Linux service user.
- `personal` is a private WSL-user-authority profile with unrestricted Files/Bash plus Code and persistent Terminal capabilities.

Use `trusted-dev` or `personal` only when that authority is deliberate. The bridge must never store, infer, log, transmit, or auto-fill a sudo password; elevated commands remain an explicit human/operator action.

Read the full [Security and trust profiles](docs/security.md) guide before deployment.

## Public exposure

1MCP listens on loopback. Cloudflare supplies the public HTTPS path. OAuth remains required for the public MCP origin.

## Sensitive state

Generated configuration, OAuth/session state, runtime files, logs, and deployment identity live outside Git by default. Do not commit `.env`, credentials, tunnel secrets, OAuth state, or private logs.

## Reporting

For a public GitHub release, use GitHub private vulnerability reporting. Do not publish secrets or private deployment data in a public issue.
