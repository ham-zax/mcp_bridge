# Local Tool Broker Design

**Status:** Proposed

**Date:** 2026-08-24

## Summary

Replace direct exposure of high-cardinality, tool-centric MCP catalogs with one stable Local Tool Broker surface while preserving the downstream MCPs themselves.

The outer authenticated 1MCP continues to expose the small, stable Dev, Code, and Terminal providers directly. It exposes one additional `local` provider with exactly three tools:

```text
tool_list
tool_schema
tool_call
```

The Local Tool Broker connects to a private inner 1MCP running in normal direct mode. The inner 1MCP owns downstream MCP aggregation, configuration, process lifecycle, namespacing, and transports. Initially it contains only the existing Browser facade. Future tool-centric MCPs may be added behind the same broker when they fit the same security domain and pass the compatibility rules in this document.

The broker is intentionally a **tool broker**, not a transparent implementation of the whole MCP protocol. MCPs that materially depend on native Resources, Prompts, subscriptions, elicitation, sampling, or other client/server primitives require separate evaluation and may remain directly exposed.

## Problem

The current Browser implementation has the right execution architecture but the wrong model-facing catalog boundary.

Today:

```text
ChatGPT
   |
   v
outer authenticated 1MCP
   |
   v
Browser facade
   |
   v
chrome-devtools-mcp
   |
   v
Windows Chrome / WSLg Chrome
```

`providers/browser/server.mjs` is already an MCP client of `chrome-devtools-mcp`. It owns Browser locality and forwards downstream calls correctly. However, it republishes the entire downstream Chrome DevTools tool catalog through its own `tools/list`, so all of those tools become part of the outer 1MCP and ChatGPT connector catalog.

That creates avoidable coupling:

```text
Chrome tool inventory changes
        |
        v
Browser facade tools/list changes
        |
        v
outer 1MCP tools/list changes
        |
        v
ChatGPT connector tool snapshot may need refresh
```

This coupling has already been observable in practice: disabling and re-enabling the ChatGPT app refreshed previously missing Browser and Dev actions even though the providers themselves were already serving their current catalogs.

The desired property is different:

> Adding, removing, or upgrading tools behind an already-authorized local capability domain should not require changing ChatGPT's outer MCP tool table.

## Goals

- Keep Dev, Code, and Terminal direct because they are small, stable, and frequently used.
- Hide the Browser facade's large downstream catalog behind three stable Local broker tools.
- Preserve the complete Chrome DevTools MCP capability set; do not switch to a reduced/slim Chrome tool set merely to shrink the outer catalog.
- Preserve native downstream `CallToolResult` content, including top-level image blocks from screenshots.
- Preserve the existing Browser facade and its Windows/WSLg locality behavior.
- Reuse pinned 1MCP for downstream provider aggregation and lifecycle rather than implementing another general MCP supervisor.
- Let Skills route by stable logical server names such as `browser`, never by generated config paths or provider process paths.
- Allow compatible future tool-centric MCPs to be added or removed behind the Local broker without changing the outer three-tool contract.
- Preserve explicit OAuth/security-domain boundaries.

## Non-goals

- Building a universal MCP-in-MCP proxy for every MCP primitive.
- Reimplementing 1MCP configuration, reconnect, process supervision, namespacing, or transport support.
- Replacing `providers/browser/server.mjs` with custom Chrome automation.
- Changing Chrome DevTools MCP itself.
- Hiding Dev, Code, or Terminal behind generic metatools.
- Combining unrelated trust domains merely to avoid a future OAuth authorization.
- Making downstream tool annotations first-class ChatGPT host annotations through a generic `tool_call`; that metadata can be returned to the model, but the host sees the broker tool as the first-class action.

The browser-automation restriction above bounded this Local-broker migration; it is not a permanent ban on a faster browser executor. A later performance mission adds experimental logical server `browser-fast` behind the unchanged Local broker while retaining `browser` as the Chrome DevTools surface. Any future cutover must preserve the Local three-tool contract and `tag:local` trust boundary.

## Current runtime evidence

The design depends on a distinction in pinned 1MCP 0.36.0 between direct tool routing and its built-in lazy metatools.

### Direct mode preserves downstream results

Installed `@1mcp/agent` direct tool handling namespaces each downstream tool as:

```text
<server>_1mcp_<tool>
```

using `MCP_URI_SEPARATOR = "_1mcp_"`.

For a normal direct downstream tool call, `toolRequestHandlers.js` resolves the server and downstream tool name and returns:

```text
outboundConn.client.callTool(..., CallToolResultSchema, ...)
```

directly. It does not wrap a successful downstream `CallToolResult` in another text result.

This is the behavior the Local Tool Broker should consume.

### Built-in lazy `tool_invoke` is not suitable for Browser

The same runtime's lazy metatool path does this instead:

```text
downstream CallToolResult
        |
        v
{ result: downstreamResult, server, tool }
        |
        v
structuredToolResult(...)
        |
        +-- content: JSON text
        `-- structuredContent: wrapper object
```

A downstream top-level `image/png` content block therefore becomes nested data instead of remaining a native top-level MCP image block.

Consequently:

- do **not** use stock 1MCP `tool_invoke` as the Browser invocation path;
- do use inner 1MCP in normal direct mode for aggregation;
- have the Local Tool Broker call the inner direct tool and return the successful downstream `CallToolResult` unchanged.

Before implementation mutates repository configuration, an isolated runtime probe must confirm this source-level behavior with a real rich-result fixture. See the implementation plan Task 0.

## Target architecture

```text
                         ChatGPT
                            |
                            v
                outer authenticated 1MCP
                            |
          +-----------------+-------------------+
          |                 |                   |
          v                 v                   v
         Dev               Code              Terminal
       7 direct          3 direct           7 direct
          |
          |                 model-facing stable tools
          |
          +-----------------------+
                                  |
                                  v
                         Local Tool Broker
                    +-------------+-------------+
                    |             |             |
                    v             v             v
                 tool_list     tool_schema    tool_call
                                  |
                                  v
                         inner 1MCP DIRECT
                        private stdio child
                                  |
                  +---------------+---------------+
                  |                               |
                  v                               v
             Browser facade                 future eligible MCP
                  |
           +------+------+
           |             |
           v             v
     Windows Chrome    WSLg Chrome
       default         browser_target=linux
```

The outer Local Tool Broker is the only new model-facing abstraction. The inner 1MCP is an implementation detail and is not directly registered with ChatGPT.

## Broker contract

The Local Tool Broker exposes exactly three stable tools.

### `tool_list`

Purpose: discover downstream tool names and concise metadata without loading every downstream schema into the model-facing catalog.

Conceptual input:

```json
{
  "server": "browser",
  "query": "network",
  "limit": 25,
  "cursor": "opaque-cursor"
}
```

`server` may be omitted to search all servers inside that broker's security domain. `query` may be omitted to list the selected server's available tools. `limit` and `cursor` bound discovery so a large downstream catalog cannot recreate model-context bloat through one broker call.

V1 uses an opaque cursor, a default `limit` of 25, and a hard maximum of 100. The result contract is:

```text
{
  tools,
  hasMore,
  nextCursor?
}
```

The broker cursor is opaque to callers and self-contained. It may encode the inner `tools/list` cursor, an intra-page offset, and the effective `server`/`query` filters needed to resume without retaining leftover catalog pages in broker memory. Supplying a cursor with different `server` or `query` parameters is invalid. Cursor state is not a persistent catalog cache; the broker may refetch the relevant inner page when resuming. V1 does not promise transactional snapshot semantics across paginated discovery calls if the downstream catalog changes between calls.

Do not make exact `totalCount` part of the stable contract. Computing it may require enumerating the full inner catalog and would weaken the bounded-discovery property.

Each `tools` entry should remain lightweight and contain compact data such as:

- logical server name;
- downstream tool name;
- title/description;
- relevant annotations when available.

It must not return the entire input schema for every tool by default; detailed tool contracts belong in `tool_schema`.

### `tool_schema`

Purpose: load the full contract for one selected downstream tool.

Conceptual input:

```json
{
  "server": "browser",
  "tool": "navigate_page"
}
```

The result should include the current downstream definition needed by the model, including:

- `inputSchema`;
- `outputSchema` when present;
- description/title;
- annotations when present.

For Browser, this is the Browser facade schema, not the raw Chrome child schema. Therefore the schema continues to include the optional `browser_target` selector added by the facade.

### `tool_call`

Purpose: invoke one selected downstream tool.

Conceptual input:

```json
{
  "server": "browser",
  "tool": "take_screenshot",
  "arguments": {
    "browser_target": "windows"
  }
}
```

The broker converts the logical pair to the inner direct 1MCP qualified name:

```text
browser_1mcp_take_screenshot
```

and calls that tool through its MCP client.

For a successful downstream call, the broker must return the downstream `CallToolResult` **unchanged**. In particular, it must not nest the result under `result`, JSON-stringify its content, or transform native top-level image/audio/resource content into structured data.

Broker-generated errors may use the broker's own normal MCP error/result representation.

## Tool resolution and catalog freshness

The broker treats the inner 1MCP direct `tools/list` as authoritative and uses no broker catalog or schema cache in V1.

The V1 freshness contract is intentionally simple:

```text
tool_list
  -> query current inner tools/list pages and return one bounded broker page

tool_schema
  -> query current inner tools/list pages until the requested qualified tool is found

tool_call
  -> call the qualified inner tool directly
```

Do not subscribe to `notifications/tools/list_changed` or add cache invalidation machinery in this wave. If profiling later shows that repeated catalog traversal is materially expensive, caching may be introduced as a separate optimization with explicit invalidation semantics.

Logical server identity is derived from 1MCP's direct qualified tool names using the pinned separator contract. When interpreting the inner catalog, the broker must reject the reserved logical server name `1mcp` and any downstream server name containing `_1mcp_`; 1MCP parses the first separator, so admitting those names would make the logical route ambiguous. Tool names do not need the same restriction because everything after the first separator is the downstream tool name.

The public Skill-facing identity remains the simple server name, for example:

```text
browser
```

Skills must not embed `_1mcp_` qualified names. Qualified names are an implementation detail of the broker/inner 1MCP boundary.

## Browser ownership

`providers/browser/server.mjs` remains the Browser owner.

It continues to:

- consume pinned `chrome-devtools-mcp` through MCP client transports;
- expose the complete Chrome DevTools tool set internally;
- augment schemas with `browser_target`;
- default to the dedicated persistent Windows MCP Chrome profile when `browser_target` is omitted or `windows`;
- use WSLg Chrome for `browser_target=linux`;
- remove the facade-only target selector before forwarding downstream;
- return downstream `CallToolResult` values unchanged.

The Local Tool Broker must not learn Chrome-specific launch, profile, CDP, WSL, or browser-target rules.

## Configuration ownership

### Outer personal configuration

`config/templates/mcp-personal.json` remains the source of truth for the authenticated outer composition.

After migration its model-facing providers are:

```text
local
code
dev
terminal
```

The direct outer `browser` provider is removed after successful cutover.

The `local` provider starts the repository's Local Tool Broker and is initially tagged only:

```json
["local"]
```

Browser is the first logical server behind this generic Local authorization domain.

### Inner configuration

Add `config/templates/mcp-local.json` as the tracked source of truth for the private inner direct-mode 1MCP.

Initially it contains only the existing Browser facade:

```text
browser -> providers/browser/server.mjs
```

The renderer materializes a private generated inner config beneath the existing bridge state root and supplies that path plus the qualified/pinned 1MCP runtime to the Local Tool Broker.

The inner 1MCP:

- uses stdio between the broker and the inner aggregator;
- runs in normal direct mode, not lazy mode;
- does not expose its own public OAuth server;
- owns downstream MCP connections and lifecycle;
- may use its normal config-watching behavior for inner-provider changes.

Generated state is never hand-edited.

## Security domains

A generic `tool_call(server, tool, arguments)` creates an important authorization boundary: the outer OAuth layer authorizes the broker tool, not a different tag for each value of `server`.

Therefore one Local broker instance must contain only MCPs that legitimately share one security domain.

Initial migration:

```text
tag:local
    |
    v
Local Tool Broker
    |
    v
browser
```

A future provider may join this instance only if granting `tag:local` authority to it is an intentional and accurate security statement.

For a genuinely different trust domain, create another broker instance/scope rather than smuggling it behind `server=`. For example:

```text
local       -> tag:local
local-cloud -> tag:cloud
```

Each broker may still hide a large number of tools behind its own three stable metatools.

Adding/removing tools or providers **inside an already-authorized security domain** should not require a ChatGPT connector tool refresh. Adding a new security domain may require one new OAuth authorization because the outer provider/scope changes.

The Local Broker architecture does not repair an already-stale ChatGPT OAuth authorization request that omits a required scope; it prevents downstream tool-catalog churn from creating future outer tool-table churn once the domain is authorized.

## Downstream MCP compatibility

The Local Tool Broker is deliberately optimized for **tool-centric MCP servers**.

### Eligible by default after qualification

A downstream MCP is a good candidate when its required model-facing contract is primarily:

```text
tools/list
tools/call
```

This includes servers whose tool results contain rich MCP content such as images, audio, or embedded resources, provided the broker's raw `tool_call` forwarding preserves those results.

### Requires explicit evaluation

Do not assume the broker transparently preserves MCP features outside the tool contract. Servers that materially depend on native:

- Resources;
- Prompts;
- subscriptions/notifications;
- elicitation;
- sampling;
- server-specific client capabilities;
- other protocol primitives that must remain first-class at the ChatGPT host boundary

should remain directly exposed or receive a deliberately designed adapter.

Do not turn `tool_list/tool_schema/tool_call` into a universal reimplementation of the evolving MCP protocol.

## Model-facing metadata trade-off

The current direct Browser surface lets ChatGPT see each Chrome action as a first-class MCP tool with its own annotations.

After migration ChatGPT sees one generic `tool_call`. Per-downstream-tool annotations can still be returned by `tool_list`/`tool_schema` and followed by the model/Skill, but they are no longer separate host-level annotations on each Browser action.

Therefore `tool_call` must be annotated conservatively as a potentially mutating/open-world action. Do not represent it as read-only merely because some downstream actions are read-only.

This is an intentional trade-off for catalog stability and must be part of acceptance review.

## Skill routing

Skills choose logical capabilities. They do not choose config files, generated state paths, child commands, or 1MCP-qualified names.

### Browser

`skills/agent-browser/SKILL.md` owns the Browser route after migration:

```text
agent-browser
    |
    v
Local broker
    |
    +-- tool_list(server="browser", ...)
    +-- tool_schema(server="browser", tool="...")
    `-- tool_call(server="browser", tool="...", arguments={...})
    |
    v
Browser facade
```

The Skill should instruct the model to:

- call `tool_list` with `server="browser"` and a narrow query when the appropriate Browser action is not known;
- call `tool_schema` only when the selected action's schema is not already known in the conversation;
- call `tool_call` directly once the action/schema is known;
- reuse known action schemas during the session rather than rediscovering them every turn;
- omit `arguments.browser_target` for the dedicated persistent Windows MCP Chrome target;
- set `arguments.browser_target="linux"` for the resource-local WSLg target;
- keep isolated/fresh browser or Electron automation on the existing agent-browser CLI path when neither dedicated Windows MCP Chrome nor resource-local WSLg state is required.

The Skill must never need to know `mcp-local.json`, generated inner config paths, provider file paths, or `_1mcp_` qualified names.

### Other Skills

A future domain Skill follows the same ownership rule:

```text
domain Skill
  -> stable logical server name
  -> Local broker discovery/schema/call
  -> configured downstream MCP
```

Changing how a logical server is launched or where its config lives must not require a Skill update. Renaming the logical server or changing its domain semantics does.

`mcp-harness-router` remains focused on the direct Dev, Code, Terminal, wait, and command-execution primitives. Do not duplicate Browser-specific Local policy there.

## Why this is better than the current Browser surface

It does not add Browser capability; the current Browser facade already provides the full functionality.

It improves the control plane:

| Property | Current direct Browser | Local Tool Broker |
| --- | --- | --- |
| Full Chrome DevTools capability | yes | yes |
| Windows + WSLg routing | yes | yes |
| Native screenshot/image result | yes | yes, required |
| Per-tool host annotations | yes | no; broker is generic |
| Outer tool-table stability when Chrome changes | no | yes |
| New tool-centric MCP in same security domain changes outer catalog | yes | no |
| Extra first-use discovery/schema call | no | usually yes |
| Full non-tool MCP transparency | direct host may support it | not promised |

The migration is worthwhile only if native rich results and Browser behavior remain equivalent while outer catalog churn is removed.

## Failure and recovery rules

| Failure | Required behavior |
| --- | --- |
| inner 1MCP direct call does not preserve rich result | stop migration; keep Browser direct |
| logical server not found | broker returns explicit unknown-server error |
| `tool_schema` target not found | traverse the current inner catalog, then return an explicit unknown-tool error |
| `tool_call` target is absent or downstream rejects the call | preserve the direct inner/downstream MCP `isError` result unchanged; do not add a hidden schema preflight |
| schema changed after discovery | downstream validation error is surfaced; model reloads schema |
| inner 1MCP unavailable | broker returns bounded backend-unavailable error; do not bypass it with shell automation |
| Browser Windows target has no CDP endpoint | preserve current Browser diagnostic; do not silently switch to Linux |
| provider requires native non-tool MCP primitives | do not place it behind this broker without separate design |
| future provider requires different trust domain | use a separate broker/security scope |
| ChatGPT has stale OAuth scope request | fix/recreate authorization at the outer app boundary; inner catalog changes are unrelated |

## Acceptance criteria

The Browser migration is complete only when all of the following are true:

1. An isolated pre-mutation probe proves pinned inner direct-mode 1MCP returns a top-level downstream image block unchanged through a direct tool call.
2. Outer personal `tools/list` exposes the existing 7 Dev, 3 Code, 7 Terminal, and exactly 3 Local broker tools, with no direct `browser_*` actions.
3. Public/restricted profiles remain single-layer and do not gain Local/Browser authority.
4. Bounded/paginated `tool_list(server="browser")` can traverse the Browser facade's complete current action inventory using concise metadata without returning the whole catalog in one response.
5. `tool_schema(server="browser", tool="...")` returns the facade schema, including `browser_target` for Browser actions.
6. `tool_call` reaches both the default Windows target and explicit Linux target through the existing Browser facade.
7. `tool_call` for `take_screenshot` returns native top-level MCP image content rather than JSON-wrapped image data.
8. Adding/removing a downstream Browser tool changes Local discovery results without changing the outer three-tool broker catalog.
9. The Local provider is authorized through the `local` security domain.
10. Required generated-config/model-surface tests and the repository full verification gate pass.

## Relationship to the existing Browser design

This design supersedes only the **model-facing direct publication of the Browser facade's full tool catalog** after successful migration.

It preserves:

- `providers/browser/server.mjs` as the Browser owner;
- the pinned Chrome DevTools MCP integration;
- Windows/WSLg locality selection;
- resource-local Chrome child ownership;
- native downstream `CallToolResult` forwarding;
- the separation of Local capability authority from Dev/Code/Terminal through `tag:local`.

If the Local Broker cannot preserve those properties, the existing direct Browser architecture remains the fallback and the cutover must not proceed.
