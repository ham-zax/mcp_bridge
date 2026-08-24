---
name: superpowers-web-adapter
description: Adapt legacy Superpowers software-development workflows to ChatGPT sessions using `wsl-web-harness`, especially when subagent, todo, worktree, reviewer, helper-file, or local-execution primitives differ from upstream. Keep Causal Coding authoritative for mutation scope, testing authorization, verification cadence, and stopping.
---

# Superpowers Web Adapter

Preserve upstream Superpowers behavior while bridging ChatGPT Web harness gaps. Do not replace or rewrite Superpowers workflows when the original skill is usable.

## Core rule

At the start of software-development work, invoke the relevant standalone Superpowers-derived Skill before taking repository or implementation action. If `using-superpowers` is installed and has not been loaded yet, use it first to select the process Skill.

Treat this adapter as a compatibility layer only:

1. Follow the user's explicit instructions and higher-level product rules.
2. For source mutation, let Causal Coding govern scope, testing authorization, verification cadence, and stopping. Superpowers must not broaden those boundaries.
3. Follow the relevant Superpowers skill as written whenever the harness can support it and it does not conflict with the governing mutation policy.
4. Apply the fallbacks below only where ChatGPT Web lacks the primitive that Superpowers expects.
5. Never claim that a missing subagent, reviewer, todo system, worktree primitive, helper file, or local execution capability exists.

## Broad development routing

Use the installed standalone Superpowers-derived Skills for the engineering workflow pieces that still apply:

- New feature, component, behavior change, or other creative implementation work -> `brainstorming`.
- Bug, failing test, unexpected behavior, or regression -> `systematic-debugging`.
- Feature or bugfix implementation -> use the normal implementation workflow without introducing tests by default. Invoke `test-driven-development` only when the user explicitly requests TDD/testing, an authoritative user-approved specification requires it, or mandatory repository policy specifically requires it.
- Requirements/spec for multi-step work -> `writing-plans`.
- Existing implementation plan -> `executing-plans` when subagents are unavailable.
- Starting work that has already passed the isolation gate below -> `using-git-worktrees`. Never invoke it merely because an implementation plan exists.
- Receiving review feedback -> `receiving-code-review`.
- Before claiming completion -> `verification-before-completion`.
- After implementation is verified and integration is next -> `finishing-a-development-branch`.

Do not route to a subagent-dependent Superpowers skill merely because it exists. Use the fallback matrix below when this web session has no subagent dispatch primitive.

## Local-PC execution contract

Use the connected `wsl-web-harness` connector as the canonical path for repository filesystem and shell work in this environment.

For implementation requests, act on the repository through the connected local tools and make the required code changes directly. Do not stop at instructions, suggested patches, or code snippets unless the user explicitly asks for guidance or a plan only.

- Use its native Bash/read/write/edit capabilities when available.
- Discover the repository root and relevant paths before editing; do not guess absolute paths.
- Run git, build, lint, package-manager, and other permitted project commands through the local connector when the work belongs on the user's PC. Run tests only when the user, authoritative specification, or mandatory repository policy explicitly authorizes testing.
- Preserve the user's existing working tree and unrelated changes.
- Do not claim a command ran unless the connector returned evidence that it ran.
- If `wsl-web-harness` is unavailable or disconnected, state that the local execution dependency is missing and stop before pretending to modify or verify the repository.

If another connected tool is a better fit for a specific operation (for example, a GitHub connector for PR metadata), it may be composed with this adapter. Keep `wsl-web-harness` as the source of truth for the local working tree.

## Persist Superpowers artifacts to the real repository

Do not downgrade Superpowers planning into chat-only prose.

When the upstream skill requires a persistent artifact, write it through `wsl-web-harness` to the repository:

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
4. Record each task as `pending`, `in_progress`, `complete`, or `blocked`, with relevant commit hashes and any explicitly required validation commands.
5. After compaction, restart, or a long interruption, trust the persisted progress file plus `git log` and the saved plan over conversational recollection.

Do not mark a task complete until its observable success conditions are established and any validation explicitly required by its plan has actually run. The adapter must not add tests or validation requirements that the plan did not authorize.

## Subagent fallback matrix

### `subagent-driven-development`

If no real subagent dispatch tool exists, do not simulate implementer/reviewer agents in prose.

Use `executing-plans` instead and execute the saved plan sequentially in this session. Preserve the plan, justified isolation, explicitly authorized testing/validation, progress persistence, blocker handling, and any branch-finishing discipline that actually applies.

### `dispatching-parallel-agents`

If no subagent dispatch tool exists, do not claim parallel agents were launched. Identify the independent workstreams, then execute them sequentially in a sensible order. Parallel shell commands may be used only for genuinely independent command execution; they are not a substitute for independent reasoning agents.

### `requesting-code-review`

If no independent reviewer/subagent primitive exists:

1. Build a bounded review context from the requirements/plan and the relevant git diff.
2. Perform a separate inline review pass focused on correctness, spec compliance, regression risk, existing test evidence when relevant, security implications, and unnecessary scope.
3. Re-establish only the evidence invalidated by fixes. Do not run tests unless testing is independently authorized by the user/spec/repository policy.
4. Explicitly describe the result as an **inline self-review**, not an independent reviewer opinion.
5. If an actual external reviewer tool becomes available, prefer it for independence.

Do not manufacture a reviewer identity or review result.

### `writing-skills`

Some Superpowers skill-authoring tests require fresh subagents. If no subagent primitive exists, do not claim those pressure tests were performed. Use the ChatGPT `skill-creator` workflow, validators, packaging checks, and scenario-based self-review that the current harness can actually execute, and state the limitation when independent fresh-context testing materially matters.

## Missing Superpowers helper files

The Web plugin can expose a Superpowers `SKILL.md` while omitting a supporting file referenced by that skill. When a referenced helper is unavailable from the Web skill resources:

1. Use `wsl-web-harness` to look for the corresponding helper in the user's local Superpowers installation, commonly under Codex, OpenCode, or cross-runtime skill caches.
2. Prefer a copy whose Superpowers version or `SKILL.md` content matches the Web plugin as closely as can be verified.
3. Use the local helper as procedural guidance only; do not claim it was bundled in the Web plugin.
4. If version parity cannot be established, apply only stable, obviously compatible guidance and call out the uncertainty when it is material.

A typical discovery pattern is to search the known local agent/plugin roots for:

```text
*/superpowers/skills/<skill-name>/<referenced-file>
```

This fallback is useful for reviewer templates, testing guidance, debugging references, and other support documents missing from the browser-exposed package.

## Task type and Causal-compatible validation

Before choosing testing, workspace isolation, setup, or validation, classify the work by what it actually changes. Testing is opt-in: executable code, bug fixes, refactors, APIs, risk, or nearby tests do not authorize test creation/modification/execution by themselves.

- **Executable behavior** — production code, runtime logic, APIs, persistence, build behavior, or other behavior that can regress.
- **Documentation/content only** — README files, guides, prose, examples, diagrams, comments, documentation organization, or other non-executable content.
- **Configuration/metadata** — manifests, CI/config files, schemas, packaging metadata, repository policy, or similar operational files.
- **Mixed** — a change containing more than one category.

Match non-test evidence to the affected artifact and the failure it is meant to detect. Add testing only when the user, authoritative user-approved specification, or mandatory repository policy explicitly requires it.

For documentation/content-only work:

- Do not apply TDD or manufacture RED/GREEN cycles.
- Do not create automated assertions for headings, prose, README layout, directory descriptions, or other documentation content merely to make the work "testable."
- Use relevant lightweight checks such as documentation builds, link/reference checks, stale-path searches, formatting validation, publication/export-policy checks, and diff review.
- Preserve existing repository-boundary contracts when documentation affects publication, packaging, privacy, or security; run a test for that contract only when testing is explicitly authorized or mandatory repository policy requires it.
- Do not run application tests for documentation-only work unless an explicit testing requirement applies.

For configuration/metadata work, run parser/schema/build/smoke validation only when the changed contract actually needs it or explicit instructions require it. Do not automatically escalate to the entire application suite.

For mixed work, keep validation scoped independently to each artifact. Do not let executable changes bootstrap testing for the whole mission.

A verification step must have a concrete failure or contract it is intended to detect. Do not perform broad verification merely because a generic template mentions it.

## Worktrees and git

Treat `using-git-worktrees` as a conditional isolation sub-skill, not a default implementation phase. Evaluate this section first. Do not invoke the worktree Skill merely because `executing-plans` or another generic workflow says to ensure isolation. If the conditions below do not justify isolation, satisfy that workflow by continuing safely in the current checkout.

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

Only after isolation is justified, explicitly invoke `using-git-worktrees` and follow its safety/setup procedure using the connected local tools. If isolation is not justified, do not invoke that skill; continue directly in the current checkout and do not perform worktree-specific dependency installation or baseline testing.

Always preserve unrelated local changes. Do not merge, push, delete branches, discard work, or rewrite unrelated state without the appropriate user decision.

## Test authorization boundary

Testing is opt-in. Do not create, modify, or run tests merely because a change affects executable behavior, fixes a bug, changes an API, carries risk, or has nearby coverage.

Testing is in scope only when the user explicitly requests it, an authoritative user-approved specification requires it, or mandatory repository policy specifically requires a test or test command. When testing is authorized, keep it proportional: reuse existing coverage where sufficient, add only tests that serve the authorized requirement, use RED/GREEN only when TDD itself is authorized, and run the narrowest required test surface before any broader suite explicitly required by the same authority.

When testing is not authorized, use direct behavioral evidence and the smallest relevant non-test candidate-final checks. Do not label optional omitted tests as incomplete required work.

## Plan execution discipline

Treat a saved plan as executable guidance, not as permission to repeat generic ceremony. Before execution, review its testing, setup, worktree, and verification steps against the actual task type and current repository state.

If a generic plan contains code-oriented ceremony that does not apply — such as RED/GREEN tests for documentation, a worktree without an isolation reason, duplicate dependency setup, or a full-suite run with no relevant failure mode — normalize those steps to the smallest meaningful workflow before execution.

This normalization may remove or replace process overhead, but must not silently remove a real product requirement, regression check, repository policy, security boundary, or acceptance criterion. Escalate only when changing the plan would alter intended behavior, architecture, or user-visible scope.

When the user asks to execute a saved plan:

1. Load the exact plan from disk.
2. Review it for blockers, contradictions, and generic process steps inappropriate for the actual task type.
3. Remove unauthorized testing and normalize workspace, setup, and validation according to the policies above.
4. Establish isolation only if it is materially justified.
5. Resume from persisted progress if present.
6. Execute tasks sequentially in the current session.
7. Apply the test authorization boundary. Use direct/artifact-appropriate non-test evidence when testing is not authorized.
8. Establish each task's observable success conditions and run only explicitly required validation before marking it complete.
9. Stop on a genuine blocker instead of guessing.
10. After all tasks, gather fresh completion evidence proportional to the affected artifacts, without introducing unauthorized tests, and use `finishing-a-development-branch` only when a branch-integration decision is actually relevant.

Never describe long-running implementation as background or asynchronous work. Continue in the active session until completion or a real stop condition.

## Composition with other development skills

This adapter does not replace other installed development skills.

### Causal Coding and MCP Harness Router

When Causal Coding and/or MCP Harness Router also apply, keep the boundaries explicit:

- **Causal Coding controls mutation scope and stopping**: owner selection, smallest complete change, testing authorization, verification cadence, and when to stop.
- **Superpowers Web Adapter controls only compatible workflow adaptation**: brainstorming, planning, debugging structure, worktree/isolation integration, review fallbacks, and branch-finishing compatibility inside the Causal Coding boundary.
- **MCP Harness Router controls local primitive selection only**: for example `read` versus `bash`, `edit` versus `write`/`file_ops`, CodeDB versus `rg`, Bash versus Terminal, Local Browser routing, or `wait` versus polling.
- Do not let MCP Harness Router prescribe Git workflow, worktree policy, planning, testing, review, or implementation methodology.
- Do not invoke MCP Harness Router merely because a software-development task exists. Use it when choosing among available local Dev, Code, Terminal, or wait primitives is materially relevant.
- If the router's preferred primitive is unavailable, preserve the Superpowers workflow and choose the best actually exposed local primitive rather than inventing a tool.

In short: Causal Coding sets the mutation boundary; the standalone Superpowers-derived Skills supply compatible workflow structure; MCP Harness Router chooses the local primitive for each concrete operation.

### Other skills

- If Agent Browser applies, let it choose the browser action and route that action through the private logical Browser server exposed via Local on `wsl-web-harness`. Do not substitute a browser CLI unless that Skill explicitly calls for one in the active environment.
- If Codebase Memory applies, use its graph workflow only when its required graph tools are actually connected; otherwise fall back to source inspection without pretending graph evidence exists.
- Repository-specific instructions (`AGENTS.md`, `CLAUDE.md`, project docs, etc.) remain authoritative within their scope.

## Completion standard

Before claiming work is complete, fixed, passing, persisted, committed, pushed, or merged, obtain fresh evidence for that exact claim. Match the evidence to the affected artifact rather than running unrelated checks. Use `verification-before-completion` and the local connector outputs as the evidence source.
