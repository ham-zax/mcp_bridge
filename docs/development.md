# Development

## Repository layout

```text
bin/            public lifecycle entrypoints
lib/bridge/     lifecycle/process internals
providers/      MCP provider implementations
config/         tracked templates and policy profiles
scripts/        setup, config rendering, compatibility helpers
systemd/        generic service template
tests/          behavioral/publication checks
```

Provider code should not leak into lifecycle code, and trust profiles should not encode machine identity.

## Verification

Run:

```bash
bash tests/lifecycle.sh
bash tests/publication.sh
bash -n bin/* lib/bridge/*.sh scripts/*.sh tests/*.sh
node --check scripts/render-config.mjs
python -m py_compile providers/legacy-shell/server.py
git diff --check
```

Lifecycle tests use isolated fake processes and paths; they must not restart the live bridge.

## Dependency pins

The current privileged runtime pins 1MCP, Pi coding primitives, the MCP SDK/Zod used by the `dev` provider, and the legacy shell dependency retained for the `restricted` profile. Upgrade them intentionally and rerun OAuth/lifecycle/provider acceptance. The 1MCP OAuth CSP compatibility patch is version-specific.

## Engineering history

`docs/superpowers/` contains internal design and implementation planning history. Public-facing documentation should not depend on those files being read by an installer or end user.

## Public-history hygiene

Removing machine-specific values from current files does not remove them from older commits. Before publication, inspect the history intended for release and use a reviewed squash/export/new-public-repository workflow if the existing private history contains deployment details that should not be published.
