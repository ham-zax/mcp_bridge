# Development

## Repository layout

```text
bin/                 lifecycle and human Terminal entrypoints
lib/bridge/          lifecycle/process supervision internals
providers/pi-dev/    Dev read/edit/write/file_ops/Bash/wait provider
providers/code-router/ Code facade + rooted CodeDB router
providers/terminal/  Terminal MCP, broker, tmux/transcript logic
providers/browser/   Browser facade + resource-local Chrome child routing
providers/local-tools/ stable Local tool broker over private inner 1MCP
providers/legacy-shell/ restricted-profile legacy shell
config/              tracked templates and trust profiles
scripts/             setup, rendering, migration, toolbox, installers
systemd/             user-service templates
tests/               root integration/publication/lifecycle contracts
docs/                current documentation
docs/history/        non-current engineering evidence
```

## Provider dependency setup

Fresh linked worktrees do not inherit ignored `node_modules`. Install pinned dependencies before running provider-aware root tests:

```bash
npm --prefix providers/pi-dev ci --omit=dev
npm --prefix providers/terminal ci --omit=dev
npm --prefix providers/code-router ci --omit=dev
npm --prefix providers/browser ci --omit=dev
npm --prefix providers/local-tools ci --omit=dev
```

## Full verification

```bash
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
(cd providers/pi-dev && npm test)
(cd providers/terminal && npm test)
(cd providers/code-router && npm test)
(cd providers/browser && npm test)
(cd providers/local-tools && npm test)
bash scripts/check-personal-toolbox.sh
node scripts/check-doc-links.mjs
bash -n bin/* lib/bridge/*.sh scripts/*.sh tests/*.sh
node --check scripts/*.mjs providers/pi-dev/*.mjs providers/terminal/*.mjs providers/code-router/*.mjs providers/browser/*.mjs providers/local-tools/*.mjs
git diff --check
```

If a single MCP Bash request risks exceeding the connector request window, run the long suite inside a durable Terminal session and use `wait`/`terminal_read` for completion evidence.

## Change boundaries

- Public profile behavior must not accidentally inherit private personal capability.
- Do not expose the raw CodeDB tool catalog.
- Do not make tmux lifetime depend on the broker or 1MCP.
- Keep `wait` durable and separate from the normal Terminal model-read cursor.
- Keep native Bash as the authoritative execution path.
- Preserve provider-internal same-canonical-path mutation serialization.

## Documentation

Current docs describe current behavior. Put design chronology, benchmarks, plans, agent coordination, and superseded acceptance procedures under `docs/history/`.

When moving an important old doc path, leave a small compatibility pointer rather than duplicated stale guidance.

For documentation-only work, keep the edit loop lightweight: check local Markdown links, stale paths/wording, and `git diff --check` while writing. Run the full repository gate once before merge; do not create RED/GREEN tests for prose wording or rerun provider suites after every documentation edit.

## Release checklist

1. run the full verification gate;
2. ensure the working tree is clean;
3. confirm generated live config points at the intended source root;
4. verify bridge `issues: 0` and public/local health;
5. push `main` only after the merged result is verified;
6. create tags/releases only at a known-good commit.

## Dependency upgrades

Treat 1MCP, Pi coding primitives, MCP SDK/Zod, CodeDB, tmux behavior, and the legacy restricted-shell dependency as qualified pins. Upgrade intentionally and rerun the relevant provider, lifecycle, OAuth, and product-path acceptance.
