# Terminal Await/Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one durable personal `wait` action that can resume local conditions across provider/reconnect boundaries while preserving Terminal transcript ownership and the model's unread cursor.

**Architecture:** Implement a split layer. Terminal gains only private read-only source identity/observation needed by a Terminal wait adapter. A generic wait engine under the personal `dev` provider persists named wait records, owns bounded check loops/timeout/cancellation, and evaluates Terminal plus local-host conditions. The accepted six-tool Terminal MCP catalog stays unchanged.

**Tech Stack:** Node.js >=22.19.0, `@modelcontextprotocol/sdk` 1.30.0, Zod 4.4.3, tmux 3.4-compatible private broker protocol, Linux `/proc`, Node `net`/`fetch`/`fs`, `systemctl --user`, `node:test`.

## Global Constraints

- Start implementation from an integration commit that contains the accepted Task-7 Terminal core and the Task-8 design spec; do not implement on the design-only branch without coordinator approval.
- Preserve Terminal backend `TMUX_BROKER_WINS`; no Herdr runtime dependency or hybrid.
- Do not add an MCP tool to `providers/terminal/mcp-server.mjs`; its public catalog remains exactly six Terminal tools.
- Add exactly one new model-facing action, `wait`, and register it only in the personal user-mode `dev` surface.
- Keep restricted/trusted-dev public composition unchanged.
- Results remain native `TextContent`; do not add `structuredContent` or a codec.
- Terminal output waits use private explicit transcript reads from logical offsets; never poll `capture-pane`.
- A wait has an independent cursor and never calls `model.read` or writes `model-cursor.json`.
- Timeout/cancel never kill a process, close a Terminal session, send Terminal input, or mutate a systemd unit.
- First implementation supports terminal-output **literal** matching only; regex and coding-agent lifecycle remain deferred behind the triggers in the spec.
- Named wait state is private, atomic, versioned, and stored under `$MCP_DEV_STATE_DIR/waits/`.
- Durable timeout default is 300 seconds, maximum 86400 seconds; per-call hold default is 10 seconds, maximum 15 seconds.
- Minimum local poll interval is 250 ms; HTTP is no faster than 500 ms.

---

### Task 1: Give Terminal waits a stable private session identity and transcript observation

**Files:**
- Modify: `providers/terminal/transcript.mjs`
- Modify: `providers/terminal/tmux.mjs`
- Modify: `providers/terminal/protocol.mjs`
- Modify: `providers/terminal/broker.mjs`
- Modify: `providers/terminal/test/transcript.test.mjs`
- Modify: `providers/terminal/test/tmux.test.mjs`
- Modify: `providers/terminal/test/protocol.test.mjs`
- Modify: `providers/terminal/test/broker.test.mjs`

**Interfaces:**
- `readTranscriptState(sessionDir)` -> `{ baseOffset, endOffset, budgetBytes }` without returning transcript bytes.
- Private broker operation `session.observe` with `{ name }` -> `{ name, generation, paneDead, paneDeadStatus, panePid, transcript: { baseOffset, endOffset } }`.
- Session metadata includes stable `generation: UUID` created on every new `session.open` and preserved by reconciliation.
- Reusing a closed session name creates a different generation.

- [ ] **Step 1: Write failing transcript-state tests**

Add a focused assertion to `transcript.test.mjs`:

```js
import { ensureTranscript, appendTranscript, readTranscriptState } from '../transcript.mjs';

test('readTranscriptState exposes logical offsets without transcript payload', async (t) => {
  const dir = await tempSession(t);
  await ensureTranscript(dir, { budgetBytes: 1024 });
  await appendTranscript(dir, Buffer.from('abc'), { budgetBytes: 1024 });
  assert.deepEqual(await readTranscriptState(dir), {
    baseOffset: 0,
    endOffset: 3,
    budgetBytes: 1024,
  });
});
```

Run:

```bash
cd providers/terminal
node --test test/transcript.test.mjs
```

Expected: FAIL because `readTranscriptState` is not exported.

- [ ] **Step 2: Implement `readTranscriptState` under the existing transcript lock**

Implement it by acquiring the existing transcript lock, loading/validating `cursor.json`, and returning only the three numeric fields. Do not read/return `transcript.bin`.

Run the focused transcript test and require PASS.

- [ ] **Step 3: Write failing stable-generation tests**

Extend `tmux.test.mjs` and `broker.test.mjs` to assert:

```js
const opened = await broker('session.open', { name: 'generation', command: 'cat' });
const first = await broker('session.observe', { name: 'generation' });
assert.match(first.generation, /^[0-9a-f-]{36}$/i);

await restartBrokerOnly();
const afterRestart = await broker('session.observe', { name: 'generation' });
assert.equal(afterRestart.generation, first.generation);

await broker('session.close', { name: 'generation', force: true });
await broker('session.open', { name: 'generation', command: 'cat' });
const replacement = await broker('session.observe', { name: 'generation' });
assert.notEqual(replacement.generation, first.generation);
```

Also extend `protocol.test.mjs` so private operation vocabulary includes `session.observe` but MCP catalog tests remain six tools.

Run:

```bash
node --test --test-name-pattern='generation|session.observe|operation vocabulary' test/tmux.test.mjs test/broker.test.mjs test/protocol.test.mjs
```

Expected: FAIL because `session.observe` and stable generation do not exist.

- [ ] **Step 4: Implement generation-preserving session metadata**

In `tmux.mjs` add private metadata read/merge helpers with this behavior:

```js
// new open
{ version: 2, name, generation: crypto.randomUUID(), cwd, createdAt }

// broker reconcile
const prior = await readSessionMetadata(name);
const generation = prior?.generation ?? crypto.randomUUID();
await writeSessionMetadata(name, { ...prior, version: 2, name, generation, recoveredAt });
```

Do not overwrite an existing generation during broker reconciliation. `openSession` must always write a new generation, even when a prior state directory from a closed same-name session remains.

- [ ] **Step 5: Implement private `session.observe`**

In `broker.mjs`:

```js
case 'session.observe': {
  const name = requireString(params.name, 'name');
  const info = await tmux.sessionInfo(name);
  const metadata = await tmux.sessionMetadata(name);
  const transcript = await readTranscriptState(tmux.sessionDir(name));
  return {
    name,
    generation: metadata.generation,
    paneDead: info.paneDead,
    paneDeadStatus: info.paneDeadStatus,
    panePid: info.panePid,
    transcript,
  };
}
```

Keep this private; do not register any new Terminal MCP tool.

- [ ] **Step 6: Run the full Terminal suite and commit**

```bash
(cd providers/terminal && npm test)
node --check providers/terminal/*.mjs
git diff --check
git add providers/terminal
git commit -m "feat: expose private terminal wait observations"
```

Expected: all Terminal tests pass and the public Terminal MCP catalog remains exactly six tools.

---

### Task 2: Implement durable named wait records and the bounded resume state machine

**Files:**
- Create: `providers/pi-dev/wait-state.mjs`
- Create: `providers/pi-dev/wait-engine.mjs`
- Create: `providers/pi-dev/test/wait-state.test.mjs`
- Create: `providers/pi-dev/test/wait-engine.test.mjs`

**Interfaces:**
- `WaitStore({ stateDir })` persists `$stateDir/waits/<name>.json` plus per-name lock files.
- `WaitEngine({ store, sources, now?, sleep? }).run(args, signal)` -> `{ status, name, text/evidence fields }`.
- Wait statuses: `pending | matched | timeout | cancelled | failed`.
- Named create is idempotent only for an identical normalized definition; conflicting redefinition returns `WAIT_CONFLICT`.
- Request abort stops only the current hold and leaves status `pending`.

- [ ] **Step 1: Write failing private-state permission and atomicity tests**

Create `wait-state.test.mjs` with tests equivalent to:

```js
test('wait store writes versioned private state atomically', async (t) => {
  const store = await fixtureStore(t);
  await store.create({
    name: 'build-ready',
    condition: { kind: 'tcp_listen', host: '127.0.0.1', port: 43210 },
    timeoutSeconds: 300,
    armedAtMs: 1000,
    deadlineAtMs: 301000,
    status: 'pending',
    baseline: null,
  });
  const saved = await store.read('build-ready');
  assert.equal(saved.version, 1);
  assert.equal(saved.status, 'pending');
  assert.equal((await fs.stat(store.fileFor('build-ready'))).mode & 0o777, 0o600);
});
```

Also test invalid names, corrupt JSON, and two concurrent writers to the same name serialize through a filesystem lock.

Run:

```bash
cd providers/pi-dev
node --test test/wait-state.test.mjs
```

Expected: FAIL because the store does not exist.

- [ ] **Step 2: Implement `WaitStore`**

Requirements:

```text
root          $MCP_DEV_STATE_DIR/waits, mode 0700
state file    <name>.json, mode 0600
write         temp wx -> fsync/close -> rename -> chmod
lock          per-name wx lock containing pid + createdAtMs
stale lock    recover when owner PID is gone; bounded lock acquisition
retention     terminal records retained 24 hours
```

The store must expose `withLock(name, fn)`, `read(name)`, `create(record)`, `write(record)`, and `gc(nowMs)`.

Run the state tests and require PASS.

- [ ] **Step 3: Write failing engine lifecycle tests**

Use fake sources and fake time in `wait-engine.test.mjs`:

```js
test('named create, resume, timeout, cancellation, and lost-response retry are durable', async () => {
  // create returns pending
  // identical create returns same record/deadline
  // different definition with same name throws WAIT_CONFLICT
  // resume observes matched source and persists matched before return
  // repeated resume returns the same matched evidence
  // deadline produces timeout without invoking any source mutation
  // explicit cancel persists cancelled
});
```

Add an AbortController test where an active hold is aborted and a later resume sees `pending`, not `cancelled`.

Run:

```bash
node --test test/wait-engine.test.mjs
```

Expected: FAIL because `WaitEngine` does not exist.

- [ ] **Step 4: Implement the generic engine with 15-second maximum hold**

Use these exact validation constants:

```js
export const DEFAULT_WAIT_TIMEOUT_SECONDS = 300;
export const MAX_WAIT_TIMEOUT_SECONDS = 86400;
export const DEFAULT_HOLD_SECONDS = 10;
export const MAX_HOLD_SECONDS = 15;
export const MIN_POLL_MS = 250;
export const COMPLETED_RETENTION_MS = 24 * 60 * 60 * 1000;
```

Engine sequence under the per-name lock:

```text
create -> normalize definition -> persist pending before first check
resume -> load record
cancel -> persist cancelled and return
terminal status -> replay persisted result
pending -> check source -> persist any baseline/cursor patch -> persist terminal result before return
hold loop -> never sleep/check past min(deadline, callStart+holdSeconds)
request AbortSignal -> stop loop, keep durable pending state
```

The engine must never call a source mutator/kill method because no such interface exists.

- [ ] **Step 5: Run wait-state/engine tests and commit**

```bash
(cd providers/pi-dev && node --test test/wait-state.test.mjs test/wait-engine.test.mjs)
node --check providers/pi-dev/wait-state.mjs providers/pi-dev/wait-engine.mjs
git diff --check
git add providers/pi-dev/wait-state.mjs providers/pi-dev/wait-engine.mjs providers/pi-dev/test/wait-state.test.mjs providers/pi-dev/test/wait-engine.test.mjs
git commit -m "feat: add durable local wait state machine"
```

---

### Task 3: Add the Terminal wait adapter with an independent transcript cursor

**Files:**
- Create: `providers/pi-dev/wait-terminal.mjs`
- Create: `providers/pi-dev/test/wait-terminal.test.mjs`
- Reuse: `providers/terminal/broker-client.mjs`

**Interfaces:**
- `TerminalWaitSource({ client, maxReadBytes? })`.
- `arm(condition)` for `terminal_output` -> baseline `{ generation, cursor, overlapBase64: '', paneDead, paneDeadStatus }` where cursor is arm-time transcript `endOffset`.
- `arm(condition)` for `terminal_exit` -> baseline `{ generation }`.
- `check(record)` -> `{ status: 'pending'|'matched'|'failed', baseline?, evidence?, code?, details? }`.

- [ ] **Step 1: Write failing independent-cursor and immediate-output tests**

Use the real Terminal sandbox broker from `providers/terminal/test/helpers.mjs` or a small shared fixture. The test must prove:

```js
const arm = await source.arm({ kind: 'terminal_output', session: 'race', literal: 'READY_NOW' });
// arm.cursor equals current transcript end
await brokerClient.request('session.send', { name: 'race', text: 'printf READY_NOW' });
await brokerClient.request('session.send', { name: 'race', key: 'Enter' });
const result = await pollSourceUntilMatched(source, arm);
assert.equal(result.status, 'matched');

// normal model read still owns its own unread cursor
const modelRead = await brokerClient.request('model.read', { name: 'race' });
assert.match(modelRead.text, /READY_NOW/);
const empty = await brokerClient.request('model.read', { name: 'race' });
assert.equal(empty.text, '');
```

Expected: FAIL because the Terminal wait source does not exist.

- [ ] **Step 2: Implement arm-time generation/end-offset capture**

Call private `session.observe`. For output waits:

```js
return {
  generation: observed.generation,
  cursor: observed.transcript.endOffset,
  overlapBase64: '',
};
```

Reject empty literals and literals larger than 1024 UTF-8 bytes as `INVALID_WAIT_CONDITION`.

- [ ] **Step 3: Implement stream literal matching without model-cursor consumption**

On each check:

1. call `session.observe`;
2. compare generation and fail `WAIT_SOURCE_REPLACED` on mismatch;
3. if `endOffset > baseline.cursor`, call private `session.read` with explicit cursor and bounded max bytes until caught up/matched;
4. prepend persisted overlap bytes, search for the UTF-8 literal bytes, compute logical match offsets;
5. atomically return baseline patch `{cursor, overlapBase64}` after each scanned chunk;
6. retain at most `literalByteLength - 1` overlap bytes.

Never call `model.read`.

- [ ] **Step 4: Add failing rotation/dead/replacement/broker-restart tests**

Cover:

```text
CURSOR_EXPIRED -> failed with exact code/details; no silent jump
CURSOR_AHEAD   -> failed with exact code/details
retained dead after final drain, no match -> WAIT_SOURCE_ENDED + exact exit status
terminal_exit on retained exit 7 -> matched exit=7
same name, new generation -> WAIT_SOURCE_REPLACED
broker restart while pending -> same generation/cursor resumes and later matches
human attach -> output source remains read-only/usable
```

Use a small transcript budget for the `CURSOR_EXPIRED` fixture.

- [ ] **Step 5: Make all Terminal adapter tests pass and commit**

```bash
(cd providers/pi-dev && node --test test/wait-terminal.test.mjs)
(cd providers/terminal && npm test)
node --check providers/pi-dev/wait-terminal.mjs
git diff --check
git add providers/pi-dev/wait-terminal.mjs providers/pi-dev/test/wait-terminal.test.mjs
git commit -m "feat: wait on durable terminal transcript state"
```

---

### Task 4: Add declarative local-host condition sources

**Files:**
- Create: `providers/pi-dev/wait-local.mjs`
- Create: `providers/pi-dev/test/wait-local.test.mjs`

**Interfaces:**
- `LocalWaitSources({ defaultCwd, fetchImpl?, systemctlBin?, now? })`.
- Supports `process_exit`, `tcp_listen`, `file_exists`, `file_changed`, `http_ready`, `systemd_user`.
- Every source is read-only.

- [ ] **Step 1: Write failing PID identity tests**

Use a real short-lived child process. Assert arm captures `/proc/<pid>/stat` start-time ticks and check matches after exit. Unit-test parser with a synthetic `/proc/<pid>/stat` line whose command name contains spaces/parentheses so field extraction is not implemented by naive whitespace splitting.

Expected: FAIL because the local source module does not exist.

- [ ] **Step 2: Implement `process_exit` observation**

Parse field 22 after locating the final `)` of the comm field. Store `{ pid, startTimeTicks }`. On check:

```text
/proc entry absent        -> matched
same pid, same starttime  -> pending
same pid, new starttime   -> matched (original process exited; PID reused)
```

Never signal/reap the target.

- [ ] **Step 3: Write failing TCP and file tests**

Use disposable fixtures:

```text
TCP: closed local port -> pending; start net.Server -> matched
file_exists: absent -> pending; create -> matched
file_changed: baseline existing file -> pending; mutate -> matched
file_changed: baseline absent -> create -> matched
```

Resolve file paths with `resolveUserPath(defaultCwd, path, { mustExist: false })`. Store a fingerprint containing existence and bigint-safe string values for `dev`, `ino`, `size`, `mtimeNs`, and `ctimeNs` when available.

- [ ] **Step 4: Implement TCP/file checkers**

TCP probes use `net.createConnection` and a hard 500 ms connection timeout. Refused/timed-out connection means pending.

File checks use `fs.stat(..., { bigint: true })`; `ENOENT` is expected state, not an error.

- [ ] **Step 5: Write failing HTTP/systemd tests**

HTTP fixture:

```text
local server returns 503 -> pending
switch to 204 -> matched when no explicit status requested
explicit status=503 -> 503 matches
URL with username/password -> INVALID_WAIT_CONDITION
```

systemd tests should dependency-inject the command runner so unit tests assert exact argument-array invocation:

```js
['--user', 'show', unit, '--property=ActiveState', '--property=SubState', '--value']
```

No shell string is permitted.

- [ ] **Step 6: Implement HTTP/systemd checkers**

HTTP:

```text
http/https only
no URL userinfo
no headers/cookies/body API
2-second per-probe AbortSignal timeout
explicit status matches exact code; otherwise 200..399 matches
response body ignored
minimum repeat interval 500 ms enforced by engine source metadata
```

systemd:

```text
unit validation ^[A-Za-z0-9@_.:-]{1,256}$
state enum active|inactive|failed, default active
systemctl --user show only
state mismatch -> pending
command/bus unavailability -> WAIT_SOURCE_UNAVAILABLE
```

- [ ] **Step 7: Run all local-source tests and commit**

```bash
(cd providers/pi-dev && node --test test/wait-local.test.mjs)
node --check providers/pi-dev/wait-local.mjs
git diff --check
git add providers/pi-dev/wait-local.mjs providers/pi-dev/test/wait-local.test.mjs
git commit -m "feat: add local readiness wait sources"
```

---

### Task 5: Expose exactly one personal `wait` tool in the existing dev provider

**Files:**
- Create: `providers/pi-dev/wait-schema.mjs`
- Modify: `providers/pi-dev/server.mjs`
- Modify: `providers/pi-dev/test/server.test.mjs`
- Modify: `config/templates/mcp-personal.json`
- Modify: `scripts/render-config.mjs`
- Modify: `scripts/smoke-local.sh`
- Modify: `tests/harness.sh`

**Interfaces:**
- Public tool exists only when `MCP_DEV_PATH_MODE=user` and the personal dev provider is rendered.
- Public tool signature:

```text
wait(
  name: string,
  condition?: WaitCondition,
  timeout_seconds?: integer 1..86400,
  hold_seconds?: integer 0..15,
  cancel?: boolean
)
```

- First `WaitCondition` union is exactly:

```text
terminal_output { session, literal }
terminal_exit   { session }
process_exit    { pid }
tcp_listen      { host?, port }
file_exists     { path }
file_changed    { path }
http_ready      { url, status? }
systemd_user    { unit, state? }
```

No regex, agent-state, shell-predicate, notification, cron, or arbitrary command kind.

- [ ] **Step 1: Write failing catalog/schema tests**

Extend personal server tests:

```js
const tools = await personalClient.listTools();
assert.deepEqual(tools.tools.map(x => x.name).sort(), [
  'apply_patch', 'bash', 'edit', 'read', 'wait', 'write'
]);
```

Restricted/trusted-dev expectations remain unchanged. Add invalid-combination calls proving schema/validation rejects:

```text
condition omitted for unknown name is runtime WAIT_NOT_FOUND
condition + cancel=true is invalid
cancel=true + timeout_seconds is invalid
terminal_output with regex field is invalid
terminal_output with empty/oversized literal is invalid
```

Expected: FAIL because `wait` is absent.

- [ ] **Step 2: Build the Zod condition/action schema**

Create `wait-schema.mjs` exporting `waitInputSchema`. Use a discriminated union on `condition.kind` and `.superRefine()` for create/resume/cancel mode rules.

Keep schema descriptions concise; explicitly describe Terminal output as "new transcript output after the wait is armed".

- [ ] **Step 3: Wire `WaitEngine` into personal server startup**

In `server.mjs`, only under `pathMode === 'user'`:

```js
const waitStore = new WaitStore({ stateDir });
const terminalClient = new BrokerClient({ socketPath: terminalSocketPath });
const waitEngine = createWaitEngine({
  store: waitStore,
  terminal: new TerminalWaitSource({ client: terminalClient }),
  local: new LocalWaitSources({ defaultCwd }),
});
```

Register `wait` and pass `extra.signal` to `waitEngine.run(args, extra.signal)`.

Render only concise native text:

```text
pending <name> deadline=<ISO>
matched <name> <evidence>
timeout <name>
cancelled <name>
```

Errors remain `isError:true` TextContent with stable wait/Terminal codes.

- [ ] **Step 4: Give only personal dev the Terminal broker socket path**

Add to personal dev template:

```json
"MCP_DEV_TERMINAL_SOCKET": "__TERMINAL_SOCKET__"
```

`render-config.mjs` already calculates `__TERMINAL_SOCKET__`; reuse it. Do not alter public templates.

At startup, require this absolute socket only when user-mode wait is enabled. Tests may override it with a sandbox socket.

- [ ] **Step 5: Add in-memory and stdio MCP behavior tests**

Prove:

```text
one new tool only: wait
native TextContent only
create -> pending with stable name
same identical create -> same deadline/state
resume -> matched
cancel -> cancelled
AbortSignal -> call stops, record remains pending
Terminal output match does not consume model Terminal cursor
```

- [ ] **Step 6: Update personal composition/static gates**

`tests/harness.sh` must still require providers exactly `code`, `dev`, `terminal`; this task changes a tool inside `dev`, not provider count.

`smoke-local.sh` validates the personal dev Terminal socket is absolute and points to `wsl-agent-terminal.sock`. Restricted/trusted-dev remain without that environment variable and without `wait`.

- [ ] **Step 7: Run provider/composition gates and commit**

```bash
(cd providers/pi-dev && npm test)
(cd providers/terminal && npm test)
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
node --check providers/pi-dev/*.mjs providers/terminal/*.mjs scripts/render-config.mjs
bash -n scripts/smoke-local.sh tests/harness.sh tests/publication.sh tests/lifecycle.sh
git diff --check
git add providers/pi-dev config/templates/mcp-personal.json scripts/render-config.mjs scripts/smoke-local.sh tests/harness.sh
git commit -m "feat: expose durable personal wait action"
```

---

### Task 6: Qualify restart/resume semantics and the selected condition matrix locally

**Files:**
- Create: `docs/benchmarks/terminal-await-resume-acceptance.md`
- Modify tests only if a qualification defect requires a regression in already-owned wait/Terminal files.

**Interfaces:**
- Produces local evidence for every first-phase condition and every required restart/cancellation contract.

- [ ] **Step 1: Run the race-safe Terminal output sequence**

Automate:

```text
wait(name=immediate, terminal_output literal=READY_NOW, hold=0) -> pending
terminal_send immediate marker
wait(name=immediate) -> matched
terminal_read -> contains READY_NOW once
terminal_read again -> empty
```

Record the model cursor before/after wait scanning and prove only `terminal_read` advances it.

- [ ] **Step 2: Run Terminal broker-restart while a wait is pending**

Create a pending output wait against a live producer, record wait cursor/generation plus broker/tmux/pane PIDs, restart only the broker, and require:

```text
broker PID changed
tmux PID unchanged
pane PID unchanged
wait generation unchanged
wait cursor not reset
later output matches same wait name
normal terminal_read still receives unread output
```

Also rerun the Task-6.6 mixed live/dead broker regression and immediate-first-byte test.

- [ ] **Step 3: Run provider-process restart durability**

Use a disposable personal `pi-dev` stdio process with a persistent `MCP_DEV_STATE_DIR`:

```text
create named pending wait
close provider process
start new provider with same state dir
resume same name
verify original deadline/baseline retained
```

Do this for one Terminal output wait and one file-change wait.

- [ ] **Step 4: Run cancellation/timeout tests against live resources**

Prove:

```text
abort one wait MCP call -> underlying wait pending; source alive
explicit cancel -> wait cancelled; source alive
timeout -> wait timeout; source alive
```

For Terminal use a live shell and confirm pane PID is unchanged. For PID wait confirm the observed process is not signaled by wait cancel/timeout.

- [ ] **Step 5: Exercise every local condition with disposable fixtures**

Record:

```text
process_exit    short-lived child + identity
TCP             server begins listening after arm
file_exists     file created after arm
file_changed    file mutated after arm
HTTP            503 -> 204 transition
systemd_user    disposable user test unit reaches active
```

Do not use real privileged/system services.

- [ ] **Step 6: Qualify transcript rotation failure semantics**

Use a deliberately small transcript budget. Let a named output wait remain unresumed until its independent cursor expires. Resume and require exact `CURSOR_EXPIRED`; assert the engine does not mark matched/unmatched and does not advance to the retained tail.

- [ ] **Step 7: Write local acceptance evidence and commit**

The benchmark must record:

```text
WAIT_BOUNDARY                 SPLIT_LAYER
OUTPUT_WAIT_STRATEGY          DURABLE_TRANSCRIPT_OFFSETS_WITH_INDEPENDENT_WAIT_CURSOR
MODEL_FACING_WAIT_API         wait(...)
WAIT_STATE_DURABILITY         local/provider/broker restart matrix
AGENT_LIFECYCLE               DEFERRED_WITH_TRIGGER
LOCAL_WAIT_ACCEPTANCE         PASS|FAIL
```

Commit:

```bash
git add docs/benchmarks/terminal-await-resume-acceptance.md providers/pi-dev/test providers/terminal/test
git commit -m "docs: qualify durable local wait semantics"
```

---

### Task 7: External 1MCP and real ChatGPT product-path acceptance

**Files:**
- Modify: `docs/benchmarks/terminal-await-resume-acceptance.md`
- No implementation changes unless a reproduced product defect receives a focused RED/GREEN fix first.

**Interfaces:**
- Final product gate for Task 8.

- [ ] **Step 1: Prepare rollback and activate externally**

Do not restart a bridge from a request running through that same bridge. From an external controller, deploy the integrated implementation, render personal composition, restart/reconcile 1MCP/bridge, and refresh ChatGPT actions/connectors.

- [ ] **Step 2: Verify catalog and bounded request lifetime**

From a fresh ChatGPT session verify:

```text
existing Files/Shell/Code/Terminal tools unchanged
exactly one new wait action
no new provider/domain
Terminal remains exactly six tools
```

Create a 30-second condition with `hold_seconds=10`; prove each call returns within the bounded hold and the same name resumes across calls.

- [ ] **Step 3: Verify real resume across 1MCP/provider restart**

Create a pending named condition. From the external controller restart/reconcile the bridge/1MCP. After refresh/reconnect, resume the same wait name and prove original deadline/baseline survived.

- [ ] **Step 4: Verify Terminal output context behavior**

Arm output wait nonblocking, send work, resume until matched, then call `terminal_read` once. Record that wait responses contain only concise status/evidence and terminal output appears only through the normal unread read path.

- [ ] **Step 5: Verify one generic readiness condition**

Use TCP or HTTP readiness for a disposable local dev server. Prove the model can do other work between wait resume calls without manually issuing repeated Bash readiness commands.

- [ ] **Step 6: Verify disconnect/cancellation behavior**

Interrupt/cancel one in-flight bounded wait request at the product layer. Retry `wait(name=...)` and prove the durable wait still exists unless explicit `cancel=true` was issued.

Do not classify a product-runtime interception that occurs before MCP as a provider defect unless server-side evidence shows the request reached the wait implementation.

- [ ] **Step 7: Record final product verdict**

Update acceptance with:

```text
REAL_WAIT_ACCEPTANCE: PASS|FAIL
TASK8_COMPLETE: YES|NO
```

If PASS, Task 8 may move to final consolidation. If FAIL, preserve local acceptance and record the exact product-path boundary that failed.

---

## Explicitly deferred work

Do not include these in the first implementation branch:

```text
terminal output regex
coding-agent working/idle/blocked/done detection
Herdr runtime or libraries
server-initiated ChatGPT notification/resume
background wait daemon
wait_list / history / cron / scheduled automation
generic shell-command predicate
dedicated wait_port / wait_file / wait_http / wait_systemd tools
structuredContent or output codec
```

Reopen them only under the triggers in `docs/superpowers/specs/2026-08-16-terminal-await-resume-design.md`.
