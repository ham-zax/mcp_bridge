# Native WSL Harness Correction Phase Design

**Status:** Approved for planning

**Date:** 2026-08-15

## Goal

Correct the evaluation mistakes discovered after the first CodeDB/GCF/Pi decision pass without rewriting implementation history or prematurely changing the final product decision.

The correction phase preserves the current implementation commit as a provisional candidate while temporarily restoring a reproducible A/B deployment for evidence gathering.

The phase answers four questions independently:

1. Does the Pi-backed `dev` provider still deserve the Files/trusted-Shell cutover after using fair incumbent baselines and the real ChatGPT transport path?
2. Does correctly rooted CodeDB provide reliable fresh code intelligence and enough incremental value over Pi-only development to retain a Code domain?
3. What are the correct GCF verdicts when generic and graph profiles are evaluated against payloads they are actually designed to represent?
4. What evaluation procedure prevents future candidate removal when a failure is actually caused by an adapter or benchmark design?

## Current state and preservation rule

Git remains at the provisional Pi cutover candidate:

```text
41491ac feat: cut over to Pi dev provider
```

The correction phase MUST NOT revert, amend, or temporarily rewrite that commit merely to recreate the old A/B provider set.

The live deployment is evaluation state, not source-of-truth product history. Before changing it, verify the actual rendered provider composition and bridge health rather than relying on cached ChatGPT actions.

Existing OAuth/session state under the external 1MCP state home must be preserved exactly. The correction phase changes generated provider composition only; it does not rotate OAuth registrations, tokens, or transport identity.

## Evaluation principle

A failed gate is no longer sufficient by itself to remove a candidate.

Every failed gate must first be classified as one of:

```text
candidate failure
adapter / integration failure
benchmark / experiment-design failure
```

Then it must receive an independent reproduction targeted at that classification.

Only after that reproduction may the candidate receive a final KEEP / REMOVE-style verdict.

This rule applies to CodeDB, Pi, GCF, and future Terminal/format/provider experiments.

## Temporary deployment-only A/B restoration

### Selected approach

Temporarily restore the live evaluation provider set from the known pre-cutover A/B implementation state represented by commit `e99579a`, while leaving Git HEAD at `41491ac`.

The desired evaluation surface is:

```text
LIVE EVALUATION
├── dev                Pi candidate
├── filesystem         incumbent Files
└── shell              incumbent Shell
```

This is a deployment-only state. It is not a source rollback and must not create a revert commit.

### Why this approach

It provides a reproducible same-transport incumbent comparison while preserving implementation history and the provisional final candidate.

Rejected alternatives:

1. **Revert `41491ac` temporarily.** Rejected because it mixes benchmark state with product history and creates artificial commit churn.
2. **Hand-edit external `mcp.json`.** Rejected because it produces an undocumented, non-reproducible deployment state.

### Rendering contract

The implementation plan must define a deterministic way to render the A/B provider composition from the known pre-cutover tree/config into the existing external deployment state without checking out or resetting the current branch.

The operation must:

- preserve the current repository checkout and HEAD;
- preserve the external OAuth/session tree;
- replace only generated provider/configuration material required for the A/B surface;
- keep deployment-local hostname, workspace root, tunnel, and trust-profile values unchanged;
- be reversible by rerendering the current HEAD configuration;
- record enough evidence to prove which source commit produced the temporary generated config.

The actual bridge stop/start must run from a direct WSL terminal, user systemd manager, or another process outside the MCP process tree being replaced. It must never be initiated through the Shell provider belonging to the 1MCP process being stopped.

## Correction 1 — Pi acceptance

### Question

Does Pi deserve `CUTOVER_CONFIRMED` after correcting the incumbent baseline and proving the actual ChatGPT product path?

### What remains valid from the original Pi benchmark

The following evidence remains relevant:

- 21/21 mandatory boundary/execution cases passed against the provider implementation;
- trusted-dev tool surface fell from 15 legacy Files/Shell tools to four `dev` tools;
- normalized schema estimate fell from about 1,854 to 408 tokens;
- representative request arguments became smaller and more native;
- `dev.bash` preserves native Bash string semantics;
- non-zero exits retain `[exit N]` in the same result;
- over-limit output returns a bounded tail plus a recoverable full-output handle;
- workspace-relative Files paths avoid machine-specific absolute-path repetition;
- `dev` does not duplicate results in `structuredContent`.

### Benchmark correction

The previous `25,155 -> 344` ranged-read headline is only a Files-tool comparison. It is not the best incumbent harness comparison because the incumbent Shell can obtain the same middle range in one call.

The corrected baseline must compare each new primitive against the best practical incumbent operation available in the old complete harness, not necessarily the similarly named old tool.

For ranged source evidence, include at least:

```text
legacy Shell + sed/awk equivalent
vs
dev.read(path, offset, limit)
```

Record:

- request bytes/tokens;
- result bytes/tokens;
- wall time;
- correctness;
- cognitive translation debt, described qualitatively rather than converted into invented token numbers.

The previous whole-file filesystem comparison may remain documented as a Files-provider comparison but must not be presented as the best old-harness result.

### Real ChatGPT transport acceptance

The candidate must be exercised through:

```text
ChatGPT
  -> OAuth
  -> Cloudflare
  -> 1MCP
  -> dev provider
```

Required live disposable calls:

1. `dev.read` on repository text;
2. `dev.bash` with a harmless native command;
3. `dev.write` creating a disposable file;
4. `dev.edit` modifying that disposable file and returning one useful diff;
5. cleanup of the disposable fixture through an allowed mechanism after evidence capture.

Acceptance must verify the model-visible result shape seen through ChatGPT, not only direct stdio behavior:

- plain source/text for read;
- terminal-like TextContent for Bash;
- short creation acknowledgement for write;
- one useful diff for edit;
- no unexpected JSON execution record, embedded resource, or duplicate structured representation.

### Pi verdict

Final Pi verdict is:

```text
CUTOVER_CONFIRMED
or
REOPEN
```

`CUTOVER_CONFIRMED` requires:

- the corrected fair-baseline comparison to retain material ergonomic/context/reliability advantage overall;
- the real ChatGPT-path calls to behave as designed;
- no newly discovered correctness regression.

A single exaggerated historical metric does not by itself force `REOPEN`; the decision is based on the corrected evidence set.

## Correction 2 — CodeDB requalification

### Reclassification

The previous CodeDB `REMOVE` verdict is reclassified as:

```text
RETEST_REQUIRED
```

The stale alternate-project index result is evidence of an adapter/architecture mismatch, not proof that CodeDB's rooted watcher is defective.

### Rooted operating model

The corrected experiment launches CodeDB with the repository itself as the MCP root:

```text
codedb <repository-root> mcp
```

Ordinary calls target that rooted repository and omit the per-call `project` override.

The per-call `project` field may still be tested separately as an alternate-project snapshot capability, but it must not be used as evidence for rooted watcher freshness.

### Freshness acceptance

Against disposable files or guarded reversible edits, verify:

1. initial search/index correctness;
2. external edit to an already indexed file;
3. external creation of a new source file;
4. watcher sequence/index state advances without an explicit `codedb_read` refresh;
5. new content becomes searchable;
6. replaced old content stops appearing where appropriate;
7. changes produced through Pi Files are observed by rooted CodeDB within the accepted polling window.

### Relevant comparison

Do not rerun the old comparison as `CodeDB vs 15 legacy Files/Shell tools` and treat that as the product decision.

The meaningful product comparison is:

```text
Pi-only development surface
vs
Pi development surface + correctly rooted CodeDB Code domain
```

Measure:

- additional advertised schema cost;
- task-level request/result tokens;
- calls/retries;
- wall time;
- repository-orientation/navigation quality;
- freshness reliability;
- whether CodeDB materially reduces broad Shell search/read evidence;
- whether CodeDB creates enough value to justify another visible domain.

### Multi-repository constraint

The workspace root contains multiple repositories while CodeDB's best freshness semantics are project-rooted.

Do not immediately build a router.

First prove the value of one correctly rooted CodeDB process for a representative repository. If it wins, the next decision may be:

```text
KEEP
REMOVE
ROUTER_EXPERIMENT
```

`ROUTER_EXPERIMENT` means design a small repository-to-rooted-CodeDB process manager only after rooted CodeDB has independently proven useful.

A router must not expose a large new model-facing catalog merely to solve process routing.

## Correction 3 — GCF verdict repair

### Generic profile

For arbitrary JSON, the relevant pinned commands are:

```text
gcf encode-generic
gcf decode-generic
```

The existing diagnostic already establishes exact round-trip fidelity on the three captured CodeDB JSON values.

Therefore generic GCF must not be described as incompatible.

Its correction-phase verdict is decided between:

```text
NOT_MATERIAL
PROMISING
```

using faithful generic-profile payloads and the same tokenizer/latency methodology.

Current evidence suggests `NOT_MATERIAL` for the paired CodeDB outputs because CodeDB's native text was smaller, even though generic GCF improved over compact JSON for two larger JSON payloads.

### Graph profile

The commands:

```text
gcf encode
gcf decode
```

are the graph profile and must be tested only on genuinely graph-shaped evidence.

The earlier arbitrary-JSON round-trip failure is a benchmark/profile mismatch, not a valid graph-profile product verdict.

Graph-profile correction verdict is:

```text
PROMISING
NOT_MATERIAL
INCOMPATIBLE
```

only after testing a representative graph-shaped payload such as symbol/caller/dependency evidence containing real nodes/edges/relationships.

If no graph-shaped model-facing payload is actually worth introducing into the harness, record that the graph experiment is deferred rather than manufacturing a graph representation solely to benchmark the codec.

## Evidence discipline

Raw captures remain outside Git under bridge-owned ignored state.

Tracked benchmark documents may contain:

- aggregate counts;
- commands with machine-specific paths sanitized;
- semantic findings;
- selected short non-sensitive excerpts;
- exact candidate/version identities.

They must not contain OAuth tokens, dynamic client secrets, or live session records.

For every candidate decision, distinguish:

```text
observed fact
inference
policy decision
```

Do not convert unobservable ChatGPT internal accounting into asserted billing/context numbers. Offline tokenizers remain common estimators only.

## Live-state safety

The correction phase must not lose the now-working OAuth continuity fix.

Before and after each temporary provider-composition change, verify:

```text
systemd service ownership
127.0.0.1:3050 listener
local readiness
public readiness
issues: 0
OAuth/session directory remains present
```

Provider composition changes require ChatGPT Actions Refresh and a fresh session before client-facing acceptance.

If a temporary A/B deployment fails, rerender current HEAD and restore the current product candidate rather than editing generated config manually.

## Final correction-phase outputs

The phase must end with explicit independent verdicts:

```text
Pi:
  CUTOVER_CONFIRMED | REOPEN

CodeDB:
  KEEP | REMOVE | ROUTER_EXPERIMENT

GCF generic:
  NOT_MATERIAL | PROMISING

GCF graph:
  PROMISING | NOT_MATERIAL | INCOMPATIBLE | DEFERRED_NO_GRAPH_PAYLOAD
```

Then one final deployment decision is made from those results.

Examples include:

```text
trusted-dev = dev
trusted-dev = dev + Code
```

The old generic filesystem/shell providers are evaluation incumbents only. Their temporary restoration does not imply that they should remain in the final architecture.

## Success criteria

The correction phase succeeds when:

1. Pi has been accepted or reopened using a fair old-harness baseline and real ChatGPT calls.
2. CodeDB's rooted watcher has been tested independently of alternate-project routing.
3. CodeDB value is judged against the Pi-era harness, not the obsolete original incumbent surface.
4. GCF generic and graph profiles have separate, correctly scoped verdicts.
5. No candidate is removed solely because of an unclassified adapter/benchmark failure.
6. Git history remains clean and intentional; temporary evaluation deployment state does not create artificial revert commits.
7. The final live composition is reproducible from tracked source and external deployment configuration.
