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

## 4. Controlled service cutover and OAuth continuity

Perform the actual cutover from a **direct WSL terminal or another control process outside the MCP/1MCP process tree being replaced**. Do not run this sequence through the legacy MCP Shell: stopping its parent 1MCP also terminates the shell before the replacement service can start.

1MCP stores incoming OAuth client registrations and Bearer-token sessions beneath its writable `--config-dir`. Moving from the legacy repository config home to generated external state therefore requires a one-time OAuth continuity migration. Stop the old bridge first so that state is quiescent, then migrate only durable inbound OAuth records:

```bash
systemctl --user stop <legacy-unit>

scripts/migrate-legacy-oauth-state.sh \
  --from-config-dir <legacy-1mcp-config-dir>

systemctl --user disable <legacy-unit>
systemctl --user start mcp-dev-bridge.service
```

The helper copies active dynamic OAuth client registrations (`session_cli_*`) and active access-token sessions (`session_sess-*`) without overwriting conflicting destination state. It deliberately does **not** copy short-lived authorization codes/requests or Streamable HTTP transport session files. Those transport sessions describe individual MCP HTTP connections and should be recreated after the restart. Client-side OAuth state for upstream MCP servers is also outside this inbound ChatGPT continuity migration; reauthorize such upstreams separately if a custom deployment uses them.

The helper is safe to rerun when the destination records are byte-identical. Expired OAuth records are skipped. Generated state remains external to Git.

OAuth state migration preserves the scopes already granted to each access-token session; it does not expand authorization when new provider tags are added. If a deployment requires newly introduced scopes, complete a normal OAuth reauthorization/consent flow after the bridge is healthy.

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
