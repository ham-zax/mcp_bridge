# Terminal Frontend Handoff Implementation Plan

**Goal:** Add a hybrid human/model Terminal presentation layer that keeps sessions headless by default, can present an exact tmux PTY in Kitty on request, and makes `terminal_yield` automatically reuse or launch the human frontend needed for secure collaborative input.

**Architecture:** Keep tmux as PTY/process lifetime authority and the existing broker as ownership authority. Add a designated read-only `wsl-term present` client, a Kitty/WSLg launcher at the Terminal MCP edge, one internal broker-list state bit for frontend readiness, an optional `present` flag on `terminal_open`, and frontend-aware behavior in the existing `terminal_yield`. Do not add an eighth Terminal tool or route production sessions through Herdr.

**Tech Stack:** Node.js ESM, MCP SDK/Zod, tmux 3.4 private `wsl-agent` namespace, existing Unix-socket broker, Bash wrapper `bin/wsl-term`, Kitty under WSLg, node:test.

**Design:** `docs/superpowers/specs/2026-08-17-terminal-frontend-handoff-design.md`

## Global Constraints

- Preserve exactly seven model-facing Terminal tools.
- Keep normal `terminal_open` headless; GUI presentation is opt-in or triggered by human handoff.
- Add only optional `present: boolean` to `terminal_open`; do not add `terminal_present`.
- Make `terminal_yield` reuse an existing designated client or launch Kitty when none exists.
- Keep `terminal_yield` input shape unchanged.
- Add `bin/wsl-term present <session>` as a designated collaborative read-only frontend; keep `watch` anonymous and `attach` immediately writable.
- Reuse existing broker lease/bind/control and tmux collaborative-client machinery. Do not create a second ownership system.
- No Herdr production dependency or PTY ownership change. Herdr may still be run independently inside Kitty, outside this feature.
- No raw tmux/`wsl-term` invocation through model Bash to bypass Terminal ownership.
- Human passwords, MFA values, and secrets must never pass through MCP arguments, broker input logs, or ChatGPT.
- Frontend launch failure must preserve the tmux session and explain the exact manual attach fallback.
- Public `restricted` and `trusted-dev` profiles must remain unchanged and must not gain Terminal/GUI dependencies.
- Preserve tmux lifetime across broker/provider/1MCP restart.
- Preserve PTY dimensions when a read-only presentation frontend attaches while the model owns the session; passive GUI attachment must not become resize authority.
- Do not add a new package dependency for frontend launch or readiness.
- Do not live-test a worktree candidate through services that still execute the canonical checkout. Record the verified candidate SHA and require an explicit activation/integration gate before service restart.

## Planned File Surface

### Create

- `providers/terminal/frontend.mjs` — Kitty discovery, WSLg child environment, safe argv launch, existing-client detection/readiness, and frontend-specific errors.
- `providers/terminal/test/frontend.test.mjs` — deterministic launcher/discovery/readiness tests with injected process/filesystem seams; no real GUI required for unit tests.

### Modify

- `providers/terminal/cli.mjs` — add `present`, refactor exact-session attachment so read-only designated and writable human clients share lifecycle code.
- `providers/terminal/broker.mjs` — extend `session.list` result with `humanAttached` derived from the reconciled designated tmux client; do not add a protocol operation.
- `providers/terminal/mcp-server.mjs` — add `terminal_open.present`, frontend-aware `terminal_yield`, and partial/open failure rendering.
- `providers/terminal/test/human-lease.test.mjs` — exact-PTY `present` ownership transitions and same-client reuse.
- `providers/terminal/test/broker.test.mjs` — `humanAttached` list-state coverage.
- `providers/terminal/test/mcp-server.test.mjs` — schema/dispatch/frontend behavior and errors.
- `docs/personal/harness.md` — hybrid presentation semantics and CLI meanings.
- `docs/architecture.md` — frontend is presentation only; tmux/broker remain authorities.
- `docs/operations.md` — Kitty discovery/WSLg troubleshooting and live restart/acceptance notes.

### Do not modify unless implementation evidence requires it

- `providers/terminal/protocol.mjs` — no new operation is planned.
- `providers/terminal/tmux.mjs` — no change is planned; `wsl-term present` should use tmux's existing `window-size manual` option before read-only attach. Modify this module only if focused tests prove the CLI-level control cannot preserve the required sizing semantics.
- `config/templates/mcp-personal.json` and `scripts/render-config.mjs` — use inherited `HOME` plus optional `MCP_TERMINAL_KITTY_BIN`; avoid new rendered config unless the provider environment proves insufficient.
- Herdr production files/configuration.

## Task 0: Isolate and freeze the current Terminal baseline

**Files:**
- No production changes.
- Create one implementation worktree/branch for this coherent Terminal-runtime change because it affects live ownership/GUI behavior and later requires controlled rollout.

**Interfaces:**
- Consumes: current `main`, existing seven-tool Terminal catalog, broker/tmux services.
- Produces: clean baseline evidence and isolated feature workspace.

**Steps:**
- [ ] Fetch `origin/main` and create one worktree/branch such as `feature/terminal-frontend-handoff` from the exact current main commit.
- [ ] Record `git status --short --branch`, current commit, Terminal provider version, and Kitty version/path as environment evidence.
- [ ] Run `cd providers/terminal && npm test` and require the current full Terminal suite to pass before code changes.
- [ ] Run `bash tests/harness.sh` to freeze the current personal/public composition contract.
- [ ] Run `node --check providers/terminal/*.mjs` and `git diff --check`.
- [ ] Do not restart any live service during baseline.

**Acceptance criteria:**
- Baseline Terminal and harness tests are green on the exact feature base.
- No unrelated working-tree changes enter the feature worktree.

## Task 1: Add a designated read-only `wsl-term present` client using existing ownership machinery

**Files:**
- Modify: `providers/terminal/cli.mjs`
- Modify: `providers/terminal/test/human-lease.test.mjs`

**Interfaces:**
- Consumes: `lease.acquire_human`, `lease.bind_human`, existing tmux attach/read-only support, `control.take_human`, `control.give_model`.
- Produces: `bin/wsl-term present <session>` semantics; no broker protocol change.

**Steps:**
- [ ] Add a focused failing test that launches `wsl-term present <session>` under a real pseudo-TTY against the disposable broker/tmux sandbox.
- [ ] Assert the presented client attaches to the exact tmux session as read-only and remains attached.
- [ ] Add a focused failing dimension test: open the PTY at a known size, attach the `present` pseudo-TTY at a different size, and require the PTY dimensions to remain unchanged while the client is read-only.
- [ ] Before the read-only `present` attach, set that tmux window to `window-size manual`; verify this prevents the initial attach from resizing the model-owned PTY.
- [ ] Assert model `session.send` remains allowed after the read-only client is fully bound; the brief pre-bind lease may block mutation only during attachment setup.
- [ ] Assert `control.take_human` succeeds without creating another client and makes that exact client writable.
- [ ] Assert model send/resize/ordinary close are blocked while human control is writable and model reads remain available.
- [ ] Assert `control.give_model` returns the same client to read-only and model mutation resumes without detaching the frontend. Reserve the real `Ctrl-b T` toggle for live acceptance in Task 8.
- [ ] Assert model `session.resize` remains authoritative while `present` is read-only, and that a later writable human frontend can resize through the existing CLI resize handler without detaching.
- [ ] Refactor `attachSession` into the smallest shared attachment helper needed to support writable `attach` and designated read-only `present`; keep `watch` on its anonymous raw read-only path.
- [ ] Add `present` to CLI command parsing and usage text.
- [ ] Preserve cleanup: if attach/bind fails, release any temporary lease and do not leave a stale human lock.
- [ ] Run the focused human-lease test file, then the full Terminal suite.

**Acceptance criteria:**
- `wsl-term present` creates a designated read-only collaborator on the exact PTY.
- A passive read-only presentation does not change PTY dimensions; model resize remains authoritative while model-owned.
- `watch`, `attach`, `new`, `give`, and `take` retain their existing meanings.
- No new ownership mechanism or broker operation exists.

## Task 2: Expose designated-client readiness through existing broker list state

**Files:**
- Modify: `providers/terminal/broker.mjs`
- Modify: `providers/terminal/test/broker.test.mjs`
- Modify: `providers/terminal/test/human-lease.test.mjs` only if the integration assertion is clearer there.

**Interfaces:**
- Consumes: `reconcileHumanControl()` result and `control.designated`.
- Produces: additive internal `session.list` field `humanAttached: boolean` while preserving existing `humanLease` semantics.

**Steps:**
- [ ] Add a failing test proving a designated read-only `present` client is distinguishable from no human client even though writable human control is false.
- [ ] Extend each `session.list` record with `humanAttached: control.designated != null` after reconciliation.
- [ ] Preserve `humanLease` as the existing model-mutation-blocking state; do not silently redefine it.
- [ ] Keep model-visible `terminal_list` rendering unchanged in this version; `humanAttached` is an internal readiness field only. If implementation later proves model-visible presenter state is necessary, stop and amend the plan rather than expanding this task silently.
- [ ] Verify anonymous `watch` remains `humanAttached=false` and writable `attach` reports both `humanAttached=true` and `humanLease=true`.
- [ ] Run focused broker/human-lease tests and full Terminal tests.

**Acceptance criteria:**
- Provider code can tell `none` from `designated read-only` without adding a new broker operation.
- Existing callers that only inspect `humanLease` retain behavior.

## Task 3: Add the Kitty/WSLg frontend launcher

**Files:**
- Create: `providers/terminal/frontend.mjs`
- Create: `providers/terminal/test/frontend.test.mjs`

**Interfaces:**
- Consumes: broker `session.list`, `MCP_TERMINAL_SOCKET`, `HOME`, optional `MCP_TERMINAL_KITTY_BIN`, repository `bin/wsl-term`, Node child-process/filesystem APIs.
- Produces: `ensurePresented(name)`-style provider helper that ensures a designated collaborative frontend exists and reports whether an existing frontend was reused or a launch was attempted. It must not claim identity correlation between a spawned Kitty process and the designated client.

**Steps:**
- [ ] Write deterministic tests for Kitty resolution in this order: explicit `MCP_TERMINAL_KITTY_BIN`; executable `$HOME/.local/kitty.app/bin/kitty`; PATH candidate.
- [ ] Test a clean `FRONTEND_UNAVAILABLE` result when no Kitty executable can be used.
- [ ] Build child argv directly, without `sh -c`: Kitty title plus the absolute repository `bin/wsl-term present <validated-session>` command.
- [ ] Preserve the inherited explicit `MCP_TERMINAL_SOCKET` in the Kitty child so GUI runtime variables cannot redirect the inner CLI to another socket.
- [ ] If GUI variables are already present, preserve them.
- [ ] When `WAYLAND_DISPLAY` is absent and `/mnt/wslg/runtime-dir/wayland-0` is a socket, set only the Kitty child `XDG_RUNTIME_DIR=/mnt/wslg/runtime-dir` and `WAYLAND_DISPLAY=wayland-0`; preserve the inherited explicit `MCP_TERMINAL_SOCKET` so `wsl-term` still reaches `/run/user/<uid>/wsl-agent-terminal.sock`.
- [ ] When `DISPLAY` is absent and `/tmp/.X11-unix/X0` or `/mnt/wslg/.X11-unix/X0` exists, set only the Kitty child `DISPLAY=:0` as X11 fallback.
- [ ] When `PULSE_SERVER` is absent and `/mnt/wslg/PulseServer` is a socket, set only the Kitty child `PULSE_SERVER=unix:/mnt/wslg/PulseServer`.
- [ ] Do not mutate the parent provider environment.
- [ ] Launch Kitty as a process group whose lifetime is independent of the MCP request/provider after successful presentation; do not make Kitty own the tmux PTY lifetime.
- [ ] Before launching, query `session.list`; if `humanAttached=true`, return `reused` without spawning another GUI.
- [ ] If the state is `humanLease=true` and `humanAttached=false`, treat it as attachment in progress: wait boundedly for `humanAttached=true` or for `humanLease` to clear, then reevaluate. Do not spawn another Kitty while the temporary lease remains active.
- [ ] Add a deterministic test for the attachment-in-progress transition so an operator-side `attach`/`present` race does not trigger a duplicate provider launch or an avoidable lease collision.
- [ ] Coalesce concurrent `ensurePresented(name)` calls through one in-memory per-session launch promise so two simultaneous MCP requests cannot open duplicate Kitty windows. Remove the single-flight entry on success or failure.
- [ ] Add a concurrency test proving two simultaneous presentation requests for the same session perform exactly one spawn and both observe the same readiness result.
- [ ] After launch, wait for the exact session to become `humanAttached=true` using a short bounded provider-internal readiness loop; terminate the wait early on launch error/early Kitty failure.
- [ ] On successful readiness, detach/unref the launched Kitty process group so its lifetime is independent of the provider request.
- [ ] If a Kitty process was spawned by this request but readiness times out, setup fails, or the process exits before readiness, terminate only that launched frontend process group, preserve the tmux session, and return a stable frontend error containing the exact manual fallback `bin/wsl-term attach <session>`.
- [ ] Add a unit test proving failed/timed-out readiness cleans up the launched process group and never calls a tmux-session destructive path.
- [ ] Keep all process/filesystem/time seams injectable enough that unit tests never open a real GUI.
- [ ] Run the new focused frontend tests plus full Terminal tests.

**Acceptance criteria:**
- Launch uses safe argv and deterministic Kitty discovery.
- Existing presented client is reused, concurrent provider-local first-presentation requests are single-flight, and attachment-in-progress state is respected without claiming global duplicate suppression.
- Missing/broken GUI produces an actionable error without touching PTY lifetime.
- Unit tests do not depend on WSLg or a visible desktop.

## Task 4: Integrate hybrid presentation into the existing seven Terminal MCP tools

**Files:**
- Modify: `providers/terminal/mcp-server.mjs`
- Modify: `providers/terminal/test/mcp-server.test.mjs`

**Interfaces:**
- Consumes: broker client, frontend controller from Task 3.
- Produces: optional `terminal_open.present`; frontend-aware `terminal_yield`; no new MCP tool.

**Steps:**
- [ ] Extend `terminal_open` input schema with optional `present: boolean` and update its description: headless by default; use presentation only when the human should see the PTY from the start.
- [ ] Keep the normal `session.open` call unchanged when `present` is absent/false.
- [ ] When `present=true`, open the tmux session first and then call `ensurePresented(name)`.
- [ ] If presentation succeeds, return an acknowledgement that distinguishes `presented` from ordinary headless open without expanding result verbosity unnecessarily.
- [ ] If session creation succeeds but presentation fails, return an explicit partial error such as `TERMINAL_FRONTEND_PARTIAL` stating that the named session is already live/headless and must not be reopened merely to retry presentation.
- [ ] Change `terminal_yield` to first call `control.take_human` normally. If it succeeds, reuse the existing designated client and do not launch Kitty.
- [ ] Only on `HUMAN_CLIENT_NOT_FOUND`, call `ensurePresented(name)`, then retry `control.take_human` once after readiness.
- [ ] Preserve existing errors for multiple writable clients, conflicting leases, missing sessions, and other ownership failures; frontend launch must not mask them.
- [ ] If frontend launch fails during yield, leave the session model-owned and return the manual attach fallback; do not request the secret in chat.
- [ ] Update `terminal_yield` description to state that it reuses an attached collaborative frontend and, on the personal WSL profile, can ensure the configured Kitty frontend when none is attached.
- [ ] Inject the frontend controller into `createTerminalMcpServer` for deterministic unit testing rather than spawning GUI processes from tests.
- [ ] Add tests for: headless open; `present=true`; partial presentation failure; yield with existing client; yield with no client then launch/retry; frontend failure; no duplicate launch.
- [ ] Verify the Terminal tool count remains exactly seven and only the `terminal_open` schema gains one optional field.

**Acceptance criteria:**
- No eighth MCP action exists.
- Default terminal behavior is unchanged for headless work.
- Human handoff no longer requires the model to tell the user to construct a manual attach command when Kitty launch is available.

## Task 5: Refresh operating documentation without changing the architecture boundary

**Files:**
- Modify: `docs/personal/harness.md`
- Modify: `docs/architecture.md`
- Modify: `docs/operations.md`

**Interfaces:**
- Consumes: final Task 1-4 behavior.
- Produces: current operator/model contract.

**Steps:**
- [ ] Replace the obsolete statement that the Terminal subsystem never launches/detects a terminal emulator with the narrower truth: the tmux/broker backend remains emulator-neutral, while the personal presentation helper may launch configured Kitty for collaborative display/handoff.
- [ ] Document `wsl-term present` beside `watch` and `attach`, with the exact distinction between anonymous observer, designated read-only collaborator, and writable human owner.
- [ ] Document `terminal_open(..., present:true)` as optional presentation, not a default for background work.
- [ ] Document frontend-aware `terminal_yield`: reuse designated client; launch Kitty only when none exists; no duplicate window on repeated yield.
- [ ] Document `Ctrl-b T` / `wsl-term give` returning the same visible client to read-only model-owned mode.
- [ ] Document Kitty discovery override `MCP_TERMINAL_KITTY_BIN` and WSLg troubleshooting/manual attach fallback.
- [ ] Preserve the Herdr boundary: it can run independently inside Kitty but does not own production MCP Terminal PTYs.
- [ ] Run the repository documentation link checker/publication suite appropriate to these docs.

**Acceptance criteria:**
- Documentation matches the implemented ownership and launch semantics.
- Public/profile boundaries remain clear.

## Task 6: Automated regression and repository gate

**Files:**
- No new behavior unless failures reveal a scoped defect.

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: exact-tree automated evidence before live rollout.

**Steps:**
- [ ] Run `cd providers/terminal && npm test` and require all Terminal tests green.
- [ ] Run `bash tests/harness.sh` to verify personal/public provider composition and exact seven-tool Terminal surface.
- [ ] Run `bash tests/publication.sh` because Terminal implementation/docs are private-only and publication boundaries must remain intact.
- [ ] Run `bash tests/lifecycle.sh` only if implementation changes bridge lifecycle/render/systemd files. Otherwise rely on the Terminal broker-restart tests plus the live rollout acceptance for lifecycle evidence.
- [ ] Run `node --check providers/terminal/*.mjs`.
- [ ] Run `bash -n bin/wsl-term`; include any other shell file only if it was actually modified.
- [ ] Do not run a second standalone documentation link check after `tests/publication.sh`; the publication suite already invokes `scripts/check-doc-links.mjs`.
- [ ] Run `git diff --check` and review the exact diff for unintended profile, Herdr, or tmux-lifetime changes.
- [ ] Perform an inline code review focused on ownership races, duplicate frontend launches, leaked GUI processes, partial-open retry hazards, secret handling, and unnecessary scope.

**Acceptance criteria:**
- All affected automated gates are green on the exact candidate tree.
- No public profile, Herdr backend, or tmux-lifetime regression is present.

## Task 7: Activate the verified candidate at the canonical live source path

**Files:**
- No source changes unless integration conflict resolution is required.

**Interfaces:**
- Consumes: exact verified candidate SHA from Tasks 1-6 and the canonical live checkout `/home/hamza/repo/satori_bridge`.
- Produces: an explicitly activated canonical checkout whose live broker/provider paths resolve to the verified candidate.

**Steps:**
- [ ] Record the exact verified feature-branch SHA and confirm the feature worktree is clean.
- [ ] Stop before activation unless the user has explicitly authorized integration/live activation. Implementation completion alone is not permission to merge, rewrite `main`, push, or restart services.
- [ ] Preferred activation: integrate the verified candidate into the canonical `/home/hamza/repo/satori_bridge` checkout using the approved branch-finishing decision, preserving unrelated changes and avoiding history rewrites.
- [ ] After integration, verify `git rev-parse HEAD` in the canonical checkout contains the verified candidate and the checkout is clean enough for deployment.
- [ ] Verify the rendered personal MCP config resolves Terminal provider execution to `/home/hamza/repo/satori_bridge/providers/terminal/mcp-server.mjs` from the activated candidate.
- [ ] Verify the installed `wsl-agent-terminal-broker.service` `WorkingDirectory` and `ExecStart` resolve to `/home/hamza/repo/satori_bridge` and its `providers/terminal/broker.mjs` from the activated candidate.
- [ ] Do not restart live services if either provider or broker still resolves to an older checkout/SHA.

**Acceptance criteria:**
- The live service paths are proven to execute the exact candidate that passed Task 6.
- No worktree-only candidate is mistaken for the deployed code.

## Task 8: Controlled live rollout and real collaborative acceptance

**Files:**
- No source changes unless a real acceptance defect is reproduced and fixed through the normal test-first loop.

**Interfaces:**
- Consumes: verified candidate, live personal user services, WSLg/Kitty, refreshed ChatGPT connector.
- Produces: live acceptance evidence for the user-visible behavior.

**Steps:**
- [ ] Record current 1MCP/provider, Terminal broker, and tmux lifetime PIDs before rollout.
- [ ] Because `broker.mjs` changes, restart only `wsl-agent-terminal-broker.service`; verify the dedicated tmux service/PID and any chosen live PTY process remain unchanged.
- [ ] Restart/reconcile the 1MCP bridge/provider so `mcp-server.mjs` changes are loaded; do not restart the tmux lifetime service.
- [ ] Verify local/public readiness and `issues: 0` before product testing.
- [ ] Refresh ChatGPT MCP so the optional `terminal_open.present` schema is visible.
- [ ] Acceptance A — headless default: `terminal_open` without `present` creates no Kitty window and remains fully usable.
- [ ] Acceptance B — presented open: `terminal_open(..., present:true)` launches exactly one Kitty window on the exact tmux PTY, initially read-only; model send remains allowed while the user watches.
- [ ] Acceptance B2 — dimension authority: create a model-owned PTY at a known size, present it in a differently sized Kitty window, and verify passive read-only presentation does not change the PTY dimensions; `terminal_resize` remains authoritative.
- [ ] Acceptance C — reuse: call `terminal_yield`; the same Kitty client becomes writable, model send/resize/ordinary close are blocked, and model read still works.
- [ ] Acceptance D — return: user presses `Ctrl-b T` or runs `wsl-term give`; same Kitty remains attached read-only and model send resumes.
- [ ] Acceptance E — second yield: call `terminal_yield` again and verify the existing Kitty window is reused with no duplicate launch.
- [ ] Acceptance F — headless-to-human: open a separate headless session, reach a harmless interaction point, call `terminal_yield`, and verify Kitty launches automatically and becomes the writable exact-session frontend.
- [ ] Acceptance G — sudo: run `sudo -k && sudo -v` in a disposable Terminal session; yield; user types the password only in Kitty; return model control; verify `sudo -n true`; confirm the secret is absent from broker state/logs/transcript fixtures where the existing guarantee applies.
- [ ] Acceptance H — failure fallback: with a deliberately invalid Kitty override in a disposable provider/test path, verify the PTY survives and the error gives the exact manual attach fallback without falsely claiming GUI success.
- [ ] Acceptance I — presented-client restart: with a designated read-only Kitty client attached and the model owning the session, record tmux/pane and tmux-client identity; restart the broker and reconcile/restart the provider/1MCP; verify the same tmux/pane and Kitty client remain attached, `humanAttached` is reconstructed, and `terminal_yield` reuses that client without launching a second Kitty window.
- [ ] Clean up only test-only Terminal sessions/windows after evidence is recorded.

**Acceptance criteria:**
- All approved design acceptance properties are demonstrated through the real product path.
- tmux remains lifetime authority across broker/provider rollout.
- The GUI is launched only when presentation/handoff requires it.

## Task 9: Final router-skill alignment after live acceptance

**Files:**
- Modify if needed: `skills/mcp-harness-router/SKILL.md`
- Package: complete updated `skill.zip`

**Interfaces:**
- Consumes: real live semantics proven in Task 8.
- Produces: concise routing guidance that matches the deployed harness.

**Steps:**
- [ ] Re-read the router Skill and live MCP descriptions together.
- [ ] Remove transitional/manual-fallback wording that is no longer necessary after frontend-aware yield is live.
- [ ] Keep the Skill router-only: human-visible/input-required work routes to collaborative Terminal presentation/handoff; engineering workflow remains owned by Superpowers Web Adapter.
- [ ] Do not duplicate Kitty argv, WSLg internals, broker protocol, or detailed Terminal implementation in the Skill.
- [ ] Validate/package the complete Skill using the Skill Creator workflow.
- [ ] Run one fresh natural-language holdout such as a local cleanup that eventually reaches sudo and verify the Skill selects the human frontend path without being explicitly invoked.

**Acceptance criteria:**
- Skill instructions match deployed behavior and remain compact.
- Natural local-machine requests can trigger the router without mentioning MCP by name.
- This task is post-deployment validation and does not block declaring the Terminal runtime implementation complete after Tasks 1-6.

## Rollback

If live presentation/handoff fails after deployment:

1. keep the tmux lifetime service running;
2. roll the Terminal provider/broker source back to the previous known-good commit;
3. restart the broker and 1MCP/provider only;
4. refresh ChatGPT if the `terminal_open` schema changed back;
5. continue using the existing manual `bin/wsl-term attach <session>` workflow while preserving all durable tmux sessions.

Do not destroy Terminal sessions as part of rollback unless the user explicitly requests their cleanup.
