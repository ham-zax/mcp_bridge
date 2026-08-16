# Contributing

Keep changes small, explicit, and easy to verify. This repository has a public bridge surface plus private personal-harness extensions; preserve that boundary.

## Before changing code

Read:

- [Architecture](docs/architecture.md)
- [Security](docs/security.md)
- [Development](docs/development.md)

If a change affects trust profiles, generated configuration, lifecycle, OAuth continuity, Terminal lifetime, or the model-facing tool surface, update the relevant tests and current documentation in the same change.

## Verification

For code/runtime changes, run the focused tests for what you changed, then the full gate before merging:

```bash
bash tests/harness.sh
bash tests/publication.sh
bash tests/lifecycle.sh
(cd providers/pi-dev && npm test)
(cd providers/terminal && npm test)
(cd providers/code-router && npm test)
bash scripts/check-personal-toolbox.sh
git diff --check
```

See [Development](docs/development.md) for syntax checks and long-running test guidance.

For documentation-only changes, keep the edit loop light: run `node scripts/check-doc-links.mjs`, scan for stale paths/claims, and use `git diff --check`. Run the full repository gate once before merge rather than after each prose edit.

## Documentation rules

- Primary docs describe the current accepted system, not project chronology.
- Put benchmark/design/plan archaeology under `docs/history/`.
- Do not copy private deployment identity, OAuth/session state, or credentials into public-facing files.
- Keep important old documentation URLs as small compatibility pointers when paths move.
- Prefer one authoritative explanation and links over duplicated guidance.

## Git hygiene

Use focused commits. Do not rewrite or force-delete other worktrees/branches without explicit ownership. Do not commit `.env`, generated state, OAuth/session files, logs, or runtime directories.
