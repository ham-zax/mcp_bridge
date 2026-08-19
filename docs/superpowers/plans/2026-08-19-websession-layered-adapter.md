# WebSession Layered Adapter Implementation Plan

**Design:** [`../specs/2026-08-19-websession-layered-adapter-design.md`](../specs/2026-08-19-websession-layered-adapter-design.md)

**Goal:** Add one durable server-side adapter that gives constrained AI runtimes a universal path-only GET interface and later an optional JSON/HTTP interface, while keeping the existing 1MCP gateway and provider composition authoritative.

**Architecture:** A new Node adapter service sits beside 1MCP and is reached through path-specific Cloudflare ingress. A universal GET profile is the compatibility floor; a richer POST/JSON profile is preferred when the client proves it. Both profiles normalize into one SQLite-backed operation core, and a bounded worker calls the existing OAuth-protected 1MCP gateway through the repository's installed MCP JS SDK. The implementation proceeds vertically: finish capability measurements, resolve adapter-to-1MCP authentication, prove one durable operation end-to-end, then complete both transport facades while preserving the live 1MCP authority and tool surface.

**Current evidence:** The optional probe service and public `/probe/*` ingress are active. GLM model-readable GET is proven for a capable session, delayed responses through 6 seconds are readable, duplicate delivery was observed at 6 seconds, and plain-text canary prefetch was not observed. Start with a 256-character universal encoded request budget and a <=2 second synchronous fast path. Qwen is the preferred richer client: the controlled origin now proves model-visible GET, exact query carriage, programmatic paths through 8192 bytes, readable non-2xx status/body, delayed responses through 12 seconds, and POST carriage of JSON plus bearer-header presence, `Idempotency-Key`, and a selected custom header. Qwen also produced duplicate origin traffic during the broader probe, so enhanced submissions require the same durable idempotency discipline as universal GET. Qwen client-local state remains non-authoritative and the server remains the operation owner. Transport probing is complete unless implementation later exposes a concrete missing capability.

**Tech Stack:** Node.js 24, built-in `node:http`, built-in `node:sqlite`, existing `@modelcontextprotocol/sdk`, existing Cloudflare Tunnel, existing user-systemd/lifecycle conventions.

## Global Constraints

- Keep 1MCP as the only MCP execution/composition gateway. Do not independently spawn or duplicate Dev/Code/Terminal providers.
- Keep `/mcp`, OAuth, metadata, and existing client behavior unchanged while adding adapter paths.
- Keep the adapter strictly opt-in: existing `bin/start`, `bin/stop`, `bin/status`, watchdog, bootstrap, and `mcp-dev-bridge.service` must not start, stop, require, or report it.
- Start/stop/status the adapter only through an explicit adapter command. Do not install or enable adapter autostart unless the operator separately requests it later.
- Starting the local adapter must not rewrite Cloudflare ingress; public adapter path routing is a separate explicit activation step.
- Universal correctness must require only direct HTTPS GET with path segments and finite text responses.
- Enhanced POST/JSON support is optional and must use the same authorization, policy, idempotency, operation, worker, result, and recovery implementation.
- Do not infer GLM/Qwen/model identity from User-Agent or other browser-like headers.
- Durable state belongs to the adapter, never to a model Python kernel, temporary filesystem, conversation turn, or web-tool session.
- Do not emit complete executable universal mutation-confirmation URLs in preparation responses.
- Ambiguous non-idempotent mutation dispatch becomes `unknown_outcome`; never blindly retry it.
- Raw capabilities, confirmation challenges, OAuth credentials, and secret arguments must not enter ordinary application logs, metrics, traces, or public errors.
- Start the universal encoded request limit at 256 base64url characters from the current GLM evidence; increase it only from a literal-URL controlled measurement.
- Keep the synchronous fast path at 2 seconds or less initially; longer work becomes a durable operation because 6-second GLM fetches already demonstrated duplicate delivery.
- Prefer the enhanced JSON facade for clients such as Qwen that prove POST/header support, but never make correctness depend on richer client-local state.
- Do not add FastAPI, Python service dependencies, an external queue, Redis, a reverse proxy, or another database unless later evidence requires them.

## Files and ownership

The exact adapter filenames below are the intended repository-native seam. Preserve existing provider files unless a later task proves a provider change is necessary.

| File | Responsibility |
|---|---|
| `providers/websession-adapter/server.mjs` | HTTP entry point, health, lifecycle wiring, facade routing |
| `providers/websession-adapter/core.mjs` | normalized submission, policy gate, idempotent operation orchestration |
| `providers/websession-adapter/store.mjs` | `node:sqlite` schema, transactions, leases, capability/operation/result persistence |
| `providers/websession-adapter/mcp-client.mjs` | authenticated Streamable HTTP client to existing 1MCP |
| `providers/websession-adapter/protocol.mjs` | strict universal request parsing and stable text/JSON response rendering |
| `providers/websession-adapter/probe.mjs` | temporary/retained controlled probe handlers and private request evidence |
| `providers/websession-adapter/package.json` | local package metadata and existing MCP SDK dependency pin |
| `bin/adapter` | explicit adapter-only `start`, `stop`, and `status`; never called by the main lifecycle |
| `tests/adapter-probe.sh` | focused probe/lifecycle isolation contract |
| `docs/architecture.md` | current runtime path after adapter introduction |
| `docs/configuration.md` | adapter deployment/state configuration |
| `docs/operations.md` | rollout, health, OAuth credential, recovery, rollback |
| `docs/security.md` | path-capability, confirmation, log, Cloudflare-edge, mutation recovery boundaries |
| `docs/personal/non-native-ai-mcp-python.md` | richer-runtime guidance after the adapter is usable |

Do not create all code files mechanically if a task remains clearer with fewer modules. Keep parsing, storage, MCP transport, and operation ownership distinct, but collapse trivial wrappers rather than creating one-file abstractions.

### Task 1: Local controlled probe and explicit adapter lifecycle — implemented

**Files:**
- Create: `providers/websession-adapter/server.mjs` with `/health/ready` and `/probe/*` only.
- Create: `bin/adapter` with explicit `start|stop|status` actions.
- Create: `tests/adapter-probe.sh` for the required focused runtime/isolation contract.
- Modify: current architecture/operations docs for the opt-in boundary.

**Interfaces:**
- Consumes: existing external state/runtime roots and Node runtime.
- Produces: a loopback-only probe on a dedicated port whose request evidence is stored privately outside Git.

**Steps:**
- Implement `GET /health/ready`.
- Implement `/probe/request/{nonce}` returning only safe request metadata.
- Implement `/probe/echo-path/{payload}` returning payload byte length and SHA-256 only.
- Implement `/probe/delay/{seconds}` with an exact bounded server-side delay and measured server elapsed time.
- Implement `/probe/page/{nonce}` plus inert/instructed canary targets and `/probe/hit/{kind}/{nonce}` request evidence.
- Store probe request evidence under the adapter's private external state directory with bounded retention; never under the repository.
- Keep `bin/start`, `bin/stop`, `bin/status`, the watchdog, and existing systemd units unchanged.
- Make `bin/adapter start` the only startup path in this phase; `bin/adapter stop` affects only the adapter.
- Do not modify live Cloudflare ingress in this task.

**Acceptance criteria:**
- `bin/adapter start` brings up only the loopback adapter and `bin/adapter stop` removes only that process.
- Normal bridge lifecycle commands contain no adapter dependency and behave exactly as before.
- Probe endpoints return finite text and private evidence records what reached the local origin.
- Starting the adapter does not alter Cloudflare configuration or enable any startup service.

**Required repository validation:**
- Run the focused adapter probe/isolation test required by `CONTRIBUTING.md`, plus syntax/doc-link/diff checks for touched files.

### Task 2: Public probe measurement — complete

**Files:**
- Modify only the probe handler if a minimal POST/header echo endpoint is required for Qwen verification.
- Update the design/client guidance with measured capability limits.

**Interfaces:**
- Consumes: active public `/probe/*` routing, GLM origin evidence, existing Qwen/Python capability evidence.
- Produces: final transport settings used by the universal and enhanced facades.

**Measured GLM results:**
- Real model-readable direct GET exists in capable sessions; browser-navigation-only sessions also exist and do not qualify.
- Compact literal URLs reach the origin and return readable `WEBSESSION-PROBE/1` bodies.
- Delays of 1, 2, 4, and 6 seconds completed, but the 6-second case produced three origin GETs.
- Plain-text canaries were not automatically fetched in the tested direct-fetch profile.
- Generated-path attempts arrived as 344 and 696 bytes for requested 512/1024 payloads; 2048+ attempts failed before the origin, while the public origin independently accepts 8192 bytes.
- Initial settings: 256 encoded characters maximum for universal inline calls and <=2 seconds for synchronous completion before polling.

**Measured Qwen results:**
- Python `requests` returned model-visible GET bodies and preserved the exact query string.
- Programmatically generated path payloads of 512, 1024, 2048, 4096, and 8192 bytes all reached the origin intact with HTTP 200.
- Delayed responses of 1, 2, 4, 6, and 12 seconds all returned readable HTTP 200 bodies; the 12-second result is the current controlled-origin wait proof.
- The same assistant response generated duplicate origin traffic beyond the requested single application calls, including a repeated query request, a second full path ladder, and repeated delay-ladder requests. Enhanced POST submission therefore requires the same durable idempotency discipline as universal GET.
- A deliberate 404 exposed both the status code and the WEBSESSION probe body.
- The current delay endpoint sends only a final body, so `INCREMENTAL_READS` remains not proven by this controlled-origin run.
- In this observed same-response Python environment, `/home/workspace` file state survived a later code invocation while an in-memory variable did not. Neither is durable adapter state.
- A focused `POST /probe/http/{nonce}` reached the controlled origin with HTTP 200 and proved: `Content-Type: application/json`, bearer-header presence without secret disclosure, `Idempotency-Key` presence and nonce match, `X-WebSession-Probe` preservation, a 108-byte JSON body with matching SHA-256, valid JSON parsing, and `probe_id` matching the nonce.
- This completes the transport capability probe. Do not extend transport testing unless implementation later exposes a concrete unanswered capability question.

**Acceptance criteria:**
- Existing `/mcp`, OAuth, metadata, and health routes continue to reach 1MCP.
- Universal limits are based on origin-observed GLM behavior rather than model claims.
- Enhanced-profile assumptions used by implementation are confirmed against the same public path.
- Probe ingress may remain available during implementation and can later be removed without touching adapter or 1MCP state.

**Required repository validation:**
- For any probe code change, run the focused adapter probe plus the relevant public/lifecycle checks required by `CONTRIBUTING.md`.

### Task 3: Resolve adapter-to-1MCP authentication — complete

**Files:**
- Create: `providers/websession-adapter/oauth.mjs` for persistent SDK `OAuthClientProvider` state.
- Create: `providers/websession-adapter/mcp-client.mjs` for authenticated SDK client creation and bounded tool calls.
- Create: `providers/websession-adapter/auth.mjs` for the temporary loopback operator authorization flow.
- Create: `providers/websession-adapter/package.json` / lockfile with the repository's existing `@modelcontextprotocol/sdk` version.
- Modify: `bin/adapter` to add explicit `auth` / `auth-status` commands without coupling them to `start`.
- Update: `docs/operations.md` and `docs/security.md` with operator authorization/reauthorization behavior.

**Interfaces:**
- Consumes: live 1MCP OAuth discovery, dynamic registration, installed MCP JS SDK semantics, private external adapter state.
- Produces: a reusable authenticated MCP client that always reaches the existing public 1MCP `/mcp` gateway.

**Steps:**
- Use the server-supported authorization-code flow with PKCE and dynamic registration through the SDK; do not implement a second OAuth stack.
- Use a temporary loopback callback listener, default `http://127.0.0.1:3052/callback`, only while `bin/adapter auth` is active. This callback is not exposed through Cloudflare and is not part of adapter runtime lifecycle.
- Persist client registration, discovery state, PKCE verifier/state, and tokens in private external `oauth.json` with mode `0600`; atomically replace the file and never place it in Git/SQLite/public operation data.
- Validate callback OAuth `state` before token exchange; do not print authorization codes, tokens, client secrets, or PKCE verifier.
- Let the SDK attempt refresh when a refresh token exists, but treat reauthorization as the supported recovery path if refresh cannot restore access. Do not assume `client_credentials`.
- Make `auth-status` prove usable credentials by performing only `tools/list`; do not invoke a mutating MCP tool as an auth smoke test.
- Fail closed if authentication cannot be restored; never fall back to direct provider access.

**Acceptance criteria:**
- `bin/adapter auth` establishes a dedicated adapter credential without changing the main bridge OAuth state.
- `bin/adapter auth-status` can list the existing 1MCP tool catalog through `https://mcp.hamza.my.id/mcp` without exposing credentials.
- No adapter credential appears in public responses, operation data, repository files, or ordinary logs.
- Stopping/restarting the optional adapter does not delete the credential and normal `bin/start|stop|status` remains independent.

**Implemented evidence (2026-08-19):**
- Dedicated adapter dynamic registration + authorization-code/PKCE flow completed against live 1MCP.
- Private `oauth.json` is mode `0600`; access token persistence is proven and the live server issued no refresh token, so explicit reauthorization remains the recovery path.
- `bin/adapter auth-status` authenticated through `https://mcp.hamza.my.id/mcp` and listed the 16 existing 1MCP tools without exposing credentials.
- The adapter OAuth state remains independent of normal bridge startup/shutdown and survives adapter restart.

**Required repository validation:**
- Run the focused OAuth/lifecycle checks required by `CONTRIBUTING.md`, then the normal candidate gate before merge.

### Task 4: One durable operation vertical slice — complete

**Files:**
- Create/adapt the minimum `store.mjs`, `core.mjs`, HTTP route code, and `mcp-client.mjs` implementation needed for one end-to-end operation.
- Extend `bin/adapter` with the smallest operator capability-issuance action consistent with repository conventions.

**Interfaces:**
- Consumes: operator-issued capability, client nonce, normalized request, authenticated MCP client.
- Produces: one durable operation record and operation-scoped universal continuation URL.

**Steps:**
- Use `node:sqlite` to persist capability and operation state.
- Store only a secure hash of presented capability tokens.
- Implement deterministic request normalization and a request hash.
- Uniquely key creation by `(principal_id, client_nonce)`.
- Return the existing operation for identical replay and a readable `nonce_conflict` for nonce reuse with another request.
- Use one read call only as the first end-to-end durability proof; do not turn that implementation sequence into a WebSession authorization policy.
- Lease queued work durably, persist dispatch intent, call 1MCP, and persist the bounded finite result.
- Return a small completed result inline when available within the measured fast-path budget; otherwise return an operation-scoped universal status URL.
- Recover queued/interrupted work conservatively after adapter restart without inferring tool retry safety.

**Acceptance criteria:**
- The same call URL cannot create two operation records.
- The HTTP request may finish while the operation continues server-side.
- A later GET using the operation-scoped continuation URL can read the result without cookies or client-local state.
- Adapter restart preserves operation identity and completed result.

**Implemented evidence (2026-08-19):**
- `node:sqlite` stores capability hashes and durable operations under the adapter's private state directory.
- The first vertical proof used strict unpadded base64url JSON, currently capped at the measured conservative 256-character inline budget, to execute `dev_1mcp_read` through 1MCP.
- Task 7 later removes that initial single-tool implementation boundary: current discovery and dispatch use the live exact 1MCP tool surface without a WebSession permission filter.
- Same `(principal, nonce, request)` replay returned the same operation ID and one database row; reuse of the nonce for another request returned `nonce_conflict`.
- Completed results are durable and readable through an operation-scoped HMAC continuation URL; submission authority is not required for polling.
- Local and public `GET /v1/s/{capability}/call/{nonce}/{request}` completed a real README read through adapter OAuth -> 1MCP -> Dev.
- Cloudflare now routes only `/probe/*` and `/v1/*` to `127.0.0.1:3051`; `/mcp` and OAuth remain on `127.0.0.1:3050`.
- Focused adapter protocol/store tests pass.

**Required repository validation:**
- Add/run the focused tests required by `CONTRIBUTING.md` for the new model-facing executable behavior, plus the relevant final lifecycle/publication gate once at candidate completion.

### Task 5: Complete universal GET profile — complete

**Files:**
- Modify: adapter HTTP/protocol/core/store modules from Task 4.
- Modify: current architecture, security, configuration, operations, and client guidance docs.

**Interfaces:**
- Consumes: proven durable operation path.
- Produces: `/about`, live 1MCP `/tools` and `/tool/{tool-name-b64}` discovery, universal submissions, status, finite result chunks, revocation, and expiry.

**Steps:**
- Add strict unpadded base64url parsing with encoded/decoded size limits derived from the probe.
- Add stable line-oriented `WEBSESSION-MCP-BRIDGE/1` response rendering.
- Mirror the live 1MCP tool names and descriptors without a WebSession permission filter.
- Add operation-scoped read-only continuation capabilities.
- Add bounded immutable UTF-8 result chunks for larger text.
- Add operator revocation and TTL handling without introducing a public capability-registration service.
- Ensure raw capabilities do not enter application diagnostics.

**Acceptance criteria:**
- A GET-only client can discover the live 1MCP tools, prepare a small request, confirm it through the proof-of-read URL construction, poll, and read finite results using only directly openable absolute HTTPS URLs.
- The universal flow requires no query strings, cookies, POST, JavaScript, page-reference clicking, SSE, WebSockets, or client-local persistence.
- Result/status authority cannot submit or confirm new work.

**Implemented evidence (2026-08-19):**
- Public `GET /v1/about` advertises the universal/enhanced profiles, 256-character inline request budget, 16 KiB enhanced body budget, and 1900 ms fast wait without requiring a capability.
- Capability-scoped `GET /v1/s/{capability}/tools` and strict base64url `GET /v1/s/{capability}/tool/{tool-name-b64}` mirror the live 1MCP tool names/descriptors and do not reflect the raw capability in their response bodies.
- Operator capability issuance now returns a non-secret capability ID; `bin/adapter revoke-cap <capability-id>` immediately blocks discovery and new submissions for that capability.
- Revocation does not invalidate an already-issued operation-scoped continuation: the continuation remains read-only and cannot authorize new work.
- Completed text is stored in immutable UTF-8-safe 8192-byte chunks; the current total normalized result bound is 1 MiB. Multi-chunk status responses return an operation-scoped chunk base URL rather than inlining the large result.
- A public 20,000-byte controlled read completed as three chunks; first/last chunk endpoints were readable and carried chunk number/count plus SHA-256 metadata.
- Replaying the same `(principal, nonce, request)` after an adapter restart returned the same operation ID, and its operation continuation remained readable after restart.
- Focused protocol/store tests now cover strict tool-name decoding, revocation, UTF-8 chunk reconstruction, and chunk immutability; lifecycle isolation covers discovery and revocation.

**Required repository validation:**
- Run focused model-facing/protocol tests plus the relevant publication/lifecycle checks required by repository policy.

### Task 6: Enhanced JSON facade — complete

**Files:**
- Modify only the adapter route/protocol layer unless evidence requires core changes.
- Modify richer-runtime client guidance.

**Interfaces:**
- Consumes: the same `submit_operation(...)` contract proven by universal GET.
- Produces: bearer-authenticated JSON submission/status and universal continuation URLs.

**Steps:**
- Implement `POST /v1/calls` with `Authorization: Bearer`, `Idempotency-Key`, and explicit JSON body limits.
- Parse into the same normalized request and operation creation path as universal GET.
- Return structured operation state plus the operation-scoped universal status URL.
- Make universal fallback a read of the same operation, never a resubmission.

**Acceptance criteria:**
- Universal and enhanced submissions use the same adapter capability and exact upstream 1MCP tool names/arguments; only their transport-specific confirmation behavior differs.
- Losing the richer runtime after submission does not lose the operation.
- No authorization or policy fork exists in the enhanced facade.

**Implemented evidence (2026-08-19):**
- Public `POST /v1/calls` accepts bearer capability, `Idempotency-Key`, JSON content type, and a bounded 16 KiB body.
- Enhanced JSON and universal GET parse the same generic request envelope containing an exact 1MCP tool name and arguments and enter the same `OperationCore.submit(...)` path.
- Two identical public POST submissions with the same idempotency key returned the same operation ID.
- The returned operation-scoped universal status URL read that exact operation and result, proving richer-runtime loss does not lose operation authority.
- Enhanced `POST /v1/calls` does not add a WebSession per-tool confirmation or permission layer; 1MCP remains the authority owner.
- `POST /v1/confirm/{operation-id}` remains available to confirm an operation prepared through the universal GET transport.
- New upstream tools require no WebSession policy-registry change; live discovery and exact tool-name dispatch follow 1MCP.

**Required repository validation:**
- Run focused facade-equivalence checks and the relevant model-facing publication gate required by repository policy.

### Task 7: Preserve main 1MCP authority; keep confirmation transport-only — complete

**Files:**
- Modify: adapter auth/core/store/protocol modules and security/operations docs.

**Interfaces:**
- Consumes: proven universal and enhanced operation transports.
- Produces: the same 1MCP OAuth scopes, live tool surface, exact tool names/arguments, universal proof-of-read confirmation, and conservative ambiguous-outcome recovery.

**Steps:**
- Let the MCP SDK resolve OAuth scope from live 1MCP metadata rather than hardcoding a WebSession scope set; the current grant is `tag:code tag:dev tag:terminal`, matching main.
- Use one adapter `main` capability rather than per-tool read/write scopes.
- Mirror live 1MCP tool descriptors and pass exact tool names/arguments through to 1MCP.
- Require proof-of-read confirmation uniformly for universal GET submissions; do not classify upstream tools as safe/unsafe inside WebSession.
- Let enhanced authenticated POST dispatch without the GET-specific confirmation step.
- Record dispatch intent before every MCP tool call and transition ambiguous post-dispatch interruption to `unknown_outcome` rather than inferring retry safety.

**Acceptance criteria:**
- WebSession has no independent per-tool authorization allowlist or read/write scope split.
- Adapter OAuth scope set matches the main bridge scope set.
- Tool discovery is the live 1MCP surface and request dispatch uses exact upstream names/arguments.
- Revoked/expired adapter transport authority cannot start new work.
- Universal GET prefetch/replay protection changes transport only, not 1MCP authorization semantics.

**Implemented evidence (2026-08-19):**
- Removed the WebSession tool policy registry and read/write capability split; `bin/adapter issue-cap` issues only `scope: main` bearers and legacy prototype scope rows are not accepted as main capabilities.
- Generic request parsing preserves exact 1MCP tool names and arguments; enhanced POST dispatches them directly and universal discovery reads the live 1MCP catalog.
- Universal GET confirmation applies uniformly to every tool, avoiding any WebSession inference about which upstream tools are safe to execute from a GET transport.
- Dispatch intent is persisted immediately before every MCP call; a recovered dispatched operation transitions to terminal `unknown_outcome` rather than being blindly retried.

**Required repository validation:**
- Run focused confirmation/idempotency/recovery tests and the relevant lifecycle/security/model-facing gates required by repository policy.

### Task 8: Add only demonstrated payload/operator extras

**Files:**
- Modify existing adapter modules and docs only for requirements proven by real usage/probe evidence.

**Interfaces:**
- Consumes: stable universal and enhanced operation paths.
- Produces: only the minimum large-input or operator features that are now necessary.

**Steps:**
- Add staged argument blobs/templates only if real requests exceed the measured universal limit and the enhanced facade is insufficient.
- Bind staged data to principal, expiry, hash, tool scope, size, and use count.
- Add richer operator recovery/retention tooling only if simple CLI/status output is no longer enough.
- Keep running and `unknown_outcome` operations out of ordinary cleanup.

**Acceptance criteria:**
- Every added mechanism corresponds to a demonstrated need that cannot be met by the simpler existing path.
- Universal URLs remain within the measured conservative public path budget.

## Rollout order

Roll out by capability, not by model family:

```text
GLM + Qwen controlled transport probes complete
  -> adapter-to-1MCP OAuth
  -> one durable operation proof
  -> universal read profile
  -> enhanced JSON facade
  -> mutation confirmation
  -> demonstrated extras only
```

At every rollout step, existing 1MCP `/mcp` and OAuth behavior remains the rollback anchor. Do not delete or rewrite existing OAuth/session state as part of adapter rollback.

## Definition of done

The layered adapter is complete when:

- a GET-only client can discover permitted tools, submit a small request, poll durable state, and read finite results using only absolute path URLs;
- a richer Python/HTTP client can submit the same logical request through JSON and receive the same operation semantics;
- both profiles use one authorization, policy, idempotency, operation, execution, result, and recovery implementation;
- client disappearance does not cancel or lose server-owned work;
- capabilities and OAuth credentials stay out of ordinary logs and public operation data;
- mutations cannot dispatch before explicit operation-bound confirmation;
- ambiguous mutations become `unknown_outcome` rather than being silently retried;
- adapter restart preserves durable operations and completed results;
- existing 1MCP/OAuth/provider behavior remains intact;
- the implementation uses the repository's existing Node, MCP SDK, Cloudflare, state, lifecycle, and operational conventions unless measured evidence justifies a change.
