# Native WSL Development Harness Design

**Status:** Proposed architecture for review

**Date:** 2026-08-15

## Goal

Make ChatGPT operate on this WSL machine like a local coding agent rather than like a remote collection of JSON/RPC utilities.

The target experience is:

```text
understand repository -> Code
read/change files     -> Files
run Linux commands    -> Shell
interact over time    -> Terminal
```

The transport remains the already-working Cloudflare OAuth Bridge. The development harness changes only the capabilities behind 1MCP.

The design must reduce three kinds of friction at once:

1. **interaction friction** — no more reasoning in `command: ["git", "status", "--short"]` arrays for ordinary shell work;
2. **context friction** — bounded reads, compact structured results, no giant logs or duplicate metadata;
3. **shared-tree friction** — stale edits must fail instead of overwriting another agent's newer work.

## Non-goals

- Do not replace the Cloudflare OAuth Bridge or add a second public gateway.
- Do not embed another coding agent such as Codex or Pi inside ChatGPT.
- Do not introduce a mandatory worktree, locking, or session-ownership system.
- Do not expose every useful CLI as a separate MCP tool.
- Do not make GCF, RTK, Terminal, or a new Files/Shell provider prerequisites for the first CodeDB phase.
- Do not depend on 1MCP lazy discovery to hide a large upstream tool catalog. Each domain should be naturally small.

## Architecture decision

### Selected approach: four capability domains behind one bridge

```text
                         ChatGPT
                            |
                   Cloudflare + OAuth
                            |
                           1MCP
                            |
        +-------------------+-------------------+
        |                   |                   |
       CODE               FILES               SHELL
   CodeDB core       custom CAS adapter     native exec
   + lean output      read/edit/write      command string
        |                   |                   |
        |                   |             Linux CLI toolbox
        |                   |          git/rg/sg/jq/pnpm/etc.
        |                   |                   |
        +-------------------+-------------------+
                            |
                         TERMINAL
                    persistent PTY backend

Optional response optimization, only after measurement:

structured/repetitive results -> GCF experiment
source/diffs/raw diagnostics  -> unchanged
```

These are architectural **domains**, not permanent product names. CodeDB, the custom dev server, RTK, or a terminal backend can be replaced later without changing the mental model.

The intended working loop should feel like a local coding harness:

```text
Code:  locate the relevant symbols/files
Files: read the exact window and capture its hash
Files: apply a CAS-safe edit
Shell: git diff -- <path>
Shell: run the focused test/build command
Code:  re-check callers/context only if needed
```

The model should reason about repository work and Linux commands, not about transport plumbing.

### Rejected approach A: keep generic filesystem/shell and accumulate helpers

This is operationally easy but preserves the current RPC feel, keeps a large filesystem schema, and makes context/output optimization an afterthought.

### Rejected approach B: adopt a large all-in-one coding MCP or nested coding agent

Examples include exposing a full Pi/agent-tool/Desktop Commander/agent-lsp-style catalog or running a nested Codex agent. These provide capability quickly but reintroduce tool-schema debt, duplicate reasoning/runtime ownership, and make the bridge harder to understand.

## Design principles

### 1. Native Linux semantics are the primary Shell UX

The final Shell API accepts a normal command string, not an argv array.

Conceptual interface:

```text
exec(
  command: string,
  cwd?: absolute_path,
  timeout_seconds?: number,
  output_mode?: "auto" | "raw",
  max_output_bytes?: number
)
```

Examples the model should be able to reason about exactly as Linux commands:

```bash
git status --short

git diff --stat && git status --short

rg "rankCandidate" packages/core | head -50

for f in packages/*/package.json; do
  jq -r '.name' "$f"
done
```

Implementation requirement:

- execute with `/bin/bash -c`, not a login shell;
- do not source `.profile` or `.bashrc` implicitly;
- preserve pipes, redirects, heredocs, subshells, shell operators, globbing, and environment expansion;
- use a dedicated process group so timeout/cancel kills descendants;
- full WSL access remains intentional.

Canonical result contract:

```json
{
  "cwd": "/home/hamza/repo/satori",
  "exit_code": 0,
  "stdout": "...",
  "stderr": "...",
  "stdout_bytes": 1234,
  "stderr_bytes": 0,
  "duration_ms": 418,
  "timed_out": false,
  "truncated": false,
  "full_output_path": null
}
```

If output is truncated, the complete captured output is written under a bridge-owned runtime/log directory and `full_output_path` is returned.

`output_mode="raw"` always bypasses any result filtering or RTK transformation.

### 2. Files uses optimistic concurrency as a server guarantee

Prompt rules are not enough for a shared working tree. The Files domain must enforce compare-and-swap semantics.

Target API:

```text
read(path, offset?, limit?, if_hash?)
  -> numbered content window + file_hash + byte/line metadata

edit(path, old_text, new_text, if_hash?)
  -> exact-match atomic edit + diff + new_hash

write(path, content, if_hash | if_absent)
  -> atomic full-file write + diff/summary + new_hash
```

Rules:

- hashes are content hashes, initially SHA-256;
- `read` returns the current hash even for ranged reads;
- if `if_hash` equals the current hash, `read` may return `unchanged=true` without resending content;
- `edit` fails with a conflict if `if_hash` is stale;
- `edit` requires an unambiguous exact `old_text` match unless explicitly designed otherwise later;
- overwriting an existing file through `write` requires its current `if_hash`;
- creating a new file through `write` requires `if_absent=true`;
- no silent unconditional overwrite path in the normal API;
- writes use a temporary file + atomic replace and preserve executable permissions where applicable;
- conflicts are normal recoverable results: reread, reconcile, retry.

This is the main multi-agent safety mechanism. Mandatory worktrees and global file locks remain out of scope.

### 3. Code is a replaceable intelligence domain

Initial implementation: **CodeDB**.

As of 2026-08-15, current upstream CodeDB supports:

- `CODEDB_TOOLS_PROFILE=core` for the 10 everyday MCP tools;
- `CODEDB_MCP_LEAN=1` to force model-relevant data blocks only;
- `CODEDB_NO_TELEMETRY=1`;
- explicit per-call absolute `project` selection;
- ranged `codedb_read`, `compact`, and `if_hash` skip-unchanged behavior;
- a local watcher/index that updates after edits.

Phase 1 pins **CodeDB v0.2.5840**, the current release selected for this benchmark, rather than following latest. The Linux x86_64 binary must be verified against the release checksum manifest before execution.

CodeDB is context/navigation only in our architecture. Its fallback editor is not part of the intended workflow.

Launch/runtime contract:

```text
cwd = /tmp
CODEDB_TOOLS_PROFILE=core
CODEDB_MCP_LEAN=1
CODEDB_NO_TELEMETRY=1
```

Installation must also opt out of automatic client integrations we do not want: no DeepWiki registration and no persistent CodeDB hooks in Codex/Claude/etc. Use the upstream persistent no-hooks mechanism during installation rather than assuming the transient `CODEDB_NO_HOOKS=1` environment variable alone is permanent.

Every model-facing CodeDB call passes:

```text
project="/home/hamza/repo/<repo>"
```

The neutral `/tmp` cwd is deliberate so failure to pass `project` cannot silently index `/home/hamza/repo` as a multi-repository workspace. Runtime activation must inspect the actual `tools/list` instead of trusting a documentation count.

### 4. Terminal is a backend choice, not a permanent MCP product

Terminal exists only for tasks where one-shot `exec` is the wrong abstraction:

- debugger/REPL sessions;
- interactive installers/prompts;
- watch mode and long-running development servers;
- TUI applications;
- sessions the agent returns to repeatedly.

Selection criterion is stronger than "persistent across tool calls": the preferred backend should keep local PTYs alive independently of an individual MCP child process whenever practical, bound returned output, and permit human attachment/intervention.

Candidate order for the later benchmark:

1. **daemon-managed CLI backend** (currently `pilotty` is the strongest researched shape) because it can be driven through our native Shell with zero extra MCP schemas and owns PTYs in a separate local daemon;
2. **interactive-terminal-mcp** as a simple direct MCP baseline;
3. **pty-mcp** as a feature-rich comparison.

Research correction: the currently published `interactive-terminal-mcp` documentation confirms stateful sessions across tool calls, but does not by itself establish the separate per-user daemon/TUI persistence previously attributed to it. We must test the exact package/repository before treating those claims as requirements. `pty-mcp` documents persistent remote sessions via its `ai-tmux` daemon, while local sessions remain owned by the MCP server process.

The Terminal phase chooses one backend by benchmark; no candidate is foundational today.

### 5. GCF is a context optimization experiment, not a correctness dependency

We like GCF because the interesting property is not only compact single responses but session-level dedup/delta for repeated structured shapes. Current GCF/gcf-proxy upstream supports MCP proxying and session-oriented compaction; the current GCF release line is 3.5.x.

However, vendor benchmark numbers are hypotheses for our environment, not acceptance evidence.

We measure:

```text
actual ChatGPT-visible tool result
actual token/context consumption
model comprehension/task accuracy
latency
round-trip/protocol reliability
```

We do **not** accept a benchmark that only compares raw JSON bytes with encoded GCF bytes offline.

Initial GCF candidates:

- CodeDB search/context/caller/dependency/status output;
- process/status/diagnostic records from the later dev harness;
- repeated structured records across several turns.

Default passthrough:

- source code;
- patches/diffs;
- short shell output;
- error/stack traces under active debugging;
- anything requested with `raw` semantics.

GCF is first tested in shadow/offline mode against real captured responses. If useful, the first live insertion is around an individual high-volume provider, not in front of the public Cloudflare/OAuth endpoint.

### 6. RTK is an optional Shell output policy

RTK is not the shell executor. Native Bash remains the executor.

Later Shell behavior:

```text
exec(command, output_mode="auto")
  -> optionally ask RTK rewrite/classifier
  -> execute effective command
  -> structured result

exec(command, output_mode="raw")
  -> execute original command exactly
  -> no RTK
```

RTK's own supported coding-agent integrations work by rewriting Bash-tool command strings before execution. Our remote MCP path does not inherit those hooks automatically, so integration must be explicit beneath our Shell implementation.

Adoption gates:

- no change in exit-code semantics;
- no hidden loss of relevant failure evidence;
- compound commands/pipelines covered by tests;
- deterministic raw bypass;
- measurable reduction on our real `git`, `pnpm`, `rg`, and diagnostic workloads.

### 7. CLI capabilities stay CLIs unless a domain needs semantics

Install/use ordinary Linux tools through Shell rather than exposing them as MCPs:

```text
git
rg
ast-grep (sg)
jq
sed/awk/grep
systemctl/journalctl
node/pnpm
normal Linux tooling
```

`ast-grep` is specifically a CLI capability, not another model-facing MCP domain.

## Component selection

| Domain/layer | Selected initial implementation | Why | Replacement gate |
|---|---|---|---|
| Transport | existing Cloudflare OAuth Bridge + 1MCP | already healthy and supervised | no change unless a demonstrated protocol limitation blocks the harness |
| Code | CodeDB v0.2.5840 core + lean | small core profile, indexed context, bounded reads, explicit project | benchmark against Serena only if accuracy/diagnostics become a demonstrated limitation |
| Files | custom tiny dev MCP provider | exact CAS semantics, minimal surface, no third-party feature baggage | replace only if another provider demonstrably matches contract with less maintenance |
| Shell | same custom dev MCP provider | single command string + exact structured result contract | RTK is an output policy, not a replacement |
| Terminal | undecided; benchmark later | persistence semantics need empirical testing | choose one backend after reliability/session-survival/output-size benchmark |
| Structured response optimization | GCF experiment | promising for repeated structured records | enable only after actual ChatGPT-visible A/B measurements |
| CLI output optimization | RTK experiment | can compact normal dev commands transparently beneath Shell | enable auto mode only after raw-vs-auto benchmark |

## Why a custom Files + Shell provider

We explicitly choose a small custom provider instead of Pi primitives, agent-tool, Patchloom, or another generic desktop/shell MCP as the foundational implementation.

Reasons:

1. the required API is tiny and well-defined;
2. CAS write behavior is central enough that it should be ours, not approximated through another tool's optional features;
3. Shell needs a single-string Bash command and a result schema tailored to our environment;
4. combining Files + Shell in one small `dev` provider lets the generic filesystem and shell MCPs eventually be removed;
5. third-party coding toolkits often expose additional grep/glob/debug/SSH/process tools that duplicate CodeDB or Shell;
6. this is infrastructure we can fully regression-test in the bridge repo.

Implementation preference for the later phase: Python 3.12 with a pinned official MCP Python SDK/FastMCP dependency managed through `uv` and a lockfile. Exact package versions are selected and pinned in the phase implementation plan after a small SDK compatibility spike. No floating `uvx latest` dependency is permitted for the final provider.

## Migration strategy

No big-bang replacement.

### Phase 0 — Cloudflare OAuth Bridge

**Status:** complete.

Acceptance already established:

- systemd user autostart;
- one 1MCP OAuth origin;
- one cloudflared;
- watchdog recovery;
- PID/listener coherence;
- regression suite green.

### Phase 1 — CodeDB only

Add exactly one capability: CodeDB.

Do not add Files replacement, custom Shell, Terminal, RTK, or live GCF in this phase.

Implementation requirements:

- pin CodeDB `v0.2.5840` Linux x86_64 asset + checksum verification;
- no auto-update;
- no DeepWiki registration;
- no client hooks;
- core tool profile;
- lean responses;
- telemetry disabled;
- launcher cwd `/tmp`;
- explicit absolute `project` on every call;
- runtime assert actual advertised tool names;
- keep existing filesystem and shell providers unchanged for A/B comparison.

Benchmark one concrete Satori architecture-tracing task with old primitives versus CodeDB. Record:

```text
tool calls
returned bytes / estimated tokens
whole-file reads
repeated reads
irrelevant reads
wall time
accuracy of concrete file/function call chain
index freshness after edit
```

Keep CodeDB only if it improves context efficiency or understanding without hurting freshness/reliability.

Immediately after this benchmark, run a **shadow GCF encoding experiment** on captured CodeDB structured results. This does not change the live bridge; it only determines whether GCF deserves earlier production work.

### Phase 2 — native dev provider: Files foundation

Create the custom `dev` provider with CAS-safe `read`, `edit`, and `write`.

Existing filesystem MCP remains enabled during comparison.

Acceptance:

- ranged reads with stable hashes;
- unchanged/hash short-circuit;
- stale edit conflict;
- stale full-write conflict;
- `if_absent` create semantics;
- atomic replacement;
- executable-bit preservation;
- line-ending and UTF-8 behavior documented/tested;
- no ability to silently overwrite a file read at an older version;
- benchmark model ergonomics vs generic filesystem MCP.

When parity is proven, remove the generic filesystem MCP from 1MCP.

### Phase 3 — native dev provider: Shell

Add `exec` to the same custom `dev` provider.

Existing shell MCP remains enabled for comparison until parity is proven.

Acceptance:

- command is one native Bash string;
- arbitrary Linux shell syntax works naturally;
- structured exit/stdout/stderr/cwd/duration/byte-count result;
- timeout kills the full process group;
- truncation creates a recoverable full-output file;
- output never silently truncates without `truncated=true`;
- no login-shell/profile noise;
- raw mode exactness;
- benchmark against current argv-array shell for model/tool-call ergonomics.

When parity is proven, remove `mcp-shell-server` and its monkey-patch wrapper.

### Phase 4 — Linux CLI toolbox

Install/pin `ast-grep` and any other genuinely useful CLIs missing from WSL.

No new MCP schemas.

Acceptance is simply that native Shell can use them and their output is bounded by the Shell contract.

### Phase 5 — RTK experiment

Install a pinned RTK build and integrate it inside `exec(output_mode="auto")` as an optional rewrite/filter stage.

Benchmark at minimum:

- `git status`;
- `git diff` small and large;
- `rg` searches;
- passing and failing JS/TS test output;
- build/typecheck output;
- compound shell expressions/pipelines.

Measure raw bytes, returned bytes, task comprehension, failure diagnosis quality, and latency.

Do not make `auto` default until it demonstrates no meaningful loss of diagnostic correctness. `raw` remains permanent.

### Phase 6 — persistent Terminal

Benchmark terminal backends on the same WSL machine.

Required scenarios:

1. persistent bash with `cd`/env state across interactions;
2. Node/Python REPL;
3. debugger or interactive prompt;
4. long-running `pnpm` watch/dev process;
5. terminal backend survives model/MCP client reconnect where claimed;
6. 1MCP restart survival where claimed;
7. bounded incremental reads after noisy output;
8. Ctrl+C/resize/special keys;
9. human attach/inspection if supported;
10. cleanup after crash/reboot.

Prefer a daemon-managed local CLI backend if it gives reliable persistence through the existing Shell with zero added MCP schemas. Otherwise choose the smallest reliable MCP terminal implementation.

### Phase 7 — live GCF vs native output experiment

Compare:

```text
native lean/compact output
GCF
TOON only if still worth measuring
```

Use real captures from CodeDB and the custom dev provider.

Acceptance dimensions:

```text
actual ChatGPT-visible tokens/context
comprehension / task correctness
latency
protocol reliability
session stability across many turns
benefit from dedup/delta on repeated calls
failure/raw-evidence preservation
```

If GCF wins, integrate it only on structured high-volume paths. It must remain removable and must never be required for source/diff/raw Shell correctness.

### Phase 8 — consolidation and tool-surface reduction

Only after the functional architecture is proven:

- remove superseded filesystem/shell providers;
- hide or filter redundant tools if tool-schema context remains material;
- consider a facade for CodeDB only if its 10 core tools still produce measurable cognitive/schema debt;
- measure final always-visible schema size;
- update acceptance docs to express four domains rather than implementation names.

This is deliberately late. We first select reliable components and semantics; we optimize discovery only after real usage data exists.

## Multi-agent/shared-tree rules

Server-enforced:

- Files CAS/hash checks;
- atomic writes;
- exact edit preconditions.

Agent operating contract:

```text
preserve other agents' changes
do not reset/revert/stash unrelated work
do not use git add -A in shared-tree workflows
stage only assigned paths
reread shared files immediately before mutation when material
on CAS conflict: reread and reconcile; never force-overwrite by default
```

Worktrees remain optional for tasks that genuinely need isolation.

## Result/context budget policy

Every custom result-producing operation follows progressive disclosure:

- bounded default output;
- explicit truncation metadata;
- full output recoverable from a path/handle when applicable;
- hashes/version metadata instead of resending unchanged content;
- no full repository dumps;
- no full logs at INFO simply because they exist;
- preserve exact raw evidence on request;
- transformations must be measurable and reversible/bypassable.

The target is to reduce tool-originated context pressure so long sessions degrade less from repeated code/log/schema payloads. This can improve one source of session slowdown/context pressure, but it is not claimed to control ChatGPT UI rendering, internal history compaction, service latency, or model reasoning latency.

## Test strategy

Each phase has its own regression suite and a live acceptance gate.

Global invariants after every phase:

```text
Cloudflare OAuth Bridge status issues = 0
public MCP health = OK
systemd autostart remains enabled
no duplicate bridge/runtime process
no unrelated staged/user work modified
bash/config syntax checks green
existing lifecycle tests green
new provider/version is pinned
```

For new provider code, use test-first behavior around failures and concurrency, especially stale hashes, timeout cleanup, process-group cleanup, truncation, and atomic write rollback.

No provider is removed until its replacement passes both automated regression tests and one real ChatGPT-driven Satori task.

## Observability

Track enough to compare phases without dumping context into the model:

```text
provider/tool
latency_ms
input/output byte counts
truncated flag
cache/hash-unchanged flag
RTK/GCF transformation applied? yes/no
raw vs transformed byte counts
error category
```

Detailed payloads remain debug-only. INFO logs must not echo full MCP request arguments or full tool results.

## Decision log

### Frozen now

- Four capability domains: Code, Files, Shell, Terminal.
- Existing Cloudflare OAuth Bridge + 1MCP remains the transport/composition layer.
- CodeDB is Phase 1 and is pinned to v0.2.5840 for the first benchmark.
- Files and Shell will converge into a small custom `dev` MCP provider.
- Files CAS semantics are mandatory.
- Shell command input is a native Bash command string.
- Shell returns deterministic structured execution metadata.
- Linux CLIs stay behind Shell instead of becoming MCPs.
- RTK is optional auto-mode output shaping with a permanent raw bypass.
- GCF is favored for serious evaluation but remains a measured optimization, not a correctness dependency.
- Terminal backend is selected empirically later.
- Tool hiding/facading happens after the implementation choices are proven.

### Explicitly not frozen yet

- final terminal backend;
- RTK production default policy;
- GCF production insertion point/profile;
- whether CodeDB's 10 core tools need a later facade;
- exact Python MCP SDK version for the custom dev provider;
- whether a Codex-style multi-file `apply_patch` tool is worth adding after `read/edit/write` is exercised in real work.

## Immediate next plan

The next implementation plan covers **Phase 1 only: CodeDB**.

The existing staged `docs/superpowers/plans/2026-08-15-codedb-dev-harness.md` is an outdated draft because it predates the canonical Cloudflare OAuth Bridge and the four-domain architecture. It must be replaced rather than executed as-is.

The Phase 1 plan must stop after CodeDB activation + benchmark + shadow GCF measurement. It must not implement the custom Files/Shell provider, RTK, Terminal, or live GCF.
