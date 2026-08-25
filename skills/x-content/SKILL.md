---
name: x-content
description: "Create, rewrite, critique, and learn from X/Twitter posts for a technical builder account using reusable evidence-based content memory. Use when ChatGPT needs to turn an idea or source into an X post, Quote, thread, or reply; diagnose a weak draft; generate meaningfully different variants; analyze content patterns; or turn post outcomes into candidate lessons. This Skill owns content intelligence, not Browser mechanics. It composes with agent-browser for read-only X context and keeps actual account mutation on a separate compliant execution path."
---

# X Content

Treat X content strategy as domain knowledge. Do not put hooks, voice, audience language, topic strategy, or viral-writing rules into Browser memory merely because the workflow runs on X.

## Ownership boundary

- **This Skill:** content research, format choice, voice, hooks, wording, structure, critique, variants, replies, and evidence-based learning.
- **Browser memory:** only X site mechanics, stable UI quirks, and operator/site policy. It must not judge whether an opener or phrase is good copy.
- **Generic Browser:** observation and interaction mechanics only. Do not add X content logic to Browser core.
- **Private extension:** optional account-specific/evolving sources. It supplies data paths, not Browser authority.

Use `agent-browser` only when live X context must be inspected. Content drafting and analysis must work without browser access.

## Load evidence progressively

1. Read `references/writing-patterns.md` for the bundled account baseline.
2. For creation, revision, or replies, read `references/workflows.md` only as needed.
3. For learning or private-memory work, read `references/evidence-and-memory.md`.
4. Through Dev, check for:

   `~/.config/mcp-dev-bridge/extensions/enabled/x-content.json`

   If present, read `sources.workspace`. Never infer a private path or bypass disabled extension state.
5. Inside the configured workspace, load only files relevant to the current task. Supported files are `voice.md`, `patterns.md`, `results.md`, `topics.md`, `examples.md`, and `candidates.md`. Missing files are normal.

If the extension is absent, use bundled references plus evidence explicitly supplied in the current conversation. Do not require the extension merely to draft or critique content.

## Evidence precedence

When guidance conflicts, prefer:

1. verified facts and current task context;
2. current measured account outcomes;
3. recently promoted private account patterns with evidence and limitations;
4. bundled account writing rules;
5. external viral-style associations with their stated confidence;
6. general copywriting judgment.

Current examples and measured results outrank stale heuristics. A viral source is evidence about possible structure, not permission to copy its wording or unsupported claims.

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

Before enabling or recommending automated X actions, verify the current official X API and automation rules. Do not use scripted website interaction as a posting automation path. Prefer manual publication or a separately authorized, policy-compliant X API path.

Do not automate Likes. Do not build unsolicited keyword-triggered auto-replies. Automated replies require the recipient's prior intent/opt-in, an easy opt-out, and any additional current X approval requirements; AI-powered automated reply bots require prior written X approval under the current policy. Bulk/aggressive Reposts or follows are not growth tactics.

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
