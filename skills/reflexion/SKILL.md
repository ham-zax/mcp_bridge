---
name: reflexion
description: Use when the user asks to reflect on, critique, double-check, verify, improve, or memorize completed or nearly completed work, especially for evidence-backed review, multi-perspective critique, or turning verified lessons into durable repository guidance.
---

# Reflexion

Use this skill as a quality loop around completed or nearly completed work. Preserve the upstream Reflexion intent: generate, reflect or critique, refine when appropriate, and optionally curate durable lessons.

This ChatGPT adaptation combines the upstream `reflect`, `critique`, and `memorize` skills into one installable skill. It does not require Claude hooks or subagent dispatch.

## Select the mode

Choose the mode from the user's wording:

- **Reflect**: "reflect", "review your answer", "double-check", "improve this", "verify your work", or "then reflect". Read `references/reflect.md`.
- **Critique**: "critique", "multi-perspective review", "judge this", "review this implementation", or a request for a report-only assessment. Read `references/critique.md`.
- **Memorize**: "memorize", "remember this in the repo", "save the lesson", "update agent instructions", or a request to turn findings into durable project guidance. Read `references/memorize.md`.

If the request says to do a task **and then reflect**, complete the requested task first, then run Reflect before presenting the final completion claim.

## Evidence first

Ground reflection in observable evidence rather than recollection.

For repository work:

1. Identify the repository root, current branch/worktree, relevant requirements, and changed files.
2. Read project instructions such as `AGENTS.md`, `CLAUDE.md`, accepted specs/plans/ADRs, and relevant tests.
3. Run the smallest useful verification commands, then broader checks when the claim requires them.
4. Check dependencies and blast radius before recommending removal, renaming, or public-interface changes.
5. Verify current external facts with authoritative sources when the conclusion depends on them.

In Hamza's ChatGPT Web environment, use `hamza-wsl-local` for local repository, Git, filesystem, and test operations when available. Do not claim local verification if the connector is absent.

## Reflection depth

Triage before spending effort:

- **Quick**: simple edit, small explanation, documentation change, straightforward local bug. Run a concise requirement/correctness/verification check.
- **Standard**: multi-file feature, nontrivial bug fix, architecture choice, or meaningful analysis. Run the full reflection checklist and targeted verification.
- **Deep**: security, core-system behavior, concurrency, public API/contracts, data integrity, performance-sensitive work, or high-consequence changes. Require stronger evidence, explicit dependency analysis, and broader verification.

Do not inflate a small task into a long ceremony. Do not use a quick pass for high-risk work.

## Refinement policy

Reflection may discover issues. Handle them according to the user's request and action risk:

- For answer-only work, revise the answer directly when the correction is clear.
- For local code changes the user already asked to implement, fix verified issues that remain inside the agreed scope, then rerun verification.
- For destructive, scope-expanding, architectural, externally consequential, or ambiguous changes, report the finding and obtain direction before acting.
- Critique mode is report-only unless the user explicitly asks for fixes.

## Multi-perspective review without subagents

The upstream critique workflow uses independent judge agents. This adaptation must work even when no subagent primitive exists.

When subagents are unavailable, perform independent passes sequentially:

1. Requirements and behavior alignment.
2. Architecture and solution quality.
3. Code/output quality and maintainability.

Record each pass before cross-synthesizing so later perspectives do not erase earlier findings. Then identify agreements, conflicts, and confidence level. Do not pretend these were separate agents.

If a runtime genuinely provides subagents and the user wants them used, independent reviewers may be delegated, but this skill never requires that capability.

## Durable learning

Memorization is explicit, not automatic. Only write durable project guidance when the user asks to memorize/save/curate lessons.

Prefer the repository's existing agent-instruction file and conventions. Do not create or replace `AGENTS.md` or `CLAUDE.md` silently. Preserve specific evidence-backed rules; avoid vague preferences, secrets, transient paths, and one-off implementation details.

## Completion

Before saying the work is correct, fixed, ready, or complete:

- identify the evidence that proves the claim;
- run or inspect that evidence fresh;
- distinguish verified facts from judgment;
- report any remaining uncertainty or unverified area.

## Upstream provenance

Adapted from `NeoLabHQ/context-engineering-kit`, `plugins/reflexion`, which provides separate `reflect`, `critique`, and `memorize` skills plus an optional Claude hook. See `references/upstream.md` for adaptation notes.
