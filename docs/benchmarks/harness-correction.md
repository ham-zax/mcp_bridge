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

### Current product verdict

**CodeDB = RETEST_REQUIRED pending Pi-era value comparison.** Rooted freshness is now `PASS`; Task 5 must decide whether the extra Code domain is worth its incremental schema/context cost and whether one fixed repository root is sufficient.

## GCF correction

The corrected generic/graph profile evaluation has not yet executed. Generic GCF is not classified incompatible; graph GCF has not yet received a fair graph-shaped evaluation.

## Final verdicts

No correction-phase final verdict has been issued yet. The phase will end with independent Pi, CodeDB, GCF-generic, and GCF-graph decisions before the final provider composition is deployed.
