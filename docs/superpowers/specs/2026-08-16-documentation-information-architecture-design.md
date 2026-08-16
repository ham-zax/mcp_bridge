# Documentation Information Architecture Refresh — Design

**Date:** 2026-08-16
**Status:** Approved for implementation
**Scope:** Documentation structure, wording, navigation, archival organization, and compatibility pointers only. No runtime/provider behavior changes.

## Goal

Make the repository easy to understand in five minutes without discarding the engineering evidence that explains how the current harness was qualified.

The documentation must serve two audiences cleanly:

1. external users/installers who need a truthful overview, setup path, trust model, and operating instructions;
2. maintainers who need concise architecture, debugging, development, release, and personal-harness guidance.

Historical benchmarks, plans, specs, agent coordination notes, and acceptance archaeology remain available, but are clearly marked as history and kept out of the primary reading path.

## Core principle

**Current truth should be easy to find; historical evidence should be easy to inspect but impossible to confuse with current guidance.**

## Primary documentation structure

```text
README.md
CONTRIBUTING.md
SECURITY.md
providers/README.md

docs/
  getting-started.md
  configuration.md
  operations.md
  architecture.md
  security.md
  development.md
  troubleshooting.md

  personal/
    harness.md
    toolbox.md

  history/
    README.md
    benchmarks/
    plans/
    specs/
    agent-plans/
    acceptance/
```

## Current-doc responsibilities

### README.md

The README is the five-minute entry point. It should answer:

- What is this project?
- What problem does it solve?
- What does the current architecture look like?
- What are `restricted`, `trusted-dev`, and `personal`?
- What is the current personal tool surface?
- How do I get started?
- Where do I go for operations, architecture, security, development, and history?

It must describe the current Phase-2 state, not the pre-Phase-2 Pi-only state.

### docs/getting-started.md

Owns installation and first-run flow:

- prerequisites;
- deployment identity;
- explicit profile selection;
- setup;
- manual start/status;
- optional user-systemd install;
- first ChatGPT/Actions refresh check;
- quick verification.

### docs/configuration.md

Owns current configuration only:

- deployment state model;
- profile semantics;
- generated state locations;
- renderer inputs/outputs;
- important environment variables;
- private `personal` composition;
- compatibility behavior that is still operationally relevant.

### docs/operations.md

Owns lifecycle and recovery:

- `bin/start`, `bin/status`, `bin/stop`;
- user-systemd;
- health checks;
- logs/state paths;
- Terminal tmux/broker service boundaries;
- safe restart order;
- safe source/worktree cutover;
- upgrade/recovery workflow;
- OAuth continuity constraints.

### docs/architecture.md

Describes only the accepted current architecture:

```text
ChatGPT
  -> HTTPS + OAuth
Cloudflare Tunnel
  -> 1MCP
     -> Dev
     -> Code
     -> Terminal
```

It must state that:

- Dev owns `read`, `edit`, `write`, `wait`, `apply_patch`, and `bash` in personal mode;
- Code owns `code_search`, `code_context`, and `code_symbol`;
- Terminal owns six PTY actions;
- `wait` is a Dev action, not a seventh Terminal action;
- tmux is the PTY/process lifetime authority;
- the broker owns Terminal metadata/transcript/cursor/lease state;
- Code routes to a canonical Git root and hides the raw CodeDB catalog;
- public profiles do not inherit private Code/Terminal/wait capability.

### docs/security.md

Owns the trust/authority model:

- `restricted` workspace-bounded behavior;
- `trusted-dev` unrestricted shell authority with public-style Files policy;
- `personal` WSL-user authority and private Code/Terminal/wait surface;
- sudo policy: explicit/manual only, never stored or auto-filled;
- credential/OAuth state boundaries;
- exposure and public-profile separation.

### docs/development.md

Owns maintainer workflow:

- repository layout;
- provider boundaries;
- dependency pins;
- full verification commands;
- how to make changes safely;
- release/checkpoint procedure;
- documentation rules;
- link to `docs/history/` for rationale/evidence.

### docs/troubleshooting.md

Provides concise symptom -> check -> fix guidance for:

- 1MCP local health failures;
- public health/tunnel failures;
- OAuth/Actions refresh issues;
- connector/RPC timeout behavior;
- missing user-systemd environment;
- Terminal broker versus tmux failure modes;
- stale Terminal/session generation errors;
- CodeDB watcher convergence/freshness;
- generated config pointing at a removed worktree.

### docs/personal/harness.md

Is the practical guide to the private Codex-like WSL harness:

- mental model: Dev / Code / Terminal;
- all 15 actions;
- when to use `edit` versus `apply_patch`;
- native Bash policy;
- durable wait condition kinds;
- wait resume/timeout/hold semantics in plain language;
- Terminal persistence and human takeover;
- rooted Code behavior;
- short end-to-end examples.

### docs/personal/toolbox.md

Remains focused on zero-schema native CLI tooling and should be shortened where it duplicates general setup/development guidance.

## Historical archive policy

The archive is evidence, not current documentation.

Move historical material into:

```text
docs/history/benchmarks/
docs/history/plans/
docs/history/specs/
docs/history/agent-plans/
docs/history/acceptance/
```

`docs/history/README.md` should explain:

- these files document how decisions were reached;
- dates/verdicts are historical snapshots;
- current behavior is defined by the primary docs and current tests;
- the Phase-2 final acceptance/release checkpoint is the anchor for interpreting older evidence.

### What moves

- all current `docs/benchmarks/*` evidence;
- all `docs/superpowers/plans/*`;
- all `docs/superpowers/specs/*`;
- all `docs/superpowers/agent-plans/*`;
- the old detailed acceptance procedure if superseded by current getting-started/development guidance;
- migration-era instructions that no longer belong in the primary path but remain useful archaeology.

## Compatibility-link policy

Important old documentation URLs must not silently disappear.

Keep small pointer files at high-value old paths, including:

- `docs/installation.md` -> `docs/getting-started.md`;
- `docs/acceptance.md` -> current verification guidance plus archived acceptance evidence;
- major benchmark URLs under `docs/benchmarks/` -> corresponding `docs/history/benchmarks/` file;
- `docs/migration-from-local-bridge.md` -> current operations/getting-started guidance plus archived migration document if moved.

Internal agent-plan/spec paths may move without per-file pointer stubs. Keep a small `docs/superpowers/README.md` compatibility index that points to `docs/history/plans`, `docs/history/specs`, and `docs/history/agent-plans`.

## Writing rules

Primary docs must be:

- current, not chronological;
- concise but technically precise;
- explicit about trust boundaries;
- example-driven where examples reduce ambiguity;
- free of benchmark narration unless the result changes how users operate the system;
- free of stale task language such as “next”, “pending”, or “implementation not started” for completed Phase-2 work;
- written around the final mental model rather than provider implementation history.

Historical documents may retain their original language, dates, and experimental framing.

## Cross-linking rules

- README links only to current docs plus one History link.
- Current docs may link to historical evidence under an “Evidence / design history” section, never inline as required reading.
- History docs link back to the current authoritative document where practical.
- Relative links must be validated after moves.

## Cleanup boundaries

This project does **not**:

- change provider schemas or runtime behavior;
- remove engineering evidence from Git;
- rewrite Git history;
- delete unique historical branches/worktrees as part of documentation cleanup;
- expose private deployment secrets or machine-specific credential state.

## Verification

The documentation refresh is accepted when:

1. README describes the current 15-action personal surface and all three profiles accurately.
2. Primary docs have no contradictory pre-Phase-2 statements.
3. Historical material is discoverable under `docs/history/` and clearly marked historical.
4. Important old paths resolve through compatibility pointer files.
5. Internal Markdown links resolve within the repository.
6. Publication/security tests continue to pass.
7. Full provider/lifecycle behavior remains unchanged and relevant existing test suites remain green.
8. `git diff --check` passes and no secrets/machine-specific credentials are introduced.

## Expected outcome

A new user should be able to understand, install, and operate the project without reading any benchmark or agent plan. A maintainer should be able to understand the architecture and run the full verification gate from the current docs alone. Deep engineering rationale remains available one level away in `docs/history/`.