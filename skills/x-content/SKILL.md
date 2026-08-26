---
name: x-content
description: "Create, rewrite, critique, select formats for, and learn from X/Twitter content for a technical AI-native developer and builder account. Use when turning an idea, source post, release, benchmark, result, or conversation into an Original, Quote, Thread, or Reply; improving or diagnosing a draft; generating materially different variants; analyzing content patterns or own-account outcomes; or turning measured outcomes into evidence-backed candidate lessons. Own content intelligence and content-memory judgment. Compose with agent-browser for live X context and repository/Growth OS owners for workflow, approval, measurement persistence, and publication."
---

# X Content

Treat X content strategy as domain knowledge. Do not put hooks, voice, audience language, topic strategy, or viral-writing rules into Browser memory merely because the workflow runs on X.

## Ownership boundary

- **This Skill:** content research, contribution-seam analysis, format judgment, voice, hooks, wording, structure, critique, variants, replies, and evidence-based learning.
- **Repository / Growth OS:** candidates, routes, dispositions, approvals, queues, experiments, relationship state, measurement persistence, scheduling, reconciliation, and publication authority when those systems exist.
- **Browser memory:** X site mechanics, stable UI quirks, and operator/site policy only. Never store hooks, voice, topic strategy, audience language, or performance lessons there.
- **Generic Browser:** observation and interaction mechanics. Let `agent-browser` own backend selection, tabs, refs, lifecycle, credential boundaries, and execution semantics.
- **Private extension:** optional account-specific/evolving content sources. It supplies data paths, not Browser or publication authority.

When an authoritative workflow has already selected a route, approval state, experiment, or publication path, preserve it and optimize the content inside it. A content recommendation never grants execution authority.

Use `agent-browser` only when live X context materially affects the content decision. Content drafting and critique must work without Browser access, Growth OS, or the private extension.

## Load evidence progressively

1. Read `references/writing-patterns.md` for creation, revision, format choice, or replies.
2. Read the applicable branch in `references/workflows.md` only as needed.
3. For learning or private-memory mutation, read `references/evidence-and-memory.md`.
4. When authenticated own-account X Analytics materially affects the decision, read `references/account-analytics.md`.
5. Through Dev, check for:

   `~/.config/mcp-dev-bridge/extensions/enabled/x-content.json`

   If present, read `sources.workspace`. Never infer a private path, bypass disabled extension state, or install/enable the extension merely because this Skill was invoked.
6. Inside the configured workspace, load only files relevant to the current task. Supported files are `voice.md`, `patterns.md`, `results.md`, `topics.md`, `examples.md`, and `candidates.md`. Missing files are normal.

The private extension is optional. If it is absent or disabled, continue with bundled references, verified source material, repository context, and evidence supplied in the current conversation. Do not block ordinary drafting or critique.

## Evidence precedence

When guidance conflicts, prefer:

1. explicit current-task requirements;
2. verified facts and exact current source/thread context;
3. current measured own-account outcomes;
4. explicit human voice and positioning decisions;
5. recently promoted private patterns whose scope still applies;
6. bundled account writing rules;
7. external style/performance associations with their stated confidence and limitations;
8. general copywriting judgment.

Current examples and measured results outrank stale heuristics. Candidate lessons are not production rules. A viral source is evidence about possible structure, not permission to copy its wording or unsupported claims.

## Choose the workflow

- **Create / variants** -> follow Create in `references/workflows.md`.
- **Improve / critique** -> follow Improve.
- **Reply** -> follow Reply.
- **Learn from outcomes** -> follow Learn and `references/evidence-and-memory.md`.

Do not produce generic social-media advice when the stored evidence can diagnose the actual draft.

## Core writing rules

- Lead with the concrete object, result, constraint, model, tool, API, benchmark, price, latency, usage window, or failure mode when one exists.
- Put the payoff in the first one or two visual blocks.
- Prefer precise developer nouns over generic words such as `AI`, `future`, `innovation`, or `game changer`.
- Keep one central thesis.
- Use short paragraphs and remove sentences that merely repeat the source or hook.
- Use verified numbers when they change the reader's decision; never manufacture numbers for punch.
- Do not hard-code zero hashtags. For main-feed posts, treat 0-2 canonical topical hashtags as an empirical choice and let fresh own-account outcomes decide the active treatment count. Preserve the treatment exactly: evidence from a two-hashtag post does not justify rewriting the lesson as a one-hashtag rule. Keep replies at zero unless the hashtag belongs to the actual conversation.
- Avoid generic praise, launch-copy hype, engagement bait, fake certainty, motivational filler, and near-copying a source.
- A reply must contribute something: implementation detail, comparison, caveat, decision metric, evaluation design, correction, field observation, or a useful question.

Generate a small number of genuinely different variants. Vary thesis, framing, evidence emphasis, or structure rather than swapping synonyms.

## Learning boundary

Learning is deliberate:

`observation -> candidate lesson -> review/evidence -> promoted knowledge`

- Do not persist a lesson merely because a webpage said something or one post performed well.
- When the user asks to learn from outcomes and the private workspace is enabled, record a candidate in `candidates.md`; do not silently edit promoted rules.
- Promotion requires explicit human approval. Prefer repeated own-account evidence for performance claims.
- Preserve counterexamples, confounders, sample size, and scope. Use `low`, `medium`, or `high` confidence rather than `always`/`never` when evidence is observational.
- When new evidence contradicts a stored rule, surface the conflict instead of averaging it away.

## X execution boundary

Keep content intelligence separate from account mutation.

This Skill may draft, critique, recommend a format, or analyze an automated-content proposal. It does not grant permission to publish, Reply, Repost, Like, Follow, or otherwise mutate X.

Treat X automation requirements as time-sensitive. Before recommending or enabling an automated X mutation path, verify the current official X API and automation requirements from authoritative public sources. Prefer ordinary public research for public policy/API documentation rather than using the authenticated resource-local X browser as a policy oracle.

Do not treat authenticated website access as automation authorization. Do not use scripted website interaction as unattended publication merely because Browser tooling can technically perform it.

Defer approval, credentials, recipient consent, transport selection, retry policy, reconciliation, scheduler authority, and actual mutation to the governing repository/operator/transport contract.

The Skill remains fully useful when all publishing is manual.

## Output discipline

For a writing request, return the drafts first. Add diagnosis or evidence notes only when they help the user choose or asked for them.

For a learning request, separate:

- **Observed result**
- **Candidate lesson**
- **Evidence/confounders**
- **Confidence**
- **Promotion status**

Never present an observational pattern as an X ranking law.
