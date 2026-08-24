# Security and Trust Profiles

The effective security boundary is the selected profile plus the Linux account running the bridge.

## `restricted`

Use for conservative/public installations.

- Files are confined to the configured workspace.
- Dev does not expose unrestricted Bash.
- A separate legacy shell provider enforces an allowlist policy.
- No private Code or Terminal provider is present.

## `trusted-dev`

Use only on a dedicated development host where unrestricted shell authority is intentional.

- Files remain workspace-bounded.
- Dev exposes native Bash with the permissions of the Linux service user.
- Bash may reach files, processes, network resources, developer tools, and credentials accessible to that account even when the Files tools are workspace-bounded.
- No private Code or Terminal provider is present.

## `personal`

Private Codex-like WSL authority.

- Files use user-mode paths and may accept absolute paths.
- Bash has the authority of the WSL user.
- Code can inspect Git repositories reachable by that user.
- Terminal can create and control persistent tmux-backed PTYs.
- Durable waits can observe local process/port/file/HTTP/systemd state and private Terminal state.
- Local Browser access can control the normal authenticated native Windows Chrome profile or the separate managed WSLg Chrome profile after explicit `tag:browser` authorization.

This profile is intentionally powerful. Treat it like giving a coding agent an interactive shell as your WSL user plus, when `tag:browser` is granted, control of authenticated browser state.

The outer `local` provider is the `tag:browser` authorization boundary for this migration. Its generic `tool_call(server, tool, arguments)` means every downstream MCP admitted to that broker instance shares that authority, so the private inner config initially contains only Browser. A future MCP may join only when sharing Browser's trust domain is an intentional security statement; otherwise it needs a separate broker/scope or direct exposure.

The Browser facade intentionally does not advertise MCP filesystem roots to its internal Chrome DevTools MCP clients. Upstream path-bearing browser tools therefore remain restricted to the relevant OS temp directory; `tag:browser` does not grant arbitrary repository or Windows filesystem access through those path arguments.

## CodeDB resource guidance

The personal Code tools are description-guided, not resource-enforced. A first Code call for a repository may start a persistent rooted CodeDB child and create or update substantial on-disk index state. On large repositories this can consume significant disk and RAM. The model-facing descriptions therefore direct large or unfamiliar repository discovery toward bounded Dev Bash/`rg` and focused `read` before CodeDB-backed intelligence when CodeDB state/cost is unknown.

There is no repository-size preflight, threshold, cgroup, or approval database in this design. Because personal Bash intentionally has the WSL user's authority, description text cannot form a privilege boundary against deliberate raw CLI use; it is routing guidance intended to prevent accidental expensive work.


## Edit mutation guarantees

Edit V2 coordinates all requested canonical paths through the existing in-process mutation coordinator, plans every target before the first edit mutation, and revalidates file identity plus exact snapshot bytes through the same open file descriptor used for write/truncate. This reduces stale-path and cooperating-writer races but is not a cross-file transaction, rollback system, fsync durability guarantee, or compare-and-swap against arbitrary Bash/Python/editor processes. A post-mutation failure may therefore be reported as an explicit partial or uncertain state that requires rereading before retrying.

## File topology mutation guarantees

Personal `file_ops` operates only on existing regular-file directory entries. It canonicalizes and authorizes the parent while preserving the requested final entry identity, opens the source without following the final component, and rejects symbolic links and other non-regular entries. Delete revalidates the requested entry before guarded unlink. Move is same-filesystem only: it creates a no-overwrite hard link to the same inode, verifies source/destination identity, then removes the source name; `EXDEV` is explicit and there is no copy fallback.

All affected entry paths participate in the same in-process mutation coordinator used by cooperating Dev mutations, and sources are revalidated after the lease is acquired. Once a move has created the destination link, cancellation does not deliberately interrupt the guarded link-to-unlink sequence. A later failure is reported as structured `FILE_OPS_PARTIAL` state with completed, failed, uncertain, and unattempted operations plus confirmed side effects where known.

These guarantees do not provide kernel compare-and-swap or serialization against arbitrary Bash, Python, editors, or other external filesystem actors. Path-based unlink has an unavoidable final race if an external actor replaces the directory entry after the last guard and before unlink. Treat `file_ops` as cooperative Dev serialization plus stale-state detection, not as a general filesystem transaction boundary.

## Sudo

Sudo is never an automated credential feature.

- The harness may execute `sudo` only when the operator deliberately requests it.
- Password entry belongs in an explicitly human-controlled Terminal session.
- The bridge must not store, infer, log, transmit, or auto-fill a sudo password.

## Human Terminal observation and ownership handoff

The human frontend is any suitable interactive TTY; Kitty is not a security or runtime dependency. tmux remains the PTY/process lifetime authority and the broker remains the model mutation gate.

`bin/wsl-term new <session>` creates a human-first collaborative session under a pending human lease before the tmux session is exposed, closing the create-to-attach model-write race. The attached writable client blocks model send/resize/ordinary close while model reads remain available.

`bin/wsl-term give <session>` changes the designated human client to read-only + ignore-size and releases the human lease only after the tmux transition is verified. `bin/wsl-term take <session>` establishes human blocking before making the designated client writable. `terminal_yield` uses the same take path and can only return control to a human; it cannot seize human control for the model.

`Ctrl-b T` is a direct tmux `switch-client -r` ownership toggle because tmux read-only clients ignore conditional wrapper bindings. A read-only observer cannot inject pane input until the human explicitly invokes this takeover. Before every model mutation, the broker reconciles actual client flags: any writable client or live lease blocks the model, a unique writable client becomes the designated human target, and multiple writable clients fail closed rather than being auto-resolved.

`bin/wsl-term watch <session>` starts read-only + ignore-size and does not acquire a human lease. `bin/wsl-term attach <session>` is writable human takeover/rejoin and becomes the designated human client when observed. Unknown tmux client state remains writable for fail-closed control.

Human keystrokes are never copied into a separate broker-side input log. Sudo/password input continues to travel directly from the interactive terminal through tmux to the PTY.

## Public exposure

1MCP listens on loopback `:3050`. Cloudflare exposes HTTPS and OAuth remains required for the public MCP origin. The optional WebSession adapter listens separately on loopback `:3051`; only explicitly configured `/probe/*` and `/v1/*` paths may be routed to it, while `/mcp`, OAuth, discovery, and all other paths remain on 1MCP.

WebSession does not bypass 1MCP. It uses a dedicated dynamically registered authorization-code/PKCE client and stores that credential only in private adapter state. The adapter does not request a narrower scope; the MCP SDK resolves scope from live 1MCP protected-resource/authorization metadata, the same authority that governs the main bridge. Its existing grant remains `tag:code tag:dev tag:terminal` unless separately reauthorized; adding `tag:browser` to ChatGPT must not silently widen WebSession. 1MCP remains the authorization and tool-surface owner; WebSession adds no narrower or broader tool permission layer. Pinned 1MCP 0.36.0 supports rotating refresh tokens for clients that register that grant type, but no client may fall back to unauthenticated provider access when OAuth restoration fails.

Universal WebSession capabilities are high-entropy bearer values carried in URL paths because the compatibility profile cannot require headers; richer clients send the same capability in the `Authorization` header instead. The adapter stores only capability hashes, applies expiry and explicit operator revocation, returns `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, and uses a different operation-scoped continuation token for later status/result reads. Revoking submission authority blocks discovery/new operations but intentionally does not invalidate already-issued read-only operation continuations. Raw submission capabilities and OAuth credentials must not enter ordinary logs, SQLite operation records, docs, or Git. Both universal GET and enhanced POST require durable nonce idempotency because duplicate origin delivery was observed during client probing. Large text results are bounded, split on UTF-8-safe boundaries, and persisted as immutable numbered chunks with per-chunk hashes.

An optional operator-set master bearer is a password-equivalent bootstrap secret for richer HTTP clients. It is accepted only by `POST /v1/access`, stored only as a private hash outside Git, and exchanges into an ordinary `main` capability with a fixed six-hour lifetime. The master bearer is never accepted as a submission capability itself and is deliberately unavailable in URL-based universal GET routes. Rotating it replaces the stored hash immediately without extending or invalidating already-issued finite capabilities.

The adapter capability is only a transport bearer for the adapter's existing 1MCP authority; it does not encode per-tool read/write scopes. Universal GET submissions require an operation-bound proof-of-read confirmation before any upstream tool dispatch because a GET-capable client or intermediary may replay or prefetch URLs. The returned confirmation base deliberately omits the challenge. Enhanced authenticated POST submissions do not add this GET-specific confirmation step. In both profiles, 1MCP remains responsible for whether the exact upstream tool call is authorized and available.

Dispatch intent is durably recorded immediately before every MCP tool call. If the call produces a normal MCP result, that result determines `completed` or `tool_failed`. If the worker loses the result after dispatch may have begun, the operation becomes terminal `unknown_outcome` and is never automatically retried. This avoids inferring which upstream tools are safe to repeat.

Pinned 1MCP 0.36.0 generates OAuth-consent CSP from a validated registered callback origin, so the former 0.34.4 source patch is intentionally removed. Browser authority is separate from Dev/Code/Terminal: `tag:browser` exposes the three-tool Local broker, whose private inner 1MCP currently contains only the Browser facade. The facade can reach either resource-local Chrome child only after explicit client authorization at that outer domain.

## Sensitive state

Keep these outside Git:

- `.env` deployment identity;
- generated 1MCP configuration;
- OAuth/session state, including WebSession `oauth.json`;
- WebSession SQLite operation state and continuation/confirmation signing key;
- WebSession master-bearer hash;
- logs and PID/runtime files;
- private Terminal state;
- credentials and tunnel secrets.

Historical engineering evidence under `docs/history/` is excluded from the public publication surface because it can contain old private-machine context.
