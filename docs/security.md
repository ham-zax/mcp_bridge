# Security and Trust Profiles

The bridge exposes development capability on a Linux account. The selected profile determines intended authority; deployment identity is configured separately.

## `restricted`

Recommended for general installs. The current transitional shell provider uses a command policy rather than unrestricted dangerous-command bypass. Workspace file access remains rooted at configured paths.

## `trusted-dev`

Designed for dedicated agentic development environments. Shell execution is intentionally unrestricted and has the effective authority of the Linux service user.

That may include access to:

- files outside the configured filesystem-provider workspace through shell commands;
- developer credentials readable by the service user;
- local processes and systemd user services;
- network endpoints available to that account;
- installed compilers, package managers, Git tooling, and other Linux commands.

This is a supported operating model. Use it when that authority is part of the intended development workflow.

## Policy survives provider replacement

The policy abstraction is not tied to `mcp-shell-server` environment variable names. When the shell implementation later changes, `trusted-dev` must continue to mean unrestricted service-user authority and `restricted` must continue to enforce a reduced policy.

## OAuth/public transport

1MCP listens on loopback and is published through Cloudflare. OAuth remains enabled at the 1MCP origin. Do not publish the loopback origin directly without an equivalent authenticated transport design.
