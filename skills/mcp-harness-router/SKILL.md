---
name: mcp-harness-router
description: Use when a request involves inspecting, changing, cleaning up, building, debugging, running, or waiting on something on the connected personal WSL/Linux machine, including repository/file/process work or interactive human terminal input such as sudo/password prompts.
---

# MCP Harness Router

Route by the information or mutation semantics, not by file count, connector-call count, or habit. Keep this skill limited to tool selection; do not prescribe Git, planning, testing, review, or implementation methodology.

When Superpowers Web Adapter also applies, let Superpowers control engineering workflow and use this skill only to choose the Dev, Code, Terminal, or wait primitive.

## Route the task

- Exact known replacement(s) in one or more existing text files -> `edit`.
- Contextual or structural mutation, insertion/refactor, add/delete/move, or ambiguous anchors -> `apply_patch`.
- New standalone text file -> `write`.
- Focused contents of a known file/range -> `read`.
- Literal search or ordinary repository inspection -> `bash`; prefer `rg`, then focused `read`. For broad/noisy matches, prefer `rg -l` before reading selected files. Use `fd` for simple filename lookup, `find` for complex filesystem predicates, `ast-grep` for syntax-shaped search, and `jq` for JSON.
- Known or guessable symbol definition -> `code_symbol` when CodeDB-backed intelligence is worth invoking.
- Semantic repository exploration -> `code_search` or `code_context`. On a large or unfamiliar repository with unknown CodeDB state, start with `bash` + `rg` + focused `read` instead of automatically starting CodeDB.
- Short bounded noninteractive command, build, test, Git, or inspection -> `bash`.
- Persistent or interactive PTY/process work -> Terminal.
- Human visibility or input in a durable PTY, including sudo/password/MFA or manual TUI interaction -> Terminal collaborative presentation/handoff. If the human should watch from the start, use `terminal_open(..., present:true)`. When human input is needed later, use `terminal_yield`: it reuses an attached designated frontend or launches the configured personal frontend on the exact tmux PTY, then gives the human control. If frontend launch fails with no attachment attempt still settling, give the installed `wsl-term attach <session>` fallback; never ask the user to send a secret through chat.
- Readiness, output, process exit, file/HTTP/systemd condition, or elapsed/absolute wakeup -> `wait`; use its native `timer` condition for time-based wakeups and do not implement polling/sleep loops in Bash.
- Explicitly confirmed Windows-host sleep, optionally with a timezone-qualified scheduled wake -> `pc_sleep`; use it only after a direct user request and do not substitute Bash or ad hoc PowerShell.

## Authority and observability

- For connected-WSL repository, Git, process, timestamp, or filesystem facts, `mcp-harness-local` is authoritative. ChatGPT container/Python, Files, and public web are different environments and are not diagnostic substitutes for the WSL machine.
- Diagnose with an explicit four-layer model: **presentation layer -> MCP proxy/harness transport -> WSL process/filesystem -> repository state**. Evidence at one layer does not silently determine the next layer. A generic proxy/status message does not override a successful concrete harness invocation; likewise, an MCP transport response does not by itself prove the underlying shell command exited successfully.
- Distinguish three model-visible states: **observable success**, **observable tool/provider error**, and **UNOBSERVABLE presentation**. A hidden, redacted, skipped, or otherwise opaque UI result is not evidence that the underlying command succeeded and is not evidence that it failed.
- When WSL observability becomes uncertain, perform at most one bounded `bash` health probe against the intended repository. Prefer a compact summary such as `pwd`, `git rev-parse --show-toplevel`, short `HEAD`, current branch, dirty-file count, and an explicit success marker. Do not invent image/file/base64/HTTP/alternate-filesystem visibility probes.
- Discover/load concrete MCP tool schemas through the installed tool catalog once per session/profile and reuse them. Never search the public web for internal MCP function names.
- Do not claim `verified`, `green`, `committed`, or equivalent repository state from inferred or hidden output. Obtain a small observable WSL result first.

## Terminal observation discipline

- Use `terminal_list` when session identity/ownership is initially unknown, at an explicit ownership handoff, or after an unexpected lifecycle event. Do not repeatedly relist stable sessions before every interaction.
- Normal `terminal_read(name)` omits `cursor` and consumes only unread transcript output from the broker-owned model cursor.
- `terminal_read(name, snapshot:true)` inspects the current tmux screen/TUI without advancing transcript state.
- An explicit Terminal `cursor` is a recovery/replay/resynchronization control only; do not use explicit cursors for ordinary progress checks.

## Durable wait and RPC boundary

- `wait` is a durable named **condition/timer wait**, not cron. Arm it with `name + condition`; later resume the same wait with `name` only. Use `cancel=true` only for explicit cancellation.
- Use `{kind:"timer", after_seconds:N}` for relative wakeups or `{kind:"timer", at:"<timezone-qualified instant>"}` for absolute wakeups. Do not fake elapsed time with an impossible file/process condition. Keep `timeout_seconds` strictly later than the timer target because the durable safety deadline wins ties.
- The durable deadline is independent of any one MCP/RPC call: `timeout_seconds` defaults to 300 seconds and supports 1..86400 seconds. Resuming the same name preserves the original absolute deadline and source baseline; it does not restart the timer.
- `hold_seconds` bounds only one `wait` invocation. The current Pi Dev policy is default 10 seconds, maximum 15 seconds. A `pending` return leaves the named wait durable; other reasoning/tool work can happen before resuming it. Hold expiry is not cancellation and does not change the durable deadline.
- The 15-second hold cap is local harness policy, not an MCP or 1MCP protocol limit. Separately, the ChatGPT connector/RPC path has shown an external request-duration ceiling around a minute, so do not rely on one long-lived MCP call for multi-minute work.
- For long-running commands/processes, keep the process durable in Terminal and use `wait` to observe readiness/output/exit across short RPCs. For long-lived missions that must survive repeated waits and user steering, use the `persistent-agent-loop` Skill when installed; keep this router focused on choosing primitives.

## Preserve the boundaries

- File count alone never decides `edit` versus `apply_patch`.
- After a mutation, use `read`/`bash` for immediate verification when CodeDB watcher convergence may lag.
- Never use Bash/raw tmux/`wsl-term` to bypass Terminal human ownership.
- Keep background-only Terminal work headless. Use `terminal_open(..., present:true)` only when the human should watch the exact PTY from the start; do not launch a GUI merely because a durable session exists.
- Reuse an already attached designated human frontend instead of opening duplicates. `terminal_yield` is the normal model-to-human handoff: reuse the designated frontend when present, otherwise launch the configured personal frontend on the exact tmux PTY before yielding.
- Prefer bounded evidence over dumping large search or process output into model context.
- A hard stop requires authoritative evidence such as a concrete MCP/provider failure that remains after one bounded recovery attempt, required WSL permission/access failure, human ownership blocking a required mutation, unrecoverable repository state, or a protected decision that needs the user. Awkward or opaque presentation alone is recoverable tooling uncertainty, not a hard stop.
- If a preferred primitive is not exposed in the active profile, choose among the tools that actually exist; never invent a missing tool.
