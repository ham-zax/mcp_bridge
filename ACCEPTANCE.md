# Cloudflare OAuth Bridge — end-to-end acceptance

Goal: prove that the live ChatGPT connector can use the local development machine through the canonical Cloudflare OAuth Bridge without manual log copying or GitHub round-trips.

## Preconditions

```bash
cd /home/hamza/repo/satori_bridge
scripts/start.sh
scripts/status.sh
```

`status.sh` should report `desired state: running`, public health `ok`, and `issues: 0`.

The ChatGPT connector/app should point at:

```text
https://mcp.hamza.my.id/mcp
```

Expected tool naming from 1MCP 0.34.4:

```text
filesystem_1mcp_<tool>
shell_1mcp_shell_execute
```

## 1. Read a repository file

Use `filesystem_1mcp_read_text_file`:

```json
{"path":"/home/hamza/repo/satori/package.json"}
```

Expected: file content is returned directly in chat.

## 2. Search and inspect code

Use filesystem search or the shell MCP (`rg`, `git`, etc.) against `/home/hamza/repo/satori`.

Expected: repository discovery works without copying source into chat manually.

## 3. Make a reversible edit

Use `filesystem_1mcp_edit_file` on a deliberately trivial file change.

Then inspect:

```json
{"command":["git","diff"],"directory":"/home/hamza/repo/satori"}
```

Expected: only the intended edit appears.

## 4. Run a focused test

Example:

```json
{
  "command":[
    "pnpm","--filter","@zokizuan/satori-core","exec","node",
    "--import","tsx","--import","./src/test-state-root.ts",
    "--test","--test-concurrency=8",
    "src/core/core/search-projections.test.ts"
  ],
  "directory":"/home/hamza/repo/satori",
  "timeout":300
}
```

Expected: test output returns through the connector.

## 5. Exercise failure/recovery

Make a reversible test-only break, run the focused test and confirm the error reaches chat, then restore the file and rerun green.

## 6. Long developer command

```json
{
  "command":["pnpm","semantic:verify"],
  "directory":"/home/hamza/repo/satori",
  "timeout":300
}
```

Expected: command output is returned up to the configured timeout/output cap.

## 7. Verify bridge health from the connector

Run:

```json
{
  "command":["bash","-c","cd /home/hamza/repo/satori_bridge && scripts/status.sh"],
  "directory":"/home/hamza/repo/satori_bridge"
}
```

Expected:

```text
desired state: running
local health: ready
cloudflared: running
watchdog: running
public health: ok
issues: 0
```

## Expected boundaries

| Operation | Expected result |
|---|---|
| Filesystem MCP reads outside `/home/hamza/repo` | denied by filesystem provider |
| Shell command reads outside `/home/hamza/repo` | allowed if Linux user `hamza` can access it |
| `bash -c`, pipes, redirects, `ssh`, `sed`, `xargs`, etc. through shell MCP | allowed by the intentionally relaxed developer-shell policy |
| Shell call without explicit `directory` | inherits the 1MCP process CWD (`/home/hamza/repo`); explicit directories are preferred |

## Done

Acceptance is complete when ChatGPT can:

```text
read local code
-> search
-> edit
-> inspect git diff
-> run tests/builds
-> receive failures
-> repair
-> verify bridge status
```

without the user manually transferring source or logs.
