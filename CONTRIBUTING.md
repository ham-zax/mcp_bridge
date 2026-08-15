# Contributing

## Local development

Work from an isolated branch/worktree when changing lifecycle or deployment behavior. Do not commit machine-specific deployment identity, credentials, generated 1MCP state, logs, sessions, or PID files.

Run before submitting changes:

```bash
bash tests/lifecycle.sh
bash tests/publication.sh
bash -n bin/* lib/bridge/*.sh scripts/*.sh tests/*.sh
node --check scripts/render-config.mjs
python -m py_compile providers/legacy-shell/server.py
git diff --check
```

## Design boundaries

- lifecycle code belongs under `bin/` and `lib/bridge/`;
- provider implementation belongs under `providers/`;
- profiles describe trust/capability policy, never deployment identity;
- local deployment paths and public hostnames belong in ignored `.env`/external generated state;
- `restricted` and `trusted-dev` semantics must remain testable across provider replacements.

## Compatibility changes

The bridge currently pins 1MCP and privileged providers. Dependency upgrades require regression testing of OAuth, lifecycle ownership, provider behavior, and the version-specific 1MCP CSP compatibility patch before changing those pins.
