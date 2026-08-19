# Terminal Transcript Writer Finalization Plan

**Goal:** Stop retained-dead Terminal panes from retaining one `transcript-writer.mjs` process indefinitely, without changing the seven Terminal tools, retained-dead tmux semantics, transcript format, broker ownership, or tmux PTY lifetime.

## Decision

Keep the existing `pipe-pane -> transcript-writer.mjs` capture path. It is the proven exact-byte capture owner. Add a pane-local `pane-died` finalizer that briefly respawns the same retained pane, closes its existing `pipe-pane` while tmux legally allows that operation, removes the one-shot hook, and re-terminates the pane with the original exit status or signal.

The previously proposed shared tmux control-mode collector is rejected. Direct implementation evidence showed that finite panes emitting a final burst could reach `pane_dead=1` while the control client never received the complete tail; `pause-after` did not repair that loss. That violates the existing transcript contract, so the collector architecture must not ship.

## Preserved Contracts

- `terminal_open`, `terminal_read`, `terminal_send`, `terminal_resize`, `terminal_list`, `terminal_yield`, and `terminal_close` remain unchanged.
- tmux remains the PTY/process lifetime authority.
- `remain-on-exit` remains enabled.
- Retained-dead panes remain real tmux panes and keep their pane ID, exit status/signal behavior, screen/history, generation, and transcript files.
- `transcript-writer.mjs` remains the transcript byte writer and existing transcript/cursor storage is unchanged.
- Broker/provider restart remains independent from PTY lifetime.
- No session reaper, TTL, tombstone database, shared capture service, or new IPC protocol is added.

## Proven Constraints

- A dead retained pane cannot be closed with `pipe-pane`; tmux returns `target pane has exited`.
- `pane-died` may occur while bytes are still queued to the pipe consumer, so killing/signaling the writer at pane death can truncate output.
- Respawning the same dead pane preserves the pane ID.
- While temporarily live, `pipe-pane -t <pane>` with no command legally closes the existing pipe and gives the current writer real EOF.
- Re-terminating the temporary pane can reproduce the original numeric exit or original signal.
- The sequence works as one tmux command queue, avoiding a permanent second session representation.
- Existing historical dead+piped panes can use the same finalizer during broker reconciliation.

## Implementation

### `providers/terminal/tmux.mjs`

1. Add one pane-local indexed `pane-died` hook for every newly opened Terminal pane after `remain-on-exit` and transcript pipe setup, before releasing the existing command start gate.
2. Hook body runs a bounded background `run-shell` command whose tmux command queue:
   - preserves the original `pane_pid` in a pane-local option;
   - respawns the same pane with a silent shell blocked on one input line;
   - closes the existing `pipe-pane` while that pane is live;
   - removes this finalizer hook so the synthetic second death does not recurse;
   - sends Enter to the temporary shell;
   - exits with the original `pane_dead_status`, or self-signals with the original `pane_dead_signal`.
3. `sessionInfo()` uses the preserved original PID for a finalized dead pane so public observations do not change merely because of the temporary respawn.
4. `reconcileSession()` handles historical dead+piped panes with the same finalization sequence. Live legacy panes keep their current writer until they die; they are not restarted or dual-captured.
5. A dead pane already at `pane_pipe=0` is already finalized and reconciliation leaves it alone.

### `providers/terminal/transcript-writer.mjs`

No behavior change unless implementation evidence proves one is required. EOF remains the natural writer shutdown signal.

## Required Focused Evidence

Repository policy requires Terminal tests for this lifecycle change. Extend existing Terminal tests only; do not create another harness.

Prove:

- new finite session: `pane_dead=1`, exact exit status, same pane ID, `pane_pipe=0`;
- signal-terminated session preserves signal semantics;
- final transcript marker remains readable after writer drain;
- large final burst is not truncated by forcibly killing the writer;
- broker restart reconciles an already-dead historical `pane_pipe=1` session to `pane_pipe=0` without killing the session;
- second reconciliation is idempotent;
- live sessions retain the normal capture pipe until they die;
- model-facing Terminal schemas and human-control behavior remain unchanged through the existing suite.

## Documentation

Update current Terminal architecture/operations text only where it describes transcript writer lifetime: retained-dead panes stay, but their `pipe-pane` is finalized at pane death so the writer exits after EOF. No new service or user-facing command is introduced.

## Final Gate

After the candidate implementation:

```bash
(cd providers/terminal && npm test)
node scripts/check-doc-links.mjs
git diff --check
```

Run any broader repository gate only if the authoritative repository policy explicitly requires it for this Terminal lifecycle change.

## Non-goals

- No automatic deletion of retained-dead sessions.
- No `remain-on-exit` change.
- No shared control-mode collector.
- No transcript format/cursor redesign.
- No new systemd service.
- No unrelated Terminal cleanup or refactor.
- No live rollout until the implementation diff and required checks are complete.
