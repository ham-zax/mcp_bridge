# Robust Agent Mutation Stack Implementation Plan

**Goal:** Replace the fragile generic `apply_patch` editing route with a smaller, semantics-driven mutation stack: guarded exact `edit` for existing text, explicit `file_ops` for move/delete, `write` for creation, ast-grep for syntax-shaped discovery/codemods, and native `git apply` only for genuine patch artifacts.

**Architecture:** Keep the current Pi Dev provider, user/workspace path authority, `withMutationPaths` coordination, Edit V2 multi-target exact-replacement semantics, and native Bash execution path. Remove the custom model-facing patch grammar instead of making it progressively fuzzier. Existing-file text changes converge on `edit`; topology changes move to a narrow personal-only `file_ops` whose regular-file moves are same-filesystem identity-preserving link/unlink operations; ast-grep remains a bounded CLI capability behind Dev Bash rather than becoming another MCP domain.

**Tech Stack:** Node.js ESM; current Pi Dev provider and mutation coordinator; existing `@earendil-works/pi-coding-agent`; Git 2.43+ native `git apply`; ast-grep 0.45.0; existing MCP SDK/Zod stack.

## Global Constraints

- Preserve the existing Dev provider authority boundaries. Public/workspace profiles must not gain personal user-path mutation capability.
- Keep the existing `edit({targets:[{path,edits:[{oldText,newText}]}]})` schema. Do not add a parallel range-edit API, fuzzy matcher, revision protocol, or second text-edit tool in this wave.
- Treat exact `oldText` as the mutation precondition. If it is ambiguous, the agent must widen the exact old block using text already inspected until it is unique; do not guess a location.
- Preserve Edit V2 same-snapshot planning, overlap rejection, valid-UTF-8/regular-file requirements, canonical-target deduplication, cooperative mutation locking, final snapshot/identity checks, and explicit partial-state reporting.
- Remove `apply_patch` from the final personal Dev tool catalog. Do not leave a deprecated alias, compatibility wrapper, hidden patch parser, or dual routing path unless an external consumer is discovered before implementation.
- Replace the topology portion of `apply_patch` with one narrow personal-only `file_ops` tool supporting only independent `move` and `delete` operations. New-file creation remains `write`.
- `file_ops` operates on the requested filesystem directory entry, not the referent behind a final-component symlink. Canonicalize/authorize the parent, inspect the final entry without following symlinks, require a regular file, and reject symbolic links for move/delete.
- Reuse existing root/path authority where its semantics fit, but do not reuse a helper whose final-component `realpath()` changes topology identity. `edit` may resolve content aliases; destructive topology operations must preserve the requested entry identity.
- `file_ops` supports regular files whether text or binary. It must not decode file contents merely to move/delete them.
- `file_ops.move` is same-filesystem only in this wave. Create the destination as a hard link to the same inode, verify the linked destination/source identity, then remove the source name under guards. Reject `EXDEV`; do not silently fall back to copy+unlink.
- Do not make `file_ops` a directory-management, chmod/chown, copy, mkdir, symlink, or arbitrary filesystem command framework.
- Keep native Bash as the execution substrate for ast-grep and Git. Do not add an ast-grep MCP server, another aggregator, or another always-visible model-facing domain.
- ast-grep remains the preferred syntax-shaped structural search/rewrite engine. For a small or moderate number of structural matches, use it to *locate* the intended code and perform the final mutation through guarded `edit`; use `--update-all` only when the bounded transformation is deterministic and every match is intentionally rewritten.
- Semgrep CLI installation, version qualification, toolbox wiring, and routing are explicitly deferred to a separate toolbox mission; they are not prerequisites for removing `apply_patch`.
- Never use fuzzy text relocation as the default mutation recovery path. A missing/ambiguous exact edit must fail and trigger reread/reconciliation.
- Never automatically use `git apply --3way`, GNU patch fuzz, `--unsafe-paths`, or another merge/fuzzy mode to make an agent-generated edit fit.
- Native `git apply` is reserved for genuine unified-diff/patch artifacts that already exist as an input to the task. Routine model-authored source edits must not be converted to a patch merely to use Git's patch engine.
- Preserve unrelated dirty work. Do not stash, reset, checkout, overwrite, or clean unrelated user changes. At implementation start, inventory overlap with current dirty files before editing.
- Do not rewrite historical benchmark/spec documents merely because they describe the old `apply_patch` experiment. Update only current normative docs and active Skills; history remains historical evidence.
- The repository's mandatory Full verification section in the current `docs/development.md` is authoritative. Run it for each actual candidate-final source state before live activation; do not freeze a duplicate command list in this plan. Do not add a new testing framework or broad new test program; update existing contract tests only where required by this migration and remove tests for deleted behavior.

## Design Basis

### Current failure mode

The current custom `providers/pi-dev/patch.mjs` parser advertises a Codex-style structural patch but resolves update hunks by repeatedly searching the *already modified* in-memory content. A valid later hunk can therefore lose its original context solely because an earlier hunk changed overlapping context. This has produced the same `context mismatch` fallback pattern across independent ChatGPT sessions.

The problem is broader than one matcher bug: the active routing contract encourages the model to translate ordinary existing-file edits into a patch grammar even though Edit V2 already provides a structured, guarded multi-file mutation primitive.

### Target mutation ontology

```text
Need to inspect exact text
        -> read / rg / Code

Existing text file change
        -> edit
           exact oldText precondition
           one or many edits
           one or many files

Syntax-shaped search / codemod
        -> ast-grep via Bash
           usually locate first -> edit
           direct --update-all only for bounded deterministic bulk rewrite

Create new text file
        -> write

Move or delete existing regular file
        -> file_ops
           move: same filesystem only, preserve inode via link + guarded unlink
           delete: guarded unlink of the requested non-symlink entry

Existing authoritative .patch/.diff artifact
        -> Bash: git apply --check -- "$patch" && git apply -- "$patch"

Persistent / interactive command
        -> Terminal
```

There is deliberately no catch-all `structural -> apply_patch` branch.

### Why not add versioned/range edits now

The existing exact replacement contract already has a useful collaborative property: unrelated user changes elsewhere in the file can survive while the targeted exact `oldText` remains a valid precondition. A mandatory whole-file revision token would reject such harmless concurrent work. Range/column coordinates would also add model translation burden without evidence that they solve a current failure class better than exact replacement plus unique context.

Keep range/version editing as a future option only if real stale-region incidents remain after the routing migration.

### Structural tooling boundary

- **ast-grep 0.45.0** is already a required and installed personal toolbox CLI. Use it for syntax-shaped matching and direct AST-aware rewrites where a compact pattern/rewrite pair expresses the migration.
- For ordinary refactors, prefer ast-grep as a locator and keep the final write behind guarded `edit`. Use ast-grep's in-place rewrite only for a bounded deterministic codemod where every match is intentionally changed.
- Semgrep remains a useful future semantic/security/policy tool, but installing or pinning it does not protect the `apply_patch` removal and is therefore deferred from this migration.

## Final Personal Dev Surface

The personal Dev catalog remains seven tools; one tool is replaced rather than added:

```text
read
edit
write
file_ops
wait
bash
pc_sleep
```

`restricted` and `trusted-dev` remain unchanged except for any emulator-neutral/shared wording that must stop recommending a tool they do not expose.

## `file_ops` Contract

Use one small batch schema:

```json
{
  "operations": [
    { "kind": "move", "path": "old/name.txt", "to": "new/name.txt" },
    { "kind": "delete", "path": "obsolete.txt" }
  ],
  "cwd": "/optional/base"
}
```

Rules:

- personal/user path mode only;
- `operations` is non-empty;
- supported `kind` values are exactly `move` and `delete`;
- sources are regular files and may be text or binary;
- source resolution is topology-preserving: canonicalize/authorize the parent directory, construct the final requested entry, open/inspect it without following a final-component symlink, and reject symlinks or non-regular files;
- never call `resolveUserPath()` and then unlink/move its `realpath()` result for `file_ops`; that helper's final-component dereference is appropriate for content access, not topology identity;
- obtain preflight identity/staleness evidence from the same `O_RDONLY|O_NOFOLLOW` file handle where possible: device/inode plus size/mtime/ctime metadata; do not read the whole file merely to perform topology work;
- every move destination parent already exists and is canonicalized/authorized before constructing the destination entry;
- every move destination must be absent at preflight and mutation time; an existing file, directory, or symlink is a conflict and is never overwritten;
- sources/destinations that resolve to the same claimed entry path or create an intra-batch dependency are rejected rather than sequenced implicitly;
- all affected entry paths are coordinated through the existing mutation coordinator, but that coordinator is only a cooperating-Dev serialization mechanism, not a kernel CAS guarantee against arbitrary Bash/Python/editor processes;
- after acquiring the mutation lease, reopen/revalidate the source with `O_NOFOLLOW` before destructive work. A final-component symlink substitution while queued must be rejected and its referent left untouched;
- move is same-filesystem only: use a no-overwrite hard-link creation (`fs.link`/equivalent) from source to destination, verify the destination refers to the expected source inode, revalidate the source entry, then unlink the source name. This preserves the underlying file object (contents, ownership, mode, xattrs/ACLs where supported by the filesystem) rather than recreating it, while link count/ctime and parent-directory timestamps may naturally change as part of link/unlink;
- `EXDEV` is an explicit unsupported-cross-filesystem result in this wave; do not copy bytes or reconstruct metadata as a fallback;
- after the destination link exists, cancellation does not intentionally interrupt the move between link creation and guarded source unlink. Finish the critical sequence if guards still pass; honor cancellation while queued, before an operation starts, or between batch operations;
- if link creation succeeds but a later guard or source unlink fails, return structured `FILE_OPS_PARTIAL` state; never claim the move was atomic or fully complete;
- a delete revalidates the same requested non-symlink entry immediately before unlink and never recursively deletes directories;
- path-based unlink still has an unavoidable final race against arbitrary external entry replacement. Document the same cooperative/stale-state threat model as Edit V2 rather than claiming compare-and-swap semantics;
- success output stays compact and path-oriented;
- no fuzzy path recovery, symlink dereference, implicit parent creation, overwrite behavior, or automatic cross-filesystem relocation.

## Genuine Patch Artifact Lane

A user-provided or otherwise authoritative unified patch is not translated into the custom MCP grammar. Apply it through native Git in one bounded Bash command from the intended repository root:

```bash
git apply --check -- "$patch" && git apply -- "$patch"
```

Default policy:

- no `--3way` unless the user explicitly requests merge-style conflict recovery;
- no `--unsafe-paths`;
- no `--index` unless the task explicitly intends staged-index mutation;
- a failed `--check` leaves the worktree unchanged;
- a model must not manufacture a patch file for an ordinary edit just to enter this lane.

## File Ownership Map

### Production mutation surface

- `providers/pi-dev/file-ops.mjs` — new narrow owner for personal move/delete preflight, topology-preserving path-entry handling, same-filesystem hard-link moves, cooperative locking, guarded execution, and structured partial-state production.
- `providers/pi-dev/boundary.mjs` — modify only if the cleanest narrow implementation is a reusable final-component-preserving path-entry resolver; reuse existing root/path authority but do not reuse final-component `realpath()` semantics for destructive topology.
- `providers/pi-dev/server.mjs` — remove `apply_patch`; register personal-only `file_ops`; make `edit` the primary existing-text mutation description; point creation/topology wording at `write`/`file_ops`.
- `providers/pi-dev/render.mjs` — replace patch-result rendering with compact `file_ops` success/partial rendering if rendering is kept separate from the new module.
- `providers/pi-dev/patch.mjs` — delete after all active callers are migrated.
- `providers/pi-dev/files.mjs` — expected unchanged; current Edit V2 and Write behavior are reused.
- `providers/pi-dev/mutation-coordinator.mjs` — expected unchanged; reuse `withMutationPaths` rather than introducing a second lock system.

### Existing contract tests required by the repository gate

- `providers/pi-dev/test/patch.test.mjs` — retire with the deleted patch backend; replace it with a focused `file-ops.test.mjs` that preserves only destructive-topology invariants: initial and post-preflight final-component symlink rejection, replaced-inode conflict, zero-mutation batch preflight, destination race/no-overwrite, same-filesystem move preserving inode identity, explicit `EXDEV` rejection, concurrent `edit` versus `delete`, cancellation while queued for a mutation lease, and structured move partial state.
- `providers/pi-dev/test/server.test.mjs` — replace personal catalog/schema assertions from `apply_patch` to `file_ops`; remove patch-grammar expectations.
- `providers/pi-dev/test/render.test.mjs` — replace patch rendering assertions with `file_ops` output assertions where the renderer owns that output.
- Do not add a parallel new test framework, preserve obsolete parser/hunk tests as compatibility tests, or carry historical stress loops that do not add distinct evidence.

### Active agent routing context

- `skills/mcp-harness-router/SKILL.md` — replace `edit versus apply_patch` routing with the final mutation ontology; keep ast-grep as the syntax-shaped discovery/codemod CLI without turning the Skill into an implementation methodology document.
- `skills/superpowers-web-adapter/SKILL.md` — remove the stale example that names `edit versus apply_patch`; keep workflow ownership unchanged.
- `skills/SNAPSHOT_SHA256.txt` — refresh only the checksums for changed active Skill files/assets.

### Current normative docs

- `README.md` — personal Dev catalog and one-line mutation roles.
- `providers/README.md` — provider capability/catalog wording; remove current `apply_patch`/patching language.
- `docs/architecture.md` — replace the patch ontology with edit/file_ops/Bash structural backends.
- `docs/configuration.md` — personal tool catalog naming only; no new profile trust domain.
- `docs/personal/harness.md` — detailed tool selection and examples.
- `docs/security.md` — document `file_ops` topology guarantees, cooperative locking boundary, final path-race limitation, symlink rejection, and partial-state semantics alongside Edit V2.
- `docs/development.md` — repository layout wording (`Files/Bash/file-ops/wait` rather than patch owner) if still current at implementation time.

Historical files under `docs/history/**` remain untouched.

## Implementation sequencing / isolation

The current checkout has active Browser/Terminal work that overlaps normative files this migration must also touch, including `README.md`, `docs/architecture.md`, `docs/configuration.md`, `docs/personal/harness.md`, and `skills/SNAPSHOT_SHA256.txt`.

- Do not start the mutation-stack implementation in the current checkout until that overlapping wave is committed or otherwise reconciled into the intended foundation.
- Do not create a worktree merely to bypass those uncommitted prerequisite changes; a worktree from an older `HEAD` would increase reconciliation work.
- If this migration must proceed concurrently, first establish a commit containing the intended Browser/Terminal foundation, then create a dedicated worktree from that commit.
- Re-check `git status` immediately before implementation because the overlap set may change.

---

### Task 1: Provider migration — replace patching with guarded topology operations

**Files:**
- Create: `providers/pi-dev/file-ops.mjs`
- Modify only if needed for one narrow topology-preserving resolver: `providers/pi-dev/boundary.mjs`
- Modify: `providers/pi-dev/server.mjs`
- Modify: `providers/pi-dev/render.mjs`
- Delete: `providers/pi-dev/patch.mjs`
- Replace/prune: `providers/pi-dev/test/patch.test.mjs` -> `providers/pi-dev/test/file-ops.test.mjs`
- Modify only stale provider-contract assertions: `providers/pi-dev/test/server.test.mjs`, `providers/pi-dev/test/render.test.mjs`
- Expected unchanged: `providers/pi-dev/files.mjs`, `providers/pi-dev/mutation-coordinator.mjs`

**Interfaces:**
- Consumes: existing user-path authority checks where their semantics fit; `withMutationPaths`; Edit V2's structured partial-state pattern.
- Produces: personal-only `file_ops({operations,cwd?})` for regular-file `move|delete`; structured `FILE_OPS_PARTIAL`; no `apply_patch` registration/backend.

**Steps:**

- [ ] Implement one topology-preserving source resolver that canonicalizes/authorizes the parent but does not `realpath()` the final component. Open the final entry with `O_RDONLY|O_NOFOLLOW`, require a regular file, and take device/inode plus size/mtime/ctime evidence from that same handle. Do not decode or snapshot whole-file bytes.
- [ ] Preflight the complete batch before first mutation: reject symlinks/non-files, duplicate or dependent source/destination entry paths, missing destination parents, pre-existing destinations, and obvious source/destination filesystem mismatches. Treat regular binary files exactly like regular text files.
- [ ] Coordinate all affected entry paths through `withMutationPaths`, but after the lease is granted reopen/revalidate each source with `O_NOFOLLOW`. If a source was replaced by a symlink while queued, reject it before mutation and leave the symlink referent untouched.
- [ ] Implement same-filesystem move with hard-link semantics: create the destination with `fs.link`/equivalent so an existing destination is never overwritten; map `EXDEV` to an explicit unsupported-cross-filesystem result; verify the destination's device/inode matches the expected source; revalidate the source entry; then unlink the source name.
- [ ] Once a move has successfully created its destination link, do not deliberately abort the critical sequence because cancellation arrives. Continue through guarded source revalidation/unlink when safe. Honor cancellation while queued, before an operation starts, and between batch operations.
- [ ] Implement delete as guarded unlink of the requested non-symlink regular-file entry after final source revalidation. Do not claim kernel-level compare-and-swap against arbitrary external writers; the unavoidable final pathname race remains part of the documented threat model.
- [ ] Define `FILE_OPS_PARTIAL` explicitly. Its structured details contain fully `completed` operations, known `failed` operations, `uncertain` operations with confirmed side effects where available (for example destination link created/source retained), and `unattempted` operations. Render this compactly without collapsing it to an ad hoc prose-only error.
- [ ] Register `file_ops` only in personal/user path mode and keep the personal Dev tool count unchanged. Remove `runPatch`, the `apply_patch` schema/registration, patch rendering, and `providers/pi-dev/patch.mjs` in the same migration wave; do not leave a compatibility alias.
- [ ] Replace obsolete patch tests with the smallest strong topology set required by the provider contract: initial symlink rejection; symlink substitution after preflight/while queued; replaced-inode conflict; invalid batch member gives zero mutation; destination race/no-overwrite; same-filesystem move preserves inode identity; `EXDEV` rejects without copying; concurrent `edit` versus `delete`; queued cancellation never executes later; post-link failure yields structured partial state. Remove parser/hunk tests and redundant historical stress loops.

**Acceptance criteria:**

- Personal Dev lists exactly `read`, `edit`, `write`, `file_ops`, `wait`, `bash`, and `pc_sleep`; non-personal profiles do not gain `file_ops`.
- `file_ops` accepts regular binary or text files but never follows a final-component symlink.
- Same-filesystem move preserves the underlying source inode/file object by adding the destination link and removing the source name; it does not promise unchanged link count/ctime or directory timestamps, and no destination is overwritten.
- Cross-filesystem move returns an explicit unsupported/`EXDEV` result and never falls back to copying.
- A symlink substituted after preflight cannot redirect move/delete to its referent.
- Cancellation does not intentionally manufacture a half-move after destination-link creation.
- Partial outcomes are exposed through structured `FILE_OPS_PARTIAL` details.
- No production import, registration, schema, renderer, or parser for `apply_patch` remains.

---

### Task 2: Surface migration — make the final mutation ontology authoritative everywhere

**Files:**
- Modify: `providers/pi-dev/server.mjs`
- Modify: `skills/mcp-harness-router/SKILL.md`
- Modify: `skills/superpowers-web-adapter/SKILL.md`
- Modify: `skills/SNAPSHOT_SHA256.txt`
- Modify: `README.md`
- Modify: `providers/README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/configuration.md`
- Modify: `docs/personal/harness.md`
- Modify: `docs/security.md`
- Modify: `docs/development.md` only where current repository-layout wording still names the patch owner

**Interfaces:**
- Consumes: final Task 1 tool names/semantics; existing Edit V2 contract; Dev Bash; native Git; ast-grep 0.45.0.
- Produces: one repository-side routing/documentation contract with no active instruction to manufacture custom patch grammar.

**Steps:**

- [ ] Rewrite the `edit` description so it is the primary existing-text mutation primitive across one or many files. Keep its current schema/implementation; do not add fuzzy matching, ranges, revisions, or another edit mode. Direct callers to inspect exact source with `read`, `rg`, Code, or ast-grep and widen `oldText` until unique when necessary.
- [ ] Rewrite `write` so it owns new text-file creation and points regular-file move/delete to `file_ops`. Keep Bash generic rather than embedding structural workflow policy in its tool description.
- [ ] Update `mcp-harness-router` to route by semantics:

  ```text
  focused text inspection -> read
  existing-text mutation -> edit
  syntax-shaped discovery/codemod -> ast-grep via Bash
  create text file -> write
  move/delete regular file -> file_ops
  existing authoritative unified patch -> Bash: git apply --check -- "$patch" && git apply -- "$patch"
  bounded ordinary command -> Bash
  persistent/interactive -> Terminal
  ```

- [ ] Remove `contextual or structural -> apply_patch`, remove any file-count-based edit/patch distinction, and keep ast-grep guidance narrow: inspect bounded matches and normally write through guarded `edit`; use bulk rewrite only when every bounded match is intentionally transformed.
- [ ] Keep genuine patch artifacts separate from model-authored edits. For an existing authoritative `.patch`/`.diff`, use `git apply --check -- "$patch" && git apply -- "$patch"`; keep `--3way` opt-in only when the user explicitly requests merge-style recovery; never fall back to GNU fuzz/custom fuzzy matching automatically.
- [ ] Update the Superpowers adapter primitive-selection example, refresh only changed Skill snapshot checksums, and validate the modified Skill bundles using the repository's existing Skill validation process.
- [ ] Update all current normative catalogs/docs, including `providers/README.md`, to list `file_ops` instead of `apply_patch`; leave intentional history/control qualification artifacts untouched.
- [ ] Extend `docs/security.md` with the exact `file_ops` contract: final-component symlinks rejected; same-filesystem hard-link move; structured partials; cooperative Dev serialization/stale-state guards; no claim of CAS/serialization against arbitrary Bash/Python/editor actors; unavoidable final pathname unlink race.
- [ ] Keep `docs/history/**` and historical edit-v2 control machinery unchanged unless a current normative reference incorrectly points readers to it as active behavior.

**Acceptance criteria:**

- The tracked routing Skills contain no active `structural -> apply_patch` instruction.
- `README.md`, `providers/README.md`, architecture/configuration/personal-harness docs, and provider descriptions agree on the same personal Dev catalog and mutation ontology.
- `docs/security.md` accurately states both the guarantees and the arbitrary-external-writer limitation of `file_ops`.
- Routine model-authored existing-file changes route to `edit`; actual patch artifacts route to Git; ast-grep stays behind Bash.
- Repository Skill bundles/checksums are valid, but repository modification alone is not claimed to update ChatGPT's installed Skills.

---

### Task 3: Verification and rollout — prove source, runtime, and installed-Skill state separately

**Files:**
- No new production files expected beyond Tasks 1-2.
- Generated live personal config remains generated state; do not hand-edit it.
- ChatGPT installed Skills are an external deployment state, not a repository file mutation.

**Interfaces:**
- Consumes: candidate-final source/docs/Skill snapshot; current `docs/development.md` Full verification contract; current 1MCP supervised-backend lifecycle; repository Skill bundles.
- Produces: verified repository candidate, live Dev catalog with `file_ops`, and an explicitly activated fresh-session ChatGPT routing contract.

**Steps:**

- [ ] Before verification, inspect `git status`, the final diff, and active `apply_patch` references while excluding intentional history/control artifacts. Preserve unrelated dirty work and confirm the Browser/Terminal foundation this plan depends on has been reconciled.
- [ ] Run the **current** Full verification section from `docs/development.md` without copying its commands into this plan. Do this before live activation. If source changes after a failed live acceptance, that creates a new candidate-final state and the current Full verification section must pass again before redeployment.
- [ ] Only after the repository gate is green, activate provider source. A real `mcp.json` definition change may use normal 1MCP config hot reload; an unchanged Dev entry does not reload changed provider source. Prefer a named `1mcp mcp restart dev` through the already-qualified live Runtime Target Context; if that admin context is unavailable, restart `mcp-dev-bridge.service` as the smallest reliable fallback. Never restart the tmux lifetime service or Terminal broker for this change.
- [ ] Confirm a fresh live Dev tool listing exposes exactly the intended personal catalog and that non-personal profiles have not expanded.
- [ ] Deploy the modified `mcp-harness-router` and `superpowers-web-adapter` bundles to ChatGPT explicitly through the supported Skills UI/update flow described by `skills/README.md`; repository files/checksums alone do not activate them. If the implementation environment cannot perform that UI step, report **ChatGPT Skill activation pending** and do not claim the full migration complete.
- [ ] Start a fresh ChatGPT session after Skill activation and confirm routine structural/existing-text work selects `edit`/ast-grep as designed, move/delete selects `file_ops`, and no installed routing instruction requests custom `apply_patch` grammar.

**Acceptance criteria:**

- The current repository Full verification section passes for the exact source state that is deployed.
- `apply_patch` is absent from the live personal Dev schema and `file_ops` is present only where intended.
- The live Dev child is demonstrably running the new provider source rather than relying on an unchanged-config rewrite.
- The updated Skills are actually installed/activated in ChatGPT, not merely edited in the repository.
- A fresh ChatGPT session follows the new routing contract.
- If Skill UI deployment cannot be completed, provider/source rollout may be reported complete but overall migration status remains `ChatGPT Skill activation pending`.

## Rollback

Rollback is a coordinated tool-contract rollback, not a compatibility mode.

If the migration must be reverted before merge, revert the provider/source, tracked Skill snapshot, and normative-doc wave together so the previous `apply_patch` schema/backend/routing contract returns as one consistent state. Do not leave `file_ops` and `apply_patch` both exposed indefinitely.

After live activation, if a blocking defect is found in `file_ops`, prefer fixing/reverting the provider and active routing contract together. If the new ChatGPT Skills were already installed, update/reinstall the corresponding previous Skill bundles as part of the rollback; repository rollback alone does not change installed-Skill state. Existing tmux/Terminal process state is unrelated and must not be restarted as part of rollback.

## Failure / Recovery Matrix

| Failure | Required behavior |
| --- | --- |
| `edit.oldText` missing | reject; reread current source |
| `edit.oldText` ambiguous | reject; widen exact old block or use structural query to locate intended region |
| structural query returns many unintended matches | do not bulk rewrite; narrow query/scope |
| ast-grep unavailable | toolbox defect because ast-grep remains required |
| ast-grep deterministic rewrite scope uncertain | locate only, then mutate through guarded `edit` |
| `file_ops` source is initially a final-component symlink | reject the requested entry; never move/delete its referent |
| source becomes a symlink or different inode while queued/after preflight | final `O_NOFOLLOW`/identity revalidation rejects before intended destructive mutation; never follow the replacement |
| `file_ops` destination exists or appears before link creation | reject; never overwrite |
| move crosses filesystems / `fs.link` returns `EXDEV` | reject as unsupported in this wave; do not copy or reconstruct metadata |
| destination link is created but later source guard/unlink fails | throw structured `FILE_OPS_PARTIAL`; report completed prior operations, the current uncertain operation and confirmed side effects, plus unattempted remainder |
| cancellation arrives while queued or before an operation | abort with no later mutation for that operation |
| cancellation arrives after destination link creation | do not intentionally stop between link and guarded source unlink; complete the critical sequence when guards still pass |
| arbitrary external process replaces an entry after the final path check | outside the cooperative CAS guarantee; never claim impossible atomicity, and require reread/reconciliation after any suspicious/partial result |
| candidate fails current `docs/development.md` Full verification | do not activate provider source or Skills; fix and rerun the current gate on the new candidate |
| Dev source changed but running child still serves old schema | restart only the named `dev` backend when the live 1MCP admin context is available; otherwise restart the bridge, never tmux/broker |
| tracked Skill files changed but ChatGPT still follows old routing | install/update the bundles through the Skills UI and start a fresh session; repository synchronization alone is insufficient |
| user-supplied patch fails `git apply --check -- "$patch"` | leave worktree unchanged and report Git diagnostic |
| patch would require `--3way`/fuzz | stop unless user explicitly requests merge-style recovery |
| active session still caches `apply_patch` schema after rollout | refresh/reconnect the tool catalog; do not add a backend alias solely for a stale session |

## Non-goals / Deferred Work

Do not include these in the first implementation:

- LSP-style line/column edit ranges;
- whole-file revision tokens or optimistic version numbers;
- fuzzy text matching or Levenshtein/Bitap relocation;
- automatic three-way merges for model-authored edits;
- a generic codemod MCP server;
- Semgrep CLI installation/version qualification/toolbox wiring;
- Semgrep MCP integration;
- an ast-grep MCP integration;
- arbitrary filesystem `file_ops` beyond move/delete;
- directory tree moves/deletes;
- cross-filesystem move/copy fallback or metadata-reconstruction semantics;
- native-addon/syscall work solely to expose `renameat2(RENAME_NOREPLACE)`;
- an undo/transaction journal across multiple files;
- cross-process serialization or kernel-CAS guarantees against arbitrary editors/Bash/Python outside the cooperative Dev mutation coordinator;
- rewriting historical benchmark documents to pretend the old patch experiment never existed.

Add any of these only after the final stack shows a concrete failure class that the current exact-edit/file-ops/structural-query architecture cannot handle cleanly.

## Implementation Stop Conditions

Stop and reassess rather than expanding scope if:

1. a separately deployed/external consumer is discovered that requires the current `apply_patch` MCP schema and cannot migrate in the same wave;
2. implementing move/delete safely appears to require changing existing content-path semantics or mutation-coordinator behavior rather than adding a narrow topology-preserving path-entry resolver;
3. a real requirement appears for cross-filesystem `file_ops.move`, copy semantics, directory topology, or stronger kernel-atomic no-replace guarantees; settle that contract separately instead of expanding this wave;
4. a structural workflow appears to require an always-on ast-grep/codemod MCP surface rather than bounded Bash use;
5. a model-generated edit appears to need fuzzy/three-way application to succeed rather than rereading the authoritative source;
6. current dirty work overlaps the same production regions in a way that cannot be reconciled without risking unrelated user changes.

## Final Acceptance Criteria

The migration is complete when all of the following are true:

- Personal Dev still has seven tools, with `file_ops` replacing `apply_patch`.
- `edit` is the documented and routed default for existing text mutation across one or many files.
- New text files use `write`; regular-file move/delete uses `file_ops`.
- Same-filesystem move preserves inode identity through hard-link creation plus guarded source unlink; `EXDEV` is rejected without copy fallback.
- `file_ops` is binary-safe, rejects final-component symlinks, exposes structured `FILE_OPS_PARTIAL`, and documents its cooperative/stale-state rather than arbitrary-writer CAS guarantees.
- The custom patch grammar/parser/backend is deleted rather than hidden behind a compatibility alias.
- ast-grep remains the required syntax structural engine and does not add a new MCP domain.
- Semgrep qualification/install work is absent from this migration and remains a separate toolbox enhancement.
- Routine model-authored changes do not enter a patch pipeline.
- Existing authoritative unified patch artifacts use native `git apply --check -- "$patch" && git apply -- "$patch"`.
- Active tracked routing Skills and current normative docs contain no stale `structural -> apply_patch` instruction; `providers/README.md` and `docs/security.md` are included in that migration.
- The current `docs/development.md` Full verification section passes for the exact source state before that state is activated.
- The live Dev backend is restarted/reloaded through the correct boundary and exposes the new catalog.
- The updated ChatGPT Skills are actually installed/activated and a fresh session follows the new routing contract; otherwise overall status remains `ChatGPT Skill activation pending`.
- Historical apply-patch experiments remain under `docs/history/**` or explicit control/qualification machinery only as chronology/evidence.
- Unrelated dirty work is preserved.

## Research References

- Node.js filesystem API (`fs.link`/`fsPromises.link`): <https://nodejs.org/api/fs.html>
- Linux `link(2)` hard-link / `EXDEV` semantics: <https://man7.org/linux/man-pages/man2/link.2.html>
- ast-grep rewrite documentation: <https://ast-grep.github.io/guide/rewrite-code.html>
- Git `apply` documentation: <https://git-scm.com/docs/git-apply>
