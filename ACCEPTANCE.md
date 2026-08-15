# Acceptance test — first live session from this chat

Goal: prove the full loop works from the ChatGPT Business app — **filesystem read → edit → diff → focused test → rerun → Task → status → commit** — without the user copying logs or touching GitHub.

Preconditions:
- `scripts/start.sh` green; `scripts/status.sh` shows both daemons healthy.
- Connector paired and app selected in the chat (docs/PLAN.md steps 5–6).
- Tool names below are the 1MCP names; the ChatGPT connector may prefix them (`filesystem_*`, `shell_*`). Act on whatever prefix is rendered.

## Runbook

### 1. Read a real file

Tool `filesystem.read_file`:

```json
{"path": "/home/hamza/repo/satori/packages/core/src/core/semantic-search-service.ts"}
```

Expected: full file content (this is the file we will touch later).

### 2. Make a reversible edit

Edit via `filesystem.edit_file` — e.g. replace the first line of the class-level doc comment (record the exact before/after) — or add a JSDoc note. Content change must be trivial and self-reverting.

### 3. Diff

Tool `shell` (mcp-shell-server), argv, `directory: "satori"`:

```
["git", "diff"]
```

Expected: only the one edit from step 2.

### 4. Focused core test

```
["pnpm", "--filter", "@zokizuan/satori-core", "exec", "node",
 "--import", "tsx", "--import", "./src/test-state-root.ts",
 "--test", "--test-concurrency=8",
 "src/core/core/search-projections.test.ts"]
```

with `{"directory": "satori", "timeout": 300}`. This is exactly the package's `test:raw` invocation without the glob — expected green (this test file exists; it exercises the projection layer adjacent to the semantic search service).

### 5. Induce a failure and react

Edit `semantic-search-service.ts` with a deliberate type-slip (or break the doc comment syntax), rerun step 4, confirm the failure output arrives in the chat. Then revert via the filesystem server or `git restore`, rerun step 4 → green.

### 6. Long task through the shell

```
["pnpm", "semantic:verify"]
```

`{"directory": "satori", "timeout": 300}` (server max is 300 s; default 30 s would time out — always pass `timeout` for build/verify commands).

Expected: reproducibility verdict from `scripts/verify-semantic-engine-reproducibility.mjs`.

### 7. Land it

```
["git", "status"]   →  only the intended working tree state
["git", "diff"]     →  review
["git", "commit", "-m", "docs: <what this chat changed>"]
```

Then `["git", "status"]` → clean; `["git", "log", "-1", "--oneline"]` shows the commit.

## Expected failure modes (known, not bugs)

| Try | Result |
|---|---|
| `filesystem.read_file` on `/etc/passwd` or `/home/hamza/repo` (the parent) | denied — outside allowed roots |
| `shell` `["bash", "-c", "..."]`, `["rm", "x"]`, `["ssh", ...]`, `["git", "-c", "x=y", "status"]` | "Command not allowed" / hardening rejection |
| `["cat", "/etc/passwd"]` | runs — shell restriction is conventional (see README "Interface contract") |
| `shell` without `directory` | runs at `/home/hamza/repo` (1MCP process CWD) — always pass the repo name |

## Done

This chat can now: read local code → edit it → diff → run focused tests → run full verify → inspect live output → commit — with nothing copied and no GitHub round-trip.