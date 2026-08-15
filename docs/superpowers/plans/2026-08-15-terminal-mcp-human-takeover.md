# Terminal MCP + Exact-PTY Human Takeover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the qualified tmux/broker Terminal core as exactly six personal MCP tools and add exact-PTY human takeover with broker-authoritative single-writer enforcement.

**Architecture:** Keep `wsl-agent` tmux as the only PTY/process lifetime authority. Add a reconnecting Unix-socket broker client, broker-owned persisted model cursor reads, broker-enforced human leases reconciled against real tmux clients, a six-tool MCP facade, and a `wsl-term` CLI that acquires a private lease before directly attaching to the exact tmux session.

**Tech Stack:** Node.js >=22.19.0, tmux 3.x, user systemd, `@modelcontextprotocol/sdk` 1.30.0, Zod 4.4.3, `node:test`.

## Global Constraints

- Base commit is `0441b947898c65de9bfedbfa5db5693d65fa21b9`.
- Branch is `feat/personal-harness-agent-3-terminal-mcp` in `/home/hamza/repo/satori_bridge/.worktrees/personal-harness-agent-3-terminal-mcp`.
- Terminal backend is `TMUX_BROKER_WINS`; Herdr production dependency and hybrid are forbidden.
- Exactly six MCP tools: `terminal_open`, `terminal_read`, `terminal_send`, `terminal_resize`, `terminal_list`, `terminal_close`.
- No lease operation or raw tmux operation is an MCP tool.
- Production tmux namespace remains `wsl-agent`; tmux clients always use `-N` and never auto-start the server.
- Broker socket remains `$XDG_RUNTIME_DIR/wsl-agent-terminal.sock`; state root remains `$XDG_STATE_HOME/wsl-agent-terminal`; default cwd remains `/home/hamza`.
- Normal `terminal_read(name)` uses a broker-owned model cursor and returns only unread transcript output.
- `CURSOR_EXPIRED`, `CURSOR_AHEAD`, monotonic logical offsets, UTF-8 correctness, bounded recovery, immediate-first-byte capture, retained-dead-pane recovery, and tmux lifetime-unit semantics must remain green.
- During live human control: read/list allowed; send/resize/ordinary close return `HUMAN_HAS_CONTROL`; explicit force close remains an override.
- Human key input never flows through the broker. Do not create an auxiliary input/password log.
- Register Terminal only in personal composition; preserve restricted/trusted-dev and public publication semantics.
- Do not implement Task 8 await/resume or alter Code facade architecture.

---

### Task 1: Add the private broker client and broker-owned model cursor

**Files:**
- Create: `providers/terminal/broker-client.mjs`
- Create: `providers/terminal/model-cursor.mjs`
- Create: `providers/terminal/test/broker-client.test.mjs`
- Modify: `providers/terminal/protocol.mjs`
- Modify: `providers/terminal/broker.mjs`
- Modify: `providers/terminal/test/protocol.test.mjs`
- Modify: `providers/terminal/test/broker.test.mjs`

**Interfaces:**
- `BrokerClient({ socketPath, retryWindowMs?, retryIntervalMs? }).request(op, params)` -> broker result or `TerminalError` preserving `code/details`.
- New private protocol operation: `model.read` with `{ name, cursor?, snapshot?, maxBytes?, recoveryTailBytes? }`.
- `readModelCursor(sessionDir)` -> non-negative logical offset, default `0` when absent.
- `writeModelCursor(sessionDir, cursor)` -> atomic mode-0600 persisted cursor.
- Broker serializes concurrent `model.read` calls per session so two clients cannot consume the same unread range.

- [ ] **Step 1: Write RED tests for broker-client reconnect and error preservation**

Create `broker-client.test.mjs` with a temporary Unix server that initially refuses connections, becomes available inside the retry window, and returns one valid protocol response. Add a second case returning `{ok:false,error:{code:'CURSOR_AHEAD',details:{baseOffset:0,endOffset:3}}}` and assert the thrown `TerminalError` preserves code/details.

Run:

```bash
cd providers/terminal
node --test test/broker-client.test.mjs
```

Expected: FAIL because `broker-client.mjs` does not exist.

- [ ] **Step 2: Implement the minimal reconnecting broker client**

Implement one request per Unix socket connection, newline-delimited JSON, bounded retry only for connection-level `ENOENT`, `ECONNREFUSED`, and early socket-close failures during the configured retry window. Do not start tmux or broker processes. Convert broker error payloads back to `TerminalError`.

Run the focused test and require PASS.

- [ ] **Step 3: Write RED protocol/model-cursor tests**

Extend `protocol.test.mjs` to include private `model.read`. Extend `broker.test.mjs` to open a producer session and assert:

```text
model.read #1 -> output + nextCursor N
model.read #2 without cursor -> empty/no duplicate at N
new output -> model.read #3 starts at N and advances
broker restart -> model.read continues from persisted cursor
explicit cursor read advances exactly to returned nextCursor
snapshot=true returns capture text and does not move model cursor
CURSOR_AHEAD remains explicit and does not rewrite model cursor
```

The existing transcript rotation test remains the authoritative `CURSOR_EXPIRED` contract; add a broker-level assertion that an expired model cursor returns that code/details without silent cursor movement.

Run:

```bash
node --test --test-name-pattern='model cursor|model read' test/broker.test.mjs test/protocol.test.mjs
```

Expected: FAIL because `model.read` and persisted cursor state do not exist.

- [ ] **Step 4: Implement persisted model cursors and `model.read`**

Use `model-cursor.json` under the existing private session directory. Atomic write via temp file + rename; enforce mode `0600`; reject corrupt/negative stored offsets as `MODEL_CURSOR_STATE_CORRUPT`. In broker `model.read`, capture the session name, serialize by session, choose the persisted cursor unless an explicit cursor is supplied, call `readTranscript`, and persist only successful `nextCursor`. For `snapshot=true`, call `tmux.captureScreen(name)` and do not touch cursor state.

Run the focused model-read tests and full existing Terminal suite.

- [ ] **Step 5: Commit Task 1**

```bash
git add providers/terminal/broker-client.mjs providers/terminal/model-cursor.mjs providers/terminal/protocol.mjs providers/terminal/broker.mjs providers/terminal/test/broker-client.test.mjs providers/terminal/test/protocol.test.mjs providers/terminal/test/broker.test.mjs
git commit -m "feat: add broker-owned terminal model reads"
```

---

### Task 2: Enforce human ownership in the broker and reconcile against real tmux clients

**Files:**
- Modify: `providers/terminal/protocol.mjs`
- Modify: `providers/terminal/broker.mjs`
- Modify: `providers/terminal/test/protocol.test.mjs`
- Create: `providers/terminal/test/human-lease.test.mjs`

**Interfaces:**
- New private operation: `lease.bind_human` with `{ name, leaseId, clientPid }`.
- Existing `lease.acquire_human` returns a pending lease.
- `session.send`, `session.resize`, and `session.close(force !== true)` call broker lease reconciliation before mutation.
- Human control is true when a valid pending lease exists within the startup grace or a real tmux client is attached to the session. Bound lease metadata is reconciled against `tmux.listClients()` by session and PID; an observed client disappearing releases stale metadata.

- [ ] **Step 1: Write RED lease enforcement tests**

Use a real sandbox tmux server. Open a live session, acquire a lease, and assert:

```text
session.read -> allowed
session.list -> allowed + humanLease=true
session.send -> HUMAN_HAS_CONTROL
session.resize -> HUMAN_HAS_CONTROL
session.close(force omitted/false) -> HUMAN_HAS_CONTROL
session.close(force=true) -> allowed
```

Re-open a session for later tests rather than weakening the force-close assertion.

Run:

```bash
node --test test/human-lease.test.mjs
```

Expected: FAIL because current broker mutation paths ignore leases.

- [ ] **Step 2: Implement broker-level mutation guards**

Add `assertModelMayMutate(name, { forceClose=false })`. Reconcile before each model mutation. Leave read/list available. Preserve the private lease operations but never expose them through MCP.

Run focused lease tests and require the blocking contract to pass.

- [ ] **Step 3: Write RED real-client stale-reconciliation tests**

Allocate a pseudo-TTY with `script`, start a real `tmux -N ... attach-session` client against the sandbox session, bind its actual tmux client PID, and verify the lease stays active while `tmux.listClients()` reports that PID/session. Then detach/terminate that exact client and assert the next mutation reconciles stale ownership and succeeds. Also test an acquire/bind that never becomes an observed tmux client expires after the configured startup grace.

Expected: FAIL until real-client reconciliation exists.

- [ ] **Step 4: Implement real tmux-client reconciliation**

Track pending/bound lease metadata only; never input bytes. Use `tmux.listClients()` as the real client source. Once a bound PID/session is observed, its disappearance clears the lease. Treat any actual tmux client attached to the session as human control, which preserves ownership across broker restart even if in-memory lease metadata is lost. Add a bounded configurable attach grace for the acquire->client-connect race.

Run all human-lease tests plus existing broker-restart/mixed-dead tests.

- [ ] **Step 5: Commit Task 2**

```bash
git add providers/terminal/protocol.mjs providers/terminal/broker.mjs providers/terminal/test/protocol.test.mjs providers/terminal/test/human-lease.test.mjs
git commit -m "feat: enforce terminal human ownership"
```

---

### Task 3: Build exactly six MCP tools with native TextContent

**Files:**
- Create: `providers/terminal/mcp-server.mjs`
- Create: `providers/terminal/test/mcp-server.test.mjs`
- Modify: `providers/terminal/package.json`
- Modify: `providers/terminal/package-lock.json`

**Interfaces:**
- `createTerminalMcpServer({ client })` returns an unconnected `McpServer` for in-memory testing.
- `runTerminalMcpStdio({ socketPath? })` connects the server to stdio using `BrokerClient`.
- Public key names map only to fixed internal tmux tokens:
  - `ENTER -> Enter`
  - `CTRL_C -> C-c`
  - `CTRL_D -> C-d`
  - `CTRL_Z -> C-z`
  - `ESC -> Escape`
  - `TAB -> Tab`
  - `BACKSPACE -> BSpace`
  - `UP -> Up`
  - `DOWN -> Down`
  - `LEFT -> Left`
  - `RIGHT -> Right`

- [ ] **Step 1: Add pinned MCP dependencies**

Set exact dependencies:

```json
"@modelcontextprotocol/sdk": "1.30.0",
"zod": "4.4.3"
```

Run `npm install --package-lock-only` (or `npm install` while developing) and verify lockfile pins.

- [ ] **Step 2: Write RED catalog/schema tests**

Using SDK `InMemoryTransport`, require the exact sorted catalog:

```text
terminal_close
terminal_list
terminal_open
terminal_read
terminal_resize
terminal_send
```

Assert no `lease.*`, broker op, raw tmux, or generic `terminal` meta-tool appears. Assert `terminal_open` accepts `name/command/cwd/cols/rows`. Call `terminal_send` with both `text` and `key`, and with neither, and require validation failure before the fake broker client records any call.

Expected: FAIL because `mcp-server.mjs` does not exist.

- [ ] **Step 3: Write RED mapping/TextContent tests**

With a recording fake broker client, assert exact mappings:

```text
terminal_open -> session.open
terminal_read -> model.read
terminal_send(text) -> session.send{text}
terminal_send(key=CTRL_C) -> session.send{key:'C-c'}
terminal_resize -> session.resize
terminal_list -> session.list
terminal_close -> session.close{force}
```

Assert every successful tool returns only `content:[{type:'text',text:...}]` with no `structuredContent`. `terminal_read` returns raw unread/snapshot text rather than JSON. `terminal_list` renders exact dead exit status. Error tests must preserve codes such as `HUMAN_HAS_CONTROL`, `CURSOR_AHEAD`, and bounded `CURSOR_EXPIRED` recovery as native error TextContent.

- [ ] **Step 4: Implement the six-tool MCP facade**

Use Zod at the tool boundary; enforce send XOR before calling the broker. Keep all broker lease operations private. Use concise formatting that does not echo model-supplied send text or human input.

- [ ] **Step 5: Add stdio integration test against a real sandbox broker**

Start the existing sandbox tmux/broker, launch `mcp-server.mjs` through `StdioClientTransport`, list tools, open a finite exit-7 session, read its output incrementally, and assert `terminal_list` reports exact `exit=7`. Also open an interactive/producer session and prove second normal `terminal_read` returns zero duplicate bytes before new output.

- [ ] **Step 6: Run MCP + full Terminal tests and commit**

```bash
npm test
git add providers/terminal/package.json providers/terminal/package-lock.json providers/terminal/mcp-server.mjs providers/terminal/test/mcp-server.test.mjs
git commit -m "feat: expose six personal terminal tools"
```

---

### Task 4: Add `wsl-term` exact-PTY attach and no-input-log proof

**Files:**
- Create: `providers/terminal/cli.mjs`
- Create: `bin/wsl-term`
- Modify: `providers/terminal/test/human-lease.test.mjs`

**Interfaces:**
- `wsl-term list`
- `wsl-term attach <session>`
- Production attach command: `tmux -N -L wsl-agent attach-session -t <session>`.
- Test-only socket-path override follows existing `MCP_TERMINAL_TMUX_SOCKET_PATH`; production default remains the named namespace.

- [ ] **Step 1: Write RED CLI contract tests**

Assert `bin/wsl-term` exists/executable and delegates to `providers/terminal/cli.mjs`. Exercise `wsl-term list` against the sandbox broker and require session names/dead status without calling tmux directly.

- [ ] **Step 2: Write RED live attach ownership test**

Run `wsl-term attach <session>` inside a `script` pseudo-TTY. Wait until the broker reports a real attached tmux client/human control. While attached require:

```text
model send -> HUMAN_HAS_CONTROL
model resize -> HUMAN_HAS_CONTROL
ordinary close -> HUMAN_HAS_CONTROL
model read -> succeeds and sees terminal output
```

Detach the exact tmux client and require `wsl-term` exits and model send succeeds again.

- [ ] **Step 3: Implement `cli.mjs` and wrapper**

For attach: acquire lease, spawn tmux with inherited stdio, bind `child.pid`, await child exit, release lease in cleanup. Never read/copy stdin in Node. Use `-N` always. On signals, forward/terminate the exact tmux child and attempt lease release without global process matching.

- [ ] **Step 4: Add stale-wrapper crash and secret-input tests**

Crash the attach wrapper/process group, wait for its real tmux client to disappear, and prove broker reconciliation restores model write access. For password handling, run a no-echo `read -s` fixture through an attached PTY, feed a unique secret, and assert that secret is absent from Terminal state files and broker logs while a completion marker is visible. This proves the same architectural property required for sudo passwords without storing or requesting a real sudo credential.

- [ ] **Step 5: Run focused human tests and commit**

```bash
node --test test/human-lease.test.mjs
git add providers/terminal/cli.mjs providers/terminal/test/human-lease.test.mjs bin/wsl-term
git commit -m "feat: add exact terminal human attach"
```

---

### Task 5: Register Terminal only in personal composition

**Files:**
- Modify: `config/templates/mcp-personal.json`
- Modify: `scripts/render-config.mjs`
- Modify: `scripts/smoke-local.sh`
- Modify: `tests/harness.sh`
- Modify: `scripts/install-terminal-broker-user.sh`

**Interfaces:**
- Personal provider set becomes `code`, `dev`, `terminal`.
- Restricted remains `dev`, `shell`; trusted-dev remains `dev`.
- Terminal provider command is Node + `providers/terminal/mcp-server.mjs` with `MCP_TERMINAL_SOCKET` and `MCP_TERMINAL_READ_MAX_BYTES=65536`.

- [ ] **Step 1: Write RED composition assertions in `tests/harness.sh`**

Require personal rendered keys exactly `['code','dev','terminal']`; public keys unchanged. Require Terminal command/args path, socket under the supplied runtime directory, and read max bytes `65536`. Require no Terminal provider in restricted/trusted-dev.

Run `bash tests/harness.sh`; expect the personal composition assertion to fail.

- [ ] **Step 2: Implement personal template/renderer changes**

Add `terminal` only to `mcp-personal.json`. Derive runtime directory from `XDG_RUNTIME_DIR` or `/run/user/<uid>` in `render-config.mjs` and replace `__TERMINAL_SOCKET__`. Do not add Terminal to public templates.

- [ ] **Step 3: Update private smoke validation**

Make `scripts/smoke-local.sh` expect `code,dev,terminal` only for personal and validate Terminal command path, socket absolute path, read limit, and exact MCP SDK/Zod pins/installed versions. Public expectations remain unchanged.

- [ ] **Step 4: Make private Terminal installer install its provider dependencies**

After dry-run handling and before starting/enabling live units, run `npm --prefix "$ROOT/providers/terminal" ci --omit=dev` so the private Terminal deployment path owns its private MCP dependencies. Do not add a public setup dependency on `providers/terminal`.

- [ ] **Step 5: Run harness/publication/lifecycle and commit**

```bash
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
bash -n scripts/install-terminal-broker-user.sh scripts/smoke-local.sh tests/harness.sh
git add config/templates/mcp-personal.json scripts/render-config.mjs scripts/smoke-local.sh tests/harness.sh scripts/install-terminal-broker-user.sh
git commit -m "feat: register private terminal provider"
```

---

### Task 6: Full local qualification, user-systemd durability, and product-path handoff

**Files:**
- Create: `docs/benchmarks/terminal-chatgpt-acceptance.md`
- Modify only if qualification exposes a Task-7 defect in already-owned files.

**Interfaces:**
- Produces final local acceptance evidence and either real ChatGPT-path evidence or exact external activation steps.

- [ ] **Step 1: Run focused Terminal acceptance**

Run the full Terminal suite and explicitly record passing evidence for:

```text
six MCP tools
native TextContent
zero-duplicate model reads
text + control keys
resize
exit 7
human control/read coexistence
stale lease recovery
detach restores writes
immediate first byte
mixed live/dead two-restart reconciliation
```

- [ ] **Step 2: Run real user-systemd Terminal durability gate**

Use real `wsl-agent-tmux.service` and `wsl-agent-terminal-broker.service` pointing at this worktree without touching the bridge. Create a live producer plus retained exit-0/exit-7 sessions. Record broker/tmux/live pane PIDs and model cursors. Restart only the broker twice and prove same tmux/live PTY, continuing live output, unchanged dead statuses/cursors, and MCP/provider reconnection behavior. Stop `wsl-agent-tmux.service` and prove the live PTY lifetime ends. Restore pre-gate unit state.

- [ ] **Step 3: Run all requested cross-domain tests**

Install provider dependencies in the isolated worktree as needed, then run:

```bash
(cd providers/terminal && npm test)
(cd providers/pi-dev && npm test)
(cd providers/code-router && npm test)
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
node --check providers/terminal/*.mjs scripts/render-config.mjs
bash -n bin/wsl-term scripts/install-terminal-broker-user.sh scripts/smoke-local.sh tests/harness.sh tests/publication.sh tests/lifecycle.sh
git diff --check
```

- [ ] **Step 4: Record product-path acceptance separately**

Write `docs/benchmarks/terminal-chatgpt-acceptance.md` with local evidence. Do not restart `mcp-dev-bridge.service` or replace 1MCP from inside this bridge-owned session. If external safe deployment/user-facing Actions Refresh is not available, set `REAL_CHATGPT_ACCEPTANCE: PENDING` and include exact coordinator steps: install Terminal private units/deps, render `personal`, externally restart the bridge/1MCP, Actions Refresh, then execute the six-tool + human attach scenario from a fresh ChatGPT session.

- [ ] **Step 5: Inline self-review**

Review the diff against the Task-7 mission for correctness, private/public boundaries, input secrecy, scope creep, error semantics, and tests. No independent reviewer is available in this web session, so label this as inline self-review.

- [ ] **Step 6: Final fresh verification and commit evidence**

Run the full test matrix again after any review fixes, require a clean `git diff --check`, then commit the acceptance document and any qualification-only test updates:

```bash
git add docs/benchmarks/terminal-chatgpt-acceptance.md
git commit -m "docs: qualify personal terminal MCP"
```

Do not merge, push, or remove the worktree without an explicit coordinator integration decision.
