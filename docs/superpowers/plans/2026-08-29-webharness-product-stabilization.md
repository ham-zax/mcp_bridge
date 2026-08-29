# WebHarness Public Reference Implementation Stabilization Plan

**Goal:** Turn the current full WSL workstation implementation into a coherent public WebHarness reference implementation and capability showcase. Preserve the architecture that is actually used today, publish enough setup/runtime machinery for an engineer to reproduce or fork it, and make the public `webharness` repository the source of truth for the demonstrated system.

**Positioning:** WebHarness is not being launched as a supported end-user product in this wave. The repository should show what a high-capability ChatGPT local workstation can do, explain its ownership and trust boundaries precisely, and provide a reproducible reference deployment. Forkers are expected to adapt platform, dependency, profile, and transport choices to their own environment.

**Architecture:** Keep the existing Dev, Code, Terminal, and Local boundaries. Keep Browser capabilities behind Local. Keep Cloudflare + 1MCP as the demonstrated transport. Product work is limited to publishing the real capability surface, giving it one coherent identity, adding a thin operator shell and diagnostics, documenting the qualified reference environment and known limitations, and promoting the implementation into the existing public `webharness` repository.

**Tech Stack:** Bash, Node.js 24+, 1MCP 0.36.0, systemd user services, tmux, CodeDB, Agent Browser, Chrome DevTools MCP, Clearcote, Cloudflare Tunnel, WSL2/WSLg, and optional Windows Chrome integration.

## Global Constraints

- No ChatGPT worker chats, `agents` MCP tool, session recorder, or subagent runtime is activated in this wave. Agents are the next independent capability after stabilization. The inactive vendored ChatGPT extension snapshot and the explicit post-stabilization Agents implementation plan may be published now so the later wave starts from pinned source rather than re-fetching it.
- No Workspace object, `workspaceId`, worktree management, project authority, or project lifecycle.
- No OpenAI Secure MCP Tunnel work in this wave; Cloudflare + 1MCP remains the demonstrated transport.
- No Electron/desktop control plane or replacement chat UI.
- Do not redesign the model-facing provider boundaries: Dev, Code, Terminal, and Local remain the public domains; browser capabilities remain behind Local.
- Keep the existing `personal` profile key. Public copy may call it **Personal Workstation**, but it is the full reference deployment rather than a separately supported edition.
- Preserve existing internal compatibility identifiers such as `mcp-dev-bridge.service`, `mcp-dev-bridge` state directories, `%LOCALAPPDATA%\\mcp-dev-bridge`, provider package paths, and `wsl-agent-*` where renaming adds no showcase value.
- Preserve the explicit `--enable-startup` consent boundary. Setup without it must not silently enable linger or persistent user services.
- Describe WSL2 + Ubuntu + x86_64 + Node.js 24+ + systemd user services + WSLg as the **qualified reference environment**, not as a general compatibility promise. Document Windows Chrome integration as an additional capability with its own prerequisites.
- Keep `restricted` and `trusted-dev` as examples of smaller authority profiles; lead the showcase with the full `personal` workstation because that is the architecture being demonstrated.
- Do not turn current personal-toolbox choices or the globally installed/patched 1MCP runtime into launch blockers. Document them as reference-deployment assumptions and implementation limitations.
- Do not restart or rerender the live installed workstation until the public source has been prepared. Runtime cutover is final proof that the published source is the implementation actually in use.

## Showcased Capability Contract

Model-facing full-workstation composition:

```text
Dev       read edit write file_ops wait bash pc_sleep
Code      code_search code_context code_symbol
Terminal  terminal_open terminal_read terminal_send terminal_resize
          terminal_list terminal_yield terminal_close
Local     tool_list tool_schema tool_call
            |-- browser-fast      routine observe / execute
            `-- browser-devtools  deep Chrome DevTools diagnostics
```

`browser-devtools` is the public logical name for the current heavyweight `browser` downstream server. The provider directory may remain `providers/browser/`. Update Local composition, operational guidance, and any current harness routing instructions that depend on the logical server name. `browser-fast` remains the compact routine-interaction surface in this wave.

Reference operator flow:

```text
git clone <webharness>
cd webharness
cp .env.example .env
./bin/webharness doctor --profile personal
./bin/webharness setup --profile personal --enable-startup
webharness status
```

This flow demonstrates the reference environment; it is not a promise that every qualifying machine is automatically supported. Existing lower-level scripts remain repair/development primitives.

## Public Distribution Boundary

Publish:

- Dev, Code, Terminal, Local, Browser Fast, Browser DevTools, their provider/runtime code, and required configuration templates.
- Generic extension machinery: `bin/extension`, `scripts/manage-extension.mjs`, and generic extension contracts/documentation.
- The inactive pinned ChatGPT worker-adapter snapshot at `third_party/chat-on-steroids-extension/` plus `docs/superpowers/plans/2026-08-29-webharness-agents-implementation.md`; neither is wired into the stabilization runtime.
- The thin `webharness` operator CLI, lifecycle scripts, reference setup/diagnostics, systemd templates, and `wsl-term`.
- Current architecture/security/operations documentation needed to understand and reproduce the reference implementation.

Exclude from the core public reference distribution:

- machine-local configuration, generated/runtime state, OAuth/session state, secrets, logs, and browser profiles;
- engineering-history plans/specs, benchmarks, and experiments that are not needed to understand current behavior;
- bundled domain-specific/private extensions;
- the broad tracked Skill snapshot unless a specific Skill is intentionally curated as part of the public reference;
- the optional WebSession adapter in this stabilization wave.

The publication gate and release staging must use the same classification rules so the repository cannot advertise capabilities whose generic implementation is omitted.

---

### Task 1: Publish the real workstation boundary

**Files:**
- Modify: `tests/publication.sh`
- Modify: `docs/development.md`
- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `providers/README.md`
- Include/update generic extension files as needed

**Outcome:** The public source represents the full workstation that is actually used rather than the old intentionally reduced bridge subset.

**Steps:**
- [ ] Replace the old “public base bridge vs private personal harness” publication model with one public reference implementation containing Dev, Code, Terminal, Local, Browser Fast, Browser DevTools, personal profile/templates, the reference bootstrap, Terminal services, CodeDB/Clearcote setup, and `wsl-term`.
- [ ] Publish the generic extension mechanism (`bin/extension`, `scripts/manage-extension.mjs`, generic extension documentation/contracts) while keeping bundled domain-specific/private extensions outside the core reference distribution.
- [ ] Preserve the inactive pinned `third_party/chat-on-steroids-extension/` snapshot, its MIT attribution/provenance, and `docs/superpowers/plans/2026-08-29-webharness-agents-implementation.md` through release staging. Do not install, load, configure, or advertise an active Agents runtime in this stabilization wave.
- [ ] Keep machine-local state, OAuth/session material, credentials, browser profiles, generated files, logs, experiments/benchmarks, and non-current engineering history outside the public distribution.
- [ ] Keep the broad tracked Skill snapshot outside the core distribution unless a specific Skill is intentionally curated for the reference implementation.
- [ ] Make the publication classifier the single source of truth for release staging; Task 6 must consume the same public-path decision instead of maintaining a second hand-written include/exclude list.
- [ ] Update publication checks to assert the showcased capability composition and absence of private deployment identity/secrets.

**Acceptance criteria:**
- Public classification includes every generic implementation required by the capabilities the README advertises.
- Generic Extensions work from the published source even though private/domain-specific extensions are absent.
- Release staging and publication validation cannot disagree about whether a path is public.

---

### Task 2: Establish WebHarness identity and capability vocabulary

**Files:**
- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: current user-facing docs
- Modify: `bin/start`
- Modify: `bin/status`
- Modify: `bin/stop`
- Modify: `systemd/mcp-dev-bridge.service.in` only for user-visible description text
- Modify: `config/templates/mcp-local.json`
- Modify: Local/browser docs and any current routing guidance that names the downstream browser server

**Outcome:** The repository reads as one system with capability names that describe responsibility rather than implementation history.

**Steps:**
- [ ] Replace user-visible `WebSession MCP Bridge` / `MCP Development Bridge` branding with **WebHarness**.
- [ ] Preserve `mcp-dev-bridge.service`, XDG/state roots, Windows browser profile roots, tmux namespaces, package paths, and other internal compatibility names unless the name itself is model-facing or materially confusing.
- [ ] Keep the top-level vocabulary: Dev, Code, Terminal, Local, Browser, Browser DevTools, Profiles, Extensions.
- [ ] Rename the Local heavyweight browser logical server from `browser` to `browser-devtools`; keep the implementation directory `providers/browser/` unless moving it adds concrete value.
- [ ] Keep `browser-fast` as the compact routine-interaction logical server for this wave. Public prose calls it **Browser** and calls `browser-devtools` **Browser DevTools**. Do not rename `browser-fast` merely to make the internal logical name match the public label; that would add churn without improving the showcased capability boundary.
- [ ] Update current routing guidance and model-facing examples so routine interaction chooses `browser-fast` and deep console/network/performance/CDP work chooses `browser-devtools`.
- [ ] Remove “private harness/private Terminal/private profile” wording from current operational material while preserving authority warnings and historical rationale where relevant.

**Acceptance criteria:**
- A first-time reader sees one product name and a clear distinction between routine Browser interaction and Browser DevTools diagnostics.
- Renaming the downstream logical server does not force unrelated state/service/browser-profile migration.

---

### Task 3: Add a thin operator shell and reference diagnostics

**Files:**
- Create: `bin/webharness`
- Create: `scripts/doctor.sh`
- Modify: `scripts/render-config.mjs`
- Modify: `scripts/setup.sh`
- Modify: `scripts/bootstrap-personal.sh`
- Modify: `docs/getting-started.md`
- Modify: `docs/operations.md`
- Modify: `docs/troubleshooting.md`

**Outcome:** The showcased system can be operated as one coherent installation without creating a second lifecycle/configuration implementation.

**Steps:**
- [ ] Expose only:

```text
webharness setup --profile restricted|trusted-dev|personal [--enable-startup] [--env-file PATH] [--state-dir PATH]
webharness doctor [--profile restricted|trusted-dev|personal] [--env-file PATH] [--state-dir PATH]
webharness start
webharness stop
webharness restart
webharness status
webharness extension list|install|remove ...
webharness help
```

- [ ] Keep `bin/webharness` as routing only: setup delegates to existing setup/bootstrap owners, restart is stop + start, and extension delegates to the existing extension manager.
- [ ] Install/update `~/.local/bin/webharness` as a symlink after successful setup and refuse to replace a non-symlink.
- [ ] Add `render-config.mjs --check` so profile/deployment/template validation can run without writing generated state.
- [ ] Implement `doctor` as non-mutating reference diagnostics. If `--profile` is supplied, diagnose it; otherwise use rendered `MCP_BRIDGE_PROFILE` when state exists; otherwise require an explicit profile rather than silently defaulting to `personal`.
- [ ] For `personal`, report whether the machine matches the qualified reference environment and current toolbox assumptions. Distinguish required failures from capability-specific or optional warnings; do not claim broad platform compatibility.
- [ ] If rendered state exists, inspect provider composition, Local inner composition, source-root consistency, generated ownership/permissions, and current lifecycle/status evidence without launching providers merely to make diagnostics green.
- [ ] Preserve `--enable-startup` as the only path that enables linger or persistent user services.
- [ ] Preserve Terminal lifetime ownership: tmux owns PTYs; the broker owns transcript/control state; bridge restart does not own Terminal processes.

**Reference-deployment limitation:** `scripts/install-bridge-runtime.sh` currently globally installs pinned 1MCP and applies two source-level compatibility patches to that global package. Document that WebHarness assumes ownership of that qualified global 1MCP runtime in the reference environment; do not redesign runtime packaging in this wave.

**Acceptance criteria:**
- The CLI demonstrates one coherent operator surface while lower-level scripts remain the real implementation owners.
- Doctor is safe before setup and clearly communicates reference assumptions rather than support guarantees.
- Running setup on the demonstrated environment remains repeatable enough to reproduce the showcased system.

---

### Task 4: Document the public MCP contract and current architectural limits

**Files:**
- Create: `docs/compatibility.md`
- Modify: `docs/architecture.md`
- Modify: `docs/security.md`
- Modify: `docs/operations.md`
- Modify: `README.md`

**Outcome:** An engineer can tell which interfaces are intentionally stable, which names are implementation details, and where the current ChatGPT/MCP boundary limits the system.

**Steps:**
- [ ] Document the model-visible contract in terms of tool names, required inputs, result/error semantics, annotations/authority meaning, and Local's `tool_list` / `tool_schema` / `tool_call` broker contract.
- [ ] Treat additive optional inputs, additive tools, and downstream Local catalog growth as compatible when existing meanings remain unchanged.
- [ ] Treat tool/provider removal, rename, new required input, semantic reinterpretation, materially incompatible result/error behavior, or authority-meaning change as breaking for the public MCP contract.
- [ ] Document `dev`, `code`, `terminal`, and `local` as current outer provider identities, while making clear that provider IDs are not by themselves the whole model-facing ABI.
- [ ] Document `mcp-dev-bridge` and `wsl-agent-*` names as retained implementation compatibility identifiers beneath WebHarness branding.
- [ ] Add a prominent current-limitation section for **Agents**: WebHarness controls tools/local runtimes through MCP but does not own ChatGPT model scheduling, so it cannot currently create first-class parallel ChatGPT workers.
- [ ] Record the intended next additive surface as one small first-class `agents` tool with `spawn`, `message`, `status`, and `finish`, backed first by a ChatGPT worker-conversation adapter and broker rather than by Dev/Terminal/Local redesign.
- [ ] State explicitly that Agents are not implemented by this plan and that Workspace/worktree/project-authority abstractions are not part of the product direction.

**Acceptance criteria:**
- Maintainers can identify a breaking model-facing change without relying on vague “schema refresh” language.
- The README/docs accurately explain why Chat WSL-style parallel workers are currently missing and how they can be added later without changing the existing capability domains.

---

### Task 5: Rewrite the public docs as a capability showcase

**Files:**
- Rewrite: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/getting-started.md`
- Modify: `docs/configuration.md`
- Modify: `docs/architecture.md`
- Modify: `docs/operations.md`
- Modify: `docs/security.md`
- Modify: `docs/personal/harness.md`
- Modify: `docs/troubleshooting.md`
- Create: `docs/reference-environment.md`
- Create: `docs/compatibility.md` if not already created in Task 4
- Modify: `providers/README.md`

**Outcome:** The public repository demonstrates capability and architecture first, with reproduction guidance second.

**Steps:**
- [ ] README first screen answers: what WebHarness is, what it enables ChatGPT to do, and why its architecture is broader than a direct coding bridge.
- [ ] Lead with the full Personal Workstation reference deployment; describe `restricted` and `trusted-dev` as smaller authority examples rather than product tiers.
- [ ] Include a compact capability comparison showing the tradeoff exposed by Chat WSL: WebHarness has semantic Code, durable Terminal ownership, condition waits, Browser/DevTools, and generic downstream MCP routing; Chat WSL-style first-class Agents and cross-chat recordings remain a current gap.
- [ ] Include at least one end-to-end workflow that demonstrates the orchestration value, for example: inspect code -> start durable service -> wait for readiness -> exercise Browser -> inspect Browser DevTools -> modify source -> preserve process across bridge restart -> hand Terminal to human -> resume model control.
- [ ] Keep installation concise. Point to `webharness doctor`, `setup`, `status`, and Operations, but avoid presenting the repository as a universally supported installer.
- [ ] Replace “Platform Support” language with **Reference Environment** language: document the WSL2/Ubuntu/x86_64/Node/systemd/WSLg environment actually qualified, plus optional Windows Chrome prerequisites and the Linux-vs-Windows browser ownership model.
- [ ] Explain the current global patched 1MCP assumption, personal-toolbox assumptions, and other reproduction caveats in an explicit “Reference implementation / forking” section instead of solving them as launch blockers.
- [ ] Security explains profile authority, Local's single authorization domain, dedicated MCP Chrome vs everyday Chrome, artifact allowlisting, human Terminal ownership, external sensitive state, and startup-consent boundaries.
- [ ] Move chronology and benchmark archaeology out of the main user journey; architecture docs explain accepted design outcomes and link to history only when rationale is useful.

**Acceptance criteria:**
- A technically experienced reader can understand the architecture and differentiating capabilities before reading installation details.
- The repository makes no unsupported claim of broad platform support or turnkey product support.
- Fork/adapt expectations and current limitations are explicit rather than hidden.

---

### Task 6: Qualify, promote, and self-host the public reference source

**Files/Repositories:**
- Modify: `tests/publication.sh`
- Modify: `docs/development.md`
- Modify: `docs/acceptance.md`
- Update/create: `.github/workflows/ci.yml` only to cover the public provider/source set already mandated by repository policy
- Source: `/home/hamza/repo/websession_mcp_bridge`
- Destination: `/home/hamza/repo/webharness`

**Outcome:** The public repository is not a stale subset: it contains the demonstrated implementation, passes the repository's required portable checks, and becomes the source used by the live workstation.

**Steps:**
- [ ] Update the existing publication/provider checks to the new public classification, including generic extension machinery and the `browser-devtools` logical name, without introducing a second test architecture.
- [ ] Keep portable validation independent of live Cloudflare credentials, ChatGPT OAuth, Windows Chrome automation, actual linger changes, and WSLg GUI launches.
- [ ] Keep a separate real-WSL reference qualification checklist for behavior portable CI cannot establish: doctor/setup/status, harmless calls through Dev/Code/Terminal/Local, Terminal lifetime across bridge restart, Local discovery of `browser-fast` and `browser-devtools`, and public endpoint/OAuth connectivity on the maintained reference machine.
- [ ] Build release staging from the authoritative public-path classifier. Preserve destination `.git/**`; never copy source Git history or private state into `/home/hamza/repo/webharness`.
- [ ] Promote the qualified source into the existing independent public repository as one coherent reference-implementation update and run the repository-required portable gate there.
- [ ] Make `/home/hamza/repo/webharness` the canonical development source after promotion; retain the engineering checkout only until the live reference cutover proves the public source.
- [ ] Cut the installed workstation over to the public checkout without migrating OAuth state, browser profile, state roots, tmux namespace, or service names. Rerender only source paths/configuration that must point at the new checkout.
- [ ] Preserve live tmux PTYs through cutover and restart only components whose executable/config source changed.
- [ ] Prove the public checkout with `webharness status` plus the maintained WSL reference qualification path before retiring the old source checkout.

**Acceptance criteria:**
- `/home/hamza/repo/webharness` contains the full generic reference implementation and retains independent public Git history.
- The maintained workstation actually runs from that public checkout.
- The public repository's validation proves the advertised source contracts without pretending to qualify every possible fork environment.

---

## Explicit Follow-ons - Not Part of This Plan

### Next capability: Agents

Agents are the primary known capability gap caused by WebHarness operating underneath ChatGPT through MCP rather than owning an API/model scheduling loop. The implementation is specified separately in `docs/superpowers/plans/2026-08-29-webharness-agents-implementation.md` and must begin only after this stabilization plan is complete. Its first-class model-facing surface is:

```text
spawn
message
status
finish
```

The model-facing contract should remain small while an Agent Broker owns worker identity, lifecycle, queues, result delivery, and backend selection. A ChatGPT worker-conversation/browser adapter is the likely first backend; future Codex/API runtimes should be replaceable underneath the same broker contract. This follow-on must not make normal Browser automation responsible for ChatGPT-worker orchestration.

### Other deferred work

- OpenAI Secure MCP Tunnel as an optional transport.
- Session recording, cross-chat history, checkpoint/resume, or journal systems beyond evidence required by an Agents implementation.
- Electron/desktop UI.
- Native macOS or native Windows host support.
- Core packaging of the optional WebSession HTTP adapter.
- Public curation/packaging of the broad tracked Skill snapshot and domain-specific extensions.
- Runtime isolation/package ownership work for 1MCP unless a future distribution goal requires supported installation alongside arbitrary third-party 1MCP consumers.

### Explicit non-direction

Do not add Workspace/worktree/project-authority or project-lifecycle abstractions merely because other coding-agent products use them. WebHarness is a workstation/runtime capability reference, not a project manager.

## Validation and Isolation Policy

- Repository verification remains governed by the mandatory checks already documented in `docs/development.md`; do not add new test architecture merely for this plan.
- Documentation-only edits use the repository's lightweight documentation checks until the candidate public source is ready for the required final gate.
- No additional worktree is required for this coherent stabilization effort unless concurrent writable work later creates an actual isolation need.
- Live runtime mutation remains deferred until the public source is ready for Task 6 cutover.

## Self-Review

- The plan now optimizes for a polished public reference implementation and capability showcase, not an end-user launch/support contract.
- The real Dev/Code/Terminal/Local/Browser architecture stays intact.
- Generic Extensions ship; private/domain-specific extensions and the broad Skill snapshot do not accidentally define the public core.
- The existing global patched 1MCP and personal-toolbox assumptions are documented as reference-environment constraints rather than expanded into a packaging redesign.
- Browser responsibility is clearer: `browser-fast` for routine interaction, `browser-devtools` for deep Chrome diagnostics.
- Agents are explicitly the next first-class additive capability and the main current limitation relative to Chat WSL-style collaboration.
- Workspace/worktree/project-authority abstractions remain outside the product direction.
- Public promotion and live self-host cutover remain because they prove that the showcased source is the implementation actually being used.
