# Agent B — Mutation Provider Migration

**Repository:** `/home/hamza/repo/websession_mcp_bridge`
**Artifact type:** executable behavior
**Workspace:** `/home/hamza/repo/websession_mcp_bridge-agent-b-mutation`
**Isolation reason:** concurrent writable mission; this branch owns Pi Dev provider/tests while Agent A owns Terminal/config/docs/router targets
**Can start:** immediately
**Depends on:** clean Browser foundation `43decaf`; coordination package commit present in this worktree
**Execution lifetime:** ordinary
**Wake strategy:** none by default
**Developer visibility:** headless; no live provider activation in this mission

## Read first

- `docs/superpowers/plans/2026-08-24-robust-agent-mutation-stack.md` — authoritative requirements; execute Task 1 only
- `docs/superpowers/agent-plans/2026-08-24-dual-mutation-terminal/README.md` — ownership, dependencies, and integration boundary
- current `providers/pi-dev/files.mjs`, `boundary.mjs`, `mutation-coordinator.mjs`, `patch.mjs`, `server.mjs`, `render.mjs` and focused provider tests — implementation evidence

Read the actual code path before changing it. Apply Ponytail/Causal Coding discipline: reuse Edit V2 and the coordinator, delete the custom patch backend, and implement only the narrow regular-file topology contract in the source plan.

## Objective

Implement Mutation Plan Task 1: replace the personal `apply_patch` production surface with the narrow personal-only `file_ops({operations,cwd?})` provider path for regular-file same-filesystem move/delete, while preserving public/workspace authority boundaries and leaving Edit V2, Write, and the mutation coordinator semantics intact.

This Wave 1 mission owns provider behavior and provider tests only. Do not edit routing Skills or normative docs; those depend on Agent A's Terminal surface changes and will be materialized after branch integration.

## Current state

- `apply_patch` currently owns update/add/delete/move through `providers/pi-dev/patch.mjs` and is registered only in personal user-path mode.
- Edit V2 already owns guarded exact multi-target text mutation and cooperating Dev serialization.
- `resolveUserPath()` dereferences the final component and therefore is not suitable as the destructive topology identity for `file_ops`.
- The updated source plan requires binary-safe regular-file topology operations, same-filesystem hard-link move, explicit `EXDEV`, symlink rejection including replacement while queued, structured `FILE_OPS_PARTIAL`, and no custom patch compatibility alias.
- Agent A concurrently edits Terminal/config/docs/router files, not `providers/pi-dev/**`.

## Ownership

You own Mutation Plan Task 1 behavior/files, including:

- new `providers/pi-dev/file-ops.mjs`;
- a narrow topology-preserving boundary helper only if current evidence shows it is the cleanest reuse point;
- personal `file_ops` registration and removal of `apply_patch` production registration/imports;
- removal of `providers/pi-dev/patch.mjs` after active production callers are gone;
- compact `file_ops` success/partial rendering where the existing renderer owns model-facing output;
- replacement/pruning of the existing patch tests into the focused file-ops contract suite and stale server/render provider assertions required by the source plan.

Neighboring mission ownership:

- Agent A owns Terminal/config/docs/router files and `skills/SNAPSHOT_SHA256.txt` in Wave 1.
- Do not edit `skills/**`, README/docs catalogs, or mutation routing guidance in this mission.
- Later integration owns Mutation Plan Task 2 and rollout.

## Coordination contract

Keep these boundaries stable:

- no new text-edit mode; leave Edit V2 implementation/schema unchanged unless direct evidence proves a source-plan invariant is already broken;
- do not redesign `withMutationPaths`; it remains cooperative serialization, not arbitrary-process CAS;
- `file_ops` is personal/user-path only and supports exactly `move` and `delete` for existing regular files, text or binary;
- final-component symlinks are rejected and never dereferenced for destructive topology;
- move is same-filesystem hard-link + guarded unlink, preserving inode identity; `EXDEV` is unsupported with no copy fallback;
- no overwrite, directory operations, mkdir/copy/chmod/symlink framework, fuzzy path recovery, or compatibility `apply_patch` alias;
- once destination link exists, cancellation must not intentionally manufacture a half-move if guards permit completion;
- post-link failure is structured `FILE_OPS_PARTIAL`, not silent success or prose-only ambiguity.

If the safe implementation appears to require mutation-coordinator redesign, directory operations, native `renameat2` work, copy fallback, or stronger arbitrary-process CAS guarantees, stop expansion and report `needs decision` under the source plan stop conditions.

## Success conditions

- Personal provider exposes `file_ops` instead of `apply_patch`; non-personal profiles do not gain it.
- `file_ops` rejects initial/final-component symlinks and a symlink/inode substitution after preflight cannot redirect destructive work to a referent.
- Batch preflight rejects invalid/dependent/conflicting entries before first mutation.
- Move never overwrites an existing/racing destination, preserves the source inode through hard-link creation, and rejects `EXDEV` without copy fallback.
- Delete performs guarded unlink of the requested regular-file entry.
- Cancellation while queued/before an operation prevents later mutation; cancellation after destination-link creation does not intentionally stop the guarded critical sequence.
- Partial state is structured with completed/failed/uncertain/unattempted information as required by the plan.
- `providers/pi-dev/patch.mjs` and production patch registration/rendering are removed with no compatibility alias.
- Existing Edit V2/Write/coordinator source remains unchanged unless a demonstrated requirement forces a minimal adjustment.
- Branch contains a coherent commit (or small coherent commits) limited to this mission.

## Required validation

Testing is explicitly authorized by the source plan. Keep it focused:

- update the existing provider tests required by Mutation Plan Task 1, without adding a new framework or redundant historical stress loops;
- run `(cd providers/pi-dev && npm test)` on the final mission state;
- run `git diff --check` for this branch.

If the fresh worktree lacks ignored provider dependencies, install only the pinned Pi Dev dependency tree required for the mandated provider suite, following `docs/development.md`.

Do **not** run the repository-wide Full verification gate; the integrated candidate owns that after the shared mutation surface is complete.

## Out of scope

- Mutation Plan Task 2 routing/docs/Skill migration;
- Mutation Plan Task 3 live Dev activation/ChatGPT Skill installation;
- Terminal presentation work;
- cross-filesystem moves/copy fallback;
- directory topology operations;
- fuzzy/range/version editing;
- ast-grep MCP/Semgrep integration;
- historical docs/qualification rewrites.

## Working style

Trace the current patch move/delete guards and Edit V2 partial/identity patterns, then make the smallest complete replacement. Prefer Node stdlib and existing helpers. Avoid a generic filesystem abstraction or plugin layer. Honor the source plan's required provider tests, but do not add unrelated cleanup or hardening.

Commit your mission changes on the assigned branch when complete. Do not merge to `main`.

## Finish report

Return:
1. status: complete / blocked / needs decision;
2. branch/worktree and commit(s);
3. concise provider behavior/interface summary;
4. required validation run and results;
5. anything integration or the later mutation surface mission needs to know;
6. unresolved risks, deviations, or decisions needed.
