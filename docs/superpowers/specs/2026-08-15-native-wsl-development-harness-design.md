# Native WSL Development Harness Design

**Status:** Approved architecture, amended after implementation review

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
3. **shared-tree friction** — exact edits and exclusive creates must reject obvious conflicts instead of relying on prompt discipline; full kernel-level CAS for arbitrary external writers is deferred unless evidence shows the narrower Pi guards are insufficient.

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
   CodeDB core        Pi-backed dev         Pi shell ops
   + lean output      read/edit/write      command string
                      + strict guards      + result adapter
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

These are architectural **domains**, not permanent product names. CodeDB, Pi, RTK, or a terminal backend can be replaced later without changing the mental model. Pi is an implementation engine for Files/Shell primitives, not a nested agent, model, or session.

The intended working loop should feel like a local coding harness:

```text
Code:  locate the relevant symbols/files
Files: read the exact window
Files: apply a guarded exact edit or exclusive create
Shell: git diff -- <path>
Shell: run the focused test/build command
Code:  re-check callers/context only if needed
```

The model should reason about repository work and Linux commands, not about transport plumbing.

### Rejected approach A: keep generic filesystem/shell and accumulate helpers

This is operationally easy but preserves the current RPC feel, keeps a large filesystem schema, and makes context/output optimization an afterthought.

### Rejected approach B: expose a large all-in-one coding MCP or run a nested coding agent

Exposing a full Pi/agent-tool/Desktop Commander/agent-lsp-style catalog or running a nested Codex/Pi agent would reintroduce tool-schema debt and duplicate reasoning/runtime ownership. Reusing Pi's four coding primitives behind our own small MCP boundary is different: no Pi agent/model/session is created, and only the selected primitive implementations are exposed.

## Design principles

### 1. Native Linux semantics are the primary Shell UX

The Shell domain accepts a normal command string, not an argv array. The initial implementation reuses Pi's local shell operations but owns the remote-MCP result semantics.

Initial visible interface:

```text
bash(
  command: string,
  cwd: absolute_path,
  timeout_seconds?: number = 30,
  max_output_bytes?: number = 1048576
)
```

Examples the model should reason about exactly as Linux commands:

```bash
git status --short

git diff --stat && git status --short

rg "rankCandidate" packages/core | head -50

for f in packages/*/package.json; do
  jq -r '.name' "$f"
done
```

Implementation contract:

- use Pi `createLocalBashOperations()` as the process backend; do **not** expose Pi `createBashTool()` directly because it converts ordinary non-zero exits into tool errors;
- execute one native shell command string with Pi's local shell semantics;
- require an explicit per-call absolute `cwd`; never keep mutable global cwd;
- preserve pipes, redirects, heredocs, subshells, shell operators, globbing, and environment expansion;
- forward the MCP request `AbortSignal` into Pi so cancellation kills the full process tree;
- use a finite default timeout of 30 seconds and a maximum of 300 seconds; Terminal owns intentionally persistent/interactive processes later;
- treat a normal non-zero exit code as execution data, not an MCP tool failure;
- stream/capture stdout and stderr in Pi's native combined order; do not pretend the backend can reconstruct separate streams;
- bound model-visible output and spill the complete combined stream to a bridge-owned state/log file when truncation occurs.

Canonical initial result contract:

```json
{
  "cwd": "/path/to/project",
  "exit_code": 1,
  "output": "...",
  "output_bytes": 1234,
  "duration_ms": 418,
  "timed_out": false,
  "cancelled": false,
  "truncated": false,
  "full_output_path": null
}
```

Timeout returns `timed_out=true` with `exit_code=null` when a response can be delivered. MCP cancellation must always terminate the process tree promptly; delivery of a final `cancelled=true` result is best-effort because the caller may already have cancelled the request.

A later RTK phase may add `output_mode="auto" | "raw"`; raw Pi-backed Shell is proven first.

### 2. Files reuses Pi primitives behind stricter remote-concurrency guards

The Files domain initially exposes Pi-backed `read`, multi-edit `edit`, and create-only `write`. Pi is the implementation engine, but its local-agent assumptions are not accepted blindly.

Initial visible surface:

```text
read(cwd, path, offset?, limit?)

edit(
  cwd,
  path,
  edits=[
    {oldText, newText},
    ...
  ]
)

write(cwd, path, content)  # create-only
```

Rules:

- every call requires an explicit absolute `cwd`;
- preserve Pi's ranged read behavior and real multi-edit API;
- `edit` must reject Pi's fuzzy fallback: each `oldText` is validated as an exact unique string against the same BOM-stripped/newline-normalized snapshot Pi will edit; quote/dash/whitespace normalization is not allowed to create a match;
- the custom Pi `EditOperations` stores the bytes read for that invocation and, immediately before write, verifies the current file bytes still equal that snapshot; if another writer changed the file, the edit fails instead of overwriting it;
- `write` is initially new-file creation only; implement Pi `WriteOperations.writeFile` with atomic exclusive creation (`wx` / `O_EXCL`) so concurrent creators cannot both succeed;
- existing-file full rewrites are deliberately unavailable in the initial API; use guarded exact `edit` instead;
- forward one compact edit diff (`details.diff`) in the model-visible result; omit Pi's redundant unified patch unless explicitly requested later;
- full model-visible hash/CAS parameters are deferred. Add them only if guarded edits + exclusive create prove insufficient in real shared-tree work.

This catches fuzzy/ambiguous edits, serializes in-provider mutations through Pi, guarantees create-only races with `O_EXCL`, and detects an observed intervening edit before write. It is **not** claimed to be kernel-atomic CAS against an arbitrary external writer that changes the file between the final comparison and write; full CAS/versioned writes remain a later option if real shared-tree evidence requires them.

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

Installation must not create automatic client integrations we do not want: no DeepWiki registration and no persistent CodeDB hooks in Codex/Claude/etc. The initial plan therefore installs the verified release binary directly instead of running CodeDB's convenience installer; no client-registration/hook cleanup should be needed.

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

We like GCF because the interesting property is not only compact single responses but session-level dedup/delta for repeated structured shapes. Current GCF/gcf-proxy upstream supports MCP proxying and session-oriented compaction; the current pinned shadow candidate is GCF v3.5.3.

However, vendor benchmark numbers are hypotheses for our environment, not acceptance evidence.

We measure:

```text
actual ChatGPT-visible tool result
actual token/context consumption
model comprehension/task accuracy
latency
round-trip/protocol reliability
```

The first shadow pass may compare offline size, round-trip fidelity, and encoding latency as a cheap screening step. We do **not** treat that as production acceptance; any live adoption still requires actual ChatGPT-visible context, comprehension, and protocol measurements.

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

GCF is first tested in shadow/offline mode against real captured responses. If useful, the first live candidate is `gcf-proxy` wrapped around CodeDB only, behind 1MCP—not in front of the public Cloudflare/OAuth endpoint and not around Pi Files/Shell. Start that live experiment stateless, and first verify CodeDB actually returns structured JSON inside MCP `content[].text`, because the current proxy rewrites JSON-valued text blocks rather than arbitrary `structuredContent`. `gcf-proxy --session` and `--delta` are not enabled until we prove their proxy-process state is correctly isolated to the same ChatGPT/MCP conversation that owns the prior context; process-global dedup/delta state must never leak references across independent clients or conversations.

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
| Files | thin `dev` MCP adapter over Pi 0.84.1 read/edit/write | reuse mature coding primitives while enforcing stricter remote/concurrent mutation semantics | replace Pi only if the backend itself becomes a demonstrated limitation |
| Shell | `trusted-dev`: Pi `createLocalBashOperations()` through `dev`; `restricted`: legacy restricted shell until equivalent policy exists | native command string for the trusted reference deployment without weakening the public restricted profile | RTK is an output policy, not a replacement |
| Terminal | undecided; benchmark later | persistence semantics need empirical testing | choose one backend after reliability/session-survival/output-size benchmark |
| Structured response optimization | GCF shadow experiment, then optional live experiment | promising for repeated structured records | enable only after actual ChatGPT-visible A/B measurements |
| CLI output optimization | RTK experiment | can compact normal dev commands transparently beneath Shell | enable auto mode only after raw-vs-auto benchmark |

## Why Pi backs Files + Shell

We reuse Pi's coding primitives instead of rebuilding a mini coding harness from first principles, but we do **not** expose a Pi agent or Pi's whole tool catalog.

Reasons:

1. Pi already implements ranged reads, multi-edit, native command-string shell execution, process-tree termination, timeouts, and mutation queues;
2. its SDK exports the primitive factories/operations directly, so no nested model/session is needed;
3. our MCP adapter can expose only `read`, `edit`, `write`, and `bash`;
4. remote MCP needs a few stricter semantics than Pi's local-agent defaults: exact edit guards, atomic create-only writes, non-zero exit as data, bounded structured results, explicit cwd, and forwarded cancellation;
5. this is much less custom infrastructure than reimplementing all file/shell machinery while keeping the architectural domains replaceable.

Initial dependency pin: `@earendil-works/pi-coding-agent@0.84.1`, matching the installed lineage being validated on this WSL machine. Upgrading Pi is a separate change after the adapter contract is proven.

## Migration strategy

No big-bang replacement. Code and Files/Shell are independent domains: failure of one candidate does not block evaluation of the other.

### Phase 0 — Cloudflare OAuth Bridge and publication scaffold

**Status:** complete or isolated for merge review.

The working bridge behavior is already established, and the publication-scaffold branch defines the generic repository layout that new provider work should target:

```text
config/templates/mcp.json
providers/
external generated 1MCP state/config
```

Harness implementation must build on that layout rather than restoring tracked machine-specific `config/mcp.json`.

### Phase 1 — CodeDB only

Add CodeDB independently of Files/Shell replacement.

Implementation requirements:

- pin CodeDB `v0.2.5840` Linux x86_64 asset and verify SHA-256 `f784c931b053031ca9928173828130c504f769c9e94bf5c2666ab71091747966`;
- no auto-update;
- no DeepWiki registration;
- no client hooks;
- `CODEDB_TOOLS_PROFILE=core`;
- `CODEDB_MCP_LEAN=1`;
- `CODEDB_NO_TELEMETRY=1`;
- launcher cwd `/tmp`;
- explicit absolute `project` on every call;
- runtime assert actual advertised tool names rather than trusting documentation counts;
- keep the existing filesystem and shell providers unchanged for A/B comparison.

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

After the benchmark, capture representative CodeDB results and run a **shadow/offline GCF v3.5.3 measurement** using pinned `gcf-python v2.6.0`, which implements the v3.5.3 numeric domain. This does not alter the live bridge. First measure **conversion coverage**: CodeDB documents plain-text MCP responses by default, so only JSON-valued `content[].text` is directly eligible for the current `gcf-proxy` path. For eligible captures, measure encoded size/token estimate, encode/decode latency, and round-trip fidelity. Model-comprehension and end-to-end protocol acceptance belong to the later live experiment.

Decision handling is independent:

```text
CodeDB KEEP
  -> leave CodeDB registered

CodeDB REMOVE
  -> remove CodeDB from template/generated config, smoke checks, and public docs
  -> keep the benchmark evidence
  -> continue to Phase 2
```

### Phase 2 — Pi-backed `dev` provider: Files + Shell

Create one local stdio provider exposing exactly:

```text
read
edit
write
bash
```

The current filesystem MCP and shell MCP remain enabled during A/B comparison.

#### Files acceptance

- `read` preserves Pi offset/limit behavior;
- `edit` preserves Pi's multi-edit input and returns one compact `details.diff` representation;
- before Pi edit logic runs, each `oldText` must be exactly unique in the BOM-stripped/newline-normalized snapshot; Pi fuzzy quote/dash/whitespace normalization must never create an accepted match;
- custom `EditOperations` verifies immediately before write that the file bytes still equal the snapshot read by that invocation, so an intervening external write becomes a conflict;
- `write` is create-only and uses a custom Pi `WriteOperations.writeFile` with atomic exclusive creation (`wx` / `O_EXCL`);
- two concurrent creates for the same absent path yield exactly one success;
- existing paths are never overwritten by `write`;
- explicit absolute cwd is isolated per request.
- profile mapping remains explicit: `trusted-dev` enables Pi Bash; `restricted` does not expose unrestricted Pi Bash and continues using the legacy restricted shell during this phase.

#### Shell acceptance

- `bash.command` is one native shell string;
- Pi `createLocalBashOperations()` is the executor; Pi `createBashTool()` is not exposed directly;
- exit code 0 and non-zero exit codes are normal results;
- result contains cwd, exit_code, combined output, output byte count, duration, timed_out, cancelled, truncated, and full_output_path;
- default timeout is 30 seconds, maximum timeout is 300 seconds;
- timeout and MCP cancellation kill the full process tree;
- output is bounded without losing the recoverable full-output file;
- pipes, `&&`, redirects, subshells, and normal Linux syntax work;
- no mutable global cwd exists.

Benchmark against the old filesystem + shell providers on the same workflows, including:

```text
ranged read
multi-location edit
fuzzy-only edit candidate (must reject)
concurrent create-only write
native compound shell command
non-zero shell exit
MCP cancellation
hung command/default timeout
verbose command truncation/full-output recovery
```

Decision handling:

```text
Pi CUTOVER
  -> remove the old filesystem provider for both profiles
  -> trusted-dev: use `dev.read/edit/write/bash` and remove the legacy shell from its rendered composition
  -> restricted: use `dev.read/edit/write`, keep the legacy restricted shell, and do not expose unrestricted Pi Bash

Pi KEEP_OLD_PROVIDERS
  -> remove `dev` from template/generated config, smoke checks, and temporary docs
  -> keep benchmark evidence
```

No losing experimental provider remains registered after the decision.

### Phase 3 — Linux CLI toolbox

Install/pin `ast-grep` and any other genuinely useful CLIs missing from WSL. No new MCP schemas.

### Phase 4 — RTK experiment

After raw Pi-backed Shell is stable, benchmark a pinned RTK integration beneath `bash` with explicit auto/raw semantics. Do not change native exit/cancel behavior, and keep a permanent raw bypass.

### Phase 5 — persistent Terminal and long-wait control flow

Benchmark terminal backends independently for persistent bash state, REPL/debugger interaction, watch/dev processes, reconnect/restart survival where claimed, bounded incremental reads, special keys, human attachment, and cleanup.

`await_until` is **not** part of the CodeDB+Pi implementation plan. Design it only after measuring the real end-to-end MCP/Cloudflare request lifetime and deciding how it coordinates concurrent resumptions. Cloudflare currently documents a 125-second default Proxy Read Timeout for proxied HTTP, so a 180-second lease is not accepted without a live transport measurement.

Prefer native MCP Tasks if the connected ChatGPT/1MCP path later advertises and successfully negotiates them; otherwise evaluate a small compatibility primitive separately.

### Phase 6 — live GCF vs native output experiment

If the shadow screen is promising, first wrap **CodeDB only** with a pinned `gcf-proxy` release in stateless mode and compare it with native CodeDB output through the real ChatGPT -> Cloudflare -> 1MCP path. Do not wrap Pi Files/Shell by default; source windows, edit diffs, shell output, and diagnostics remain raw/lossless evidence.

Before enabling `gcf-proxy --session` or `--delta`, verify experimentally that state is scoped to a single ChatGPT/MCP conversation rather than a shared long-lived provider process. If 1MCP multiplexes independent clients through one stdio provider, session/delta requires an isolation strategy or stays disabled.

Compare actual ChatGPT-visible context/tokens, comprehension, latency, protocol reliability, repeated-call savings, and raw-evidence preservation.

### Phase 7 — consolidation and tool-surface reduction

Only after the useful components are proven:

- remove any superseded providers that survived earlier rollback gates;
- hide/filter redundant tools only if schema context remains material;
- consider a CodeDB facade only if its core tool set still causes measurable cognitive/schema debt;
- measure final always-visible schema size;
- update acceptance docs around the stable domains rather than backend product names.

## Multi-agent/shared-tree rules

Server-enforced:

- exact unique edit preconditions with Pi fuzzy matching rejected;
- snapshot-before-write conflict detection for edits;
- atomic exclusive create-only writes;
- explicit per-call cwd isolation.

Agent operating contract:

```text
preserve other agents' changes
do not reset/revert/stash unrelated work
do not use git add -A in shared-tree workflows
stage only assigned paths
reread shared files immediately before mutation when material
on edit/create conflict: reread and reconcile; never force-overwrite by default
```

Worktrees remain optional for tasks that genuinely need isolation.

## Result/context budget policy

Every model-facing result-producing operation follows progressive disclosure:

- bounded default output;
- explicit truncation metadata;
- full output recoverable from a path/handle when applicable;
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

For new provider code, use test-first behavior around failures and concurrency, especially fuzzy-vs-exact edit rejection, intervening edit conflicts, concurrent exclusive creates, non-zero shell exits, timeout cleanup, cancellation/process-group cleanup, and truncation/full-output recovery.

One designated integrator owns the Git index and commits during implementation. Helpers/subagents may edit and test assigned paths but do not independently stage/commit in the shared worktree.

No provider is removed until its replacement passes both automated regression tests and one real ChatGPT-driven Satori task.

## Observability

Track enough to compare phases without dumping context into the model:

```text
provider/tool
latency_ms
input/output byte counts
truncated flag
conflict/create-exclusive flag
RTK/GCF transformation applied? yes/no
raw vs transformed byte counts
error category
```

Detailed payloads remain debug-only. INFO logs must not echo full MCP request arguments or full tool results.

## Decision log

### Frozen now

- Four capability domains: Code, Files, Shell, Terminal.
- Existing Cloudflare OAuth Bridge + 1MCP remains the transport/composition layer.
- The publication-scaffold layout is the base for new harness implementation; do not restore tracked machine-specific deployment config.
- CodeDB is Phase 1 and is pinned to v0.2.5840 for the first benchmark.
- Pi 0.84.1 is the initial implementation engine for Files + Shell primitives, not a nested agent/model/session.
- The `dev` provider exposes `read`, `edit`, and `write` in both profiles; Pi `bash` is enabled only for `trusted-dev` until an equivalent restricted native-shell policy is designed.
- Pi fuzzy edit fallback is rejected by our exact guard; edits also verify the pre-write snapshot has not changed.
- `write` is atomic create-only initially; model-visible full hash/CAS writes are deferred unless evidence requires them.
- Shell uses Pi `createLocalBashOperations()` with our result/cancellation contract; normal non-zero exits are data, not tool errors.
- Shell command input is one native command string with explicit absolute cwd and a finite default timeout.
- One compact edit diff is returned; redundant patch output is omitted by default.
- Linux CLIs stay behind Shell instead of becoming MCPs.
- A shadow GCF v3.5.3 measurement using `gcf-python v2.6.0` follows the CodeDB benchmark without changing the live bridge.
- CodeDB and Pi have independent keep/remove gates and explicit loser rollback paths.
- `await_until` is split into a later Terminal/control-flow design after live transport lifetime measurement.
- RTK is optional future output shaping with a permanent raw bypass.
- Terminal backend is selected empirically later.
- Tool hiding/facading happens after the implementation choices are proven.

### Explicitly not frozen yet

- whether full model-visible Files hash/CAS is needed after guarded Pi usage;
- final terminal backend;
- long-wait/`await_until` design and lease duration;
- RTK production default policy;
- exact pinned `gcf-proxy` release for the first live CodeDB wrapper and whether session/delta can be safely conversation-scoped;
- whether CodeDB's core tools need a later facade;
- whether a Codex-style multi-file `apply_patch` tool is worth adding after Pi `read/edit/write` is exercised in real work.

## Immediate next plan

The next implementation plan covers the focused **CodeDB + Pi evaluation and cutover sequence** only:

```text
Phase 1: CodeDB activation -> benchmark -> shadow GCF -> keep/remove rollback
Phase 2: Pi-backed dev provider -> benchmark -> cutover/rollback
```

It must target the publication-scaffold repository boundaries (`config/templates/`, generated external 1MCP state, and `providers/pi-dev/`). It must not implement RTK, Terminal, live GCF, or `await_until`.
