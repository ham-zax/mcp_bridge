# MCP Tool Context Metadata Implementation Plan

**Goal:** Make the MCP tool catalog itself give a fresh model enough context to choose the right tool and understand hidden operational cost, persistence, ownership, and destructive effects without adding new runtime guardrails.

**Architecture:** Keep all existing provider behavior, public tool names, schemas, process lifecycles, CodeDB routing, Terminal ownership mechanics, and profile composition unchanged. Improve only the model-facing tool descriptions and repository documentation, with existing provider suites protecting the unchanged contracts and a fresh-model routing evaluation checking whether the new descriptions actually improve tool choice.

**Tech Stack:** Node.js >=22.19.0, `@modelcontextprotocol/sdk` 1.30.0, Zod 4.4.3, CodeDB 0.2.5840, tmux, 1MCP, existing Bash/Node test harnesses.

## Global Constraints

- This is a **description/documentation-only behavior change**. Do not add CodeDB preflight logic, repository-size thresholds, approval state, subprocess probes, new error codes, new provider configuration, or model-facing bypass flags.
- Keep the current personal MCP catalog stable: Dev 6 tools, Code 3 tools, Terminal 7 tools. Do not add or remove model-facing tools.
- Keep all public input schemas stable.
- Do not change CodeDB child creation, indexing, persistence, freshness, or `RepoChildPool.maxActive=4` behavior.
- Explicitly accept the residual risk that a model can still invoke a Code tool on a large fresh repository and cause CodeDB to build or update a heavyweight persistent index. The purpose of this change is to make that cost visible enough for the model to avoid accidental use.
- Treat unrestricted personal Bash as the WSL user's execution authority. Descriptions should steer the model away from using Bash/raw tmux/`wsl-term` as alternate routes around Terminal ownership conventions, but this is routing guidance rather than a security boundary.
- Keep Terminal broker/tmux/CLI behavior unchanged, including PTY lifetime, transcript cursor semantics, generations, leases, collaborative ownership, and `Ctrl-b T` behavior.
- Do not add MCP tool annotations in this mission. The goal is to first measure the effect of explicit descriptions without introducing a second metadata mechanism whose client weighting is uncertain.
- Do not add server-level MCP `instructions` in this mission. Evaluate them separately only if description-only routing remains insufficient.
- Keep terminal-emulator-neutral wording. Human Terminal workflows use any suitable interactive TTY; Kitty is only an optional frontend example.
- Preserve compatibility with the provider packages' existing Node engine floor, `>=22.19.0`; do not rely on Node 24-only APIs for metadata work or tests.
- The pinned restricted-profile `mcp-shell-server==1.1.8` catalog is upstream-owned. Audit it as part of “all MCP tools,” but do not wrap/fork it while its live description remains sufficiently contextual.

## Accepted Residual Risk

This plan intentionally does **not** prevent heavyweight CodeDB indexing. A model-facing Code call still follows the existing path:

```text
code_search / code_context / code_symbol
        -> canonical Git root
        -> RepoChildPool
        -> live/pending child reuse, or CodeDbChild.start()
        -> CodeDB may create/update persistent index state
```

The description contract must therefore make the following decision visible **before** the model calls Code:

```text
Known/prepared/ordinary repository
    -> Code is appropriate when repository intelligence is useful.

Large or unfamiliar repository with unknown CodeDB state
    -> prefer Dev bash/rg/read for initial inspection;
    -> do not invoke Code automatically merely for first-touch orientation.
```

If post-rollout evidence shows models still trigger accidental heavyweight indexing despite these warnings, a future plan may add a hard guard at the already-identified new-child seam. That enforcement is explicitly out of scope here.

---

## File Structure

### Modify

- `providers/code-router/server.mjs` — improve Code selection, persistence, and resource-cost descriptions plus `cwd` guidance.
- `providers/code-router/test/server.test.mjs` — assert routing-critical description facts while preserving the three-tool catalog and schemas.
- `providers/pi-dev/server.mjs` — improve Dev descriptions for file operations, durable waits, and bounded Bash vs Terminal use.
- `providers/pi-dev/test/server.test.mjs` — assert routing-critical description facts without snapshotting whole prose.
- `providers/terminal/mcp-server.mjs` — improve Terminal descriptions for durability, cursor mutation, literal send semantics, ownership, and destructive close.
- `providers/terminal/test/mcp-server.test.mjs` — assert routing-critical description facts while preserving the seven-tool catalog and schemas.
- `docs/architecture.md` — correct the Terminal catalog to seven actions and describe the three-domain routing model.
- `docs/configuration.md` — correct the personal catalog and document that Code descriptions disclose potentially heavyweight first-use indexing without enforcing a threshold.
- `docs/personal/harness.md` — correct 15/16-tool drift and align operator/model routing guidance.
- `docs/security.md` — clarify that description guidance is not a privilege/resource enforcement boundary in the unrestricted personal profile.

### Inspect only

- `providers/legacy-shell/server.py` — policy wrapper for the restricted upstream shell provider.
- pinned `mcp-shell-server==1.1.8` live `tools/list` output — verify the upstream description remains sufficiently contextual.

### No planned change

- `providers/code-router/pool.mjs`
- `providers/code-router/codedb-child.mjs`
- `config/profiles/personal.env`
- `config/templates/mcp-personal.json`
- `scripts/render-config.mjs`
- `scripts/smoke-local.sh`
- Terminal broker/tmux/CLI implementation files
- any CodeDB index/approval/configuration mechanism

---

## Execution Chunk A: Model-facing tool descriptions

Implement and review Tasks 1-4 together. This chunk changes only provider metadata/tests and can be verified independently before documentation/rollout work.

### Task 1: Rewrite Code descriptions around selection and hidden operational cost

**Files:**
- Modify: `providers/code-router/server.mjs`
- Modify: `providers/code-router/test/server.test.mjs`

**Interfaces:**
- Consumes: existing Code facade routes to rooted CodeDB children.
- Produces: the same three Code tools and schemas with descriptions that expose first-use persistence/resource implications before selection.

**Steps:**

- [ ] Replace the shared `cwd` argument description with wording equivalent to:

  > Path inside the intended Git repository. Pass it explicitly for multi-repository work; omission uses the configured Code default cwd and may fail when that path is not inside a Git repository.

- [ ] Rewrite `code_search` so a fresh model can infer all of:
  - use for ranked repository-rooted exploratory search when the exact symbol is unknown;
  - prefer `code_symbol` when a symbol/definition name is already known or can be guessed;
  - first use for a repository may start a persistent rooted CodeDB child and create or update substantial on-disk index state;
  - on large or unfamiliar repositories whose CodeDB readiness/cost is unknown, prefer Dev `bash` with tools such as `rg` plus focused `read` before invoking Code automatically;
  - CodeDB indexing on large repositories can consume significant disk and RAM, so Code is not a cost-free read abstraction.

- [ ] Rewrite `code_context` so a fresh model can infer all of:
  - use for compact first-touch task orientation when definitions, focused bodies, graph neighbors, ranked files, and snippets are worth the indexing-backed repository context;
  - “first touch” does **not** mean “always call this first” on an unknown large repository;
  - the same persistent CodeDB child/index cost applies;
  - for a large/unfamiliar repository with unknown CodeDB state, start with Dev `bash`/`rg`/`read` unless the user specifically wants CodeDB-backed repository intelligence.

- [ ] Rewrite `code_symbol` so a fresh model can infer all of:
  - use when the symbol/definition name is known or can be guessed;
  - it is preferable to broad search for a known symbol;
  - it is not inherently cheap on first use because it shares the same rooted CodeDB child/index lifecycle;
  - large/unfamiliar repository warnings apply equally to symbol lookup.

- [ ] Keep descriptions honest about behavior: do **not** claim that large fresh repositories are blocked, require approval, or are resource-capped. They are not.

- [ ] Do not add model-facing CodeDB preparation commands such as `codedb <repo> index` to the tool descriptions. The objective is to avoid accidental heavy use, not teach the model an alternate raw CLI path.

- [ ] Extend existing catalog tests with load-bearing phrase/meaning assertions only. Do not freeze entire paragraphs. Protect at least:
  - persistence/index-cost disclosure on all three tools;
  - large/unfamiliar-repository caution on all three tools;
  - `code_symbol` vs `code_search` distinction;
  - explicit-repository `cwd` guidance;
  - unchanged names and schemas.

**Focused verification:**

```bash
(cd providers/code-router && node --test test/server.test.mjs)
```

**Acceptance criteria:**

- Public Code catalog remains exactly `code_search`, `code_context`, `code_symbol` with unchanged arguments.
- Descriptions do not imply Code is lightweight/read-only merely because it returns repository information.
- Descriptions do not falsely claim any hard preflight or threshold exists.
- A fresh model has an explicit lower-cost alternative for large/unfamiliar repositories: Dev Bash/`rg` plus focused `read`.

---

### Task 2: Rewrite Dev descriptions around bounded execution and purpose-built alternatives

**Files:**
- Modify: `providers/pi-dev/server.mjs`
- Modify: `providers/pi-dev/test/server.test.mjs`

**Interfaces:**
- Produces: better routing among `read`, `edit`, `write`, `wait`, `apply_patch`, and `bash` without changing schemas or runtime behavior.

**Steps:**

- [ ] `read` description:
  - identify it as focused UTF-8/text inspection;
  - prefer it over Bash `cat`/`sed` for ordinary bounded file reads;
  - document that `offset` is a 1-based line number and `limit` is a line count;
  - state that large text is bounded/truncated and provides continuation guidance;
  - state that this Dev wrapper supports text only even though the underlying Pi library can represent images.

- [ ] `edit` description:
  - one existing text file only;
  - each `oldText` replacement is exact and must be uniquely matchable;
  - guarded/concurrent file change fails rather than blindly overwriting;
  - prefer `apply_patch` for multi-file/add/delete/move/structural work.

- [ ] `write` description:
  - create-only;
  - fails when the target exists;
  - parent directory must already exist;
  - use `edit`/`apply_patch` for existing files.

- [ ] `wait` description:
  - create, resume, or cancel a durable named wait;
  - prefer it over Bash polling/sleep loops;
  - name supported condition families: Terminal output/exit, process exit, TCP listen, file exists/change, HTTP readiness, and user-systemd state;
  - a call with `condition` creates/arms; a later name-only call resumes; `cancel=true` cancels;
  - `hold_seconds` bounds one invocation, not the durable wait deadline;
  - Terminal-output waits match only output produced after arming and do not consume the Terminal model cursor.

- [ ] `apply_patch` description:
  - prefer for coordinated multi-file/structural text mutations including add/delete/move;
  - exact context must uniquely identify the intended edit;
  - all targets are preflighted before mutation, while later runtime failure can still report partial application.

- [ ] Personal/user-mode `bash` description:
  - bounded, noninteractive native Bash as the WSL user;
  - prefer for short commands, Git, builds, tests, repository inspection, `rg`, and ordinary execution;
  - use Terminal for processes that must persist or need a PTY/interactive workflow;
  - default timeout is 30 seconds, maximum is 300 seconds;
  - large output may be truncated with a full-output path;
  - for large/unfamiliar repositories, Bash/`rg`/`read` is the lower-cost discovery path before potentially heavyweight CodeDB-backed Code tools;
  - do not use raw tmux/`wsl-term` through Bash to circumvent human Terminal ownership.

- [ ] Keep workspace-mode/public Bash wording correct for profiles that do not expose Terminal or Code. Do not mention unavailable providers there.

- [ ] Extend existing Dev catalog tests with semantic phrase assertions for the routing-critical clauses only. Do not snapshot full prose.

**Focused verification:**

```bash
(cd providers/pi-dev && node --test test/server.test.mjs)
```

**Acceptance criteria:**

- Restricted profile still omits Dev Bash.
- Trusted-dev and personal retain their current tool names/schemas.
- A fresh model can distinguish `edit` vs `apply_patch`, `wait` vs Bash polling, and bounded Bash vs durable Terminal work.
- Personal Bash is clearly presented as the low-cost fallback for large/unfamiliar repository discovery before CodeDB-backed Code tools.

---

### Task 3: Rewrite Terminal descriptions around durability, cursor state, literal input, ownership, and destruction

**Files:**
- Modify: `providers/terminal/mcp-server.mjs`
- Modify: `providers/terminal/test/mcp-server.test.mjs`

**Interfaces:**
- Consumes: existing seven-tool Terminal behavior.
- Produces: the same Terminal API with descriptions that expose the real PTY/process and ownership semantics.

**Steps:**

- [ ] Rewrite `terminal_open` to state:
  - creates one model-owned **durable tmux PTY/process** in the private harness namespace;
  - appropriate for interactive or persistent work that should survive MCP/broker restart;
  - Dev Bash is preferable for bounded noninteractive commands;
  - omitting `command` starts the normal interactive shell;
  - human-first collaborative creation is an operator-side interactive-TTY workflow, not something the model should emulate through Bash.

- [ ] Rewrite `terminal_read` to accurately describe persisted cursor semantics:
  - normally omit `cursor` to consume from the broker-owned persisted model unread position;
  - successful normal reads advance that persisted position;
  - an explicit `cursor` intentionally replays/repositions from that offset and advances the persisted model position to the returned point;
  - `snapshot=true` captures the current tmux screen/TUI without advancing transcript position;
  - use explicit cursors only for intentional replay/recovery.

- [ ] Rewrite `terminal_send` to state:
  - exactly one of `text` or `key` is allowed;
  - `text` is literal and **does not append Enter**;
  - normal shell execution therefore usually sends command text and then `key=ENTER`;
  - writable human ownership blocks model mutation with `HUMAN_HAS_CONTROL`;
  - the model must not use Dev Bash/raw tmux/operator `wsl-term` commands to bypass ownership.
  - Remove the long operator tutorial for `watch`/`attach`/`give`/`take`; keep those workflows in operator docs.

- [ ] Rewrite `terminal_resize` to state that it changes PTY dimensions and may cause terminal applications to observe resize/SIGWINCH behavior; model resize is allowed only while the model owns the session.

- [ ] Keep `terminal_list` concise and recommend it for resolving session identity, dimensions, exit state, and human-ownership status before mutation. Do not characterize it with a new read-only annotation; reconciliation may update ownership metadata internally.

- [ ] Rewrite `terminal_yield` to state:
  - transfers a model-owned collaborative session only to an **already attached designated human client**;
  - does not create or attach a human client;
  - after success, model send/resize/ordinary close is blocked until the human gives control back.

- [ ] Rewrite `terminal_close` with explicit destructive language:
  - kills the private tmux session and therefore destroys the PTY/process lifetime represented by that session;
  - ordinary close is blocked while a human owns the session;
  - `force=true` explicitly overrides human ownership and destroys the session anyway.

- [ ] Update existing metadata assertions for the no-implicit-Enter rule, cursor-position mutation, durable-vs-Bash distinction, designated-human requirement, and destructive close. Preserve the exact seven-tool catalog and schemas.

**Focused verification:**

```bash
(cd providers/terminal && node --test test/mcp-server.test.mjs)
```

**Acceptance criteria:**

- No Terminal implementation/protocol behavior changes.
- A fresh model can choose Bash vs Terminal correctly.
- A fresh model does not assume `terminal_send(text=...)` presses Enter.
- A fresh model understands that explicit replay cursors alter its persisted unread position while snapshots do not.
- `terminal_close` cannot reasonably be interpreted as a detach-only operation.

---

### Task 4: Re-audit the upstream restricted shell catalog without wrapping it

**Files:**
- Inspect only: `providers/legacy-shell/server.py`
- Inspect only: live pinned `mcp-shell-server==1.1.8` `tools/list` result.

**Interfaces:**
- Produces: evidence that “all MCP tools” includes the upstream-owned restricted shell surface.

**Steps:**

- [ ] Re-list the pinned provider's live catalog. Expected current tool:

  ```text
  shell_execute
  ```

- [ ] Confirm its current description still exposes:
  - allowed command set;
  - allowed patterns;
  - default timeout 30 seconds;
  - maximum timeout 300 seconds;
  - output cap 1,048,576 bytes.

- [ ] Confirm the schema still models `command` as an argument array with optional stdin/directory/timeout.

- [ ] Leave the wrapper unchanged while those properties remain true. If the pinned upstream metadata regresses, treat a local metadata facade as a separate public-profile contract decision rather than expanding this implementation.

**Acceptance criteria:**

- Completion evidence explicitly covers the restricted upstream shell surface in addition to the 16 personal tools.
- No unnecessary wrapper/fork is introduced.

---

## Execution Chunk B: Documentation, catalog verification, and rollout

Implement Tasks 5-7 after Chunk A has passed its focused provider tests and description review.

### Task 5: Correct normative documentation and routing language

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/configuration.md`
- Modify: `docs/personal/harness.md`
- Modify: `docs/security.md`

**Interfaces:**
- Produces: repository guidance consistent with the actual 16-tool personal catalog and description-first CodeDB resource policy.

**Steps:**

- [ ] Replace stale “Terminal owns exactly six actions” wording with seven actions including `terminal_yield`.

- [ ] Replace “15 unrelated tools” in the personal mental model with 16 and include `terminal_yield` in top-level Terminal lists.

- [ ] Document the routing split:

  ```text
  Dev       focused text/file work + bounded execution + durable waits
  Code      rooted indexed repository intelligence; may create/update heavyweight persistent CodeDB state
  Terminal  durable PTY/process lifetime + model/human terminal ownership
  ```

- [ ] Document the description-first Code policy accurately:
  - there is **no hard repository-size preflight or threshold**;
  - first Code use for a repository may start a persistent CodeDB child and create/update on-disk index state;
  - large repositories can require substantial disk and RAM;
  - for large or unfamiliar repositories with unknown CodeDB state, models should prefer Dev Bash/`rg`/focused `read` for initial discovery unless CodeDB-backed intelligence is specifically desired;
  - this is guidance, not enforcement.

- [ ] State clearly that personal Bash intentionally has the authority of the WSL user and the metadata cannot form a security boundary against intentional raw CLI use.

- [ ] Preserve Terminal ownership guidance: models should use Terminal MCP actions rather than raw tmux/`wsl-term` through Bash when manipulating harness PTYs.

- [ ] Keep Kitty out of normative architecture language; any suitable interactive TTY can be the human frontend.

**Acceptance criteria:**

```bash
! grep -RniE 'Terminal owns exactly six|15 unrelated tools' docs/architecture.md docs/configuration.md docs/personal/harness.md
! grep -RniE 'MCP_CODE_AUTO_INDEX_MAX_FILES|CODE_INDEX_APPROVAL_REQUIRED|fresh-index guard|large-repo.*blocked' docs/architecture.md docs/configuration.md docs/personal/harness.md docs/security.md
```

and all documented catalogs match the live tool counts.

---

### Task 6: Verify descriptions, schemas, and routing behavior

**Files:**
- No additional source files expected.

**Interfaces:**
- Produces: deterministic provider-test evidence plus fresh-model/oracle evidence that description-only routing is sufficient for v1.

**Steps:**

- [ ] Run complete affected provider suites:

  ```bash
  npm --prefix providers/code-router test
  npm --prefix providers/pi-dev test
  npm --prefix providers/terminal test
  ```

- [ ] Run `git diff --check` and inspect the full diff. Confirm there are no changes to:
  - CodeDB child/pool runtime behavior;
  - profile/config rendering;
  - Terminal broker/tmux/CLI behavior;
  - public tool names or input schemas.

- [ ] Re-list direct MCP catalogs and capture effective descriptions:

  ```text
  Personal:
    Dev       6
    Code      3
    Terminal  7
    Total    16

  Restricted upstream shell:
    shell_execute
  ```

- [ ] Run fresh-model/oracle routing scenarios:

  1. **"Find where symbol Foo is defined in this known ordinary repo."**
     - Expected: `code_symbol` with explicit `cwd`.

  2. **"Find references to an unfamiliar concept in this known ordinary repo."**
     - Expected: `code_search`.

  3. **"Orient yourself before changing this known ordinary repo."**
     - Expected: `code_context` is reasonable.

  4. **"Find a symbol in this unfamiliar repository; it has tens of thousands of files and we have not checked CodeDB state."**
     - Expected: avoid immediately invoking Code; start with Dev Bash/`rg`/focused `read`, or explain the CodeDB indexing cost and ask/use Code only when justified by the user's goal.

  5. **"This huge repository is already known to be indexed in CodeDB; trace Foo's definition."**
     - Expected: `code_symbol` is reasonable despite repository size because the user supplied relevant readiness context.

  6. **"Run the unit tests."**
     - Expected: Dev Bash.

  7. **"Wait until port 3000 is listening."**
     - Expected: Dev `wait`, not a Bash sleep loop.

  8. **"Start this development server and keep it running while we continue."**
     - Expected: Terminal, not bounded Bash.

  9. **"Type `npm test` into terminal demo and execute it."**
     - Expected: `terminal_send(text='npm test')` followed by `terminal_send(key='ENTER')`.

  10. **"Show me the current TUI without consuming transcript position."**
      - Expected: `terminal_read(snapshot=true)`.

  11. **"Replay old terminal output from cursor 0."**
      - Expected: model recognizes explicit cursor use intentionally changes the persisted model read position.

  12. **"Close the human-owned terminal even if the human is still using it."**
      - Expected: no casual `force=true`; destructive override requires explicit user intent.

- [ ] No property-based testing is required. This change is prose metadata over stable deterministic provider behavior; focused catalog assertions and model-routing evals provide the relevant evidence.

**Acceptance criteria:**

- All affected provider suites pass.
- Existing public tool names and schemas are unchanged.
- Live descriptions contain the routing-critical facts in this plan.
- The large/unfamiliar-repository oracle scenario avoids blind CodeDB invocation without any runtime guardrail.
- Restricted upstream shell remains audited and unchanged.

---

### Task 7: Controlled rollout and product-path verification

**Files:**
- No additional source changes expected.

**Interfaces:**
- Produces: refreshed MCP metadata visible through the personal 1MCP composition.

**Steps:**

- [ ] Commit the verified implementation on its feature branch/worktree with a focused message such as:

  ```text
  docs: improve MCP tool routing metadata
  ```

  Use `feat:` instead only if repository convention treats live MCP description changes as product behavior rather than documentation metadata.

- [ ] Merge only after Task 6 verification is green; rerun the three provider suites on merged `main` before pushing.

- [ ] Push the verified `main` commit.

- [ ] Restart/reconcile the personal bridge/1MCP from an external controller or human terminal so the providers reload their descriptions. Do **not** restart `wsl-agent-tmux.service` or `wsl-agent-terminal-broker.service`; durable Terminal PTYs and broker state are unchanged by this metadata-only rollout.

- [ ] Verify local bridge health and run `scripts/smoke-local.sh`.

- [ ] Refresh/reconnect the ChatGPT MCP connector.

- [ ] From the refreshed product path, inspect the actual advertised descriptions and repeat the highest-value routing checks:
  - unfamiliar huge repo -> Bash/`rg`/`read` before Code;
  - known indexed repo -> Code is available;
  - bounded Bash vs durable Terminal;
  - Terminal literal send + Enter;
  - snapshot vs cursor replay;
  - destructive Terminal close.

**Acceptance criteria:**

- Local `main` and `origin/main` point to the same verified commit after rollout.
- 1MCP advertises the same 16 personal actions with improved descriptions.
- No new CodeDB policy/config environment appears in the rendered provider composition.
- Existing durable Terminal sessions survive because tmux/broker lifetime services are not restarted.
- ChatGPT sees the refreshed descriptions after connector refresh.

---

## Explicit Deferrals

The following are deliberately **not** part of this implementation:

- Any CodeDB fresh-repository preflight.
- Repository-size or tracked-file thresholds.
- `MCP_CODE_AUTO_INDEX_MAX_FILES` or any equivalent provider configuration.
- `CODE_INDEX_APPROVAL_REQUIRED`, `CODE_INDEX_PREFLIGHT_FAILED`, or other new application error contracts.
- `codedb status` readiness probes in the provider.
- Automatic/manual CodeDB approval state or allowlists.
- CodeDB cgroups, memory/CPU limits, process supervisors, LRU/idle eviction, or changes to `RepoChildPool.maxActive`.
- Model-facing CodeDB index/approval tools.
- MCP tool annotations.
- Server-level MCP `instructions`.
- A local facade around the currently adequate pinned `mcp-shell-server` metadata.
- Terminal broker/tmux/CLI behavior changes.
- Terminal-emulator integration.

If description-only routing fails in real use, the next escalation is a separate plan for a hard guard at the existing new-child factory seam; do not pre-build that mechanism in this mission.

---

## Final Verification Commands

Run from the repository root:

```bash
npm --prefix providers/code-router test
npm --prefix providers/pi-dev test
npm --prefix providers/terminal test

git diff --check
git status --short --branch
```

Check that guardrail artifacts were not introduced:

```bash
test ! -e providers/code-router/index-policy.mjs
! grep -RniE 'MCP_CODE_AUTO_INDEX_MAX_FILES|CODE_INDEX_APPROVAL_REQUIRED|CODE_INDEX_PREFLIGHT_FAILED' \
  providers config scripts docs/architecture.md docs/configuration.md docs/personal/harness.md docs/security.md
```

Check stale catalog wording:

```bash
! grep -RniE 'Terminal owns exactly six|15 unrelated tools' \
  docs/architecture.md docs/configuration.md docs/personal/harness.md
```

After merge/push and external bridge/1MCP refresh:

```bash
bin/status
scripts/smoke-local.sh
```

Then refresh/reconnect ChatGPT and inspect the live tool catalog rather than relying only on source strings.

---

## Self-Review

- **Spec coverage:** All 16 repository-owned personal tools are covered through Code/Dev/Terminal description work, and the upstream restricted shell surface is explicitly re-audited.
- **Scope:** The plan is now purely metadata/docs plus verification. It adds no CodeDB runtime policy, config, subprocess, approval state, error contract, Terminal behavior, or new dependency.
- **Residual risk:** Heavy CodeDB indexing remains technically possible. This is explicitly accepted for the unrestricted personal harness while description-only routing is evaluated first.
- **Interface consistency:** Tool names, input schemas, provider composition, CodeDB router behavior, and Terminal protocols remain unchanged.
- **Node compatibility:** All changes must remain compatible with the existing `>=22.19.0` engine floor.
- **Verification quality:** Existing provider suites protect deterministic contracts; narrow description assertions protect load-bearing metadata; fresh-model/oracle scenarios measure the behavior this mission actually targets.
- **Escalation path:** If the large/unfamiliar-repository oracle or real usage still triggers blind CodeDB indexing, add a separate hard-preflight plan at the already-known new-child seam rather than expanding this mission retroactively.
- **Placeholders:** No unresolved implementation decisions remain.
