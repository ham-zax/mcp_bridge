# Dedicated MCP Chrome Handoff

Repository: `/home/hamza/repo/websession_mcp_bridge`

Base HEAD: `4cce1815138aa453b20d8f93274b9fad95c7c9f8`

Working arrangement: **sequential continuation in the current dirty `main` worktree**. Do not create another worktree. The current worktree contains the user's broader browser/Local changes plus an in-progress dedicated Windows Chrome migration. The previous agent is stopping mutation so this mission has sole write ownership until it returns.

Authoritative current decision:

- Windows routine browser interaction uses native Vercel Agent Browser 0.34.0.
- Windows browser state is a persistent dedicated MCP Chrome user-data directory, not the user's ordinary Chrome profile.
- The dedicated Chrome launches with remote debugging enabled and an ephemeral port (`--remote-debugging-port=0`), with its endpoint read from that profile's `DevToolsActivePort`.
- `browser-fast` and the full `browser` Chrome DevTools MCP diagnostics surface must target the **same** dedicated Windows Chrome instance/profile.
- `execute.tab` is a fail-closed context token and must not switch tabs, because switching invalidates refs.
- `observe` may explicitly bind/rebind a tab because it immediately returns a fresh snapshot/ref set.
- A target-blank click should automatically follow **exactly one** newly created target inside the same `execute` call. Zero new targets means continue on the current target; multiple new targets must not be guessed.

Current partial implementation already present:

- `providers/browser/windows-chrome.cjs` — new native Windows launcher/helper for the dedicated profile.
- `providers/browser/windows-chrome-runtime.mjs` — new shared WSL-side runtime resolver/endpoint owner.
- `providers/browser/server.mjs` — partially migrated from normal Chrome `--autoConnect` to the shared endpoint via `--browserUrl`.
- `providers/browser-fast/server.mjs` — partially migrated from normal-profile `DevToolsActivePort` to `ensureWindowsChrome()` and changed so `observe` explicitly binds the selected/current tab before snapshotting.
- `providers/browser-fast/windows-runner.cjs` — existing native helper that avoids the Agent Browser Windows daemon inherited-stdio/WSL lifetime hang.

Review findings that this mission must close:

1. Normal-profile attachment is invalid for the intended design and produced real `403 Forbidden`; remove that execution boundary from current Windows code/docs/tests.
2. Strict `--pin-tab` recovery: `tab list` does not rebind after the pinned target is externally closed. `observe` must explicitly rebind a valid target before snapshotting; `execute` must remain validation-only.
3. Target-blank following: real Agent Browser leaves a newly opened target inactive/pinned to the opener. `browser-fast` must detect and follow exactly one newly created target during an execute sequence so subsequent mechanical actions operate on the new target; ambiguous multi-target creation must fail closed.

Repository policy: `CONTRIBUTING.md` requires focused affected-provider tests and the full repository gate for runtime changes. Preserve unrelated dirty work. Do not stage, commit, reset, stash, or clean unless explicitly instructed by the user.

Current wave: one implementation mission, `agent-1-dedicated-windows-browser.md`.
