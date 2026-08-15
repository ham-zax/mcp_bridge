# Structured-Format Screen — Native / JSON / TOON / GCF

**Date:** 2026-08-15  
**TOON:** `@toon-format/cli@4.1.1`  
**GCF:** `gcf-python==2.6.0` / GCF spec 3.5.3  
**Tokenizer:** `tiktoken==0.13.0`, `o200k_base`

## Verdicts

```text
TOON = NOT_MATERIAL
GCF  = INCOMPATIBLE under the plan's graph-profile command
```

Additional diagnostic: GCF's generic profile round-tripped all three payloads, but still used more tokens than CodeDB's native model-facing text. Therefore the profile bug does not create a practical reason to insert stateless GCF into this harness now.

These verdicts are independent of the CodeDB `REMOVE` decision.

## Actual payloads

Three real CodeDB payload pairs were captured from `$HOME/repo/satori`:

| Payload | Structure class | Native pair | JSON source |
|---|---|---|---|
| `codedb_context` task response | `irregular_mixed` | compact task/context text | schema-versioned context object with heterogeneous sections |
| `codedb_symbol(runSearchExecution)` | `uniform_records` | one symbol record | object containing a uniform `results` array |
| `codedb_search(handleSearchCode)` | `uniform_records` | 20 ranked search results | object containing a uniform 20-record `results` array |

The search pair omits `scope=true` because CodeDB explicitly returns `unsupported` for `format=json` with `scope=true`; native and JSON captures therefore use the same successful request without scope annotation.

Native prose was never wrapped in invented JSON.

Raw captures and generated representations are retained outside Git under:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/mcp-dev-bridge/benchmarks/structured/
```

## Fidelity

| Payload | TOON round-trip | planned GCF graph round-trip | GCF generic diagnostic |
|---|---|---|---|
| context | exact | **failed** | exact |
| search | exact | **failed** | exact |
| symbol | exact | **failed** | exact |

No values were coerced to make a codec pass.

## Bytes and shared-tokenizer counts

| Payload | Representation | Bytes | `o200k_base` tokens |
|---|---|---:|---:|
| context | native text | 3,206 | **784** |
| context | pretty JSON | 12,708 | 3,183 |
| context | compact JSON | 9,515 | 2,389 |
| context | TOON | 8,002 | 2,053 |
| context | GCF graph | 34 | 11* |
| context | GCF generic diagnostic | 6,845 | 1,871 |
| search | native text | 2,287 | **512** |
| search | pretty JSON | 5,353 | 1,485 |
| search | compact JSON | 4,284 | 1,066 |
| search | TOON | 3,386 | 903 |
| search | GCF graph | 47 | 14* |
| search | GCF generic diagnostic | 3,360 | 882 |
| symbol | native text | 252 | **60** |
| symbol | pretty JSON | 383 | 120 |
| symbol | compact JSON | 282 | 73 |
| symbol | TOON | 248 | 73 |
| symbol | GCF graph | 47 | 14* |
| symbol | GCF generic diagnostic | 265 | 78 |

`*` The tiny graph-profile results are **not compression wins**. They fail exact round-trip because the graph profile projected non-graph CodeDB values into graph-shaped data and discarded the original structure.

### Relative to compact JSON

| Payload | TOON token delta | GCF generic diagnostic token delta |
|---|---:|---:|
| context | -14.1% | -21.7% |
| search | -15.3% | -17.3% |
| symbol | 0.0% | +6.8% |

### Relative to the existing native CodeDB response

| Payload | TOON token overhead | GCF generic diagnostic token overhead |
|---|---:|---:|
| context | **+161.9%** | +138.6% |
| search | **+76.4%** | +72.3% |
| symbol | **+21.7%** | +30.0% |

For every paired payload, the existing native model-facing text is the smallest faithful representation tested.

## Codec latency

Times are seconds for fresh CLI processes. The first pass was labeled cold and the immediate second pass warm without cache clearing, as specified by the plan.

| Payload | Codec/op | cold | warm |
|---|---|---:|---:|
| context | TOON encode | 2.08 | 1.40 |
| context | TOON decode | 2.07 | 1.41 |
| context | GCF graph encode | 0.05 | 0.05 |
| context | GCF graph decode | 0.05 | 0.05 |
| context | GCF generic encode | 0.06 | 0.05 |
| context | GCF generic decode | 0.06 | 0.05 |
| search | TOON encode | 2.04 | 2.06 |
| search | TOON decode | 1.40 | 1.36 |
| search | GCF graph encode | 0.05 | 0.05 |
| search | GCF graph decode | 0.05 | 0.05 |
| search | GCF generic encode | 0.05 | 0.05 |
| search | GCF generic decode | 0.05 | 0.05 |
| symbol | TOON encode | 1.36 | 1.36 |
| symbol | TOON decode | 1.35 | 1.37 |
| symbol | GCF graph encode | 0.05 | 0.05 |
| symbol | GCF graph decode | 0.05 | 0.06 |
| symbol | GCF generic encode | 0.05 | 0.05 |
| symbol | GCF generic decode | 0.05 | 0.05 |

TOON CLI startup is expensive enough that shelling out per model result would be unattractive even before considering that it loses to native text. A future library-level benchmark could isolate process-startup cost, but the current payload evidence gives no reason to put TOON in the live bridge.

## TOON disposition

TOON is lossless on all three actual payloads and does reduce compact JSON by about 14–15% tokens on the two larger values. However, the relevant model-facing baseline is not compact JSON: it is CodeDB's existing native text.

TOON used 21.7% to 161.9% **more** tokens than native text across all three paired payloads and added substantial CLI encode latency.

**TOON = NOT_MATERIAL.**

## GCF disposition and plan-profile issue

The implementation plan specifies:

```bash
gcf encode < input.json
gcf decode < output.gcf
```

In `gcf-python==2.6.0` those commands use the graph profile. The three real CodeDB payloads are not graph payloads, and exact round-trip failed for all three. Under the plan's explicit fidelity rule, this is:

**GCF = INCOMPATIBLE under the planned graph-profile command.**

This is a profile mismatch rather than proof that every GCF profile is incapable of representing the data. The package also exposes:

```bash
gcf encode-generic
gcf decode-generic
```

and that generic profile round-tripped all three real values exactly. It reduced compact JSON tokens for the two larger payloads, but still used 30.0% to 138.6% more tokens than native text across the three paired payloads.

Therefore two facts should be kept separate:

1. the plan's graph-profile command is not a valid generic-JSON GCF benchmark and should be corrected before any future GCF codec claim;
2. even the fair generic-profile diagnostic is **not material relative to native CodeDB text** on this workload, so no live stateless GCF insertion is justified by these captures.

The architecture spec and implementation plan were left read-only during execution, as required.
