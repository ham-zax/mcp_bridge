# Edit V2 Current-Main Qualification

**Control:** `9098c9f` for both repeated Edit V1 (A0a) and one-call `apply_patch` (A0b).
**Candidate implementation:** `41ad5b2` (A1).
**Method:** deterministic offline capability/cost mechanics; this is not causal evidence of GPT-5.6 Sol routing behavior.

## Result

`OFFLINE_CAPABILITY_VERDICT = CONTINUE_TO_FRESH_MODEL_ROUTING_EVAL`

All three strategies completed every ordinary workload correctly on first attempt. Edit V2 materially improves repeated exact-edit ergonomics and is mechanically competitive with `apply_patch` once multi-target success output is compact. Its remaining adoption question is whether the structured `targets[].edits[]` contract reduces model translation mistakes versus constructing patch grammar for exact-known multi-file work.

## Multi-file frontier

| Workload | Strategy | Calls | Visible tokens | Wall ms | Correct |
|---|---|---:|---:|---:|---|
| two-targets | A0a-edit-v1 | 2 | 96 | 3.53 | yes |
| two-targets | A0b-apply-patch | 1 | 76 | 3.17 | yes |
| two-targets | A1-edit-v2 | 1 | 72 | 3.38 | yes |
| six-targets | A0a-edit-v1 | 6 | 288 | 10.30 | yes |
| six-targets | A0b-apply-patch | 1 | 192 | 8.29 | yes |
| six-targets | A1-edit-v2 | 1 | 196 | 9.42 | yes |
| thirty-two-targets | A0a-edit-v1 | 32 | 1536 | 52.69 | yes |
| thirty-two-targets | A0b-apply-patch | 1 | 946 | 39.92 | yes |
| thirty-two-targets | A1-edit-v2 | 1 | 1002 | 41.34 | yes |

Relative visible-token deltas for Edit V2:

- `two-targets`: V2 vs repeated V1 `-25.0%`; V2 vs apply_patch `-5.3%`.
- `six-targets`: V2 vs repeated V1 `-31.9%`; V2 vs apply_patch `+2.1%`.
- `thirty-two-targets`: V2 vs repeated V1 `-34.8%`; V2 vs apply_patch `+5.9%`.

## Full ordinary-workload results

| Workload | A0a V1 total tokens | A0b patch total tokens | A1 V2 total tokens | All correct |
|---|---:|---:|---:|---|
| one-target-one-edit | 48 | 47 | 52 | yes |
| one-target-multiple-edits | 65 | 53 | 69 | yes |
| two-targets | 96 | 76 | 72 | yes |
| six-targets | 288 | 192 | 196 | yes |
| thirty-two-targets | 1536 | 946 | 1002 | yes |
| exact-removal | 44 | 39 | 49 | yes |
| crlf | 48 | 44 | 52 | yes |
| bom-preserved | 44 | 41 | 48 | yes |

## Safety probes

- `A0a-edit-v1`: concurrent same-anchor conflict safe = `true`; already-aborted cancellation safe = `true`.
- `A0b-apply-patch`: concurrent same-anchor conflict safe = `true`; already-aborted cancellation safe = `true`.
- `A1-edit-v2`: concurrent same-anchor conflict safe = `true`; already-aborted cancellation safe = `true`.

Edit V2 additionally has deterministic implementation tests for all-target zero-mutation preflight, canonical-alias rejection, invalid UTF-8/non-regular targets, same-descriptor inode/snapshot revalidation, positional write/truncate, uncertain write failures, partial outcomes, overlapping multi-path batches, and cancellation on both sides of the mutation barrier. Those are implementation-safety evidence, not advantages attributed to this simple three-way safety probe.

## Permanent catalog cost

- Total personal normalized catalog: `14,075 -> 14,159` bytes (`+84`).
- Estimated `o200k_base`: `3,088 -> 3,113` tokens (`+25`).
- Edit tool object: `811 -> 895` bytes; `178 -> 203` estimated tokens.
- Code and Terminal catalog payloads are unchanged.

## Interpretation

- Repeated Edit V1 is no longer attractive for exact-known multi-file work: V2 collapses multiple connector calls to one and reduces visible request/result volume substantially as target count grows.
- `apply_patch` remains a strong incumbent. Its compact textual grammar is slightly cheaper at 6 and 32 targets, while V2 is slightly cheaper at 2 targets after compact multi-target rendering.
- The remaining distinction is semantic and reliability-oriented: V2 represents exact replacements as structured `{path, oldText, newText}` records and applies stronger exact-edit guards; `apply_patch` represents the same task by translating it into patch grammar.
- Therefore this offline experiment supports continuing to the fresh-model routing/error experiment. It does **not** by itself prove that GPT-5.6 Sol makes fewer mistakes with V2.
- No new MCP action, compatibility shim, PBT dependency, profile prompt, or routing skill is justified by this offline measurement alone.

## Reproducibility notes

- A0a and A0b use the same detached `9098c9f` control checkout.
- `apply_patch` receives minimal exact-context hunks generated from the same known old/new replacements; it is not intentionally handicapped.
- Request tokens are for compact `{name,arguments}` JSON envelopes; result tokens are native rendered text equivalents.
- Tokenization uses `tiktoken==0.13.0` with `o200k_base` via `uv`.
- RSS deltas are noisy process-level diagnostics. Direct lock-hold instrumentation was intentionally not added; the 32-target V2 wall time is recorded without creating benchmark-only production hooks.
