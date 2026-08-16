# Agent 3 Mission — Durable tmux Terminal Core

## Mission

Deliver the persistent Terminal foundation without touching MCP composition yet:

- dedicated harness tmux lifetime authority;
- broker protocol and session registry;
- durable transcript/cursor behavior;
- broker crash/restart recovery;
- separate user-systemd lifetime units;
- production durability evidence proving broker restart does not kill tmux or PTY children.

This mission corresponds to **Task 6** of:

`docs/superpowers/plans/2026-08-15-personal-wsl-codex-harness-phase-2.md`

The master plan is authoritative for behavior. This mission file is authoritative for Wave-1 ownership and coordination.

## Can start

Immediately from the shared coordination baseline.

The core broker/tmux work does not depend on Agent 1's personal profile because it can use `/home/hamza` directly as the already-frozen Terminal default. MCP registration and ChatGPT acceptance are intentionally deferred to Task 7 after Agent 1 and this mission merge.

## Branch / worktree

```text
branch:   feat/personal-harness-agent-3-terminal-core
worktree: /home/hamza/repo/satori_bridge/.worktrees/personal-harness-agent-3
```

## Read first

- `CONTRIBUTING.md`
- `docs/superpowers/plans/2026-08-15-personal-wsl-codex-harness-phase-2.md`
- `docs/superpowers/agent-plans/2026-08-15-personal-wsl-codex-harness-phase-2/README.md`
- current lifecycle/systemd conventions only as references; do not alter live bridge lifecycle.

## Ownership

```text
providers/terminal/**
systemd/wsl-agent-tmux.service.in
systemd/wsl-agent-terminal-broker.service.in
scripts/install-terminal-broker-user.sh
docs/benchmarks/terminal-preflight.md
```

You may add focused Terminal-only test fixtures/scripts under `providers/terminal/` if useful.

## Frozen cross-agent contracts

```text
tmux namespace                 wsl-agent
broker socket                  $XDG_RUNTIME_DIR/wsl-agent-terminal.sock
state root                     $XDG_STATE_HOME/wsl-agent-terminal
default cwd                    /home/hamza
session names                  ^[A-Za-z0-9._-]{1,64}$
transcript default budget      16 MiB per session
lifetime unit                  wsl-agent-tmux.service
broker unit                    wsl-agent-terminal-broker.service
```

The broker is not the PTY/process lifetime authority. tmux is.

The two systemd units must have structurally separate lifetime ownership. Do not use `KillMode=process` as a workaround for mixing tmux and broker ownership in one cgroup.

## Required behavior

### Dedicated tmux backend

All harness tmux operations target only the dedicated namespace. Never interact with Hamza's ordinary/default tmux server.

Prove:

```text
create detached named session
send text/key
resize
capture current screen
remain-on-exit
recover dead-pane exit status
list clients/sessions
close session
```

### Broker and protocol

The local private broker protocol may use newline-delimited JSON over the Unix socket because it is not model-facing.

Initial broker operations:

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

Human-lease semantics may exist in the protocol/state foundation, but the human attach CLI and final single-writer UX belong to Task 7 and must not be implemented beyond what Task 6 needs for protocol correctness.

### Transcript/cursor model

Prove:

```text
append-only capture
first bytes are not lost for immediately-printing processes
monotonic logical cursor offsets
normal incremental reads
UTF-8-safe slicing
bounded retention/rotation
stale cursor -> explicit CURSOR_EXPIRED
bounded recovery tail
```

Use tmux-owned piping/capture so broker/provider restart does not stop transcript collection.

### Broker recovery

On restart, enumerate only the dedicated `wsl-agent` tmux server and reconcile session truth. Never kill or inspect unrelated tmux servers.

### Production systemd durability

Use two independent user-systemd units:

```text
wsl-agent-tmux.service
wsl-agent-terminal-broker.service
```

The acceptance gate must prove through the actual user-systemd topology:

```text
open long-lived session
record tmux server PID
record PTY child PID
record broker PID
restart only broker unit
broker PID changes
tmux PID does not change
PTY child PID does not change
transcript continued
broker rediscovered same session
```

Also prove explicitly stopping the tmux lifetime unit ends the dedicated Terminal lifetime boundary.

## Live-system boundary

You **must not** restart, stop, or reconfigure:

```text
mcp-dev-bridge.service
1MCP
Cloudflare tunnel
current live MCP provider composition
OAuth/session state
```

The new `wsl-agent-*` Terminal units are independent and may be installed/tested because they are not yet connected to the live MCP bridge. If any discovered systemd naming/cgroup conflict could affect the live bridge, stop and report `NEEDS_DECISION` before proceeding.

## Coordination boundary

Do not edit:

```text
config/**
scripts/render-config.mjs
scripts/smoke-local.sh
tests/harness.sh
tests/publication.sh
providers/pi-dev/**
bin/wsl-term
```

Those belong to Agent 1 or later Task 7 integration.

Do not implement the Terminal MCP server/catalog in Wave 1. The full six-tool surface and human attach CLI are Task 7 after integration.

## Acceptance

Run all Terminal-focused tests plus static checks. At minimum:

```bash
(cd providers/terminal && npm test)
node --check providers/terminal/*.mjs
bash -n scripts/install-terminal-broker-user.sh
git diff --check
```

Also record the real production-topology PID evidence required above in `docs/benchmarks/terminal-preflight.md`.

The mission is not complete if only unit tests show process survival; the systemd broker-restart gate is mandatory.

## Out of scope

- No Terminal MCP tools yet.
- No ChatGPT Actions refresh.
- No `wsl-term` human attach CLI yet.
- No await/resume API.
- No public profile changes.
- No live bridge restart.
- No CodeDB/RTK work.

## Commit policy

Commit your coherent Terminal-core work on your branch. Do not include live generated state, tmux transcripts, PIDs, sockets, user-service generated files, or secrets.

## Handoff

Return the coordinator handoff format and explicitly include:

- tmux version/capabilities observed;
- broker protocol summary;
- transcript/cursor contract;
- exact two-unit systemd topology;
- tmux/broker/PTY PIDs before and after broker restart;
- immediate-output race result;
- broker recovery result;
- exact commits/tests;
- any contract the later Task 7 agent must preserve.
