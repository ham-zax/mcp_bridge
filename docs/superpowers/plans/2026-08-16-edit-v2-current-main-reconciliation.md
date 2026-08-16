# Edit V2 Current-Main Reconciliation and Implementation Plan

**Goal:** Reconcile the retained Edit V2 design onto current `main`, replace the one-file `edit({path, edits})` contract with one model-agnostic `edit({targets})` exact-mutation primitive, qualify its filesystem/concurrency safety, and measure whether it materially improves exact multi-file work over both repeated Edit V1 calls and current `apply_patch` before considering any Sol-specific profile guidance.

**Architecture:** Keep the existing Pi Dev provider, path-authority boundaries, `withMutationPaths` coordinator, Pi exact-edit planning behavior, native `TextContent` result architecture, and current public profile composition. Edit V2 resolves and semantically deduplicates all targets, holds the complete cooperative target lease set, preflights every target before the first mutation, then performs each final identity/snapshot validation and whole-file replacement through one existing no-follow descriptor. Cross-file atomicity, rollback, CAS against arbitrary processes, and serialization of non-cooperating writers are explicitly not claimed.

**Tech Stack:** Node.js ESM with repository engine floor `>=22.19.0`; qualified local Node 24.x is acceptable but must not become a new requirement; `@earendil-works/pi-coding-agent@0.84.1`; `@modelcontextprotocol/sdk@1.30.0`; `zod@4.4.3`; existing Node test runner; existing Bash harness; optional `uv` + `tiktoken==0.13.0` / `o200k_base` only for offline model-visible payload estimates.

## Review Basis

This plan supersedes direct execution of the historical Edit V2 implementation plan retained on `feat/sol-harness-edit-v2-design-qualification` at `fe3c43b42d4b19617952f83efc33b78c120f43c4`.

The accepted architectural evidence from the retained Edit V2 design remains useful, but execution must start from current verified `main`, whose review baseline is:

```text
main/origin main: 9098c9fcc9088d3ddf31e30f7df2a9b18a86c1b1
historical common base: 6d7e76c2812947cc2f9dab2c0616373efb80c85e
main-only commits after base: 40
Edit-V2 branch-only commits after base: 6
```

If `main` advances before implementation begins, branch from the then-current clean and verified `main`; do not force work back onto literal SHA `9098c9f` merely to preserve chronology. Record the actual implementation base in the A0 evidence artifact.

The review established that current `runEdit()` is still one-file, while `withMutationPaths()` already supplies the required cooperative multi-path coordination substrate. Current default MCP metadata also incorporates a material subset of the earlier Sol ergonomics work, so Sol-specific profile instructions are conditional evaluation work rather than a required implementation deliverable.

## Global Constraints

- The canonical Edit V2 MCP input is only:

  ```json
  {
    "targets": [
      {
        "path": "a.txt",
        "edits": [
          { "oldText": "old", "newText": "new" }
        ]
      }
    ]
  }
  ```

- Historical root `edit({ path, edits })` compatibility is intentionally **not** preserved. Do not add a dual schema, compatibility shim, alias, argument rewriter, feature flag, or second `batch_edit` tool.
- This is an intentional breaking MCP input-schema change wherever `edit` is already exposed: `restricted`, `trusted-dev`, and `personal`. Re-ratify and document that contract explicitly rather than treating it as an internal refactor.
- Tool names and provider composition remain unchanged. Edit V2 strengthens the existing `edit` primitive; it does not add a new MCP tool.
- Routing boundary:

  ```text
  exact known replacement(s), one or more existing files -> edit
  contextual / structural mutation, insertion, add/delete/move, ambiguous anchors -> apply_patch
  new-file creation -> write
  ```

  File count alone must not choose `edit` versus `apply_patch`.
- Exact known substring removal using `newText: ""` remains valid Edit behavior. Contextual/structural deletion remains an `apply_patch` use case.
- Reuse `withMutationPaths`; do not modify `providers/pi-dev/mutation-coordinator.mjs` unless a new focused failing test demonstrates a coordinator defect that Edit V2 cannot correctly work around. If such a defect is proven, stop for focused architecture review before expanding scope.
- Preserve current authority boundaries: workspace-relative authority in public workspace modes; user-path semantics in personal mode. Edit V2 must not expand filesystem authority.
- Every Edit V2 target must be an existing regular valid-UTF-8 text file. Preserve current intended BOM/EOL behavior, exact/unique matching, same-original planning, overlap rejection, and fuzzy-match rejection.
- All requested targets must be fully planned/preflighted before the first mutation.
- Reject duplicate canonical request targets semantically, even though the mutation coordinator independently deduplicates lock keys defensively.
- Hold the complete cooperative lease set through all-target preflight and mutation. This deliberately gives Edit V2 stronger batch consistency against cooperating Dev mutations than per-operation locking.
- Final target validation and mutation must use one existing no-follow file descriptor from identity/snapshot revalidation through write/truncate. Do not validate one pathname instance and then reopen the pathname for writing.
- Do not claim cross-file atomicity, filesystem transactions, rollback, fsync durability, CAS against arbitrary processes, hard-link identity collapsing, or serialization against Bash/Python/editors/other non-cooperating writers.
- Native MCP `TextContent` remains the result architecture. Do not add `structuredContent` solely for Edit V2.
- Partial outcomes after mutation starts must distinguish `APPLIED`, `FAILED`, `UNCERTAIN`, and `UNATTEMPTED` semantics. Before the global mutation barrier, failures/cancellation are ordinary zero-Edit-mutation errors.
- Keep model-facing diagnostics on requested path labels. Do not leak canonical absolute workspace paths merely because internal coordination uses them.
- No arbitrary target/edit/request-size cap in v1. Qualify a moderate larger batch and add a cap only if measured evidence demonstrates a concrete reliability problem.
- Do not add a property-based-testing dependency in v1. The important failure classes are concrete filesystem identity, injected I/O failure, lock ordering, cancellation, and partial-state transitions; cover them with focused deterministic tests.
- Do not modify Code, Terminal, wait runtime semantics, `apply_patch` grammar/backend semantics, bridge lifecycle, or provider composition as part of Edit V2.
- The known Pi full-suite timing-sensitive wait test is baseline noise unless reproduced as a deterministic semantic regression. Do not broaden this lane into wait-engine work. Before final Edit V2 completion, require a fresh full Pi suite pass; if the same timing test flakes, isolate/repeat it and report evidence instead of silently weakening it.
- Do not add permanent ChatGPT/Sol profile instructions during Edit V2 implementation. Evaluate them only after generic Edit V2 and current default metadata have been qualified.
- The previous Sol search/mutation benchmarks are evidence about deterministic routing-policy mechanics, not causal evidence of fresh GPT-5.6 Sol behavior. Preserve that caveat in any new comparison.
- Do not activate/restart the live bridge or refresh ChatGPT during offline implementation/qualification. Live rollout is a separate explicit gate after merge authorization.

## File and Artifact Map

### Production implementation

- `providers/pi-dev/files.mjs` — replace single-target `runEdit` execution with grouped target planning, all-target cooperative locking, same-descriptor final guards, mutation barrier, and partial-state result production.
- `providers/pi-dev/server.mjs` — replace root `path + edits` schema with required `targets[]`; update model-agnostic routing description to exact-known one-or-more-file semantics while preserving profile authority.
- `providers/pi-dev/render.mjs` — render compact multi-target success and deterministic partial/uncertain native text using requested path labels.
- `providers/pi-dev/mutation-coordinator.mjs` — expected **unchanged**; existing multi-path locking is reused.

### Focused tests

- `providers/pi-dev/test/files.test.mjs` — schema-independent file behavior, all-target preflight, UTF-8/regular-file rules, same-original semantics, descriptor guards, injected write/truncate failures, cancellation boundary, and requested-path diagnostics.
- `providers/pi-dev/test/server.test.mjs` — MCP schema break, profile exposure/authority, one/multi-target calls, model-facing descriptions, V1 rejection, and no catalog expansion.
- `providers/pi-dev/test/render.test.mjs` — multi-target success rendering and `EDIT_PARTIAL`/uncertain formatting without generic Pi prose or canonical-path leakage.
- `providers/pi-dev/test/patch.test.mjs` — Edit V2 versus `apply_patch` overlap/alias interaction and no silent lost update.
- `providers/pi-dev/test/mutation-coordinator.test.mjs` — modify only if a new coordinator regression test is genuinely needed; no planned source change.

### Current normative documentation

- `docs/architecture.md` — replace “single-file edit / multi-file patch” ontology with exact-known Edit V2 versus contextual/structural `apply_patch`; preserve six Dev tools and current Code/Terminal catalog facts.
- `docs/personal/harness.md` — update user workflow and examples for `edit(targets[])`, exact-known multi-file mutation, `apply_patch`, and creation routing.
- `docs/security.md` — update only if necessary to clarify that stronger cooperative/same-descriptor Edit guarantees still do not serialize arbitrary external writers or provide cross-file transactions.

### Reconciliation / evidence artifacts

- Create: `experiments/edit-v2/capture-current-mcp.mjs` — capture actual current MCP `initialize`/`tools/list` evidence without modifying provider behavior.
- Create: `experiments/edit-v2/qualification.mjs` — deterministic offline A0a/A0b/A1 capability/cost qualification against disposable fixtures.
- Create: `docs/history/benchmarks/2026-08-16-edit-v2-current-main-a0.json` — immutable normalized current-main baseline evidence captured before model-facing provider edits.
- Create: `docs/history/benchmarks/2026-08-16-edit-v2-current-main-a0.md` — interpretation/provenance of the immutable baseline, including any baseline test instability observed.
- Create: `docs/history/benchmarks/2026-08-16-edit-v2-qualification.json` — final offline Edit V1 / `apply_patch` / Edit V2 measurements.
- Create: `docs/history/benchmarks/2026-08-16-edit-v2-qualification.md` — final capability, safety, cost, and experiment interpretation.

Do not resurrect old benchmark paths under current normative docs. Historical experiment evidence belongs under `docs/history/benchmarks/`.

---

### Task 0: Freeze the immutable current-main A0 baseline before provider changes

**Files:**
- Create: `experiments/edit-v2/capture-current-mcp.mjs`
- Create: `docs/history/benchmarks/2026-08-16-edit-v2-current-main-a0.json`
- Create: `docs/history/benchmarks/2026-08-16-edit-v2-current-main-a0.md`
- Do not modify any provider source or model-facing description in this task.

**Interfaces:**
- Consumes: current clean implementation-base commit; current Dev/Code/Terminal stdio providers; MCP `initialize` and `tools/list` wire responses.
- Produces: immutable A0 evidence used by every later schema/token/cost comparison.

**Steps:**

- [ ] Create an isolated implementation branch/worktree from the then-current clean verified `main`. Record base SHA, branch name, Node version, dependency versions, and clean `git status` in the A0 artifact.
- [ ] Install only ignored provider dependencies from existing lockfiles when needed:

  ```bash
  npm --prefix providers/pi-dev ci --omit=dev
  npm --prefix providers/code-router ci --omit=dev
  npm --prefix providers/terminal ci --omit=dev
  ```

  Do not modify tracked lockfiles.
- [ ] Implement `capture-current-mcp.mjs` as an offline stdio client that launches the current providers exactly as configured for personal mode and records `initialize` plus `tools/list`. Store normalized tool objects as `{name, description, inputSchema}` while also preserving enough raw provenance to reproduce the measurement.
- [ ] Capture at minimum:

  ```text
  Dev:       6 tools
  Code:      3 tools
  Terminal:  7 tools
  current Edit V1 schema
  normalized bytes per tool
  total normalized bytes per provider
  total normalized bytes across personal provider catalogs
  initialize/instruction payload where the provider/runtime exposes one
  ```

- [ ] Estimate `o200k_base` tokens using `tiktoken==0.13.0`. Label the numbers explicitly as offline estimates of harness-contributed model-visible payloads, not billing or complete hidden ChatGPT context accounting.
- [ ] Run current baseline qualification once:

  ```bash
  (cd providers/pi-dev && npm test)
  (cd providers/code-router && npm test)
  (cd providers/terminal && npm test)
  bash tests/harness.sh
  bash scripts/check-personal-toolbox.sh
  git diff --check
  ```

- [ ] If the known timing-sensitive Pi wait test fails under full-suite scheduling load, record the exact failing test, measured elapsed/budget evidence, and full-suite result; rerun that exact test twice in isolation. Do not edit wait runtime/tests inside this lane. A deterministic unrelated failure blocks implementation; an isolated timing flake is recorded as baseline instability and requalified again at the final gate.
- [ ] Write the immutable A0 JSON/Markdown evidence before changing `providers/pi-dev/server.mjs`, Edit schema, Edit description, or other model-facing provider output.
- [ ] Verify the evidence artifacts identify their exact base SHA and contain no secrets/private deployment credentials.

**Acceptance criteria:**

- A reproducible current-main wire baseline exists before Edit V2 modifies model-facing output.
- The artifact accurately records current Dev 6 / Code 3 / Terminal 7 catalogs and Edit V1 schema.
- Old absolute token numbers are not reused as current values.
- Baseline qualification is reported exactly as observed, including any timing-only Pi instability rather than overstated as freshly all-green.

---

### Task 1: Implement the canonical Edit V2 schema and all-target planning path

**Files:**
- Modify: `providers/pi-dev/files.mjs`
- Modify: `providers/pi-dev/server.mjs`
- Modify: `providers/pi-dev/render.mjs`
- Test: `providers/pi-dev/test/files.test.mjs`
- Test: `providers/pi-dev/test/server.test.mjs`
- Test: `providers/pi-dev/test/render.test.mjs`

**Interfaces:**
- Consumes: current `resolveUserPath`, `resolveExistingWorkspacePath`, current exact-validation semantics, Pi edit engine, `withMutationPaths`, native `invoke()`/TextContent error path.
- Produces: `runEdit({ pathMode, defaultCwd, workspaceRoot, targets }, signal, operationOverrides?)`; one canonical MCP `targets[]` schema; validated per-target plans; compact requested-path result data.

**Steps:**

- [ ] Add RED MCP schema tests requiring only root `targets`, with each target requiring `path` and non-empty `edits`, each edit requiring non-empty `oldText` and present `newText`. Assert root `path` and root `edits` are absent.
- [ ] Add a RED MCP call proving historical V1 arguments are rejected by schema validation. This is the intentional breaking-contract proof; do not introduce compatibility behavior to make it pass.
- [ ] Add RED one-target and two-target V2 file tests plus one target containing multiple disjoint edits and one exact substring removal using `newText: ""`.
- [ ] Add RED zero-mutation all-target preflight cases for:

  ```text
  first target mismatch
  last target mismatch
  non-regular target
  invalid UTF-8 bytes
  fuzzy-only Unicode match
  overlapping/repeated replacement ranges
  canonical duplicate request aliases
  ```

  Assert final bytes of every fixture, not just error text.
- [ ] Resolve all requested targets under the active profile's existing authority policy and build internal plan records retaining at least:

  ```text
  requestedPath
  canonicalPath
  identity {dev, ino}
  snapshot bytes
  proposed bytes/content
  result diff/summary data
  ```

- [ ] Require existing regular files and valid UTF-8 round-trip content. Reuse current BOM/EOL/exact-match semantics rather than inventing a second text-normalization policy.
- [ ] Reject duplicate canonical request target records before acquisition. The caller must merge edits for one canonical file into one target item.
- [ ] Acquire the complete canonical set with `withMutationPaths`, then dry-run/plan every target under that full cooperative lease set before the first mutation. Reuse Pi planning where it gives same-original/disjoint replacement behavior and deterministic diff generation; capture-only planning operations must never mutate files.
- [ ] Refactor `renderEditText` only as necessary so successful V2 results can report multiple requested paths compactly. Preserve native text; do not add generic “success” prose.
- [ ] Update `server.mjs` to expose only the final V2 schema. Do not leave an intermediate dual schema in a commit.
- [ ] Run focused verification:

  ```bash
  (cd providers/pi-dev && node --test test/files.test.mjs test/server.test.mjs test/render.test.mjs)
  node --check providers/pi-dev/files.mjs
  node --check providers/pi-dev/server.mjs
  node --check providers/pi-dev/render.mjs
  git diff --check
  ```

**Acceptance criteria:**

- One-target and multi-target calls use the same `targets[]` contract.
- V1 root arguments are invalid by design.
- Every target is resolved under unchanged authority and proven existing/regular/valid UTF-8 before mutation.
- Exact/unique/same-original/disjoint semantics and current intended CRLF/BOM behavior are preserved.
- Canonical duplicate request aliases fail before mutation.
- A failure in any preflight target causes zero Edit V2 mutations.
- No new MCP action is added.

---

### Task 2: Implement same-descriptor mutation guards and the partial-state contract

**Files:**
- Modify: `providers/pi-dev/files.mjs`
- Modify: `providers/pi-dev/render.mjs`
- Test: `providers/pi-dev/test/files.test.mjs`
- Test: `providers/pi-dev/test/render.test.mjs`

**Interfaces:**
- Consumes: Task 1 validated target plans held under the complete `withMutationPaths` lease set.
- Produces: final same-descriptor stale/identity guard, whole-file replacement, mutation barrier, and deterministic post-barrier outcome classification.

**Steps:**

- [ ] Add deterministic injected-operation tests for:

  ```text
  final-component pathname replaced with different inode before guarded open
  same inode/path but bytes changed before guarded reread
  target disappears before guarded open
  longer proposed output
  shorter proposed output requiring truncate
  zero-length proposed output
  first mutating write failure
  truncate failure after successful write
  zero-progress positional write protection
  ```

- [ ] For each target immediately before mutation, open the canonical target existing-only for read/write and use `O_NOFOLLOW` or a proven Node/Linux equivalent for the final component.
- [ ] Through the same opened `FileHandle`:

  1. `stat()`/`fstat` and compare file identity to preflight `dev + ino`;
  2. reread bytes with explicit positions and compare to the exact preflight snapshot;
  3. perform one final synchronous AbortSignal check;
  4. cross the mutation barrier without an intervening asynchronous `await` before initiating the first mutating syscall;
  5. positional-write proposed bytes in a loop until all bytes are reported written; reject zero progress rather than spinning;
  6. truncate to exactly the proposed length;
  7. close the handle in `finally`.

- [ ] For zero-length proposed content, `truncate(0)` is that target's first mutating syscall.
- [ ] Once mutation of one target starts, do not interrupt that target's write/truncate sequence merely because cancellation arrived; allow it to settle and classify its resulting state before honoring cancellation for later targets.
- [ ] Implement the post-barrier state categories exactly:

  ```text
  APPLIED       complete intended write/truncate sequence succeeded
  FAILED        no mutating syscall issued for this target
  UNCERTAIN     mutation may have affected target and intended final state is not proven
  UNATTEMPTED   mutation processing never began for target
  ```

- [ ] Before the global mutation barrier, return ordinary zero-mutation errors/cancellation; do not label such failures `EDIT_PARTIAL`.
- [ ] After mutation starts, render deterministic native text such as:

  ```text
  EDIT_PARTIAL
  applied: a.txt
  failed: b.txt: file changed since preflight; reread and reconcile
  unattempted: c.txt
  ```

  and:

  ```text
  EDIT_PARTIAL
  applied: a.txt
  uncertain: b.txt: write state unknown; reread target before retrying
  unattempted: c.txt
  ```

- [ ] Ensure all diagnostics use `requestedPath`, never internal canonical paths.
- [ ] Run focused verification:

  ```bash
  (cd providers/pi-dev && node --test test/files.test.mjs test/render.test.mjs)
  node --check providers/pi-dev/files.mjs
  node --check providers/pi-dev/render.mjs
  git diff --check
  ```

**Acceptance criteria:**

- The descriptor used for final identity/snapshot validation is the descriptor used for mutation; no pathname reopen occurs between guard and write.
- Stale identity or stale bytes observed before the barrier cause zero mutation for that target.
- Short, long, and empty outputs cannot leave stale tail bytes.
- Write/truncate ambiguity after mutation begins is reported `UNCERTAIN`, not falsely `FAILED`.
- Cancellation never falsely reports a successfully completed final target as failed.

---

### Task 3: Qualify multi-path concurrency, cancellation, and `apply_patch` interaction

**Files:**
- Modify only as proven necessary: `providers/pi-dev/files.mjs`
- Modify only as proven necessary: `providers/pi-dev/render.mjs`
- Test: `providers/pi-dev/test/files.test.mjs`
- Test: `providers/pi-dev/test/patch.test.mjs`
- Test only if needed: `providers/pi-dev/test/mutation-coordinator.test.mjs`
- Expected unchanged source: `providers/pi-dev/mutation-coordinator.mjs`

**Interfaces:**
- Consumes: final Task 2 `runEdit(targets[])`, existing `withMutationPaths`, current `apply_patch` coordination path.
- Produces: demonstrated cooperative locking/cancellation safety across overlapping exact-edit and patch workflows.

**Steps:**

- [ ] Add deterministic integration cases for:

  ```text
  same target set requested in opposite order
  overlapping sets {a,b} versus {b,c}
  fully disjoint multi-target sets
  already-aborted acquisition
  abort while queued
  abort after one lock acquired while waiting for another
  abort during all-target preflight
  abort during final guard before global barrier
  abort immediately after first target applies and before second begins
  abort during only/final target mutation where target ultimately succeeds
  ```

- [ ] Use explicit test timeouts for deadlock/livelock evidence; do not use arbitrary sleeps when a synchronization seam can make the test deterministic.
- [ ] Add Edit V2 versus `apply_patch` overlap cases on the same canonical target and on a symlink/canonical alias when active path policy supports it. Require either preservation of both non-conflicting effects or an explicit conflict/partial outcome; silent lost update is forbidden.
- [ ] Keep the complete Edit V2 lease set across planning/mutation as designed. Measure its behavior in the later 32-target qualification rather than weakening it to mimic `apply_patch`'s per-operation lock residency.
- [ ] Do not modify `mutation-coordinator.mjs` merely because V2 now exercises multiple paths. If a focused test demonstrates a coordinator defect, stop and obtain a focused plan review before changing coordinator source.
- [ ] Run:

  ```bash
  (cd providers/pi-dev && node --test test/files.test.mjs test/patch.test.mjs test/mutation-coordinator.test.mjs test/server.test.mjs test/render.test.mjs)
  (cd providers/pi-dev && npm test)
  git diff --check
  ```

**Acceptance criteria:**

- Opposite-order/shared-subset requests do not deadlock or livelock.
- Disjoint target sets retain concurrency.
- Abort before global mutation barrier produces zero Edit V2 mutations.
- A target whose mutation started is allowed to settle before cancellation affects subsequent targets.
- Edit V2 and `apply_patch` never silently overwrite an overlapping cooperating mutation.
- `mutation-coordinator.mjs` remains unchanged absent separately proven contrary evidence.

---

### Task 4: Re-ratify the breaking MCP contract and update current model-facing metadata/docs

**Files:**
- Modify: `providers/pi-dev/server.mjs`
- Test: `providers/pi-dev/test/server.test.mjs`
- Modify: `docs/architecture.md`
- Modify: `docs/personal/harness.md`
- Modify only if required by guarantee wording: `docs/security.md`

**Interfaces:**
- Consumes: completed V2 schema/behavior from Tasks 1-3 and current `9098c9f`-style routing metadata.
- Produces: one universal model-agnostic Edit V2 contract and current documentation aligned with the breaking schema.

**Steps:**

- [ ] Assert current profile tool exposure remains unchanged in count/name:

  ```text
  restricted:  read edit write (+ upstream restricted shell separately)
  trusted-dev: read edit write bash
  personal:    read edit write wait apply_patch bash
  ```

  Only the `edit` input schema changes.
- [ ] Add catalog tests proving all profiles that expose `edit` now expose required `targets[]` and no root `path/edits` compatibility shape.
- [ ] Preserve path authority in nested target path descriptions: workspace-relative in workspace modes, stable default-cwd + absolute-path semantics in personal user mode.
- [ ] Update Edit description to communicate:

  > guarded exact, disjoint replacements across one or more existing text files; use when the old text is known exactly

  and direct contextual/structural/add/delete/move work to `apply_patch` without using file count as the main boundary.
- [ ] Keep the current useful `apply_patch` description and update only if necessary to remove a now-stale “multi-file means patch” implication.
- [ ] Keep universal descriptions model-agnostic: no `GPT`, `ChatGPT`, `Sol`, or profile-specific prompting policy in Edit/patch descriptions.
- [ ] Update `docs/architecture.md` from:

  ```text
  edit = exact single-file
  apply_patch = multi-file/structural
  ```

  to:

  ```text
  edit = exact-known one-or-more existing files
  apply_patch = contextual/structural/add/delete/move/ambiguous
  write = creation
  ```

- [ ] Update `docs/personal/harness.md` examples and mutation loop to the same ontology, including one-file calls as `targets.length === 1`.
- [ ] If `docs/security.md` discusses Edit guarantees, state the narrow guarantee accurately: cooperative multi-path serialization + same-descriptor stale detection, not cross-file transaction/CAS against external writers.
- [ ] Run:

  ```bash
  (cd providers/pi-dev && node --test test/server.test.mjs test/render.test.mjs)
  node scripts/check-doc-links.mjs
  git diff --check
  ```

**Acceptance criteria:**

- The intentional public schema break is explicit and tested across all affected profiles.
- No compatibility shim or second tool exists.
- Tool selection is based on exact-known versus contextual/structural intent, not file count.
- Current docs no longer call Edit single-file-only.
- Current default metadata remains the primary generic routing layer.

---

### Task 5: Run the unbiased three-way Edit capability/cost qualification

**Files:**
- Create: `experiments/edit-v2/qualification.mjs`
- Create: `docs/history/benchmarks/2026-08-16-edit-v2-qualification.json`
- Create: `docs/history/benchmarks/2026-08-16-edit-v2-qualification.md`

**Interfaces:**
- Consumes: frozen Task 0 A0 baseline; one disposable A0 control checkout/server at the immutable implementation base for both Edit V1 and `apply_patch`; final Edit V2 provider for A1.
- Produces: comparative evidence that Edit V2 is or is not worthwhile as an exact-known multi-file primitive.

**Steps:**

- [ ] Build disposable fixture-driven workloads where the requested change is exact-known replacement rather than contextual patching. Include at minimum:

  ```text
  1 target, 1 exact replacement
  1 target, multiple disjoint exact replacements
  2 targets
  6 targets
  32 targets
  exact substring removal
  CRLF/BOM cases
  stale/conflict case
  cancellation case
  ```

- [ ] Compare three incumbents under the same logical task inputs:

  ```text
  A0a: repeated Edit V1 calls using the immutable A0 control provider
  A0b: one apply_patch call using that same immutable A0 control provider
  A1:  one Edit V2 call using the final provider
  ```

  Do not present “six V1 calls versus one V2 call” as sufficient evidence; `apply_patch` is already a one-call multi-file incumbent and must be included.
- [ ] Keep capability semantics aligned. For A0b, generate the smallest correct exact-context patch that implements the requested outcome; do not intentionally handicap `apply_patch` with gratuitous context or prose.
- [ ] Measure at minimum:

  ```text
  correctness / final bytes
  first-attempt success
  tool calls
  request UTF-8 bytes and o200k_base token estimate
  result UTF-8 bytes and o200k_base token estimate
  total model-visible request/result estimate
  wall time
  rereads/recovery
  conflict/partial behavior
  lock-hold duration for 32-target Edit V2 when measurable without invasive instrumentation
  process RSS delta for the 32-target run when cheaply observable
  ```

- [ ] Treat the old `CURRENT/MODERN_BASH/NATIVE/HYBRID` and `CURRENT/EXPLICIT/PATCH_FIRST` numbers as historical policy-mechanics evidence only. Do not combine them into the new results as if they were measured on current catalog/implementation.
- [ ] Define the Edit V2 adoption question explicitly: compared with both repeated V1 and one-call `apply_patch`, does V2 provide materially clearer semantic fit and/or lower translation/request/result cost while preserving or strengthening exact-edit safety?
- [ ] Keep the 32-target run diagnostic, not a pass/fail target-count threshold. Add no production cap unless the measurement shows a concrete reliability problem.
- [ ] Re-capture final Edit V2 `tools/list` and compare its normalized schema/tool/catalog bytes/tokens with immutable A0. Attribute delta to actual changed tool metadata/schema rather than old historical totals.

**Acceptance criteria:**

- The experiment is three-way A0a/A0b/A1 and therefore not structurally biased toward Edit V2 by call count.
- `apply_patch` receives a fair minimal representation of exact-known work.
- Schema/catalog delta is measured against the immutable current-main A0 artifact.
- Results distinguish capability/ergonomics evidence from causal model-routing evidence.

---

### Task 6: Full repository qualification and offline release gate

**Files:**
- No new production files expected.
- Update qualification Markdown/JSON only with final observed results.

**Interfaces:**
- Consumes: final Edit V2 code, tests, docs, and offline evidence.
- Produces: merge-ready offline implementation evidence; no live activation yet.

**Steps:**

- [ ] Run the repository's full code/runtime gate from the final implementation tree:

  ```bash
  bash tests/harness.sh
  bash tests/publication.sh
  bash tests/lifecycle.sh
  (cd providers/pi-dev && npm test)
  (cd providers/terminal && npm test)
  (cd providers/code-router && npm test)
  bash scripts/check-personal-toolbox.sh
  node scripts/check-doc-links.mjs
  bash -n bin/* lib/bridge/*.sh scripts/*.sh tests/*.sh
  node --check scripts/*.mjs providers/pi-dev/*.mjs providers/terminal/*.mjs providers/code-router/*.mjs experiments/edit-v2/*.mjs
  git diff --check
  ```

- [ ] Require the complete Pi provider suite to pass before claiming Edit V2 implementation green. If the known unrelated timing-sensitive wait test flakes, rerun that exact test twice in isolation and then rerun the full Pi suite. Do not merge with a final red full Pi suite; investigate if the failure becomes reproducible.
- [ ] Verify no unintended changes to:

  ```text
  Terminal tool schemas/runtime
  Code tool schemas/runtime
  wait runtime semantics
  apply_patch grammar
  trust-profile provider composition
  bridge lifecycle
  mutation-coordinator source (unless separately reviewed)
  ```

- [ ] Verify `git diff`/history contain no secret deployment state and no stale absolute paths in public-profile diagnostics.
- [ ] Perform a bounded engineering review of the final diff against this plan before integration.

**Acceptance criteria:**

- All affected and repository-level gates are green on the final tree.
- Edit V2's breaking schema and safety contract are proven by tests.
- A0/A1 catalog cost evidence and A0a/A0b/A1 capability evidence are complete.
- The implementation remains model-agnostic and does not yet add Sol profile instructions.

---

### Task 7: Fresh Sol routing evaluation — current metadata first, profile guidance only if needed

**Files:**
- No production/profile-instruction change in B0.
- If and only if B0 demonstrates a material routing gap and B1 measurably fixes it, a separate reviewed follow-up plan may create a compact personal instruction template. Do not pre-create that file in this plan.
- Record evaluation evidence under `docs/history/benchmarks/` using a new dated result artifact so model-eval evidence remains historical rather than normative documentation.

**Interfaces:**
- Consumes: merged/qualified Edit V2 build and current generic tool descriptions.
- Produces: evidence for `PROFILE_LEVEL_SOL_GUIDANCE = DO_NOT_ADD` or a separately justified follow-up proposal.

**Steps:**

- [ ] Run B0 with fresh GPT-5.6 Sol sessions using the final generic Edit V2 build and no custom profile instructions.
- [ ] Control the evaluation variables:

  ```text
  same repository/task fixture state
  same tool catalog/build
  same CodeDB indexed/unindexed state per paired task
  fresh model/session context for each independent run
  same task wording between B0 and any B1 pair
  no prior conversation hints that reveal desired tool choice
  ```

- [ ] Use holdout tasks that test unresolved routing boundaries, including:

  ```text
  exact known one-file replacement -> edit
  exact known six-file replacement -> edit
  contextual insertion/refactor -> apply_patch
  add/delete/move -> apply_patch
  creation -> write
  small literal search -> compact rg via Bash
  broad/noisy search -> rg -l + focused read when useful
  known symbol -> code_symbol when CodeDB use is justified
  large unfamiliar repo with unknown CodeDB state -> Bash/rg/read first
  readiness condition -> wait rather than polling
  durable interactive process -> Terminal rather than Bash
  ```

- [ ] Measure first primitive selected, first-attempt correctness, final correctness, avoidable failed calls, rereads/recovery, connector calls, visible result volume, and any bootstrap guidance payload.
- [ ] If B0 is acceptable, stop:

  ```text
  PROFILE_LEVEL_SOL_GUIDANCE = DO_NOT_ADD
  ```

- [ ] Only if B0 shows material repeatable routing errors, construct the smallest candidate B1 guidance text in an **evaluation-only** fixture first. Change no other variable between paired B0/B1 runs.
- [ ] Adopt a permanent personal profile instruction layer only through a separate reviewed implementation plan if B1 produces measurable improvement large enough to justify duplicated bootstrap policy/context.

**Acceptance criteria:**

- B0 evaluates actual fresh-model behavior rather than deterministic policy mechanics.
- Profile guidance is not added merely because it existed in the historical Edit V2 plan.
- B1, if attempted, changes only the candidate guidance layer and keeps repository/tool/CodeDB/session conditions controlled.

---

## Explicit Deferrals

The following are out of scope unless later evidence creates a separate mission:

- `batch_edit` or any new MCP action.
- Compatibility support for Edit V1 root arguments.
- Persistent approval/configuration state for Edit.
- A new lock manager or mutation coordinator redesign.
- Cross-file rollback/transaction layer.
- Hard-link/inode-global coordination guarantees.
- Arbitrary external-writer CAS.
- Property-based testing dependency.
- Sol/ChatGPT profile instructions without B0/B1 evidence.
- New MCP search/file/JSON tools; existing Bash + CLI toolbox + Code facade remain sufficient.
- Persistent Python/eval workspace. Revisit only after Edit V2/current-metadata qualification so it is compared against the stronger harness baseline.

## Integration and Live Rollout Gate

Implementation/qualification remains offline until separately authorized to merge/deploy.

When integration is authorized:

1. merge the reviewed Edit V2 branch onto then-current `main`;
2. rerun the full repository gate on the merged tree;
3. push only after merged verification is green;
4. restart/reconcile the 1MCP/provider process so the changed `edit` schema is actually advertised;
5. do **not** restart tmux/Terminal broker merely for the Dev schema change;
6. verify live `tools/list` shows only `edit.targets[]` and the unchanged expected action catalog;
7. refresh/reconnect ChatGPT or other MCP clients because the Edit input schema is intentionally breaking and clients may cache tool metadata;
8. perform a small live acceptance: one-target exact Edit V2, multi-target exact Edit V2, and one contextual mutation correctly routed to `apply_patch`.

Do not claim rollout complete solely because Git is pushed; the live provider catalog and refreshed client must observe the V2 schema.

## Final Decision Record

This plan carries forward the reviewed decisions as follows:

```text
EDIT_V2_ARCHITECTURE                 RETAIN + RECONCILE
IMPLEMENTATION_BASE                  CURRENT VERIFIED MAIN
EDIT_V1_COMPATIBILITY                NONE
EDIT_SCHEMA                          edit(targets[])
EDIT_VS_PATCH_BOUNDARY               EXACT-KNOWN VS CONTEXTUAL/STRUCTURAL
NEW_MCP_TOOLS                        NONE
MUTATION_COORDINATOR                 REUSE; NO PLANNED SOURCE CHANGE
ALL-TARGET COOPERATIVE LEASE         RETAIN
CURRENT_WIRE_BASELINE                CAPTURE BEFORE PROVIDER EDITS
CAPABILITY_EXPERIMENT                A0a V1 + A0b APPLY_PATCH + A1 EDIT_V2
CURRENT_METADATA_ERGONOMICS          MATERIAL PARTIAL ADOPTION
SOL_PROFILE_GUIDANCE                 DEFER AND TEST
PROPERTY_BASED_TESTING               DO NOT ADD IN V1
PERSISTENT_EVAL                      AFTER EDIT_V2
LIVE CHATGPT REFRESH                 ONLY AT AUTHORIZED ROLLOUT
```
