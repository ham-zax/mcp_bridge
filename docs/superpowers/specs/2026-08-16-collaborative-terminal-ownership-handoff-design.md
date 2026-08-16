# Collaborative Terminal Ownership Handoff Design

Date: 2026-08-16

## Goal

Make harness-owned terminals feel like normal interactive terminals while allowing the human and ChatGPT to continuously observe the same PTY and hand keyboard ownership back and forth without replacing the PTY, losing process state, or allowing simultaneous writers.

Collaborative terminals are **human-first**. Creating one gives the human normal writable terminal control immediately while ChatGPT can observe it. Control can then move explicitly between the human and ChatGPT.

The core feature is terminal-emulator neutral. Kitty is one valid frontend, not a repository dependency or architectural boundary.

## Chosen model

Exactly one side has mutation authority at a time:

```text
Human-owned
  human    read + write + resize
  ChatGPT  read only

Model-owned
  human    read-only observer
  ChatGPT  read + write + resize
```

This is controlled ownership handoff, not unrestricted shared typing. It avoids ambiguous input when a shell line is half-entered, a TUI is active, Ctrl-C is pressed, or a password prompt is waiting.

A handoff applies to subsequent mutation attempts. A model mutation already in flight when the human takes control may complete; submitted PTY bytes are never recalled or rolled back.

## Architecture

Collaborative terminals are harness-owned from creation:

```text
Human terminal / TTY --\
                        > private harness tmux session -> PTY/process
Terminal MCP ----------/
          |
          +-> broker authorization + transcript/cursor policy
```

The existing lifetime boundary remains unchanged:

- tmux owns the PTY and process lifetime;
- the broker owns model mutation authorization and transcript/cursor policy;
- the human frontend supplies an interactive TTY and is not part of PTY lifetime ownership;
- Terminal MCP operates on the exact same private harness session.

Arbitrary pre-existing non-harness shells or PTYs are not adopted after the fact in this design.

## Human frontend contract

The repository integrates with an **interactive TTY**, not with Kitty or any other branded terminal emulator.

Supported frontends may include Kitty, Windows Terminal through WSL, WezTerm, GNOME Terminal, Konsole, Alacritty, an SSH terminal, a Linux console, or any other environment that presents a normal interactive TTY compatible with tmux.

Core requirements:

- tmux remains a required runtime dependency for the Terminal subsystem;
- Kitty is optional and must not be required, installed, detected, or remotely controlled by the core collaborative-terminal implementation;
- human-interactive CLI operations such as `wsl-term new`, `watch`, and writable attach/rejoin require an interactive stdin/stdout TTY;
- `wsl-term new <session>` attaches the TTY that invoked it rather than launching a terminal emulator;
- tmux bindings such as same-pane takeover operate at the tmux-client layer and are therefore terminal-emulator neutral.

If no interactive TTY exists, human-first collaborative creation cannot attach a human client and should fail clearly rather than inventing a GUI dependency. Model-owned durable sessions may still be created through the existing Terminal MCP path and can be joined later from an interactive TTY.

An optional future convenience command may launch a configured terminal emulator and invoke the normal TTY-based workflow inside it. Emulator detection, launcher adapters, and GUI-specific remote-control APIs are explicitly deferred from this design.

## Ownership authority

Do **not** add a second independent human/model state machine if the existing broker control model can express the behavior.

The current fail-closed rule remains the source of truth:

- an active human lease blocks model mutation;
- any writable human tmux client blocks model mutation;
- explicitly read-only human clients do not block model mutation;
- unknown client state is treated as writable/human-controlled.

Therefore:

- **human-owned** means a writable collaborative client and/or active human lease exists;
- **model-owned** means the collaborative client is read-only and no human lease remains.

Every model mutation continues to reconcile actual tmux clients immediately before authorization. A same-pane human takeover therefore becomes authoritative for subsequent broker mutation attempts without introducing a parallel ownership database.

The broker may retain enough metadata to identify the designated collaborative human client for `give`, out-of-band `take`, and model-initiated yield. Reuse existing lease/client reconciliation and session metadata where practical. The identity mechanism must survive broker restart while that tmux client remains attached and must fail closed if stale or ambiguous.

## One collaborative human client per session

Version 1 has one designated collaborative human client per session. This is the interactive tmux client created or registered by the collaborative workflow.

Additional read-only `watch` clients may continue to exist, but they are observers and are never implicit handoff targets. If the designated collaborative client disappears, the broker must not make an arbitrary watcher writable.

Reattaching through the canonical human attach/rejoin path may register a replacement collaborative client.

## CLI workflow

Canonical commands:

```text
wsl-term new <session>
wsl-term give <session>
wsl-term take <session>
wsl-term list
```

The existing `watch` and `attach` commands remain useful compatibility primitives. `attach` can also serve as the explicit human recovery/rejoin path for an existing session if the implementation can do so without changing its safety contract.

### `wsl-term new <session>`

Create one durable harness session and attach the invoking interactive TTY as the designated initial human owner.

Required behavior:

- require an interactive TTY;
- create the session in the private harness tmux namespace;
- attach the invoking TTY to that exact PTY;
- start writable and human-owned;
- allow ChatGPT reads immediately;
- block model send/resize/ordinary close while human-owned;
- avoid any model-write race during create -> human-attach startup;
- register the attached tmux client as the collaborative human client;
- never launch or require a particular terminal emulator.

The startup race should reuse the existing human lease mechanism rather than inventing a new lock. Once the real writable client is safely observable, client reconciliation can remain the steady-state authority.

### `wsl-term give <session>`

Give model mutation authority while keeping the same human client attached to the same PTY.

Required behavior:

1. identify the designated collaborative client exactly;
2. make that client read-only + ignore-size in place;
3. release any human lease that would otherwise continue blocking model mutation;
4. leave all other session/process/transcript state untouched.

The transition must fail closed. For example, if the client becomes read-only but lease release fails, model mutation remains blocked rather than creating two writers.

After successful `give`, ChatGPT may send and resize; the human keeps watching live output.

### `wsl-term take <session>`

Out-of-band human takeover from another shell, terminal tab, or recovery context.

It makes the designated collaborative client writable again. The broker's normal client reconciliation then blocks subsequent model mutations.

If the designated client is missing or ambiguous, fail rather than choosing an arbitrary observer.

## Same-pane takeover

Once the collaborative human tmux client is read-only, ordinary shell keystrokes are intentionally ignored by tmux. Therefore the human cannot type `wsl-term take` inside that same pane.

Provide one tmux-native takeover binding:

```text
Ctrl-b T
```

On tmux 3.4, read-only clients may still execute `switch-client`; `switch-client -r` toggles the read-only + ignore-size flags. The takeover binding therefore toggles the **same attached human client** back to writable without detach/reattach.

Safety comes from the existing broker rule: before each model mutation, the broker lists/reconciles tmux clients. Once the collaborative client is writable, subsequent model send/resize/ordinary close is rejected as human-controlled.

No separate broker callback is required from the read-only key binding merely to establish safety. Any model operation already in flight at the instant of takeover may finish; the next mutation attempt must observe human ownership and fail.

Because this is a tmux binding rather than a terminal-emulator shortcut, the ownership handoff is not coupled to Kitty.

## Model-initiated yield

ChatGPT should be able to yield a model-owned terminal back to the human.

The broker targets the designated collaborative client and makes it writable. From that point subsequent model mutations are blocked by normal reconciliation.

This is a control-plane operation, not a terminal keystroke. The implementation plan should choose the smallest MCP/broker surface that exposes it clearly without broadening the public Terminal API unnecessarily.

## Sizing

Only the current owner controls terminal dimensions.

Human-owned:

- the writable designated human tmux client may drive the PTY size;
- human terminal resize events are reflected in the harness window.

Model-owned:

- the collaborative human client is read-only + ignore-size;
- human terminal resizing must not change the PTY;
- `terminal_resize` is authoritative.

A handoff must not accidentally let a non-owner overwrite the owner's dimensions.

## Sudo and sensitive input

Primary workflow:

```text
ChatGPT owns terminal
ChatGPT runs a command that reaches a sudo/password prompt
human takes control
human enters the secret directly into the PTY
human gives control back
ChatGPT continues from resulting output
```

Human keystrokes continue to flow directly from the terminal client to tmux/PTY. Do not add a broker-side keystroke log or copy password input into ownership metadata.

ChatGPT may continue reading normal terminal output while the human owns the keyboard, subject to the existing transcript behavior.

## Multiple terminals

Ownership is per session. The user may keep many independent collaborative terminals open, potentially across different terminal-emulator windows, tabs, SSH sessions, or other interactive TTYs. For example:

```text
backend
frontend
tests
logs
ladybird
agent-1
agent-2
```

Giving or taking one session must not affect any other session.

`wsl-term list` and Terminal MCP listing should expose enough ownership state for the human and model to select the right session confidently.

## MCP behavior

Terminal MCP continues to refer to exact sessions in the private harness tmux namespace.

Required rules:

- read/list are available regardless of human/model ownership;
- send/resize/ordinary close are allowed only when no writable human client/lease is present;
- same-pane or out-of-band human takeover blocks subsequent model mutation;
- model yield makes the designated human client writable again;
- MCP descriptions explain the collaborative handoff model to a fresh model without implying a Kitty dependency.

Whether model yield deserves a new public MCP tool or a smaller extension of an existing control path is left to the implementation plan. Prefer the smallest clear contract.

## Failure and restart behavior

The system must fail safe:

- uncertain client state means human-owned/model mutation blocked;
- a partially completed `give` must never create simultaneous writers;
- a partially completed `take` may leave the model blocked, but must not leave both sides writable by broker policy;
- broker restart must not affect PTY/process lifetime;
- after broker restart, actual writable tmux clients continue to block model mutation;
- designated collaborative-client metadata is reconciled with real tmux clients and stale identity is never redirected to another observer;
- closing a collaborative session removes ownership/client identity for that session incarnation;
- missing GUI software is never treated as a Terminal subsystem failure when an interactive TTY is otherwise available.

## Compatibility and non-goals

Keep the existing terminal architecture and contracts unless a change is necessary for this feature.

Out of scope:

- unrestricted simultaneous human/model writers;
- adopting arbitrary existing non-harness PTYs;
- replacing tmux with Herdr;
- requiring, installing, detecting, or remotely controlling Kitty or another specific terminal emulator;
- implementing terminal-emulator launcher adapters in version 1;
- changing transcript, cursor, generation, or dead-pane semantics;
- making multiple human clients simultaneously eligible for ownership handoff in v1.

Existing `watch` semantics remain read-only observation. Existing writable `attach` semantics remain human takeover unless the implementation plan deliberately folds it into the collaborative rejoin path without weakening current guarantees.

## Alternatives considered

### Fully shared writable PTY

Rejected. It is technically possible but creates avoidable races around partial commands, Ctrl-C, TUIs, and password prompts.

### Kitty-specific integration

Rejected as the core architecture. Kitty is useful in the author's current WSL environment, but coupling the repository to Kitty would add installation, detection, launch, and remote-control concerns that are unnecessary when tmux already accepts any suitable interactive TTY.

### Terminal-emulator-neutral TTY workflow

Chosen. The invoking interactive TTY is the human frontend contract. Kitty, Windows Terminal, WezTerm, SSH, and similar frontends are interchangeable from the broker/tmux perspective.

### Shell-command-only handoff

Rejected as the sole UX. After `give`, the same tmux client is read-only, so it cannot type `wsl-term take` into its own pane. Requiring a second shell for every handback would make normal collaboration awkward.

### Controlled handoff with same-pane takeover

Chosen. Shell commands remain the canonical control interface, while `Ctrl-b T` is the one local escape hatch that makes the same attached client writable again. This preserves one-writer safety without detach/reattach or a second terminal.

## Acceptance criteria

1. `wsl-term new demo` requires an interactive TTY, creates a harness-owned terminal, and attaches that invoking TTY as the writable designated client without launching or requiring Kitty.
2. The same collaborative workflow works from at least one non-Kitty interactive terminal environment without code-path changes.
3. ChatGPT can read that exact PTY immediately but cannot mutate it while the human client is writable.
4. `wsl-term give demo` keeps the same human client attached, changes it to read-only + ignore-size, and enables model send/resize.
5. Human terminal resizing does not affect the pane while model-owned.
6. `Ctrl-b T` makes that same human tmux client writable in place and causes subsequent model mutation attempts to return human-control blocking.
7. `wsl-term take demo` performs equivalent takeover from an out-of-band shell without selecting an arbitrary watcher.
8. ChatGPT can voluntarily yield control to the designated human client.
9. Human-entered sudo/password input is not copied into broker metadata or a new auxiliary input log.
10. Multiple collaborative sessions maintain independent ownership.
11. Broker restart and client disconnects fail closed without killing PTYs or losing transcript/cursor state.
12. Existing `watch` remains non-interfering and existing human takeover behavior is not weakened.
13. Absence of Kitty does not prevent use of collaborative terminals when another suitable interactive TTY is available.
14. Absence of any interactive TTY prevents only human-interactive attachment; existing model-owned durable Terminal sessions continue to work.
