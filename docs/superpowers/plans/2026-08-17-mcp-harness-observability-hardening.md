# MCP Harness Observability Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clarify WSL/MCP observability semantics in the router skill and harden the Terminal broker and Pi Dev Bash output retention against two failures proven by live logs.

**Architecture:** Keep the public 16-tool catalog unchanged. The router documents one authoritative WSL evidence path; the Terminal broker contains peer socket failure at the accepted-connection boundary; Pi Dev bounds retained spool storage while preserving total-byte accounting and the existing model-facing bounded tail.

**Tech Stack:** Node.js >=22.19, MCP SDK 1.30.0, Node `net`/`fs`, `node:test`, Markdown skills/docs.

## Global Constraints

- Preserve unrelated dirty `skills/persistent-agent-loop/**` work in the main checkout.
- Do not add a public MCP tool or audit service.
- Do not alter Terminal ownership, transcript cursor, wait, CodeDB, or public tool schemas.
- Do not use another model/worker; implement sequentially in this worktree.
- Use the connected WSL repository as the only authority for repository/process evidence.

---

### Task 1: Router observability and recovery semantics

**Files:**
- Modify: `skills/mcp-harness-router/SKILL.md`

**Interfaces:**
- Consumes: existing Dev/Code/Terminal/wait tool semantics.
- Produces: concise routing guidance for `UNOBSERVABLE` presentation, canonical WSL health probes, Terminal read/list discipline, and authoritative hard-stop criteria.

- [ ] **Step 1: Add the canonical authority and observability-state guidance**

Add concise instructions stating that WSL facts come only through `mcp-harness-local`; `UNOBSERVABLE` output is neither success nor failure; one bounded health probe is the recovery path; internal tool names are never discovered through public web search.

- [ ] **Step 2: Add Terminal lifecycle/read conventions**

Specify `terminal_list` only for initial identity/ownership, ownership handoff, or unexpected lifecycle events; normal reads omit cursor; snapshots do not consume; explicit cursors are recovery-only.

- [ ] **Step 3: Tighten wait and hard-stop rules**

State that `dev_wait` replaces sleep/poll loops and that a hard stop needs an authoritative provider/access/ownership/repository/protected-contract failure, not awkward presentation.

- [ ] **Step 4: Verify skill consistency**

Run:

```bash
rg -n "UNOBSERVABLE|canonical|public web|terminal_list|snapshot|hard stop|dev_1mcp_wait" skills/mcp-harness-router/SKILL.md
node scripts/check-doc-links.mjs
```

Expected: all required concepts appear and documentation links pass.

---

### Task 2: Terminal broker survives reset peer sockets

**Files:**
- Modify: `providers/terminal/broker.mjs`
- Modify: `providers/terminal/test/broker.test.mjs`

**Interfaces:**
- Consumes: accepted `net.Socket` connections for newline-delimited broker requests.
- Produces: connection-local failure containment; the broker process continues serving later connections.

- [ ] **Step 1: Write the failing broker regression**

Add a focused connection-boundary regression that feeds a socket-like EventEmitter into the accepted-connection handler, emits an `ECONNRESET`-style `error`, and proves the handler consumes the error and destroys only that connection. The full broker suite remains the integration check for normal subsequent service behavior.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd providers/terminal
node --test --test-name-pattern='survives.*client.*reset|client.*error.*broker' test/broker.test.mjs
```

Expected before the fix: broker exits or the subsequent broker request fails because the accepted socket error is unhandled.

- [ ] **Step 3: Add connection-local socket error handling**

In the callback passed to `net.createServer`, register an `error` listener immediately. The handler must destroy the failed socket and must not throw or terminate the broker. Keep request dispatch/protocol logic otherwise unchanged.

- [ ] **Step 4: Run focused then full Terminal verification**

```bash
cd providers/terminal
node --test --test-name-pattern='survives.*client.*reset|client.*error.*broker' test/broker.test.mjs
npm test
```

Expected: focused regression and all Terminal tests pass.

---

### Task 3: Bound Pi Dev retained Bash spools

**Files:**
- Modify: `providers/pi-dev/shell.mjs`
- Modify: `providers/pi-dev/render.mjs`
- Modify: `providers/pi-dev/server.mjs`
- Modify: `providers/pi-dev/test/shell.test.mjs`
- Modify: `providers/pi-dev/test/render.test.mjs`
- Modify: `providers/pi-dev/test/server.test.mjs` only if startup/config behavior needs explicit coverage.

**Interfaces:**
- `runBash({... maxOutputBytes, maxSpoolBytes, stateDir })` returns the existing fields plus `spool_truncated: boolean` when returned output is truncated.
- `MCP_DEV_MAX_SPOOL_BYTES` is internal deployment configuration, validated at provider startup and omitted from the public MCP schema.
- `renderBashText()` adds one concise annotation when `spool_truncated` is true.

- [ ] **Step 1: Write the failing shell storage test**

Extend the large-output test or add a focused case using a deliberately small `maxSpoolBytes`, for example 2048 bytes, while the command emits 5000 bytes. Assert:

```js
assert.equal(result.output_bytes, 5000);
assert.equal(result.truncated, true);
assert.equal(result.spool_truncated, true);
assert.ok((await fs.stat(result.full_output_path)).size <= 2048);
assert.ok(Buffer.byteLength(result.output) <= resultModelLimit);
```

- [ ] **Step 2: Write the failing renderer test**

Pass a result with `truncated: true`, `spool_truncated: true`, and a full-output path. Assert the native text tells the model the retained file is capped rather than claiming it is complete.

- [ ] **Step 3: Verify both tests RED**

```bash
cd providers/pi-dev
node --test --test-name-pattern='spool|retained output|truncation points' test/shell.test.mjs test/render.test.mjs
```

Expected: failure because `maxSpoolBytes`/`spool_truncated` behavior does not exist.

- [ ] **Step 4: Implement bounded spool retention**

In `runBash()`:

- validate `maxSpoolBytes` as a positive bounded integer;
- write only the first remaining bytes until the retained cap is reached;
- keep `outputBytes` counting every emitted byte;
- keep the bounded model-facing tail unchanged;
- retain/delete spool using existing truncation semantics;
- return `spool_truncated: outputBytes > maxSpoolBytes`.

- [ ] **Step 5: Add internal provider configuration**

In `server.mjs`, read `MCP_DEV_MAX_SPOOL_BYTES` with a safe default (64 MiB), validate it independently of `MCP_DEV_MAX_OUTPUT_BYTES`, pass it into `runBash()`, and keep it absent from tool schemas.

- [ ] **Step 6: Update native rendering**

Keep the existing `[truncated · full: ...]` annotation for complete retained artifacts. When the spool is capped, render a truthful compact annotation such as:

```text
[truncated · retained output capped · file: /state/dev/bash-....log]
```

- [ ] **Step 7: Verify focused and full Pi Dev suites**

```bash
cd providers/pi-dev
node --test --test-name-pattern='spool|retained output|truncation points' test/shell.test.mjs test/render.test.mjs
npm test
```

If the previously observed unrelated positive-hold timing test flakes again, rerun that exact test once and report the baseline flake separately rather than changing wait code.

---

### Task 4: Final integrated verification and documentation sync

**Files:**
- Modify only documentation directly affected by changed runtime configuration if necessary.

**Interfaces:**
- Produces: one coherent branch with router guidance and runtime fixes, no public-tool expansion.

- [ ] **Step 1: Inspect the final diff for scope**

```bash
git status --short
git diff --check
git diff -- skills/mcp-harness-router/SKILL.md providers/pi-dev providers/terminal docs/superpowers/specs/2026-08-17-mcp-harness-observability-hardening-design.md docs/superpowers/plans/2026-08-17-mcp-harness-observability-hardening.md
```

- [ ] **Step 2: Run final provider/document gates**

```bash
(cd providers/terminal && npm test)
(cd providers/pi-dev && npm test)
node scripts/check-doc-links.mjs
```

- [ ] **Step 3: Verify public catalog stability**

Run the existing server/MCP schema tests and inspect that no new Terminal or Pi Dev public tool is exposed.

- [ ] **Step 4: Commit the coherent implementation**

Commit only this worktree's intended files with a message describing harness observability/resilience hardening.
