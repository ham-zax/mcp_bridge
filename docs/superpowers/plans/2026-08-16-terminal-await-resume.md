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
- Broker owns a short in-memory per-name lifecycle serializer for incarnation-sensitive `session.open`, `session.close`, `session.read`, `model.read`, and `session.observe` operations.
- Private broker operation `session.observe` with `{ name }` -> `{ name, generation, paneDead, paneDeadStatus, panePid, transcript: { baseOffset, endOffset } }`, validated against one stable generation.
- Private `session.read` accepts optional `expectedGeneration`; it validates that generation before and after reading transcript bytes and rejects replacement races with `SESSION_GENERATION_MISMATCH`.
- Session metadata includes stable `generation: UUID` created on every new `session.open` and preserved by reconciliation, and metadata writes are atomic.
- Reusing a closed session name creates a different generation **and fresh per-incarnation transcript/model-cursor state**; prior-session bytes must never replay into the new incarnation.

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

Add a same-name incarnation regression that reproduces the live coordinator finding before the fix:

```text
open name -> emit OLD_SESSION_MARKER -> read -> close
open same name -> emit NEW_SESSION_MARKER -> read
```

Expected RED behavior on the current base: the second read contains both old and new markers. The green contract is that it contains only the new incarnation's bytes.

Add a race-oriented private-read test that replaces a same-name session while an explicit read is in progress. An `expectedGeneration` read must either return bytes from that generation or reject with `SESSION_GENERATION_MISMATCH`; it must never return replacement-session bytes as though they belonged to the old generation.

Add a concurrent-open regression: two same-name `session.open` requests launched together must produce exactly one successful incarnation, one `SESSION_EXISTS` failure, one generation, and one fresh transcript state. The loser must never reset/delete the winner's state after the winner has created its tmux session.

Run:

```bash
node --test --test-name-pattern='generation|session.observe|expectedGeneration|same-name|concurrent open|operation vocabulary' test/tmux.test.mjs test/broker.test.mjs test/protocol.test.mjs
```

Expected: FAIL because `session.observe` and stable generation do not exist.

- [ ] **Step 4: Implement generation-preserving session metadata**

In `tmux.mjs` add private metadata read/merge helpers with this behavior:

```js
// genuinely new open, after proving no tmux session with this name exists
await resetPriorIncarnationState(name);
const generation = crypto.randomUUID();
await writeSessionMetadataAtomic(name, {
  version: 2,
  name,
  generation,
  cwd,
  createdAt: new Date().toISOString(),
});

// broker reconcile of the same still-existing tmux incarnation
const prior = await readSessionMetadata(name);
const recoveredGeneration = prior?.generation ?? crypto.randomUUID();
await writeSessionMetadataAtomic(name, {
  ...prior,
  version: 2,
  name,
  generation: recoveredGeneration,
  recoveredAt,
});
```

At the broker boundary, serialize incarnation-sensitive operations per session name. `session.open` holds that lifecycle lease while it verifies the name is absent, resets prior-incarnation state, creates/configures tmux, writes the new generation metadata, and releases the startup gate. `session.close`, `session.read`, `model.read`, and `session.observe` use the same short serializer so state reset cannot race an active read/observation. This is an in-memory broker coordination primitive, not a new persisted lock or MCP surface.

`resetPriorIncarnationState(name)` clears stale transcript/cursor/session metadata left by an explicitly closed prior incarnation before the new command gate is released. It must not run during broker reconciliation and must never reset a still-existing tmux session.

Do not overwrite an existing generation during broker reconciliation. `openSession` always creates a new generation and fresh per-incarnation transcript state. Make `session.json` writes temp-file + rename atomic so a broker crash cannot silently truncate the generation identity.

- [ ] **Step 5: Implement private `session.observe`**

In `broker.mjs`, implement `session.observe` as a generation-stable observation: read the session generation, collect tmux/transcript state, then verify the generation is unchanged before returning. If the incarnation changed during the observation, return `SESSION_GENERATION_MISMATCH` rather than mixed state.

Extend private `session.read` with optional `expectedGeneration`:

```text
validate expected generation before transcript read
read explicit transcript cursor
validate expected generation again before return
mismatch at either boundary -> SESSION_GENERATION_MISMATCH
```

This guard is private Terminal protocol only; do not change `terminal_read` MCP schema or the six-tool Terminal catalog.

Keep `session.observe` private; do not register any new Terminal MCP tool.

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
- `WaitStore({ stateDir })` persists `$stateDir/waits/<name>.json`; cross-process ownership uses a per-name Linux abstract Unix socket bind keyed by uid + canonical waits root + wait name, not a reclaimable lock file.
- `WaitStore.withLock(name, fn, { signal, maxWaitMs })` is cross-process, abort-aware, kernel-released on process death, and never lets a canceled queued waiter enter later.
- `WaitEngine({ store, sources, now?, sleep? }).run(args, signal)` -> `{ status, name, text/evidence fields }`.
- Wait statuses: `pending | matched | timeout | cancelled | failed`.
- Named create is idempotent only for an identical normalized definition after a fully armed record has been persisted; conflicting redefinition returns `WAIT_CONFLICT`.
- Initial create is linearized only after source arm/baseline capture succeeds **and** the fully prepared record is atomically installed at its final wait-state path. The successful atomic rename/install is the first-persistence commit point. Caller abort or positive hold before that commit prevents installation and leaves no named record; once the rename succeeds, the durable commit wins and later caller/hold events cannot retroactively deny or erase it.
- Once a fully armed record exists, request abort stops lock acquisition/check/hold and leaves that durable status `pending` with the same baseline/deadline; lock contention can return transient `WAIT_BUSY`.

- [ ] **Step 1: Write failing private-state permission and atomicity tests**

Create `wait-state.test.mjs` with tests equivalent to:

```js
test('wait store writes versioned private state atomically', async (t) => {
  const store = await fixtureStore(t);
  await store.create({
    name: 'build-ready',
    definition: {
      condition: { kind: 'tcp_listen', host: '127.0.0.1', port: 43210 },
      timeoutSeconds: 300,
    },
    condition: { kind: 'tcp_listen', host: '127.0.0.1', port: 43210 },
    timeoutSeconds: 300,
    armedAtMs: 1000,
    deadlineAtMs: 301000,
    status: 'pending',
    sourceArmed: true,
    baseline: { host: '127.0.0.1', port: 43210 },
    lastCheckedAtMs: 1000,
  });
  const saved = await store.read('build-ready');
  assert.equal(saved.version, 1);
  assert.equal(saved.status, 'pending');
  assert.equal((await fs.stat(store.fileFor('build-ready'))).mode & 0o777, 0o600);
});
```

Also test invalid names, corrupt JSON, and two concurrent writers to the same name serialize through the kernel-backed per-name lock. Cross-process regressions must cover owner death, two recovery contenders, different-name concurrency, cancellation, and legacy stale lock metadata whose PID may now belong to an unrelated live process.

Add the cancellation regression analogous to the Files coordinator bug already found in Phase 2:

```text
holder owns wait name lock
second request queues
AbortSignal fires while queued
holder releases
canceled callback must never enter
later live waiter must still acquire normally
```

Also assert a contending lock attempt fast-fails as `WAIT_BUSY` within 250 ms instead of waiting behind a 10-15 second hold.

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
lock          per-name Linux abstract Unix socket bind keyed by uid + canonical waits root + name
acquisition   AbortSignal-aware; canceled waiter never enters later
contention    250 ms maximum arbitration -> WAIT_BUSY, not an extra long MCP wait
owner death   kernel releases the abstract socket; no stale-path unlink or PID ownership inference
migration     legacy $stateDir/waits/.locks files are ignored and cannot block ownership
retention     completed records retained 24 hours
```

The store must expose `withLock(name, fn, { signal, maxWaitMs })`, `read(name)`, `create(record)`, `write(record)`, and `gc(nowMs)`. `withLock` checks cancellation before acquisition, while queued, after grant, and immediately before callback entry. Version-1 records are semantically validated on read/write: every durable pending record is fully armed (`sourceArmed=true`) with a non-null baseline, consistent definition/condition/timeout/deadline, valid arm/check timestamps, and no completion timestamp; terminal statuses require their appropriate completion invariants. Invalid semantic state returns `WAIT_STATE_CORRUPT` rather than being re-armed or treated as immortal pending state.

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

Add AbortController tests where (a) an active hold is aborted and a later resume sees `pending`, not `cancelled`, and (b) a request canceled while queued for the same-name store lock never enters the state-machine callback after the holder releases. A live waiter behind the canceled waiter must still make progress.

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
export const WAIT_LOCK_ACQUIRE_MS = 250;
export const COMPLETED_RETENTION_MS = 24 * 60 * 60 * 1000;
```

Engine sequence under the per-name lock:

```text
start the invocation hold budget near WaitEngine.run() entry
abort-aware lock acquisition is capped at WAIT_LOCK_ACQUIRE_MS (250 ms)
lock unavailable within 250 ms -> WAIT_BUSY; durable state unchanged
create -> normalize definition -> compute absolute deadline -> source.arm in memory
hold_seconds=0 initial arm -> use the source's normal bounded arm behavior; do not impose a zero-ms hold deadline
hold_seconds>0 initial arm -> reuse the derived operation boundary bounded by caller abort, absolute wait deadline, and positive call hold deadline
positive hold expires before first durable baseline -> WAIT_HOLD_EXPIRED; no record exists; later name-only resume -> WAIT_NOT_FOUND
initial arm success inside budget -> deadline/hold arbitration -> prepare first fully armed record privately
first persistence temp/write/fsync -> remains private and boundary-aware
caller abort before atomic final install -> WAIT_ABORTED; temp cleaned; no record exists
positive hold before atomic final install -> WAIT_HOLD_EXPIRED; temp cleaned; no record exists
atomic rename/install of fully prepared record -> FIRST DURABLE COMMIT / linearization point
caller abort or hold after atomic install -> commit wins; do not deny/delete durable wait
absolute wait deadline before a pending/matched first commit -> timeout semantics; never commit pending/matched after deadline
resume -> load already-armed record
cancel -> persist cancelled and return
terminal status -> replay persisted result
before each source check -> absolute deadline arbitration
source check -> derived operation signal bounded by caller abort, absolute wait deadline, and current call hold deadline
after each awaited source arm/check -> absolute deadline arbitration
immediately before source-result persistence -> absolute deadline arbitration again
absolute deadline wins over any late matched/pending/failed source result -> persist timeout
call hold deadline wins over an unfinished check after durable arm -> return pending; do not persist timeout or the late source result
request AbortSignal wins before result commitment -> WAIT_ABORTED; an existing armed record remains pending unchanged
```

`hold_seconds=0` means one immediate bounded arm/check cycle with no polling hold afterward; it does **not** impose a zero-millisecond deadline on source arming or first persistence. For `hold_seconds>0`, the hold deadline is a true total invocation budget beginning near `WaitEngine.run()` entry and includes lock/GC/source arm/first persistence/source check/polling work. The same internal operation-boundary machinery is used for initial arm, first durable creation, and resumed checks. First creation prepares a private temp record and checks the derived signal up to the synchronous atomic rename into the final state path. That rename is the commit point: pre-commit hold -> `WAIT_HOLD_EXPIRED` + no record; post-commit hold -> `pending` + preserved durable state. Caller abort follows the same pre/post-commit split with `WAIT_ABORTED` only when abort wins before commit. Initial create never exposes an unarmed durable record.

Do not allow lock arbitration to turn `hold_seconds=0` into a long blocking call or to extend a 15-second hold by another long lock timeout.

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
- All private broker calls accept/pass an internal request `AbortSignal`; Terminal wait transport failures are normalized rather than exposed as raw socket/tmux diagnostics.

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
3. if `endOffset > baseline.cursor`, call private `session.read` with explicit cursor, bounded max bytes, and `expectedGeneration: baseline.generation` until caught up/matched;
4. map private `SESSION_GENERATION_MISMATCH` to terminal wait status `WAIT_SOURCE_REPLACED`;
5. prepend persisted overlap bytes, search for the UTF-8 literal bytes, compute logical match offsets;
6. atomically return baseline patch `{cursor, overlapBase64}` after each scanned chunk;
7. retain at most `literalByteLength - 1` overlap bytes.

A literal match is accepted only from a generation-guarded read. Do not accept a match based solely on an earlier `session.observe` result because close/reopen may race between observation and transcript access.

Never call `model.read`.

- [ ] **Step 4: Add failing rotation/dead/replacement/broker-restart tests**

Cover:

```text
CURSOR_EXPIRED -> failed with exact code/details; no silent jump
CURSOR_AHEAD   -> failed with exact code/details
retained dead after final drain, no match -> WAIT_SOURCE_ENDED + exact exit status
terminal_exit on retained exit 7 -> matched exit=7
same name, new generation -> WAIT_SOURCE_REPLACED
same-name replacement racing transcript read -> WAIT_SOURCE_REPLACED, never false match
broker restart while pending -> same generation/cursor resumes and later matches
broker unavailable after retry window -> transient WAIT_SOURCE_UNAVAILABLE; baseline/deadline unchanged
request abort during broker connect/retry/in-flight request -> prompt WAIT_ABORTED; no delayed retries/socket/listener leak
explicitly destroyed old generation with name absent -> WAIT_SOURCE_ENDED with bounded unknown-exit details
same name reopened at a different generation -> WAIT_SOURCE_REPLACED
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

Use a real short-lived child process. Assert arm captures `/proc/<pid>/stat` start-time ticks and check matches after exit. Also prove an already-absent PID matches immediately at arm/check rather than fabricating an identity. Unit-test parser with a synthetic `/proc/<pid>/stat` line whose command name contains spaces/parentheses so field extraction is not implemented by naive whitespace splitting.

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
redirect: manual (do not silently follow redirect chains or cross-origin redirects)
2-second per-probe AbortSignal timeout
explicit status matches exact observed code; otherwise observed 200..399 matches
response body ignored
minimum repeat interval 500 ms enforced by engine source metadata
```

systemd:

```text
unit validation ^[A-Za-z0-9@_.:-]{1,256}$
state enum active|inactive|failed, default active
systemctl --user show only
subprocess environment preserves explicit values; when absent derive XDG_RUNTIME_DIR=/run/user/<uid> and DBUS_SESSION_BUS_ADDRESS=unix:path=<runtime>/bus
2-second subprocess timeout; request AbortSignal is passed to execFile
request abort -> WAIT_ABORTED
state mismatch -> pending
command/bus unavailability -> transient WAIT_SOURCE_UNAVAILABLE; durable named wait remains pending for later resume
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
- Modify: `tests/publication.sh` only if needed to prove the public export can load `pi-dev` without the private Terminal tree

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

In `server.mjs`, only under `pathMode === 'user'`, initialize the wait subsystem. **Do not add a top-level static import from `pi-dev` into `providers/terminal/**`** because that private tree is excluded from the public bridge export. Load the Terminal broker client only inside the personal/user branch, for example:

```js
if (pathMode === 'user') {
  const { BrokerClient } = await import('../terminal/broker-client.mjs');
  const waitStore = new WaitStore({ stateDir });
  const terminalClient = new BrokerClient({ socketPath: terminalSocketPath });
  const waitEngine = createWaitEngine({
    store: waitStore,
    terminal: new TerminalWaitSource({ client: terminalClient }),
    local: new LocalWaitSources({ defaultCwd }),
  });
  // register wait here
}
```

`TerminalWaitSource` accepts an injected client and must not itself statically import the private Terminal provider. Public workspace modes must be able to load/run `pi-dev` when `providers/terminal/**` is absent from the exported tree.

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
restricted/trusted-dev provider startup does not require the private Terminal tree
```

Add a public-export/runtime regression that exercises the workspace-mode `pi-dev` surface from a fixture where `providers/terminal/**` is absent. This guards against accidentally turning the personal wait implementation into a static dependency of the public provider.

- [ ] **Step 6: Update personal composition/static gates**

`tests/harness.sh` must still require providers exactly `code`, `dev`, `terminal`; this task changes a tool inside `dev`, not provider count.

`smoke-local.sh` validates the personal dev Terminal socket is absolute and points to `wsl-agent-terminal.sock`. Restricted/trusted-dev remain without that environment variable and without `wait`.

Before committing the model-facing schema, capture actual `tools/list` bytes and `o200k_base` tokens for:

```text
personal catalog before wait
personal catalog with wait
incremental wait schema only
```

Also record the wait request shape for each condition kind. Do not infer low context cost from "one tool" alone; the eight-kind condition union is part of the schema tax. Carry these numbers into Task 6's value benchmark.

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

- [ ] **Step 6: Qualify transcript rotation and same-name incarnation semantics**

Use a deliberately small transcript budget. Let a named output wait remain unresumed until its independent cursor expires. Resume and require exact `CURSOR_EXPIRED`; assert the engine does not mark matched/unmatched and does not advance to the retained tail.

Then repeat the coordinator's same-name lifecycle against the implemented Terminal core:

```text
open -> OLD_SESSION_MARKER -> close
open same name -> NEW_SESSION_MARKER
```

Require the new model read contains only the new incarnation's transcript. Arm an old-generation wait before replacement and require `WAIT_SOURCE_REPLACED`; never allow the new marker to satisfy the old wait.

- [ ] **Step 7: Benchmark context/schema value against manual polling**

Use the actual emitted MCP schemas and one disposable readiness workflow that would otherwise require at least three checks over roughly 30 seconds. Compare:

```text
baseline personal schema bytes/tokens
personal schema bytes/tokens with wait
incremental schema tax
manual polling request/result tokens and calls
named wait request/result tokens and calls
follow-up debt
break-even avoided polls
```

Use the same tokenizer/accounting method already used by the harness benchmarks. If the full eight-kind one-tool union fails to materially reduce total schema+request+result cost for that real repeated-check workflow, stop before product activation and classify the issue as a surface/schema design problem. Compare a narrowed first-phase condition set or split surface rather than shipping a context-negative union.

- [ ] **Step 8: Write local acceptance evidence and commit**

The benchmark must record:

```text
WAIT_BOUNDARY                 SPLIT_LAYER
OUTPUT_WAIT_STRATEGY          DURABLE_TRANSCRIPT_OFFSETS_WITH_INDEPENDENT_WAIT_CURSOR
MODEL_FACING_WAIT_API         wait(...)
WAIT_STATE_DURABILITY         local/provider/broker restart matrix
WAIT_SCHEMA_VALUE_GATE        PASS|REDESIGN
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

- [ ] **Step 1: Prepare a fresh rollback anchor and activate externally**

Do not reuse the pre-Task-7 rollback bundle as the primary Task-8 rollback target. Before changing the accepted live deployment, capture a **new rollback bundle for the currently accepted Task-7 system** (Files atomicity/cancellation + Code facade + six-tool Terminal, with `TERMINAL_ACCEPTED`). That accepted deployment is the known-good parent of Task 8 and should be restored if wait activation fails.

Do not restart a bridge from a request running through that same bridge. From an external controller, verify the fresh rollback bundle/dry-run, deploy the integrated Task-8 implementation, render personal composition, restart/reconcile 1MCP/bridge, and refresh ChatGPT actions/connectors.

- [ ] **Step 2: Verify catalog and bounded request lifetime**

From a fresh ChatGPT session verify:

```text
existing Files/Shell/Code/Terminal tools unchanged
exactly one new wait action
no new provider/domain
Terminal remains exactly six tools
```

Create a 30-second condition with `hold_seconds=10`; prove each call returns within the bounded hold and the same name resumes across calls. Confirm the locally recorded `WAIT_SCHEMA_VALUE_GATE` remains valid against the real refreshed ChatGPT catalog; if the actual product-visible schema materially differs from the local measurement, stop and re-measure before accepting the surface.

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
