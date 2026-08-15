# Providers

Provider-specific MCP implementations live here. Bridge lifecycle code must not contain provider business logic.

Current transitional provider:

- `legacy-shell/server.py` — compatibility shim around `mcp-shell-server==1.1.8` used by the current Files/Shell stack.

Future providers such as a Pi-backed development harness should be added as separate directories with their own tests and dependency pins. The `trusted-dev` / `restricted` policy profiles are architectural policy and must remain independent of a particular provider implementation.
