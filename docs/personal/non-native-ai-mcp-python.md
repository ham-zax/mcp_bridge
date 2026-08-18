# Python bridge prompt for AI environments without native MCP support

Use this when an AI environment can execute Python and make outbound HTTPS requests but does not provide a native MCP client/integration. Prefer the official MCP Python SDK when it is available. If package installation is blocked, use the package-free standard-library fallback in this document instead of giving up or reverting to an ad-hoc one-shot HTTP call.

## Copy/paste prompt

```text
Act as an advanced Python agent. I need you to connect to a remote, OAuth-protected MCP server from your Python/code-execution environment.

Target MCP URL:
https://mcp.hamza.my.id/mcp

STRICT REQUIREMENTS

1. Do NOT use raw `requests`, `urllib`, `curl`, or hand-written JSON-RPC as the MCP client implementation. Use the official MCP Python SDK v2 (`mcp` package), `httpx2`, and `streamable_http_client`.

2. Use the SDK's `OAuthClientProvider` for OAuth discovery, PKCE, authorization, token exchange, and authenticated HTTP requests. Do not ask me to paste an access token, refresh token, client secret, or bearer token into the conversation.

3. Implement a headless authorization flow suitable for a sandbox:
   - generate the authorization URL;
   - print only the authorization URL and any non-secret instructions required for me to complete authorization;
   - PAUSE before attempting authenticated MCP calls;
   - ask me to open the URL, authorize the client, and paste back either the resulting callback URL or the `code=` value (and `state` if the SDK requires it);
   - validate the returned OAuth state before exchanging the code.

4. Once authentication succeeds, build a small reusable `portable_mcp` CLI shim inside the sandbox. Keep it minimal and machine-oriented. It must support at least:
   - `connect` / authentication setup;
   - `tools` or `tools-list`;
   - `schema <tool-name>`;
   - `call <tool-name> <json-arguments>`.

5. Cache OAuth state/tokens only inside the current sandbox/session unless durable local storage is clearly available and appropriate. If writing token material to disk:
   - use a private file location;
   - restrict permissions to the current user where the platform permits it;
   - never print token contents to stdout/stderr or echo them back to me;
   - never commit token/cache files to a repository.

6. Use the official SDK's client/transport behavior for MCP protocol negotiation, initialization/session compatibility, Streamable HTTP, SSE handling where applicable, tool discovery, and tool calls. Do not manually recreate protocol-version headers, session IDs, initialization handshakes, or SSE framing unless the official SDK itself requires an explicit compatibility step.

7. After authentication, call `tools/list` through the SDK and return a machine-readable JSON document containing the available tool definitions. Preserve, where present:
   - tool name;
   - description;
   - input JSON schema;
   - output/result schema or structured-content metadata;
   - annotations/capability metadata exposed by the SDK.

8. Do not invoke any discovered write/destructive tool merely to test connectivity. Tool discovery is read-only. Wait for an explicit instruction before executing a tool that can modify files, processes, repositories, terminals, external services, or other state.

9. Keep stdout machine-readable after the interactive OAuth step. Send diagnostics to stderr where practical. For CLI commands, prefer JSON output with explicit success/error fields instead of prose mixed into payloads.

10. Fail clearly instead of silently falling back to an unsafe implementation. If the official SDK cannot be installed because package installation is blocked, but Python's standard library and outbound HTTPS still work, switch to the package-free fallback prompt below. If outbound HTTPS or interactive OAuth completion itself is blocked, stop and explain the exact blocker. If SDK APIs have changed, consult the current official MCP Python SDK documentation and adapt to the supported v2 API before choosing the package-free fallback.

IMPLEMENTATION ORDER

A. Inspect the Python environment and install/import the current official MCP Python SDK v2 and `httpx2` if needed.
B. Create the OAuth client provider and session-local token storage.
C. Generate the authorization URL, print it, and stop for my callback/code.
D. Resume only after I supply the callback/code; complete OAuth and verify an authenticated MCP connection.
E. Build the `portable_mcp` shim around the working SDK client.
F. Run the shim's tool-list command.
G. Return the complete available tool catalog as machine-readable JSON.

Security rule: OAuth authorization codes and tokens are credentials. Minimize their exposure, do not log them, and do not ask me to send long-lived bearer credentials through chat.
```

## Package-free fallback prompt

Use this version when `pip`, PyPI, wheel installation, or third-party imports are unavailable but normal Python standard-library networking is allowed.

```text
Act as an advanced Python agent. I need you to connect to a remote, OAuth-protected MCP server from a constrained Python sandbox with NO third-party package installation.

Target MCP URL:
https://mcp.hamza.my.id/mcp

STRICT REQUIREMENTS

1. Use Python standard-library modules only. Do not install or import `mcp`, `requests`, `httpx`, `httpx2`, `aiohttp`, or any other third-party dependency. Appropriate stdlib modules include `urllib.request`, `urllib.parse`, `urllib.error`, `json`, `ssl`, `secrets`, `hashlib`, `base64`, `http.server`, `threading`, `time`, `pathlib`, and `os`.

2. This is a standards-driven MCP client fallback, not a toy one-shot POST. Implement the protocol deliberately and keep the transport/OAuth code isolated in a small reusable `portable_mcp_stdlib.py` shim.

3. Discover OAuth instead of hard-coding credentials:
   - first inspect the MCP endpoint's `401 WWW-Authenticate` challenge when useful;
   - fetch RFC 9728 protected-resource metadata from the advertised `resource_metadata` URL or the standard well-known location;
   - obtain the canonical `resource`, authorization-server issuer, and requested/supported scopes from discovery;
   - fetch OAuth Authorization Server Metadata from the discovered issuer;
   - require an authorization endpoint, token endpoint, and PKCE `S256` support;
   - use a discovered dynamic registration endpoint when available. Do not invent a client ID.

4. Register a public/native OAuth client when registration is required. Prefer:
   - `token_endpoint_auth_method: none`;
   - `grant_types: ["authorization_code"]`;
   - `response_types: ["code"]`;
   - a loopback redirect URI such as `http://127.0.0.1:<port>/callback`;
   - `application_type: native` when accepted by the registration endpoint.
   Keep any returned client secret private if the server unexpectedly issues one, and follow the server's advertised token-auth method rather than printing credentials.

5. Implement OAuth Authorization Code + PKCE with the standard library:
   - generate `state` with `secrets`;
   - generate a high-entropy PKCE verifier;
   - compute the S256 challenge with SHA-256 plus URL-safe base64 without padding;
   - include `resource` in BOTH authorization and token requests;
   - request only the discovered/required MCP scopes;
   - print the authorization URL, then PAUSE and ask me to authorize it;
   - if the sandbox and my browser do not share localhost, do not wait forever for a loopback listener: tell me the browser redirect may fail locally and ask me to paste the final callback URL from the address bar;
   - accept either the full callback URL or the returned `code` plus `state`;
   - verify `state` before token exchange;
   - if an `iss` parameter is returned, verify it matches the discovered authorization-server issuer before redeeming the code.

6. Exchange the code at the discovered token endpoint using `application/x-www-form-urlencoded`. Never print the access token, authorization code, PKCE verifier, client secret, or token response. Keep credentials in memory when possible. If a session-local cache is needed across CLI invocations, use a private file and set mode `0600` where supported. Never commit credential state.

7. After authentication, implement MCP Streamable HTTP with bounded timeouts and these baseline headers:
   - `Authorization: Bearer <access-token>`;
   - `Content-Type: application/json` for POSTs;
   - `Accept: application/json, text/event-stream`.
   Parse both ordinary JSON responses and SSE responses. For SSE, read event lines incrementally until the JSON-RPC response matching the request ID is received; do not block waiting for the entire stream to close.

8. Support MCP protocol negotiation without assuming one era:

   MODERN FIRST:
   - probe `2026-07-28` with `server/discover`;
   - send `MCP-Protocol-Version: 2026-07-28` and `Mcp-Method: server/discover`;
   - include per-request `_meta` containing protocol version, client identity, and client capabilities;
   - if accepted, use the modern stateless request model for `tools/list` and later calls, including `Mcp-Method` and `Mcp-Name` where the method has a named target such as `tools/call`.

   LEGACY FALLBACK:
   - if the modern probe returns method-not-found, unsupported-protocol, or a transport response indicating that the 2026 revision is unsupported, fall back to the latest initialize-capable version the server accepts, starting with `2025-11-25`;
   - POST `initialize` with client info and capabilities;
   - use the `protocolVersion` returned by the server;
   - capture `Mcp-Session-Id`/`MCP-Session-Id` case-insensitively if returned;
   - POST `notifications/initialized`;
   - include the negotiated `MCP-Protocol-Version` and session ID on later requests when required;
   - if a request with a session ID receives HTTP 404, create a fresh legacy session rather than reusing stale state.

9. Build a session-local CLI around the working client with at least:
   - `auth` or `connect`;
   - `tools` / `tools-list`;
   - `schema <tool-name>`;
   - `call <tool-name> <json-arguments>`.
   Keep successful CLI stdout machine-readable JSON. Send diagnostics to stderr.

10. First authenticated MCP action: call `tools/list` only. Return the complete available tool definitions as machine-readable JSON, preserving tool name, description, input schema, output/result schema when present, and annotations/metadata.

11. Do not call a write/destructive tool merely to prove the connection works. Wait for explicit authorization before invoking tools that can mutate files, repositories, processes, terminals, services, or external state.

12. Do not depend on refresh-token support. Cache the access token only for the current sandbox/session. If it expires or the server returns an authentication failure that cannot be resolved without reauthorization, repeat the authorization-code flow.

13. Fail closed on security or protocol ambiguity. In particular, stop if:
   - PKCE S256 is not advertised;
   - OAuth state validation fails;
   - the callback issuer conflicts with the discovered issuer;
   - TLS certificate verification fails;
   - the server negotiates an MCP protocol version you did not implement;
   - OAuth discovery/registration cannot establish a valid client.

IMPLEMENTATION ORDER

A. Confirm Python stdlib HTTPS works; do not attempt package installation.
B. Discover protected-resource and authorization-server metadata.
C. Dynamically register a public/native client if needed.
D. Generate PKCE + state, print the authorization URL, and pause for my callback.
E. Validate callback state/issuer and exchange the code without exposing credentials.
F. Probe MCP 2026-07-28; fall back to the legacy initialize/session flow if required.
G. Build `portable_mcp_stdlib.py` around the verified transport.
H. Run `tools/list` and return the tool catalog as JSON.

For this target, do not hard-code discovery results even if you have seen them before. Rediscover them on each fresh sandbox. Current deployments may expose protected-resource metadata, PKCE S256, and dynamic client registration, but live discovery is authoritative.
```

### Why the package-free path is acceptable

The standard library has the primitives needed for this constrained fallback: HTTPS requests and headers/form POSTs (`urllib.request`/`urllib.parse`), secure random PKCE/state generation (`secrets`), SHA-256 and base64url encoding (`hashlib`/`base64`), and an optional loopback callback listener (`http.server`). The important distinction is that this fallback implements the documented OAuth/MCP wire contracts as a reusable client rather than sending an isolated hard-coded `tools/call` request.

## Expected interaction

The first run should stop at the human authorization boundary rather than pretending the OAuth flow completed automatically:

```text
AI Python runtime
  -> official MCP Python SDK
  -> OAuth discovery + PKCE
  -> print authorization URL
  -> human authorizes in browser
  -> callback URL/code returned to runtime
  -> SDK exchanges code and caches session credential
  -> portable_mcp tools
  -> tools/list JSON
```

The resulting shim is intentionally a client adapter, not a replacement MCP implementation. Protocol negotiation, Streamable HTTP behavior, OAuth mechanics, and compatibility handling belong to the official SDK. If a future SDK revision changes import paths or APIs, update the adapter to the current official SDK rather than replacing the SDK with hand-written HTTP calls.
