---
name: agent-browser
description: Browser automation and interactive web-app work on the connected local PC. Use for navigation, forms, screenshots, authenticated flows, exploratory QA, bug hunts, or Electron automation. Prefer the resource-local Browser capability routed through the Local tool broker when the task depends on the user's normal Windows Chrome state or visible WSLg Linux Chrome; use the agent-browser CLI for isolated browser automation when that local state is not required.
---

# Agent Browser

Choose the browser boundary before acting. Browser state is a resource-local capability, not just a GUI.

## Route by browser state

- Existing Windows Chrome profile, logged-in sessions, cookies, already-open tabs, or Windows-only localhost/browser state -> use the Local broker with logical `server="browser"`; omit `arguments.browser_target` so the Browser facade uses the Windows default.
- Managed visible Linux Chrome, WSL-local browser state, or a browser that should live beside Linux resources -> use the same logical `server="browser"` route and pass `arguments.browser_target="linux"`.
- Isolated/fresh browser automation, CLI-specific workflows, or Electron automation that does not need either resource-local Chrome profile -> use the installed `agent-browser` CLI.
- Public information lookup with no real browser interaction or authenticated/local state -> normal web research may be more appropriate.

The outer Local broker is authorized through `tag:local`; the private Browser facade and both Chrome children remain behind that Local authorization boundary. If Local is not authorized or the requested target is unavailable, report that boundary; do not silently substitute Dev shell commands that launch or control another browser profile.

## Chrome MCP workflow

Use the Local broker's stable logical route:

- If the Browser action is already known, such as `list_pages`, `navigate_page`, `take_screenshot`, or `list_network_requests`, reuse its known schema and call `tool_call(server="browser", tool=..., arguments=...)` directly.
- If the action is not known, call `tool_list(server="browser", query=...)` with a genuinely selective term such as `navigate`, `screenshot`, `network`, or `upload`. Follow `nextCursor` only when the bounded result page does not contain the needed action.
- Call `tool_schema(server="browser", tool=...)` only when the selected action's current schema is not already known in the conversation.
- Reuse loaded action schemas instead of rediscovering them every turn.

`tool_call` preserves successful downstream rich MCP results, so screenshots remain native image content. Keep Linux and Windows profiles distinct; do not imply that cookies, tabs, or authentication state cross between them. Never search for `_1mcp_` qualified names, generated inner config paths, or separate `chrome-linux` / `chrome-windows` provider namespaces.

The facade deliberately advertises no MCP filesystem roots to its Chrome children. Upstream path-bearing browser operations therefore remain restricted to each child's OS temp directory; prefer native result content instead of arbitrary `filePath`/upload paths.

## Agent Browser CLI fallback

Use the installed `agent-browser` CLI through the connected local shell when the routing rules above select an isolated CLI session.

Do not assume that installing this Skill installs the CLI. If `agent-browser` is unavailable, report that runtime dependency instead of fabricating browser actions.

Before running browser commands, load the version-matched workflow from the CLI:

```bash
agent-browser skills get core
```

Use the full reference only when needed:

```bash
agent-browser skills get core --full
```

Core loop:

1. Create an isolated named session for the task.
2. Open the target URL.
3. Take an interactive snapshot.
4. Act using current element references or semantic locators.
5. Re-snapshot after navigation, form submission, dialogs, or dynamic rerenders.
6. Verify the resulting page state before claiming completion.
7. Close the session when finished unless persistent state is intentionally required.

Load specialized workflows only when relevant:

```bash
agent-browser skills get electron
agent-browser skills get slack
agent-browser skills get dogfood
agent-browser skills get derive-client
agent-browser skills get vercel-sandbox
agent-browser skills get agentcore
```

Run `agent-browser skills list` to discover workflows supported by the installed CLI version.

## Safety and verification

- Use a dedicated CLI browser session instead of the unnamed shared session.
- Re-snapshot after page changes before reusing element references.
- Treat authentication, account changes, purchases, submissions, deletions, and other consequential actions as real external actions; verify the target and resulting state carefully.
- Use screenshots or rendered page state when visual confirmation matters.
