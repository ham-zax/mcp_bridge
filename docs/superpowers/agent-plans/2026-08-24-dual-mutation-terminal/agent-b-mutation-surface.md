# Agent B — Mutation Surface Migration

## Mission

Make the integrated repository's active routing Skills and normative documentation agree with the final personal Dev mutation ontology introduced by Mutation Plan Task 1, while preserving Agent A's integrated Terminal frontend wording.

## Can start

Immediately, from the planner-integrated Wave 1 candidate on `main`.

## Artifact type

Mixed documentation/configuration contract work with a small provider-description synchronization if still required by the source plan.

## Ownership

This mission owns Mutation Plan Task 2 only:

- `providers/pi-dev/server.mjs`
- `skills/mcp-harness-router/SKILL.md`
- `skills/superpowers-web-adapter/SKILL.md`
- `skills/SNAPSHOT_SHA256.txt`
- `README.md`
- `providers/README.md`
- `docs/architecture.md`
- `docs/configuration.md`
- `docs/personal/harness.md`
- `docs/security.md`
- `docs/development.md` only where current repository-layout wording still names the obsolete patch owner

Preserve all integrated Terminal frontend semantics and wording unless the mutation ontology directly requires a compatible wording adjustment.

## Authoritative source

`docs/superpowers/plans/2026-08-24-robust-agent-mutation-stack.md`, Task 2.

The final personal Dev catalog is exactly:

`read`, `edit`, `write`, `file_ops`, `wait`, `bash`, `pc_sleep`.

The routing contract is semantic:

- focused text inspection -> `read`
- existing-text mutation -> `edit`
- syntax-shaped discovery/codemod -> ast-grep via Bash
- create text file -> `write`
- move/delete regular file -> `file_ops`
- existing authoritative unified patch artifact -> Bash with `git apply --check -- "$patch" && git apply -- "$patch"`
- bounded ordinary command -> Bash
- persistent/interactive work -> Terminal

Routine model-authored changes must not route to custom patch grammar. Do not add fuzzy matching, another edit mode, a compatibility `apply_patch` alias, or an always-on ast-grep MCP surface.

## Coordination boundary

Wave 1 is already integrated. In particular, Agent A changed shared Terminal-facing files including `skills/mcp-harness-router/SKILL.md`, `skills/SNAPSHOT_SHA256.txt`, `docs/architecture.md`, `docs/configuration.md`, and `docs/personal/harness.md`. Edit the integrated versions; do not restore pre-Terminal wording.

`providers/pi-dev/file-ops.mjs`, Edit V2 behavior, the mutation coordinator, Terminal broker/tmux/protocol code, runtime configuration, and live services are out of scope unless the source plan's Task 2 contract cannot be represented without changing them. If that happens, stop and report the concrete dependency instead of expanding scope.

Historical material under `docs/history/**` and intentional control/qualification artifacts are not migration targets.

## Acceptance

- Active routing Skills contain no instruction that routes contextual/structural model-authored work to custom `apply_patch`.
- Current normative docs and provider descriptions consistently describe the seven-tool personal Dev catalog and the same mutation ontology.
- `mcp-harness-router` keeps ast-grep narrow and behind Bash; bounded discovery normally feeds guarded `edit`.
- Genuine existing `.patch`/`.diff` artifacts route through native Git apply with `--check`; `--3way` remains explicit opt-in only.
- `docs/security.md` states the exact `file_ops` guarantees and limitations: final-component symlink rejection, same-filesystem hard-link move, structured partial outcomes, cooperative Dev serialization/stale guards, no CAS/serialization claim against arbitrary Bash/Python/editor actors, and the unavoidable final pathname unlink race.
- Only checksums for changed active Skill files/assets are refreshed.
- Repository Skill validity is established, without claiming ChatGPT's installed Skills were updated.

## Required validation

Testing is not added or expanded for this Task 2 documentation/routing mission. Run only the source-plan-required Skill/checksum validation relevant to the modified bundles plus `git diff --check`. Do not run the repository-wide Full verification gate; the planner owns that after this mission is integrated.

Also inspect active current `apply_patch` references before finishing and distinguish obsolete normative references from intentional history/control artifacts.

## Out of scope

- Repository-wide Full verification.
- Live Dev or Terminal activation/restart.
- Machine-local `MCP_TERMINAL_FRONTEND` preference changes.
- ChatGPT Skills UI installation/update or fresh-session acceptance.
- New test infrastructure, compatibility aliases, fuzzy patching, directory operations, cross-filesystem move fallback, or unrelated cleanup.

## Finish report

Return:

1. status: complete / blocked / needs decision;
2. branch/worktree and commit SHA;
3. concise routing/docs/Skill contract summary;
4. Skill/checksum validation and `git diff --check` actually run;
5. active `apply_patch` reference disposition;
6. deviations, dependency notes, or remaining blockers for the combined Full gate and rollout phase.
