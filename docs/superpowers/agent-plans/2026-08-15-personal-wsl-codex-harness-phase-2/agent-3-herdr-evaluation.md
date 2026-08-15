# Agent 3 — Herdr Terminal/Wait Challenger Mission

**Mission owner:** Agent 3
**Master-plan task:** Task 6.5
**Execution type:** isolated experiment; no production migration
**Required base:** Agent 3 Task-6 Terminal-core commit `3ff8c6eb03a4dccdd393a324e5d4e6edf891cdc6`

## Purpose

Benchmark Herdr `v0.8.0` against the already-qualified tmux/broker Terminal baseline before Task 7 freezes the production Terminal MCP/human-takeover backend.

This mission exists because Herdr overlaps materially with our planned Terminal and await/resume behavior: persistent terminal sessions, exact-session human attachment, single-writer control, read-only observation, pane-output waiting, and recognized-agent lifecycle waiting. The experiment must determine whether Herdr replaces custom infrastructure, complements it, or adds no material value.

This is **not** permission to migrate production code.

## Ownership

Agent 3 may create/modify only:

```text
experiments/herdr/**
docs/benchmarks/herdr-terminal-comparison.md
```

If a tiny benchmark helper outside those paths is truly required, stop and request an ownership decision first.

Do not modify:

```text
providers/terminal/**
systemd/wsl-agent-tmux.service.in
systemd/wsl-agent-terminal-broker.service.in
config/**
scripts/render-config.mjs
scripts/smoke-local.sh
tests/harness.sh
providers/pi-dev/**
providers/code-router/**
bin/wsl-term
live 1MCP/Cloudflare/OAuth configuration
```

## Frozen Baseline Contract

The current qualified baseline remains:

```text
tmux namespace          wsl-agent
broker socket           $XDG_RUNTIME_DIR/wsl-agent-terminal.sock
state root              $XDG_STATE_HOME/wsl-agent-terminal
default cwd             /home/hamza
lifetime authority      wsl-agent-tmux.service
broker unit             wsl-agent-terminal-broker.service
```

Task-6 evidence already proved:

```text
broker restart changes broker PID
same tmux server PID survives
same PTY child PID survives
transcript continues
new broker reconciles session
immediate first output is not lost
```

Do not weaken or reinterpret that evidence.

## Herdr Pin

Use the official Herdr `v0.8.0` release only.

Before running it:

1. record `uname -m`;
2. select the matching official GitHub release artifact;
3. verify the artifact SHA-256 against release metadata;
4. record artifact name, digest, and test/install path in the benchmark report.

Do not use floating `latest`, `master`, or an unverified install script.

## Candidate Architectures

Benchmark all applicable candidates:

```text
A — TMUX_BROKER
model adapter
  -> our broker
  -> dedicated tmux lifetime authority

B — HERDR
thin prototype adapter
  -> Herdr CLI/socket API
  -> Herdr terminal runtime

C — HYBRID
our bounded model-facing cursor/read policy only where measured useful
  -> Herdr for PTY/human attach/lifecycle/wait
```

Hybrid helper code remains under `experiments/herdr/**`.

## Required Same-Workload Matrix

Run equivalent cases where supported:

```text
open interactive shell
start long-running server/watch command
first read
repeat read with no meaningful new output
new-output read
ordinary text input
ENTER / CTRL_C / CTRL_D
resize
non-zero exit and final evidence
large/noisy output
immediate-output-and-exit
alternate-screen/TUI inspection
human attach to exact PTY
read-only/model observation during human control
second writable attachment behavior / explicit takeover
human detach and control return
client/adapter disconnect + reconnect
backend server remains running while client reconnects
full backend-control-server restart
output-pattern wait
ordinary process completion/readiness wait
recognized coding-agent working/blocked/idle/done wait where supported
```

## Durability Analysis

Keep these boundaries distinct:

```text
client disconnect
MCP/provider-equivalent disconnect
backend server still alive
full backend server restart
WSL shutdown
```

For each candidate record whether:

```text
same PTY survives
same process PID survives
session is only reconstructed
agent session is resumed as a new process
output/history survives
human attachment survives/reconnects
```

Do not call reconstructed/resumed state equivalent to preserving the same PTY/process.

## Human Takeover Analysis

Prove or disprove:

```text
exact same session attachment
single writable controller
read-only observer while writer attached
second writer rejection or explicit takeover
clean return of control after detach
sudo interaction without sending/storing password through MCP
```

Identify exactly what Herdr supplies natively and what a harness adapter would still need.

## Model Context / Read Analysis

Measure on identical noisy workloads:

```text
first-read bytes/tokens
no-new-output repeat-read bytes/tokens
new-output read bytes/tokens
duplicate text returned
truncation signaling
large-output recovery
TUI/current-screen quality
latency
```

Compare Herdr pane/agent reads to our monotonic transcript cursor behavior.

If a hybrid cursor/dedup prototype is useful, measure its code size and context benefit. Do not assume a cursor layer is valuable merely because our existing broker has one.

## Wait / Agent-Lifecycle Analysis

Exercise Herdr's native wait capabilities where available:

```text
pane/output-pattern wait
recognized-agent working -> blocked
working -> idle
working -> done
wait timeout
wait cancellation
client reconnect while wait state matters
stale/replaced agent occupant behavior
```

Answer separately:

```text
HERDR_MAKES_CUSTOM_AWAIT_UNNECESSARY = YES | PARTIALLY | NO
```

If `PARTIALLY`, list the exact missing condition classes. If `NO`, provide failed evidence rather than architectural preference.

## Operational Ownership Comparison

Record:

```text
long-lived process count
idle RSS/CPU
custom production LOC we would own
services/systemd units
restart/recovery complexity
upgrade/migration surface
external dependency risk
model-facing schema impact
```

The question is not "which project has more features?" The question is which architecture gives us the Codex-like WSL behavior with the least cognitive/context/maintenance debt while preserving required durability.

## Failure Classification

Before using a failed case against any candidate, classify:

```text
candidate defect
adapter/prototype defect
benchmark defect
```

Reproduce candidate defects independently.

## Required Verdicts

Terminal verdict must be exactly one:

```text
TMUX_BROKER_WINS
HERDR_WINS
HYBRID_WINS
HERDR_NOT_MATERIAL
```

Wait verdict must be exactly one:

```text
HERDR_MAKES_CUSTOM_AWAIT_UNNECESSARY = YES
HERDR_MAKES_CUSTOM_AWAIT_UNNECESSARY = PARTIALLY
HERDR_MAKES_CUSTOM_AWAIT_UNNECESSARY = NO
```

Consequences:

```text
TMUX_BROKER_WINS | HERDR_NOT_MATERIAL
  -> existing Task 7 may proceed on the tmux/broker backend.

HERDR_WINS | HYBRID_WINS
  -> Task 7 production work must STOP until a focused Terminal design amendment is written and approved.
```

## Report Requirements

`docs/benchmarks/herdr-terminal-comparison.md` must include:

```text
Herdr pin/digest
machine/runtime details
same-workload matrix
durability matrix
context/read matrix
human-takeover matrix
wait/lifecycle matrix
operational ownership comparison
failure classifications
Terminal verdict
await verdict
recommended Task-7 consequence
```

## Commit Boundary

Commit only experiment/evidence paths:

```bash
git add experiments/herdr docs/benchmarks/herdr-terminal-comparison.md
git diff --cached --check
git commit -m "docs: evaluate Herdr terminal backend"
```

Do not wire Herdr into production composition in this mission.

## Required Handoff

```text
STATUS: COMPLETE | BLOCKED | NEEDS_DECISION
BRANCH: <branch>
COMMITS: <hashes>

HERDR PIN
- version
- artifact
- sha256

TERMINAL VERDICT
- TMUX_BROKER_WINS | HERDR_WINS | HYBRID_WINS | HERDR_NOT_MATERIAL

AWAIT VERDICT
- YES | PARTIALLY | NO

SAME-WORKLOAD RESULTS
- ...

DURABILITY RESULTS
- ...

HUMAN TAKEOVER RESULTS
- ...

CONTEXT / READ RESULTS
- ...

WAIT / LIFECYCLE RESULTS
- ...

OPERATIONAL OWNERSHIP
- ...

FAILURE CLASSIFICATIONS
- ...

TESTS / COMMANDS RUN
- ...

TASK-7 CONSEQUENCE
- ...

RISKS / BLOCKERS
- none | ...
```
