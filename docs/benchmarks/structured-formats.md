# Structured-Format Screen — Native / JSON / TOON / GCF

**Date:** 2026-08-15  
**TOON:** `@toon-format/cli@4.1.1`  
**GCF:** `gcf-python==2.6.0` / GCF spec 3.5.3  
**Tokenizer:** `tiktoken==0.13.0`, `o200k_base`

## Corrected verdicts

```text
TOON        = NOT_MATERIAL
GCF generic = NOT_MATERIAL
GCF graph   = DEFERRED_NO_GRAPH_PAYLOAD
```

The correction phase confirmed that `gcf encode/decode` is specifically the graph profile, while arbitrary JSON belongs on `encode-generic/decode-generic`. The earlier graph-profile failure on ordinary CodeDB JSON was therefore a benchmark/profile mismatch, not a general GCF incompatibility result.

Fresh generic-profile reruns round-tripped all three arbitrary-JSON captures exactly. Generic GCF still used materially more tokens than the paired native CodeDB model-facing text, so there is no reason to insert it into the current bridge.

No natural model-facing graph JSON exists in the current harness to test the graph profile fairly. The graph profile is therefore deferred rather than declared incompatible. These format verdicts are independent of the corrected CodeDB `ROUTER_EXPERIMENT` decision.

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

| Payload | TOON round-trip | historical wrong-profile graph attempt | GCF generic round-trip |
|---|---|---|---|
| context | exact | failed as expected for non-graph input | exact |
| search | exact | failed as expected for non-graph input | exact |
| symbol | exact | failed as expected for non-graph input | exact |

No values were coerced to make a codec pass.

## Bytes and shared-tokenizer counts

| Payload | Representation | Bytes | `o200k_base` tokens |
|---|---|---:|---:|
| context | native text | 3,206 | **784** |
| context | pretty JSON | 12,708 | 3,183 |
| context | compact JSON | 9,515 | 2,389 |
| context | TOON | 8,002 | 2,053 |
| context | historical wrong-profile GCF graph output | 34 | 11* |
| context | GCF generic | 6,845 | 1,871 |
| search | native text | 2,287 | **512** |
| search | pretty JSON | 5,353 | 1,485 |
| search | compact JSON | 4,284 | 1,066 |
| search | TOON | 3,386 | 903 |
| search | historical wrong-profile GCF graph output | 47 | 14* |
| search | GCF generic | 3,360 | 882 |
| symbol | native text | 252 | **60** |
| symbol | pretty JSON | 383 | 120 |
| symbol | compact JSON | 282 | 73 |
| symbol | TOON | 248 | 73 |
| symbol | historical wrong-profile GCF graph output | 47 | 14* |
| symbol | GCF generic | 265 | 78 |

`*` The tiny historical graph-profile results are **not compression wins**. They came from feeding non-graph arbitrary JSON to a graph codec and discarded the original structure; they are retained only as evidence of the benchmark/profile mismatch.

### Relative to compact JSON

| Payload | TOON token delta | GCF generic token delta |
|---|---:|---:|
| context | -14.1% | -21.7% |
| search | -15.3% | -17.3% |
| symbol | 0.0% | +6.8% |

### Relative to the existing native CodeDB response

| Payload | TOON token overhead | GCF generic token overhead |
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

## GCF disposition and profile correction

The pinned `gcf-python==2.6.0` CLI explicitly defines:

```text
gcf encode / decode                 graph profile
gcf encode-generic / decode-generic arbitrary-JSON generic profile
```

### Generic profile

The correction phase reran all three existing arbitrary-JSON captures with `encode-generic/decode-generic` and strict sorted-JSON equality. All three round trips were exact.

Fresh measurements:

| Payload | Compact JSON tokens | GCF generic tokens | Native text tokens | Generic encode cold/warm | Generic decode cold/warm |
|---|---:|---:|---:|---:|---:|
| context | 2,389 | 1,871 | **784** | 0.04 / 0.04 s | 0.05 / 0.05 s |
| search | 1,066 | 882 | **512** | 0.04 / 0.04 s | 0.04 / 0.04 s |
| symbol | 73 | 78 | **60** | 0.04 / 0.04 s | 0.04 / 0.04 s |

Observed fact: generic GCF is lossless and reduces compact JSON for the two larger payloads, but native model-facing text remains 30.0% to 138.6% smaller in token count across the paired workload.

Policy decision: **GCF generic = NOT_MATERIAL** for the current bridge.

### Graph profile

The correction phase searched the rooted CodeDB/Pi evidence for a natural model-facing graph JSON payload. None exists. `dev` intentionally emits native text; CodeDB caller/dependency tools also render native text, and a live `codedb_deps` result was dependency prose rather than JSON. Correction captures contained no natural top-level `nodes`, `edges`, or `symbols` graph payload.

The old `gcf encode` failures therefore answer only this question: "what happens if arbitrary non-graph JSON is fed to the graph profile?" They do not establish graph-profile incompatibility with genuine graph data.

Creating a synthetic graph solely to make the codec benchmarkable would violate the correction design. Policy decision: **GCF graph = DEFERRED_NO_GRAPH_PAYLOAD**.

If a future Code-domain/Terminal feature naturally exposes a graph-shaped model-facing payload, graph GCF can be benchmarked then against that real representation.
