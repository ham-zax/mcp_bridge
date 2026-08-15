# Task 7 — Personal Terminal MCP + Exact-PTY Human Takeover Acceptance

**Date:** 2026-08-15

**Base:** `0441b947898c65de9bfedbfa5db5693d65fa21b9`

**Branch:** `feat/personal-harness-agent-3-terminal-mcp`

**Worktree:** `<repo>/.worktrees/personal-harness-agent-3-terminal-mcp`

**LOCAL_ACCEPTANCE:** COMPLETE

**REAL_CHATGPT_ACCEPTANCE:** PENDING

**TASK_8_UNBLOCKED:** YES after coordinator integration of this Task-7 branch

## Frozen architecture

- Terminal backend remains tmux + the qualified Terminal broker: `TMUX_BROKER_WINS`.
- Herdr is not a production dependency.
- No Herdr/tmux hybrid was added.
- No Task-8 await/resume implementation was added.
- No Code facade architecture was changed.
- `tmux -N -L wsl-agent` remains the production PTY/process lifetime authority.
- The broker socket remains `$XDG_RUNTIME_DIR/wsl-agent-terminal.sock`.
- The normal model output path remains the broker transcript, not tmux screen snapshots.

## Model-facing Terminal schema

The MCP provider exposes exactly six tools:

```text
terminal_open
terminal_read
terminal_send
terminal_resize
terminal_list
terminal_close
```

No broker lease operation and no raw tmux command is registered as an MCP tool.

### `terminal_open`

```text
name: string (required; ^[A-Za-z0-9._-]{1,64}$)
command?: string
cwd?: string
cols?: integer 1..1000
rows?: integer 1..1000
```

Defaults are provided by the existing Terminal core:

```text
cwd=<private personal default cwd>
command=<interactive user shell>
cols=80
rows=24
```

An omitted command enters the existing pane-entry path and execs `$SHELL`, falling back to `/bin/bash`.

### `terminal_read`

```text
name: string (required)
cursor?: non-negative integer
snapshot?: boolean
```

Normal `terminal_read(name)` calls private broker operation `model.read` with no caller cursor. The broker loads the persisted per-session model cursor, reads from the transcript, then advances that cursor only after a successful read. A second no-new-output read returns an empty TextContent value rather than a duplicate snapshot.

An explicit `cursor` is recovery/resynchronization input. Successful explicit reads move the broker-owned model cursor to the returned `nextCursor` exactly. Cursor errors remain explicit:

```text
CURSOR_EXPIRED
CURSOR_AHEAD
INVALID_CURSOR
```

`CURSOR_EXPIRED` preserves the bounded transcript recovery tail. Logical byte offsets remain monotonic and the existing UTF-8 boundary logic remains authoritative.

`snapshot=true` captures the current tmux pane screen for TUI/debugger recovery. It does not advance or replace the transcript model cursor and is not the normal output path.

### `terminal_send`

Exactly one of these inputs is required:

```text
text: string
key: one recognized public key
```

Both-present and neither-present calls fail SDK/Zod input validation before the broker is called.

Recognized keys and internal fixed mappings:

```text
ENTER      -> Enter
CTRL_C     -> C-c
CTRL_D     -> C-d
CTRL_Z     -> C-z
ESC        -> Escape
TAB        -> Tab
BACKSPACE  -> BSpace
UP         -> Up
DOWN       -> Down
LEFT       -> Left
RIGHT      -> Right
```

Arbitrary tmux key syntax is not model-facing.

### `terminal_resize`

```text
name: string
cols: integer 1..1000
rows: integer 1..1000
```

### `terminal_list`

No arguments. Native TextContent reports concise session state including live/dead state, exact dead exit status, pane PID, dimensions, and human-control state.

### `terminal_close`

```text
name: string
force?: boolean
```

Ordinary close is blocked during human control. `force=true` is the explicit administrative override retained by the canonical Task-7 design; it does not expose raw tmux control.

## Native result contract

All six MCP tools return normal MCP `TextContent` blocks. Terminal transcript/snapshot output is returned directly as text, not JSON encoded inside a text string. Administrative operations return compact native text. Terminal failures are returned as native MCP error TextContent preserving stable codes such as:

```text
HUMAN_HAS_CONTROL
CURSOR_EXPIRED
CURSOR_AHEAD
```

The `CURSOR_EXPIRED` error result includes the bounded recovery cursor/tail supplied by the broker.

## Broker-owned model cursor

A private `model-cursor.json` is stored inside each existing Terminal session state directory.

Properties:

- default offset `0` when absent;
- non-negative safe integer validation;
- atomic temp-write + rename;
- file mode `0600` inside the existing mode-`0700` session directory;
- concurrent `model.read` calls are serialized per session by the broker;
- only successful transcript reads advance the persisted cursor;
- `CURSOR_EXPIRED` and `CURSOR_AHEAD` do not silently rewrite it;
- `snapshot=true` does not alter it;
- broker restart reloads the same persisted cursor.

The ordinary raw private `session.read` operation remains available for broker/core testing and recovery internals, but model-facing `terminal_read` uses `model.read`.

## Human-lease contract

The broker, not merely the MCP wrapper, is authoritative for model mutation rights.

Without human control:

```text
terminal_read    allowed
terminal_list    allowed
terminal_send    allowed
terminal_resize  allowed
ordinary close   allowed
```

With a live human lease / real attached tmux client:

```text
terminal_read    allowed
terminal_list    allowed
terminal_send    HUMAN_HAS_CONTROL
terminal_resize  HUMAN_HAS_CONTROL
ordinary close   HUMAN_HAS_CONTROL
force close      explicit override
```

Broker mutation paths `session.send`, `session.resize`, and ordinary `session.close` reconcile human control before mutating the PTY.

Reconciliation checks both broker lease metadata and `tmux list-clients` for the exact session. A real attached tmux client blocks model mutation even after broker restart, so losing broker memory cannot silently reopen writes while a human remains attached.

Private lease metadata contains ownership metadata only:

```text
leaseId
clientId
acquired timestamp
bound tmux client PID
observed-client flag
```

A bound client that was observed and then disappears clears stale ownership. A pending/bound client that never appears expires after the bounded attach grace. This prevents a crashed attach wrapper from permanently locking the session.

## `wsl-term` contract

Entrypoint:

```text
bin/wsl-term
```

Supported commands:

```text
wsl-term list
wsl-term attach <session>
```

`wsl-term list` queries broker session state.

`wsl-term attach <session>`:

1. requires a real interactive TTY;
2. acquires a private broker human lease;
3. directly spawns the exact tmux client against the existing production namespace:

   ```text
   tmux -N -L wsl-agent attach-session -t <session>
   ```

   The test-only core socket-path override uses `-S <sandbox socket>`; production remains `-L wsl-agent`.
4. gives the tmux child inherited stdin/stdout/stderr rather than proxying terminal bytes through Node;
5. binds the actual tmux child PID to the broker lease;
6. releases the lease after normal detach/exit;
7. relies on broker-vs-real-tmux-client reconciliation if the wrapper dies abnormally.

The wrapper never auto-starts tmux because every tmux invocation uses `-N`.

## Sudo/password handling

No human keystroke path or auxiliary input log was added.

The CLI does not subscribe to, duplicate, buffer, or pipe stdin through the broker. Human bytes go from the caller's TTY directly to the attached tmux client/PTY.

Acceptance used a disposable no-echo password-style prompt:

```text
stty -echo
read -r secret
stty echo
```

A unique secret was typed through the real `wsl-term` pseudo-TTY attach. The test proved:

- the completion marker appeared in the Terminal transcript;
- the secret did not appear in that transcript;
- the secret did not appear anywhere under the Terminal state root;
- the secret did not appear in broker stderr/log capture.

No real sudo password was requested, stored, or supplied during qualification. The direct exact-PTY path is therefore the same path a real sudo password uses without an auxiliary broker input copy.

## Personal composition

Only `config/templates/mcp-personal.json` receives the Terminal provider.

Final personal provider set:

```text
code
dev
terminal
```

Terminal provider entry:

```text
command=node
args=[<repo>/providers/terminal/mcp-server.mjs]
MCP_TERMINAL_SOCKET=<XDG_RUNTIME_DIR>/wsl-agent-terminal.sock
MCP_TERMINAL_READ_MAX_BYTES=65536
```

`render-config.mjs` resolves the personal runtime socket from absolute `XDG_RUNTIME_DIR`, falling back to `/run/user/<uid>`.

The private Terminal installer now runs:

```text
npm --prefix <repo>/providers/terminal ci --omit=dev
```

before enabling the Terminal user units. The MCP dependency pins are:

```text
@modelcontextprotocol/sdk 1.30.0
zod 4.4.3
```

## Public-profile verification

Public composition is unchanged:

```text
restricted  -> dev + shell
trusted-dev -> dev
```

Harness assertions explicitly reject `terminal` in both public profiles.

Publication tests continue to classify these as private-only:

```text
config/templates/mcp-personal.json
providers/terminal/*
bin/wsl-term
```

No public template/profile, Pi provider, or Code facade implementation file changed in Task 7.

## Local acceptance

Fresh final local matrix before this report:

```text
Terminal                 36/36 pass
Pi                       83 pass, 0 fail, 4 pre-existing TODO trigger tests
Code router              30/30 pass
harness                   6/6 pass
publication              16/16 pass
lifecycle                27/27 pass
Terminal/renderer syntax PASS
shell syntax             PASS
git diff --check         PASS
```

Terminal coverage includes:

- exactly six MCP tools;
- native TextContent;
- normal zero-duplicate reads;
- persisted broker model cursor across restart;
- explicit `CURSOR_EXPIRED`/`CURSOR_AHEAD` behavior;
- UTF-8 cursor correctness;
- normal text send;
- all required control/navigation keys;
- resize;
- exact non-zero dead status (`exit=7`);
- mixed live/dead retained-pane restart regression;
- immediate first-byte capture;
- broker restart preserving tmux/PTY and post-restart transcript capture;
- exact-PTY `wsl-term` attach;
- send/resize/ordinary-close blocking during human control;
- model read during human control;
- detach restoring model mutation rights;
- stale/pending lease recovery;
- real-client ownership surviving broker restart;
- no-echo secret/password-path proof;
- stopping the tmux lifetime boundary terminates the PTY process.

## Broker-restart production evidence

A real user-systemd gate was run using the production unit names and this Task-7 worktree. Before the gate, both Terminal units were absent/inactive and no `wsl-agent` tmux server existed. The live `mcp-dev-bridge.service` was observed as `active/exited` and was never restarted or reconfigured.

The gate held one MCP provider/client open while creating:

```text
task7-live   continuously producing output
task7-zero   retained dead pane, exit 0
task7-seven  retained dead pane, exit 7
```

Initial evidence:

```text
broker PID       2935295
tmux PID         2935294
live pane PID    2949598
live cursor      4332
exit-0 cursor    36
exit-7 cursor    38
exit statuses    0 / 7
```

After broker restart #1:

```text
broker PID       2949730   changed
tmux PID         2935294   unchanged
live pane PID    2949598   unchanged
live cursor      4332 -> 4416
exit-0 cursor    36, unread bytes 0
exit-7 cursor    38, unread bytes 0
exit statuses    0 / 7 unchanged
same MCP client  terminal_list succeeded and reported exit=7
```

After broker restart #2:

```text
broker PID       2949784   changed again
tmux PID         2935294   unchanged
live pane PID    2949598   unchanged
same MCP client  terminal_read returned 59 bytes of new live output
exit-0 cursor    36, unread bytes 0
exit-7 cursor    38, unread bytes 0
exit statuses    0 / 7 unchanged
```

This proves the same MCP provider process reconnects to a restarted broker, while the tmux lifetime authority and exact live PTY persist and retained dead-pane cursor/status state stays stable.

Stopping only:

```text
systemctl --user stop wsl-agent-tmux.service
```

then yielded:

```text
tmux PID 2935294     dead
pane PID 2949598     dead
wsl-agent-tmux       inactive/dead
terminal broker      inactive/dead
```

The real Terminal service state was then restored to its exact pre-gate condition:

```text
wsl-agent-tmux.service              not-found / inactive
wsl-agent-terminal-broker.service   not-found / inactive
wsl-agent tmux namespace            absent
```

The bridge remained `active/exited` throughout and was not touched.

## Mixed live/dead regression

The Task-6.6 mixed live/dead retained-pane regression remains green in the fresh Terminal suite. It retains one live pane plus exit-0 and exit-7 dead panes across two broker restarts and verifies stable dead status/transcript behavior.

Task 7 also found one additional tmux 3.4 reconciliation edge during its model-cursor restart test: rerunning `pipe-pane -o <writer>` on a pane with an already-live pipe toggles that existing pipe off on this tmux build. The fix adds an explicit `#{pane_pipe}` check and installs a transcript pipe only when no pipe is already attached. A focused regression proves output written after broker reconciliation still reaches the transcript. This change is required by Task-7 broker-restart acceptance and does not alter the Task-6.6 dead-pane behavior.

## Real ChatGPT acceptance

**Status: PENDING.**

The current session is itself using the live bridge. The mission explicitly forbids replacing/restarting a bridge from inside a process owned by that same bridge, and user-facing Actions Refresh is external/manual. Therefore no live 1MCP/bridge refresh was attempted.

After the coordinator integrates the final Task-7 commit onto the newer assembled integration head, activation must be performed from an external WSL shell/session that is not dependent on the bridge being restarted:

1. Enter the integrated checkout.

2. Install/refresh the private Terminal services and provider dependencies:

   ```bash
   bash scripts/install-terminal-broker-user.sh
   systemctl --user start wsl-agent-tmux.service wsl-agent-terminal-broker.service
   systemctl --user status wsl-agent-tmux.service wsl-agent-terminal-broker.service --no-pager
   ```

3. Render the personal 1MCP composition into the existing external bridge state directory. The standard state directory is derived exactly as the bridge library does:

   ```bash
   BRIDGE_STATE_BASE="${XDG_STATE_HOME:-$HOME/.local/state}"
   BRIDGE_STATE_DIR="${BRIDGE_STATE_DIR:-$BRIDGE_STATE_BASE/mcp-dev-bridge}"
   node scripts/render-config.mjs \
     --profile personal \
     --env-file .env \
     --state-dir "$BRIDGE_STATE_DIR" \
     --repo-root "$PWD"
   ```

   If the deployment already supplies a non-default `BRIDGE_STATE_DIR`, use that exact deployed value rather than the default above.

4. From that same external shell, restart/reconcile the bridge using the site's existing external lifecycle control. For a systemd-managed deployment, restart `mcp-dev-bridge.service` externally; do not issue the restart from a ChatGPT request running through that bridge.

5. Confirm external bridge status:

   ```bash
   bin/status
   ```

6. In the ChatGPT product, perform the required Actions/connector refresh so the newly rendered personal provider catalog is reloaded.

7. From a fresh ChatGPT session, verify exactly these six Terminal tools and no lease/raw-tmux tools:

   ```text
   terminal_open
   terminal_read
   terminal_send
   terminal_resize
   terminal_list
   terminal_close
   ```

8. Run a product-path scenario:

   - open an interactive shell;
   - read initial output twice and verify the second no-new-output read is empty;
   - send text and `ENTER`;
   - exercise `CTRL_C` and one navigation key;
   - resize;
   - open a command that exits `7` and verify `terminal_list` reports exact exit `7`;
   - in the external WSL shell run `wsl-term attach <session>`;
   - while attached, verify ChatGPT read/list still work while send/resize/ordinary close return `HUMAN_HAS_CONTROL`;
   - detach the human client and verify ChatGPT send works again.

Only after that external/product run should `REAL_CHATGPT_ACCEPTANCE` be changed from `PENDING` to `COMPLETE`.

## Deviations / review notes

- No rebase or merge onto the newer integration branch was performed. This Task-7 branch remains based on `0441b94` exactly as directed; coordinator integration is separate.
- The additional live transcript-pipe reconciliation guard described above was discovered by a Task-7 restart test and is included because Task 7 explicitly requires broker restart to preserve continuing terminal output.
- The first real-systemd acceptance attempt could not call `systemctl --user` from a nested Node process because that process had not inherited `DBUS_SESSION_BUS_ADDRESS`. No architecture result was taken from that attempt. The Terminal services were reset to a clean namespace, the correct user-bus environment was exported, and the complete gate was rerun successfully. The machine was restored afterward.
- Independent reviewer/subagent dispatch is unavailable in this web session. Final review was therefore inline: diff scope, six-tool registration, input-secrecy path, frozen-domain exclusions, tests, syntax, and systemd evidence were checked directly.

## Risks / blockers

No local Task-7 correctness blocker remains.

The only outstanding acceptance item is the external product-path refresh/verification described above. That is intentionally pending rather than being performed from the bridge-owned ChatGPT session.
