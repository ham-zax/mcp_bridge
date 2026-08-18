# Agent Prompt Template

Use this template as a flexible default. Omit sections that add no value and expand sections where coordination risk is high.

```markdown
You own **<mission name>** for <feature / objective>.

## Repository
<absolute repository path>

Working arrangement:
- Workspace: <current checkout | assigned branch/worktree | read-only>
- Isolation reason: <none | explicit reason>
- Can start: <immediately | after dependency/commit/contract>
- Depends on: <mission names or none>

## Read first
- `<durable artifact path>` — <why it matters>
- `<spec/plan/ADR/AGENTS.md>` — <why it matters>

Read the repository itself for implementation details; the artifacts above are requirements/context anchors, not a substitute for inspecting current code.

## Objective
<Describe the end state or behavior this agent owns. Use outcome language rather than implementation steps.>

## Current state
<What is true now that materially affects this mission.>

## Ownership
You own:
- <behavior/subsystem/interface/artifact>
- <verification for that ownership>

Neighboring work owns:
- <area another mission owns>

Keep changes focused on this mission unless a nearby change is necessary to preserve correctness.

## Artifact type
<executable behavior | documentation/content | configuration/metadata | mixed | read-only>

## Coordination contract
<Describe interfaces or facts another mission depends on. State what should remain stable and how to report unavoidable changes.>

## Success conditions
- <observable criterion>
- <observable criterion>
- <relevant compatibility/regression/content expectation>

## Out of scope
- <adjacent work this session should not absorb>
- <optional future improvement>

## Execution lifetime
<ordinary | persistent-agent-loop required | persistent-agent-loop optional>

When `persistent-agent-loop` is required, state only the mission-specific lifetime contract:
- wake strategy: native timer / event wait / Terminal + event wait;
- named wait or persistent Terminal identity when already known;
- checkpoint boundary when meaningful;
- developer visibility: headless by default, optional Kitty presentation, or human handoff if needed;
- steering rule: status/progress/compatible side work does not terminate an incomplete mission; preserve still-valid waits and continue unless explicitly stopped/replaced or completion is verified.

Do not restate the entire persistent-loop protocol; the receiving session should load that Skill.

## Working style
Explore the current codebase before deciding implementation details. Follow repository conventions and existing agent instructions. Prefer coherent, maintainable changes over literal adherence to any implementation assumption in this prompt when the repository proves that assumption stale.

Match verification to the artifact:
- Executable behavior: add/change tests only when they protect meaningful behavior, a real regression, contract, important edge case, or invariant. Reuse existing coverage when sufficient. Do not create a RED test merely to prove an internal symbol does not exist.
- Documentation/content: do not use TDD or manufacture automated assertions for prose, headings, layout, or file organization. Use relevant docs builds, link/reference/stale-path checks, formatting checks, publication/export-policy checks, and diff review.
- Configuration/metadata: use parser/schema validation, targeted build/config checks, or a relevant smoke test.
- Mixed: apply the appropriate evidence to each changed artifact.

Run the narrowest relevant checks first. Do not run a broad/full application suite unless the changed artifacts or repository policy give it a concrete purpose.

Do not create a new worktree merely because this is an agent mission. Use the assigned/current workspace. If the real repository state makes that unsafe, report the isolation need instead of silently creating new topology.

## Finish report
When finished, return:
1. status: complete / blocked / needs decision;
2. workspace/branch and commits created, if any;
3. concise summary of resulting behavior, artifact, and any public/interface changes;
4. tests/checks actually run, their results, and why they were relevant;
5. anything dependent sessions need to know;
6. unresolved risks, deviations, or decisions needed.
```

## Prompt-writing guidance

### Prefer declarative statements

Good:

> The importer should reject malformed rows without discarding valid rows from the same batch. Own this behavior and its regression coverage.

Avoid:

> Open `importer.ts`, add a try/catch around line 84, then create `importer-errors.test.ts` and run command X.

### Use file paths for durable anchors, not guessed implementation

Good paths:
- repository root;
- `AGENTS.md` / `CLAUDE.md`;
- accepted specs and plans;
- ADRs;
- a stable schema or public contract file when known.

Avoid enumerating implementation files solely because they happen to contain the code today. A capable fresh agent should rediscover the current implementation.

### Give exact values when they are contractual

Declarative does not mean vague. Preserve exact API names, version floors, compatibility guarantees, data shapes, error semantics, naming rules, and user-visible behavior when those are requirements.

### Coordination note for parallel branches

When another session is working concurrently, include one explicit boundary:

> Another session owns <neighboring mission>. Do not absorb that work. Coordinate through <stable interface/artifact>. If you discover the boundary is invalid, stop expanding scope and report the conflict so the plan can be revised.

## Durable mission-file mode

When the planner has materialized an `agent-plans/` coordination package, the mission file is the authoritative prompt. Do not repeat this full template in chat. Use the short launcher-prompt pattern from `coordination-package-template.md` and keep substantial context in the mission file and coordination README.
