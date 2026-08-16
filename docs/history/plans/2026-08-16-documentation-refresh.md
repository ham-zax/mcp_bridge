# Documentation Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stale pre-Phase-2 guidance with a concise current documentation set, preserve engineering evidence under `docs/history/`, and keep important old documentation URLs useful through compatibility pointers.

**Architecture:** Primary docs become the authoritative operating surface: README plus focused guides for getting started, configuration, operations, architecture, security, development, troubleshooting, and the private personal harness. Historical benchmarks/specs/plans/agent coordination move under `docs/history/` and are explicitly non-current. Important old URLs remain as tiny pointer files, while a dependency-free Markdown link checker and publication assertions prevent stale structure from returning.

**Tech Stack:** Markdown, Bash test harnesses, Node.js built-ins only, Git.

## Global Constraints

- Documentation-only change: do not modify provider schemas or runtime behavior.
- Current docs describe the accepted Phase-2 surface exactly: Dev 6, Code 3, Terminal 6.
- `wait` belongs to Dev, not Terminal.
- Public `restricted` and `trusted-dev` behavior remains unchanged; private `personal` remains private.
- Preserve engineering evidence in Git; do not delete historical benchmark/spec/plan content.
- `docs/history/**` is non-public/private engineering history because it can contain historical machine-specific evidence.
- Important old public documentation URLs remain valid through pointer files.
- Internal old agent-plan/spec URLs do not require one stub per file; `docs/superpowers/README.md` is the compatibility index.
- No new npm/package dependency for documentation validation.
- Primary docs are current-state documentation, not chronological project journals.

---

## File Structure

### Current documentation

- Rewrite: `README.md` — five-minute project overview and quick start.
- Rewrite: `CONTRIBUTING.md` — contributor workflow and docs rules.
- Rewrite: `SECURITY.md` — short top-level security summary linking the detailed guide.
- Rewrite: `providers/README.md` — Dev/Code/Terminal provider map.
- Create: `docs/getting-started.md` — install, profile selection, first start, first connector check.
- Rewrite: `docs/configuration.md` — current inputs, profiles, state, renderer, personal composition.
- Rewrite: `docs/operations.md` — lifecycle, systemd, health, logs, restart/cutover, recovery.
- Rewrite: `docs/architecture.md` — accepted runtime/provider/state architecture only.
- Rewrite: `docs/security.md` — exact authority boundaries for all three profiles.
- Rewrite: `docs/development.md` — repository layout, verification, change/release workflow.
- Create: `docs/troubleshooting.md` — symptom/check/fix guide.
- Create: `docs/personal/harness.md` — practical 15-action personal harness guide.
- Rewrite: `docs/personal/toolbox.md` — concise zero-schema CLI toolbox guide.

### Compatibility pointers

- Rewrite: `docs/installation.md` — pointer to `getting-started.md`.
- Rewrite: `docs/acceptance.md` — pointer to current development verification plus archived acceptance evidence.
- Rewrite: `docs/migration-from-local-bridge.md` — pointer to current getting-started/operations plus archived migration evidence.
- Create: `docs/superpowers/README.md` — pointer/index for archived plans/specs/agent plans.
- Recreate each `docs/benchmarks/*.md` as a pointer to the corresponding historical benchmark.

### Historical archive

- Create: `docs/history/README.md`.
- Move: `docs/benchmarks/*.md` -> `docs/history/benchmarks/*.md` before recreating pointer files.
- Move: `docs/superpowers/plans/*` -> `docs/history/plans/*`.
- Move: `docs/superpowers/specs/*` -> `docs/history/specs/*`.
- Move: `docs/superpowers/agent-plans/*` -> `docs/history/agent-plans/*`.
- Move original `docs/acceptance.md` -> `docs/history/acceptance/acceptance-procedure.md`.
- Move original `docs/migration-from-local-bridge.md` -> `docs/history/acceptance/migration-from-local-bridge.md`.

### Validation

- Create: `scripts/check-doc-links.mjs` — dependency-free repository-relative Markdown link checker.
- Modify: `tests/publication.sh` — history privacy, current-doc surface, final README composition, compatibility pointers, and doc-link check.

---

### Task 1: Lock the new documentation/publication contract with failing tests

**Files:**
- Modify: `tests/publication.sh`

**Interfaces:**
- Consumes: existing `run_test`, `is_public_path`, and repository root logic.
- Produces: regression assertions for current docs and archive privacy; later tasks make these tests pass.

- [ ] **Step 1: Mark `docs/history/**` private and add current-doc structure assertions**

Update `is_public_path()` so the private list begins with:

```bash
    docs/history/* | \
    docs/superpowers/* | \
    docs/personal/* | \
```

Add:

```bash
test_current_documentation_surface() {
  for path in \
    README.md \
    docs/getting-started.md \
    docs/configuration.md \
    docs/operations.md \
    docs/architecture.md \
    docs/security.md \
    docs/development.md \
    docs/troubleshooting.md \
    docs/personal/harness.md \
    docs/history/README.md; do
    [ -f "$ROOT/$path" ] || { echo "missing current documentation: $path" >&2; return 1; }
  done

  grep -Fq 'read edit write wait apply_patch bash' "$ROOT/README.md" || return 1
  grep -Fq 'code_search code_context code_symbol' "$ROOT/README.md" || return 1
  grep -Fq 'terminal_open terminal_read terminal_send terminal_resize terminal_list terminal_close' "$ROOT/README.md" || return 1
  grep -Fq 'docs/history/' "$ROOT/README.md" || return 1
}

test_documentation_compatibility_pointers() {
  grep -Fq 'getting-started.md' "$ROOT/docs/installation.md" &&
  grep -Fq 'history/acceptance/acceptance-procedure.md' "$ROOT/docs/acceptance.md" &&
  grep -Fq 'history/acceptance/migration-from-local-bridge.md' "$ROOT/docs/migration-from-local-bridge.md" &&
  grep -Fq '../history/' "$ROOT/docs/superpowers/README.md"
}
```

Register both tests near the other publication-structure tests.

- [ ] **Step 2: Run the focused publication suite and verify RED**

Run:

```bash
bash tests/publication.sh
```

Expected: the new current-documentation and compatibility tests fail because the new files/archive/pointers do not exist yet. Existing unrelated tests remain green.

- [ ] **Step 3: Commit the RED contract**

```bash
git add tests/publication.sh
git commit -m "test: define current documentation publication contract"
```

---

### Task 2: Archive historical evidence without deleting it

**Files:**
- Create: `docs/history/README.md`
- Move: `docs/benchmarks/*` -> `docs/history/benchmarks/*`
- Move: `docs/superpowers/plans/*` -> `docs/history/plans/*`
- Move: `docs/superpowers/specs/*` -> `docs/history/specs/*`
- Move: `docs/superpowers/agent-plans/*` -> `docs/history/agent-plans/*`
- Move: `docs/acceptance.md` -> `docs/history/acceptance/acceptance-procedure.md`
- Move: `docs/migration-from-local-bridge.md` -> `docs/history/acceptance/migration-from-local-bridge.md`

**Interfaces:**
- Consumes: existing historical documents unchanged in meaning.
- Produces: one discoverable non-current archive; later compatibility stubs point into it.

- [ ] **Step 1: Move history with `git mv`**

Use `git mv`, preserving filenames exactly. Create target directories first. Do not rewrite historical prose during the move.

- [ ] **Step 2: Write `docs/history/README.md`**

It must say, in substance:

```markdown
# Engineering History

This directory preserves design, benchmark, implementation-plan, and acceptance evidence from earlier development phases. It is not the current operating manual.

For current behavior, start at the repository README and the primary guides under `docs/`.

The Phase-2 accepted checkpoint is the release tagged `personal-harness-phase2-2026-08-16`.

- `benchmarks/` — measured experiments and acceptance evidence
- `plans/` — historical implementation plans
- `specs/` — historical design specifications
- `agent-plans/` — parallel-agent coordination history
- `acceptance/` — superseded acceptance/migration procedures
```

- [ ] **Step 3: Verify content preservation**

Run:

```bash
git diff --summary --find-renames
```

Expected: historical files are detected as renames/moves, not deleted-and-recreated content rewrites, except for the new history README.

- [ ] **Step 4: Commit archive move**

```bash
git add docs/history docs/benchmarks docs/superpowers docs/acceptance.md docs/migration-from-local-bridge.md
git commit -m "docs: archive engineering history"
```

---

### Task 3: Rewrite the current documentation around the accepted architecture

**Files:**
- Rewrite: `README.md`
- Rewrite: `CONTRIBUTING.md`
- Rewrite: `SECURITY.md`
- Rewrite: `providers/README.md`
- Create: `docs/getting-started.md`
- Rewrite: `docs/configuration.md`
- Rewrite: `docs/operations.md`
- Rewrite: `docs/architecture.md`
- Rewrite: `docs/security.md`
- Rewrite: `docs/development.md`
- Create: `docs/troubleshooting.md`
- Create: `docs/personal/harness.md`
- Rewrite: `docs/personal/toolbox.md`

**Interfaces:**
- Consumes: accepted Phase-2 provider/config/lifecycle contracts and final acceptance evidence.
- Produces: authoritative current user/operator/maintainer documentation.

- [ ] **Step 1: Rewrite README as the five-minute entry point**

README order:

```text
What it is
Architecture
Trust profiles
Personal harness surface
Quick start
Day-to-day commands
Documentation map
Release/status
License
```

Required exact compact action lines:

```text
Dev       read edit write wait apply_patch bash
Code      code_search code_context code_symbol
Terminal  terminal_open terminal_read terminal_send terminal_resize terminal_list terminal_close
```

Keep the Cloudflare/1MCP compatibility note short and link to Operations for details.

- [ ] **Step 2: Write Getting Started and Configuration**

`docs/getting-started.md` must include:

```bash
cp .env.example .env
scripts/setup.sh --profile restricted
# or trusted-dev / personal as appropriate
bin/start
bin/status
```

Explain that `personal` is private WSL-user authority and requires the private composition, while public installs normally choose `restricted` or deliberately `trusted-dev`.

`docs/configuration.md` must document external generated state and all three profiles without historical migration narrative.

- [ ] **Step 3: Rewrite Operations and Architecture**

Operations must distinguish:

```text
mcp-dev-bridge lifecycle
wsl-agent-tmux.service lifetime authority
wsl-agent-terminal-broker.service metadata/transcript broker
```

Architecture must show Dev/Code/Terminal, with `wait` under Dev and canonical-Git-root Code routing.

- [ ] **Step 4: Rewrite Security, Development, and Troubleshooting**

Security must state explicit/manual sudo only and never stored/auto-filled.

Development must contain the exact full verification gate and documentation-history rule.

Troubleshooting must include the connector RPC ceiling as transport behavior: use durable Terminal + `wait` for long operations rather than one giant MCP Bash request.

- [ ] **Step 5: Write personal harness and tighten toolbox guide**

`docs/personal/harness.md` must explain the 15 actions by mental model and include examples for:

- focused Code lookup -> Files read -> edit/apply_patch -> Bash test;
- durable Terminal open/read/send;
- named `wait` create/resume;
- human `bin/wsl-term attach <session>` takeover.

- [ ] **Step 6: Run current-doc stale-language scan**

Run:

```bash
grep -RInE 'implementation not started|NEXT FRONTIER|PENDING TASK-7|PENDING TASK-8|CodeDB.*removed' \
  README.md CONTRIBUTING.md SECURITY.md providers/README.md \
  docs/getting-started.md docs/configuration.md docs/operations.md docs/architecture.md \
  docs/security.md docs/development.md docs/troubleshooting.md docs/personal || true
```

Expected: no stale current-state matches.

- [ ] **Step 7: Commit current documentation**

```bash
git add README.md CONTRIBUTING.md SECURITY.md providers/README.md docs/getting-started.md \
  docs/configuration.md docs/operations.md docs/architecture.md docs/security.md \
  docs/development.md docs/troubleshooting.md docs/personal
git commit -m "docs: rewrite current harness guidance"
```

---

### Task 4: Restore compatibility URLs with small pointer documents

**Files:**
- Create: `docs/installation.md`
- Create: `docs/acceptance.md`
- Create: `docs/migration-from-local-bridge.md`
- Create: `docs/superpowers/README.md`
- Create: `docs/benchmarks/*.md` pointer files matching archived benchmark filenames.
- Modify: `tests/publication.sh` migration-guide assertion.

**Interfaces:**
- Consumes: current docs and `docs/history/**` paths.
- Produces: stable high-value old URLs without stale duplicated guidance.

- [ ] **Step 1: Create the three primary pointer files**

Use this pattern:

```markdown
# Moved

This path is retained for link compatibility.

Current guidance: [Getting Started](getting-started.md)

Historical procedure: [archived migration evidence](history/acceptance/migration-from-local-bridge.md)
```

Adjust links/text for installation and acceptance.

- [ ] **Step 2: Create `docs/superpowers/README.md`**

It links to:

```text
../history/plans/
../history/specs/
../history/agent-plans/
```

and explicitly says those are historical engineering artifacts.

- [ ] **Step 3: Recreate benchmark pointer files automatically**

For every Markdown file in `docs/history/benchmarks/`, create the same basename under `docs/benchmarks/` with only:

```markdown
# Moved

This benchmark is preserved as historical engineering evidence.

[Open the archived benchmark](../history/benchmarks/<filename>)
```

- [ ] **Step 4: Replace the migration publication assertion**

Change `test_migration_guide_preserves_oauth_and_external_cutover()` into:

```bash
test_migration_guide_points_to_current_and_historical_guidance() {
  local doc="$ROOT/docs/migration-from-local-bridge.md"
  grep -Fq 'getting-started.md' "$doc" &&
  grep -Fq 'operations.md' "$doc" &&
  grep -Fq 'history/acceptance/migration-from-local-bridge.md' "$doc"
}
```

Update its `run_test` label accordingly.

- [ ] **Step 5: Run publication suite**

Run:

```bash
bash tests/publication.sh
```

Expected: the Task-1 documentation structure/pointer tests now pass; any remaining failure should be unrelated and investigated before continuing.

- [ ] **Step 6: Commit compatibility pointers**

```bash
git add docs/installation.md docs/acceptance.md docs/migration-from-local-bridge.md \
  docs/superpowers/README.md docs/benchmarks tests/publication.sh
git commit -m "docs: preserve documentation compatibility links"
```

---

### Task 5: Add dependency-free Markdown link validation

**Files:**
- Create: `scripts/check-doc-links.mjs`
- Modify: `tests/publication.sh`

**Interfaces:**
- Consumes: tracked/unignored Markdown files in the repository.
- Produces: exit 0 when local Markdown link targets exist; exit 1 with `file:target` diagnostics for missing repository-relative targets.

- [ ] **Step 1: Add a failing publication test before the checker exists**

Add:

```bash
test_documentation_links_resolve() {
  node "$ROOT/scripts/check-doc-links.mjs"
}
```

Register:

```bash
run_test 'repository-relative documentation links resolve' test_documentation_links_resolve
```

- [ ] **Step 2: Run publication suite and verify RED**

Expected failure: Node cannot find `scripts/check-doc-links.mjs`.

- [ ] **Step 3: Implement `scripts/check-doc-links.mjs` with Node built-ins**

Required behavior:

```javascript
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '--', '*.md'], {
  cwd: root,
  encoding: 'utf8',
}).trim().split('\n').filter(Boolean);

const skip = target =>
  target.startsWith('#') ||
  /^(https?:|mailto:|tel:)/i.test(target);

const cleanTarget = raw => {
  let target = raw.trim();
  if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
  target = target.split(/\s+["']/)[0];
  return target.split('#')[0].split('?')[0];
};
```

Parse inline Markdown links and reference-definition targets. Ignore images only as links with the same local-target semantics. Resolve a leading `/` from repository root; otherwise resolve relative to the Markdown file. Report every missing target and exit 1 if any are missing.

Do not validate URL reachability or heading anchors.

- [ ] **Step 4: Run the checker and repair broken links**

Run:

```bash
node scripts/check-doc-links.mjs
```

Update current docs and moved historical relative links until it exits 0. Do not alter historical prose beyond navigation/link path repairs.

- [ ] **Step 5: Run publication suite and verify GREEN**

```bash
bash tests/publication.sh
```

Expected: all publication tests pass including the new link check.

- [ ] **Step 6: Commit link validation**

```bash
git add scripts/check-doc-links.mjs tests/publication.sh README.md CONTRIBUTING.md SECURITY.md providers/README.md docs
git commit -m "test: validate documentation links"
```

---

### Task 6: Final documentation and product regression gate

**Files:**
- Verify all documentation changes.
- No new production files expected.

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: release-ready documentation refresh with unchanged runtime behavior.

- [ ] **Step 1: Run documentation checks**

```bash
node scripts/check-doc-links.mjs
bash tests/publication.sh
git diff --check
```

Expected: all pass.

- [ ] **Step 2: Run root behavior gates**

```bash
bash tests/harness.sh
bash tests/lifecycle.sh
bash scripts/check-personal-toolbox.sh
```

Expected: all pass.

- [ ] **Step 3: Run provider suites through durable Terminal if connector RPC duration is a concern**

```bash
(cd providers/pi-dev && npm test)
(cd providers/terminal && npm test)
(cd providers/code-router && npm test)
```

Expected: Pi 176/176, Terminal 45/45, Code 30/30 on the current accepted baseline unless legitimate test counts change only because documentation assertions were added outside provider suites.

- [ ] **Step 4: Run syntax checks**

```bash
bash -n bin/* lib/bridge/*.sh scripts/*.sh tests/*.sh
node --check scripts/*.mjs providers/pi-dev/*.mjs providers/terminal/*.mjs providers/code-router/*.mjs
git diff --check
```

- [ ] **Step 5: Verify no runtime implementation drift**

Run:

```bash
git diff --name-only personal-harness-phase2-2026-08-16..HEAD
```

Review every non-documentation path. The only expected non-documentation changes are `scripts/check-doc-links.mjs` and `tests/publication.sh`; no provider/config/systemd/lifecycle implementation file should change.

- [ ] **Step 6: Final commit if verification repairs changed files**

If the verification step required link/doc corrections, commit them separately:

```bash
git add README.md CONTRIBUTING.md SECURITY.md providers/README.md docs scripts/check-doc-links.mjs tests/publication.sh
git commit -m "docs: finalize documentation refresh"
```

- [ ] **Step 7: Push after user-approved execution**

Push the completed documentation commits to `main` only after the full gate is green. Do not move or rewrite the existing `personal-harness-phase2-2026-08-16` tag.
