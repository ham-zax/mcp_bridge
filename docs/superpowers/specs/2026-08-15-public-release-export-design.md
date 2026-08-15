# Public Release Export Design

**Date:** 2026-08-15  
**Status:** Approved architecture; private engineering specification

## Goal

Create a clean, independently versioned public repository at:

```text
/home/hamza/repo/mcp-dev-bridge-public
```

The existing `satori_bridge` repository remains the private engineering source of truth. The public repository is generated from an explicit product allowlist and receives no private Git history, internal plans/specs, benchmark chronology, machine-local state, agent coordination material, or "how we built it" narrative.

The first public release is a self-hosted Linux/WSL development bridge for ChatGPT. It is not a multi-user hosted SaaS and must not be presented as an OpenAI-produced or OpenAI-endorsed product.

The public tree must also be launch-quality: its README and user docs should be concise, polished, credible, and easy to understand. They should sell the product's real strengths without exaggerating security, compatibility, or support.

## Publication Boundary

The publication model is one-way:

```text
PRIVATE ENGINEERING REPO
satori_bridge
├── complete private history
├── internal specs/plans
├── benchmark/correction evidence
├── publication exporter
└── product source
          │ explicit allowlist only
          ▼
PUBLIC PRODUCT REPO
mcp-dev-bridge-public
├── clean product source
├── polished user documentation
├── tests + CI
└── fresh Git history
```

The public repository must never be produced by copying the private tree and deleting unwanted files afterward. The export contract is deny-by-default: if a path is not explicitly approved, it is not exported.

Future public releases are generated from the private source of truth. Manual synchronization from private to public is not an accepted release workflow.

## Private Repository Responsibilities

The private `satori_bridge` repository keeps:

- all engineering history;
- `docs/superpowers/**`;
- internal design and implementation plans;
- benchmark/correction chronology explaining candidate decisions;
- publication/export implementation and tests;
- machine-specific development evidence already ignored by Git;
- future internal evaluation material.

The publication exporter itself is private engineering machinery and must not be exported.

## Public Repository Scope

The public repository contains only material required to understand, install, operate, test, and contribute to the released product.

### Approved top-level files

The initial public tree should contain finalized versions of:

```text
README.md
LICENSE
SECURITY.md
CONTRIBUTING.md
.env.example
.gitignore
```

A public CI configuration under `.github/` is part of the product release.

### Approved product directories

The public tree may contain the finalized product subset of:

```text
bin/
config/
examples/
lib/
providers/
scripts/
systemd/
tests/
```

The exporter must enumerate exact paths or deliberately bounded subtrees. Recursive copying is allowed only where the entire subtree is intentionally public and publication tests reject runtime/local artifacts.

### Approved user-facing documentation

The initial public documentation set should be limited to finalized product docs such as:

```text
docs/acceptance.md
docs/architecture.md
docs/configuration.md
docs/development.md
docs/installation.md
docs/operations.md
docs/security.md
```

`docs/migration-from-local-bridge.md` may be included only if rewritten as a useful external migration guide with private-history/publication commentary removed.

## Explicitly Forbidden Public Material

The exporter must reject or omit all of the following regardless of whether they are currently tracked or ignored:

```text
docs/superpowers/**
docs/benchmarks/**
config/logs/**
config/sessions/**
run/**
**/node_modules/**
**/__pycache__/**
*.pyc
.git/**
.worktrees/**
```

The initial public release also omits implementation-history narrative whose purpose is to explain candidate selection, correction phases, worktree strategy, agent coordination, or how the repository was built.

A publication failure is preferable to silently exporting a newly added internal file.

## Public Product Security Model

The public release has two explicit trust profiles with simple semantics.

### `restricted`

The public `restricted` profile exposes only workspace-confined Pi file primitives:

```text
read
edit
write
```

It must not expose the legacy Shell provider. This removes the false implication that the current command allowlist confines arbitrary shell/file behavior to the configured workspace.

The public docs may describe this profile as workspace-confined file access, subject to the documented path and symlink boundary semantics.

### `trusted-dev`

The public `trusted-dev` profile exposes:

```text
read
edit
write
bash
```

`bash` is intentionally unrestricted and executes with the effective permissions of the Linux account running the bridge. Documentation must state this plainly and must not present it as a sandbox.

### Identity/authentication boundary

Built-in 1MCP OAuth is an MCP/OAuth authorization mechanism, not by itself a sufficient human identity perimeter for an arbitrary internet-facing service. Public documentation must not imply that its consent page authenticates an owner, employee, tenant, or customer.

The release should describe itself as a self-hosted bridge. Internet/public connectivity must be documented in terms of a trusted authenticated perimeter appropriate to the deployment and the currently supported ChatGPT/MCP connectivity model.

The release must not claim to be ready for arbitrary multi-user SaaS hosting. A hosted multi-tenant product would require a separate identity, tenant-isolation, authorization, resource-ownership, abuse-control, and operational design.

### OAuth lifecycle limitation

The pinned 1MCP OAuth implementation currently uses finite-lived access-token sessions and does not provide refresh-token exchange. Public docs must not promise permanent unattended connectivity. The limitation should be stated as a beta/runtime constraint until the authentication layer changes.

## Product Positioning and Public Voice

The public README should describe the product that exists, not the engineering process that produced it.

The primary product story is:

> A self-hosted Linux/WSL development bridge that gives ChatGPT four native coding primitives: Read, Edit, Write, and optional trusted Bash.

The tone should be confident and technically credible rather than hype-heavy. The README should make the value obvious within the first screen:

- compact tool surface instead of a large generic MCP catalog;
- workspace-relative file operations;
- exact guarded edits and create-only writes;
- native Bash semantics for explicitly trusted machines;
- OAuth-capable MCP gateway with local lifecycle management;
- clear `restricted` versus `trusted-dev` authority.

It should avoid internal candidate names, benchmark correction history, and implementation chronology.

The project must use its own primary identity. `ChatGPT` may be used descriptively, but the public repo must not imply that the project is created, certified, supported, or endorsed by OpenAI. A concise independence/trademark notice belongs in the README.

## README Design

The public README should be rewritten for discovery and adoption rather than inherited from the private engineering repo.

Recommended structure:

1. **Hero:** product name, one-line value proposition, short independent-project notice.
2. **Why it exists:** explain the problem in two or three sentences: coding through generic MCP tool catalogs often creates excessive schemas, awkward path semantics, and noisy results.
3. **Four primitives:** show `Read`, `Edit`, `Write`, `Bash` with one-line semantics.
4. **Trust profiles:** a compact `restricted` vs `trusted-dev` comparison.
5. **How it works:** one small architecture diagram (`ChatGPT -> authenticated MCP route -> 1MCP -> dev provider -> Linux/WSL workspace`).
6. **Quick start:** prerequisites, setup, render profile, install/start service, connect, verify.
7. **Behavior that matters:** workspace confinement for file tools, exact edit semantics, create-only write, bounded/recoverable Bash output, Linux-user authority for trusted Bash.
8. **Security model:** clear warning that trusted Bash is full service-user authority and that self-hosted identity/access perimeter matters.
9. **Operations:** status, stop/start, state locations, troubleshooting links.
10. **Project status:** public beta, supported environment, known OAuth/session limitation.
11. **Contributing / license / independence notice.**

The README should be skimmable, with short sections and examples. It should not read like a research paper or internal postmortem.

## Documentation Rewrite

The public docs should be edited as a coherent set rather than copied verbatim.

### `docs/installation.md`

Optimize for successful first install. Put prerequisites and exact commands first. Separate required steps from optional/system-specific details. Avoid internal migration language.

### `docs/configuration.md`

Explain the two profiles, workspace root, state directory, public URL, tunnel identity, and output policy in terms of user decisions. Use concrete examples with generic paths/domains only.

### `docs/architecture.md`

Keep it concise: runtime path, provider boundary, state ownership, and process model. Remove transitional/future-candidate language.

### `docs/security.md`

Make this one of the strongest docs. Clearly distinguish workspace-confined file primitives from unrestricted trusted Bash, explain the OAuth/identity boundary, state what the bridge does not sandbox, and give deployment expectations without generic fear language.

### `docs/operations.md`

Focus on day-two use: status, start/stop/restart, logs/state, watchdog behavior, recovery, and safe upgrades.

### `docs/development.md`

Explain the public contributor-facing code layout and test commands only. Do not expose private planning workflows or agent coordination conventions.

### `docs/acceptance.md`

Turn it into a release/installation verification checklist that an external user can actually run.

The docs should cross-link minimally and consistently so users do not have to hunt through the repository.

## Runtime Packaging

The initial public beta may retain the current pinned runtime architecture if documentation is accurate about prerequisites and limitations.

The release currently expects Linux/WSL capabilities including Node/npm, `uv`/`uvx`, `cloudflared`, `curl`, `flock`, and systemd user services where the supplied unit installer is used.

The current setup applies a version-specific compatibility patch to pinned 1MCP. This is acceptable for the first public beta only if:

- the exact 1MCP version remains pinned;
- the patch remains fail-closed against unexpected source contents;
- public documentation discloses the behavior;
- publication tests verify the pin/patch contract.

A later release should prefer a bridge-owned isolated 1MCP runtime rather than modifying a global npm installation, but that is not required for creating the first clean public tree.

## Exporter Design

The private exporter performs publication as a staged transaction.

### Inputs

- private source root (`satori_bridge`);
- explicit allowlist/manifest owned by the private repo;
- destination path, defaulting to `/home/hamza/repo/mcp-dev-bridge-public`.

### Staging

The exporter creates a temporary staging tree outside the public repo and copies only allowlisted product files into it.

It must not copy the whole private repository and prune afterward.

### Release transformations

Where private source files contain internal-only sections unsuitable for the public product, the release process may either:

1. maintain separate public source documents/templates; or
2. apply small deterministic publication transformations with tests.

Prefer direct exportability. Transformation logic should be limited mainly to public documentation/release metadata.

### Validation before destination update

Before changing the public destination, staging must pass:

- exact allowlist/forbidden-path validation;
- scans for known local identifiers and private absolute-path patterns;
- scans for credential/token/key patterns;
- checks that no `.git`, logs, sessions, runtime state, internal plans/specs, or benchmark chronology are present;
- product tests runnable from the staged tree;
- syntax/static validation;
- public documentation consistency checks;
- dependency lockfile/audit checks practical in the release environment.

Validation failures leave the existing public destination untouched.

### Destination update

For initial creation, the exporter populates `/home/hamza/repo/mcp-dev-bridge-public` only after staging passes.

The destination becomes an independent Git repository. It must not contain Git objects, refs, alternates, worktree metadata, submodules, or any mechanism linking it to private history.

For future exports, the exporter may update the public working tree while preserving the independent public `.git`. It must refuse destructive replacement when the public repo has uncommitted changes unless an explicit release workflow handles them.

## Fresh Public Git History

The initial public repo is initialized from the validated product snapshot and receives a clean initial commit such as:

```text
Initial public release
```

No private commits are grafted, filtered, squashed, cherry-picked, or imported. Public history starts at the publication boundary.

The exporter must not configure a remote and must not push to GitHub. Remote creation/push is a separate explicit action after final review.

## CI and Release Gates

The public tree should include basic GitHub Actions CI exercising portable verification, including where practical:

```text
tests/harness.sh
tests/publication.sh
tests/lifecycle.sh
Pi provider tests
bash syntax checks
Node syntax checks
npm audit --omit=dev for the Pi provider
```

Checks that require a live Cloudflare hostname, user systemd bus, or already-authorized ChatGPT client must remain separate from portable CI.

The private exporter must run a release gate at least as strict as public CI before producing an export.

## Publication Tests

The private publication suite should make the boundary executable.

At minimum it must prove that:

- every exported path is allowlisted;
- forbidden private directories cannot enter the export;
- `docs/superpowers` and internal benchmark chronology are absent;
- known machine identifiers and private absolute paths are absent;
- tracked or ignored local logs/sessions cannot be exported;
- public `restricted` exposes only `read`, `edit`, and `write`;
- public `trusted-dev` exposes `read`, `edit`, `write`, and `bash`;
- public docs do not claim legacy Shell is workspace-confined;
- public docs do not claim multi-user SaaS readiness;
- public docs contain an independence/non-endorsement statement;
- public docs contain no internal correction/candidate chronology;
- the public tree contains no private Git linkage;
- README quick-start commands match the exported product behavior.

## Error Handling and Safety

Publication is fail-closed.

The exporter must stop without updating the public tree when:

- an allowlisted source file is missing;
- an unexpected path appears in staging;
- a privacy/credential scan finds a non-approved match;
- staged product tests fail;
- the public destination is dirty when an update would overwrite user changes;
- public Git independence cannot be established.

Partial exports must never become the public working tree.

## Initial Release Success Criteria

The first public tree is ready for final human review when all of the following are true:

1. `/home/hamza/repo/mcp-dev-bridge-public` is a brand-new independent Git repository with one clean initial commit and no remote.
2. No private history, internal plans/specs, benchmarks, logs, sessions, runtime state, local identifiers, or known credentials are present.
3. `restricted` contains only `read/edit/write`; `trusted-dev` contains `read/edit/write/bash`.
4. Portable tests and CI configuration pass from the public tree.
5. README and docs are rewritten as polished public product material, with no stale CodeDB/correction narrative.
6. Security and OAuth limitations are accurately stated.
7. The product is positioned as an independent self-hosted bridge for ChatGPT, not as OpenAI software and not as multi-user SaaS.
8. The private `satori_bridge` repository and its current live deployment remain intact unless a later explicit deployment change is approved.

## Non-Goals for This Publication Pass

This release does not implement:

- a hosted multi-tenant SaaS control plane;
- tenant isolation or customer account management;
- a new OAuth provider or refresh-token system;
- the deferred CodeDB repository router;
- a terminal/PTY provider;
- replacement of the globally installed 1MCP runtime with an isolated package runtime;
- GitHub repository creation or pushing to any remote.

Those are separate product decisions after the clean public beta exists.
