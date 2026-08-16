# Terminal Read-Only Watch and Namespace Clarity Implementation Plan

**Goal:** Let a human watch the exact harness-owned terminal from Kitty (or any terminal emulator) while the model continues to control it, and make the private `wsl-agent` tmux namespace impossible to confuse with the user's default tmux server.

**Architecture:** Preserve the current Terminal broker, transcript model, six MCP tool schemas, human lease semantics, and `tmux -L wsl-agent` PTY/process lifetime authority. Add a read-only `wsl-term watch <session>` client using tmux's native `attach-session -r` mode; teach the broker to treat read-only tmux clients as observers rather than human writers; clarify the MCP descriptions and operator docs so `watch` and `attach` have distinct, explicit meanings.

**Tech Stack:** Node.js 22, MCP SDK, tmux 3.4, existing Unix-socket Terminal broker, Node test runner.

## Global Constraints

- Keep `tmux -L wsl-agent` as the only Terminal PTY/process lifetime authority.
- Keep the existing six public MCP tools and their input schemas unchanged.
- Keep the broker protocol unchanged; do not add an observer lease or new broker operation.
- Keep existing session names unchanged; do not introduce URI-like or qualified session identifiers.
- Keep existing transcript, cursor, generation, dead-exit-status, and human takeover behavior unchanged.
- `wsl-term attach <session>` remains writable human takeover and must continue to block model send/resize/ordinary close.
- `wsl-term watch <session>` is read-only observation and must not block model send/resize/ordinary close.
- The read-only watcher must not affect PTY dimensions. Use tmux `-r`, which in tmux 3.4 sets both `read-only` and `ignore-size` client flags.
- Client classification must fail closed: only an explicit tmux read-only flag may be treated as an observer; missing/unknown flag data remains writable/human-controlling.
- Do not add dependencies, services, configuration files, or a new GUI integration. Kitty is only a terminal emulator displaying the tmux client.
- Do not put `wsl-term` on PATH as part of this change; that is convenience work, not required for the behavior.
- Do not change WSLg/`DISPLAY` propagation. Attaching or watching an existing PTY does not rewrite the environment of processes already running inside it.

## File Map

**Modify:**
- `providers/terminal/tmux.mjs` - expose whether each attached tmux client is read-only.
- `providers/terminal/broker.mjs` - count only writable attached clients as human control.
- `providers/terminal/cli.mjs` - add `wsl-term watch <session>` as a lease-free read-only attach.
- `providers/terminal/mcp-server.mjs` - clarify private namespace and `watch` versus `attach` semantics in tool descriptions only.
- `providers/terminal/test/human-lease.test.mjs` - integration regression for read-only observation while model writes continue.
- `providers/terminal/test/mcp-server.test.mjs` - protect the namespace/attach guidance exposed to MCP clients.
- `docs/personal/harness.md` - document read-only observation and writable takeover.
- `docs/security.md` - document why a watcher is non-owning while attach retains the single-writer lease policy.

**Do not modify:**
- `providers/terminal/protocol.mjs`
- `providers/terminal/transcript*.mjs`
- `providers/terminal/model-cursor.mjs`
- `bin/wsl-term`
- systemd unit templates
- installer scripts
- 1MCP configuration

### Task 1: Distinguish read-only tmux observers from writable human clients

**Files:**
- Modify: `providers/terminal/tmux.mjs` (`listClients`)
- Modify: `providers/terminal/broker.mjs` (`reconcileHumanControl`)
- Test: `providers/terminal/test/human-lease.test.mjs`

**Interfaces:**
- Consumes: existing `tmux list-clients` output and broker `session.list` / mutation operations.
- Produces: internal client objects with a boolean `readOnly`; human-control gating ignores clients where `readOnly === true`.

**Steps:**
- [ ] Extend the `list-clients -F` format with `#{client_readonly}` and parse it into `readOnly: boolean` alongside `pid`, `session`, and `tty`; only tmux's explicit true value is observer-safe, so missing/unknown values parse as writable.
- [ ] In `reconcileHumanControl(name)`, retain the full client list for lease/PID reconciliation, but compute human ownership from writable clients plus an active lease.
- [ ] Preserve the existing rule that an active lease blocks model mutation even before the writable client finishes attaching.
- [ ] Add an integration regression that starts a real read-only tmux client with `attach-session -r`, verifies `session.list` reports no human control, and verifies `session.send` and `session.resize` succeed while that client remains attached.
- [ ] In the same regression, verify the read-only client has the tmux read-only flag, write a unique marker into the watcher's pseudo-TTY and prove it never reaches the pane/transcript, then send a distinct marker through the broker and prove that one does reach the pane/transcript. Existing writable-attach tests continue to cover the opposite behavior.

**Acceptance criteria:**
- A read-only tmux client attached to a harness session does not cause `HUMAN_HAS_CONTROL` for model mutation.
- A normal writable tmux client or active human lease still causes `HUMAN_HAS_CONTROL` exactly as before.
- Broker restart/lifetime semantics are untouched.

### Task 2: Add a first-class read-only operator command

**Files:**
- Modify: `providers/terminal/cli.mjs`
- Test: `providers/terminal/test/human-lease.test.mjs`
- Test: `providers/terminal/test/cli.test.mjs` only if needed for argument/usage coverage not already proven by the integration regression.

**Interfaces:**
- Consumes: existing `tmuxArgs()` private namespace selection and the existing interactive TTY requirement.
- Produces: `wsl-term watch <session>`.

**Steps:**
- [ ] Extend CLI parsing from `list | attach` to `list | watch | attach` without changing `bin/wsl-term`. Route `watch` before creating/using a `BrokerClient` so observation remains a direct tmux capability and does not acquire a broker lease.
- [ ] Implement `watchSession(name)` by spawning the existing private tmux client arguments plus `attach-session -r -t <name>` with inherited stdio/environment.
- [ ] Do not acquire, bind, or release a human lease for `watch`; read-only status is enforced by tmux and recognized by Task 1.
- [ ] Reuse the current child-exit/signal handling pattern rather than introducing a new process wrapper abstraction.
- [ ] Extend the integration regression to invoke the real `bin/wsl-term watch <session>` path in a pseudo-TTY, not just a raw tmux command.
- [ ] Verify the watcher can detach cleanly and model control remains available before, during, and after the watch session.

**Acceptance criteria:**
- From Kitty or another interactive terminal, `bin/wsl-term watch <session>` displays the exact harness PTY and cannot send input to it.
- The watcher uses the private `wsl-agent` tmux server and cannot accidentally attach to a same-named default-tmux session.
- The watcher does not resize the PTY because tmux `-r` includes `ignore-size`.
- Existing `bin/wsl-term attach <session>` behavior remains unchanged and exclusive.

### Task 3: Make the private namespace and control modes explicit to the model and operator

**Files:**
- Modify: `providers/terminal/mcp-server.mjs`
- Test: `providers/terminal/test/mcp-server.test.mjs`
- Modify: `docs/personal/harness.md`
- Modify: `docs/security.md`

**Interfaces:**
- Consumes: existing six MCP tool definitions and existing operator documentation.
- Produces: clearer descriptions only; no MCP tool names, arguments, result format, or broker calls change.

**Steps:**
- [ ] Update Terminal MCP descriptions to say that Terminal sessions live in the harness-owned private tmux namespace (production default `wsl-agent`) and do not target same-named sessions in the user's default tmux server.
- [ ] Put the human-mode distinction in the descriptions where it is useful to the model: the harness CLI `bin/wsl-term watch <session>` means read-only live observation while model control remains available; `bin/wsl-term attach <session>` means writable human takeover and blocks model mutation.
- [ ] Keep descriptions concise and do not expose broker/socket implementation details that are irrelevant to tool selection.
- [ ] Extend the existing MCP schema test to assert that the relevant descriptions preserve the private-namespace warning and both operator commands. Do not change the frozen six-tool schemas.
- [ ] Rename the docs subsection from human takeover to observation/takeover and document both commands, including that Kitty is only the GUI terminal emulator and does not change which tmux server is controlled.
- [ ] Update the security doc to state that read-only tmux clients are non-owning observers, while writable clients/leases preserve the single-writer mutation gate.

**Acceptance criteria:**
- A model reading the MCP tool metadata can distinguish a Terminal session from an identically named default-tmux session before calling `terminal_send`.
- The operator documentation gives one canonical command for watching and one canonical command for taking control.
- Public MCP schemas and result text remain backward-compatible.

### Task 4: Verification and drift check

**Files:**
- No production files beyond Tasks 1-3.

**Steps:**
- [ ] Run the focused regression tests first:
  - `(cd providers/terminal && node --test test/human-lease.test.mjs)`
  - `(cd providers/terminal && node --test test/mcp-server.test.mjs)`
  - `(cd providers/terminal && node --test test/cli.test.mjs)` if Task 2 changes its covered behavior.
- [ ] Run the complete Terminal provider suite: `npm --prefix providers/terminal test`.
- [ ] Perform one manual sandbox acceptance check with a durable test session: start `wsl-term watch`, confirm the watcher is read-only, send a marker through the model/broker path, and confirm it appears in the watched terminal without `HUMAN_HAS_CONTROL`.
- [ ] Repeat with `wsl-term attach` and confirm the same model mutation is rejected with `HUMAN_HAS_CONTROL` until detach.
- [ ] Inspect `git diff --check` and `git diff` to confirm no protocol, transcript, installer, systemd, or unrelated changes slipped in.

**Acceptance criteria:**
- Focused tests and the full Terminal provider suite pass.
- Manual acceptance proves both modes against the same private harness PTY: `watch` permits model writes; `attach` blocks them.
- Diff remains limited to the eight files listed in the File Map unless a test exposes a genuinely necessary transitive change.

## Rollout / Compatibility

- No data migration.
- No broker protocol migration.
- No MCP schema migration.
- No new dependency or service.
- Existing callers of all six MCP tools remain compatible.
- Existing `wsl-term list` and `wsl-term attach` commands remain compatible.
- New behavior is additive: `wsl-term watch <session>`.
- Restart only `wsl-agent-terminal-broker.service` to load broker client-classification changes; do not restart `wsl-agent-tmux.service`, and verify existing pane PIDs survive.
- Refresh the Terminal MCP descriptions by restarting/reconciling the personal bridge/1MCP from an external controller or human terminal, never from a request executing inside the bridge process tree being replaced. Then refresh/reconnect the ChatGPT connector before product-path acceptance.

## Explicit Non-Goals

- Replacing tmux with Herdr.
- Integrating Kitty's remote-control API.
- Allowing simultaneous writable human and model input.
- Changing Terminal session naming or exposing a new namespace field in MCP result text.
- Installing/symlinking `wsl-term` into `~/.local/bin`.
- Propagating GUI/WSLg environment variables into already-running terminal sessions.
