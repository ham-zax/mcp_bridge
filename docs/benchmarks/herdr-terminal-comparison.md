# Herdr v0.8.0 vs Durable tmux Terminal Core

**Experiment:** Personal WSL Codex Harness Phase 2 — Terminal backend challenger gate

**Reference baseline:** `3ff8c6eb03a4dccdd393a324e5d4e6edf891cdc6` (`feat: add durable tmux terminal broker`)

**Experiment branch:** `feat/personal-harness-herdr-evaluation`

**Scope:** experiment only; no production Terminal/config/systemd/live-bridge changes

## Decision

```text
VERDICT: TMUX_BROKER_WINS
TASK_8_QUESTION: Does Herdr make our planned Task 8 await/resume implementation unnecessary?
TASK_8_ANSWER: PARTIALLY
```

Herdr v0.8.0 is materially better than the current core in several areas: lower memory footprint, a faster send/wait request path, exact PTY human attachment, multiple read-only terminal observers, and recognized coding-agent lifecycle detection with server-owned `agent.wait` semantics.

Those advantages do **not** justify replacing tmux as the Terminal lifetime authority, and the tested hybrid does not close the gap. The blocking reasons are:

1. ordinary Herdr server stop/restart kills arbitrary pane processes; tmux remains structurally independent from the broker and preserves the exact PTY process PID;
2. Herdr crash also kills arbitrary pane processes; saved session state reconstructs shape with a new shell rather than preserving the process;
3. Herdr's public `pane.read` is snapshot-based, has no logical byte cursor/offset, clamps reads to 1,000 lines, and duplicates previous output;
4. Herdr's incremental terminal-session stream is rendered ANSI screen-delta data, not a clean process transcript;
5. the hybrid cursor prototype makes Herdr screen frames monotonic but turns one trivial marker update into 35,962 bytes of ANSI state, including 3,871 ESC bytes;
6. immediate-output capture is not reliable even when a terminal observer is connected before launch;
7. direct-controller exclusivity does not block normal `pane.run` / `pane.send_text` / `pane.send_keys`, so Herdr does not natively satisfy the harness's human-single-writer contract for model operations;
8. public terminal close does not expose the ordinary pane process exit status even though Herdr logs it internally;
9. `pane.wait_for_output` is a server-side 100 ms polling loop, not an event-driven output source;
10. Herdr has no equivalent generic wait for an ordinary foreground process/port/file/HTTP/systemd condition.

Herdr therefore changes the **Task 8 design evidence**, especially for coding-agent lifecycle waiting, but does not make Task 8 unnecessary and does not earn ownership of Terminal PTY lifetime.

## Fixed versions and isolation

### Current Terminal core

```text
base commit  3ff8c6eb03a4dccdd393a324e5d4e6edf891cdc6
tmux         3.4
Node         v24.19.0
namespace    wsl-agent in production; disposable -S sockets in benchmark
```

Baseline verification before the challenger experiment:

```text
(cd providers/terminal && npm test)  -> 17 pass, 0 fail
node --check providers/terminal/*.mjs -> pass
git diff --check                     -> pass
```

### Herdr

The machine's normal `herdr` install is 0.7.5 and was not modified. The experiment downloaded the release binary to `/tmp/herdr-v0.8.0` and pinned it by version and checksum:

```text
version   herdr 0.8.0
tag commit 346411fa21afd297f5ed3b3fa56f9e3fbf7654b7
sha256    b872ea7e40fa2cb17e857ac9b62b1bf26db7b403c622f5d2f3f5b35f6e9acd28
protocol  19
```

All repeatable Herdr runners use a disposable named session and this configuration:

```toml
onboarding = false

[update]
version_check = false
manifest_check = false
```

The final detector/control run proved:

```text
remote manifest files  0
config parse errors    0
update checks          0
```

This matters because an earlier exploratory config contained an invalid UI field and caused Herdr to fall back to defaults. Agent-detector evidence from that exploratory run was discarded and rerun with the clean v0.8.0 pin above. PTY/restart behavior was independent of that detector configuration.

## Architectures compared

```text
A — CURRENT
Terminal MCP (planned Task 7)
  -> current broker
  -> tmux lifetime authority

B — HERDR
Terminal MCP-like thin adapter
  -> Herdr CLI/socket
  -> Herdr PTY runtime

C — HYBRID
our model-facing lease/cursor policy
  -> Herdr terminal/control/wait runtime
```

The experiment did not build a production MCP adapter for B or C. It exercised Herdr's real socket/CLI/control surfaces and built only the minimum hybrid cursor prototype needed to determine whether the existing transcript policy composes cleanly with Herdr's terminal stream.

## Resource and latency measurements

Three fresh complete runs were taken per backend. Medians:

| Metric | A — current tmux/broker | B — Herdr v0.8.0 | Notes |
|---|---:|---:|---|
| Open interactive shell | 43.0 ms | 53.2 ms | current faster in the isolated median |
| Send command + observe completion | 36.5 ms | 24.3 ms | Herdr path used pre-armed `pane.wait-output`; current used broker send + cursor read |
| Idle process count, one shell | 5 | 2 | current includes tmux, broker, shell, transcript pipe shell, transcript writer |
| Idle RSS | 127,964 KiB | 27,428 KiB | RSS double-counts shared pages; PSS is more meaningful |
| Idle PSS | 46,678 KiB | 24,414 KiB | Herdr uses roughly half the proportional memory |
| Idle CPU over 1 s | ~0.02 CPU-s | ~0.02 CPU-s | effectively tied in this sample |

Individual 3-run samples:

```text
CURRENT open ms: 41.83, 42.99, 44.56
CURRENT send ms: 36.51, 36.68, 34.75
CURRENT PSS KiB: 46617, 46678, 46711

HERDR open ms:   38.24, 61.86, 53.23
HERDR send ms:   24.26, 23.99, 24.32
HERDR PSS KiB:   24389, 24424, 24414
```

Representative current process PSS from one run:

```text
tmux server                 2,136 KiB
Node broker                19,352 KiB
Bash pane                   8,394 KiB
pipe-pane shell               166 KiB
Node transcript writer     16,630 KiB
```

Representative isolated Herdr process PSS:

```text
Herdr server               15,756 KiB
Bash pane                   8,668 KiB
```

An earlier three-run Herdr PSS set around 14.7 MiB was discarded because three exploratory v0.8.0 servers were still resident and shared executable/library pages, artificially reducing per-process PSS. The values above were rerun after all exploratory Herdr servers were stopped, with each benchmark run verified to leave no v0.8.0 server behind.

Herdr is still substantially lighter. Candidate C was not run as a resident service, so an end-to-end hybrid RAM number would be invented. Its measured lower bound is the Herdr runtime plus a custom adapter; the cursor-only prototype is not representative of a production adapter.

## Workload matrix

| # | Workload | A — current tmux/broker | B — Herdr v0.8.0 | C — hybrid implication |
|---:|---|---|---|---|
| 1 | Open interactive shell | PASS | PASS | PASS |
| 2 | Long-running server/watch | PASS; tmux owns process | PASS while Herdr server lives | inherits Herdr server lifetime |
| 3 | Read new output repeatedly | PASS; logical byte cursor returns only new bytes | `pane.read` snapshots duplicate prior output; observer is incremental ANSI | cursor works over ANSI frames but representation is too noisy |
| 4 | Send normal text | PASS | PASS | PASS with adapter |
| 5 | Ctrl-C / Ctrl-D / navigation | PASS; prompt-ready Ctrl-D exits status 0, Up repeats | PASS; prompt-ready Ctrl-D exits, Ctrl-C interrupts, Up repeats | PASS but lease gate still required |
| 6 | Resize | PASS; 101x33 and `stty size` -> `33 101` | PASS through terminal-control resize; frames 80x24 -> 101x33 and `stty` observed 33x101 | PASS, but resize must obey adapter human lease |
| 7 | Non-zero exit | PASS; pane dead status exposes 7 | terminal closes, but public response omits status 7; internal log records it | adapter would need another status source/workaround |
| 8 | Large/noisy output | PASS; 265,020 bytes recoverable from cursor 0 | internal scrollback exists, but public `pane.read` clamps to 1,000 lines and has no cursor/offset | does not inherit current recoverability without new transcript layer |
| 9 | Immediate-output process | PASS in final 12/12 race gate | FAIL/reliability blocker; final pre-armed observer stress 0/12, separate stress 1/12 | observer choreography does not reliably close race |
| 10 | TUI / alternate screen | PASS via tmux screen capture | PASS; strong terminal state + ANSI frame stream | visually strong, model-text normalization expensive |
| 11 | Human attaches to exact PTY | PASS via exact tmux session attach | PASS via `terminal attach <terminal_id>` | PASS |
| 12 | Read-only model observer while human owns input | PASS at core: broker transcript read worked while tmux client attached | PASS for observers, but ordinary pane APIs can still inject model input | requires our own lease enforcement on every model write/resize path |
| 13 | Human detach / control returns | PASS; tmux session remains | PASS; release then new controller writes successfully | PASS with adapter |
| 14 | Backend client/provider disconnect | stronger: broker restart preserves PTY | observer disconnect/reconnect preserved exact foreground PID | PASS while Herdr server remains alive |
| 15 | Backend server restart | PASS for live session: broker PID changes, tmux/pane PIDs unchanged | FAIL ordinary stop/start: arbitrary process PIDs die; pane shape reconstructed | inherits Herdr unless every replacement uses special handoff; crash still loses process |
| 16 | Wait for output regex | no Task-8 wait yet | PASS functionally; observed ~306 ms with 220 ms deliberate output delay; implementation polls every 100 ms | useful convenience, not event-driven output |
| 17 | Wait ordinary process condition | no Task-8 wait yet | no native generic foreground-process wait; experiment required 9 polls / ~450 ms | no material improvement |
| 18 | Wait coding-agent idle/blocked/done | no Task-8 implementation yet | strong: real Codex idle/working detected; pinned bundled detector + lifecycle reports qualify blocked/done; waits woke ~82 ms | material Herdr advantage, but not enough to move PTY lifetime |

## Durability boundary

### A — current broker restart

Fresh final evidence with a long-lived session:

```text
broker PID before  2679497
broker PID after   2680814    CHANGED

tmux PID before    2679494
tmux PID after     2679494    UNCHANGED

PTY PID before     2680661
PTY PID after      2680661    UNCHANGED

transcript continued  true
session reconciled    true
```

This is the key architecture property: restarting the broker does not replace or own the PTY runtime.

### Current defect discovered by this benchmark

The challenger benchmark found a Task-6 recovery defect not covered by the original live-session durability gate:

```text
live session + dead remain-on-exit session
  -> restart broker
  -> broker startup fails: target pane has exited
```

The cause is the current recovery path re-running transcript `pipe-pane` installation on every reconciled tmux session, including dead panes.

This does **not** invalidate the lifetime boundary above: tmux and live PTYs still survive. It does mean Task 7 must not start on the assumption that broker reconciliation is complete for mixed live/dead session sets.

Required follow-up before Task 7 acceptance:

```text
add regression: one live session + one dead remain-on-exit session
restart broker
broker must start
live session must keep exact tmux/PTY PIDs
live transcript must continue
dead session must remain discoverable with exit status
recovery must not call an invalid pipe-pane operation on the dead pane
```

A repeated immediate-output test also produced one exploratory post-capture delay waiting for pane-dead status; the marker had already been captured. The final 12-trial race gate had zero such auxiliary failures. This is worth watching but is not classified here as a confirmed second product defect.

### B — ordinary Herdr stop/restart

Fresh final evidence:

```text
server before      2680878
server after       2681865

shell before       2680905
shell after        2681884    CHANGED

foreground before  2681827
foreground after   2681884    CHANGED / original process gone

terminal ID before term_65918c784b34b1
terminal ID after  term_65918c7b7fd3c1

server survived stop      false
shell survived stop       false
foreground survived stop  false
pane identity restored    true
```

Herdr reconstructed the pane as a new shell. It did not preserve the arbitrary foreground process.

### B — Herdr crash

Two SIGKILL qualifiers were run.

Before Herdr had persisted the new session shape:

```text
server 2657229
shell  2657260
fg     2657418

SIGKILL server
shell alive  no
fg alive     no
restart pane restored  false
```

After waiting for Herdr's session save:

```text
server 2657759
shell  2657790
fg     2657948
saved session records observed  1

SIGKILL server
shell alive  no
fg alive     no

restart server  2658291
pane restored   true
new shell       2658313
```

Persistence can restore layout/state after a crash, but it does not preserve arbitrary process lifetime.

### B — experimental Herdr live handoff

Herdr has an important exception: Unix live handoff transfers live PTY descriptors to a replacement server. Repeatable experiment evidence:

```text
old server PID       2687654
new server PID       2687872
old server alive     false

shell before         2687685
shell after          2687685    PRESERVED

foreground before    2687846
foreground after     2687846    PRESERVED

terminal ID before   term_65918c8829ebc1
terminal ID after    term_65918c888166e1   CHANGED

output continued     true
```

Live handoff is valuable for intentional compatible replacement. It is not equivalent to tmux's independent lifetime authority:

- it is an explicit experimental handoff flow rather than normal `server stop`/start;
- it does not protect against server crash;
- the terminal identifier changes and clients must reconcile it;
- a normal systemd restart would still use the destructive stop/start path unless deployment lifecycle were redesigned around handoff.

The benchmark therefore treats handoff as an upgrade mechanism, not as a substitute for the frozen durability contract.

## Human single-writer semantics

Herdr's direct-control surface is useful but narrower than the harness contract.

With one `terminal session control` client active:

```text
second direct controller -> denied:
"terminal ... already has an attached client; retry with --takeover"

read-only observer       -> allowed
pane.read                -> allowed
human marker in observer -> yes
human marker in pane.read -> yes
```

However, while that human controller still owned the terminal, the normal API path was able to execute:

```text
pane run <pane> "... HERDR_MODEL_BYPASS_MARKER ..."
```

and the output appeared successfully.

Therefore Herdr's "one writable controller" is a direct-terminal-client invariant, not a global authorization rule covering the socket's pane mutation APIs. A model-facing Herdr adapter must still implement the same authoritative human lease policy planned for Task 7:

```text
while human lease exists:
  read/list     allowed
  send          HUMAN_HAS_CONTROL
  resize        HUMAN_HAS_CONTROL
  close(false)  HUMAN_HAS_CONTROL
  close(force)  explicit override only
```

The current Task-6 broker is also not finished here: it can acquire/release the lease foundation but `session.send` is still allowed while the lease exists. That is explicitly Task-7 scope. The difference is that current tmux already cleanly separates observation: the broker transcript continued to be readable while a real human tmux client was attached to the exact PTY.

## Output, cursors, and immediate-output race

### Current transcript

The current core has a bridge-owned append transcript with monotonic logical byte offsets, a 16 MiB default budget, explicit `CURSOR_EXPIRED`, UTF-8-safe reads, and a startup gate that installs `pipe-pane` before the requested process may run.

Large-output evidence:

```text
bytes generated/read   265020
first noisy line       present
line 5000              present
done marker            present
base cursor            0
end cursor             265020
```

Immediate-output final stress gate:

```text
trials  12
hits    12
misses  0
```

### Herdr snapshot read

Repeated `pane.read --source recent-unwrapped` calls return overlapping snapshots. In one deterministic sequence, the number of duplicated marker lines grew on every read:

```text
read 1 occurrences 2
read 2 occurrences 3  contains previous tail
read 3 occurrences 4  contains previous tail
read 4 occurrences 5  contains previous tail
read 5 occurrences 6  contains previous tail
```

Herdr v0.8.0 source clamps the requested line count:

```text
src/app/api_helpers.rs
line_limit = lines.map(|lines| lines.min(1000) as usize)
```

while the default internal scrollback budget is 10,000,000 bytes (`AdvancedConfig.scrollback_limit_bytes`). Because `pane.read` has no cursor/offset pagination, older rows outside the newest 1,000 are not recoverable through that API.

After 5,000 generated noisy lines:

```text
80-line bounded read:
  bytes              3942
  first returned     HERDR_NOISY_4923_...
  first generated    absent
  last generated     present

requested 6000 lines:
  returned bytes     49942
  first generated    absent
  last generated     present
  done marker        present
```

### Herdr terminal frame stream

`terminal session observe` is genuinely incremental in transport terms, but the payload is terminal rendering state rather than a clean transcript.

For one shell plus one trivial marker in the final verification run:

```text
frames             2
full frames        1
delta frames       1
ANSI bytes         35962
ESC bytes          3871
CSI-like sequences 3867
rough text after naive ANSI stripping  ~70 bytes
```

The first 80x24 full frame was 35,739 bytes; the marker delta was 223 bytes.

### Hybrid cursor prototype

`experiments/herdr/hybrid-frame-cursor.mjs` feeds Herdr frame bytes through the current transcript cursor implementation.

It proved:

```text
logical cursor monotonic   yes
source bytes               35962
end cursor                 35962
```

but the model-facing bytes remain 35,962 bytes of rendered ANSI state. Naive stripping destroys the terminal semantics that make those frames useful. A correct frame-to-model-text projection would require a terminal renderer/state model and resynchronization rules, not just reuse of the current transcript cursor.

### Herdr immediate-output reliability

A post-run `pane.read` cannot recover a pane that prints and exits before the read; the pane is gone.

Pre-arming `pane.wait-output` does not close the race either. The short-lived test returned:

```text
pane_not_found
```

because the output wait polls pane snapshots every 100 ms and the pane can disappear between polls.

Pre-arming `terminal session observe` makes capture *possible* but not reliable. Two independent 12-trial observer stresses produced:

```text
run 1: 1 hit / 12
run 2: 0 hits / 12
```

The repeatable final comparison gate was:

```text
CURRENT startup-gated transcript  12/12
HERDR pre-armed observer           0/12
```

A separate single control run happened to capture the marker, which is consistent with the stress result: the path is racy rather than impossible.

This is a blocker for Herdr or the tested hybrid as the Terminal backend unless a stronger Herdr raw-output/start barrier is added upstream.

## TUI correctness

Both backends handle alternate-screen terminal state.

Current:

```text
tmux capture-pane found top marker     true
tmux capture-pane found middle marker  true
```

Herdr:

```text
recent-unwrapped top marker     true
recent-unwrapped middle marker  true
terminal observer renders state true
Ctrl-C returns to shell         true
```

Herdr's terminal renderer is a real strength for exact TUI attachment/observation. The cost is that its incremental observer format is optimized for terminal rendering, not compact model-visible text.

## Wait and recognized-agent behavior

### Output regex wait

Herdr's `pane.wait_for_output` is useful as a blocking API, but v0.8.0 source uses the shared 100 ms connection polling interval:

```text
src/api/server.rs: CONNECTION_POLL_INTERVAL = 100 ms
src/api/wait.rs: wait_for_output sleeps CONNECTION_POLL_INTERVAL between probes
```

Observed test:

```text
deliberate delay before marker  ~220 ms
total wait completion           ~306 ms
matched line                    HERDR_REGEX_READY_42
```

So this removes client polling ceremony but does not create an event-driven raw-output source.

### Ordinary process condition

A foreground `sleep 0.45` inside a shell had no Herdr generic process-completion wait. The experiment polled `pane process-info`:

```text
polls       9
elapsed     ~450 ms
final fg    bash
```

No Herdr primitive was found for the wider Task-8 condition classes such as:

```text
ordinary foreground process completion
port readiness
file appearance/change
HTTP readiness
systemd/service state
```

### Recognized coding agents

This is Herdr's strongest wait advantage.

A real Codex 0.147.0 TUI in a disposable Git repository was detected by Herdr in about 3.05 s and classified `idle`. A pre-armed `agent wait --until working` then observed a real prompt transition to `working`; completion returned to `idle`.

The account subsequently reached its Codex usage limit before a harmless real approval-block transition could be completed. No auth/session state was changed to work around that limit.

The blocked/done behavior was then qualified without network/account dependence using the clean bundled v0.8.0 detector and Herdr's official lifecycle reporting path:

```text
Codex bundled manifest source   bundled
manifest version                2026.07.18.1
approval fixture state          blocked
matched rule                    live_strong_blocker

reported working -> agent wait  working, wake ~82 ms
reported blocked -> agent wait  blocked, wake ~82 ms
working -> unseen idle          done, wake ~82 ms
```

Herdr's source uses its event hub for agent state changes, so `agent.wait` has materially stronger semantics than repeated model-side screen polling, even though the connection loop still has roughly 100 ms wake granularity.

## Candidate C — hybrid result

The tested hybrid idea was:

```text
our lease/model-cursor policy
  -> Herdr for PTY, human attach, wait, lifecycle
```

It does not win.

What it gains:

```text
Herdr lower base RAM
Herdr exact PTY attach
Herdr observer/control protocol
Herdr TUI renderer
Herdr recognized-agent lifecycle detection and agent.wait
```

What it still must implement itself:

```text
global human lease gate across every model send/resize/close API
model-side incremental text semantics
recovery cursor / rotation semantics
immediate-output start barrier or upstream fix
ordinary process exit-status recovery
generic Task-8 condition waits
server-restart reconciliation
terminal-ID changes after live handoff
```

And it inherits the largest Herdr backend problem:

```text
ordinary Herdr server restart/crash owns and kills the PTY process
```

Using Herdr's ANSI frame stream as the new transcript makes model context drastically worse; using `pane.read` reintroduces duplicate snapshot reads and the 1,000-line no-offset ceiling. Building a correct terminal-state-to-clean-incremental-text projector would add a second complex terminal abstraction next to Herdr itself.

Therefore Candidate C has more integration risk than A without preserving A's strongest property.

## Custom code and operational complexity

Current production Terminal core, excluding tests, is:

```text
providers/terminal/{broker,tmux,transcript,transcript-writer,pane-entry,protocol}.mjs
1091 lines
```

That code already exists and its main lifetime/transcript contracts are tested. Task 7 still needs MCP/client/CLI and lease enforcement.

Herdr would remove much of the custom PTY/tmux/transcript machinery, which is attractive. But the tested "thin adapter" is not actually thin enough for the frozen harness contracts. It still needs durable policy code for leases, model output, missing exit status, immediate-output behavior, restart/handoff reconciliation, and generic waits. No honest LOC number is assigned because that adapter was not implemented; estimating one would favor a design by assumption.

Operationally:

### Current

```text
systemd user tmux lifetime unit
systemd user Node broker unit
tmux 3.4
Node runtime
bridge-owned transcript state
```

The lifetime authority is obvious and structurally separate.

### Herdr

```text
Herdr binary/server lifecycle
Herdr named-session state
Herdr PTY runtime
custom MCP adapter/lease policy
optional detection-manifest policy
special live-handoff path if process-preserving intentional replacement is required
reconciliation for changing terminal IDs
```

Herdr is simpler as a standalone human terminal product, but integrating it while preserving this harness's stronger durability/output contracts is not operationally simpler.

## Task 8 answer

```text
Does Herdr make planned Task 8 await/resume unnecessary?
PARTIALLY
```

Interpretation:

- **YES for evidence that recognized coding-agent state deserves a server-owned wait.** Herdr demonstrates a useful `idle/working/blocked/done` lifecycle abstraction and avoids repeated model-side TUI polling for recognized agents.
- **NO for Terminal output generally.** `pane.wait_for_output` is a 100 ms server-side polling loop and can miss short-lived output/pane lifetime.
- **NO for generic local conditions.** Ordinary process completion, port/file/HTTP/service readiness are still uncovered.
- **NO for resume/notification semantics.** Herdr does not by itself answer the harness-specific reconnect/cancellation/completion-evidence design required by Task 8.

Recommended Task-8 consequence after Task 7 is live:

1. keep the existing evidence-first Task-8 gate;
2. explicitly include recognized coding-agent lifecycle as a measured condition class;
3. compare a small event-driven detector/wait capability against ordinary Terminal reads;
4. do not adopt Herdr as the PTY backend merely to obtain `agent.wait`;
5. do not predeclare a generic `terminal_wait` signature before real product-path polling debt is measured.

## Task 7 contracts to preserve

The Task-7 implementation should continue on the current tmux core after the mixed-dead recovery defect is fixed.

Preserve:

```text
tmux namespace        wsl-agent
broker socket         $XDG_RUNTIME_DIR/wsl-agent-terminal.sock
state root            $XDG_STATE_HOME/wsl-agent-terminal
default cwd           /home/hamza
lifetime unit         wsl-agent-tmux.service
broker unit           wsl-agent-terminal-broker.service
broker tmux clients   -N (must never auto-start tmux)
tmux owns PTY/process lifetime
```

Task-7 human policy must enforce globally:

```text
human lease exists:
  terminal_read          allowed
  terminal_list          allowed
  terminal_send          HUMAN_HAS_CONTROL
  terminal_resize        HUMAN_HAS_CONTROL
  terminal_close(false)  HUMAN_HAS_CONTROL
  terminal_close(force)  explicit override only
```

Use the existing tmux transcript for model observation during human attach; the benchmark proved broker reads remain available while a human tmux client is attached.

Do not replace the startup gate or logical transcript cursor with Herdr snapshot/frame semantics.

## Experiment artifacts and reproduction

All code added by this branch is experiment-only:

```text
experiments/herdr/current-benchmark.mjs
experiments/herdr/herdr-benchmark.mjs
experiments/herdr/herdr-control-wait.sh
experiments/herdr/immediate-race.sh
experiments/herdr/herdr-live-handoff.sh
experiments/herdr/frame-probe.mjs
experiments/herdr/hybrid-frame-cursor.mjs
experiments/herdr/measure-tree.mjs
docs/benchmarks/herdr-terminal-comparison.md
```

Representative commands:

```bash
HERDR_BIN=/tmp/herdr-v0.8.0 node experiments/herdr/herdr-benchmark.mjs
node experiments/herdr/current-benchmark.mjs
HERDR_BIN=/tmp/herdr-v0.8.0 bash experiments/herdr/herdr-control-wait.sh
HERDR_BIN=/tmp/herdr-v0.8.0 TRIALS=12 bash experiments/herdr/immediate-race.sh
HERDR_BIN=/tmp/herdr-v0.8.0 bash experiments/herdr/herdr-live-handoff.sh
node experiments/herdr/hybrid-frame-cursor.mjs < <captured-terminal-session-ndjson>
```

No experiment command changed or restarted the live bridge, 1MCP, Cloudflare, OAuth/session state, production `wsl-agent-*` units, personal MCP composition, or production Terminal source files.
