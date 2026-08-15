# Native Harness Correction Report

**Date:** 2026-08-15
**Spec:** `docs/superpowers/specs/2026-08-15-native-harness-correction-phase-design.md`
**Product implementation baseline:** `41491ac`
**Temporary A/B provider source:** `e99579a`

Raw machine-specific evidence is kept outside Git under the bridge-owned correction benchmark state directory.

## Failure-classification rule

Before a KEEP/REMOVE-style verdict, every failed gate is classified as one of:

```text
candidate failure
adapter / integration failure
benchmark / experiment-design failure
```

The classified failure must then receive an independent reproduction targeted at that layer.

## Live A/B activation

Observed temporary deployment activation:

- rendering Git revision: `1ba0d52` (`test: add reproducible provider A/B renderer`);
- provider semantics source: `e99579a`;
- implementation baseline protected from revert/amend: `41491ac`;
- provider set before activation: `dev`;
- provider set after activation: `dev`, `filesystem`, `shell`;
- current lifecycle/state machinery remained authoritative; no historical setup/start/stop code was executed;
- the cutover ran from a detached user-systemd one-shot outside the MCP process tree;
- local health after activation: ready;
- public health after activation: ready;
- bridge status after activation: `issues: 0`;
- durable inbound OAuth identity records: 9 before, 9 after, with an empty filename-set diff;
- transient Streamable HTTP transport sessions were not treated as continuity state;
- current ChatGPT connector discovery exposes 19 development tools: 4 `dev`, 14 legacy `filesystem`, and 1 legacy `shell`; no CodeDB or `ui_experiment_*` actions are present.

The temporary A/B deployment is evaluation state only. Product source still carries the provisional Pi cutover implementation baseline beneath the correction commits.

## Pi correction

### Observed facts

- The corrected one-call ranged baseline is legacy Shell `bash -c` + `sed`, not the generic filesystem whole-file fallback.
- Legacy Shell range request/result: 35 / 329 estimated `o200k_base` tokens; direct wall time 7.53 ms.
- Pi `dev.read` range request/result: 22 / 344 estimated tokens; direct wall time 5.85 ms.
- Pi therefore reduces request tokens by 37.1% on this task but returns 15 more result tokens because it includes a continuation hint.
- The historical `25,155 -> 344` result remains valid only as generic Files whole-file fallback vs Pi ranged read, not as the best complete incumbent-harness comparison.
- Fresh real ChatGPT-path calls passed for `dev.read`, `dev.bash`, `dev.write`, and `dev.edit`.
- The public-path result shapes were native text: source + continuation hint, terminal-like Bash text, concise create acknowledgement, and one compact edit diff.
- Verification read returned the edited content; cleanup succeeded; no recovery call was needed.
- No unexpected JSON execution record, embedded resource, or duplicated structured representation was observed.

### Inference

The corrected range result removes the strongest token-saving claim for `dev.read`, but Pi still materially simplifies the model-facing tool/schema surface and request language while preserving execution failures/truncation evidence that the legacy Shell loses.

### Policy decision

**Pi = CUTOVER_CONFIRMED.** The decision rests on the complete corrected evidence set: 21/21 mandatory semantics, 78% schema-token reduction, smaller/native requests, better shell evidence, no duplicated Files structured results, and successful real ChatGPT-path read/bash/write/edit behavior.

## CodeDB requalification

### Observed facts

- Exact binary verified: CodeDB `0.2.5840`, SHA-256 `f784c931b053031ca9928173828130c504f769c9e94bf5c2666ab71091747966`.
- Corrected launch shape: `codedb <repository-root> mcp`; ordinary calls omitted `project`.
- Rooted external edit/new-file gate passed: sequence `1 -> 3`, files `1 -> 2`, new edit/create markers found, replaced old marker absent, no `codedb_read` refresh.
- Pi integration gate passed: Pi `dev.edit` advanced rooted CodeDB `seq 1 -> 2`; Pi restore advanced `2 -> 3`; search followed both transitions without `project` or explicit refresh reads.
- Alternate-project diagnostic reproduced the earlier failure shape: sequence stayed `2 -> 2`, changed marker count `0`, old marker count `1`.

### Classification

The old stale-index failure is **adapter / architecture mismatch** evidence for neutral-root + per-call alternate-project routing. It is not evidence against the primary rooted watcher.

### Pi-era value comparison

- Pi-only normalized schema: 4 tools / 408 estimated tokens.
- Rooted CodeDB adds 10 tools / 2,368 estimated schema tokens; combined surface is 14 tools / 2,774 tokens.
- On the same eight-call semantic-search trace, Pi-only used 232 request + 9,618 result tokens; Pi + rooted CodeDB used 212 request + 5,115 result tokens.
- Including the full advertised schema cost, combined accounting was 10,258 tokens for Pi-only versus 8,101 for Pi + CodeDB: CodeDB reduced the estimate by 21.0%.
- CodeDB direct provider wall time was 504 ms versus 53 ms for Pi-only; the added latency was material proportionally but about 451 ms absolute.
- A natural `search_codebase` first-search diagnostic used 16 request / 592 result tokens with rooted CodeDB versus 33 / 1,255 through Pi `rg`.
- `codedb_context(task)` itself was noisy and did not identify the real request chain, so the value case is ranked search/bounded reads/caller navigation rather than blind reliance on context composition.
- Representative-repository Pi create/edit freshness passed again: rooted CodeDB advanced `1080 -> 1081 -> 1082` without `project` or `codedb_read`.
- The configured workspace contained 30 top-level Git repositories at measurement time; one fixed root is therefore insufficient.

### Policy decision

**CodeDB = ROUTER_EXPERIMENT.** Rooted freshness and navigation compression are good enough to continue, but CodeDB should not return to the final live product as one fixed-root provider. A later Code-domain experiment should route repository selection to separate rooted CodeDB processes while keeping the model-facing surface small.

## GCF correction

### Observed facts

- Pinned CLI `gcf-python==2.6.0` explicitly maps `encode/decode` to the graph profile and `encode-generic/decode-generic` to arbitrary JSON.
- Fresh generic-profile reruns round-tripped the context/search/symbol captures exactly.
- Generic token counts were 1,871 / 882 / 78 versus paired native CodeDB text at 784 / 512 / 60.
- Generic encode/decode fresh-process times were about 0.04-0.05 s in the correction rerun.
- The current harness has no natural model-facing graph JSON: Pi emits native text, CodeDB dependency/caller output is native text, and correction captures contained no natural top-level `nodes`, `edges`, or `symbols` payload.
- The historical arbitrary-JSON failure through `gcf encode` is therefore a benchmark/profile mismatch, not a graph-codec incompatibility verdict.

### Policy decisions

**GCF generic = NOT_MATERIAL.** It is faithful and can improve compact JSON, but native text remains materially smaller on the paired workload.

**GCF graph = DEFERRED_NO_GRAPH_PAYLOAD.** Do not synthesize a graph solely to benchmark the codec; retest if a future model-facing feature naturally produces genuine graph data.

## Final verdicts

No correction-phase final verdict has been issued yet. The phase will end with independent Pi, CodeDB, GCF-generic, and GCF-graph decisions before the final provider composition is deployed.
