# Personal Files CAS Trigger Follow-up Design

Date: 2026-08-15

Status: **trigger fired; design only; no CAS implementation in Task 12**

## Decision

Task 12 produced repeated real `SILENT_LOST_UPDATE` behavior in the current personal Files mutation surface. The evidence is sufficient to open a focused consistency/CAS follow-up. It is **not** permission to add hash fields to every Files schema or to make multi-file patching transactional.

The smallest proven defect is an atomicity gap in the existing implicit snapshot precondition: `apply_patch` checks a preflight snapshot and then mutates the file in a separate asynchronous filesystem operation. Two same-path mutations can both approve the same snapshot before either mutation is visible, both report success, and then overwrite or resurrect one another.

The focused follow-up should first make the existing snapshot precondition atomic for cooperating Files mutations. A model-visible content hash is not the first implementation step because a hash checked with the same non-atomic check-then-write sequence would reproduce the same race.

## Concrete trigger evidence

All stress cases below used the real exported personal primitives with `pathMode: user` on real temporary files. They did not mock mutation success.

| Race | Iterations | Result |
|---|---:|---|
| two exact edits, same exact region | 50 | 50 `SAFE_CONFLICT` |
| stale exact edit after another actor changes the region | 1 | `SAFE_CONFLICT` |
| overlapping `apply_patch`, same region | 50 | **50 `SILENT_LOST_UPDATE`** |
| disjoint `apply_patch` changes, same file | 50 | **50 `SILENT_LOST_UPDATE`** |
| `apply_patch` vs exact edit, same file | 50 | **50 `SILENT_LOST_UPDATE`** |
| create/create | 30 | 30 `SAFE_CONFLICT` |
| two moves racing for one destination | 30 | 30 `SAFE_CONFLICT` |
| delete/update from one snapshot | 50 | **50 `SILENT_LOST_UPDATE`** |
| multi-file patch, later precondition stale | 1 | `PARTIAL_APPLICATION`, explicit `PATCH_PARTIAL` |
| independent edits in different files | 30 | 30 safe independent successes |
| concurrent edit/patch/write on disjoint paths | 30 | 30 safe independent successes |
| edit snapshot followed by native Bash mutation before write | 1 | `SAFE_CONFLICT` |

The same silent-loss classes were reproduced in a preliminary independent probe at 80/80 for disjoint patch/patch and 80/80 for patch/edit.

### Minimal real failure shape

Two actors start from:

```text
alpha
...
omega
```

Actor A runs a personal `apply_patch` changing `alpha -> ALPHA` while actor B concurrently runs a personal `apply_patch` changing `omega -> OMEGA`.

Observed repeatedly:

```text
actor A result  fulfilled
actor B result  fulfilled
final file      contains only one actor's valid change
```

This is not a normal conflict and not partial-application reporting. Both callers receive success while one completed change disappears.

A patch-versus-edit race reproduced the same class: both calls fulfilled, but the final file retained only one actor's valid disjoint change.

A delete/update race was more severe: both patch calls fulfilled and an update could recreate a path whose concurrent delete had also reported success.

## Root cause

`preflightPatch()` captures whole-file `before` bytes and computes a whole-file `after` buffer. `applyPatchPlan()` later performs:

```text
read current bytes
compare current == before
return from snapshot check
write/unlink using precomputed after
```

The compare and mutation are not one critical section. There is no shared canonical-path mutation coordinator across `apply_patch` and `edit`.

A deterministic instrumentation trace forced only the timing, not the result semantics:

```text
A: snapshot read original bytes
B: snapshot read original bytes
A: snapshot accepted
B: snapshot accepted
A: write precomputed A bytes
B: write precomputed B bytes
A/B: both fulfilled
final: one full-file result survives
```

This trace matches the unsimulated stress result and identifies the check-to-mutate window as the defect source.

## What is already sufficient

The existing guards remain valuable and should not be removed:

- exact `edit` rejects missing or ambiguous anchors;
- stale edit snapshots reject changes observed before the final snapshot check;
- `write` uses exclusive create (`wx`), so create/create has one winner and one explicit conflict;
- patch Add uses exclusive create;
- Move destination creation is exclusive and destination races reject safely;
- patch snapshot checks reject changes that become visible before the check;
- multi-file patching already reports explicit `PATCH_PARTIAL` once an earlier mutation has committed and a later operation fails;
- disjoint canonical paths can mutate concurrently without interference.

The problem is therefore not “conflicts exist.” It is that same-path checks are not atomic with their corresponding mutation.

## Approaches considered

### A. Add model-visible hashes only

Example shape: add `expected_sha256` to `edit`/`apply_patch` and compare it before writing.

**Reject as a standalone fix.** A digest checked immediately before the existing write still has the same check-then-write race. Both actors can present the same valid digest, both can pass the comparison, and the last full-file write can still win silently.

A model-visible digest may later be useful for stale-read ergonomics, but it cannot substitute for atomic enforcement.

### B. Canonical-path mutation serialization with existing implicit snapshots

Introduce one provider-internal coordinator keyed by canonical absolute target path. For existing-file mutations, hold the target's exclusive mutation lease across the final snapshot read/compare and the write/unlink. `edit` and `apply_patch` must share the same coordinator.

For Move, lock source and destination in stable canonical-path order to avoid deadlock and hold both through destination check/create and source removal.

**Recommended first implementation step in the follow-up.** It directly addresses every reproduced same-provider silent-loss race without changing any model-visible schema.

Trade-off: an in-process coordinator protects cooperating Files operations in that provider process; arbitrary native Bash writes do not honor it.

### C. Atomic mutation enforcement plus an optional model-visible revision token

After approach B is proven, evaluate whether a compact full-file revision token materially improves real stale-read workflows. If needed, expose the token narrowly rather than adding hash fields everywhere.

Any token must be enforced inside the same mutation critical section. A token without atomic enforcement is invalid CAS.

**Do not implement this until B is measured.** The Task-12 failure proves an atomicity defect; it does not yet prove that users/models need another field once same-path Files mutations are serialized correctly.

## Focused follow-up contract

The follow-up project should satisfy these invariants before considering any model-visible hash field:

1. Same canonical path, patch/patch: either one operation rejects explicitly or both valid disjoint changes are preserved. Never both-success/one-change-lost.
2. Same canonical path, patch/edit: same invariant.
3. Same canonical path, delete/update: never both report success if the resulting state cannot represent both outcomes.
4. Same exact edit region: retain the current explicit conflict behavior.
5. Create/create: retain exclusive-create semantics.
6. Move destination races: retain exclusive destination semantics and source preservation on conflict.
7. Disjoint paths: preserve concurrency; no global mutation mutex.
8. Multi-file patch remains non-transactional. `PATCH_PARTIAL` diagnostics remain mandatory for failures after confirmed mutation.
9. Personal path semantics remain `{ pathMode: user, defaultCwd }`; no CAS-specific root/cwd/sandbox.
10. Public `restricted` and `trusted-dev` catalogs remain unchanged.
11. `edit` remains the guarded simple replacement primitive; `apply_patch` remains the structural/multi-file primitive; `write` remains create-only.

## Native Bash boundary

Native Bash is intentionally unrestricted and does not participate in an in-process Files lock. The current stale-snapshot guard correctly rejects when a native mutation becomes visible before the final comparison; Task 12 verified that case.

The focused Files CAS project must not claim universal protection against an arbitrary external writer that changes bytes after the final comparison unless it introduces a real cross-process atomic mechanism. A model-visible hash alone does not create such a mechanism.

Cross-channel Bash/File mutual exclusion is therefore a separate design decision, not a reason to weaken or delay fixing the proven same-provider race.

## Required regression suite for the follow-up

Enable the Task-12 CAS-trigger TODOs and require repeated real primitive runs for:

```text
overlapping patch/patch, same region
disjoint patch/patch, same file
patch/edit, same file
delete/update, same snapshot
```

Keep the already-green regressions for:

```text
same-region edit conflict
stale exact edit
create/create
move destination race
multi-file explicit partial application
disjoint-path concurrency
native-Bash-before-final-check stale snapshot detection
```

The follow-up is complete only when repeated runs contain zero `SILENT_LOST_UPDATE` outcomes and no public/profile contract changes.

## Ledger recommendation

```text
stronger CAS/hash
  previous: DEFERRED_WITH_TRIGGER
  Task 12:  TRIGGER_FIRED_FOCUSED_DESIGN_REQUIRED

model-visible hash fields
  status:   NOT YET APPROVED
  gate:     first prove atomic implicit snapshot enforcement;
            add a revision/hash field only if real stale-read workflows still require it
```

Task 12 stops here. No production CAS implementation or Files schema change belongs in this mission.
