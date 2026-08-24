# Terminal Presentation Frontends Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Preserve the existing Terminal MCP, broker, tmux namespace, leases, transcripts, and `wsl-term` control model. This plan changes only the presentation edge unless direct implementation evidence proves a lower-layer change is necessary.

**Goal:** Make the personal Terminal MCP able to present the exact existing tmux PTY in either Kitty or native Windows Terminal, while keeping the current seven-tool MCP surface and the existing human/model handoff semantics unchanged.

**Architecture:** tmux remains the process/PTY lifetime owner; the Terminal broker remains the human/model authority owner; `wsl-term` remains the exact-session attach/control CLI; the Terminal MCP remains the seven-operation agent interface. `providers/terminal/frontend.mjs` becomes a small two-launcher presentation adapter. Kitty stays the compatibility default. A deployment-level selector chooses `kitty` or `windows-terminal` only when no designated human frontend is already attached. Windows Terminal re-enters the current WSL distribution and runs the existing `wsl-term present <session>` command, so it attaches to the same tmux PTY rather than creating another shell or terminal-control stack.

**Tech Stack:** Node.js, existing Terminal MCP/broker/tmux implementation, `wsl-term`, Kitty/WSLg, Windows Terminal (`wt.exe`), WSL interoperability (`cmd.exe`, `wsl.exe`), existing personal config renderer.

## Why this change is narrow

The current model-facing Terminal surface is already sufficient:

```text
terminal_open
terminal_read
terminal_send
terminal_resize
terminal_list
terminal_yield
terminal_close
```

The current implementation already supports the three states needed for collaborative terminal work:

```text
HEADLESS
  model -> tmux PTY

PRESENTED
  model -> tmux PTY <- read-only human frontend

YIELDED
  model blocked; writable human frontend -> same tmux PTY
```

The ownership boundaries are already correct:

```text
Terminal MCP                 small agent-facing interface
      |
      v
Terminal broker              model/human ownership + transcript/cursor state
      |
      v
tmux                         PTY/process lifetime
      ^
      |
wsl-term                     exact-session attach/control CLI
      ^
      |
presentation frontend        Kitty today; Kitty or Windows Terminal after this plan
```

Do not add another terminal-control system merely to support another emulator.

## Observed local environment on 2026-08-24

- Windows Terminal is installed as `Microsoft.WindowsTerminal 1.24.11911.0`.
- `cmd.exe /d /c "where wt.exe"` resolves the Windows execution alias.
- The running/default WSL distribution is `Ubuntu`.
- `wslpath -w /` returns a UNC root containing the current WSL distribution identity (`\\wsl.localhost\Ubuntu\...`).
- The Terminal provider process cannot be assumed to inherit `WSL_DISTRO_NAME`; current provider inspection showed it empty.
- The running Terminal provider executable is `/home/hamza/.nvm/versions/node/v24.19.0/bin/node`, while a fresh `wsl.exe -d Ubuntu -u hamza --exec /usr/bin/env node --version` fails with exit 127 because `node` is absent from that non-login environment. Windows re-entry therefore must propagate the provider's runtime-derived `process.execPath` as `TERMINAL_NODE_BIN`.
- Launching `cmd.exe` from the repository's WSL cwd produces the UNC-current-directory warning and falls back to `C:\Windows`; launching it with child cwd `/mnt/c` starts deterministically at `C:\`.
- The WSLg environment is now healthy, so Kitty remains a valid native Linux/WSLg frontend.
- Microsoft documents invoking Windows Terminal from WSL through `cmd.exe /c wt.exe ...`; use `-w new` when a deterministic new Windows Terminal window is required.

Reference: <https://learn.microsoft.com/en-us/windows/terminal/command-line-arguments>

## Design decisions

### 1. Keep the MCP surface unchanged

Do **not** add any of these:

```text
terminal_open_gui
terminal_request_password
terminal_take_control
terminal_attach_kitty
terminal_attach_windows_terminal
terminal_handoff
```

`terminal_open(..., present:true)` and `terminal_yield(name)` already express the required behavior.

### 2. Frontend choice is deployment preference, not trust policy

Introduce one personal deployment setting:

```text
MCP_TERMINAL_FRONTEND=kitty|windows-terminal
```

Rules:

- default: `kitty`, preserving existing behavior;
- tracked personal profile policy does not encode a machine preference;
- `.env`/deployment configuration selects Windows Terminal on this machine when desired;
- invalid values fail render/configuration early when rendering the personal profile;
- `MCP_TERMINAL_KITTY_BIN` remains meaningful only for the Kitty launcher;
- do not add an `auto` mode in the first implementation. Deterministic choice is easier to reason about and avoids surprise GUI switching.

### 3. Existing attached frontend wins over configured preference

If broker state already reports a designated human frontend for the exact session, `ensurePresented()` reuses it regardless of whether it was opened in Kitty or Windows Terminal.

The selector applies only when presentation must create a frontend.

This preserves the current useful behavior:

```text
terminal_yield
  -> existing frontend attached?
       yes: reuse exact client
       no: launch configured frontend
```

A second `terminal_yield` must not create a second window merely because the configured frontend differs from the already attached one.

### 4. Windows Terminal is presentation only

The Windows Terminal path should be conceptually:

```text
Terminal MCP in WSL
      |
      v
frontend.mjs
      |
      v
Windows cmd.exe /c wt.exe
      |
      v
new Windows Terminal window/tab
      |
      v
wsl.exe -d <current distro> -u <current user> --exec
      |
      v
/usr/bin/env TERMINAL_NODE_BIN=<process.execPath>
      |
      v
<repo>/bin/wsl-term present <session>
      |
      v
existing broker + exact existing tmux PTY
```

It must **not**:

- start another shell command in place of the existing PTY;
- create another tmux session;
- create another broker;
- copy terminal contents into a Windows-side proxy;
- make Windows Terminal own process lifetime;
- pass passwords or secrets through MCP/configuration arguments.

### 5. Resolve the current WSL distribution; do not assume Windows default

The Windows Terminal tab must re-enter the same distribution that owns the broker socket and tmux namespace.

Preferred resolution order inside the frontend adapter:

1. use `WSL_DISTRO_NAME` when present and valid;
2. otherwise run `wslpath -w /` and parse the distribution from either documented WSL UNC form, `\\wsl.localhost\<distro>\...` or `\\wsl$\<distro>\...`;
3. if the distribution cannot be resolved, fail presentation with the existing manual `wsl-term attach <session>` fallback.

Do not initially add another distro override unless real implementation evidence shows the runtime cannot derive it reliably.

Resolve the Linux user from the running process with `os.userInfo().username`, not `process.env.USER`; the process account is authoritative and environment state is not.

### 6. Treat `cmd.exe` as a shell-parsing boundary and `wt.exe` as a transient launcher

This is the main semantic difference from Kitty.

For Kitty, the spawned process represents the visible terminal window closely enough that an early child exit is useful evidence of failed presentation.

For Windows Terminal, `cmd.exe` parses shell metacharacters even when Node was given an argv array, and `wt.exe` may successfully hand the tab/window to the existing Windows Terminal host and exit before the WSL-side `wsl-term present` client has fully registered.

Keep one dedicated Windows command builder in `frontend.mjs`; do not scatter quoting across the launcher. It must safely represent ordinary values including spaces and must either quote/escape or fail closed on unsupported CMD metacharacters for every dynamic value crossing the boundary: distro, Linux user, `process.execPath`, repository/`wsl-term` path, session name, and title content. Do not assume separate Node spawn arguments bypass CMD parsing.

Broker state must remain authoritative for presentation readiness:

```text
session.list -> humanAttached / humanLease
```

Do not interpret a successful Windows launcher exit as equivalent to frontend closure, and do not let a transient launcher result override observed broker attachment.

Required Windows launcher semantics:

- spawn/exec error before any broker handoff: fail immediately;
- broker reports `humanAttached=true`: success, even if the transient launcher has already exited nonzero;
- broker reports `humanLease=true` without attachment: an attachment flow is still settling; continue polling until the normal deadline rather than advertising a duplicate manual attach;
- observable nonzero launcher result with neither `humanAttached` nor `humanLease`: `FRONTEND_LAUNCH_FAILED`;
- clean transient launcher exit: keep polling broker state;
- at the deadline, perform one final broker-state read:
  - `humanAttached=true` -> success;
  - `humanLease=true` -> `FRONTEND_NOT_READY` with explicit "attachment still settling; re-list before retrying/manual attach" guidance, not a claim of model ownership;
  - neither -> `FRONTEND_NOT_READY` plus exact manual `wsl-term attach <session>` fallback.

The frontend's current 3-second readiness deadline is shorter than the broker's 5-second attachment-grace lease, so a timeout cannot honestly guarantee immediate model ownership without adding a correlated cancellation protocol below the presentation layer. This plan deliberately does not add that protocol.

### 7. Never broadly kill Windows Terminal during cleanup

The existing Kitty path can kill the exact detached Kitty process group that it launched when presentation fails.

Do not translate that cleanup literally to Windows Terminal. Never use `taskkill` against `wt.exe`, WindowsTerminal.exe, or all terminal windows.

If Windows Terminal presentation fails or times out:

- preserve the tmux session;
- treat broker state as the ownership authority rather than asserting model ownership from the frontend timeout alone;
- let the launched tab's `wsl-term present` process settle or exit naturally;
- if `humanLease` is still active, tell the caller to re-list before retrying or manually attaching so a duplicate window is not created;
- offer the manual attach fallback only when broker state shows no attached/settling human frontend;
- tolerate an inert presentation tab as preferable to killing unrelated user terminals.

## Scope constraints

- Do not change the seven Terminal MCP tools or their input schemas.
- Do not change tmux namespace/lifetime ownership.
- Do not redesign broker leases, ownership reconciliation, transcript cursors, or generation identity.
- Do not replace `wsl-term` with a Windows-specific CLI.
- Do not add a generic frontend plugin registry.
- Do not add arbitrary emulator auto-detection.
- Do not remove Kitty.
- Do not make Windows Terminal the default in tracked source; preserve `kitty` as the compatibility default.
- Do not restart the tmux lifetime service during rollout.
- Do not ask the user to enter passwords into chat. Human-only input continues to flow directly through the attached terminal client into the PTY.
- Do not create new test infrastructure. Focused additions to the existing `providers/terminal/test/frontend.test.mjs` are allowed only for launcher-specific behavior that Kitty coverage cannot prove; extend the existing `tests/harness.sh` renderer contract only for the new selector/default/personal-only validation.

---

## File ownership map

| File | Ownership in this change |
| --- | --- |
| `providers/terminal/frontend.mjs` | production owner of automatic presentation; add deterministic Kitty/Windows Terminal selection and launcher-specific readiness semantics |
| `providers/terminal/test/frontend.test.mjs` | extend the existing injected frontend tests only for Windows-launcher behavior not covered by Kitty semantics |
| `tests/harness.sh` | extend existing rendered-composition/validation coverage for the frontend selector; no separate renderer test file |
| `providers/terminal/mcp-server.mjs` | wording only: remove Kitty-specific agent-facing description while preserving schema and behavior |
| `config/templates/mcp-personal.json` | pass the rendered frontend selector into the personal Terminal provider |
| `scripts/render-config.mjs` | read/default/validate `MCP_TERMINAL_FRONTEND` and render it into personal Terminal env |
| `.env.example` | document the optional personal presentation preference |
| `docs/configuration.md` | document allowed values/default and personal-only meaning |
| `docs/personal/harness.md` | explain the two presentation frontends and unchanged ownership/handoff model |
| `docs/operations.md` | document launcher prerequisites, fallback, and Windows Terminal-specific troubleshooting |
| `docs/architecture.md` | replace the Kitty-only diagram/text with a presentation-frontends edge |
| `skills/mcp-harness-router/SKILL.md` | keep executable agent-routing guidance emulator-neutral while preserving the same handoff workflow |
| `skills/SNAPSHOT_SHA256.txt` | refresh only the existing checksum entry for the changed router Skill |

Files that should remain untouched unless implementation evidence proves otherwise:

```text
providers/terminal/broker.mjs
providers/terminal/tmux.mjs
providers/terminal/protocol.mjs
providers/terminal/broker-client.mjs
bin/wsl-term
systemd/wsl-agent-tmux.service.in
systemd/wsl-agent-terminal-broker.service.in
```

## Implementation sequencing / isolation

The current checkout has an active Browser wave touching files this plan also needs, including `config/templates/mcp-personal.json`, `docs/architecture.md`, `docs/configuration.md`, `docs/operations.md`, `docs/personal/harness.md`, and `skills/SNAPSHOT_SHA256.txt`.

- Do not begin this implementation on top of that unresolved overlapping state.
- First reconcile/commit the intended Browser foundation. If Terminal work then proceeds serially, use the normal checkout.
- If parallel writable work is still required after the foundation is committed, create a dedicated worktree **from that foundation commit**, not from the older current `HEAD`.
- Re-check `git status` immediately before implementation because the overlap set may change.

---

## Task 1: Make frontend choice a durable personal deployment value

**Files:**
- Modify: `scripts/render-config.mjs`
- Modify: `config/templates/mcp-personal.json`
- Modify: `.env.example`
- Modify: `docs/configuration.md`
- Modify: `tests/harness.sh`

**Consumes:** optional deployment value `MCP_TERMINAL_FRONTEND`.

**Produces:** personal Terminal provider environment containing exactly one normalized frontend choice.

- [ ] Add `MCP_TERMINAL_FRONTEND` to the deployment/process-environment override allowlist in `scripts/render-config.mjs`.

- [ ] Resolve and validate:

```text
unset/empty            -> kitty
kitty                  -> kitty
windows-terminal       -> windows-terminal
anything else          -> render error
```

Do not put this in `config/profiles/personal.env`; it is a deployment/UI preference, not a tracked authorization/trust profile.

Validate this selector only when rendering the `personal` profile. A stray personal UI preference must not make unrelated `restricted` or `trusted-dev` rendering fail.

- [ ] Add a template token to the personal Terminal provider only, for example:

```json
"MCP_TERMINAL_FRONTEND": "__TERMINAL_FRONTEND__"
```

and render it from the normalized value.

- [ ] Keep public/restricted/trusted-dev templates unchanged. Automatic collaborative presentation remains a personal-harness capability.

- [ ] Extend the existing renderer contract in `tests/harness.sh`: unset personal selector renders `kitty`; explicit `kitty` and `windows-terminal` render exactly; invalid personal selector fails; the same stray invalid selector is ignored for `restricted`/`trusted-dev`. Do not add a new renderer test file.

- [ ] Document in `.env.example` and `docs/configuration.md`:

```text
MCP_TERMINAL_FRONTEND=kitty
```

with `windows-terminal` as the alternate value and `kitty` as the compatibility default.

**Acceptance:** rendering the personal profile with no selector preserves `kitty`; explicit `kitty`/`windows-terminal` render exactly; an invalid personal value is rejected before live runtime activation without breaking `restricted`/`trusted-dev` rendering.

---

## Task 2: Implement the two-launcher frontend with safe Windows command and readiness semantics

**Files:**
- Modify: `providers/terminal/frontend.mjs`
- Modify: `providers/terminal/test/frontend.test.mjs`

**Consumes:** `MCP_TERMINAL_FRONTEND`; existing broker `session.list` fields `humanAttached`/`humanLease`; existing Kitty launcher; `process.execPath`; current WSL runtime identity.

**Produces:** the existing `createFrontendController(...).ensurePresented(name)` contract backed by focused Kitty and Windows Terminal launch paths.

- [ ] Preserve the current pre-launch order and per-session single-flight behavior:

```text
session exists
  -> humanAttached? reuse
  -> humanLease? wait for current attachment attempt
  -> otherwise choose configured launcher
```

- [ ] Keep Kitty behavior in a focused launcher function, including explicit/user/PATH binary discovery, WSLg child-environment fallback, strong early-exit detection, and exact owned-process-group cleanup on failure. Do not create a generic frontend registry.

- [ ] Resolve Windows runtime identity without machine-specific hard-coding: use valid `WSL_DISTRO_NAME` when present, otherwise parse either `\\wsl.localhost\<distro>\...` or `\\wsl$\<distro>\...` from `wslpath -w /`; resolve the Linux account from `os.userInfo().username`; derive Node from `process.execPath`.

- [ ] Implement one dedicated Windows CMD command builder. The builder owns the complete `cmd.exe /c` command line and every dynamic value crossing it: distro, Linux user, Node path, repo/`wsl-term` path, session, and title. It must safely support ordinary spaces and either correctly quote/escape or reject values containing CMD metacharacters it cannot represent safely. Do not rely on Node's argv array to bypass CMD parsing, and do not scatter escaping across the launcher.

- [ ] Launch conceptually as:

```text
cmd.exe /d /c "wt.exe" -w new new-tab
  --title "Terminal: <session>"
  --suppressApplicationTitle
  wsl.exe
    -d <current-distro>
    -u <current-user>
    --exec
      /usr/bin/env
      TERMINAL_NODE_BIN=<process.execPath>
      <absolute-linux-repo>/bin/wsl-term present <session>
```

Use the installed Windows Terminal CLI spelling; keep `-w new`; spawn `cmd.exe` with Linux child cwd `/mnt/c`; pass no broker socket or secret on the Windows command line. The re-entered WSL process must run the existing `wsl-term present` against the existing tmux PTY, not recreate the session command.

- [ ] Make Windows readiness broker-first. On every meaningful decision, read `session.list` before treating transient launcher exit as authoritative. `humanAttached=true` is success even after a launcher nonzero exit. While `humanLease=true`, continue treating presentation as settling rather than advertising a second manual attach.

- [ ] At the Windows readiness deadline perform one final broker-state read. If attached, succeed. If a human lease is still active, return bounded `FRONTEND_NOT_READY` wording that says attachment is still settling and instructs the caller to re-list before retry/manual attach; do **not** claim model ownership. Only when neither attachment nor lease exists should the error include the immediate `wsl-term attach <session>` fallback.

- [ ] Preserve launcher-specific cleanup: Kitty may terminate only its exact launched process group; Windows Terminal must never use broad `taskkill`/WindowsTerminal termination. A Windows timeout may leave a settling/inert tab, but must never destroy the tmux session.

- [ ] Extend only the existing frontend tests for distinct Windows evidence: existing frontend reuse/no spawn; both documented WSL UNC forms; `os.userInfo`-derived user; command builder with spaces plus fail-closed CMD metacharacters; argv contains `/usr/bin/env` + `TERMINAL_NODE_BIN=<process.execPath>`; spawn cwd `/mnt/c`; clean transient exit can still attach; `humanAttached` wins over launcher exit; timeout with `humanLease` reports settling rather than model-owned/manual-attach certainty; timeout with neither lease nor attachment returns the fallback; Windows failure never invokes Kitty/process-group or global taskkill cleanup.

**Acceptance:** frontend selection changes only presentation; Windows Terminal visibly attaches to the exact existing tmux PTY, fresh `wsl.exe --exec` does not depend on login/NVM PATH, CMD parsing cannot reinterpret accepted dynamic values as shell control syntax, and timeout/error wording never overstates ownership beyond broker evidence.

---

## Task 3: Update the agent-facing contract and current documentation

**Files:**
- Modify: `providers/terminal/mcp-server.mjs`
- Modify: `docs/architecture.md`
- Modify: `docs/personal/harness.md`
- Modify: `docs/operations.md`
- Modify: `skills/mcp-harness-router/SKILL.md`
- Modify: `skills/SNAPSHOT_SHA256.txt`

- [ ] Change the `terminal_yield` description from:

```text
ensure the personal Kitty frontend
```

to emulator-neutral wording such as:

```text
ensure the configured personal frontend for the exact tmux PTY
```

Do not alter the tool name, schema, or control flow.

- [ ] Update the two Kitty-specific `terminal_yield` statements in `skills/mcp-harness-router/SKILL.md` to the same emulator-neutral contract, for example:

```text
reuse the designated frontend when present; otherwise launch the configured personal frontend on the exact tmux PTY
```

This Skill is executable agent context, not optional prose. It must not promise Kitty specifically when the configured runtime may launch Windows Terminal.

- [ ] Refresh only the existing `skills/mcp-harness-router/SKILL.md` entry in `skills/SNAPSHOT_SHA256.txt`; do not regenerate unrelated Skill checksums. Validate the modified tracked Skill bundle using the repository's existing Skill validation process.

- [ ] Keep repository Skill state and installed ChatGPT Skill state distinct. Editing `skills/mcp-harness-router/SKILL.md` does **not** update the Skill used by a fresh ChatGPT session; installed-Skill activation is a separate rollout step in Task 5.

- [ ] Update architecture documentation to show:

```text
Terminal MCP -> broker -> tmux PTY
      |
      +-> frontend.mjs
            |-> Kitty / WSLg
            `-> Windows Terminal / wsl.exe
                     |
                     `-> wsl-term present -> same tmux PTY
```

- [ ] Keep the ownership statement explicit:

```text
tmux owns lifetime
broker owns authority
frontend owns presentation only
MCP owns agent interface
```

- [ ] Document the unchanged handback mechanism for either frontend:

```text
Ctrl-b T
# or
wsl-term give <session>
```

The visible window remains attached read-only and can be reused by a later `terminal_yield`.

- [ ] Document Windows Terminal prerequisites and broker-state-aware failure recovery in `docs/operations.md`:

```text
Windows Terminal installed and callable as wt.exe
WSL interoperability enabled
current distro resolvable from WSL_DISTRO_NAME or documented WSL UNC forms
if FRONTEND_NOT_READY reports human attachment still settling -> re-list before retry/manual attach
if neither humanLease nor humanAttached remains -> fallback: wsl-term attach <session>
```

Also document that `cmd.exe /c` is a shell-parsing boundary, so the launcher uses one guarded command builder rather than interpolating unvalidated dynamic strings.

- [ ] State that user-entered secrets/MFA/passwords travel directly through the local terminal client into the PTY, not through ChatGPT/MCP arguments.

---

## Task 4: Verify the candidate, then activate Windows Terminal as a machine-local preference

**Files:**
- Modify machine-local `.env` only after the repository candidate is verified; do not commit personal deployment identity/preferences.
- Generated personal `mcp.json` remains generated state; do not hand-edit it.
- No broker/tmux source or service-template changes expected.

- [ ] Before live activation, inspect the final diff/status and run the **current Full verification section of `docs/development.md`** for the exact candidate source state. Do not duplicate that command list in this plan. If a later live-acceptance defect changes source, the new candidate must pass the current Full verification section again before redeployment.

- [ ] With the selector absent or still `kitty`, re-render the personal configuration through the normal renderer/bootstrap path. The new Terminal env definition should be consumed by qualified 1MCP `mcp.json` hot reload, including atomic renderer replacement. Verify a fresh Terminal backend/tool catalog and one Kitty presentation/handoff before switching the preference.

- [ ] If the rendered Terminal provider definition changed, do **not** restart the whole bridge merely to activate it. Observe normal 1MCP hot reload first. If a later source-only fix needs activation while the provider definition is unchanged, use targeted `1mcp mcp restart terminal` through the qualified live Runtime Target Context. Restart `mcp-dev-bridge.service` only for an observed reload failure or another repository-documented bridge-level reason, and never issue that self-terminating restart from a request executing inside the same bridge process tree.

- [ ] Set on this machine:

```text
MCP_TERMINAL_FRONTEND=windows-terminal
```

- [ ] Re-render the personal configuration again. Expect the selector change to hot-reload/restart only the affected Terminal backend through 1MCP, then verify the fresh backend sees `windows-terminal`.

- [ ] Run a non-GUI Windows-to-WSL re-entry smoke before relying on the GUI path: prove `wsl.exe -d <resolved-distro> -u <resolved-user> --exec /usr/bin/env TERMINAL_NODE_BIN=<process.execPath> <repo>/bin/wsl-term list` reaches the existing broker from the same runtime identity.

- [ ] Do **not** restart `wsl-agent-tmux.service`; tmux owns existing PTY lifetime and is intentionally outside this presentation change. Do not restart `wsl-agent-terminal-broker.service` unless implementation evidence proves the broker itself changed. The intended implementation does not modify it.

**Acceptance:** the exact source state was repository-verified before activation; 1MCP consumes actual Terminal config changes through its qualified hot-reload path; Kitty compatibility is proven before the preference switch; the machine then runs the Terminal provider with `windows-terminal` while existing tmux sessions survive.

---

## Task 5: Bounded live acceptance and installed-Skill activation

This task verifies behavior without using a real password as test data.

- [ ] Open one disposable Terminal session headlessly with a harmless interactive command, for example a prompt that reads a marker from stdin and echoes it back.

- [ ] Confirm the model can read the prompt while the session is model-owned.

- [ ] Call `terminal_yield(name)`.

Expected:

```text
native Windows Terminal becomes visible
same existing tmux PTY is attached
human owns the exact session
model mutation is rejected with HUMAN_HAS_CONTROL
```

- [ ] Type a non-secret marker locally in Windows Terminal, then press `Ctrl-b T` to return that same client to read-only/model-owned state.

- [ ] Confirm the model reads the marker/command result from the same session and can continue sending input without reopening it.

- [ ] Yield the same session again.

Expected: the already attached Windows Terminal client is reused; no duplicate Windows Terminal window is launched.

- [ ] Close the Windows Terminal presentation window while a separate disposable long-running command is active.

Expected: closing the frontend does not destroy the tmux session/process. The model can still list/read the session and can present/yield again later.

- [ ] Leave the machine at its intended `windows-terminal` preference after successful acceptance. Do not toggle back to Kitty merely to prove compatibility; Task 4 already proves Kitty before the preference switch.

- [ ] Update/reinstall the modified `mcp-harness-router` bundle through the supported ChatGPT Skills UI flow documented by `skills/README.md`. Repository Skill files and checksums are only the tracked snapshot; they do not update installed ChatGPT Skill state automatically.

- [ ] Refresh/reconnect the MCP connector/tool catalog as needed so the changed emulator-neutral Terminal tool description is model-visible, then start a **fresh ChatGPT session** and confirm the installed router describes/reuses the configured personal frontend rather than promising Kitty specifically.

- [ ] If the implementation session cannot perform the external Skills UI activation, report **ChatGPT Skill activation pending** rather than claiming the full rollout complete.

No real sudo password needs to be typed for this acceptance. Once the ownership loop is proven with non-secret input, a later real `sudo` prompt uses the exact same PTY/handoff path.

---

## Verification matrix

| Requirement | Smallest strong proof |
| --- | --- |
| Default/selector contract | `tests/harness.sh` proves unset -> `kitty`, both explicit values, invalid-personal rejection, and non-personal isolation |
| Existing frontend reuse | focused frontend test proves `humanAttached=true` causes no spawn |
| Correct Windows distro | focused builder tests accept both `\\wsl.localhost\...` and `\\wsl$\...` derivation and target the resolved current distro |
| Correct Linux user | focused test derives the user from `os.userInfo().username`, not `USER` |
| CMD safety | builder test supports spaces and proves CMD metacharacters are escaped or rejected rather than interpreted |
| Node availability | Windows command carries `/usr/bin/env TERMINAL_NODE_BIN=<process.execPath>` and non-GUI `wsl.exe ... wsl-term list` reaches the existing broker |
| No UNC cwd fallback | Windows launcher spawn uses cwd `/mnt/c` |
| Transient WT semantics | clean launcher exit before attachment continues broker polling and can still succeed |
| Attachment beats launcher | `humanAttached=true` is success even when transient launcher state is nonzero |
| Timeout/lease semantics | timeout with `humanLease=true` reports "still settling" and does not claim model ownership or advertise immediate duplicate attach; timeout with neither lease nor attachment returns fallback |
| Safe cleanup | Windows timeout/failure never invokes process-group cleanup or global `taskkill`/Windows Terminal termination |
| Repository candidate | the current Full verification section of `docs/development.md` passes before activation |
| Provider activation | rendering actual Terminal env changes is observed through 1MCP hot reload; source-only reactivation uses targeted `1mcp mcp restart terminal` when needed |
| Ownership | live yield makes model mutation return `HUMAN_HAS_CONTROL` |
| Return | `Ctrl-b T` restores model mutation on the same PTY |
| Reuse | second yield reuses the attached client and launches no second Windows Terminal window |
| Lifetime | closing Windows Terminal leaves the tmux process/session alive |
| Compatibility | Kitty presentation succeeds before switching the deployment preference |
| Agent contract | tracked Skill validates/checksum matches, then updated Skill is installed and verified from a fresh ChatGPT session |

---

## Rollback

Rollback must remain a presentation-only operation:

1. set `MCP_TERMINAL_FRONTEND=kitty` in the machine-local deployment env or remove the override;
2. re-render the personal configuration;
3. observe qualified 1MCP hot reload of the changed Terminal definition and verify the fresh backend; use targeted `1mcp mcp restart terminal` only for source-only reactivation, with whole-bridge restart reserved for observed reload failure/documented bridge-level reasons;
4. leave broker and tmux lifetime services untouched.

Existing sessions and processes must survive the rollback. The installed router Skill may remain emulator-neutral because that wording is valid for Kitty; if source/Skill contracts themselves are reverted to Kitty-specific behavior, roll back the installed ChatGPT Skill separately through the Skills UI.

---

## Failure and recovery matrix

| Failure | Required behavior |
| --- | --- |
| configured frontend value invalid | fail configuration rendering before activation |
| Kitty missing | `FRONTEND_UNAVAILABLE` + `wsl-term attach <session>` |
| Windows Terminal missing/unresolvable | `FRONTEND_UNAVAILABLE` or launch failure + manual attach fallback |
| current WSL distro cannot be resolved | refuse Windows launch; preserve PTY; show manual attach fallback |
| fresh `wsl.exe --exec` lacks provider Node on `PATH` | launch through `/usr/bin/env TERMINAL_NODE_BIN=<process.execPath>`; do not source NVM or hard-code Node |
| Windows command builder receives unsupported CMD metacharacters | fail closed before launch with actionable frontend error; do not pass ambiguous shell syntax to CMD |
| `cmd.exe`/`wt.exe` spawn fails before broker handoff | bounded `FRONTEND_LAUNCH_FAILED`; preserve PTY and use broker state for any ownership claim |
| Windows launcher inherits WSL UNC cwd | prevent by spawning `cmd.exe` with child cwd `/mnt/c` |
| transient Windows launcher exits 0 before attach | keep polling broker; success remains `humanAttached` |
| transient launcher exits nonzero but broker already reports `humanAttached` | attachment wins; return success rather than overwriting observed readiness with launcher status |
| deadline reached with `humanLease=true` and no attachment | `FRONTEND_NOT_READY` with "attachment still settling; re-list before retry/manual attach" guidance; preserve PTY and do not claim model ownership |
| deadline reached with neither human lease nor attachment | `FRONTEND_NOT_READY` + exact manual attach fallback |
| human already attached | reuse; do not launch configured frontend |
| human owns session | model send/resize/ordinary close remain blocked |
| presentation window closes | tmux process survives; later presentation can reattach |
| rendered Terminal definition changes | use qualified 1MCP config hot reload first; verify the fresh backend rather than restarting the whole bridge by default |
| source changes with unchanged Terminal definition | use targeted `1mcp mcp restart terminal` when activation is needed; whole bridge restart is fallback only under documented conditions |
| tracked router Skill changed but fresh ChatGPT still uses old wording | repository snapshot is not installed state; update/reinstall through Skills UI and start a fresh session |
| broker/1MCP restarts | must not redefine PTY lifetime; existing tmux session remains authoritative |

---

## Non-goals / deferred work

Do not include these in the first implementation:

- arbitrary terminal-emulator plugin architecture;
- automatic preference ranking among Kitty, Windows Terminal, WezTerm, GNOME Terminal, etc.;
- Windows-side broker or tmux replacement;
- additional MCP tools for GUI/handoff control;
- password/MFA collection APIs;
- changing collaborative session lease semantics;
- changing transcript/cursor storage;
- cross-machine or remote Windows Terminal presentation;
- multiple simultaneous designated human frontends for one session;
- automatically migrating an already attached Kitty client into Windows Terminal or vice versa.

If another frontend is requested later, first prove that adding one more small launcher branch is insufficient before introducing a registry/plugin abstraction.

---

## Implementation stop conditions

Stop and reassess rather than expanding scope if any of these occur:

1. Windows Terminal cannot attach by re-entering the current WSL distribution and invoking existing `wsl-term present`.
2. Supporting Windows Terminal appears to require changing tmux lifetime, broker ownership, or the MCP tool schema.
3. Reliable current-distribution discovery requires machine-specific hard-coding.
4. The only proposed cleanup requires killing unrelated Windows Terminal windows/processes.
5. A second parallel terminal-control service appears necessary.

Those outcomes would indicate the proposed presentation-only design assumption is wrong and should be reviewed before implementation continues.

---

## Final acceptance criteria

The implementation is complete when all of the following are true:

- The Terminal MCP still exposes exactly the existing seven operations.
- Headless `terminal_open` behavior is unchanged.
- `present:true` and `terminal_yield` can automatically use native Windows Terminal when configured.
- Kitty remains supported and is still the tracked/default frontend.
- Windows Terminal attaches to the exact existing tmux PTY through `wsl-term present`; it does not recreate the command/session.
- Existing attached frontends are reused instead of duplicated.
- Model mutation remains blocked while the human has writable control.
- `Ctrl-b T` / `wsl-term give` returns the same visible client to read-only/model-owned mode.
- A transient successful `wt.exe` launcher exit does not cause a false presentation failure.
- Failed/timed-out Windows Terminal presentation always leaves the tmux session alive; ownership/error wording reflects the final broker state. A still-live human lease is reported as settling rather than falsely claimed model-owned, and immediate manual attach is offered only when neither lease nor attachment exists.
- Closing Windows Terminal does not kill the underlying command.
- No credentials, passwords, cookies, or secrets are placed in MCP/config/launcher arguments.
- Normal activation/rollback never requires restarting the tmux lifetime service.
- The personal deployment can switch between `kitty` and `windows-terminal` without changing the Terminal MCP contract.
- Fresh Windows-to-WSL re-entry receives `TERMINAL_NODE_BIN=process.execPath`, so `wsl-term` does not depend on NVM or login-shell PATH initialization.
- Distro resolution accepts both documented WSL UNC forms and Linux-user resolution uses the process account (`os.userInfo().username`).
- One dedicated CMD command builder safely handles ordinary spaces and fails closed or correctly escapes unsupported metacharacters across every dynamic Windows-launch value.
- The Windows launcher starts with cwd `/mnt/c`, avoiding CMD's UNC-current-directory fallback.
- The current `docs/development.md` Full verification section passes for the exact candidate before live activation.
- Actual Terminal env-definition changes activate through qualified 1MCP hot reload; whole-bridge restart is not the default rollout path.
- The tracked router Skill validates/checksum matches, the updated bundle is actually installed/activated in ChatGPT, and a fresh session describes the configured personal frontend rather than promising Kitty specifically. If that external step is unavailable, overall rollout remains `ChatGPT Skill activation pending`.

## Planned verification policy

Do not create new test infrastructure or a new test file. Use the existing owners only:

- `tests/harness.sh` for selector default/override/personal-only rendering behavior;
- `providers/terminal/test/frontend.test.mjs` for Windows launcher construction/readiness behavior that Kitty coverage cannot prove;
- the repository's existing Skill validator plus `skills/SNAPSHOT_SHA256.txt` for the tracked router bundle.

The smallest distinct frontend cases are:

```text
existing human frontend -> no launcher spawn
WSL distro parser -> accepts both \\wsl.localhost and \\wsl$ forms
Linux user -> os.userInfo().username, not USER
CMD builder -> supports spaces; metacharacters cannot become shell control syntax
Windows command -> /usr/bin/env + TERMINAL_NODE_BIN=process.execPath + same distro/user
Windows spawn cwd -> /mnt/c
transient launcher exit 0 before attachment -> keep waiting; attachment can still succeed
humanAttached + launcher nonzero -> attachment wins
Windows deadline + humanLease -> settling error, no model-owned/manual-attach certainty
Windows deadline + no lease/attachment -> FRONTEND_NOT_READY + manual fallback
Windows timeout/failure -> no process-group/taskkill cleanup
```

Avoid tests that merely restate broker/tmux ownership behavior already covered elsewhere.

For candidate-final verification, do **not** freeze a command subset here. Run the **current Full verification section of `docs/development.md`** for the exact source state before activation. Validate the changed Skill bundle/checksum as part of the surface wave. If any source/config/doc/Skill source changes after a failed live acceptance, that creates a new candidate and the current full gate must pass again before redeployment.

After the repository gate is green, perform the bounded runtime evidence in order: non-GUI Windows-to-WSL `wsl-term list` re-entry; Kitty compatibility under the default selector; 1MCP hot-reload of the `windows-terminal` selector; live yield/return/reuse/lifetime acceptance; installed-Skill update and fresh-session routing acceptance. If the external Skill installation cannot be completed, report that boundary as pending rather than weakening repository/runtime verification.
