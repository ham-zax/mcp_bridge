# Persistent Agent Loop Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class durable timer wait plus model-facing guidance and a reusable ChatGPT Skill for long-lived, steerable agent loops.

**Architecture:** Keep the existing durable WaitEngine, atomic wait store, 10-second default hold, 15-second maximum hold, and 24-hour durable timeout unchanged. Add one local `timer` condition that can be armed either relatively (`after_seconds`) or absolutely (`at` RFC3339 with timezone), persist its target instant in the wait baseline, and report `matched` when that instant is reached. Keep tool routing in `mcp-harness-router`; put long-lived mission behavior in a separate `persistent-agent-loop` Skill with a same-folder reference file loaded only when needed.

**Tech Stack:** Node.js ESM, Zod, Node test runner, repository Skill bundles, OpenAI Skill Creator validator.

## Global Constraints

- Existing durable wait create/resume/cancel semantics must remain unchanged.
- `timeout_seconds` remains the outer durable safety deadline: default 300 seconds, range 1..86400 seconds.
- `hold_seconds` remains the per-invocation budget: default 10 seconds, range 0..15 seconds.
- A timer must never use Bash `sleep`, a background process, or an impossible filesystem condition.
- `timer.after_seconds` is relative to the successful durable arm boundary and is limited to 1..86399 seconds so a max-86400-second safety deadline can remain strictly later; `timer.at` is an absolute timezone-qualified RFC3339/ISO-8601 instant.
- Exactly one of `after_seconds` or `at` is required.
- A timer already due when armed matches immediately.
- For `timer.at`, timezone-less timestamps are rejected.
- The wait safety deadline must be later than the timer target; guidance must tell agents to leave margin because the WaitEngine gives the durable deadline precedence.
- Multi-day missions longer than 24 hours use renewed wait leases/checkpoints rather than increasing the 24-hour wait ceiling.
- The new Skill must keep `SKILL.md` compact and refer directly to same-folder `references/protocol.md` for detailed state-machine guidance.
- Experimental benchmark evidence remains historical evidence, not executable policy.

---

### Task 1: Native durable timer condition

**Files:**
- Modify: `providers/pi-dev/wait-schema.mjs`
- Modify: `providers/pi-dev/wait-local.mjs`
- Modify: `providers/pi-dev/server.mjs`
- Modify: `providers/pi-dev/test/wait-local.test.mjs`
- Modify: `providers/pi-dev/test/server.test.mjs`

**Interfaces:**
- Consumes: existing `WaitEngine` source contract: `arm(condition, signal)`, `check(record, signal)`, and persisted `baseline`.
- Produces: wait condition `{ kind: "timer", after_seconds: integer }` or `{ kind: "timer", at: string }`; baseline `{ targetAtMs: number, targetIso: string }`.

- [ ] **Step 1: Write failing local-source timer tests**

Add tests in `providers/pi-dev/test/wait-local.test.mjs` using the existing injectable `now` function:

```js
test('timer after_seconds persists one target and matches only after it is reached', async () => {
  let now = Date.parse('2026-08-17T00:00:00Z');
  const source = new LocalWaitSources({ defaultCwd: process.cwd(), now: () => now });
  const condition = { kind: 'timer', after_seconds: 120 };
  const armed = await source.arm(condition);
  assert.equal(armed.status, 'pending');
  assert.equal(armed.baseline.targetAtMs, Date.parse('2026-08-17T00:02:00Z'));
  assert.equal((await source.check(record(condition, armed.baseline))).status, 'pending');
  now = Date.parse('2026-08-17T00:02:00Z');
  const matched = await source.check(record(condition, armed.baseline));
  assert.equal(matched.status, 'matched');
  assert.match(matched.evidence, /timer=.*reached/);
});

test('timer at is absolute and already-due timers match during arm', async () => {
  const now = Date.parse('2026-08-17T00:02:00Z');
  const source = new LocalWaitSources({ defaultCwd: process.cwd(), now: () => now });
  const condition = { kind: 'timer', at: '2026-08-17T00:01:59Z' };
  const armed = await source.arm(condition);
  assert.equal(armed.status, 'matched');
  assert.equal(armed.baseline.targetAtMs, Date.parse(condition.at));
});
```

Also add rejection tests for zero/negative/non-integer `after_seconds`, invalid `at`, timezone-less `at`, both fields, and neither field.

- [ ] **Step 2: Run timer tests and verify RED**

Run:

```bash
node --test providers/pi-dev/test/wait-local.test.mjs
node --test providers/pi-dev/test/server.test.mjs
```

Expected: new timer tests fail because `timer` is not yet accepted by schema/source.

- [ ] **Step 3: Extend the wait schema**

In `providers/pi-dev/wait-schema.mjs`, add a strict `timer` member to `waitConditionSchema` with optional `after_seconds` and `at`, plus refinement requiring exactly one. `after_seconds` is an integer in `1..86399`. `at` must parse to a finite instant and end in `Z` or a numeric timezone offset (`+HH:MM` / `-HH:MM`).

- [ ] **Step 4: Implement the local timer source**

In `providers/pi-dev/wait-local.mjs`:

```js
const LOCAL_KINDS = new Set([
  'process_exit', 'tcp_listen', 'file_exists', 'file_changed',
  'http_ready', 'systemd_user', 'timer',
]);
```

Add deterministic parsing/validation. On arm, derive `targetAtMs` from `this.now() + after_seconds * 1000` or `Date.parse(at)`, persist `{ targetAtMs, targetIso: new Date(targetAtMs).toISOString() }`, and return `matched` immediately when `this.now() >= targetAtMs`. On check, verify the baseline target matches the condition definition, then return pending or matched based only on `this.now()`.

Register `timer: localSource` in the `WaitEngine` source map in `providers/pi-dev/server.mjs`.

Timer evidence format:

```text
timer=<target ISO instant> reached
```

- [ ] **Step 5: Extend the MCP schema contract test**

Add valid timer examples to `providers/pi-dev/test/server.test.mjs` and assertions that invalid/mutually exclusive timer forms are rejected.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
node --test providers/pi-dev/test/wait-local.test.mjs
node --test providers/pi-dev/test/server.test.mjs
```

Expected: all tests pass.

- [ ] **Step 7: Commit the timer condition**

```bash
git add providers/pi-dev/wait-schema.mjs providers/pi-dev/wait-local.mjs providers/pi-dev/server.mjs providers/pi-dev/test/wait-local.test.mjs providers/pi-dev/test/server.test.mjs
git commit -m "feat: add durable timer waits"
```

---

### Task 2: Make wait semantics practical in the MCP surface

**Files:**
- Modify: `providers/pi-dev/server.mjs`
- Modify: `providers/pi-dev/test/server.test.mjs`
- Modify: `skills/mcp-harness-router/SKILL.md`

**Interfaces:**
- Consumes: timer condition from Task 1 and existing wait semantics.
- Produces: concise model-facing guidance that distinguishes condition/timer lifetime from one RPC hold and treats `pending` as a cooperative scheduling point.

- [ ] **Step 1: Add failing description assertions**

Extend the wait-description assertions in `providers/pi-dev/test/server.test.mjs` to require the description to communicate all of:

```text
timer
pending remains durable / resume by name
do other work before resuming
hold_seconds bounds one invocation
timeout_seconds is the durable safety deadline
```

- [ ] **Step 2: Run the server test and verify RED**

Run:

```bash
node --test providers/pi-dev/test/server.test.mjs
```

Expected: description assertions fail against the current wording.

- [ ] **Step 3: Update the MCP-facing wait description**

Use compact wording equivalent to:

```text
Create, resume, or cancel one durable named condition/timer wait. Arm with name+condition; resume later with name only. A pending result leaves the same wait durable, so other reasoning/tool work may happen before resuming it. timeout_seconds is the durable safety deadline (max 24h); hold_seconds only bounds this invocation (max 15s). Use timer for relative/absolute wakeups and event conditions for Terminal/process/TCP/file/HTTP/systemd readiness; prefer wait over Bash polling/sleep loops.
```

Retain the Terminal-output cursor guarantee.

- [ ] **Step 4: Tighten router guidance without turning it into a workflow manual**

Update `skills/mcp-harness-router/SKILL.md` so routing includes `timer` for elapsed/absolute wakeups, removes the obsolete fake-timeout diagnostic recommendation, and states that long-lived mission behavior belongs to `persistent-agent-loop` when that Skill is installed. Keep mission/checkpoint details out of the router.

- [ ] **Step 5: Run focused tests and Skill validation**

Run:

```bash
node --test providers/pi-dev/test/server.test.mjs
python3 "$HOME/.codex/skills/.system/skill-creator/scripts/quick_validate.py" skills/mcp-harness-router
```

Expected: PASS.

- [ ] **Step 6: Commit model-facing wait guidance**

```bash
git add providers/pi-dev/server.mjs providers/pi-dev/test/server.test.mjs skills/mcp-harness-router/SKILL.md
git commit -m "docs: clarify durable wait scheduling"
```

---

### Task 3: Add the `persistent-agent-loop` ChatGPT Skill

**Files:**
- Create: `skills/persistent-agent-loop/SKILL.md`
- Create: `skills/persistent-agent-loop/references/protocol.md`
- Create: `skills/persistent-agent-loop/agents/openai.yaml`
- Create: `skills/persistent-agent-loop/assets/icon.svg`
- Modify: `skills/README.md`
- Modify: `skills/SNAPSHOT_SHA256.txt`

**Interfaces:**
- Consumes: Dev `wait`, durable Terminal/process model, `timer`, and arbitrary user steering.
- Produces: reusable long-lived mission behavior for ChatGPT/Codex/API/Atlas with progressive same-folder reference loading.

- [ ] **Step 1: Create a validation pressure checklist before writing the Skill**

Use the observed benchmark failures/successes as scenario checks. The finished Skill must cause an agent to choose these behaviors:

```text
"work until verified complete" -> do not end on a heartbeat/subtask/wait timeout
"wait 30 minutes then reassess" -> use timer wait, not Bash sleep or fake file
"user steering arrives" -> process steering, checkpoint if needed, then resume mission unless replaced/stopped
"nothing actionable" -> wait without meaningless mutation
"mission >24h" -> checkpoint and renew <=24h wait leases; do not increase hold_seconds
"hard cutoff" -> recover from durable mission checkpoint; do not claim uninterrupted immortality
```

Independent fresh-context subagents are not available here, so record this as scenario-based self-review rather than claiming independent pressure tests.

- [ ] **Step 2: Write compact `SKILL.md`**

Frontmatter:

```yaml
---
name: persistent-agent-loop
description: Use when a task must remain active across extended waiting, repeated tool work, user steering, process observation, or multi-hour mission execution until explicit or verified completion.
---
```

Keep the body focused on trigger, invariant, quick loop, termination contract, timer/wait choice, and a direct link to `references/protocol.md` for detailed long-duration/checkpoint/recovery rules.

- [ ] **Step 3: Write `references/protocol.md`**

Move the detailed operational material here: mission state, checkpoint fields, heartbeat semantics, steering precedence, timer margin relative to safety deadline, Terminal ownership, 24-hour lease renewal, hard-cutoff recovery, and concise examples. Base it on `docs/superpowers/specs/2026-08-17-persistent-agent-loop-design.md` and benchmark evidence, but write it as reusable instructions rather than historical narrative.

- [ ] **Step 4: Add ChatGPT metadata and icon**

Create `agents/openai.yaml`:

```yaml
interface:
  display_name: Persistent Agent Loop
  short_description: Run long-lived, steerable missions with durable waits and checkpoints.
  icon_small: assets/icon.svg
  icon_large: assets/icon.svg
policy:
  products:
  - chatgpt
  - codex
  - api
  - atlas
  allow_implicit_invocation: true
```

Add a simple repository-owned SVG icon without embedding external assets.

- [ ] **Step 5: Update Skill index/provenance**

Add `persistent-agent-loop` to `skills/README.md`, explain that its same-folder `references/protocol.md` is intentionally loaded progressively, and keep ChatGPT-side installation guidance unchanged: the whole directory must be uploaded/imported together.

- [ ] **Step 6: Validate the new Skill and run scenario self-review**

Run:

```bash
VALIDATOR="$HOME/.codex/skills/.system/skill-creator/scripts/quick_validate.py"
python3 "$VALIDATOR" skills/persistent-agent-loop
```

Then inspect `SKILL.md` against all six pressure scenarios from Step 1 and fix any ambiguous termination/heartbeat language.

- [ ] **Step 7: Refresh the Skill checksum manifest**

Regenerate `skills/SNAPSHOT_SHA256.txt` using the repository's existing deterministic checksum convention, excluding the manifest itself exactly as existing entries do. Verify the regenerated manifest against the current tree.

- [ ] **Step 8: Run full affected verification**

Run:

```bash
npm --prefix providers/pi-dev test
VALIDATOR="$HOME/.codex/skills/.system/skill-creator/scripts/quick_validate.py"
for dir in skills/*/; do [ -f "$dir/SKILL.md" ] || continue; python3 "$VALIDATOR" "$dir"; done
node scripts/check-doc-links.mjs
git diff --check
```

Expected: Pi Dev suite passes, every tracked Skill validates, documentation links pass, and diff check is clean.

- [ ] **Step 9: Commit the Skill bundle and snapshot**

```bash
git add skills/persistent-agent-loop skills/mcp-harness-router skills/README.md skills/SNAPSHOT_SHA256.txt
git commit -m "feat: add persistent agent loop skill"
```

---

### Task 4: Final integration verification

**Files:**
- Verify only; modify only if verification reveals a defect.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: evidence that timer behavior, wait wording, Skill packaging, and repository docs agree.

- [ ] **Step 1: Run the full Pi Dev provider test suite**

```bash
npm --prefix providers/pi-dev test
```

- [ ] **Step 2: Validate every Skill and checksum**

Run the validator loop from Task 3 and independently recompute/check `skills/SNAPSHOT_SHA256.txt`.

- [ ] **Step 3: Verify documentation and repository hygiene**

```bash
node scripts/check-doc-links.mjs
git diff --check
git status --short --branch
```

- [ ] **Step 4: Inspect commit boundaries**

Confirm benchmark evidence remains in `b135d6c`, persistent-loop design remains in `2b2aded`, and implementation changes are in later focused commits.

- [ ] **Step 5: Report actual status without pushing unless explicitly requested**

State test counts/results, new Skill layout, timer semantics, and any remaining ChatGPT-side import/refresh requirement. Do not push merely because implementation is complete.
