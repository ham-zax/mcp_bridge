# Security

## Trust model

MCP Development Bridge intentionally supports two explicit operating profiles.

- `restricted`: conservative command policy for general installations.
- `trusted-dev`: unrestricted agentic development authority as the Linux user running the bridge.

`trusted-dev` can access anything that service account can access, including files outside the configured workspace through shell commands, local processes, network resources, credentials, and developer tooling. Use it only where that authority is deliberate.

Filesystem provider roots and shell authority are separate concerns. Future provider implementations must preserve the profile semantics rather than coupling policy to a particular shell package.

## Public exposure

1MCP listens on loopback. Cloudflare provides the public HTTPS transport. OAuth must remain enabled for the public origin.

The pinned 1MCP 0.34.4 setup includes a verified CSP compatibility patch needed for the OAuth consent redirect to an HTTPS ChatGPT callback. The installer fails rather than applying that patch to unexpected upstream source.

## Sensitive state

Generated 1MCP configuration, OAuth/session state, logs, PID files, and runtime markers are kept outside the Git checkout by default. Do not commit `.env` or deployment credentials.

## Reporting

For a public GitHub release, enable GitHub private vulnerability reporting and use that channel for security reports. Do not publish credentials, tunnel secrets, OAuth state, or private logs in a public issue.
