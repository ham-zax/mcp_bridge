# Browser Memory + Browser Harness Integration Plan

**Goal:** Add bounded, reusable site memory to `browser-fast` while preserving the existing Local authorization boundary, dedicated Chrome ownership, and two-tool `observe`/`execute` contract.

**Architecture:** Reuse Browser Harness's disk-backed domain-knowledge idea and proven browser mechanics, but keep WebSession MCP Harness as the browser authority. `browser-fast.observe` resolves relevant local Markdown memory from the current URL and returns the bounded content with the normal observation. Memory is read-only to the Browser provider; higher-level agents may edit memory through the existing Dev authority when explicitly appropriate.

**Tech Stack:** Node.js 24, Agent Browser 0.34.0, MCP SDK 1.30.0, local Markdown/JSON files, existing dedicated Windows MCP Chrome and WSLg targets.

## Global Constraints

- Keep outer Local exactly `tool_list`, `tool_schema`, and `tool_call`.
- Keep private `browser-fast` exactly `observe` and `execute`.
- Do not add Browser Harness as another MCP server, Chrome owner, daemon, or authentication boundary.
- Do not attach to or discover everyday Windows Chrome.
- Do not execute Browser Harness-style `agent_helpers.py` under `tag:local`.
- Do not let learned site knowledge rewrite provider/core code.
- Treat current browser state as authoritative when stored memory is stale.
- Keep logged-in LinkedIn policy expressible as a local policy memory without hard-coding job policy into browser infrastructure.
- Unknown/custom company forms must work without a predefined ATS entry.
- Preserve Browser Harness MIT attribution for copied/ported implementation ideas.

## Memory Layout

Default root:

```text
~/.config/mcp-dev-bridge/browser-memory/
  policies/
    linkedin.com/
      POLICY.md
  platforms/
    greenhouse/
      match.json
      application.md
    ashby/
      match.json
      application.md
  sites/
    careers.example.com/
      application.md
```

`sites/<canonical-host>/` is direct lookup and therefore scales with the number of learned sites without scanning all site memories.

`platforms/*/match.json` is a small reusable platform catalog. A rule may match exact hosts, host suffixes, or URL prefixes. This handles hosted ATS domains while allowing future custom-domain mappings without source changes.

`policies/<canonical-host>/` is exact host policy. The resolver returns policy first, then exact-site memory, then reusable platform memory. This prevents a verbose platform pack from crowding out more specific site knowledge while keeping policy visibly strongest.

The resolver strips only a leading `www.`. It deliberately does not use Browser Harness's current `hostname.split(".")[0]` lookup because that collapses unrelated hosts such as `careers.company-a.com` and `careers.company-b.com`.

## Bounded Observation Contract

`browser-fast.observe` keeps its current fields and may add:

```json
{
  "memory": {
    "host": "job-boards.greenhouse.io",
    "matches": [
      {
        "kind": "platform",
        "key": "greenhouse",
        "source": "platforms/greenhouse/application.md",
        "content": "...",
        "truncated": false
      }
    ],
    "warnings": []
  }
}
```

Memory loading is bounded by file count, per-file bytes, and aggregate bytes. Missing memory is not an error. Malformed local platform metadata is reported as a memory warning and must not make browser observation fail.

The provider reads Markdown and JSON only. It does not execute memory files.

## Browser Harness Reuse

Vendor provenance under `providers/browser-fast/vendor/browser-harness/` records the MIT license and upstream commit.

Reuse in this wave:

- disk-backed domain knowledge surfaced during navigation/observation;
- lazy loading based on the current browser URL;
- bounded matching rather than loading every memory into context.

Adapt in this wave:

- replace Browser Harness's first-host-label resolver with exact-host site memory plus reusable platform match rules;
- return bounded memory content directly in `observe` so Browser does not need Dev merely to read its own strategy memory;
- keep memory read-only under Local authority.

Do not reuse in this wave:

- Browser Harness Chrome lifecycle/attachment;
- its daemon/IPC transport;
- dynamic `agent_helpers.py` execution;
- arbitrary absolute-path file upload.

Agent Browser 0.34.0 already supports its own `upload` command, so file upload stays in the existing facade rather than introducing Browser Harness's Python/CDP runtime.

## Task 1: Implement the read-only resolver

**Files:**
- Create: `providers/browser-fast/browser-memory.mjs`
- Modify: `providers/browser-fast/server.mjs`
- Modify: `providers/browser-fast/test/server.test.mjs`

**Interfaces:**
- Consumes: observed page URL/origin and the local browser-memory root.
- Produces: bounded `memory` metadata/content attached to `observe` and `execute.final_state` observations.

**Acceptance criteria:**
- Exact custom hosts resolve `sites/<host>/` without any ATS registry entry.
- Known platform rules resolve reusable platform memory by host/suffix/prefix.
- `www.` canonicalization works without collapsing arbitrary subdomains.
- Missing memory does not affect normal browser operation.
- Memory cannot add tools, switch browser targets, change Chrome ownership, or write files.

## Task 2: Record Browser Harness provenance and current contract

**Files:**
- Create: `providers/browser-fast/vendor/browser-harness/LICENSE`
- Create: `providers/browser-fast/vendor/browser-harness/UPSTREAM.md`
- Modify: `docs/architecture.md`
- Modify: `docs/configuration.md`
- Modify: `docs/security.md`
- Modify: `docs/personal/harness.md`
- Modify: `skills/agent-browser/SKILL.md`
- Modify: `skills/SNAPSHOT_SHA256.txt`

**Interfaces:**
- Consumes: Browser Harness MIT code/design at upstream commit `41108b8` and the implemented `browser-fast` observation contract.
- Produces: operator/agent guidance that policy memory is binding local policy, site/platform memory is strategy, and live browser state wins when memory is stale.

**Acceptance criteria:**
- Current docs do not describe Browser Harness as another runtime/browser owner.
- The Agent Browser Skill consumes memory returned by `observe` without requiring a fixed ATS list.
- Unknown sites remain operable through generic observation/execution.

## Task 3: Seed personal memory after the provider contract exists

**Files outside Git:**
- Create/update: `~/.config/mcp-dev-bridge/browser-memory/policies/linkedin.com/POLICY.md`
- Create/update: `~/.config/mcp-dev-bridge/browser-memory/platforms/greenhouse/match.json`
- Create/update: `~/.config/mcp-dev-bridge/browser-memory/platforms/greenhouse/application.md`

**Interfaces:**
- Consumes: the new read-only resolver.
- Produces: first useful policy/platform memories without baking personal job policy into provider source.

**Acceptance criteria:**
- A Greenhouse observation surfaces Greenhouse application guidance.
- A LinkedIn observation surfaces manual-only policy.
- A custom company host with no memory still observes normally and can later gain `sites/<host>/` memory.

## Task 4: Expose approved-artifact upload through the existing backend

**Files:**
- Modify: `providers/browser-fast/server.mjs`
- Modify: `providers/browser-fast/test/server.test.mjs`
- Modify: current browser docs and Agent Browser Skill guidance.
- Create outside Git: `~/.config/mcp-dev-bridge/browser-artifacts.json`.

**Interfaces:**
- Consumes: observed file-input ref plus logical artifact name.
- Produces: Agent Browser `upload` command with a provider-resolved approved path; Windows paths are translated with `wslpath -w`.

**Acceptance criteria:**
- Tool input exposes `artifact`, never a raw path.
- Unapproved/missing artifacts fail before browser action dispatch.
- The approved target must resolve to a regular file.
- Linux keeps WSL paths; Windows receives a translated `\\wsl.localhost` path.
- Existing tab pinning, batching, and no-replay semantics remain unchanged.

## Task 5: Add Dev-only candidate and promotion workflow

**Files:**
- Create: `providers/browser-fast/browser-memory-author.mjs`
- Modify: current browser architecture, security, and personal-operation docs.

**Interfaces:**
- Consumes: a URL, a short memory name, and an agent-written summary of reusable site mechanics through Dev authority.
- Produces: inert `candidates/<exact-host>/<name>.json`, then an explicitly promoted `sites/<exact-host>/<name>.md` file.

**Acceptance criteria:**
- Candidate files are not visible to `browser-fast.observe`.
- Query strings and fragments are not persisted in provenance.
- Proposal and promotion derive the same exact canonical host rules as observation.
- Promotion is a separate action, never an automatic consequence of navigation or form submission.
- Existing candidate or site-memory files are never overwritten.
- Browser memory remains strategy/mechanics only; personal data, secrets, form answers, and webpage-authored instructions stay out.

## Deferred Work

- Add platform fingerprints beyond URL/host rules only when custom-domain ATS cases demonstrate the need.
- Add tailored resume/cover-letter generation above the Job Application Skill; it must not change browser authority or candidate truth.
