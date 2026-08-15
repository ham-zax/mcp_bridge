# Acceptance test — first live session from this chat

Goal: prove the full loop works from the ChatGPT Business app — **filesystem read → edit → diff → focused test → rerun → Task → status → commit** — without the user copying logs or touching GitHub.

Preconditions:
- `scripts/start.sh` green; `scripts/status.sh` shows both daemons healthy.
- Connector paired and app selected in the chat (docs/PLAN.md steps 5–6).
- Tool names below are the verified wire names from `1mcp inspect` (v0.34.4): filesystem tools appear as `filesystem_1mcp_<tool>` (note: `read_file` is deprecated upstream in favor of `read_text_file`), shell as `shell_1mcp_shell_execute`. The ChatGPT connector may render them identically (they are the tool names 1MCP advertises).

## Runbook

### 1. Read a real file

Tool `filesystem_1mcp_read_text_file`:

```json
{"path": "/home/hamza/repo/satori/packages/core/src/core/semantic-search-service.ts"}
```

Expected: full file content (this is the file we will touch later).

### 2. Make a reversible edit

Edit via `filesystem_1mcp_edit_file` — e.g. replace the first line of the class-level doc comment (record the exact before/after) — or add a JSDoc note. Content change must be trivial and self-reverting.

### 3. Diff

Tool `shell_1mcp_shell_execute`, argv, `directory: "satori"`:

```json
{"command": ["git", "diff"], "directory": "satori"}
```

Expected: only the one edit from step 2.

### 4. Focused core test

```json
{"command": ["pnpm", "--filter", "@zokizuan/satori-core", "exec", "node",
 "--import", "tsx", "--import", "./src/test-state-root.ts",
 "--test", "--test-concurrency=8",
 "src/core/core/search-projections.test.ts"],
 "directory": "satori", "timeout": 300}
```

This is exactly the package's `test:raw` invocation without the glob — expected green (this test file exists; it exercises the projection layer adjacent to the semantic search service).

### 5. Induce a failure and react

Edit `semantic-search-service.ts` with a deliberate type-slip (or break the doc comment syntax), rerun step 4, confirm the failure output arrives in the chat. Then revert via the filesystem server or `git restore`, rerun step 4 → green.

### 6. Long task through the shell

```json
{"command": ["pnpm", "semantic:verify"], "directory": "satori", "timeout": 300}
```

Server max is 300 s; default 30 s would time out — always pass `timeout` for build/verify commands.

Expected: reproducibility verdict from `scripts/verify-semantic-engine-reproducibility.mjs`.

### 7. Land it

```json
{"command": ["git", "status"], "directory": "satori"}
{"command": ["git", "diff"], "directory": "satori"}
{"command": ["git", "commit", "-m", "docs: <what this chat changed>"], "directory": "satori"}
```

Then `{"command": ["git", "status"], "directory": "satori"}` → clean; `{"command": ["git", "log", "-1", "--oneline"], "directory": "satori"}` shows the commit.

## Expected failure modes (known, not bugs)

| Try | Result |
|---|---|
| `filesystem_1mcp_read_text_file` on `/etc/passwd` or `/home/hamza/.bashrc` (outside allowed roots) | denied — outside `/home/hamza/repo` root |
| `shell_1mcp_shell_execute` with `{"command": ["bash", "-c", "..."]}`, `["rm", "x"]`, `["ssh", ...]`, `["git", "-c", "x=y", "status"]` | runs — policy fully relaxed (`MCP_SHELL_ALLOW_DANGEROUS=ALL`, `ALLOW_PATTERNS=.*`) via scripts/mcp-shell-server.py |
| `{"command": ["cat", "/etc/passwd"]}` | runs — expected (see README "Interface contract"); the shell server is now unrestricted by design |
| `shell_1mcp_shell_execute` without `directory` | runs at `/home/hamza/repo` (1MCP process CWD) — always pass the repo name |

## Done

This chat can now: read local code → edit it → diff → run focused tests → run full verify → inspect live output → commit — with nothing copied and no GitHub round-trip.