# Migrating an Existing Local Bridge

This repository refactor does not automatically modify an already-installed legacy service. Migrate deliberately after merging the publication branch.

## 1. Create local deployment input

```bash
cp .env.example .env
```

Set the existing workspace root, public HTTPS origin, and optional Cloudflare tunnel name for the machine.

## 2. Render trusted development state

For a dedicated development machine that intentionally uses unrestricted Linux-user authority:

```bash
scripts/setup.sh --profile trusted-dev
```

This also verifies/applies the pinned 1MCP 0.34.4 OAuth consent CSP compatibility patch required for the HTTPS ChatGPT callback.

## 3. Install the generic unit

```bash
scripts/install-systemd-user.sh
```

This installs/enables `mcp-dev-bridge.service`. It does not start it or disable an older unit automatically.

## 4. Controlled service cutover

Using the existing legacy unit name on the local machine:

```bash
systemctl --user stop <legacy-unit>
systemctl --user disable <legacy-unit>
systemctl --user start mcp-dev-bridge.service
```

Then verify:

```bash
bin/status
systemctl --user status mcp-dev-bridge.service --no-pager
```

Expected bridge status includes local readiness, cloudflared running, watchdog running, public health OK, and zero issues.

If the generic service fails, inspect its user journal and the external bridge/1MCP state before deciding whether to re-enable the legacy unit.

## 5. Cleanup only after verification

Remove an old installed service file only after the generic service has survived a clean restart and normal ChatGPT MCP usage.

## Public repository history

The private development history predates this publication scaffold and contains historical local deployment details. A future public release should publish a reviewed/squashed/exported history (or a new public repository derived from the clean tree) rather than exposing the private history unchanged.
