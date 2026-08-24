# Agent 1 — Dedicated Windows MCP Chrome + Browser-Fast Recovery

## Mission

Finish the in-progress Windows browser migration in the current dirty worktree and close the three verified runtime findings: dedicated persistent MCP Chrome ownership, strict-pin recovery, and deterministic target-blank following.

Own the mission through the observable success conditions below. Inspect the current code first; do not assume the partial implementation is correct merely because it exists.

## Working arrangement

Repository: `/home/hamza/repo/websession_mcp_bridge`

Branch/worktree: current `main` worktree at base HEAD `4cce1815138aa453b20d8f93274b9fad95c7c9f8`, with substantial authorized uncommitted browser/Local work already present.

This is a **sequential handoff**. Do not create another worktree and do not discard or overwrite unrelated dirty changes. Do not stage or commit unless the user explicitly asks.

## Governing engineering workflow

Use Causal Coding before source mutation, Systematic Debugging for the three reproduced failures, Clean Migration for removal of the normal-Chrome path, Ponytail for implementation minimization, and MCP Harness Router for connected WSL work.

Testing is authorized because `CONTRIBUTING.md` mandates focused affected-provider tests and the full gate for runtime changes. Do not invent broader test work beyond what establishes these contracts.

## Ownership

Primary executable ownership:

- `providers/browser/windows-chrome.cjs`
- `providers/browser/windows-chrome-runtime.mjs`
- `providers/browser/server.mjs`
- `providers/browser/test/server.test.mjs`
- `providers/browser-fast/server.mjs`
- `providers/browser-fast/test/server.test.mjs`
- `providers/browser-fast/windows-runner.cjs` only if the existing Windows Agent Browser process boundary actually needs adjustment

Contract/documentation ownership only as needed to synchronize the implemented behavior:

- `README.md`
- `providers/README.md`
- `docs/architecture.md`
- `docs/configuration.md`
- `docs/development.md`
- `docs/operations.md`
- `docs/personal/harness.md`
- `docs/security.md`
- `docs/superpowers/plans/2026-08-24-browser-fast-windows-agent-browser.md`
- `skills/agent-browser/SKILL.md`
- `skills/SNAPSHOT_SHA256.txt` if Skill bytes change

Do not absorb unrelated Local, Terminal, Code, Pi, mutation-stack, or publication work.

## Required contracts

### A. Dedicated persistent Windows MCP Chrome

Converge on one Windows browser boundary:

```text
Local
  ├─ browser-fast -> Agent Browser 0.34.0 --cdp <dedicated endpoint>
  └─ browser      -> Chrome DevTools MCP 1.7.0 --browserUrl <same endpoint>
                              ↓
                persistent dedicated MCP Chrome
```

Required behavior:

- Use a custom persistent user-data directory below `%LOCALAPPDATA%\\mcp-dev-bridge`, separate from `%LOCALAPPDATA%\\Google\\Chrome\\User Data`.
- Launch Google Chrome with that directory and remote debugging enabled at launch.
- Prefer `--remote-debugging-port=0`; discover the actual endpoint from that profile's `DevToolsActivePort`.
- Reuse a healthy already-running dedicated profile instead of launching duplicates.
- Browser state in that profile persists across provider/bridge restarts; it is intended to be signed into manually once and then reused.
- Do not copy the user's normal Chrome profile into it.
- Normal Chrome is not an execution target and must not be required to enable `chrome://inspect`.
- Both Windows browser surfaces must attach to the same dedicated endpoint/profile.
- Keep the debugging listener local; do not expose it beyond loopback.
- Do not add a Windows service, Task Scheduler job, fixed global debugging port, or another process supervisor unless concrete evidence proves the existing helper cannot own this lifecycle.

### B. Strict pin recovery

Real Agent Browser behavior is authoritative:

- With `--pin-tab`, externally closing the bound target leaves the session in `tab_gone` state.
- `tab list` can return surviving targets but does **not** rebind the session.

Required facade behavior:

- `observe()` is the recovery boundary. It may list targets, choose/request a target, explicitly `tab <targetId>` to bind it, and then take a fresh snapshot/ref set.
- If there is no target to bind, return an explicit observation failure rather than acting elsewhere.
- `execute(tab=...)` remains validation-only: verify the currently pinned CDP target equals the observed `tab`; do not switch during the precondition and do not destroy the caller's refs.
- A stale/dead binding should therefore be recoverable by a fresh `observe()` without weakening execute's wrong-tab fail-closed guarantee.

### C. Deterministic target-blank following

Real Agent Browser behavior is authoritative: a `target="_blank"` click creates a new target but leaves the original session pinned to the opener.

Required `browser-fast` behavior:

- During one `execute` sequence, after a click that creates **exactly one** new target, bind/follow that new target before executing subsequent mechanical actions.
- If no new target appears, continue on the current target normally.
- If more than one new target appears, do not guess which one is intended; fail closed before subsequent actions.
- Preserve explicit per-action `completed` / `failed` / `unknown` / `not_run` truthfulness and the no-auto-retry rule. Do not report the click as unexecuted if it already happened.
- Preserve the per-target complete-operation lock so another request cannot redirect the session during detection/rebind/subsequent actions/final observation.
- Final state should reflect the followed target when one was deterministically followed.
- Keep model-facing tools exactly `observe` and `execute`; do not expose a new popup/follow tool.

Use the smallest local execution strategy that can satisfy this. Do not preserve a single Agent Browser `batch` call as an end in itself if a local batch/chunk boundary is required to observe a target transition safely.

## Observable success

The mission is complete when all of these are true:

1. Current Windows code/docs/tests no longer describe or depend on controlling the normal everyday Chrome profile.
2. One persistent dedicated MCP Chrome profile is the Windows state owner, with an ephemeral debugging port and a reusable healthy endpoint.
3. `browser-fast` and `browser` demonstrably target that same dedicated Windows profile/endpoint.
4. A real Windows `observe -> execute` flow works through native Agent Browser on the dedicated profile.
5. Externally closing the pinned target can be recovered by `observe`, which explicitly rebinds a surviving/requested target and returns fresh refs.
6. `execute.tab` still fails closed on context mismatch without switching.
7. A real target-blank click followed by an action intended for the newly opened page succeeds inside one `execute` call when exactly one new target was created.
8. Ambiguous multiple-new-target creation does not select one arbitrarily.
9. Outer ChatGPT context remains unchanged: Local is still the model-facing broker and `browser-fast` still exposes only `observe`/`execute` behind it.
10. No disposable qualification Chrome/profile/process/session artifacts remain except the intentional persistent MCP Chrome profile itself.

## Required validation

Repository-mandated validation:

- `(cd providers/browser-fast && npm test)`
- `(cd providers/browser && npm test)`
- `bash tests/harness.sh`
- `bash tests/publication.sh`
- `bash tests/lifecycle.sh`
- `(cd providers/pi-dev && npm test)`
- `(cd providers/terminal && npm test)`
- `(cd providers/code-router && npm test)`
- `(cd providers/local-tools && npm test)`
- `bash scripts/check-personal-toolbox.sh`
- relevant syntax/doc/Skill-checksum checks already required by repository practice
- `git diff --check`

Also perform direct Windows runtime qualification against the actual dedicated profile for contracts 3–8 above. Do not use the normal Chrome profile for qualification.

If an unrelated known timing-sensitive provider test fails, verify that exact failure narrowly and report it rather than modifying unrelated code.

## Finish report

Return:

- status: complete / blocked / needs decision;
- concise architecture and behavior summary;
- exact files materially changed by this mission;
- direct Windows runtime evidence for dedicated-profile reuse, pin recovery, and target-blank following;
- required validation actually run and results;
- deviations from this mission;
- any remaining blocker requiring user action (for example, one-time manual sign-in to the new MCP Chrome profile);
- Git status and whether anything was staged/committed.
