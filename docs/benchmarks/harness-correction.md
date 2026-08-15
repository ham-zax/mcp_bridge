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

The corrected Pi experiment has not yet executed. The prior Pi verdict remains provisional until the best-incumbent ranged-read baseline is corrected and fresh ChatGPT-path `read`, `bash`, `write`, and `edit` calls pass.

## CodeDB requalification

The rooted CodeDB requalification has not yet executed. The prior stale alternate-project result remains classified `RETEST_REQUIRED`, not a final CodeDB removal verdict.

## GCF correction

The corrected generic/graph profile evaluation has not yet executed. Generic GCF is not classified incompatible; graph GCF has not yet received a fair graph-shaped evaluation.

## Final verdicts

No correction-phase final verdict has been issued yet. The phase will end with independent Pi, CodeDB, GCF-generic, and GCF-graph decisions before the final provider composition is deployed.
