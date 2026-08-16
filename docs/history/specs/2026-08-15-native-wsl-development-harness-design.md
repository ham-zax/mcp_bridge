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
                    MCP JSON envelope
                    (transport only)
                            |
                   Cloudflare + OAuth
                            |
                           1MCP
                            |
             +--------------+--------------+
             |                             |
            CODE                           DEV
       CodeDB core/lean          +----------+----------+
                                 |          |          |
                               read       edit       write

                                          bash
                                            |
                                       Pi internals

Later, independently:

Terminal                         -> persistent PTY backend
bulk structured CodeDB results  -> native / compact JSON / TOON / GCF winner
```

The architectural domains remain **Code, Files, Shell, and Terminal**. The diagram groups Files and Shell under one small `dev` provider because that is the initial implementation shape, not because the domains are permanently coupled. CodeDB, Pi, a terminal backend, or a structured encoding can be replaced later without changing the mental model.

The intended working loop is:

```text
Code:  locate relevant symbols/files
Files: read a workspace-relative source window
Files: apply an exact guarded edit or exclusive create
Shell: run native Bash and receive terminal text
Code:  re-check callers/context only if needed
```

MCP remains the transport envelope. It is not the model-facing language of repository work.

### Rejected approach A: keep generic filesystem/shell and accumulate helpers

This is operationally easy but preserves the current RPC feel, keeps a large filesystem schema, and makes context/output optimization an afterthought.

### Rejected approach B: expose a large all-in-one coding MCP or run a nested coding agent

Exposing a full Pi/agent-tool/Desktop Commander/agent-lsp-style catalog or running a nested Codex/Pi agent would reintroduce tool-schema debt and duplicate reasoning/runtime ownership. Reusing Pi's four coding primitives behind our own small MCP boundary is different: no Pi agent/model/session is created, and only the selected primitive implementations are exposed.

## Design principles

### 1. Native model-facing content boundary

Rich records are useful **inside** the harness for tests, telemetry, logging, truncation, and reliability. They stop at the renderer boundary unless the underlying information is genuinely structured and a benchmark proves a compact representation helps.

Initial model-facing policy:

```text
Bash output        -> TextContent containing terminal text
source/text        -> TextContent containing source/text
edit result        -> one TextContent diff, no duplicate success prose
write result       -> short TextContent creation acknowledgement
errors             -> TextContent containing the native diagnostic
bulk records       -> native / compact JSON / TOON / GCF TextContent winner
structuredContent  -> not used by default for dev primitives
embedded resource  -> separate future context-offload experiment
MCP App UI         -> irrelevant to the harness model interface
```

The current ChatGPT experiment showed that plain text, `structuredContent`, embedded resources, and MCP App UI survive the product path differently. For this harness, native semantic artifacts should remain native text. The policy is specific to this ChatGPT + 1MCP workflow; it is not a claim that `structuredContent` is universally wrong for every MCP client.

### 2. Native Linux semantics are the primary Shell UX

The visible Shell tool accepts one normal command string:

```text
bash(
  command: string,
  cwd?: workspace_relative_directory,
  timeout_seconds?: number
)
```

`cwd` is optional and defaults to the immutable configured workspace root. It is a convenience, not a security boundary for `trusted-dev`: the command itself may intentionally access anything available to the Linux service user.

Examples:

```bash
git status --short

git diff --stat && git status --short

rg "rankCandidate" satori/packages/core | head -50

for f in satori/packages/*/package.json; do
  jq -r '.name' "$f"
done
```

Implementation contract:

- use Pi `createLocalBashOperations()`, not Pi `createBashTool()`, so ordinary non-zero exits remain execution data;
- execute one native shell command string and preserve pipes, redirects, heredocs, subshells, shell operators, globbing, and environment expansion;
- resolve optional `cwd` beneath `MCP_DEV_WORKSPACE_ROOT`; reject absolute cwd and `..` segments;
- forward the MCP `AbortSignal` so cancellation kills the full process tree;
- use a 30-second default timeout and 300-second maximum; Terminal owns persistent/interactive processes later;
- capture Pi's combined stdout/stderr stream in emission order;
- bound output according to deployment policy `MCP_DEV_MAX_OUTPUT_BYTES`, not a model-facing argument;
- spill complete output to a bridge-owned state file when truncation occurs.

Internal execution record:

```json
{
  "cwd": "/workspace/satori",
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

Model-facing renderer:

```text
normal exit 0 + output  -> output only
normal exit 0 + empty   -> Command completed.
non-zero exit           -> output + [exit N]
truncated               -> tail + [truncated · full: PATH]
timeout                 -> tail + [timed out after Ns]
cancel                  -> best-effort tail + [cancelled]
```

The dev provider does not return the execution record through `JSON.stringify` and does not emit `structuredContent` for Bash.

### 3. Files is workspace-relative by construction

The Files domain reuses Pi `read`, multi-edit `edit`, and create-only `write`, but the model never supplies an arbitrary absolute cwd or absolute target path.

Visible surface:

```text
read(path, offset?, limit?)

edit(
  path,
  edits=[
    {oldText, newText},
    ...
  ]
)

write(path, content)  # create-only
```

`path` is always relative to immutable `MCP_DEV_WORKSPACE_ROOT`.

Boundary rules:

- reject absolute paths;
- reject any `..` path segment;
- canonicalize the workspace root with `realpath`;
- for existing read/edit targets, canonicalize the target with `realpath` and require it to remain beneath the root;
- for create-only write, require an existing canonical parent beneath the root, then use atomic exclusive creation (`wx` / `O_EXCL`);
- reject symlink escapes, including a symlinked parent for a new file;
- test traversal, absolute outside paths, existing symlink escape, and new-file escape through an outside parent.

Mutation rules:

- preserve Pi's ranged read and multi-edit input;
- reject Pi's fuzzy fallback: every `oldText` must occur exactly once after BOM removal and newline normalization only;
- store the bytes read by the edit operation and compare them immediately before write as a best-effort external-race guard;
- do not claim that comparison-plus-write is kernel-atomic CAS against arbitrary outside writers;
- existing-file full rewrites are unavailable initially; use guarded exact edit;
- defer model-visible hash/CAS parameters unless real shared-tree evidence requires them.

Model-facing Files results:

```text
read   -> Pi source/text content
edit   -> path + one useful diff only
write  -> Created <path>
error  -> native diagnostic text with isError=true
```

The provider does not return Pi's generic edit success prose alongside the diff and does not emit `structuredContent` for Files.

### 4. Code is a replaceable intelligence domain

Initial implementation: **CodeDB**.

As of 2026-08-15, current upstream CodeDB supports:

- `CODEDB_TOOLS_PROFILE=core` for the 10 everyday MCP tools;
- `CODEDB_MCP_LEAN=1` to force model-relevant data blocks only;
- `CODEDB_NO_TELEMETRY=1`;
- explicit per-call absolute `project` selection;
- ranged `codedb_read`, `compact`, and `if_hash` skip-unchanged behavior;
- a local watcher/index that updates after edits.

Phase 1 pins **CodeDB v0.2.5840** and verifies the Linux x86_64 release checksum before execution. CodeDB remains context/navigation only; its fallback editor is not the mutation path.

Launch/runtime contract:

```text
cwd = /tmp
CODEDB_TOOLS_PROFILE=core
CODEDB_MCP_LEAN=1
CODEDB_NO_TELEMETRY=1
```

Install the verified release binary directly so no client hooks, DeepWiki registration, or unrelated client configuration is created. Every call passes an explicit absolute `project`. Runtime activation inspects the actual advertised tool list instead of trusting documentation counts.

### 5. Terminal is a backend choice, not a permanent MCP product

Terminal is for interactive or persistent processes that Bash should not own:

- development/watch servers;
- REPLs and debuggers;
- interactive installers;
- programs requiring control keys or later reattachment.

Selection criterion is stronger than "persistent across tool calls": the preferred backend should keep local PTYs alive independently of an individual MCP child process whenever practical, bound returned output, and permit human attachment/intervention.

Candidate order for the later benchmark:

1. daemon-managed local CLI backend;
2. `interactive-terminal-mcp` as a direct MCP baseline;
3. `pty-mcp` as a feature-rich comparison.

No terminal candidate is foundational today.

### 6. Structured formats compete on our real payloads

GCF and TOON both have credible evidence for reducing structured context, but neither is accepted as universally better for this coding workload. Their published measurements conflict, and both projects describe structure-dependent tradeoffs.

The first stateless screen uses the same actual CodeDB captures and records the payload's structure class:

```text
native CodeDB text          # model-facing baseline when available
pretty/native JSON          # exact JSON payload
compact JSON                # same payload, whitespace removed
TOON v4.1.1                 # same JSON value
GCF spec v3.5.3             # same JSON value via gcf-python v2.6.0
```

For each applicable representation measure:

- conversion eligibility;
- exact round-trip fidelity;
- bytes;
- one shared tokenizer estimate;
- encode/decode latency;
- structure class (uniform records, deep nesting, irregular/mixed shapes, graph-like data).

Record independent verdicts:

```text
TOON = PROMISING | NOT_MATERIAL | INCOMPATIBLE
GCF  = PROMISING | NOT_MATERIAL | INCOMPATIBLE
```

Neither verdict affects CodeDB's independent KEEP/REMOVE decision.

If one or both remain promising, the later real-path stateless experiment compares **native TextContent vs TOON TextContent vs GCF TextContent** through ChatGPT -> OAuth -> Cloudflare -> 1MCP -> CodeDB. Only after stateless GCF wins may session dedup/delta be evaluated. Stateful GCF correctness and conversation isolation are separate from serialization efficiency.

Source code, diffs, terminal output, and active diagnostics remain native text by default.

### 7. RTK is an optional Shell output policy

RTK is not the shell executor. Native Pi-backed Bash remains the executor. A later experiment may transform supported noisy commands beneath Bash, with a permanent raw bypass and no change to exit/cancel semantics.

### 8. CLI capabilities stay CLIs unless a domain needs semantics

Use ordinary Linux tools through Bash rather than exposing them as MCPs:

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

`ast-grep` is a CLI capability, not another model-facing domain.

## Component selection

| Domain/layer | Selected initial implementation | Why | Replacement gate |
|---|---|---|---|
| Transport | existing Cloudflare OAuth Bridge + 1MCP | already healthy and supervised | change only for a demonstrated protocol limitation |
| Code | CodeDB v0.2.5840 core + lean | bounded indexed context and explicit project | compare alternatives only if accuracy/diagnostics fail evidence gates |
| Files | workspace-confined `dev` adapter over Pi 0.84.1 | mature primitives with a smaller model schema and explicit boundary enforcement | replace Pi only for a demonstrated backend limitation |
| Shell | `trusted-dev`: Pi local Bash operations; `restricted`: legacy restricted shell until an equivalent policy exists | native command string without weakening the public restricted profile | RTK is an output policy, not a replacement |
| Model-facing dev results | native TextContent renderer | preserves source, diffs, diagnostics, and terminal semantics | change only with direct ChatGPT-path evidence |
| Structured bulk format | native / compact JSON / TOON / GCF screen | conflicting vendor evidence requires workload-specific measurement | adopt only after stateless real-path A/B |
| Terminal | undecided; benchmark later | persistence/session semantics need empirical testing | choose by reliability and session-survival evidence |

## Why Pi backs Files + Shell

Pi already implements ranged reads, multi-edit, native command-string execution, process-tree termination, timeouts, and mutation queues. Its SDK exports these primitives directly, so no nested agent/model/session is needed.

Our adapter adds only remote-harness concerns:

- workspace-relative Files boundary;
- exact-match guard instead of fuzzy fallback;
- atomic exclusive create;
- normal non-zero Shell exits as data;
- explicit cancellation and timeout policy;
- internal observability records;
- native TextContent rendering.

Initial dependency pin: `@earendil-works/pi-coding-agent@0.84.1`, matching the installed lineage validated on this WSL machine.

## Migration strategy

No big-bang replacement. Code and Files/Shell are independent candidates.

### Phase 0 — Cloudflare OAuth Bridge and publication scaffold

**Status:** complete or isolated for merge review.

New harness work targets:

```text
config/templates/mcp.json
providers/
external generated 1MCP state/config
```

Do not restore machine-specific tracked deployment config.

### Phase 1 — CodeDB + neutral structured-format screen

Add CodeDB independently and keep the existing filesystem/shell providers for comparison.

CodeDB requirements:

- exact v0.2.5840 binary/checksum pin;
- core + lean + no telemetry;
- neutral `/tmp` cwd;
- explicit absolute project on every call;
- actual runtime tool-list assertion;
- no client hooks/registrations.

Benchmark one concrete Satori architecture-tracing task. Record:

```text
tool calls
whole-file/repeated/irrelevant reads
wall time
call-chain correctness
total advertised tool-schema bytes and estimated tokens
representative request bytes/tokens and nested field count
model-visible result bytes/tokens
follow-up calls needed to recover missing evidence
index freshness after edit
```

Run the independent stateless format screen on actual eligible CodeDB payloads:

```text
native text
pretty JSON
compact JSON
TOON 4.1.1
GCF 3.5.3 via gcf-python 2.6.0
```

The CodeDB verdict and TOON/GCF verdicts are separate.

After any tool-catalog activation:

```text
restart bridge if provider composition changed
verify bridge health
refresh the ChatGPT workspace/plugin Actions
start a fresh session using that MCP
verify the expected action catalog
```

### Phase 2 — workspace-confined Pi `dev` provider

During A/B, expose:

```text
both profiles: read, edit, write
trusted-dev:   bash additionally
restricted:    legacy restricted shell remains separate
```

Files acceptance:

- immutable `MCP_DEV_WORKSPACE_ROOT`;
- paths are relative only;
- absolute paths and `..` rejected;
- existing target and write parent canonicalized beneath root;
- traversal, absolute outside, symlink escape, and outside-parent creation tests;
- ranged read;
- exact multi-edit with fuzzy fallback rejected;
- one model-facing diff only;
- atomic create-only write with exactly one winner under a race;
- no `structuredContent`.

Shell acceptance:

- visible schema is `command`, optional relative `cwd`, optional `timeout_seconds`;
- output limit comes from deployment policy, not the request schema;
- optional cwd defaults to workspace root;
- absolute cwd and any `..` cwd segment are rejected;
- cwd confinement is only an invocation convenience: under `trusted-dev`, the Bash command itself may intentionally access files/services outside the workspace with the authority of the Linux service user;
- normal non-zero exits are data;
- timeout/cancel kills the process tree;
- terminal output is native TextContent with concise exceptional annotations;
- no JSON execution wrapper and no `structuredContent`.

Benchmark old vs new using runtime and context metrics:

```text
advertised tool count/schema bytes/tokens
representative request bytes/tokens and field count
model-visible result bytes/tokens
follow-up calls needed for evidence
wall time/correctness/retries
```

After activation, cutover, or rollback, repeat the ChatGPT workspace/plugin refresh and fresh-session catalog verification. No losing provider remains registered.

### Phase 3 — Linux CLI toolbox

Install/pin useful missing CLIs such as `ast-grep`; add no MCP schemas.

### Phase 4 — RTK experiment

Benchmark optional RTK shaping beneath proven raw Bash. Preserve raw bypass, native result semantics, and diagnostic correctness.

### Phase 5 — persistent Terminal and long-wait control flow

Benchmark terminal backends independently. Design `await_until` only after measuring the real end-to-end request lifetime and concurrent-resume behavior.

### Phase 6 — live stateless structured-format experiment

Through the real ChatGPT path compare:

```text
native CodeDB TextContent
TOON TextContent
GCF TextContent
```

Use the same semantic payload/task and measure actual context, comprehension, latency, protocol reliability, and raw-evidence preservation. Re-pin the then-current proxy/codec versions. Evaluate GCF session/delta only after stateless GCF wins and conversation state is proven isolated.

### Phase 7 — consolidation and tool-surface reduction

Remove superseded providers, measure the final always-visible schema, and consider facades or an `apply_patch` experiment only after the primitive layer is proven.

## Multi-agent/shared-tree rules

Server-enforced:

- workspace-relative Files namespace;
- canonical root/target/parent containment;
- symlink-escape rejection;
- exact unique edit preconditions;
- best-effort snapshot-before-write conflict detection;
- atomic exclusive create-only writes.

Agent operating contract:

```text
preserve other agents' changes
do not reset/revert/stash unrelated work
do not use git add -A in shared-tree workflows
stage only assigned paths
reread shared files immediately before material mutation
on edit/create conflict: reread and reconcile
```

Worktrees remain optional for tasks that genuinely need isolation.

## Result/context budget policy

- keep internal structured records inside the harness;
- render native semantic artifacts to TextContent;
- never emit `structuredContent` by default for dev primitives;
- keep source, diffs, terminal output, and active diagnostics lossless;
- bound noisy output and expose a recoverable full-output handle when needed;
- apply TOON/GCF only to genuinely structured bulk data after a benchmark win;
- measure schema, request, and result context separately.

The goal is to reduce one controllable source of long-session degradation: tool schemas, verbose envelopes, duplicate confirmations, repeated structured records, whole-file reads, and large logs. This does not claim control over ChatGPT UI rendering, internal history compaction, service latency, or model reasoning latency.

## Test strategy

Each phase has automated provider tests, generated-config tests, live 1MCP verification, and a manual ChatGPT catalog gate.

Global invariants:

```text
bridge status issues = 0
public MCP health = OK
systemd autostart remains enabled
no duplicate runtime process
no unrelated user work modified
syntax/config/provider tests green
provider/version pins exact
```

Tool-surface gate whenever tools are added or removed:

```text
restart the bridge and verify health
refresh ChatGPT workspace/plugin Actions
start a fresh MCP-backed session
verify expected actions and absence of removed actions
```

One designated integrator owns the Git index and commits. Helpers may edit/test assigned paths but do not independently stage or commit.

## Observability

Track internally without dumping records into model-visible results:

```text
provider/tool
latency_ms
request/result byte counts
exit/timed_out/cancelled/truncated
full-output path when retained
conflict/create-exclusive outcome
format applied: native/json/toon/gcf
raw vs transformed bytes/tokens
error category
```

Benchmark reports additionally record:

```text
advertised tool-schema bytes/tokens
request argument bytes/tokens
nested/request field count
model-visible result bytes/tokens
follow-up calls needed to recover evidence
```

INFO logs must not echo full request arguments or full tool results.

## Decision log

### Frozen now

- Four domains remain Code, Files, Shell, Terminal.
- MCP JSON is transport, not the default model-facing language.
- Dev primitives return native TextContent; no default `structuredContent`.
- CodeDB v0.2.5840 is the initial Code candidate.
- Pi 0.84.1 is the Files/Shell implementation engine, not a nested agent.
- Files paths are workspace-relative and server-confined.
- Bash exposes `command`, optional relative `cwd`, and optional timeout only.
- Output byte limit is deployment policy.
- Edit returns one useful diff without duplicate confirmation prose.
- TOON and GCF compete neutrally on real CodeDB payloads; neither vendor benchmark decides adoption.
- CodeDB, TOON, GCF, and Pi have independent verdicts.
- ChatGPT tool-catalog changes require workspace/plugin refresh followed by a fresh session.
- GCF stateful session/delta evaluation follows, rather than accompanies, a stateless win.
- `apply_patch`, Terminal, RTK, and `await_until` remain separate later experiments.

### Explicitly not frozen yet

- whether full model-visible Files hash/CAS is needed;
- final Terminal backend;
- long-wait control-flow design;
- RTK production policy;
- TOON or GCF live insertion details;
- whether CodeDB needs a facade;
- whether an `apply_patch` facade beats Pi multi-edit after cutover.

## Immediate next plan

The implementation plan covers:

```text
Phase 1: CodeDB activation -> benchmark -> native/JSON/TOON/GCF screen -> independent verdicts
Phase 2: workspace-confined Pi dev provider -> native TextContent benchmark -> cutover/rollback
```

It targets the publication-scaffold boundaries (`config/templates/`, generated external state, and `providers/pi-dev/`). It does not implement RTK, Terminal, live structured-format interception, `await_until`, or `apply_patch`.
