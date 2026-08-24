# Browser Fast Windows Agent Browser Implementation Plan

**Status:** Revised, implemented, and rolled out on 2026-08-24. Windows now uses a dedicated persistent MCP Chrome user-data directory shared by `browser-fast` and the DevTools `browser` facade. The earlier normal-profile attachment design is superseded.

**Goal:** Replace the Windows `browser-fast` Chrome DevTools interaction adapter with pinned native Agent Browser 0.34.0 while preserving the compact `observe`/`execute` contract, wrong-tab fail-closed guarantees, and the existing Chrome DevTools `browser` diagnostics surface.

**Architecture:** `browser-fast` uses Agent Browser 0.34.0 on both Windows and Linux. A shared Windows runtime owns `%LOCALAPPDATA%\\mcp-dev-bridge\\chrome-profile`, launches visible Chrome with `--user-data-dir` and `--remote-debugging-port=0` when needed, health-checks the resulting `DevToolsActivePort`, and returns the loopback endpoints. Native Agent Browser consumes the WebSocket endpoint; Chrome DevTools MCP consumes the HTTP endpoint, so both logical surfaces inspect the same persistent MCP browser state. Everyday Chrome is outside this boundary. A separate native Windows one-shot Node helper owns Agent Browser's redirected stdout/stderr files and waits for the short-lived CLI exit, preventing the persistent daemon from inheriting the WSL interop lifetime. `execute.tab` remains validation-only; `observe` explicitly binds its selected/current target before snapshotting, which also recovers strict pinning after an externally closed target.

**Tech Stack:** Node.js 24, MCP SDK 1.30.0, Agent Browser 0.34.0 native Rust binaries, Windows/WSL interop, Chrome DevTools Protocol, existing Local broker/1MCP composition.

## Global Constraints

- Keep the outer ChatGPT surface unchanged: only Local `tool_list`, `tool_schema`, and `tool_call`; `browser-fast` remains private behind Local.
- Keep `browser-fast` model-facing tools exactly `observe` and `execute`; `execute.tab` remains required.
- Keep complete browser-fast operations serialized per browser target so another request cannot change shared browser session state between tab-context validation, actions, and final observation.
- Use Agent Browser 0.34.0 as the routine interaction engine on both Windows and Linux; keep logical `browser` on Chrome DevTools MCP 1.7.0 for diagnostics.
- Keep the everyday Windows Chrome user-data directory outside MCP control. Own only `%LOCALAPPDATA%\\mcp-dev-bridge\\chrome-profile`, launch it visibly with `--remote-debugging-port=0`, and reuse the profile across restarts.
- Pass `--pin-tab` for Windows and Linux. Prefer Agent Browser CDP `targetId` as normalized `tab_id`; do not rely on per-daemon `t<N>` labels for cross-call identity.
- Do not reintroduce host-file upload in `browser-fast` V1.
- Do not add Task Scheduler, a Windows service, PowerShell process supervision, or another daemon manager. Work around the documented cold-start inherited-stdio issue at the caller boundary only.
- Preserve bounded output and truthful `completed` / `failed` / `unknown` / `not_run` semantics with no automatic action retry.
- Repository policy requires focused affected-provider tests and the full verification gate before completion.

## Files and Ownership

| File | Responsibility |
|---|---|
| `providers/browser/windows-chrome-runtime.mjs` | Shared WSL-side owner for the dedicated Windows MCP Chrome profile and its current DevTools endpoints |
| `providers/browser/windows-chrome.cjs` | Native Windows one-shot launcher/health-check helper for the persistent MCP Chrome profile |
| `providers/browser-fast/server.mjs` | Own both Agent Browser backends, helper invocation, operation serialization, tab recovery, and normalized observe/execute results |
| `providers/browser-fast/windows-runner.cjs` | Native Windows one-shot process boundary that redirects Agent Browser output to bounded files and returns only after the short-lived CLI exits |
| `providers/browser-fast/test/server.test.mjs` | Cover the stable facade contract, Windows native runner invocation/cold-start capture semantics, tab-context fail-closed behavior, and target-id normalization |
| `README.md` | Keep the user-facing routine-interaction vs diagnostics split accurate |
| `providers/README.md` | Describe Agent Browser as the interaction backend on both OSes |
| `docs/architecture.md` | Replace the hybrid Windows DevTools interaction architecture with unified Agent Browser interaction plus DevTools diagnostics |
| `docs/configuration.md` | Document Windows native Agent Browser runtime and exact Chrome attachment prerequisite |
| `docs/development.md` | Describe the provider as Agent Browser on Windows and Linux |
| `docs/operations.md` | Document Windows binary materialization, `DevToolsActivePort`, and cold-start caller mitigation |
| `docs/security.md` | Preserve required tab/serialization/pin-tab safety without obsolete generation-scoped DevTools IDs |
| `docs/personal/harness.md` | Keep routing instructions aligned with required `active_tab`/`execute.tab` contract |
| `skills/agent-browser/SKILL.md` | Keep ChatGPT routing aligned with the unchanged facade and stable observed tab context |
| `skills/SNAPSHOT_SHA256.txt` | Update tracked Skill integrity hash if Skill text changes |

### Task 1: Replace the Windows interaction executor with native Agent Browser

**Files:**
- Modify: `providers/browser-fast/server.mjs`

**Interfaces:**
- Consumes: pinned `agent-browser@0.34.0` package binary, shared dedicated Windows Chrome runtime endpoints, existing action-command arrays, existing `FastBrowser` per-target lock.
- Produces: one `AgentBrowserRunner.batch(target, commands, {bail, tab})` contract for both Windows and Linux.

**Steps:**
- [x] Delete `WindowsChromeRunner`, Chrome DevTools page/result parsing, generation IDs, manual page routing, popup detection, form coalescing, and the `ChromeChild` dependency from `browser-fast`.
- [x] Resolve `%LOCALAPPDATA%` through the existing Windows `cmd.exe` boundary and materialize the pinned native executable plus the one-shot Windows helper into `%LOCALAPPDATA%\\mcp-dev-bridge\\agent-browser\\0.34.0` when absent or changed.
- [x] Replace normal-profile attachment with the shared dedicated Chrome runtime. Launch `%LOCALAPPDATA%\\mcp-dev-bridge\\chrome-profile` using an ephemeral debugging port, read its `DevToolsActivePort`, and share the resulting endpoint with Agent Browser and Chrome DevTools MCP.
- [x] Add a native Windows one-shot Node helper that redirects Agent Browser stdout/stderr to bounded temporary files, feeds batch JSON on stdin, waits on the short-lived CLI `exit` event rather than inherited pipe EOF, reads/removes the files, and returns one JSON envelope to WSL. Reject output exceeding the existing 4 MiB provider bound.
- [x] Invoke native Windows Agent Browser with the fixed session, direct `--cdp` endpoint, `--pin-tab`, disabled idle timeout, and existing max-output cap. Keep Linux on the existing Node CLI/WSLg path.
- [x] Validate `execute.tab` with an always-bailing Agent Browser `tab list` precondition inside the same per-target facade lock. Require the current pinned CDP `targetId` to equal the observed tab and do not switch during validation because switching invalidates snapshot refs. Dispatch the action batch only after validation succeeds; explicit switching remains Agent Browser's job through `observe(tab=...)` or `tab_switch`.
- [x] Leave the Windows attached Agent Browser session/browser state persistent across provider shutdown; close only the Linux provider-owned session.

**Acceptance criteria:**
- Windows routine interaction no longer imports or invokes Chrome DevTools MCP from `browser-fast`.
- A cold native Windows Agent Browser invocation cannot hold the provider waiting for stdout/stderr EOF after the CLI process exits.
- Windows starts or reuses only the dedicated MCP Chrome profile and never requires debugging to be enabled on everyday Chrome.
- Tab-context validation and action dispatch remain inside one complete-operation lock; validation always bails before the independently configured action batch and does not invalidate observation refs by switching.

### Task 2: Normalize stable Agent Browser tab identity and preserve facade safety

**Files:**
- Modify: `providers/browser-fast/server.mjs`
- Modify: `providers/browser-fast/test/server.test.mjs`

**Interfaces:**
- Consumes: Agent Browser `tab list --json` entries containing `tabId` and CDP `targetId`.
- Produces: normalized `tabs[].tab_id`, `active_tab`, and required `execute.tab` values that remain valid across Agent Browser daemon restarts while the Chrome target exists.

**Steps:**
- [x] Prefer each tab's `targetId` as normalized `tab_id`, retaining `target_id` explicitly; fall back to Agent Browser `tabId` only when no target ID is returned.
- [x] Keep `execute.tab` required in the MCP schema and keep per-target operation serialization around tab-context validation, actions, and final observation.
- [x] After a click, compare CDP target sets and bind exactly one new target before later actions and final observation; continue on zero new targets and stop without guessing on multiple new targets.
- [x] Replace Windows DevTools-specific tests with focused native-runner contract tests and keep existing partial/unknown/no-retry tests.

**Acceptance criteria:**
- A value returned as `active_tab` can be passed directly to `execute.tab`.
- Another request cannot redirect the pinned tab context during one complete browser-fast operation.
- A target-blank click can continue on exactly one new target inside one `execute`; multiple new targets leave later actions `not_run`.
- Agent Browser daemon restart does not make a stale per-daemon `t<N>` label authoritative because normalized IDs prefer CDP target IDs.

**Required repository validation:**
- `(cd providers/browser-fast && npm test)`

### Task 3: Synchronize current documentation and routing guidance

**Files:**
- Modify: `README.md`
- Modify: `providers/README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/configuration.md`
- Modify: `docs/development.md`
- Modify: `docs/operations.md`
- Modify: `docs/security.md`
- Modify: `docs/personal/harness.md`
- Modify: `skills/agent-browser/SKILL.md` only if backend-specific wording requires it
- Modify: `skills/SNAPSHOT_SHA256.txt` only if tracked Skill bytes change

**Interfaces:**
- Consumes: Task 1 runtime behavior and Task 2 tab contract.
- Produces: one current system description: Agent Browser for routine Windows/WSLg interaction; Chrome DevTools MCP for diagnostics.

**Steps:**
- [x] Remove current-contract claims that Windows `browser-fast` uses page-ID-routed Chrome DevTools MCP, generation-scoped page IDs, or manual form/popup translation.
- [x] Document the dedicated persistent Windows MCP Chrome profile, ephemeral remote-debugging port, and one-time sign-in model; everyday Chrome remains outside MCP control.
- [x] Document the cold-start inherited-pipe workaround as a native one-shot helper detail, not a new service/supervisor.
- [x] Keep Skill routing focused on `observe` then required `execute.tab`; describe `execute.tab` as context validation rather than tab selection, and leave actual switching to Agent Browser.

**Acceptance criteria:**
- Current docs consistently describe Agent Browser 0.34.0 as the `browser-fast` interaction backend on Windows and Linux.
- Current docs consistently keep `browser` as the Chrome DevTools diagnostics surface.
- No current documentation advertises the removed Windows DevTools interaction adapter.

### Task 4: Qualify, verify, and roll out the exact candidate

**Files:**
- No new source files unless a verification failure proves one is required.

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: verified working tree and live private provider process using the new backend.

**Steps:**
- [x] Run the affected Browser Fast provider suite and candidate-final syntax/doc/checksum checks.
- [x] Qualify the dedicated Windows MCP Chrome runtime directly: it launched the persistent profile on an ephemeral port, Agent Browser observed it successfully, and Chrome DevTools MCP `list_pages` connected to the same live page.
- [x] Run the repository-mandated full gate from `CONTRIBUTING.md` against the exact candidate. One unrelated Terminal dead-pane timing test failed on the first aggregate pass, passed immediately in isolation, and the full Terminal suite plus the remainder of the gate then passed unchanged.
- [x] Restart the canonical bridge and verify the live Local catalog still exposes exactly `browser-fast/observe` and `browser-fast/execute`; the live `execute.tab` schema explicitly validates pinned context without switching.
- [x] Remove the normal-profile remote-debugging prerequisite entirely. Everyday Chrome is not an execution target; first Windows use launches/reuses the visible MCP profile and the user signs into that profile separately when needed.

**Acceptance criteria:**
- All mandatory repository checks pass, or any unrelated pre-existing/flaky failure is reported with direct evidence rather than hidden.
- Live Local discovery still exposes only `browser-fast/observe` and `browser-fast/execute` behind the unchanged outer Local surface.
- Windows `browser-fast` source/runtime uses native Agent Browser rather than Chrome DevTools MCP.
- No disposable qualification processes/files remain after the proof.
