# Move the personal harness to a new Ubuntu WSL install

Use this procedure when replacing the WSL distribution or rebuilding the Linux side of the workstation. The repository owns executable code, provider pins, service templates, and bootstrap logic. A separate private archive carries browser/authentication and other machine-local state that must not be committed.

The migration target is Ubuntu on WSL x86_64 with systemd and WSLg available.

## What Git recreates

A fresh checkout plus `scripts/bootstrap-personal.sh --enable-startup` recreates:

- the pinned 1MCP runtime and all in-repo provider dependency trees;
- pinned CodeDB `0.2.5840`, verified by SHA-256 before use;
- Clearcote's Ubuntu/WSL runtime libraries and the browser build pinned by `clearcote@0.27.0`;
- `mcp-dev-bridge.service`, `wsl-agent-tmux.service`, and `wsl-agent-terminal-broker.service` from tracked templates;
- the rendered outer 1MCP composition and private Local/browser composition;
- `~/.local/bin/wsl-term`.

Do not copy rendered systemd units, `node_modules`, CodeDB, the Clearcote browser cache, PID files, or generated 1MCP config to the new WSL instance. The bootstrap recreates them with the new checkout and home paths.

## What the private archive carries

`scripts/export-personal-wsl-state.sh` creates one mode-`0600` `.tar.gz` containing, when present:

- the checkout's ignored `.env` deployment input;
- `~/.config/mcp-dev-bridge/`, including Browser Fast selection, browser memory, extension state, owner policy, artifact aliases, and form-profile data;
- `~/.cloudflared/` tunnel configuration and credentials;
- `~/.agents/` local downstream agent skills/state;
- `~/.local/share/mcp-dev-bridge/x-content-memory/`;
- managed Clearcote persistent profiles under the bridge state directory;
- persistent 1MCP runtime identity, template capability, admin state, OAuth client/refresh state, and presets.

The archive deliberately omits transient 1MCP transport sessions, runtime-owner/PID state, and Clearcote `DevToolsActivePort`/Chromium `Singleton*` locks.

This archive contains credentials, OAuth/session material, browser cookies, and authenticated browser state. Keep it private. Do not commit it, upload it to ChatGPT, or store it in an untrusted location.

## Before leaving the old WSL install

Stop the bridge so the browser profile and OAuth/session store have a consistent snapshot:

```bash
cd /path/to/websession_mcp_bridge
systemctl --user stop mcp-dev-bridge.service
scripts/export-personal-wsl-state.sh
```

If the bridge was started manually rather than by systemd, run `bin/stop` first. The exporter refuses to run while it can see a live 1MCP process or live managed Clearcote profile.

The exporter prints the archive path and any absolute external paths referenced by private configuration. Those external paths are not bundled automatically. They can include other Git repositories, a resume/artifact file, job-search source data, or another workflow workspace. Copy or reclone those separately.

After the archive is safely copied elsewhere, the old bridge can be restarted if needed:

```bash
systemctl --user start mcp-dev-bridge.service
```

Run the export again immediately before the final cutover if browser logins or OAuth state changed after the first archive.

## Prepare the new Ubuntu WSL instance

Use a normal WSL Ubuntu x86_64 user. The personal bootstrap expects Node.js 24+, npm, `uv`/`uvx`, and `cloudflared`; it qualifies or installs the remaining approved CLI toolbox without replacing an existing Node/Python/systemd installation.

Ensure the WSL distro uses systemd. If it is not already enabled, `/etc/wsl.conf` needs:

```ini
[boot]
systemd=true
```

After changing `wsl.conf`, shut down and reopen WSL from Windows so the user systemd manager and WSLg environment start normally.

Clone the repository and select the intended revision before restoring private state:

```bash
git clone <repository-url> ~/repo/websession_mcp_bridge
cd ~/repo/websession_mcp_bridge
git checkout <revision>
```

## Restore private state

Copy the private archive into the new WSL filesystem, then run:

```bash
scripts/import-personal-wsl-state.sh /path/to/mcp-dev-bridge-wsl-private-YYYYMMDD-HHMMSS.tar.gz
```

Import is intentionally fail-closed: it refuses to overwrite an existing `.env`, `~/.config/mcp-dev-bridge`, `~/.agents`, Cloudflare credential directory, Clearcote profile tree, or persistent 1MCP state. Run it on the fresh user profile before the first personal bootstrap.

If the old and new Linux usernames differ, the importer rewrites the old home-directory prefix in text configuration, owner files, Cloudflare config, local agent skills, and X-content memory. It does not mutate the Chromium profile databases.

The importer prints the external absolute paths discovered during export. Restore or reclone them at the equivalent new-home locations before using workflows that reference them. Private configs that pointed under the old home directory are rewritten to the new home automatically.

## Rebuild and start the workstation

From the new checkout:

```bash
scripts/bootstrap-personal.sh --enable-startup
bin/status
```

The bootstrap installs the pinned CodeDB binary, installs any missing Chromium runtime libraries required by Clearcote, downloads and verifies Clearcote's pinned browser build, renders systemd units with the new paths, enables user linger, and starts the three personal services.

A healthy move should show the bridge and Terminal services active and `bin/status` with `issues: 0`.

For the Linux browser, use the normal Local -> `browser-fast` route with `browser_target="linux"`. The imported `browser-fast.json` selects the same managed Clearcote profile, and the imported profile supplies its cookies/site state. `humanize: true` remains the default for managed Clearcote profiles.

Browser authentication is best-effort portable state, not a guarantee. If Chromium's credential encryption or a site invalidates the moved session, complete login/MFA manually in the visible WSLg browser; do not replace the imported profile with a shell-launched second browser.

## Client-side state

The private archive restores the WSL-side `~/.agents` tree, but ChatGPT's installed Skills and MCP connection are client-side state. On the new workstation/session:

- install or refresh the desired tracked Skills from `skills/` in ChatGPT;
- keep the same public MCP URL if you want the server identity/session migration to have a chance to remain continuous;
- reconnect or complete OAuth again if the client does not accept the migrated server-side session state;
- refresh the MCP tool catalog after any model-facing provider/schema change.

Do not copy the old rendered `~/.config/systemd/user/*.service` files. They contain absolute paths from the old checkout; `bootstrap-personal.sh --enable-startup` is the owner that renders correct units for the new WSL instance.
