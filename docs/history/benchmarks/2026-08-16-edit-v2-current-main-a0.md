# Edit V2 Current-Main A0 Baseline

**Model-facing baseline:** `9098c9fcc9088d3ddf31e30f7df2a9b18a86c1b1` (commit `9098c9f`, before Edit V2)
**Capture worktree head:** `65dd95ab3baf4c33d5bf99b6d3bf30d9a3b09d8c` (plan-only commit on top; provider output unchanged)
**Branch:** `feature/edit-v2-current-main`
**Node:** `v24.19.0`
**Tokenizer:** `tiktoken==0.13.0`, `o200k_base`

This is an offline estimate of harness-contributed model-visible MCP catalog payload, not billing or complete hidden ChatGPT context accounting. No provider/model-facing source was modified before this capture.

## Catalog baseline

| Provider | Tools | Normalized bytes | Estimated tokens |
| --- | ---: | ---: | ---: |
| dev | 6 | 6781 | 1510 |
| code | 3 | 2841 | 576 |
| terminal | 7 | 4453 | 1002 |
| **Total** | **16** | **14075** | **3088** |

Current Edit V1 contributes **811 bytes / 178 estimated tokens** as a normalized tool object. Its root input schema requires `path` and `edits`; it has no grouped `targets` field.

## Fresh baseline qualification

- Code Router: **30/30 PASS**
- Pi Dev: **176/176 PASS**
- Terminal: **46/46 PASS**
- Harness: **6/6 PASS** (including nested personal-toolbox **9/9**)
- Personal toolbox standalone: **PASS**
- `git diff --check`: **PASS**

The Pi suite is known to have a timing-sensitive wait test from prior reviews, but this A0 run reproduced a fully green **176/176** result. No wait behavior was changed.

## Provenance and interpretation

The current personal tool catalog is Dev 6 + Code 3 + Terminal 7. The raw normalized tool objects are preserved in the companion JSON artifact. Private environment values, deployment credentials, OAuth state, and live secrets are not captured.

These A0 values are the immutable control for later A1 schema/catalog measurements. A0a repeated Edit V1 and A0b one-call `apply_patch` must use this same baseline implementation; A1 alone uses Edit V2.
