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

## 4. Pi Files boundary

Verify `dev.read`, `dev.edit`, and `dev.write` use paths relative to the configured workspace. Absolute paths, `..` traversal, existing symlink escapes, and new-file creation through a symlinked outside parent must fail. Verify two concurrent creates for one absent path yield exactly one success. The generic filesystem provider must no longer appear in either final profile.

## 5. Final Shell profile and native result boundary

For `restricted`, verify the generated provider set is exactly `dev` + legacy `shell`; `dev` advertises `read`, `edit`, and `write` but not `bash`, and the legacy shell still enforces restricted policy.

For `trusted-dev`, verify the generated provider set is exactly `dev`. `dev.bash` accepts one native command string with optional workspace-relative cwd. Successful output must appear as terminal text, a normal non-zero exit must append `[exit N]`, and the result must not expose `structuredContent` or a JSON execution record.

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
