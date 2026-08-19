# WebSession Layered Adapter Design

**Status:** accepted architecture. The controlled transport probe is the first implementation step.

## Goal

Expose the existing private MCP harness to constrained AI runtimes through one durable server-side adapter without creating separate GLM and Qwen implementations.

The adapter has two client-facing transport profiles:

- a universal path-only HTTPS GET profile that remains sufficient for correctness;
- an optional JSON/HTTP profile for runtimes that directly prove POST and header support.

Both profiles normalize immediately into one operation model. Client runtime state is never durable state.

## Existing system boundary

The current deployment remains authoritative for MCP execution:

```text
Cloudflare Tunnel
  -> 1MCP :3050
      -> Dev
      -> Code       (personal only)
      -> Terminal   (personal only)
```

The adapter is a sibling HTTP service, not another MCP composition layer:

```text
                         Cloudflare Tunnel
                         /               \
                    adapter paths      existing MCP/OAuth paths
                         |                    |
                    adapter :3051          1MCP :3050
                         |                    |
                         +---- MCP client ----+
                                              |
                                      existing providers
```

Cloudflare path ingress should route only the adapter path prefix to the adapter. Existing `/mcp`, OAuth, metadata, health, and provider behavior must continue to route to 1MCP unchanged.

The adapter is strictly opt-in. The existing `bin/start`, `bin/stop`, `bin/status`, watchdog, and `mcp-dev-bridge.service` remain authoritative only for the existing 1MCP bridge. They must not start, stop, require, or report the adapter. The adapter is started and stopped only by an explicit adapter command. Public adapter ingress is also a separate operator action; starting the local adapter must not rewrite Cloudflare configuration.

## Core invariant

There is one authorization, policy, idempotency, operation, execution, result, and recovery path:

```text
universal GET ----\
                   > normalize -> submit_operation(...) -> one durable operation
enhanced JSON ----/
```

Conceptually:

```text
submit_operation(
    principal,
    client_nonce,
    normalized_request,
    source_profile
) -> operation_snapshot
```

`source_profile` may be retained for diagnostics and response formatting. It must not change authorization, mutation classification, confirmation requirements, execution semantics, or recovery behavior.

## Technology choice

Use the repository's existing runtime before adding another stack:

- Node.js 24;
- built-in `node:http` for the adapter HTTP surface;
- built-in `node:sqlite` for small durable local state;
- existing `@modelcontextprotocol/sdk` for MCP client transport;
- existing Cloudflare Tunnel for public HTTPS routing;
- existing repository state/process conventions where they do not couple adapter lifetime to the main bridge.

Do not add FastAPI, Starlette, a second Python runtime, an external queue, a reverse proxy, Redis, or another database unless a demonstrated requirement later makes the existing facilities insufficient.

## Controlled transport evidence

The controlled probe is now live on the optional adapter and public `/probe/*` ingress while the normal `/mcp` path remains on 1MCP. The probe surface is:

```text
GET /probe/request/{nonce}
GET /probe/echo-path/{payload}
GET /probe/delay/{seconds}
GET /probe/page/{nonce}
GET /probe/hit/{kind}/{nonce}
POST /probe/http/{nonce}
```

Origin evidence established these GLM properties for a session exposing a real model-readable direct-fetch tool:

- compact literal HTTPS GET is readable by the model and reaches the adapter through Cloudflare;
- the same product may expose weaker sessions with browser-navigation-only tools, so capability detection is per session and must not be inferred from model identity;
- 1, 2, 4, and 6 second delayed responses were readable;
- the 6 second case produced three origin GETs, proving that duplicate/retry delivery is possible and making idempotent submission mandatory;
- a plain-text page containing one instructed URL and two canary URLs produced only the page request plus the explicitly instructed request; no canary fetch was observed;
- an attempted 512-character generated path arrived as 344 bytes and an attempted 1024-character generated path arrived as 696 bytes, while larger attempts failed in the client/tool path before reaching the origin;
- an independent curl baseline carried 8192 path bytes through the same Cloudflare/origin route, so those GLM long-path failures are not an origin limit.

These measurements do not establish a hard GLM URL ceiling because the model did not generate the requested long literal payloads exactly. Start the universal encoded request budget at **256 base64url characters** and increase it only after a literal-URL boundary test proves a larger safe value. Keep the synchronous fast path at **2 seconds or less** even though 6 seconds was readable, because the longer request already demonstrated retry duplication.

`echo-path` returns only the received payload length and digest, not the payload. Probe request logs remain in private external state, not the Git checkout.

## Universal GET profile

This is the compatibility floor:

```text
GET /v1/about
GET /v1/s/{capability}/tools
GET /v1/s/{capability}/tool/{tool-name-b64}
GET /v1/s/{capability}/call/{client-nonce}/{request-b64url}
GET /v1/s/{continuation-capability}/op/{operation-id}
GET /v1/s/{continuation-capability}/op/{operation-id}/chunk/{chunk-number}
GET /v1/s/{confirmation-capability}/confirm/{operation-id}/{challenge}
```

Rules:

- HTTPS GET only;
- no required query strings, cookies, JavaScript, POST, click references, SSE, WebSockets, or runtime-local persistence;
- unpadded base64url for small UTF-8 JSON requests;
- strict one-pass decoding and schema validation;
- finite `text/plain; charset=utf-8` responses;
- absolute continuation URLs in visible text;
- application failures rendered as readable HTTP 200 state pages when disclosure is safe;
- security-critical invalid/hidden capability failures may use ordinary 403/404 behavior;
- capability-bearing responses use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

The implemented read-only universal slice currently uses a conservative 256-character encoded request budget, a 1900 ms fast response window, 8192-byte UTF-8-safe immutable result chunks, and a 1 MiB total normalized text-result bound. `/v1/about` is non-secret transport discovery; tool/schema discovery remains capability-scoped. Operator revocation blocks new submissions immediately, while an already-issued operation-scoped continuation remains intentionally read-only and independently usable for that operation's status/result.

Minimal request shape:

```json
{
  "version": 1,
  "tool": "tool_identifier",
  "arguments": {}
}
```

The request cannot override server policy, confirmation requirements, executor choice, TTLs, output limits, or tool classification.

## Enhanced JSON profile

This is the preferred transport when a runtime directly proves richer HTTP capabilities, while universal GET remains the compatibility floor. A controlled Qwen/Python run through this exact Cloudflare path proved model-visible GET responses, exact query preservation, programmatically generated paths through 8192 bytes, readable 404 status/body, and delayed responses through 12 seconds. The same assistant response also produced duplicate origin traffic beyond the explicitly requested single application calls: the query request appeared twice, the full path ladder appeared twice, and multiple delay-ladder requests were repeated. Whether those duplicates came from Qwen orchestration, repeated code invocations, or an HTTP layer is not material to the server contract: the enhanced profile also requires idempotent submission and must never assume one client-side Python call implies one origin delivery. The delayed probe endpoint sends only a final body, so that run does not establish incremental streaming capability. In the observed same-response Python environment, a file under `/home/workspace` survived a later code invocation while an in-memory variable did not; neither client-local mechanism is part of the durability model.

A focused controlled-origin POST then completed with HTTP 200 through `POST /probe/http/{nonce}`. The origin observed `Content-Type: application/json`, bearer-header presence without logging or echoing the bearer value, `Idempotency-Key` presence with exact nonce match, `X-WebSession-Probe` preservation, a 108-byte body with matching SHA-256, valid JSON parsing, and `probe_id` equal to the path nonce. This promotes POST, JSON body carriage, and the required custom-header carriage from prior client evidence to controlled-origin evidence. Transport probing is complete unless implementation later exposes a concrete unanswered capability question.

```http
POST /v1/calls
Authorization: Bearer <capability>
Idempotency-Key: <client-nonce>
Content-Type: application/json
```

It uses the same normalized request shape and the same `submit_operation(...)` path as universal GET.

The enhanced response may be JSON, but every created operation also receives an operation-scoped universal status URL. Losing the richer runtime must not lose the operation or its result.

The server does not infer a model or transport profile from User-Agent strings. Profile selection is explicit by endpoint and client capability.

## Capability model

Start with operator-issued opaque capabilities. Do not create a public self-registration or second browser identity system unless later product requirements demand one.

A capability record minimally contains:

- stable internal principal/capability ID;
- secure token hash; the raw bearer token is never stored;
- allowed profile(s);
- exact tool scope or policy scope;
- issue, expiry, and revocation timestamps;
- basic operation/rate limits when required.

The universal profile necessarily carries its bearer token in a URL path. Compensating controls are mandatory:

- high-entropy opaque tokens;
- short lifetime and narrow scope;
- TLS only;
- no raw capability values in application logs, exceptions, metrics, traces, or audit metadata;
- no third-party assets or redirects on capability pages;
- immediate revocation;
- operation-scoped read-only continuation capabilities after submission.

Cloudflare, as the HTTPS edge, can observe request paths. The deployment threat model must explicitly accept and configure that boundary rather than claiming URL capabilities are invisible to the edge provider.

## Idempotency

Exactly-once downstream effects cannot be promised for arbitrary MCP tools. The bridge must instead guarantee exactly-once operation creation and suppress avoidable duplicate dispatch.

Rules:

1. Normalize the request deterministically.
2. Compute a request hash from the normalized version, tool identifier, and canonical arguments.
3. Uniquely key operation creation by `(principal_id, client_nonce)`.
4. Same nonce + same request returns the existing operation.
5. Same nonce + different request becomes `nonce_conflict` and never silently changes meaning.
6. Confirmation updates the existing prepared operation; it does not create another operation.
7. A worker leases an operation atomically before dispatch.
8. Record dispatch intent before invoking MCP and completion afterward.

## Operation state

Use a small explicit state machine:

```text
received
  -> rejected
  -> confirmation_required
  -> queued

confirmation_required
  -> queued
  -> rejected
  -> expired

queued
  -> running
  -> expired

running
  -> completed
  -> tool_failed
  -> interrupted

interrupted
  -> queued            only when retry safety is proven
  -> unknown_outcome   when dispatch may already have taken effect
```

`unknown_outcome` is terminal for automatic recovery. A non-idempotent mutation with ambiguous dispatch must never be blindly retried.

Completed results and terminal operation identity are immutable except for retention metadata.

## Authorization ownership

1MCP remains the sole owner of OAuth scope validation, tool availability, and provider/tool authorization. WebSession must not add a second per-tool allowlist, read/write scope split, or argument policy. Its dedicated OAuth client lets the MCP SDK resolve scope from live 1MCP metadata (currently `tag:code tag:dev tag:terminal`, matching main), tool discovery mirrors the live 1MCP descriptors, and dispatch uses the exact upstream tool name and arguments.

The adapter capability is only a transport bearer for that existing authority. Capability expiry/revocation controls access to the adapter transport; it must not narrow or widen the underlying 1MCP tool semantics.

Transport-specific execution handling may differ by profile. Enhanced authenticated POST dispatches after durable submission. Universal GET requires proof-of-read confirmation before dispatch for every tool so the adapter does not infer which upstream tools are safe from GET prefetch/replay.

## Mutation confirmation

The universal confirmation flow must defend against automatic link fetching.

The preparation response returns the components separately:

```text
WEBSESSION-MCP-BRIDGE/1
state: confirmation_required
operation: <operation-id>

confirmation_base:
https://mcp.example/v1/s/<confirmation-capability>/confirm/<operation-id>/

challenge:
P7K4N9

summary:
<human-readable exact intended side effect>

instruction:
Construct confirmation_base + challenge and open that exact URL.
```

The server must not emit the complete executable universal confirmation URL in the preparation page. Fetching `confirmation_base` without the challenge is inert.

The challenge is operation-bound, short-lived, stored hashed, and consumed idempotently. Repeating a valid confirmation returns the same operation state without redispatch. The current implementation uses a 16-character base64url challenge with a 10-minute confirmation window; raw challenge text is not stored in SQLite and is reproducible only from private adapter key material plus the operation identity.

The enhanced profile may use `POST /v1/confirm/{operation-id}` to confirm an operation that was prepared through the universal GET transport, using the same operation-scoped confirmation capability and challenge. Normal enhanced `POST /v1/calls` submission does not add this GET-specific confirmation step.

Confirmation is a transport safeguard, not an authorization policy. Once confirmed, the exact requested tool name and arguments are sent to 1MCP, which remains responsible for authorization and availability.

## Durable state

Keep the first schema small. The minimum logical data is:

### Capabilities

- identity and token hash;
- allowed profiles/scopes;
- issue, expiry, revocation.

### Operations

- operation ID;
- principal ID;
- client nonce and request hash;
- source profile;
- normalized tool and arguments;
- policy class/version;
- state;
- confirmation challenge hash/expiry when needed;
- created/queued/started/lease/completed timestamps;
- dispatch intent/attempt metadata;
- safe terminal error category;
- result metadata.

### Result chunks

- operation ID and chunk number;
- content type;
- byte count and content hash;
- immutable text content or a private storage reference.

Do not add an event-sourcing layer, distributed queue, cache, or staged-blob subsystem until a demonstrated requirement needs it.

OAuth credentials remain in separate private state and never enter public operation records or result pages.

## Worker

For this single-host personal deployment, one bounded in-process worker using durable SQLite leases is sufficient initially.

Execution flow:

1. atomically lease one authorized queued operation;
2. re-check capability, policy, confirmation, and tool availability;
3. persist dispatch intent;
4. invoke the existing 1MCP gateway through the MCP SDK;
5. bound and normalize the finite result;
6. store the result or immutable text chunks;
7. persist the terminal state;
8. release the lease.

Start with low concurrency. Add another queue/process only if measured load or deployment topology requires it.

The adapter must use 1MCP as the execution gateway rather than independently owning or duplicating the Dev/Code/Terminal provider composition.

## Adapter-to-1MCP authentication

This is a required implementation boundary, not a detail to guess.

The current 1MCP OAuth server advertises authorization-code authentication and does not advertise `client_credentials`. The first implementation should therefore prefer a dedicated operator-authorized adapter OAuth client whose credential state is stored privately outside Git.

Do not bypass 1MCP OAuth or spawn a second provider composition merely to avoid this step. If the installed 1MCP/SDK combination cannot support a safe durable adapter credential, stop at that boundary and make the authentication topology an explicit design change rather than weakening it silently.

## Result representation

- Inline small UTF-8 text in completed operation responses.
- Split larger text on UTF-8-safe boundaries into immutable numbered chunks.
- Return absolute operation-scoped chunk URLs.
- Keep output bounded by total size, chunk size, and chunk count.
- Preserve structured data for the enhanced JSON profile when useful, while always retaining a readable universal text representation.
- Do not proxy unbounded SSE/WebSocket streams.
- Do not expose arbitrary binary output through the universal profile; return safe metadata/text or a deliberate owner-only artifact path.

## Error model

Keep four failure layers distinct:

```text
transport rejection  malformed route / HTTP or proxy limit / hidden invalid capability
bridge rejection     schema / nonce / policy / rate / expiry / unavailable tool
operation failure    MCP/OAuth/tool error after operation creation
client disappearance not an operation failure; server-owned work continues
```

Universal bridge and operation failures should normally be readable line-oriented text. Never return raw stack traces, upstream HTML, OAuth payloads, raw capabilities, secret-bearing paths, or unbounded downstream errors.

## Lifecycle and deployment ownership

The adapter adds one optional origin process beside a repository whose current lifecycle already supervises 1MCP, cloudflared, and a watchdog. Its lifetime is deliberately independent.

The implementation must define:

- adapter state root under the existing external bridge state hierarchy;
- adapter runtime/health state under the existing runtime hierarchy;
- explicit adapter-only start/stop/status behavior;
- Cloudflare path ingress to the adapter while preserving existing 1MCP routes;
- adapter-local health reporting;
- rollout and rollback without deleting 1MCP OAuth/session state.

The main bridge lifecycle must remain unchanged:

```text
bin/start / bin/stop / bin/status
  -> 1MCP + cloudflared + watchdog only

bin/adapter start|stop|status
  -> optional adapter only
```

Do not install or enable an adapter user-systemd unit in the initial implementation. If automatic adapter startup is ever desired, it requires a separate explicit operator decision; it must not be inherited from `mcp-dev-bridge.service` or personal bootstrap startup consent.

Starting the adapter locally must not alter Cloudflare ingress. Public `/probe/*` and later `/v1/*` routing are separate explicit deployment actions. If the adapter is stopped while such a path rule exists, only adapter paths may fail; `/mcp`, OAuth, metadata, and existing bridge health remain independent.

Do not insert a new reverse proxy in front of 1MCP when Cloudflare path ingress already supplies the required routing primitive.

## Deferred until demonstrated

Do not build these into the first usable version:

- public self-service capability issuance;
- staged blobs/templates;
- distributed worker queues;
- Redis or another cache;
- another database;
- separate GLM/Qwen engines;
- model/User-Agent detection;
- live SSE/WebSocket forwarding;
- GET chunk assembly for large inputs;
- binary-first universal results;
- broad transport surface before one durable end-to-end operation path is proven.

## First usable milestone

The first useful WebSession adapter is deliberately one-operation focused:

1. a tool-enabled GET-only client can open `/about` and `/tools`;
2. it can prepare and confirm one small request through path-only URLs;
3. replaying those URLs resolves to the same durable operation;
4. the HTTP request may end while the server-owned operation continues;
5. the operation can later be read through an operation-scoped universal URL without cookies or client-local state;
6. an upstream failure is represented as a readable operation failure;
7. service restart preserves the operation record and completed result;
8. existing `/mcp`, OAuth, metadata, and provider behavior remain unchanged.

The full live 1MCP tool surface and enhanced JSON facade come after this vertical slice is proven; that sequencing does not define a narrower authorization model.

## Non-goals

- replacing 1MCP;
- changing Dev/Code/Terminal semantics;
- depending on Qwen memory/files across user turns;
- making GET itself equivalent to read-only behavior;
- claiming exactly-once downstream mutation effects;
- inferring model identity from HTTP headers;
- making the rich profile necessary for correctness;
- supporting sessions with no outbound retrieval primitive.
