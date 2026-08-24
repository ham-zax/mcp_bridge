# Local Tool Broker Implementation Plan

**Goal:** Replace the direct model-facing Browser tool catalog with a stable three-tool Local Tool Broker while preserving the existing Browser facade, full Chrome DevTools MCP capability, Windows/WSLg routing, native rich `CallToolResult` content, and current Browser authorization domain. Establish the same broker boundary for future compatible tool-centric MCPs without claiming universal MCP transparency.

**Architecture:** Keep the authenticated outer 1MCP and direct Dev/Code/Terminal surfaces. Add one repository-owned Local Tool Broker exposing `tool_list`, `tool_schema`, and `tool_call`. The broker owns an MCP client connected over stdio to a private inner 1MCP running in normal direct mode. The inner 1MCP initially aggregates only the existing Browser facade and namespaces its tools as `browser_1mcp_<tool>`. The broker presents stable logical `{server,tool}` identities to Skills, resolves them to inner qualified names, and returns successful downstream `CallToolResult` values unchanged. Stock 1MCP lazy `tool_invoke` is not used.

**Tech Stack:** Node.js ESM; `@modelcontextprotocol/sdk` 1.30.0; Zod 4.4.3 where schema declarations need it; pinned `@1mcp/agent` 0.36.0; existing Browser facade and pinned Chrome DevTools MCP 1.7.0; current renderer/bridge lifecycle.

**Design:** `docs/superpowers/specs/2026-08-24-local-capability-hub-design.md`

## Global constraints

- Do not stage or commit implementation-plan/document changes merely to inspect or iterate on this plan.
- Preserve direct Dev, Code, and Terminal model-facing providers.
- Preserve `providers/browser/server.mjs` as the Browser execution/locality owner; do not replace Chrome DevTools MCP with custom browser automation.
- Preserve the complete Browser tool set behind the broker. Do not adopt Chrome's `--slim` mode as a substitute for this design.
- Do not use stock 1MCP lazy `tool_invoke` for Browser or any provider whose native rich results must remain top-level MCP content.
- Inner 1MCP must run in normal direct mode. The outer Local broker is responsible for stable discovery/schema/call projection.
- Successful `tool_call` must return the downstream `CallToolResult` unchanged. Do not wrap it under `result`, stringify it, or translate native image/audio/resource content into JSON.
- Keep Skills on stable logical server names such as `browser`. Skills must not know generated config paths, provider process paths, or `_1mcp_` qualified names.
- Keep `browser_target` inside the selected Browser tool's downstream `arguments`; the generic broker must not acquire Browser-specific parameters.
- Do not expose inner 1MCP internal `1mcp_1mcp_*` tools through the broker.
- One Local broker instance represents one OAuth/security domain. Do not add unrelated future MCPs to the Browser-authorized broker solely for convenience.
- The initial migration keeps the existing Browser authority: outer `local` is tagged only `browser`.
- Public/restricted profiles remain single-layer and must not gain Browser/Local personal authority.
- Treat the broker as a tools-only abstraction. Do not add generic Resources, Prompts, subscriptions, elicitation, sampling, or other MCP-protocol emulation in this wave.
- Do not create a second generic MCP supervisor. Reuse inner direct 1MCP for downstream provider lifecycle, transport, namespacing, and config reload.
- Do not create another persistent tool registry or broker catalog/schema cache in V1. Inner `tools/list` remains authoritative on every discovery/schema lookup.
- Keep `tool_list` bounded with an opaque cursor, default `limit=25`, and hard maximum `limit=100`; do not make exact `totalCount` part of the stable V1 contract.
- Reserve logical server name `1mcp` and reject downstream server names containing `_1mcp_`; tool names may contain the separator because parsing splits only at the first occurrence.
- Preserve current Browser result semantics and current downstream Chrome child ownership.
- Generated inner configuration lives under the external bridge state root and is never hand-edited.
- Because this changes generated configuration and the model-facing tool surface, update the repository-required tests in the same wave per `CONTRIBUTING.md`.
- Run focused tests during implementation. Run the current full verification gate from `docs/development.md` once at candidate-final state before live cutover.
- Preserve unrelated dirty work.

## Verified pinned-runtime facts

Source inspection of installed 1MCP 0.36.0 establishes two important facts that implementation may rely on, but Task 0 must still prove end-to-end behavior with an isolated rich-result fixture:

1. Direct-mode 1MCP publishes downstream tools as:

   ```text
   <server>_1mcp_<tool>
   ```

   using `MCP_URI_SEPARATOR = "_1mcp_"`.

2. Direct `tools/call` handling resolves the downstream server/tool and returns `outboundConn.client.callTool(..., CallToolResultSchema, ...)` directly. The `structuredToolResult(...)` wrapper is used by lazy/internal metatool paths, not ordinary direct downstream calls.

The design therefore does not require a custom downstream aggregator merely to preserve rich results.

---

## Task 0: Qualify inner direct 1MCP before repository mutation

**Mutation:** none. Use temporary files/processes outside tracked source.

**Purpose:** prove the exact transport/result contract that makes the architecture safe before changing any repository configuration or Browser routing.

### Steps

- [ ] Record the pinned runtime path/version and verify it is `@1mcp/agent@0.36.0`.
- [ ] Confirm from installed source that `MCP_URI_SEPARATOR` is `_1mcp_`, direct list mapping qualifies names as `<server>_1mcp_<tool>`, and ordinary direct calls return the downstream `CallToolResult` instead of `structuredToolResult(...)`.
- [ ] Start a temporary fixture MCP that exposes at least:
  - one text tool;
  - one tool returning a top-level `image` content block with a small deterministic PNG fixture.
- [ ] Start one temporary inner 1MCP in normal direct stdio mode with only that fixture configured.
- [ ] Through a temporary MCP client, verify:
  - direct `tools/list` contains the qualified fixture tool names;
  - direct text call preserves text content;
  - direct image call returns a top-level `content[]` item with `type="image"` and the original MIME/data, not nested JSON text.
- [ ] Verify a qualified unknown tool/server produces a bounded deterministic error.
- [ ] Tear down all temporary processes/files.

### Stop condition

If the image result is wrapped, flattened, or otherwise loses native top-level MCP semantics, **stop this migration before Task 1**. Keep Browser direct and reassess the transport boundary. Do not fall back to stock lazy `tool_invoke` and do not immediately build another generic aggregator.

### Acceptance

- Pinned direct 1MCP qualification passes with native rich result preservation.
- No repository source/configuration is changed by the qualification.

---

## Task 1: Implement the Local Tool Broker

**Files:**

- Create: `providers/local-tools/.gitignore`
- Create: `providers/local-tools/package.json`
- Create: `providers/local-tools/package-lock.json`
- Create: `providers/local-tools/server.mjs`
- Create: focused tests under `providers/local-tools/test/`

### Contract

The provider exposes exactly:

```text
tool_list
tool_schema
tool_call
```

It starts/connects to the private inner 1MCP using paths supplied by rendered deployment configuration.

### Steps

- [ ] Create the provider using the existing MCP SDK/version conventions used by other in-repo providers.
- [ ] Start one private inner 1MCP child over stdio in **direct mode** using the rendered inner config. Use the repository-qualified/pinned 1MCP runtime; do not invoke an unqualified arbitrary executable if the existing runtime helper can identify the pinned entrypoint.
- [ ] Use an MCP `Client`/stdio transport to communicate with inner 1MCP.
- [ ] Implement complete inner `tools/list` pagination so discovery/schema lookup does not silently omit downstream tools.
- [ ] Parse inner qualified names using the pinned `_1mcp_` first-separator contract and project them as logical `{server,tool}` identities.
- [ ] Reject the reserved logical server name `1mcp` and any downstream server name containing `_1mcp_`; only configured, unambiguous downstream server namespaces are broker-visible.
- [ ] Implement `tool_list({server?,query?,limit?,cursor?})` with concise current metadata and filtering. Use an opaque self-contained cursor, default `limit=25`, hard maximum `limit=100`, and return `{tools,hasMore,nextCursor?}` without mandatory `totalCount`. The cursor may encode the inner list cursor, intra-page offset, and effective `server`/`query` filters so resume does not require a broker page cache; reject cursor reuse with different filters. Do not promise snapshot semantics across calls and do not dump all schemas by default.
- [ ] Implement `tool_schema({server,tool})` by traversing the current inner `tools/list` pages until the exact qualified tool is found, then return the current facade definition including annotations and input/output schemas where present.
- [ ] Implement `tool_call({server,tool,arguments?})` by validating the logical server/security boundary, resolving the exact qualified inner name, and calling inner 1MCP directly. Do not add a hidden `tool_schema`/catalog preflight before invocation.
- [ ] Return the inner/downstream `CallToolResult` unchanged from the broker handler, including normal downstream `isError` results.
- [ ] Do not introduce an independent JSON-schema validation framework merely to duplicate downstream MCP validation. Reject malformed broker routing fields locally; let the selected downstream tool/inner MCP enforce its tool arguments.
- [ ] Keep V1 cache-free: `tool_list` and `tool_schema` query current inner catalog state and `tool_call` dispatches directly. Do not subscribe to list-change notifications or add cache invalidation machinery in this wave.
- [ ] Ensure child shutdown/transport failure is bounded and does not orphan an inner 1MCP process.
- [ ] Keep broker tool annotations conservative: `tool_call` can reach mutating/open-world downstream actions.

### Focused tests

Use the existing Node test framework. Cover at least:

- [ ] exact broker catalog: three model-facing broker tools only;
- [ ] bounded list by server/query with default limit, hard maximum, opaque self-contained cursor, `hasMore`, and optional `nextCursor`;
- [ ] cursor resume works from the encoded inner cursor/intra-page offset without broker page caching, rejects changed filters, and does not claim snapshot semantics;
- [ ] list results stay lightweight and omit full schemas;
- [ ] schema projection preserves downstream schema/annotations;
- [ ] `server="1mcp"` and downstream server names containing `_1mcp_` are not discoverable/invokable;
- [ ] tool names containing `_1mcp_` still resolve correctly after the first separator;
- [ ] unknown server behavior, `tool_schema` unknown-tool behavior, and direct `tool_call` preservation of downstream `isError` results;
- [ ] catalog additions/removals/schema changes are observed on the next `tool_list`/`tool_schema` lookup without broker cache invalidation machinery;
- [ ] `tool_call` returns a downstream image block top-level unchanged;
- [ ] text/structured downstream results remain valid;
- [ ] inner transport failure is explicit/bounded;
- [ ] broker shutdown does not leave its private inner child running.

### Acceptance

- The provider has one clear responsibility: stable tool discovery/schema/raw-call projection over inner direct 1MCP.
- It contains no Browser-specific launch/locality logic.
- Rich downstream tool results remain native.

---

## Task 2: Render the inner direct composition and replace outer direct Browser

**Files:**

- Create: `config/templates/mcp-local.json`
- Modify: `config/templates/mcp-personal.json`
- Modify: `scripts/render-config.mjs`
- Modify: setup/runtime dependency checks only as required for the new provider/config artifact.
- Modify: `scripts/bootstrap-personal.sh`
- Modify: `docs/development.md`
- Modify: `CONTRIBUTING.md`
- Modify: `tests/harness.sh`
- Modify: `tests/publication.sh`
- Modify: `scripts/smoke-local.sh`

### Target generated topology

Outer personal composition:

```text
local
code
dev
terminal
```

Inner private composition:

```text
browser
```

### Steps

- [ ] Move the existing Browser provider definition, including its required Windows/WSLg environment, from the outer personal template into `mcp-local.json` without changing Browser semantics.
- [ ] Replace outer `browser` with outer `local` pointing at `providers/local-tools/server.mjs`.
- [ ] Tag outer `local` only `browser` for this migration.
- [ ] Render the inner config to a deterministic private path under the existing external bridge state root.
- [ ] Pass the Local provider the generated inner config path and repository-qualified pinned 1MCP runtime information through its rendered environment/arguments.
- [ ] Keep restricted/trusted-dev profile rendering unchanged and single-layer.
- [ ] Preserve atomic generated-config writes and permissions.
- [ ] Do not add OAuth/public-listener configuration to inner 1MCP.
- [ ] Add `providers/local-tools` to `scripts/bootstrap-personal.sh` using the same dependency-install pattern as the other in-repo personal providers.
- [ ] Add the Local broker provider suite/install/syntax-check ownership to `docs/development.md` and the mandatory merge-gate provider suite to `CONTRIBUTING.md` so the repository's normal verification contract includes the new provider.

### Mandatory existing test migration

`CONTRIBUTING.md` requires test updates because both generated configuration and model-facing tools change.

Update `tests/harness.sh`, `tests/publication.sh`, and `scripts/smoke-local.sh` to prove at least:

- [ ] personal outer provider inventory is exactly `local`, `code`, `dev`, `terminal`;
- [ ] direct outer `browser` is absent after cutover;
- [ ] outer `local` points to the Local broker and has exactly `tags: ["browser"]`;
- [ ] Local is configured with the expected generated inner config path and qualified pinned inner 1MCP runtime contract;
- [ ] generated inner config exists in private state and contains exactly the Browser facade as the downstream provider initially;
- [ ] Browser's current WSLg/runtime environment moved intact to the inner Browser entry;
- [ ] restricted and trusted-dev profiles do not gain `local` or Browser authority;
- [ ] `mcp-local.json` and `providers/local-tools/**` remain private-only publication paths;
- [ ] renderer/bootstrap remains deterministic from a clean temporary home/state fixture.

### Acceptance

- Browser is no longer a direct outer provider.
- The inner configuration is private deployment state generated from tracked source.
- Public profiles remain unchanged.

---

## Task 3: Migrate Browser Skill routing to logical Local broker calls

**Files:**

- Modify: `skills/agent-browser/SKILL.md`
- Modify only if needed for a stale cross-domain statement: `skills/mcp-harness-router/SKILL.md`
- Modify: `skills/SNAPSHOT_SHA256.txt`

### Steps

- [ ] Make `agent-browser` own the logical route `server="browser"` through the Local broker.
- [ ] Teach the Skill to use `tool_list` with a narrow query only when the required Browser action is not known.
- [ ] Teach it to call `tool_schema` only when the selected action's schema is not already known in the session.
- [ ] Teach it to invoke known Browser actions with `tool_call(server="browser", tool=..., arguments=...)`.
- [ ] Preserve Browser locality semantics inside `arguments`:
  - omit `browser_target` for normal Windows Chrome;
  - use `browser_target="linux"` for WSLg Chrome.
- [ ] Preserve the existing agent-browser CLI route for isolated/fresh browser or Electron automation when normal Windows/WSLg state is not required.
- [ ] Do not teach the Skill generated config paths, `_1mcp_` qualified names, provider source paths, or inner process commands.
- [ ] Keep `mcp-harness-router` focused on Dev/Code/Terminal/command routing; change it only if current wording directly conflicts with the new Browser ownership.
- [ ] Refresh only changed active Skill checksum entries and validate modified Skill bundles with the repository's Skill validation path.

### Acceptance

- A fresh agent-browser session can discover, schema-load, and invoke Browser actions through the stable logical `browser` server name without seeing implementation paths.
- The Skill does not require downstream Browser catalog changes to be reflected in its instructions unless the semantic workflow itself changes.

---

## Task 4: Update current documentation and provider catalogs

**Files to inspect/update where current claims change:**

- `README.md`
- `providers/README.md`
- `docs/architecture.md`
- `docs/configuration.md`
- `docs/security.md`
- `docs/personal/harness.md`
- `docs/development.md` if provider-layout wording changes
- `docs/operations.md` where live provider/OAuth catalog examples are normative and stale

Historical files under `docs/history/**` remain historical.

### Required documentation contract

- [ ] Outer personal model-facing topology is Dev + Code + Terminal + three Local broker tools, not the full Browser action catalog.
- [ ] Inner direct 1MCP is private implementation state and has no public OAuth endpoint.
- [ ] Browser facade remains the owner of Windows/WSLg routing and Chrome DevTools MCP.
- [ ] Local broker is tools-only, not universal MCP transparency.
- [ ] Successful `tool_call` forwards rich downstream `CallToolResult` content unchanged.
- [ ] Per-downstream-tool host annotations are no longer first-class; `tool_call` is conservatively classified.
- [ ] Outer `local` remains in `tag:browser` for this migration.
- [ ] Future MCPs may join only if they are tool-compatible and belong to the same authorization domain; otherwise use direct exposure or a separate broker/security domain.
- [ ] Adding/removing downstream tools inside an existing broker domain does not change the outer three-tool catalog and should not require a ChatGPT tool-catalog refresh solely for that reason.
- [ ] Adding a new OAuth/security domain remains an outer authorization change and may require reauthorization.

### Acceptance

- No current normative doc tells agents/operators that Browser's full catalog is directly model-facing after cutover.
- No doc claims the broker transparently supports all MCP primitives.

---

## Task 5: Candidate-final verification

Do this on the exact combined candidate before live activation.

### Focused verification

- [ ] Local broker provider test suite passes.
- [ ] Browser provider suite passes unchanged or with only contract-test adjustments genuinely required by the migration.
- [ ] `bash tests/harness.sh` passes with the new outer/inner generated topology.
- [ ] `bash tests/publication.sh` passes with the new private publication boundary.
- [ ] `bash scripts/smoke-local.sh` passes with the new outer/inner generated topology.
- [ ] modified Skill validation/checksums pass.
- [ ] `node scripts/check-doc-links.mjs` passes.
- [ ] `git diff --check` passes.

### Full repository gate

Run the **current Full verification section in `docs/development.md`**, not a stale copied command list, once at candidate-final state.

If any code/config changes after that gate, the new state is a new candidate and must be reverified as required by repository policy.

---

## Task 6: Live cutover and acceptance

Do not activate before Task 5 is green.

### Activation

- [ ] Re-render the personal deployment through the normal renderer so outer and inner configs are generated together.
- [ ] Let the qualified 1MCP config watcher apply ordinary provider-definition changes when it can do so safely; use the narrow documented restart fallback only when source activation requires it or reload failure is observed.
- [ ] Do not restart the Terminal broker or tmux lifetime merely for this Browser catalog migration.
- [ ] Preserve existing OAuth/session state. The outer authorization domain remains `tag:browser`.

### Live acceptance

From a fresh MCP client/product session, verify:

- [ ] outer personal catalog contains the expected direct Dev/Code/Terminal tools and exactly three Local broker tools;
- [ ] no direct `browser_1mcp_*` actions are model-facing;
- [ ] bounded/paginated `tool_list(server="browser")` can traverse the Browser facade's full current tool inventory without returning it all in one response;
- [ ] `tool_schema` for representative actions returns the facade schema and `browser_target` selector;
- [ ] `tool_call` can execute a harmless Windows-target Browser action when Windows Chrome/CDP is available;
- [ ] `tool_call` can execute the corresponding Linux-target path with `arguments.browser_target="linux"`;
- [ ] `take_screenshot` returns a native top-level MCP image block through the complete ChatGPT -> outer 1MCP -> Local Broker -> inner direct 1MCP -> Browser facade path;
- [ ] changing a temporary/fixture inner tool inventory affects `tool_list` but not the outer three-tool Local catalog;
- [ ] Dev still exposes the intended seven-tool catalog with `file_ops` and no `apply_patch`;
- [ ] Terminal remains reachable and existing PTY lifetime is unaffected.

### ChatGPT connector note

This migration intentionally stabilizes future **downstream tool-catalog** changes. The one-time outer cutover from direct Browser actions to three Local tools still changes ChatGPT's outer MCP catalog and therefore requires one connector refresh/re-discovery after deployment.

The migration does not by itself repair an existing ChatGPT OAuth authorization request that omits `tag:browser`. If the client lacks Browser authority, fix that outer authorization separately; do not weaken server-side scope validation.

---

## Future provider admission rule

This section is design policy, not additional implementation scope for the Browser migration.

A future MCP may be added behind an existing Local broker without changing ChatGPT's outer tool catalog only when all of these are true:

1. its required model-facing behavior is primarily MCP Tools;
2. its required tool result content survives raw broker forwarding;
3. it does not require native host exposure of Resources, Prompts, elicitation, sampling, subscriptions, or other protocol capabilities;
4. its trust level legitimately matches the broker's OAuth/security domain;
5. its owning Skill can route by one stable logical server name without knowing deployment paths;
6. provider-specific qualification/tests prove the above before cutover.

If any condition fails, keep that provider direct or design a separate capability-specific adapter. Do not expand the generic broker until a concrete provider requires it.

## Rollback

Rollback is a coordinated outer-surface rollback:

1. restore direct outer `browser` provider composition;
2. remove/disable outer `local` from that Browser domain;
3. restore agent-browser direct Browser tool routing;
4. restore current normative docs/tests together;
5. re-render/reload through the normal deployment boundary.

Do not leave direct Browser and Local Browser exposed indefinitely as parallel model-facing paths. The inner Browser facade itself is unchanged and remains the same execution owner on either side of rollback.

## Final acceptance criteria

The migration is complete when:

- outer ChatGPT-facing Browser access is represented by exactly three stable Local broker tools rather than the Chrome DevTools action catalog;
- the Local broker uses private inner 1MCP in direct mode, not stock lazy `tool_invoke`;
- full Browser capability remains available through logical `server="browser"` discovery/schema/call;
- successful downstream rich results, especially screenshots, remain native top-level MCP content;
- Windows default and explicit Linux Browser locality still work through the existing facade;
- direct Dev/Code/Terminal surfaces remain unchanged;
- outer `local` remains within the existing Browser authorization domain for this migration;
- required generated-config/model-surface tests cover outer and inner composition;
- downstream Browser tool additions/removals no longer change the outer model-facing tool catalog;
- the design is documented as tools-only and does not claim universal MCP compatibility;
- the repository full gate and live product acceptance pass.
