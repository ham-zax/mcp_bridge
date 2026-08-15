# Operations

## Commands

```bash
bin/start
bin/status
bin/stop
```

Compatibility wrappers remain under `scripts/` during migration.

## Healthy state

A healthy enabled bridge has one config-scoped 1MCP process, one cloudflared process, one watchdog, a ready local origin, and a reachable public health endpoint. `bin/status` reports duplicate processes and PID/listener mismatches.

## Process ownership

Lifecycle operations use validated PID files and process groups. Start/stop/watchdog reconciliation share an exclusive lock. Partial startup is transactional: failed 1MCP startup, cloudflared startup, or public readiness rolls the managed stack back instead of leaving an accidental half-running bridge.

## 1MCP 0.34.4 direct supervision

The bridge deliberately does not use `1mcp serve --background`. On the validated npm-global installation, the nested background bootstrap was unreliable while direct serving was healthy. The bridge launches the real 1MCP Node entrypoint under `setsid` and owns supervision itself.

## ChatGPT OAuth consent CSP compatibility

The pinned 1MCP 0.34.4 OAuth consent page requires its CSP to permit an HTTPS form target so the consent form can redirect back to ChatGPT.

`scripts/setup.sh` checks the installed file:

```text
@1mcp/agent/build/auth/sdkOAuthServerProvider.js
```

and ensures the policy contains:

```text
form-action 'self' https:
```

If the patch is already present, setup leaves it alone. If the expected unpatched `form-action 'self'` exists, setup replaces it and verifies the result. If neither expected shape exists, setup stops rather than modifying unknown upstream code.

This behavior is version-specific and must be revalidated before changing the pinned 1MCP version.

## Logs and state

Transient bridge logs/PIDs live in the runtime directory. 1MCP config/session/PID state lives in the external persistent state directory. These locations may be overridden for testing and custom deployments.

## Recovery

The watchdog reconciles 1MCP and cloudflared while the desired-running marker exists. Manual start/stop shares the same lifecycle lock so watchdog recovery cannot race a user lifecycle operation.
