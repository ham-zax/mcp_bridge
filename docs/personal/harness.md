# Personal WSL Harness

The `personal` profile is the private Codex-like development surface. It runs with the authority of the WSL user and is intentionally more powerful than the public profiles.

## Mental model

```text
Dev       read edit write wait apply_patch bash
Code      code_search code_context code_symbol
Terminal  terminal_open terminal_read terminal_send terminal_resize terminal_list terminal_close
```

Think in three domains, not 15 unrelated tools:

- **Dev** changes and executes local state.
- **Code** finds repository intelligence without exposing raw CodeDB mechanics.
- **Terminal** owns durable interactive processes.

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

Use when one file needs exact guarded replacement. It rejects missing or ambiguous matches and returns a native diff.

### `apply_patch`

Use for multi-file changes, structural updates, add/delete/move operations, or multiple coordinated hunks. It preflights all targets before mutation but does not claim a kernel-level filesystem transaction; a later runtime conflict can report explicit partial application.

### `write`

Create-only. It refuses to overwrite an existing path.

### `bash`

Runs one native Bash command string. There is no hidden mutable global cwd. Use `cwd` explicitly when needed.

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

Ranked text/code search when the exact symbol is unknown.

### `code_symbol`

Use when you know or can guess a definition name.

### `code_context`

Compact first-touch context for a task: definitions, focused bodies, graph neighbors, files, and snippets.

The Code router resolves the nearest canonical Git root from `cwd`. Nested repositories win over outer repositories. Do not pass project-switching state; the rooted child owns repository identity.

## Terminal

### Durable session workflow

```text
terminal_open   create a named tmux-backed PTY
terminal_read   read unread output; use cursor/snapshot for recovery
terminal_send   send text or a control/navigation key
terminal_resize resize the PTY
terminal_list   inspect live/dead sessions and human-control state
terminal_close  explicitly destroy a session
```

A broker restart or 1MCP restart does not own the PTY lifetime; tmux does. Terminal sessions live in the harness-owned private tmux namespace (production default `wsl-agent`), not the user's default tmux server.

### Human observation and takeover

Watch the exact PTY without taking model control:

```bash
bin/wsl-term watch <session>
```

A watcher is a tmux read-only, ignore-size client. It receives the live terminal display, cannot inject input, does not resize the PTY, and does not block model send/resize/ordinary close. This is the normal Kitty workflow when the operator wants to observe the same terminal the model controls.

Take writable control of the exact PTY:

```bash
bin/wsl-term attach <session>
```

While attached:

- model send/resize/ordinary close are blocked with `HUMAN_HAS_CONTROL`;
- model reads remain allowed;
- human input is not copied into broker logs as a separate input log;
- detach returns model control.

Use writable takeover for interactive sudo/password entry when explicitly needed. Kitty is only the terminal emulator; both commands target the harness-owned private tmux namespace.

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
