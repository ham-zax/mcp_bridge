# Python bridge prompt for AI environments without native MCP support

Use this when an AI environment can execute Python and make outbound HTTPS requests but does not provide a native MCP client/integration. The goal is to make the AI build a small session-local MCP client using the official Python SDK rather than hand-rolling JSON-RPC.

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

10. Fail clearly instead of silently falling back to an unsafe implementation. If this environment blocks outbound HTTPS, interactive OAuth completion, package installation, callback handling, or the official SDK API has changed incompatibly, stop and explain the exact blocker. If SDK APIs have changed, consult the current official MCP Python SDK documentation and adapt to the supported v2 API; do not replace it with raw HTTP/JSON-RPC.

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
