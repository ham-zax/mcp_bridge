# Personal WSL Harness

The `personal` profile is the private Codex-like development surface. It runs with the authority of the WSL user and is intentionally more powerful than the public profiles.

## Mental model

```text
Dev       read edit write wait apply_patch bash
Code      code_search code_context code_symbol
Terminal  terminal_open terminal_read terminal_send terminal_resize terminal_list terminal_yield terminal_close
```

Think in three domains, not 16 unrelated tools:

- **Dev** handles focused text/file work, bounded execution, and durable waits.
- **Code** provides rooted indexed repository intelligence without exposing raw CodeDB mechanics; first use may create or update heavyweight persistent index state.
- **Terminal** owns durable PTY/process lifetime and human/model terminal ownership.

## Private setup

`scripts/setup.sh` intentionally handles only the public `restricted` and `trusted-dev` profiles. The private profile is rendered directly.

Before rendering, make sure `config/profiles/personal.env` contains the intended absolute default cwd for this WSL user.

Install provider dependencies:

```bash
npm --prefix providers/pi-dev ci --omit=dev
npm --prefix providers/code-router ci --omit=dev
scripts/install-terminal-broker-user.sh
```

Render the private composition into external state:

```bash
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge"
node scripts/render-config.mjs \
  --profile personal \
  --env-file .env \
  --state-dir "$STATE" \
  --repo-root "$PWD"
```

Start the Terminal lifetime services if needed:

```bash
systemctl --user start wsl-agent-tmux.service wsl-agent-terminal-broker.service
```

Then start/reconcile the bridge:

```bash
bin/start
bin/status
```

Optional native CLI toolbox:

```bash
scripts/setup-personal-toolbox.sh
```

## Dev

### `read`

Use for focused text/source reads. Relative paths resolve from the personal default cwd; harmless absolute paths are accepted.

### `edit`

Use when the exact old text is already known, across one or more existing files. `edit` rejects missing, ambiguous, overlapping, stale, non-text, or duplicate-alias targets; all targets are planned before the first mutation, and partial post-mutation failures are reported explicitly. File count alone is not a reason to switch to `apply_patch`.


The canonical request is always grouped, including one-file edits:

```text
edit({
  targets: [
    { path: "src/a.ts", edits: [{ oldText: "old", newText: "new" }] }
  ]
})
```

For multiple exact-known files, add more target records to the same request rather than switching tools only because the file count increased.

### `apply_patch`

Use for contextual or structural changes: insertions, refactors, add/delete/move operations, ambiguous anchors, or coordinated hunks where exact old substrings are not already known. It supports one or many files, preflights all targets before mutation, and can report explicit partial application; it is not selected merely because multiple files are involved.

### `write`

Create-only. It refuses to overwrite an existing path.

### `bash`

Runs one bounded, noninteractive native Bash command string. Use it for Git, builds, tests, `rg`, repository inspection, and ordinary short execution; use Terminal when work must persist or needs a PTY/interactive workflow. For a large or unfamiliar repository with unknown CodeDB state, Bash/`rg` plus focused `read` is the lower-cost discovery path before invoking Code. There is no hidden mutable global cwd; use `cwd` explicitly when needed.

RTK is optional only when explicitly invoked, for example `rtk test` or `rtk err`; native Bash/output remains the source of truth.

### `wait`

`wait` creates durable named observations. First-phase condition kinds are:

```text
terminal_output
terminal_exit
process_exit
tcp_listen
file_exists
file_changed
http_ready
systemd_user
```

Typical flow:

```text
1. wait(name, condition, timeout_seconds, hold_seconds=0) -> pending
2. continue other work / let the source change
3. wait(name, hold_seconds=2) -> matched | pending | timeout | stable source error
```

Important semantics:

- timeout is an absolute durable deadline;
- `hold_seconds=0` allows one bounded arm/check and does not poll-hold the call;
- positive hold limits one invocation, not the underlying resource;
- if positive hold expires before the first durable baseline commits, `WAIT_HOLD_EXPIRED` is returned and no wait exists;
- after durable state exists, a hold expiry returns `pending` and preserves the same baseline/deadline;
- Terminal output waits observe only new transcript output after arming;
- the wait cursor is independent from normal `terminal_read` unread state;
- explicit Terminal destruction and same-name replacement remain explicit (`WAIT_SOURCE_ENDED`, `WAIT_SOURCE_REPLACED`).

## Code

### `code_search`

Ranked text/code search when the exact symbol is unknown. Prefer `code_symbol` when a symbol or definition name is already known or guessable.

### `code_symbol`

Use when you know or can guess a definition name.

### `code_context`

Compact first-touch context for a task: definitions, focused bodies, graph neighbors, files, and snippets. First-touch does not mean always call it first on an unknown large repository.

All three Code tools share the same rooted CodeDB child/index lifecycle. First use for a repository may start a persistent child and create or update substantial on-disk index state, which can consume significant disk and RAM. There is no hard repository-size preflight or threshold. For a large or unfamiliar repository with unknown CodeDB state, prefer Dev Bash/`rg` plus focused `read` for initial discovery unless CodeDB-backed repository intelligence is specifically desired.

The Code router resolves the nearest canonical Git root from `cwd`. Nested repositories win over outer repositories. Do not pass project-switching state; the rooted child owns repository identity.

## Terminal

### Durable session workflow

```text
terminal_open   create a model-owned named tmux-backed PTY
terminal_read   read unread output; use cursor/snapshot for recovery
terminal_send   send text or a control/navigation key while model-owned
terminal_resize resize the PTY while model-owned
terminal_list   inspect live/dead sessions and human-control state
terminal_yield  give a collaborative session back to its human client
terminal_close  explicitly destroy a session
```

A broker restart or 1MCP restart does not own the PTY lifetime; tmux does. Terminal sessions live in the harness-owned private tmux namespace (production default `wsl-agent`), not the user's default tmux server.

The human frontend contract is an interactive TTY. Kitty, Windows Terminal through WSL, WezTerm, an SSH terminal, and other tmux-compatible terminals are interchangeable; the Terminal subsystem does not install, detect, launch, or remotely control a specific emulator.

### Collaborative human-first terminals

Create a durable session from the interactive terminal you are already using:

```bash
bin/wsl-term new <session>
```

`new` creates the private tmux session under an immediate human lease and attaches the invoking TTY as the writable human client. ChatGPT may read the terminal immediately, but model send/resize/ordinary close return `HUMAN_HAS_CONTROL` until control is given away.

Hand the same attached PTY to the model:

```bash
bin/wsl-term give <session>
```

The human client stays attached but becomes tmux read-only + ignore-size. Human terminal resizing no longer changes the PTY; model send and `terminal_resize` become authoritative.

Take it back from another shell or terminal tab:

```bash
bin/wsl-term take <session>
```

For same-pane handoff, `Ctrl-b T` directly toggles the current tmux client between writable and read-only. A read-only watcher remains unable to type until this explicit takeover. The broker reconciles real tmux client flags before every model mutation: a unique writable client becomes the designated human owner; multiple writable human clients block model mutation and are never auto-resolved.

ChatGPT can voluntarily return a model-owned collaborative session with `terminal_yield`. It only gives control to the currently designated human client; it never lets the model seize control from a human.

### Observation, takeover, and recovery

Watch an existing exact PTY without taking model control:

```bash
bin/wsl-term watch <session>
```

A watcher starts as a tmux read-only, ignore-size client. It receives the live terminal display, cannot inject pane input, does not resize the PTY, and does not block model send/resize/ordinary close unless the human explicitly presses `Ctrl-b T` to take control.

Take writable control of an existing exact PTY or rejoin after the original human client disappeared:

```bash
bin/wsl-term attach <session>
```

Writable attach uses the same lease/client reconciliation as collaborative `new`; while attached, model mutation is blocked and model reads remain available. Human input, including sudo/password entry, flows directly from the terminal client to tmux/PTY and is not copied into a separate broker input log.

If no interactive TTY exists, `wsl-term new`, `watch`, and writable attach cannot provide a human frontend. Existing model-owned sessions created with `terminal_open` continue to work headlessly and can be joined later.

## Typical coding loop

```text
Code      locate a symbol or implementation
Dev       read focused source
Dev       edit or apply_patch
Dev       bash focused tests + git diff
Terminal  start a watch/dev server if work must persist
Dev wait  wait for readiness/output/exit without polling the full transcript
Terminal  inspect/interact incrementally
Code      re-check repository intelligence after watcher convergence
Dev       final tests and git status/diff
```

## Safety boundaries

- Same-canonical-path cooperating Dev mutations serialize their final compare+mutation section.
- Native Bash and arbitrary external writers do not participate in that in-process coordinator.
- Hard-link/inode alias synchronization is not claimed.
- A wait timing out or being cancelled never owns or kills the observed Terminal/process/resource.
