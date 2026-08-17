# MCP OAuth 30-Day Session Mitigation Design

## Goal

Extend newly issued ChatGPT-to-1MCP OAuth access tokens from the pinned 1MCP default of 24 hours to 30 days, without implementing refresh-token support or changing the public MCP tool catalog.

## Scope

- Render 1MCP application configuration with `auth.sessionTtl = 43200` minutes (30 days).
- Keep `@1mcp/agent@0.34.4` pinned.
- Keep OAuth authorization-code flow, scopes, public endpoint, Cloudflare transport, provider composition, and MCP tool schemas unchanged.
- Do not implement, emulate, or advertise new refresh-token behavior in this mitigation.
- Restart only the bridge/1MCP runtime needed to load the new application configuration; preserve Terminal/tmux lifetime.

## Why configuration rather than a launch flag

The pinned 1MCP runtime resolves session lifetime as `--session-ttl` first, then `appConfig.auth.sessionTtl`, then its built-in 1440-minute default. The harness already renders `1mcp/config.toml`, so adding an `[auth]` block there keeps the policy in the canonical rendered deployment state without widening the launch wrapper or introducing a new deployment knob for a single fixed mitigation.

## Token behavior

The 30-day value controls the lifetime of OAuth access tokens created after the new configuration is loaded. Existing token/session records retain the expiration stored when they were created, and ChatGPT may also cache their original `expires_in`, so the currently connected ChatGPT authorization must not be assumed to gain 30 days in place.

After rollout, reconnect/authorize ChatGPT once to obtain a newly issued token with `expires_in = 2592000` seconds. Subsequent daily reauthorization should no longer be required until that token expires, is revoked, or server-side auth state is otherwise invalidated.

## Verification

Before restart:

- renderer test proves `1mcp/config.toml` contains `[auth]` and `sessionTtl = 43200`;
- local smoke validates the rendered auth TTL;
- lifecycle/publication checks and `git diff --check` pass.

After restart:

- local/public health is green;
- live 1MCP command/config resolves the 30-day value;
- public OAuth metadata and MCP catalog remain otherwise unchanged;
- no Terminal/tmux lifetime restart is performed.

After the user reconnects ChatGPT once, server logs for the authorization-code exchange should report `expiresIn: 2592000` without exposing token material.

## Out of scope

Proper refresh-token issuance/rotation is a separate change. It would require either upgrading to a 1MCP version that correctly implements refresh tokens or maintaining a narrowly scoped upstream patch/fork, plus token persistence, rotation/revocation tests, OAuth discovery consistency, and upgrade tracking. This mitigation deliberately avoids that maintenance surface.
