# Acceptance Procedure

Use a non-sensitive test workspace and the deployment's own public hostname.

## 1. Setup is explicit

Without a profile:

```bash
scripts/setup.sh
```

Expected: nonzero exit explaining `restricted` and `trusted-dev`.

With a configured `.env`:

```bash
scripts/setup.sh --profile restricted
# or
scripts/setup.sh --profile trusted-dev
```

Expected: external `bridge.env` and `1mcp/mcp.json` are rendered successfully.

## 2. Lifecycle

```bash
bin/start
bin/status
```

Expected status:

```text
desired state: running
local health: ready
cloudflared: running
watchdog: running
public health: ok
issues: 0
```

## 3. OAuth connector

Connect ChatGPT to:

```text
https://<your-hostname>/mcp
```

Complete OAuth consent and invoke a harmless provider operation. On pinned 1MCP 0.34.4, setup must have verified/applied the HTTPS `form-action` CSP compatibility patch before this test.

## 4. Filesystem boundary

Read a file inside the configured workspace and verify the filesystem provider denies a path outside its configured root.

## 5. Shell profile

For `restricted`, verify a command permitted by the selected policy succeeds and a command denied by that policy remains denied.

For `trusted-dev`, verify normal Linux development commands execute with service-user authority. Use harmless commands for acceptance; unrestricted authority is a policy property, not a requirement to perform destructive actions.

## 6. Recovery

Use the automated lifecycle suite to validate process recovery and rollback:

```bash
bash tests/lifecycle.sh
```

It covers duplicate prevention, failed startup cleanup, public health rollback, exact process ownership, lifecycle locking, and watchdog recovery without intentionally touching the live bridge.

## 7. Stop

```bash
bin/stop
bin/status
```

Expected: managed processes are stopped and the desired-running marker is absent.
