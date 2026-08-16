# Terminal Frontend Handoff Design

**Date:** 2026-08-17

## Goal

Make the personal Terminal surface support seamless human/model collaboration on the same durable tmux PTY: keep Terminal sessions headless by default, optionally present them in Kitty, and make `terminal_yield` reuse or launch a human frontend when human input is required.

## Approved product shape

Use the hybrid presentation model:

```text
headless Terminal session by default
        |
        | optional presentation / human-input need
        v
Kitty attached to the exact tmux PTY
        |
        +-- read-only while model owns input
        |
        `-- writable while human owns input
```

The production lifetime authority remains the existing private `wsl-agent` tmux server. The broker remains the ownership/state authority. Kitty is only the human viewport. Herdr remains an optional separate terminal/workspace product and is not inserted into the production Terminal lifetime path.

## Required behavior

### Terminal open

`terminal_open` remains headless by default.

Add an optional `present: true` hint. When set, the harness opens the durable PTY normally and then ensures a designated read-only human frontend is attached. The model keeps mutation authority while the human can watch the exact PTY.

Do not launch a GUI for ordinary background servers, test runs, or durable processes unless presentation is explicitly requested or later required for human input.

### Terminal yield

`terminal_yield(name)` becomes frontend-aware:

1. If a designated human client is already writable, report human control without launching another frontend.
2. If a designated human client is attached read-only, switch that exact client to writable human control.
3. If no designated human client exists, launch Kitty attached to the exact tmux session in collaborative read-only mode, wait for that client to be established, then switch it writable.
4. If Kitty cannot be launched, preserve the Terminal session and return an actionable error containing the exact manual `bin/wsl-term attach <session>` fallback. Do not claim a GUI was opened.

A later `Ctrl-b T` or `bin/wsl-term give <session>` returns the same attached client to read-only mode and restores model mutation authority. A subsequent `terminal_yield` must reuse that same client rather than opening another Kitty window.

### Operator CLI

Add:

```text
bin/wsl-term present <session>
```

`present` differs from the existing commands:

- `watch`: anonymous read-only observer; never a handoff target.
- `present`: designated collaborative read-only frontend; model keeps control, and `terminal_yield` may later make this exact client writable.
- `attach`: designated writable human frontend immediately.
- `new`: create a new session under immediate human control.

`present` must attach to the exact production tmux PTY and use the existing broker lease/bind/reconciliation machinery. Do not add a parallel ownership system.

While a designated frontend is read-only and the model owns the PTY, presentation must not change the PTY dimensions merely because Kitty attached. Before the read-only attach, freeze the tmux window in manual-size mode so the existing model-controlled dimensions remain authoritative. When the human later becomes writable, the same attached client may resize the PTY through the existing collaborative resize path; returning control to the model must leave the frontend attached without letting passive viewport size changes resize the PTY.

## Architecture

```text
ChatGPT
  |
  v
Terminal MCP
  |  terminal_open / terminal_yield
  |
  +------------------------------+
  |                              |
  v                              v
Broker                       frontend launcher
  |                              |
  v                              v
private tmux <---------------- Kitty
  |                              |
  |                       bin/wsl-term present
  |                              |
  +---------- exact PTY ---------+
```

The frontend launcher belongs at the Terminal MCP/CLI edge, not inside tmux lifetime ownership. The broker may expose enough internal session-list state to distinguish a designated attached client from writable human control, but no new broker operation is required unless implementation evidence proves otherwise.

## Frontend discovery and WSLg

Kitty is currently installed at `$HOME/.local/kitty.app/bin/kitty` but is not on the provider PATH. Frontend discovery should therefore be deterministic and overrideable:

1. explicit `MCP_TERMINAL_KITTY_BIN` when set;
2. executable `$HOME/.local/kitty.app/bin/kitty`;
3. `kitty` from PATH as a final discovery candidate.

The current MCP/provider environment does not expose `DISPLAY` or `WAYLAND_DISPLAY`, while WSLg Wayland, X11, and Pulse sockets exist. When GUI variables are absent, construct only the Kitty child environment from those observed endpoints: use `XDG_RUNTIME_DIR=/mnt/wslg/runtime-dir` plus `WAYLAND_DISPLAY=wayland-0` when `/mnt/wslg/runtime-dir/wayland-0` is a socket; use `DISPLAY=:0` when the WSLg X11 socket exists; and use `PULSE_SERVER=unix:/mnt/wslg/PulseServer` when that socket exists. Do not change the broker/tmux parent environment. Preserve the explicit `MCP_TERMINAL_SOCKET` inherited by the child so changing `XDG_RUNTIME_DIR` cannot redirect `wsl-term` to the wrong broker socket.

Launch Kitty with argv, never shell interpolation. Session names remain validated by the existing Terminal name contract.

`humanAttached` means only that a designated collaborative frontend exists. It does not prove that a particular Kitty process launched by the current request became the designated client. Provider-local presentation requests should be single-flight per session, but the implementation must tolerate an unrelated operator-side attach race without claiming global duplicate suppression.

If broker state reports writable/temporary human ownership without a designated attached frontend (`humanLease=true`, `humanAttached=false`), treat that as attachment in progress. Wait boundedly for the designated frontend to appear or for the temporary lease to clear, then reevaluate before launching Kitty.

## Failure semantics

Frontend failure must never destroy or silently replace the tmux session.

- `terminal_open(..., present: true)` may create the session before presentation fails. Report that partial outcome explicitly so the model does not retry `terminal_open` and collide with the existing session.
- `terminal_yield` frontend failure leaves the session model-owned and returns a manual exact-session attachment fallback.
- If this request spawned Kitty but readiness fails or times out, terminate only that launched frontend process group before returning the error. Do not kill the tmux session or unrelated frontends.
- Closing Kitty detaches only the human client; it does not kill the tmux session.
- `terminal_close` remains the explicit destructive lifetime action.
- Human writable ownership continues to block model send/resize/ordinary close.

## Security and privacy

- Never request sudo passwords, MFA values, or other secrets in ChatGPT.
- Human secret input flows directly from the Kitty/tmux client to the PTY.
- Preserve the existing guarantee that human input is not copied into broker input logs or separate Terminal state.
- Do not bypass ownership with Dev Bash, raw tmux, or ad-hoc `wsl-term` calls from the model.

## Herdr boundary

Kitty may run `herdr` as an ordinary interactive program, but that creates/uses Herdr-owned terminal/session state. It is not the same PTY as a production Terminal MCP session.

Do not add a Herdr dependency or route production Terminal sessions through Herdr in this change. The previous challenger evaluation selected tmux/broker as the lifetime authority, and this feature is a presentation layer on top of that decision.

## Model-facing surface

Keep exactly seven Terminal MCP tools:

```text
terminal_open
terminal_read
terminal_send
terminal_resize
terminal_list
terminal_yield
terminal_close
```

Only `terminal_open` gains the optional `present` field. `terminal_yield` changes behavior but not its input schema.

## Acceptance

The feature is accepted only when a real refreshed ChatGPT session demonstrates all of the following on the live personal profile:

1. normal `terminal_open` stays headless;
2. `terminal_open(..., present: true)` launches one Kitty window attached read-only to the exact tmux PTY while model send still works;
3. `terminal_yield` reuses that Kitty window and makes it writable;
4. human input blocks model mutation while model reads remain available;
5. `Ctrl-b T` or `wsl-term give` restores model control without closing Kitty;
6. a second `terminal_yield` reuses the existing Kitty client rather than opening a duplicate;
7. yielding a previously headless session launches Kitty automatically;
8. a harmless sudo flow lets the human type the password only in Kitty and then returns control safely;
9. frontend-launch failure preserves the tmux session and produces the manual attach fallback;
10. passive read-only presentation does not change the model-owned PTY dimensions;
11. after a designated read-only Kitty client exists, broker/provider restart preserves the same tmux PTY and attached frontend, reconstructs the designated-client state, and a later `terminal_yield` reuses it without opening a second Kitty window.
