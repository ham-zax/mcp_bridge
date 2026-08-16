# Task 7 — Personal Terminal MCP + Exact-PTY Human Takeover Acceptance

**Date:** 2026-08-15

**Base:** `0441b947898c65de9bfedbfa5db5693d65fa21b9`

**Branch:** `feat/personal-harness-agent-3-terminal-mcp`

**Worktree:** `<repo>/.worktrees/personal-harness-agent-3-terminal-mcp`

**LOCAL_IMPLEMENTATION:** COMPLETE

**LOCAL_ACCEPTANCE:** COMPLETE

**REAL_CHATGPT_ACCEPTANCE:** COMPLETE

**FINAL_PRODUCT_VERDICT:** `TERMINAL_ACCEPTED`

**TASK_8_UNBLOCKED:** YES — the fresh-session ChatGPT -> Cloudflare/OAuth -> 1MCP -> Terminal MCP -> broker -> tmux path passed

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

**Status: COMPLETE.**

**Final verdict: `TERMINAL_ACCEPTED`.**

The live product path was exercised end to end:

```text
ChatGPT -> Cloudflare/OAuth -> 1MCP -> Terminal MCP -> broker -> tmux
```

Connector heartbeat passed, and the already-integrated Code provider remained usable during the acceptance run.

### Basic Terminal behavior

```text
persistent shell                       PASS
incremental unread reads               PASS
immediate second read, no new output   empty / no duplicate
resize                                 PASS
verified terminal size                 33 101
non-zero exit retention                PASS
exact retained status                  exit=7
```

### Broker restart durability

The live session was `chatgpt-acceptance`.

Before restarting only the Terminal broker:

```text
broker PID  3118267
tmux PID    3118265
pane PID    3135815
```

After the broker-only restart:

```text
broker PID  3139861  changed
tmux PID    3118265  unchanged
pane PID    3135815  unchanged
```

Therefore the product path proved:

```text
broker replaced                   YES
tmux lifetime authority survived  YES
PTY/pane process survived         YES
broker socket restored            YES
```

After the broker returned, ChatGPT successfully wrote and read `AFTER_BROKER_RESTART` through the same Terminal session.

### Human takeover

A human attached to the exact same PTY with:

```text
wsl-term attach chatgpt-acceptance
```

While human control was active:

```text
terminal_read            PASS / allowed
terminal_send            HUMAN_HAS_CONTROL
terminal_resize          HUMAN_HAS_CONTROL
ordinary terminal_close  HUMAN_HAS_CONTROL
```

The human typed `HUMAN_SIDE_MARKER` directly into the attached PTY. ChatGPT observed that marker through `terminal_read` while model writes remained blocked.

After human detach, model write control returned. ChatGPT successfully wrote and read `MODEL_CONTROL_RESTORED`.

Normal cleanup passed.

A small number of individual ChatGPT tool invocations were intercepted once by the ChatGPT/tool runtime before reaching MCP and succeeded on retry. This is product-path observational evidence only; it is not classified as a Terminal-provider defect and does not define a new harness subsystem.

## Deviations / review notes

- The live product run was performed after the original Task-7 design branch had been integrated and activated externally; this document now records that later acceptance evidence.
- The additional live transcript-pipe reconciliation guard described above remains part of the accepted implementation because broker restart must preserve continuing transcript capture.
- The Task-7 local systemd qualification and the later real ChatGPT product-path acceptance are separate evidence layers; both are retained here.

## Post-acceptance coordinator probe

A later disposable coordinator probe exercised a case that the original product-path matrix did not cover: explicit close followed by reopening the **same Terminal name**.

Observed on the accepted Task-7 deployment:

```text
first incarnation -> OLD_SESSION_MARKER
close
same-name second incarnation -> NEW_SESSION_MARKER
first read of second incarnation -> OLD_SESSION_MARKER + NEW_SESSION_MARKER
```

The tmux session itself was new, but the old per-name transcript directory remained and the new model cursor started at zero. This is a scoped session-state adapter defect, not a failure of the accepted tmux lifetime/human-takeover architecture. Task 8 already requires stable Terminal generations, so its first private Terminal task now also requires fresh per-incarnation transcript/model-cursor state and generation-guarded explicit transcript reads.

Until that fix lands, use unique Terminal names when reopening after explicit close if stale transcript replay would be confusing.

## Risks / blockers

The real Task-7 product path remains `TERMINAL_ACCEPTED` for the qualified unique-name workflow, and Task 8 design remains unblocked. The same-name reincarnation defect above is a required Task-8 Task-1 regression/fix before wait semantics can rely on session generation.
