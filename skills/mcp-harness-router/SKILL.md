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
- Human visibility or input in a durable PTY, including sudo/password/MFA or manual TUI interaction -> Terminal collaborative presentation/handoff. If the human should watch from the start, use `terminal_open(..., present:true)`. When human input is needed later, use `terminal_yield`: it reuses an attached designated frontend or launches Kitty on the exact tmux PTY, then gives the human control. If frontend launch fails, give the installed `wsl-term attach <session>` fallback; never ask the user to send a secret through chat.
- Readiness, output, process exit, file/HTTP/systemd condition, or elapsed/absolute wakeup -> `wait`; use its native `timer` condition for time-based wakeups and do not implement polling/sleep loops in Bash.

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
- Reuse an already attached designated human frontend instead of opening duplicates. `terminal_yield` is the normal model-to-human handoff: reuse the designated frontend when present, otherwise launch Kitty and attach it to the exact tmux PTY before yielding.
- Prefer bounded evidence over dumping large search or process output into model context.
- If a preferred primitive is not exposed in the active profile, choose among the tools that actually exist; never invent a missing tool.
