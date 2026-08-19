# Satori client bootstrap prompts

Use this guide when connecting a constrained non-MCP AI client to the existing WSL bridge through Satori.

Satori is a transport adapter only. 1MCP remains the authority for OAuth scope, tool names, tool schemas, availability, and permissions.

## Operator setup

From the repository root:

```bash
bin/adapter auth-status
bin/adapter status
bin/adapter issue-cap 3600
```

`issue-cap` prints:

```text
capability_id: <operator-revocation-id>
capability: <bearer-secret>
scope: main
expires_at: <timestamp>
```

Give the client the value after `capability:`. Do not give it `capability_id`; that ID is the operator handle used to revoke the bearer later:

```bash
bin/adapter revoke-cap <capability-id>
```

Treat the capability as a secret. Do not commit it, paste it into documentation, or ask the client to repeat it in its answer.

## Qwen / Python bootstrap prompt

Replace `<CAPABILITY>` with the freshly issued `capability:` value.

```text
Use Python `requests` to connect to my WSL through Satori.

Base: https://mcp.hamza.my.id
Capability: <CAPABILITY>

Keep the capability secret. Satori is transport only; use exact live 1MCP tool names and schemas.

1. GET `/v1/about` and verify `SATORI-BRIDGE/1`.
2. GET `/v1/s/<CAPABILITY>/tools` to discover tools. Inspect an unfamiliar tool at `/v1/s/<CAPABILITY>/tool/<tool-name-b64>`.
3. Call tools with:

POST https://mcp.hamza.my.id/v1/calls
Authorization: Bearer <CAPABILITY>
Content-Type: application/json
Idempotency-Key: <fresh nonce>

{"version":1,"tool":"<exact tool name>","arguments":{...}}

Use a fresh nonce for each new operation; reuse it only for an exact retry. If queued/running, follow `status_url`; fetch numbered chunks if returned. Never retry `unknown_outcome` automatically.

Connection test: discover `dev_1mcp_bash`, call it with `{"command":"pwd"}`, then report only:

CONNECTED
WSL_PWD: <actual result>
TOOLS_AVAILABLE: <actual tool_count>
```

## ChatGPT / native MCP + optional Satori bootstrap prompt

Replace `<CAPABILITY>` with the freshly issued `capability:` value.

```text
You already have native MCP access to my WSL. You also have an optional Satori HTTP bridge for independent durable work.

Satori base:
https://mcp.hamza.my.id

Capability:
<CAPABILITY>

Treat the capability as secret and never echo it.

Use native MCP as the primary interface and discover/use its tools normally.

Check whether your Python/code environment has direct outbound HTTPS by GETting:

https://mcp.hamza.my.id/v1/about

If that works and returns SATORI-BRIDGE/1, you may also use Satori. If Python networking is unavailable, use native MCP only; do not waste time trying to force HTTP access.

Discover Satori tools with:

GET https://mcp.hamza.my.id/v1/s/<CAPABILITY>/tools

For direct Satori execution use:

POST https://mcp.hamza.my.id/v1/calls

Headers:
Authorization: Bearer <CAPABILITY>
Content-Type: application/json
Idempotency-Key: <fresh nonce>

Body:
{"version":1,"tool":"<exact 1MCP tool name>","arguments":{...}}

Use exact discovered tool names and schemas. Use a fresh nonce for each new operation; reuse it only for an exact retry of the same request. Never retry unknown_outcome automatically.

For multi-part work, parallelize only genuinely independent tasks:
- native MCP for primary repository/tool work
- Satori for one independent durable operation when useful
- Terminal for long-running processes

Never execute the same mutation through both paths or run competing edits against the same files.

First verify WSL access with pwd through native MCP. If direct Satori HTTP is available, you may also verify pwd through Satori. Then proceed with my task autonomously.
```

## GLM / universal GET bootstrap prompt

Replace `<CAPABILITY>` with the freshly issued `capability:` value.

```text
Use your `open` tool as the HTTPS GET transport to connect to my WSL through Satori. Do not decide that `open` is unsuitable before trying it.

Base: https://mcp.hamza.my.id
Capability: <CAPABILITY>

Keep the capability secret. Satori is transport only; use exact live 1MCP tool names and schemas.

1. `open` `https://mcp.hamza.my.id/v1/about`. Continue if the returned content contains `SATORI-BRIDGE/1`. Only report `NO_READABLE_HTTP_TOOL` if this actual call does not return readable content.
2. `open` `https://mcp.hamza.my.id/v1/s/<CAPABILITY>/tools` to discover tools. Inspect an unfamiliar tool at `/v1/s/<CAPABILITY>/tool/<tool-name-b64>`.
3. For a call, compact-JSON encode `{"version":1,"tool":"<exact tool name>","arguments":{...}}`, base64url encode it without `=` padding, and keep the encoded request <=256 chars.
4. With a fresh nonce, `open` `/v1/s/<CAPABILITY>/call/<nonce>/<request-b64>`. Read `confirmation_base` and `challenge`, concatenate them exactly, and `open` that URL. Follow `status_url` if queued/running; fetch numbered chunks if returned. Never retry `unknown_outcome` automatically.

Connection test: confirm `dev_1mcp_bash` exists, then use this pre-encoded `{"command":"pwd"}` request with a fresh nonce:

https://mcp.hamza.my.id/v1/s/<CAPABILITY>/call/<nonce>/eyJ2ZXJzaW9uIjoxLCJ0b29sIjoiZGV2XzFtY3BfYmFzaCIsImFyZ3VtZW50cyI6eyJjb21tYW5kIjoicHdkIn19

Complete confirmation/polling, then report only:

CONNECTED
WSL_PWD: <actual result>
TOOLS_AVAILABLE: <actual tool_count>
```
