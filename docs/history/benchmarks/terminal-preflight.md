# Terminal Core Preflight and Durability Evidence

**Mission:** Personal WSL Codex Harness Phase 2, Task 6 only

**Branch:** `feat/personal-harness-agent-3-terminal-core`

**Starting commit:** `8ff5db7`

**Qualification date:** 2026-08-15

## Frozen production contracts

```text
tmux namespace       wsl-agent
broker socket        $XDG_RUNTIME_DIR/wsl-agent-terminal.sock
state root           $XDG_STATE_HOME/wsl-agent-terminal
default cwd          /home/hamza
session names        ^[A-Za-z0-9._-]{1,64}$
transcript budget    16 MiB per session
tmux unit            wsl-agent-tmux.service
broker unit          wsl-agent-terminal-broker.service
```

Observed runtime:

```text
Node.js        v24.19.0
npm            12.0.2
tmux           3.4 (Ubuntu package 3.4-1ubuntu0.1)
systemd        255
```

## Lifetime topology

The tmux lifetime service runs the dedicated server in the foreground:

```text
ExecStart=<tmux> -D -L wsl-agent -f /dev/null
```

`-D` keeps the tmux server as the service process and disables tmux's normal `exit-empty` behavior. Broker-side tmux calls always include `-N`, so the broker refuses to auto-start a missing tmux server. The broker therefore cannot accidentally become the tmux server's systemd parent/cgroup owner.

The units are separate:

```text
systemd --user
  |
  +-- wsl-agent-tmux.service
  |     +-- tmux -D -L wsl-agent
  |     +-- tmux-owned pipe-pane transcript writer
  |     +-- tmux-created pane scope(s)
  |
  +-- wsl-agent-terminal-broker.service
        +-- node providers/terminal/broker.mjs
```

The broker has `Requires=` and `After=` on the tmux lifetime unit, but there is no `PartOf=`, `BindsTo=`, or `KillMode=process`. Restarting the broker does not restart the tmux unit. Stopping the tmux unit intentionally ends the Terminal lifetime boundary.

### tmux 3.4 systemd cgroup behavior

Ubuntu's tmux 3.4 build has systemd integration enabled. A focused production check showed that the pane process is moved by tmux into a tmux-created transient scope rather than remaining directly inside the `wsl-agent-tmux.service` cgroup:

```text
tmux PID   2424703
  cgroup   /user.slice/user-1000.slice/user@1000.service/app.slice/wsl-agent-tmux.service

broker PID 2424709
  cgroup   /user.slice/user-1000.slice/user@1000.service/app.slice/wsl-agent-terminal-broker.service

pane PID   2427181
  PPID     2424703
  cgroup   /user.slice/user-1000.slice/user@1000.service/app.slice/
           tmux-spawn-2c637904-e763-49a0-a48b-b0ad97c7d3c6.scope
```

`systemctl --user show` described that scope as:

```text
Description=tmux child pane 2427181 launched by process 2424703
```

The transcript `pipe-pane` writer remained in the tmux service cgroup. Explicitly stopping `wsl-agent-tmux.service` killed pane PID `2427181` and the tmux-created scope became `inactive`. The pane was never in the broker service cgroup.

## Private broker protocol

The local Unix socket uses one newline-delimited JSON request/response per line. Task 6 freezes these internal operations only:

```text
session.open
session.list
session.read
session.send
session.resize
session.close
lease.acquire_human
lease.release_human
```

This protocol is private and not model-facing. No Terminal MCP actions or human attach CLI are part of Task 6.

## Transcript and cursor contract

Per-session state is under the configured state root with:

```text
state/session directories   0700
transcript.bin              0600
cursor.json                 0600
session.json                0600
```

The transcript writer is launched by tmux through `pipe-pane`, so capture survives broker death/restart. The broker does not own the writer.

Cursor state records a monotonic logical byte range:

```text
baseOffset   first retained logical byte
endOffset    one past the last logical byte ever captured
```

Reads return only complete UTF-8 code points and advance by returned byte count. Rotation retains at most the configured byte budget and advances `baseOffset`; it never renumbers retained data back to zero. A cursor older than `baseOffset` fails explicitly with `CURSOR_EXPIRED` and includes a bounded recovery tail. A cursor beyond `endOffset` fails with `CURSOR_AHEAD`.

A small cross-process lock protects transcript/file cursor updates. If the lock owner dies, a later writer/reader can reclaim the stale lock based on owner PID rather than wedging capture after a broker crash.

### Immediate-output race prevention

A new pane starts in a small gate process. The open transaction performs these steps before releasing the command:

```text
1. create private transcript/cursor state
2. create detached tmux session with pane entry waiting on a gate
3. set remain-on-exit on
4. install tmux pipe-pane transcript capture
5. write session metadata
6. release the gate
7. pane entry execs the requested shell/command in the same pane PID
```

The command therefore cannot emit its first bytes before `pipe-pane` is installed.

## Mandatory production systemd broker-restart gate

The real user units were rendered into `~/.config/systemd/user`, enabled, started, and exercised through the real broker socket. The live MCP bridge was not restarted or reconfigured.

Long-lived session command:

```bash
i=0; while :; do printf 'systemd-tick:%s\n' $i; i=$((i+1)); sleep 0.1; done
```

Evidence around **only** `systemctl --user restart wsl-agent-terminal-broker.service`:

| Evidence | Before broker restart | After broker restart | Result |
|---|---:|---:|---|
| tmux server PID | `2420503` | `2420503` | unchanged |
| broker PID | `2420504` | `2421945` | changed |
| PTY/pane PID | `2421032` | `2421032` | unchanged |
| transcript `endOffset` | `3706` | `3724` | advanced |
| read cursor | `3670` | `3724` | advanced |
| bytes read after old cursor | n/a | `54` | new output returned |
| recovered session | present | present | rediscovered |

The pre-restart read tail contained ticks `205` through `209`. Reading from the saved cursor after restart returned ticks `210` through `212`, proving incremental capture continued rather than replaying or substituting different bytes.

The broker journal independently recorded:

```text
initial broker PID 2420504: reconciled=0
restarted broker PID 2421945: reconciled=1
```

At the same time, the tmux service cgroup still contained the original tmux server plus tmux-owned transcript pipe processes. The restarted broker had only its own Node process in the separate broker cgroup.

**Durability verdict:** PASS.

## Production immediate-output race gate

A real broker/systemd session was opened with a command that prints immediately and exits:

```bash
printf 'IMMEDIATE_PROD_FIRST_BYTES\n'
```

Observed:

```text
server PID       2420503
pane PID         2422831
transcript text  "IMMEDIATE_PROD_FIRST_BYTES\r\n"
transcript bytes 28
next cursor      28
pane dead        true
exit status      0
```

The transcript began with the expected marker; no first bytes were lost.

**Immediate-output verdict:** PASS.

## Explicit tmux lifetime-stop gate

Before stopping the lifetime unit:

```text
tmux PID    2420503
broker PID  2421945
PTY PID     2421032
```

After:

```bash
systemctl --user stop wsl-agent-tmux.service
```

Observed:

```text
wsl-agent-tmux.service             inactive
tmux PID 2420503                   dead
PTY PID 2421032                    dead
wsl-agent-terminal-broker.service  inactive (Requires= dependency followed tmux shutdown)
```

A second focused cgroup check also showed the tmux-created pane scope becoming `inactive` when the tmux lifetime unit stopped.

**Lifetime-boundary verdict:** PASS.

## Live-system boundary and cleanup

Before and after qualification, `mcp-dev-bridge.service` remained:

```text
ActiveState=active
SubState=exited
ControlGroup=/user.slice/user-1000.slice/user@1000.service/app.slice/mcp-dev-bridge.service
```

No command in this qualification stopped, restarted, or reconfigured `mcp-dev-bridge.service`, 1MCP, Cloudflare, OAuth/session state, or the current live MCP composition.

After evidence capture, only the newly created `wsl-agent-*` test deployment was cleaned up: both test units were stopped/disabled, the rendered user-unit files were removed, the test state root/socket were removed, and `daemon-reload` was run. The committed templates/installer are the deployment artifacts.

## Automated qualification

Provider suite after implementation:

```text
(cd providers/terminal && npm test)
17 tests, 17 pass, 0 fail
```

Covered behavior includes:

```text
broker crash/restart survival
same tmux + pane PIDs across broker restart
broker recovery/reconciliation
incremental transcript continuation
immediate-output capture
send text/key
resize
capture-pane snapshot primitive
list sessions/clients
remain-on-exit
pane dead exit status
close
session-name contract
UTF-8 cursor boundaries, including multibyte characters split across pipe chunks
rotation + CURSOR_EXPIRED recovery
private file modes
systemd structural ownership assertions
explicit tmux lifetime stop
```

Static checks are part of the final mission gate:

```bash
node --check providers/terminal/*.mjs
bash -n scripts/install-terminal-broker-user.sh
git diff --check
```

## Contracts Task 7 must preserve

Task 7 may add the MCP surface and human attachment, but it must preserve all of the following:

1. Production tmux operations remain in namespace `wsl-agent`; broker/provider clients must keep using `-N` so they can never auto-start or own the tmux server.
2. `wsl-agent-tmux.service` remains the lifetime authority. Broker/MCP restart must not stop/restart it or its tmux-created pane scopes.
3. Broker socket remains `$XDG_RUNTIME_DIR/wsl-agent-terminal.sock`; state remains under `$XDG_STATE_HOME/wsl-agent-terminal`; default cwd remains `/home/hamza`.
4. Transcript capture stays tmux-owned and independent of broker/provider lifetime. Cursor offsets stay monotonic across retention rotation, and stale cursors remain explicit `CURSOR_EXPIRED` errors with bounded recovery.
5. New session startup must keep the gate-before-command ordering so immediate first bytes cannot race ahead of `pipe-pane` setup.
6. Task 7 must not log model/human input. Human lease enforcement may build on the private lease protocol, but attach/reconcile policy belongs to Task 7.
7. Broker restart briefly removes/recreates the Unix socket. Task 7 clients must reconnect/retry cleanly; they must not fall back to starting tmux themselves.
8. Ubuntu tmux 3.4 may place panes in `tmux-spawn-*.scope` via its systemd integration. Treat those scopes as tmux-owned lifetime children, not broker-owned processes; explicit tmux lifetime shutdown must continue to end them.
