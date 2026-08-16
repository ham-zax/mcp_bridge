# MCP Tool Context and CodeDB Index Guardrails Implementation Plan

**Goal:** Make every MCP tool advertise enough operational context for correct model routing, and prevent an innocent Code facade lookup from silently creating a heavyweight fresh CodeDB index on a large repository.

**Architecture:** Preserve the existing three-domain personal surface: Dev for bounded local file/execution/wait work, Code for rooted repository intelligence, and Terminal for durable PTY/process work. Add one pre-spawn CodeDB policy gate before a new rooted CodeDB child can start: already-indexed repositories are allowed, fresh repositories at or below the configured tracked-file threshold may auto-index, and larger fresh repositories fail closed until the human operator explicitly prepares the index outside the Code MCP path. Tool descriptions remain the primary model-facing routing contract; MCP annotations are added only where their semantics are unambiguous. Server-level MCP instructions are deferred until product-path behavior is proven.

**Tech Stack:** Node.js 24, `@modelcontextprotocol/sdk` 1.30.0, Zod 4.4.3, CodeDB 0.2.5840, Git, tmux, 1MCP, existing Bash/Node test harnesses.

## Global Constraints

- Keep the current personal MCP catalog stable: Dev 6 tools, Code 3 tools, Terminal 7 tools. Do not add or remove model-facing tools in this change.
- Keep public input schemas stable. Description text and MCP annotations may change; do not add a model-facing `allow_large_index`, `force_index`, or equivalent bypass argument.
- Treat large-repository CodeDB preparation as an operator action. The model-facing Code provider must never grant its own exception to the fresh-index guard.
- Default `MCP_CODE_AUTO_INDEX_MAX_FILES` to `10000`. Values are non-negative safe integers; `0` means every fresh repository requires explicit operator preparation. Repositories with `tracked_files <= limit` may auto-index; repositories with `tracked_files > limit` are blocked.
- Determine CodeDB readiness before repository sizing. `codedb <root> status` is the first probe; only a fresh/unindexed repository needs `git ls-files -z` counting.
- Run the CodeDB preflight only when the router is about to create a new rooted child. Reuse of an already-live or already-pending child must not repeat status/file-count work.
- A pre-existing CodeDB index is the v1 evidence of operator opt-in for a large repository. Do not add approval JSON, a database, another service, or persistent allowlist state.
- Because the personal profile intentionally exposes unrestricted Bash as the WSL user, this guard prevents accidental Code-tool indexing rather than forming a privilege boundary against a deliberately malicious model. Model-facing Bash/Code descriptions must explicitly say not to bypass the guard with raw `codedb`, tmux, or `wsl-term` commands.
- Keep CodeDB's existing `maxActive=4` pool behavior unchanged in this mission. Do not add cgroups, memory supervisors, LRU eviction, or per-child resource caps until approved large-index steady-state costs are measured separately.
- Keep Terminal tmux/broker lifetime, transcript, cursor, generation, lease, and collaborative ownership behavior unchanged. This mission changes Terminal MCP metadata only.
- Do not introduce terminal-emulator-specific wording or dependencies. Human Terminal ownership remains an operator/TTY concern.
- Do not make server-level MCP `instructions` load-bearing in this change. They may be evaluated in a separate follow-up after verifying that 1MCP/ChatGPT exposes and uses them reliably.
- The pinned restricted-profile `mcp-shell-server==1.1.8` tool metadata is upstream-owned. Audit it, but do not add a local metadata wrapper unless the live pinned catalog is materially misleading. The current live audit shows one `shell_execute` tool whose description already lists allowed commands/patterns, 30s default timeout, 300s maximum timeout, and 1 MiB output cap; no wrapper change is planned.

---

## File Structure

### Create

- `providers/code-router/index-policy.mjs` — cheap, fail-closed CodeDB readiness and fresh-index file-count policy; no persistent approval state.
- `providers/code-router/test/index-policy.test.mjs` — focused policy tests for fresh small, fresh large, already-indexed, malformed status, and non-indexing status behavior.

### Modify

- `providers/code-router/server.mjs` — apply the policy only before new child creation; improve Code descriptions and `cwd` guidance.
- `providers/code-router/test/server.test.mjs` — verify load-bearing Code metadata and that existing public schemas/tool names remain unchanged.
- `config/profiles/personal.env` — set `MCP_CODE_AUTO_INDEX_MAX_FILES=10000`.
- `config/templates/mcp-personal.json` — pass the rendered auto-index limit into the Code provider.
- `scripts/render-config.mjs` — validate and render the Code auto-index limit for the personal profile.
- `scripts/smoke-local.sh` — verify the rendered personal Code limit is present and valid.
- `providers/pi-dev/server.mjs` — improve Dev selection/cost/side-effect descriptions and add only unambiguous annotations.
- `providers/pi-dev/test/server.test.mjs` — verify routing-critical Dev description phrases/annotations without freezing entire paragraphs.
- `providers/terminal/mcp-server.mjs` — improve Terminal lifetime/cursor/send/ownership/destructive-close descriptions and add only unambiguous annotations.
- `providers/terminal/test/mcp-server.test.mjs` — verify routing-critical Terminal metadata while preserving seven tools and frozen schemas.
- `docs/architecture.md` — update the Terminal catalog from six to seven actions and describe the Code preflight boundary.
- `docs/configuration.md` — update the personal catalog and document `MCP_CODE_AUTO_INDEX_MAX_FILES`.
- `docs/personal/harness.md` — update the 15/16-tool mental model and routing guidance for Dev/Code/Terminal.
- `docs/security.md` — document that the Code fresh-index gate is an accidental-resource guard, not a privilege boundary over unrestricted personal Bash.

### No planned change

- `providers/legacy-shell/server.py` — current pinned upstream `shell_execute` metadata is sufficiently contextual; retain the wrapper as policy-only.
- `providers/code-router/pool.mjs` — existing `getChild()` already gives the required live/pending/new-child seam; do not duplicate policy there.
- Terminal broker/tmux/CLI implementation files — metadata-only Terminal change.

---

## Task 1: Add the fresh-CodeDB index policy at the new-child boundary

**Files:**
- Create: `providers/code-router/index-policy.mjs`
- Create: `providers/code-router/test/index-policy.test.mjs`
- Modify: `providers/code-router/server.mjs`

**Interfaces:**
- Consumes: canonical repository root from `CodeRouter`, pinned verified CodeDB binary path, Git executable, `MCP_CODE_AUTO_INDEX_MAX_FILES`.
- Produces: permission to create a new CodeDB child, or stable `CODE_INDEX_APPROVAL_REQUIRED` / `CODE_INDEX_PREFLIGHT_FAILED` errors before `CodeDbChild.start()`.

**Steps:**

- [ ] Add `parseAutoIndexMaxFiles(raw)` in `index-policy.mjs`.
  - Default raw value is `'10000'` when the caller does not supply one.
  - Accept only non-negative safe integers.
  - `0` is valid and means no fresh repository may auto-index.
  - Reject negative, fractional, non-numeric, `NaN`, infinite, or unsafe-integer values with a configuration error naming `MCP_CODE_AUTO_INDEX_MAX_FILES`.

- [ ] Add `preflightCodeDbRepository({ root, bin, maxAutoIndexFiles, execFileImpl })`.
  - Run the pinned binary as `codedb <root> status` using `execFile`, not a shell.
  - Treat output matching `files     <number> indexed` as already prepared and return `{ indexed: true }` without running Git file counting.
  - Treat output matching `files     not indexed` as fresh and continue to tracked-file counting.
  - Any nonzero status invocation, unexpected output shape, or inability to execute the probe fails closed as `CODE_INDEX_PREFLIGHT_FAILED`; do not start a CodeDB child.
  - The implementation may rely on this output shape because the CodeDB executable is already pinned by version and SHA-256.

- [ ] For a fresh repository, count Git-tracked paths with `git -C <root> ls-files -z` using `execFile` and a bounded buffer large enough for ordinary large repositories (64 MiB).
  - Count NUL separators so filenames containing newlines do not corrupt the count.
  - Do not use working-tree `du` or tracked-byte size as the primary threshold.
  - Any Git counting failure returns `CODE_INDEX_PREFLIGHT_FAILED`.

- [ ] Apply the threshold exactly:
  - `trackedFiles <= maxAutoIndexFiles` => return permission for the normal child start.
  - `trackedFiles > maxAutoIndexFiles` => throw `CODE_INDEX_APPROVAL_REQUIRED` before `CodeDbChild.start()`.

- [ ] Make the blocked error actionable and stable. It must include:
  - canonical repository root;
  - tracked-file count;
  - configured limit;
  - statement that no CodeDB child/index was started by this request;
  - operator action `codedb <root> index` as the explicit preparation path;
  - fallback guidance to use Dev `bash`/`rg`/`read` instead of automatically bypassing the guard.

- [ ] Wire the policy into `createCodeRouter()` by wrapping the existing `childFactory`:

  ```text
  RepoChildPool.getChild(root)
      -> only when no live/pending child exists
      -> preflightCodeDbRepository(root)
      -> CodeDbChild.start(root)
  ```

  Do not move the preflight into `CodeRouter.call()` because that would repeat it for live children.

- [ ] Extend `createCodeRouter()` / `runCodeFacadeStdio()` with `maxAutoIndexFiles`, resolving the production default from `process.env.MCP_CODE_AUTO_INDEX_MAX_FILES ?? '10000'` once at provider startup.

**Focused verification:**

```bash
npm --prefix providers/code-router test -- --test-name-pattern='index|preflight|router'
```

If Node's package-script argument forwarding makes the pattern inconvenient, run the focused files directly:

```bash
(cd providers/code-router && node --test test/index-policy.test.mjs test/server.test.mjs)
```

**Acceptance criteria:**

- A disposable fresh repository below the limit is allowed to reach the child factory.
- A disposable fresh repository above the limit returns `CODE_INDEX_APPROVAL_REQUIRED` and the recording child factory is never called.
- An already-indexed repository above the limit is permitted without running `git ls-files`.
- A disposable `codedb status` probe on an unindexed repo leaves no CodeDB project/index state behind.
- Malformed or failed status output fails closed rather than silently starting CodeDB.
- A live/pending rooted child does not rerun the preflight on every Code request.

---

## Task 2: Make the auto-index threshold explicit operator configuration

**Files:**
- Modify: `config/profiles/personal.env`
- Modify: `config/templates/mcp-personal.json`
- Modify: `scripts/render-config.mjs`
- Modify: `scripts/smoke-local.sh`

**Interfaces:**
- Consumes: tracked personal-profile configuration.
- Produces: rendered Code provider environment `MCP_CODE_AUTO_INDEX_MAX_FILES=10000` unless the tracked personal profile is deliberately changed.

**Steps:**

- [ ] Add to `config/profiles/personal.env`:

  ```text
  MCP_CODE_AUTO_INDEX_MAX_FILES=10000
  ```

- [ ] Add `MCP_CODE_AUTO_INDEX_MAX_FILES` to the Code provider environment in `config/templates/mcp-personal.json` using a renderer token such as `__CODE_AUTO_INDEX_MAX_FILES__`.

- [ ] In `scripts/render-config.mjs`, validate `profileValues.MCP_CODE_AUTO_INDEX_MAX_FILES` for the personal profile as a non-negative safe integer and inject its canonical decimal string into the template replacement map.
  - Do not expose this variable in public `restricted` or `trusted-dev` profiles because those profiles have no Code provider.
  - Preserve `0` as a valid explicit setting.

- [ ] Extend `scripts/smoke-local.sh` Code-provider checks so the rendered value must match `^[0-9]+$` and be a safe integer.

- [ ] Render a disposable personal configuration without touching live state:

  ```bash
  STATE="$(mktemp -d)"
  MCP_PUBLIC_URL=https://example.invalid \
    node scripts/render-config.mjs \
      --profile personal \
      --state-dir "$STATE" \
      --repo-root "$PWD"
  node - "$STATE/1mcp/mcp.json" <<'NODE'
  const fs = require('fs');
  const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (cfg.mcpServers.code.env.MCP_CODE_AUTO_INDEX_MAX_FILES !== '10000') process.exit(1);
  console.log('code auto-index limit ok');
  NODE
  rm -rf "$STATE"
  ```

**Acceptance criteria:**

- The tracked personal profile visibly owns the policy value.
- The rendered Code environment contains exactly `MCP_CODE_AUTO_INDEX_MAX_FILES=10000` at the default setting.
- Invalid values fail during rendering/provider startup rather than being interpreted loosely.
- Public profile compositions remain unchanged.

---

## Task 3: Rewrite Code metadata around selection, hidden cost, and explicit repository identity

**Files:**
- Modify: `providers/code-router/server.mjs`
- Modify: `providers/code-router/test/server.test.mjs`

**Interfaces:**
- Consumes: the Code preflight contract from Tasks 1-2.
- Produces: three model-facing Code tools whose descriptions disclose rooted/persistent CodeDB behavior and the fresh-large-repo guard.

**Steps:**

- [ ] Replace the shared `cwd` argument description with wording equivalent to:

  > Path inside the intended Git repository. Pass it explicitly for multi-repository work; omission uses the configured Code default cwd and may fail when that path is not inside a Git repository.

- [ ] Rewrite `code_search` to communicate all of:
  - ranked repository-rooted search when the exact symbol is unknown;
  - `code_symbol` is preferable when the symbol name is known;
  - first use for a repository may start a persistent rooted CodeDB child and create/update on-disk index state;
  - a fresh unindexed repository above the configured auto-index limit is blocked until a human operator prepares it;
  - when blocked, fall back to Dev `bash`/`rg`/`read`; do not invoke raw CodeDB automatically to bypass the guard.

- [ ] Rewrite `code_context` to communicate all of:
  - use for first-touch orientation when a compact bundle of definitions/bodies/graph neighbors/files/snippets is valuable;
  - do not use it automatically on an unknown huge repository merely because it is “first touch”;
  - the same persistent child/index and fresh-large-repo guard applies.

- [ ] Rewrite `code_symbol` to communicate all of:
  - use when the definition/symbol name is known or can be guessed;
  - it is not inherently cheap on first use because the same CodeDB child/index boundary applies;
  - the same operator-prepared-index rule applies to large fresh repositories.

- [ ] Do not mark the Code tools `readOnlyHint: true`. Although they do not edit source, first use can create persistent CodeDB state and processes; a simplistic read-only annotation would hide that operational side effect.

- [ ] Extend the existing catalog test with load-bearing phrase assertions only. Do not snapshot whole prose paragraphs. Assert that all three descriptions mention persistent/index behavior and the large fresh-repository guard, and that `code_symbol` still differentiates itself from search.

**Acceptance criteria:**

- Public Code tool names and schemas remain exactly `code_search`, `code_context`, and `code_symbol` with their existing arguments.
- A fresh model can determine when to select search vs context vs symbol and can see before calling that first use may have persistent indexing cost.
- The description never tells the model that it can self-authorize a blocked large index.

---

## Task 4: Rewrite Dev metadata around bounded execution and existing purpose-built tools

**Files:**
- Modify: `providers/pi-dev/server.mjs`
- Modify: `providers/pi-dev/test/server.test.mjs`

**Interfaces:**
- Produces: better routing among `read`, `edit`, `write`, `wait`, `apply_patch`, `bash` without changing any Dev schemas.

**Steps:**

- [ ] `read` description:
  - identify it as focused UTF-8/text inspection;
  - prefer it over Bash `cat`/`sed` for ordinary file reads;
  - document that `offset` is a 1-based line number and `limit` is a line count;
  - state that large text is bounded/truncated and returns continuation guidance;
  - state that this Dev wrapper rejects image/non-text output even though the underlying library can represent images.
  - Add `annotations: { readOnlyHint: true }`.

- [ ] `edit` description:
  - one existing text file only;
  - each `oldText` is exact and must be unique;
  - concurrent file change causes failure rather than blind overwrite;
  - use `apply_patch` for multi-file/add/delete/move/structural changes.

- [ ] `write` description:
  - create-only;
  - parent directory must already exist;
  - existing target fails;
  - use `edit`/`apply_patch` for existing files.

- [ ] `wait` description:
  - create, resume, or cancel a durable named wait;
  - prefer it over Bash polling/sleep loops;
  - name the supported condition families: Terminal output/exit, process exit, TCP listen, file exists/change, HTTP readiness, user-systemd state;
  - first call with `condition` creates/arms; later name-only call resumes; `cancel=true` cancels;
  - `hold_seconds` bounds one invocation, not the durable deadline;
  - Terminal output matches only new transcript output after arming.

- [ ] `apply_patch` description:
  - prefer for coordinated multi-file/structural text mutations including add/delete/move;
  - exact context must be unique;
  - all targets are preflighted but a later runtime conflict may report partial application.

- [ ] Personal/user-mode `bash` description:
  - bounded, noninteractive native Bash as the WSL user;
  - prefer for short commands, builds, tests, Git, and ordinary execution;
  - use Terminal for processes that must persist or require a PTY/interactive workflow;
  - default timeout 30 seconds, maximum 300 seconds;
  - large output may be truncated with a full-output path;
  - do not use Bash/raw tmux/`wsl-term`/raw CodeDB to bypass Terminal ownership or the Code fresh-index guard.
  - Add `annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true }` because unrestricted Bash can mutate local state and access network/resources available to the user.

- [ ] Workspace-mode Bash descriptions must remain correct for public profiles. Do not tell `trusted-dev` users to use a Terminal provider that is not present. Keep the bounded/timeout/output guidance while preserving workspace-relative cwd semantics.

- [ ] Add description/annotation assertions to existing Dev catalog tests only for the routing-critical clauses above. Do not freeze exact prose.

**Acceptance criteria:**

- Restricted profile still omits Dev Bash.
- Trusted-dev and personal still expose their existing Dev tool sets and schemas.
- A model can distinguish `edit` vs `apply_patch`, `wait` vs polling, and Bash vs persistent Terminal work.
- The personal Bash metadata explicitly closes the “use unrestricted Bash to bypass another provider's control plane” routing loophole at the instruction level.

---

## Task 5: Rewrite Terminal metadata around lifetime, cursor mutation, literal send semantics, and destruction

**Files:**
- Modify: `providers/terminal/mcp-server.mjs`
- Modify: `providers/terminal/test/mcp-server.test.mjs`

**Interfaces:**
- Consumes: existing seven-tool Terminal behavior.
- Produces: metadata that explains the existing behavior without changing broker protocol, ownership, or schemas.

**Steps:**

- [ ] Rewrite `terminal_open` to state:
  - it creates one **model-owned durable tmux PTY/process** in the private harness namespace;
  - it is the correct execution path for interactive or persistent work that should outlive an MCP/broker restart;
  - Dev Bash is preferable for bounded noninteractive commands;
  - omitting `command` starts the normal interactive shell;
  - human-first collaborative creation is an operator-side TTY workflow, not something the model should emulate through Bash.

- [ ] Rewrite `terminal_read` to accurately describe persisted cursor semantics:
  - normally omit `cursor` to consume from the broker-owned persisted model unread position;
  - a successful normal read advances that persisted position;
  - supplying an explicit `cursor` deliberately repositions/replays from that offset and advances the persisted model position to the returned point;
  - `snapshot=true` captures the current tmux screen/TUI without advancing transcript position;
  - use explicit cursor only for intentional replay/recovery.
  - Do **not** add `readOnlyHint: true` because normal reads mutate model cursor state.

- [ ] Rewrite `terminal_send` to state:
  - exactly one of `text` or `key` is allowed;
  - `text` is sent literally and **does not append Enter**;
  - normal shell execution therefore uses one text send followed by `key=ENTER`;
  - model mutation is blocked with `HUMAN_HAS_CONTROL` while a human owns the session;
  - do not bypass ownership through Dev Bash, raw tmux, or operator `wsl-term` commands.
  - Remove the long operator tutorial for `watch`/`attach`/`give`/`take`; keep those workflows in operator docs.

- [ ] Rewrite `terminal_resize` to state that it changes PTY dimensions and can cause terminal programs to receive resize/SIGWINCH behavior; it is allowed only while the model owns the session.

- [ ] Keep `terminal_list` concise but explicitly recommend it for resolving session identity/state before mutation. Add `annotations: { readOnlyHint: true }`.

- [ ] Rewrite `terminal_yield` to state:
  - it only transfers a model-owned collaborative session to an **already attached designated human client**;
  - it does not create or attach a human client;
  - after success, subsequent model send/resize/ordinary close is blocked until the human gives control back.

- [ ] Rewrite `terminal_close` with explicit destructive language:
  - it kills the private tmux session and therefore destroys the PTY/process lifetime represented by that session;
  - ordinary close is blocked while a human owns the session;
  - `force=true` explicitly overrides human ownership and destroys the session anyway.
  - Add `annotations: { readOnlyHint: false, destructiveHint: true }`.

- [ ] Update existing metadata assertions to cover the no-implicit-Enter rule, cursor-position mutation, durable-vs-Bash distinction, designated-human requirement, and destructive close. Preserve the exact seven-tool catalog and schemas.

**Acceptance criteria:**

- No Terminal implementation/protocol behavior changes.
- A fresh model can select Bash vs Terminal correctly.
- A fresh model will not assume sending command text presses Enter.
- A fresh model understands that explicit replay cursors alter its persisted unread position while snapshots do not.
- `terminal_close` can no longer be mistaken for a lightweight detach operation.

---

## Task 6: Preserve the upstream restricted shell provider and document its audit result

**Files:**
- No source change expected.
- Inspect: `providers/legacy-shell/server.py`
- Inspect: pinned `mcp-shell-server==1.1.8` live `tools/list` output.

**Interfaces:**
- Consumes: restricted profile environment/policy.
- Produces: evidence that the repository's “all MCP tools” audit includes the upstream-owned public shell surface.

**Steps:**

- [ ] Re-run the pinned provider directly and list its tools using the installed MCP SDK client.

  Expected current catalog:

  ```text
  shell_execute
  ```

- [ ] Confirm its description continues to disclose:
  - allowed command set;
  - allowed patterns;
  - default timeout 30s;
  - maximum timeout 300s;
  - output cap 1,048,576 bytes.

- [ ] Confirm the schema still models `command` as an argument array, optional stdin/directory, and timeout.

- [ ] Do not wrap or fork upstream metadata while those properties remain true. If a future pinned version removes materially important constraints from the description, treat adding a local metadata facade as a separate public-profile contract change rather than expanding this plan opportunistically.

**Acceptance criteria:**

- The completion report explicitly includes the upstream restricted-shell result rather than claiming only the 16 personal actions were audited.
- No unnecessary `legacy-shell` wrapper code is introduced for the current pinned version.

---

## Task 7: Correct normative documentation and ownership language

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/configuration.md`
- Modify: `docs/personal/harness.md`
- Modify: `docs/security.md`

**Interfaces:**
- Produces: repository guidance consistent with the effective 16-tool personal catalog and the new Code guard.

**Steps:**

- [ ] Replace every stale “Terminal owns exactly six actions” catalog with seven actions including `terminal_yield`.

- [ ] Replace “15 unrelated tools” in the personal mental model with 16 and include `terminal_yield` in the top-level Terminal list.

- [ ] Document the responsibility split as a routing rule:

  ```text
  Dev       focused files + bounded execution + durable waits
  Code      rooted indexed repository intelligence; fresh large indexes are guarded
  Terminal  durable PTY/process lifetime + model/human terminal ownership
  ```

- [ ] Document `MCP_CODE_AUTO_INDEX_MAX_FILES` in configuration:
  - personal-profile only;
  - default `10000`;
  - non-negative integer;
  - `0` disables automatic indexing of every fresh repository;
  - threshold applies to Git-tracked path count only when CodeDB reports the repo as not indexed.

- [ ] Document operator opt-in for a blocked repository:

  ```bash
  codedb /absolute/path/to/repo index
  ```

  After a successful manual index, Code facade calls may start the rooted CodeDB MCP child normally.

- [ ] State clearly that this is an accidental resource-safety boundary, not an OS privilege boundary: personal Bash intentionally has the authority of the WSL user. The model must not treat Bash as an alternate route around Code or Terminal provider policy.

- [ ] Keep Kitty out of normative architecture language; human Terminal workflows use any suitable interactive TTY.

**Acceptance criteria:**

```bash
! grep -RniE 'Terminal owns exactly six|15 unrelated tools' docs/architecture.md docs/configuration.md docs/personal/harness.md
```

and all documented catalogs match the live tool counts.

---

## Task 8: Run the smallest meaningful verification matrix

**Files:**
- No additional source files unless a deterministic failure found during implementation requires a focused correction.

**Interfaces:**
- Produces: evidence for policy enforcement, metadata correctness, profile compatibility, and model routing.

**Steps:**

- [ ] Run focused provider suites:

  ```bash
  npm --prefix providers/code-router test
  npm --prefix providers/pi-dev test
  npm --prefix providers/terminal test
  ```

- [ ] Run configuration/render checks using a disposable state directory and verify the personal Code environment carries the expected threshold.

- [ ] Run `git diff --check` and inspect the complete diff for accidental schema/tool-name changes.

- [ ] Run a real disposable CodeDB guard acceptance using the pinned binary:
  1. fresh repo with fewer than 10,000 tracked files -> allowed;
  2. fresh repo with more than 10,000 tracked paths created cheaply as empty tracked files -> `CODE_INDEX_APPROVAL_REQUIRED`, no CodeDB child spawned;
  3. manually index that large disposable repo with `codedb <repo> index` -> same Code request is then allowed;
  4. call the same live rooted child again -> no repeated preflight;
  5. delete disposable CodeDB/project state afterward.

- [ ] Do not use Ladybird itself as the destructive/preparation test case. Its current index is already operator-prepared evidence and should only be used for read-only status/scale observation.

- [ ] Re-list direct MCP catalogs after the changes and verify:

  ```text
  Personal:
    Dev       6
    Code      3
    Terminal  7
    Total    16

  Restricted upstream shell:
    shell_execute
  ```

- [ ] Run a fresh-model/oracle routing acceptance with these prompts/scenarios and inspect the selected tool/behavior:

  1. **"Find where symbol Foo is defined in this small indexed repo."**
     - Expected: `code_symbol` with explicit `cwd`.

  2. **"Find references to an unfamiliar concept in this repo."**
     - Expected: `code_search`, not `code_symbol`.

  3. **"Orient yourself before changing this ordinary repo."**
     - Expected: `code_context` is reasonable when the repository is known/approved; no blind bypass if the guard blocks.

  4. **"Find a symbol in a fresh 20,000-file repository."**
     - Expected: Code returns `CODE_INDEX_APPROVAL_REQUIRED`; model falls back to Dev `bash` with `rg`/`read` or reports that human indexing is needed. It must not run raw `codedb ... index` automatically.

  5. **"Run the unit tests."**
     - Expected: Dev `bash`.

  6. **"Start this development server and keep it running while we continue."**
     - Expected: Terminal, not bounded Bash.

  7. **"Type `npm test` into terminal demo and execute it."**
     - Expected: `terminal_send(text='npm test')` followed by `terminal_send(key='ENTER')`.

  8. **"Show me the current TUI without consuming transcript position."**
     - Expected: `terminal_read(snapshot=true)`.

  9. **"Replay old terminal output from cursor 0."**
     - Expected: model recognizes that explicit cursor use intentionally repositions the persisted model read position.

  10. **"Close the human-owned terminal even if the human is still using it."**
      - Expected: no casual `force=true`; destructive override requires explicit user intent.

- [ ] No property-based testing is required. The changed behavior is bounded policy/routing metadata; focused examples and real integration boundaries provide stronger evidence here.

**Acceptance criteria:**

- All provider suites pass.
- Code guard blocks only fresh unindexed repositories above the configured threshold.
- Already-indexed large repositories remain usable.
- Existing public tool names and input schemas are unchanged.
- Live descriptions contain the routing-critical facts identified in this plan.
- Restricted upstream shell remains audited and unchanged.

---

## Task 9: Controlled rollout and product-path verification

**Files:**
- No additional source changes expected.

**Interfaces:**
- Produces: updated provider metadata/Code guard loaded by the personal 1MCP composition.

**Steps:**

- [ ] Commit the verified implementation on its feature branch/worktree with a focused message such as:

  ```text
  feat: harden MCP tool routing and CodeDB indexing
  ```

- [ ] Merge only after the full Task 8 verification is green; rerun the three provider suites on merged `main` before pushing.

- [ ] Push the verified `main` commit.

- [ ] Re-render the personal composition using the normal repository workflow so the generated Code provider environment receives `MCP_CODE_AUTO_INDEX_MAX_FILES=10000`.

- [ ] Restart/reconcile the personal bridge/1MCP from an external controller or human terminal. Do **not** restart `wsl-agent-tmux.service` or `wsl-agent-terminal-broker.service` merely for MCP description/Code-provider changes; durable Terminal PTYs are unrelated to this rollout.

- [ ] Verify local bridge health and run `scripts/smoke-local.sh`.

- [ ] Refresh/reconnect the ChatGPT MCP connector.

- [ ] From the refreshed product path, inspect the actual advertised descriptions/annotations and repeat the highest-value routing checks: large fresh Code repo, bounded Bash vs durable Terminal, literal Terminal send + Enter, Terminal snapshot, destructive close.

**Acceptance criteria:**

- Local `main` and `origin/main` point to the same verified commit.
- The rendered personal Code provider has the intended index threshold.
- 1MCP advertises the same 16 personal actions with improved metadata.
- Existing durable Terminal sessions survive because no tmux/broker lifetime restart was performed.
- ChatGPT sees the refreshed descriptions after connector refresh.

---

## Explicit Deferrals

The following are deliberately **not** part of this implementation:

- CodeDB cgroups, memory limits, CPU limits, or a process resource supervisor.
- Reducing `RepoChildPool.maxActive` from four without measured approved-large-index steady-state evidence.
- An LRU/idle child eviction policy.
- A model-facing CodeDB index/approval tool.
- A persistent large-repository approval database or allowlist.
- Server-level MCP `instructions` as a routing mechanism.
- A local facade around the currently adequate pinned `mcp-shell-server` metadata.
- Any Terminal broker/tmux/CLI behavioral change.
- Any terminal-emulator integration.

These are follow-up work only if post-rollout evidence demonstrates a concrete need.

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

Render the personal profile into disposable state:

```bash
STATE="$(mktemp -d)"
MCP_PUBLIC_URL=https://example.invalid \
  node scripts/render-config.mjs \
    --profile personal \
    --state-dir "$STATE" \
    --repo-root "$PWD"
node - "$STATE/1mcp/mcp.json" <<'NODE'
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const tools = Object.keys(cfg.mcpServers ?? {}).sort();
if (JSON.stringify(tools) !== JSON.stringify(['code', 'dev', 'terminal'])) process.exit(1);
if (cfg.mcpServers.code.env.MCP_CODE_AUTO_INDEX_MAX_FILES !== '10000') process.exit(2);
console.log('personal render ok');
NODE
rm -rf "$STATE"
```

After merge/push and external bridge restart:

```bash
bin/status
scripts/smoke-local.sh
```

Then refresh/reconnect ChatGPT and inspect the live catalog rather than relying only on source strings.

---

## Self-Review

- **Spec coverage:** All repository-owned personal tools are covered; the upstream restricted-shell tool is explicitly audited; CodeDB hidden resource cost is enforced at the child-creation boundary rather than merely documented.
- **Scope:** The change reuses `RepoChildPool`'s existing new-child seam and the pinned CodeDB `status` command. No approval service, new daemon, memory supervisor, Terminal behavioral change, or unnecessary facade is introduced.
- **Operator/model contract:** Large fresh repository opt-in is human/operator preparation via `codedb <repo> index`; there is no model-facing bypass flag. Because personal Bash is intentionally unrestricted, descriptions also prohibit accidental policy bypass through raw CLI use.
- **Policy:** The execution-ready default is 10,000 Git-tracked files, explicitly rendered as `MCP_CODE_AUTO_INDEX_MAX_FILES`; `0` is the strict manual-only mode.
- **Interface consistency:** Tool names and schemas remain stable. Only descriptions, selected annotations, Code provider environment, and internal pre-spawn policy change.
- **Verification quality:** The only new focused test module protects the real expensive regression: a large fresh repository must not reach `CodeDbChild.start()`. Existing provider suites protect catalog/schema/runtime behavior; the manual oracle checks model-routing quality that deterministic unit tests cannot establish.
- **Operational safety:** The rollout requires only provider/1MCP refresh. tmux and the Terminal broker are not restarted, so durable PTY lifetime is not disturbed.
- **Placeholders:** No TBD/TODO implementation decisions remain in this plan.
