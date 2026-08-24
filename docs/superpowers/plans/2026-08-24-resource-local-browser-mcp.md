# Resource-Local Browser MCP Implementation Plan

**Goal:** Add first-class browser control to the personal harness through both Linux/WSLg Chrome and native Windows Chrome, while preserving 1MCP as the single inventory/auth gateway and keeping ChatGPT's existing outer lazy tool discovery instead of introducing a second metatool channel.

**Status:** Repository/runtime implementation is live on 1MCP 0.36.0. Completion is intentionally pending the two ChatGPT-owned steps that the repository cannot perform silently: install the tracked `agent-browser` replacement and reauthorize the MCP connection with `tag:browser`, then run Tasks 6-7 through the ChatGPT product path.

**Architecture:** Expose one `browser` MCP facade in the personal 1MCP composition. The facade publishes the Chrome DevTools MCP tool catalog once, defaults calls to the normal native Windows Chrome profile, and routes `browser_target=linux` calls to a managed WSLg Chrome child. Both resource-local children stay internal to the facade and the outward provider uses the single 1MCP authorization tag `browser`. ChatGPT continues to reach direct MCP tools through `mcp-harness-local`/`api_tool`, loading only selected schemas on demand; 1MCP lazy/metatool mode remains disabled.

**Tech Stack:** 1MCP 0.36.0, Chrome DevTools MCP 1.7.0, Node.js/npm/npx on WSL and Windows, WSLg, Windows interop, existing Cloudflare/OAuth bridge, existing personal configuration renderer.

## Global Constraints

- Keep one MCP inventory behind the existing 1MCP process. Do not add a second aggregator, generic Windows proxy, Chrome-specific bridge service, or duplicated MCP protocol implementation.
- Keep 1MCP in normal/direct tool mode for ChatGPT. Do not enable 1MCP lazy/metatool mode as part of this work.
- Preserve native downstream MCP result types. In particular, browser screenshots must remain native image results rather than being wrapped inside `tool_invoke` JSON/text.
- Route by resource locality: Linux browser state is controlled by a Linux MCP process; Windows browser state is controlled by a Windows MCP process.
- Treat browser authority as distinct from `dev`, `code`, and `terminal`. Both browser backends use `tags: ["browser"]` so one `tag:browser` OAuth scope authorizes the browser domain without creating platform-specific OAuth scopes.
- Do not silently expand existing OAuth sessions. Existing clients keep their previously granted scopes until an explicit reauthorization adds `tag:browser`.
- Do not automatically expand the optional WebSession adapter's existing OAuth grant. Browser access through WebSession is a separate future authorization decision.
- Keep Linux-vs-Windows selection inside the Browser facade via one optional `browser_target` argument, not in separate model-facing provider namespaces or a second authorization layer.
- Pin Chrome DevTools MCP to `1.7.0`. Do not use `@latest`.
- Do not enable Chrome DevTools MCP `--slim` initially; the outer ChatGPT catalog already provides schema laziness and the browser capability should retain the full upstream tool set.
- Disable Chrome DevTools MCP usage statistics and CrUX integration on both backends with `--no-usage-statistics` and `--no-performance-crux`.
- Do not hardcode a personal Windows username or home directory in tracked configuration.
- Do not edit generated `~/.local/state/.../1mcp/mcp.json` directly. `config/templates/mcp-personal.json` remains the source of truth.
- Do not restart the Terminal/tmux lifetime service during browser rollout. Browser inventory changes normally hot-reload through 1MCP; the initial rollout needs one bridge/1MCP restart only because it also activates the qualified 1MCP 0.36.0 runtime upgrade.
- Do not create a new worktree for this effort. The current checkout is clean and the browser change has clear file ownership.
- Keep the known pre-existing `tests/publication.sh` personal-deployment-identity failure separate if it still exists. Do not absorb that unrelated cleanup into the browser feature merely to make the gate green.

## Current Evidence

The design is based on the current repository/runtime state observed on 2026-08-24:

- personal 1MCP composition contains only `dev`, `code`, and `terminal` today;
- the renderer already replaces `__RUNTIME_DIR__` and can carry explicit WSLg environment variables into another personal provider;
- WSLg is working for harness-launched Linux GUI applications with `XDG_RUNTIME_DIR`, `WAYLAND_DISPLAY`, `DISPLAY`, and `PULSE_SERVER` populated;
- Linux Chrome is installed as Google Chrome 151.0.7922.169;
- Linux Node/npm/npx are available through the personal harness environment;
- Windows Chrome is installed as 151.0.7922.170;
- Windows Node 24.12.0 and npx 11.6.2 are callable through Windows interop;
- `/mnt/c/Windows/System32/cmd.exe` is the deterministic Windows command boundary and `/mnt/c` avoids the UNC-current-directory fallback seen when Windows `cmd.exe` is launched from a WSL filesystem cwd;
- Chrome DevTools MCP 1.7.0 is the current npm release;
- Chrome DevTools MCP supports direct browser launch, `--autoConnect`, `--browserUrl`, and `--wsEndpoint`;
- Chrome 144+ `--autoConnect` requires remote debugging to be enabled in the target local Chrome through `chrome://inspect/#remote-debugging`;
- isolated 1MCP 0.36.0 qualification loaded the existing Dev/Code/Terminal composition unchanged and completed a real Dev/Bash call;
- isolated 1MCP 0.36.0 hot-reloaded an edited Chrome provider definition without changing its PID and brought the modified provider back online;
- 1MCP 0.36.0 preserves direct rich MCP results: both Linux and Windows `take_screenshot` returned native `image/png` content blocks;
- 1MCP 0.36.0 filters simple tags with OR semantics; the final outward Browser facade carries only `browser`, so one `tag:browser` grant exposes the browser domain;
- current ChatGPT-side access already uses an outer lazy catalog: concrete MCP schemas are loaded with `api_tool.list_resources` only when requested;
- 1MCP metatool `tool_invoke` remains an unnecessary second discovery layer for ChatGPT; direct mode preserves native rich MCP results and the outer `api_tool` catalog already supplies schema laziness.

## Pre-Implementation Qualification — Completed 2026-08-24

The implementation starts only after these runtime assumptions were proved outside the live bridge:

- `@1mcp/agent@0.36.0` started from an isolated config and connected both Chrome DevTools MCP 1.7.0 providers.
- The same 0.36.0 runtime loaded the current generated `dev`, `code`, and `terminal` providers and completed a real `dev/bash` call.
- `chrome-linux/list_pages` launched the managed Linux profile through WSLg; the resulting Chrome process inherited `XDG_RUNTIME_DIR`, `WAYLAND_DISPLAY`, `DISPLAY`, and `PULSE_SERVER` and selected X11 through WSLg by default. Do not claim native Wayland unless explicitly configured later.
- Bare Windows `--autoConnect` timed out against the normal profile. Adding `--user-data-dir=%LOCALAPPDATA%\\Google\\Chrome\\User Data` made `chrome-windows/list_pages` succeed against the normal native Windows Chrome profile. This evidence-driven fallback is therefore the tracked default.
- Both browser backends returned native PNG image blocks from `take_screenshot` through direct 1MCP 0.36.0 semantics.
- Editing the isolated `mcp.json` triggered 1MCP's built-in config watcher and restarted only the changed `chrome-windows` backend; a bridge restart is not required for browser-only config changes.
- 1MCP 0.36.0 contains callback-origin-aware OAuth consent CSP generation and native refresh-token support, so the harness's 0.34.4 source patch is obsolete and must be removed rather than carried forward.

## Chosen Browser Modes

The final model-facing surface is one Browser facade. The two previously qualified launch paths remain internal children rather than separate 1MCP providers:

```text
ChatGPT
  -> api_tool lazy discovery
  -> 1MCP browser tool
  -> Browser facade
       +-- windows (default) -> Windows cmd/npx -> normal native Chrome profile
       `-- linux             -> Linux npx -> managed visible Chrome through WSLg
```

The facade dynamically republishes the pinned Chrome DevTools MCP 1.7.0 tool schemas and adds one optional `browser_target` field. Omission means `windows`; `browser_target=linux` selects WSLg. The field is removed before forwarding, and the downstream `CallToolResult` is returned unchanged so native screenshot image blocks survive.

The Linux child inherits only the WSLg runtime/display variables needed by Chrome DevTools MCP and lets that MCP launch its managed visible profile. The Windows child launches `/mnt/c/Windows/System32/cmd.exe /d /c npx` from `/mnt/c` with `--autoConnect --user-data-dir=%LOCALAPPDATA%\\Google\\Chrome\\User Data`. Windows Chrome remote debugging must be enabled through `chrome://inspect/#remote-debugging` for that target.

Bare Windows `--autoConnect` timed out during qualification; the explicit `%LOCALAPPDATA%` user-data directory is therefore part of the internal qualified child configuration. `--browserUrl` or `--wsEndpoint` remain evidence-driven fallbacks only. Do not add another launcher/proxy layer.

## Authorization Model

Browser access is one capability domain:

```text
tag:dev       -> WSL development/files/shell
 tag:code      -> Code facade
 tag:terminal  -> durable PTY control
 tag:browser   -> Browser facade -> Windows or Linux child
```

The platform is not a permission boundary. `browser_target` identifies locality inside the facade; OAuth controls whether the client may use browser automation at all.

Adding `browser` to the configured server tags makes `tag:browser` available to 1MCP OAuth, but existing access-token sessions retain only their previously granted scopes. Rollout must intentionally prove this behavior before reauthorization:

```text
old ChatGPT grant: code/dev/terminal
        -> Browser remains hidden

explicit ChatGPT reauthorization including browser
        -> the Browser provider becomes visible
```

The optional WebSession adapter currently has its own independently persisted OAuth authorization. Do not reauthorize that credential for `tag:browser` in this mission. Its discovery surface should continue to exclude browser tools until the operator explicitly chooses to grant authenticated-browser control to WebSession clients.

## ChatGPT Tool-Context Strategy

Do not move the personal harness behind 1MCP `tool_list` / `tool_schema` / `tool_invoke`.

For ChatGPT, the intended path is:

```text
mcp-harness-local connector known
        -> api_tool.list_resources(query=<needed capability>)
        -> selected concrete tool schema enters context
        -> direct MCP invocation
```

The router should prefer exact known action names such as `list_pages`, `navigate_page`, `take_screenshot`, or `list_network_requests`. When the exact action is not known, use genuinely selective terms such as `navigate`, `screenshot`, `network`, or `upload`; do not use broad `page`, `chrome`, or `browser` discovery merely to enumerate the upstream catalog.

Known stable browser actions may be reused after discovery within the same session/profile. Do not rediscover the entire Chrome catalog before every browser call.

## Files and Ownership

| File | Responsibility |
|---|---|
| `providers/browser/` | one Browser facade; dynamically reuses Chrome DevTools MCP schemas, routes by `browser_target`, and forwards native results unchanged |
| `config/templates/mcp-personal.json` | authoritative personal inventory; expose only the Browser facade with the `browser` tag |
| `scripts/bootstrap-personal.sh` | install the Browser facade's pinned MCP SDK dependency tree with the other private providers |
| `scripts/smoke-local.sh` | generated personal provider-set and provider-shape smoke contract |
| `tests/harness.sh` | rendered personal composition contract required by repository policy for generated/model-facing configuration changes |
| `README.md` | stop describing the personal harness as only the existing three domains; introduce Browser without enumerating the full upstream tool catalog |
| `docs/architecture.md` | document browser as a fourth personal capability domain and keep 1MCP direct/outer-lazy architecture explicit |
| `docs/configuration.md` | document the single Browser provider, internal resource-local child ownership, and `tag:browser` |
| `docs/personal/harness.md` | operator/user mental model for choosing Linux vs Windows browser state |
| `docs/security.md` | define authenticated-browser authority as distinct from dev/code/terminal and document explicit reauthorization |
| `docs/operations.md` | rollout, Chrome remote-debugging prerequisite for Windows, scoped restart, reauthorization, rollback |

Do not modify `scripts/render-config.mjs` unless implementation proves a missing placeholder or rendering capability. The current renderer already supports the required provider fields and `__RUNTIME_DIR__` substitution.

Do not add another browser proxy, daemon, or launcher layer around the thin Browser facade. The facade exists only to deduplicate the model-facing catalog and preserve resource-local child execution.

### Task 1: Expose one Browser facade in the personal 1MCP composition

**Files:**
- Create: `providers/browser/package.json`
- Create: `providers/browser/package-lock.json`
- Create: `providers/browser/server.mjs`
- Test: `providers/browser/test/server.test.mjs`
- Modify: `config/templates/mcp-personal.json`
- Modify: `scripts/bootstrap-personal.sh`
- Modify: `scripts/smoke-local.sh`
- Modify: `tests/harness.sh`

**Interfaces:**
- Consumes: existing personal config renderer, WSLg runtime placeholder, user PATH, Windows interop, 1MCP server tags.
- Produces: rendered personal inventory containing `browser`, `dev`, `code`, and `terminal`, with the Browser facade authorized by `tag:browser`.

**Steps:**
- [x] Add `providers/browser/server.mjs` as the one model-facing Browser provider, using the pinned MCP SDK already used by in-repo facades.
- [x] Keep the qualified Linux `npx` and Windows `cmd.exe` Chrome DevTools MCP 1.7.0 launch definitions internal to that facade.
- [x] Dynamically reuse the 29 upstream tool schemas and add one optional `browser_target` enum; default Windows, explicit `linux` for WSLg.
- [x] Strip `browser_target` before child invocation and return the downstream `CallToolResult` unchanged.
- [x] Keep `--slim` disabled and do not add `--browserUrl` or `--wsEndpoint` to the default child configuration.
- [x] Update personal provider-set assertions from three to four providers.
- [x] Add exact generated-config assertions for the Browser facade command/path, WSLg env, and `browser` tag.
- [x] Do not alter public `restricted` or `trusted-dev` compositions.

**Acceptance criteria:**
- A rendered personal fixture contains exactly the four intended providers and only the Browser facade carries the `browser` tag.
- Public profiles contain no Chrome provider.
- No tracked file contains a personal Windows username/home path.
- The renderer remains unchanged unless a missing existing capability is demonstrated.

**Required repository validation:**
- `bash tests/harness.sh`
- `git diff --check`

### Task 2: Document the browser locality and authorization contract

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/configuration.md`
- Modify: `docs/personal/harness.md`
- Modify: `docs/security.md`
- Modify: `docs/operations.md`

**Interfaces:**
- Consumes: provider names and `tag:browser` contract from Task 1, existing api_tool discovery semantics, existing OAuth/tag model.
- Produces: one routing/security story used by ChatGPT and operators.

**Steps:**
- [x] Add Browser as a personal harness domain without copying the full Chrome DevTools MCP tool catalog into repository prose.
- [x] Route requests involving the normal existing Windows Chrome profile, already-open Windows tabs, Windows cookies, or Windows-only browser state to the `browser` MCP provider with its default Windows target.
- [x] Route visible/resource-local WSL browser work to the same `browser` provider with `browser_target=linux`; keep isolated/fresh or Electron automation on the `agent-browser` CLI when neither Chrome profile is required.
- [x] State that a manually used Linux Chrome can later use upstream `--autoConnect` without adding another provider architecture.
- [x] Document `tag:browser` as one distinct browser authority shared by both platform backends.
- [x] Document that existing OAuth grants are not widened automatically and ChatGPT must be explicitly reauthorized for browser access.
- [x] Document that WebSession remains on its existing grant unless separately reauthorized; adding browser to ChatGPT does not grant browser control to WebSession clients.

**Acceptance criteria:**
- Documentation has one consistent resource-locality rule and one browser authorization rule.
- No document implies that GUI work must run on Windows merely because it has a GUI.
- No document implies that Linux Chrome and Windows Chrome share profiles/cookies/state.
- No document implies that WebSession automatically gains browser control.
- Router guidance does not require loading the entire Chrome tool catalog before a specific browser action.

**Required repository validation:**
- `node scripts/check-doc-links.mjs`
- `git diff --check`

### Task 3: Preserve the completed runtime qualification evidence

**Files:**
- No tracked file changes unless a qualification result demonstrates that the Task 1 configuration is wrong.

**Interfaces:**
- Consumes: installed Linux/Windows Node+npx, pinned Chrome DevTools MCP package, WSLg environment, Windows Chrome remote-debugging setting.
- Produces: bounded runtime evidence that both provider commands can start in their owning OS before changing the live 1MCP inventory.

**Steps:**
- [x] Invoke real Linux browser tools through isolated 1MCP 0.36.0 and prove the managed WSLg Chrome path.
- [x] Invoke real Windows browser tools through isolated 1MCP 0.36.0 and prove the normal Windows profile with `%LOCALAPPDATA%` user-data discovery.
- [x] Prove native screenshot result content on both backends.
- [x] Prove 1MCP hot reload by modifying the isolated Windows provider and observing only that backend reload.
- [x] Keep remote debugging local to Chrome and avoid a public/fixed debugging endpoint.

**Acceptance criteria:**
- Linux command resolves through Linux npx and sees the intended WSLg environment.
- Windows command resolves through Windows cmd/npx/Node from `/mnt/c`.
- No personal path is required in tracked configuration.
- No extra daemon/proxy/wrapper is introduced during qualification.

### Task 4: Activate 1MCP 0.36.0 and render the live browser inventory

**Files:**
- Generated external deployment state only; do not edit generated files manually.

**Interfaces:**
- Consumes: final Task 1 tracked configuration and existing personal render/systemd lifecycle.
- Produces: live 1MCP inventory containing one Browser facade while preserving Terminal PTY lifetime and OAuth/session files.

**Steps:**
- [x] Re-render the personal deployment with `scripts/render-config.mjs --profile personal` using the same env/state/repo-root inputs owned by the current deployment; prefer the existing bootstrap wrapper only when its additional install/setup work is actually needed.
- [x] Inspect the generated `1mcp/mcp.json` only as output evidence; never patch it directly.
- [x] Install the qualified pinned 1MCP 0.36.0 runtime using the repository installer. Remove the obsolete 0.34.4 OAuth CSP patch rather than adapting it to the new source.
- [x] Record the current 1MCP PID, render the authoritative browser inventory, and observe the config watcher. Browser-only inventory changes hot-reloaded while PID 736 stayed alive.
- [x] Restart `mcp-dev-bridge.service` exactly once to activate the new 0.36.0 Node process. The restart was for the executable upgrade, not because browser config requires a restart.
- [x] Do not restart `wsl-agent-tmux.service`; tmux PID 300 and broker PID 303 remained unchanged with zero restarts.
- [x] Run `bin/status` and direct 1MCP provider/health inspection after the version-activation restart; the later facade render hot-reloaded live inventory to `browser,code,dev,terminal` while PID 46371 stayed unchanged.

**Acceptance criteria:**
- Bridge health returns cleanly after restart.
- 1MCP reports four enabled personal providers including `browser`.
- Existing Terminal sessions survive unchanged.
- Existing OAuth/session state remains present; no state root is deleted as part of rollout.

### Task 5: Prove browser authorization isolation, then explicitly authorize ChatGPT

**Files:**
- No tracked changes expected.

**Interfaces:**
- Consumes: live 1MCP inventory with the new `browser` tag and existing client OAuth sessions.
- Produces: explicit evidence that new browser capability is opt-in rather than silently inherited.

**Steps:**
- [x] Before reauthorizing ChatGPT, confirm the existing grant still sees Dev/Code/Terminal while browser-specific catalog discovery returns nothing.
- [x] Confirm live 1MCP protected-resource and authorization-server metadata offer `tag:browser` alongside `tag:code`, `tag:dev`, and `tag:terminal`.
- [ ] Perform the normal ChatGPT connector OAuth reauthorization and intentionally include `tag:browser` together with the existing required scopes.
- [ ] Refresh/reconnect the ChatGPT connector catalog if the product does not update the grant/catalog in-place.
- [ ] Confirm the single Browser provider becomes discoverable after the new grant.
- [x] Confirm the WebSession adapter's persisted OAuth scope remains exactly `tag:code tag:dev tag:terminal`. Do not reauthorize it during this mission.

**Acceptance criteria:**
- Browser is unavailable under the old grant and available after explicit `tag:browser` authorization.
- Existing dev/code/terminal access remains intact.
- WebSession remains browser-unprivileged under its existing grant.

### Task 6: Prove Linux browser control and direct rich-result fidelity

**Files:**
- No tracked changes expected unless live behavior disproves the candidate config.

**Interfaces:**
- Consumes: authorized Browser MCP tools through ChatGPT's outer catalog with `browser_target=linux`.
- Produces: end-to-end Linux/WSLg browser-control evidence.

**Steps:**
- [ ] In a fresh ChatGPT session/profile, discover only the needed browser schema by exact action name when known (for example `navigate_page` or `take_screenshot`), otherwise use a selective term such as `navigate` or `screenshot`; do not enumerate all Chrome schemas first.
- [ ] Invoke a Browser tool with `browser_target=linux` and confirm Chrome DevTools MCP launches a visible Linux Chrome window through WSLg.
- [ ] Navigate an innocuous page and confirm the user can manually interact with the same visible Linux browser.
- [ ] Invoke `take_screenshot` and require ChatGPT to receive/render an actual image result through the direct 1MCP path.
- [ ] Confirm no Windows Chrome state is accidentally being controlled by the Linux-targeted call.

**Acceptance criteria:**
- Linux Chrome is visible through WSLg and controllable by MCP.
- Manual interaction and MCP interaction address the same Linux browser instance.
- Screenshot survives as native image content, proving the direct MCP transport preserves rich result fidelity.
- Browser schemas are loaded selectively through the outer catalog rather than all being injected up front.

### Task 7: Prove native Windows Chrome attachment and fallback only if necessary

**Files:**
- Modify `config/templates/mcp-personal.json` and its focused assertions only if a real attachment failure requires one of the documented upstream fallback flags.

**Interfaces:**
- Consumes: the Browser MCP provider at its default Windows target, Windows Chrome with remote debugging enabled, explicit `tag:browser` grant.
- Produces: end-to-end control of the normal native Windows Chrome/profile.

**Steps:**
- [ ] Invoke the Browser page-listing action with the default target and confirm it sees one already-open native Windows Chrome tab selected for the test.
- [ ] Confirm the user can continue manually interacting with that same Windows Chrome window while MCP observes/controls it.
- [ ] Invoke a non-destructive browser action and then `take_screenshot`; require the screenshot to reach ChatGPT as native image content.
- [x] Bare `--autoConnect` was qualified first and timed out; the demonstrated profile-discovery fix `--user-data-dir=%LOCALAPPDATA%\\Google\\Chrome\\User Data` is now the tracked default. Use `--browserUrl` or `--wsEndpoint` only if this qualified form later fails for a concrete endpoint reason.
- [x] Do not introduce a launcher wrapper merely to encode the fallback.

**Acceptance criteria:**
- The facade's Windows child is owned by Windows Node/npx even though the outward Browser facade itself is a WSL Node process.
- `list_pages` observes the intended normal Windows Chrome profile/tab.
- Manual and MCP interaction address the same Windows browser.
- Screenshot remains native image content.
- Any fallback change is evidence-driven and remains a direct upstream CLI configuration.

### Task 8: Final repository gate and rollback definition

**Files:**
- Only files already owned by Tasks 1-2, plus a minimal correction if final verification finds an in-scope defect.

**Interfaces:**
- Consumes: final tracked browser implementation and completed live acceptance.
- Produces: merge-ready browser capability with a bounded rollback path.

**Steps:**
- [x] Run the repository-required final gate for runtime/model-facing changes:

```bash
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
(cd providers/pi-dev && npm test)
(cd providers/terminal && npm test)
(cd providers/code-router && npm test)
(cd providers/browser && npm test)
bash scripts/check-personal-toolbox.sh
node scripts/check-doc-links.mjs
bash -n bin/* lib/bridge/*.sh scripts/*.sh tests/*.sh
node --check scripts/*.mjs providers/pi-dev/*.mjs providers/terminal/*.mjs providers/code-router/*.mjs providers/browser/*.mjs
git diff --check
```

- [x] Verify `tests/publication.sh`; after the concurrent generic-domain cleanup in `docs/websession-clients.md`, it now passes 19/19.
- [x] Inspect the final diff for accidental public-profile changes, personal paths, extra OAuth widening, wrappers, 1MCP lazy-mode changes, or unrelated cleanup; none were introduced.
- [x] Define runtime rollback as restoring the previous known-good source revision, re-rendering the personal composition, and restarting only `mcp-dev-bridge.service`; preserve OAuth/session state and Terminal/tmux lifetime.
- [x] Define browser-authorization rollback as removing/revoking `tag:browser` from the affected client authorization rather than deleting unrelated provider state.

**Verification evidence (2026-08-24):**
- `tests/harness.sh`, `tests/lifecycle.sh`, Terminal tests, Code tests, Browser facade tests, personal toolbox, doc links, shell syntax, Node syntax, and `git diff --check` passed. The Browser suite is now 4/4, including the shutdown-versus-dead-child-replacement race reported by independent review.
- Direct Browser facade acceptance exposed 29 tools exactly once, added `browser_target` to all 29 schemas, and returned native `image/png` screenshots from both the default Windows target and explicit Linux target.
- `tests/publication.sh` passes 19/19 after the separate concurrent generic-domain cleanup in `docs/websession-clients.md`.
- The Pi suite is independently timing-flaky under full parallel execution: successive full runs failed on different wait-race timing assertions, while each focused failing assertion passed immediately without a code change. No Browser/1MCP change touches those wait-engine/retained-pane paths, so this mission does not rewrite them merely to force a green unrelated suite.

**Acceptance criteria:**
- Required repository checks pass, except for any explicitly demonstrated unchanged pre-existing gate failure.
- Both Linux and Windows browser product paths have live evidence.
- `tag:browser` is the only new authorization capability.
- No 1MCP metatool/lazy migration, extra browser daemon/proxy, or duplicate model-facing browser inventory exists.
- Rollback does not require deleting OAuth/session state or restarting Terminal lifetime.

## Deferred Work

The following are explicitly outside this implementation wave:

- migrating ChatGPT to 1MCP `tool_list` / `tool_schema` / `tool_invoke`;
- changing 1MCP direct mode to lazy/metatool mode;
- process-on-first-use orchestration beyond the lifecycle already provided by 1MCP/Chrome DevTools MCP;
- automatically granting browser scope to WebSession or other existing OAuth clients;
- separate `browser-linux` and `browser-windows` OAuth scopes;
- a generic Windows-native MCP launcher abstraction;
- an additional browser proxy/daemon beyond the thin Browser facade;
- enabling `--slim` before a concrete need to restrict the browser tool set;
- forcing Linux `--autoConnect` when the simpler MCP-launched visible WSLg browser satisfies the requirement;
- fallback Windows profile/debug endpoint configuration before `--autoConnect` is tried against the real profile.

## Post-Implementation Context Pass

The repository-side context pass is complete. `skills/agent-browser/` now owns browser-specific routing: existing/authenticated Windows state uses the single `browser` provider at its default target, visible/resource-local WSL state uses the same provider with `browser_target=linux`, and isolated/fresh or Electron automation keeps the `agent-browser` CLI. `mcp-harness-router` remains focused on Dev/Code/Terminal/wait primitives and does not duplicate browser policy. `skills/README.md` and `skills/SNAPSHOT_SHA256.txt` include the tracked replacement.

ChatGPT does not allow this repository to silently replace the Skill already installed in the current account/workspace. Install the tracked `agent-browser` replacement through the Skills UI before declaring the ChatGPT-side routing update complete.

## Final Architecture

```text
                               ChatGPT
                                  |
                     outer lazy api_tool catalog
                                  |
                         mcp-harness-local
                                  |
                         direct MCP semantics
                                  |
                                1MCP
                     one inventory + OAuth tags
                                  |
                 +----------+----------+----------+----------+
                 |          |          |          |
                Dev        Code     Terminal    Browser
                WSL        WSL        WSL         WSL
                                                   |
                                      +------------+------------+
                                      |                         |
                              Windows child               Linux child
                              cmd/npx                     npx
                                      |                         |
                              native Chrome               WSLg Chrome
                              normal profile              managed profile

Authorization:
  tag:dev      -> Dev
  tag:code     -> Code
  tag:terminal -> Terminal
  tag:browser  -> Browser facade

Routing:
  existing Windows profile/tabs/cookies -> Browser default target
  resource-local WSLg Chrome -> Browser with browser_target=linux
  isolated/fresh or Electron automation -> agent-browser CLI
```

The architectural invariant is: **centralize inventory and authorization in 1MCP, expose one Browser namespace, preserve downstream MCP result semantics unchanged, let ChatGPT's outer catalog provide schema laziness, and keep each Chrome child in the environment that owns the browser state it controls.**
