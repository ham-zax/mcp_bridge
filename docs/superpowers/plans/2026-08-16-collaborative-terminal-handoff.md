# Collaborative Terminal Handoff Implementation Plan

**Goal:** Add human-first, terminal-emulator-neutral collaborative terminals whose exact tmux-backed PTY can be observed by both human and ChatGPT while writable ownership moves explicitly between them.

**Architecture:** Keep tmux as the PTY/process lifetime authority and the broker as the model mutation gate. Reuse existing human leases for create/take race protection, store only the designated collaborative client identity as tmux session user options, and reconcile real tmux client flags before every model mutation. The CLI uses the invoking interactive TTY; Kitty remains only an optional frontend.

**Tech Stack:** Node.js ESM, tmux 3.4, Unix-domain broker protocol, MCP SDK, systemd user service.

## Global Constraints

- Do not add Kitty, terminal-emulator detection, launcher adapters, or GUI remote-control dependencies.
- Do not add a parallel human/model ownership state machine.
- Preserve tmux ownership of PTY/process lifetime and existing transcript/cursor/generation/dead-pane behavior.
- Preserve one-writer-at-a-time safety: writable human client or live human lease blocks model send/resize/ordinary close.
- `wsl-term new <session>` is human-first and must close the create-to-attach model-write race.
- `wsl-term give <session>` changes the designated human client to read-only + ignore-size while keeping it attached.
- `wsl-term take <session>` makes the designated client writable and blocks subsequent model mutation immediately.
- `Ctrl-b T` is a tmux-native direct ownership toggle. A read-only observer remains non-writable until the human explicitly invokes it; broker reconciliation designates the unique writable human client and fails closed when multiple human writers exist.
- Model-initiated yield is exposed explicitly as `terminal_yield`; it may only give control to the human, never seize control from the human.
- Do not add new regression-test cases. Update existing frozen contract assertions only where the intentionally changed protocol/MCP catalog requires it. Verification uses the existing suite plus disposable tmux/broker acceptance checks.
- Do not restart the tmux lifetime service during rollout. Restart only `wsl-agent-terminal-broker.service`; the user will refresh the ChatGPT MCP connector afterward.

## File map

- `providers/terminal/tmux.mjs` — designated-client tmux options, exact client lookup/toggle, direct takeover binding installation.
- `providers/terminal/broker.mjs` — atomic human-first open, designation reconciliation, give/take control operations.
- `providers/terminal/protocol.mjs` — private broker operation vocabulary additions.
- `providers/terminal/cli.mjs` — `new`, `give`, `take`; shared attach path; owner-aware resize mirroring.
- `providers/terminal/mcp-server.mjs` — public `terminal_yield` tool and collaborative-control descriptions.
- `providers/terminal/test/protocol.test.mjs` — update frozen private operation set assertion only.
- `providers/terminal/test/mcp-server.test.mjs` — update frozen public tool catalog/schema assertion only.
- `providers/README.md` — public Terminal tool list.
- `docs/personal/harness.md` — operator workflow for new/give/take/watch/attach and emulator-neutral TTY contract.
- `docs/security.md` — one-writer control boundary and designated-client handoff semantics.

### Task 1: Add tmux collaborative-client primitives

**Files:**
- Modify: `providers/terminal/tmux.mjs`

**Interfaces:**
- Consumes: existing private tmux server and `listClients()`.
- Produces: designated-client registration/resolution, exact in-place read-only toggling, and the direct `Ctrl-b T` ownership toggle.

**Steps:**
- Add session-scoped tmux user options for designated client PID, TTY, and tmux client creation time rather than persistent JSON ownership state.
- Add helpers to set, clear, and resolve the designated client only when stored PID, TTY, and client creation time match a real client attached to that exact session.
- Add an exact client toggle helper that uses `switch-client -r -c <tty>` only when a state transition is actually required, then re-reads client state to verify the requested writable/read-only result.
- Install an idempotent global prefix binding for `T` directly to `switch-client -r`; tmux 3.4 ignores conditional wrappers for read-only clients. Pressing the binding is therefore an explicit human takeover/give action. Broker reconciliation promotes the unique writable client to designated ownership and blocks model mutation when multiple writable humans exist.
- Keep current manual window sizing behavior intact.

**Verification:**
- Use a disposable tmux server to confirm the direct `Ctrl-b T` binding toggles a read-only client in place, exact helper transitions are idempotent, and session close removes designation naturally.

**Acceptance criteria:**
- Designation survives broker restart because it lives in the tmux session.
- Designation cannot jump to another observer if the designated client disappears.
- A read-only watcher remains unable to inject pane input until the user explicitly presses `Ctrl-b T`; an explicit takeover is then visible to broker reconciliation as writable human control.

### Task 2: Extend broker ownership operations without a second state machine

**Files:**
- Modify: `providers/terminal/protocol.mjs`
- Modify: `providers/terminal/broker.mjs`
- Modify: `providers/terminal/test/protocol.test.mjs`

**Interfaces:**
- Consumes: existing lease map, `reconcileHumanControl()`, session lifecycle serialization, tmux designated-client primitives.
- Produces private operations `session.open_human`, `control.give_model`, and `control.take_human`.

**Steps:**
- Extract lease creation into a helper that can establish a pending human lease before a new tmux session exists.
- Implement `session.open_human`: create the pending lease first, open the session inside the existing lifecycle serialization, and remove the lease if creation fails. Return session state plus lease identity to the CLI.
- When a bound lease is observed as a real client, register that exact client as the designated collaborative client. This also makes existing writable `attach` a valid rejoin/recovery path without changing its takeover semantics.
- During reconciliation, if exactly one writable human client exists, designate that writer; this lets an explicit `Ctrl-b T` takeover from a prior observer become the handoff target. If a bound designated client has been toggled read-only, release the stale human lease so the model can resume. Multiple writable humans remain model-blocking and are never auto-resolved.
- Reconcile stale designated identity against real clients; clear it rather than silently choosing among read-only observers.
- Implement `control.give_model`: resolve the exact designated client, reject conflicting writable human clients, make the designated client read-only, verify it, then remove the human lease so model mutation becomes available. Fail closed if any step is ambiguous.
- Implement `control.take_human`: establish/refresh a human lease for the designated client before changing tmux state, make that client writable, verify it, and leave the lease/client combination blocking subsequent model mutation. Already-human-owned state is idempotent.
- Add only the three intentional operations to the private protocol assertion.

**Verification:**
- Disposable broker flow: atomic open reports human control before attach completes; bound client becomes designated; give permits model send; take blocks model send; broker restart preserves control based on tmux options/client flags.

**Acceptance criteria:**
- No model-write window exists between human-first creation and lease establishment.
- Broker restart does not lose the ability to give/take an attached collaborative client.
- Unknown/stale/ambiguous client identity fails closed.

### Task 3: Implement emulator-neutral CLI workflow

**Files:**
- Modify: `providers/terminal/cli.mjs`

**Interfaces:**
- Consumes: `session.open_human`, existing lease bind/release operations, `control.give_model`, `control.take_human`.
- Produces: `wsl-term new <session>`, `give`, and `take` while retaining `list`, `watch`, and `attach`.

**Steps:**
- Refactor the writable attach wrapper so it can accept either a newly returned lease or acquire one for an existing session.
- `new` requires interactive stdin/stdout, captures current terminal dimensions when available, requests `session.open_human`, then attaches the invoking TTY to the exact new private session.
- `attach` remains writable human takeover/rejoin and binds its real tmux client as before.
- Make the wrapper resize callback verify its own tmux client is currently writable before issuing `resize-window`; once `give` makes that client read-only, terminal-emulator resize events must not override model dimensions.
- `give` and `take` validate exact session names and call their broker control operations; they do not launch or inspect any terminal emulator.
- Keep exact private namespace targeting and `-N` no-autostart behavior.

**Verification:**
- Disposable pseudo-TTY flow using the actual `bin/wsl-term`: `new` attaches human-first at the invoking TTY size; `give` keeps the client attached/read-only and model resize authoritative; `take` restores human write/resize; noninteractive `new` fails clearly.

**Acceptance criteria:**
- The workflow uses only an interactive TTY and works without Kitty-specific code.
- The same client remains attached across give/take.
- Human resize does not affect a model-owned session.

### Task 4: Expose model yield explicitly through MCP

**Files:**
- Modify: `providers/terminal/mcp-server.mjs`
- Modify: `providers/terminal/test/mcp-server.test.mjs`
- Modify: `providers/README.md`

**Interfaces:**
- Consumes: private `control.take_human`.
- Produces: public `terminal_yield { name }` as the seventh Terminal tool.

**Steps:**
- Register `terminal_yield` with only the existing validated `name` field.
- Map it to `control.take_human` and return concise human-control confirmation.
- Update descriptions of send/resize/list/close to explain collaborative human ownership, `wsl-term give/take`, and that human control blocks model mutation.
- Update the existing frozen MCP catalog assertion from six to seven tools and assert the new tool's single-field schema; do not add new test cases.
- Update the provider README tool list.

**Verification:**
- Run the existing MCP server test file and inspect `listTools()` output manually if needed.

**Acceptance criteria:**
- A fresh ChatGPT connector can discover `terminal_yield` without exposing private lease/tmux operations.
- Yield can only transfer control to the designated human client.

### Task 5: Update operator/security documentation

**Files:**
- Modify: `docs/personal/harness.md`
- Modify: `docs/security.md`

**Steps:**
- Document `new`, `give`, `take`, `Ctrl-b T`, `watch`, and `attach` with the one-writer ownership table.
- State explicitly that an interactive TTY is the frontend contract and Kitty is merely one optional terminal emulator.
- Document model-owned headless sessions: existing `terminal_open` continues to work without a human TTY and can later be joined by writable attach.
- Document that `terminal_yield` returns ownership only to the designated human client and fails when none exists.
- Preserve the no-auxiliary-secret-input-log guarantee.

**Verification:**
- Search normative docs for wording that incorrectly makes Kitty a required dependency or says the public tool catalog still has six tools.

**Acceptance criteria:**
- Operator docs match actual CLI/MCP semantics and the emulator-neutral design.

### Task 6: Verify, integrate, push, and roll out broker

**Files:**
- No new files.

**Steps:**
- Run `git diff --check`.
- Run the existing Terminal suite with `npm --prefix providers/terminal test`; no new regression tests are added.
- Run a disposable end-to-end acceptance with actual `bin/wsl-term` and broker/tmux sockets covering human-first new, give, model send/resize, take, and designated-client-only takeover behavior.
- Review the final diff for scope drift, public-contract correctness, and accidental Kitty coupling.
- Commit implementation on an isolated feature branch/worktree.
- Fast-forward or merge the verified feature branch into local `main`, including the already committed design/spec/plan commits.
- Re-run `npm --prefix providers/terminal test` on merged `main` and `git diff --check`.
- Fetch and verify `origin/main` has not diverged, then push `main`.
- Restart only `wsl-agent-terminal-broker.service`; do not restart `wsl-agent-tmux.service`, 1MCP, the bridge, Cloudflare, or OAuth services from this request path.
- Verify broker service status, private socket availability, tmux server PID continuity, and at least one broker request after restart.

**Acceptance criteria:**
- `main` and `origin/main` point to the verified implementation commit.
- Existing Terminal suite is green.
- Broker restarts successfully without changing the tmux server PID or killing durable PTYs.
- Repository is clean after integration.
