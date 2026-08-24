---
name: superpowers-web-adapter
description: Use when applying Superpowers software-development workflows in ChatGPT Web with Hamza's local WSL connector, especially when expected subagent, todo, worktree, reviewer, or helper-file primitives are missing or need harness-specific adaptation.
---

# Superpowers Web Adapter

Preserve upstream Superpowers behavior while bridging ChatGPT Web harness gaps. Do not replace or rewrite Superpowers workflows when the original skill is usable.

## Core rule

At the start of software-development work, invoke the relevant Superpowers skill before taking repository or implementation action. If `superpowers:using-superpowers` has not been loaded yet, use it first to select the process skill.

Treat this adapter as a compatibility layer only:

1. Follow the user's explicit instructions and higher-level product rules.
2. Follow the relevant Superpowers skill as written whenever the harness can support it.
3. Apply the fallbacks below only where ChatGPT Web lacks the primitive that Superpowers expects.
4. Never claim that a missing subagent, reviewer, todo system, worktree primitive, helper file, or local execution capability exists.

## Broad development routing

Use the existing Superpowers plugin for the actual engineering discipline:

- New feature, component, behavior change, or other creative implementation work -> `superpowers:brainstorming`.
- Bug, failing test, unexpected behavior, or regression -> `superpowers:systematic-debugging`.
- Feature or bugfix implementation -> `superpowers:test-driven-development`.
- Requirements/spec for multi-step work -> `superpowers:writing-plans`.
- Existing implementation plan -> `superpowers:executing-plans` when subagents are unavailable.
- Starting work that has already passed the isolation gate below -> `superpowers:using-git-worktrees`. Never invoke it merely because an implementation plan exists.
- Receiving review feedback -> `superpowers:receiving-code-review`.
- Before claiming completion -> `superpowers:verification-before-completion`.
- After implementation is verified and integration is next -> `superpowers:finishing-a-development-branch`.

Do not route to a subagent-dependent Superpowers skill merely because it exists. Use the fallback matrix below when this web session has no subagent dispatch primitive.

## Local-PC execution contract

Use the connected `hamza-wsl-local` plugin as the canonical path for repository filesystem and shell work in this environment.

For implementation requests, act on the repository through the connected local tools and make the required code changes directly. Do not stop at instructions, suggested patches, or code snippets unless the user explicitly asks for guidance or a plan only.

- Use its native Bash/read/write/edit capabilities when available.
- Discover the repository root and relevant paths before editing; do not guess absolute paths.
- Run git, build, test, lint, package-manager, and project commands through the local connector when the work belongs on the user's PC.
- Preserve the user's existing working tree and unrelated changes.
- Do not claim a command ran unless the connector returned evidence that it ran.
- If `hamza-wsl-local` is unavailable or disconnected, state that the local execution dependency is missing and stop before pretending to modify or verify the repository.

If another connected tool is a better fit for a specific operation (for example, a GitHub connector for PR metadata), it may be composed with this adapter. Keep `hamza-wsl-local` as the source of truth for the local working tree.

## Persist Superpowers artifacts to the real repository

Do not downgrade Superpowers planning into chat-only prose.

When the upstream skill requires a persistent artifact, write it through `hamza-wsl-local` to the repository:

- Brainstorming design/spec: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- Implementation plan: `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`
- Any other path explicitly required by the active Superpowers skill

After writing an artifact, re-read enough of it from disk to verify the saved content before saying it was persisted.

When a plan is later executed, load the exact saved plan file from disk. Do not reconstruct it from conversation memory.

## Progress when ChatGPT Web has no todo primitive

If a Superpowers workflow asks for todos and this harness exposes no todo/task-state primitive, maintain execution state on disk instead of inventing one.

Preferred fallback:

1. Create `.superpowers/web/<plan-basename>/progress.md` inside the repository.
2. Ensure `.superpowers/` is ignored. Prefer an existing ignore rule; otherwise add a local-only rule to `.git/info/exclude` rather than modifying the tracked `.gitignore` solely for adapter bookkeeping.
3. Record the plan path on the first line.
4. Record each task as `pending`, `in_progress`, `complete`, or `blocked`, with relevant commit hashes and verification commands.
5. After compaction, restart, or a long interruption, trust the persisted progress file plus `git log` and the saved plan over conversational recollection.

Do not mark a task complete until the verification required by its plan has actually run.

## Subagent fallback matrix

### `subagent-driven-development`

If no real subagent dispatch tool exists, do not simulate implementer/reviewer agents in prose.

Use `superpowers:executing-plans` instead and execute the saved plan sequentially in this session. Preserve the plan, justified isolation, task-appropriate testing and verification, progress persistence, blocker handling, and any branch-finishing discipline that actually applies.

### `dispatching-parallel-agents`

If no subagent dispatch tool exists, do not claim parallel agents were launched. Identify the independent workstreams, then execute them sequentially in a sensible order. Parallel shell commands may be used only for genuinely independent command execution; they are not a substitute for independent reasoning agents.

### `requesting-code-review`

If no independent reviewer/subagent primitive exists:

1. Build a bounded review context from the requirements/plan and the relevant git diff.
2. Perform a separate inline review pass focused on correctness, spec compliance, regression risk, tests, security implications, and unnecessary scope.
3. Run the appropriate verification commands after fixes.
4. Explicitly describe the result as an **inline self-review**, not an independent reviewer opinion.
5. If an actual external reviewer tool becomes available, prefer it for independence.

Do not manufacture a reviewer identity or review result.

### `writing-skills`

Some Superpowers skill-authoring tests require fresh subagents. If no subagent primitive exists, do not claim those pressure tests were performed. Use the ChatGPT `skill-creator` workflow, validators, packaging checks, and scenario-based self-review that the current harness can actually execute, and state the limitation when independent fresh-context testing materially matters.

## Missing Superpowers helper files

The Web plugin can expose a Superpowers `SKILL.md` while omitting a supporting file referenced by that skill. When a referenced helper is unavailable from the Web skill resources:

1. Use `hamza-wsl-local` to look for the corresponding helper in the user's local Superpowers installation, commonly under Codex, OpenCode, or cross-runtime skill caches.
2. Prefer a copy whose Superpowers version or `SKILL.md` content matches the Web plugin as closely as can be verified.
3. Use the local helper as procedural guidance only; do not claim it was bundled in the Web plugin.
4. If version parity cannot be established, apply only stable, obviously compatible guidance and call out the uncertainty when it is material.

A typical discovery pattern is to search the known local agent/plugin roots for:

```text
*/superpowers/skills/<skill-name>/<referenced-file>
```

This fallback is useful for reviewer templates, testing guidance, debugging references, and other support documents missing from the browser-exposed package.

## Task type and proportional verification

Before choosing testing, workspace isolation, setup, or verification, classify the work by what it actually changes:

- **Executable behavior** — production code, runtime logic, APIs, persistence, build behavior, or other behavior that can regress.
- **Documentation/content only** — README files, guides, prose, examples, diagrams, comments, documentation organization, or other non-executable content.
- **Configuration/metadata** — manifests, CI/config files, schemas, packaging metadata, repository policy, or similar operational files.
- **Mixed** — a change containing more than one category.

Match verification to the affected artifact and the failure it is meant to detect.

For documentation/content-only work:

- Do not apply TDD or manufacture RED/GREEN cycles.
- Do not create automated assertions for headings, prose, README layout, directory descriptions, or other documentation content merely to make the work "testable."
- Use relevant lightweight checks such as documentation builds, link/reference checks, stale-path searches, formatting validation, publication/export-policy checks, and diff review.
- Preserve genuine repository-boundary tests when the documentation change affects an actual publication, packaging, privacy, or security contract.
- Do not run the full application test suite unless the documentation can affect executable/package behavior or repository instructions specifically require it.

For configuration/metadata work, run the smallest checks that exercise the affected contract: parser/schema validation, targeted build/config checks, or a relevant smoke test. Do not automatically escalate to the entire application suite.

For mixed work, test executable behavior according to the evidence-based testing policy and verify non-executable artifacts with their appropriate checks.

A verification step must have a concrete failure or contract it is intended to detect. Do not perform broad verification merely because a generic template mentions it.

## Worktrees and git

Treat `superpowers:using-git-worktrees` as a conditional isolation sub-skill, not a default implementation phase. Evaluate this section first. Do not invoke the worktree skill merely because `superpowers:executing-plans` or another generic upstream workflow says to ensure isolation. If the conditions below do not justify isolation, satisfy that workflow by continuing safely in the current checkout.

Work in the user's current repository checkout by default.

A worktree is an isolation mechanism, not a mandatory phase of every task. Create or enter a worktree when at least one of these is true:

- the user explicitly requests isolated work;
- multiple independent workers need parallel writable workspaces;
- the current checkout contains unrelated or conflicting changes that should not be mixed with this effort;
- the work is sufficiently risky or long-lived that isolation provides material safety;
- repository-specific instructions require isolation.

Do not create a worktree merely because:

- an implementation plan exists;
- an upstream workflow generically recommends isolation;
- the task is documentation/content-only;
- the change is small and coherent in the current checkout;
- each task in a larger effort is starting.

Use one worktree for one coherent effort unless independent parallel work genuinely requires separate workspaces. Never create a new worktree per plan task by default.

Only after isolation is justified, explicitly invoke `superpowers:using-git-worktrees` and follow its safety/setup procedure using the connected local tools. If isolation is not justified, do not invoke that skill; continue directly in the current checkout and do not perform worktree-specific dependency installation or baseline testing.

Always preserve unrelated local changes. Do not merge, push, delete branches, discard work, or rewrite unrelated state without the appropriate user decision.

## Evidence-based test selection

When adapting Superpowers TDD for this workflow, keep test-first reasoning focused on meaningful behavior. Treat tests as engineering evidence, not ceremony.

- Add a new test when it protects changed behavior, a real regression, an important contract or edge case, or a strong invariant not already covered.
- Do not create a test solely to increase coverage or to prove that an internal function, import, or symbol does not exist. A missing symbol may occur incidentally while introducing a genuine contract; it is not the purpose of the test.
- When a new test is warranted, use the normal RED/GREEN discipline: make RED express the behavior or contract that should work, verify the expected failure, implement minimally, then verify green.
- Reuse existing tests when they already prove the changed behavior instead of duplicating them.
- Prefer a focused regression test for a real bug when it can be reproduced economically.
- Use property-based testing only when an invariant-heavy domain gains materially stronger confidence than focused examples.
- Run the narrowest relevant test first, then the broader affected suite needed for completion confidence.
- Do not omit a high-value test merely to minimize lines or files.

If existing tests already prove the change and there is no meaningful regression gap, do not add a new test just to manufacture a red phase. Run the relevant existing verification and record why no additional test was needed.

## Plan execution discipline

Treat a saved plan as executable guidance, not as permission to repeat generic ceremony. Before execution, review its testing, setup, worktree, and verification steps against the actual task type and current repository state.

If a generic plan contains code-oriented ceremony that does not apply — such as RED/GREEN tests for documentation, a worktree without an isolation reason, duplicate dependency setup, or a full-suite run with no relevant failure mode — normalize those steps to the smallest meaningful workflow before execution.

This normalization may remove or replace process overhead, but must not silently remove a real product requirement, regression check, repository policy, security boundary, or acceptance criterion. Escalate only when changing the plan would alter intended behavior, architecture, or user-visible scope.

When the user asks to execute a saved plan:

1. Load the exact plan from disk.
2. Review it for blockers, contradictions, and generic process steps inappropriate for the actual task type.
3. Normalize testing, workspace, setup, and verification according to the policies above.
4. Establish isolation only if it is materially justified.
5. Resume from persisted progress if present.
6. Execute tasks sequentially in the current session.
7. Apply evidence-based test selection for executable behavior. Use artifact-appropriate verification for documentation, configuration, and other non-code work.
8. Run each task's meaningful verification before marking it complete.
9. Stop on a genuine blocker instead of guessing.
10. After all tasks, run fresh completion verification proportional to the affected artifacts and use `superpowers:finishing-a-development-branch` only when a branch-integration decision is actually relevant.

Never describe long-running implementation as background or asynchronous work. Continue in the active session until completion or a real stop condition.

## Composition with other development skills

This adapter does not replace other installed development skills.

### MCP Harness Router

When MCP Harness Router also applies, keep the boundary explicit:

- **Superpowers Web Adapter controls engineering workflow**: brainstorming, planning, debugging, implementation discipline, test strategy, worktree/isolation decisions, verification, review, and branch finishing.
- **MCP Harness Router controls local primitive selection only**: for example `read` versus `bash`, `edit` versus `write`/`file_ops`, CodeDB versus `rg`, Bash versus Terminal, or `wait` versus polling.
- Do not let MCP Harness Router prescribe Git workflow, worktree policy, planning, testing, review, or implementation methodology.
- Do not invoke MCP Harness Router merely because a software-development task exists. Use it when choosing among available local Dev, Code, Terminal, or wait primitives is materially relevant.
- If the router's preferred primitive is unavailable, preserve the Superpowers workflow and choose the best actually exposed local primitive rather than inventing a tool.

In short: Superpowers decides **how the engineering work should proceed**; MCP Harness Router decides **which local primitive should perform a concrete operation inside that workflow**.

### Other skills

- If Agent Browser applies, it may use the local connector to run the installed browser CLI.
- If Codebase Memory applies, use its graph workflow only when its required graph tools are actually connected; otherwise fall back to source inspection without pretending graph evidence exists.
- Repository-specific instructions (`AGENTS.md`, `CLAUDE.md`, project docs, etc.) remain authoritative within their scope.

## Completion standard

Before claiming work is complete, fixed, passing, persisted, committed, pushed, or merged, obtain fresh evidence for that exact claim. Match the evidence to the affected artifact rather than running unrelated checks. Use `superpowers:verification-before-completion` and the local connector outputs as the evidence source.
