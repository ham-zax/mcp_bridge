# Clearcote Browser as a `browser-fast` Backend

Date: 2026-08-25

Scope: upstream primary sources only for Clearcote facts, plus the four requested local files for integration context. I used the official `clearcotelabs/clearcote-browser` repository, release metadata, README/docs/source/package metadata/license, and archived the main upstream pages in Khiip for local provenance. Local `open-websearch` was not installed in this runtime, so discovery/fetching used direct GitHub/API retrieval instead.

## Key Conclusion

Clearcote Browser is feasible as the browser process behind `providers/browser-fast`, but not as a replacement for Agent Browser's command layer.

The smallest useful integration is to keep `AgentBrowserRunner` and Agent Browser 0.35.0 unchanged, launch or discover a Clearcote standing CDP endpoint, fetch its browser-level WebSocket URL from `/json/version`, and pass that WebSocket to the existing `--cdp` path. That preserves `browser-fast`'s existing accessibility snapshot refs, batch execution, tab binding, and upload behavior, all of which currently come from Agent Browser rather than Clearcote.

It is not a zero-change provider swap today because the local Windows path launches a dedicated visible Google Chrome profile through `ensureWindowsChrome()` and passes that endpoint to Agent Browser. There is no local configuration seam in the inspected files that points the Windows runner at Clearcote instead of Chrome. See `providers/browser-fast/server.mjs:254-270`, `providers/browser/windows-chrome-runtime.mjs:115-133`, and `docs/architecture.md:144`.

## What Clearcote Browser Is

Facts from upstream:

- Clearcote describes itself as an open-source Chromium distribution built on `ungoogled-chromium`, with source patches that move fingerprint control into the browser engine rather than page-injected JavaScript. Source: upstream README ["What it is"](https://github.com/clearcotelabs/clearcote-browser/blob/main/README.md#what-it-is).
- It is a real Chromium-based browser binary, not just a library, service, or CLI wrapper. The SDKs launch or serve a Clearcote browser executable, and the direct examples use `chrome`/`chrome.exe`. Source: upstream README ["Direct - any CDP client"](https://github.com/clearcotelabs/clearcote-browser/blob/main/README.md#direct--any-cdp-client); Node SDK source [`executablePath()` and launch path](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/node/src/index.ts#L245-L277).
- It also ships SDKs and CLIs around that browser: Node/Python/.NET SDKs, a Python `clearcote-serve` CLI, an npm/Python `clearcote-mcp` server, and Docker image. Sources: upstream README quick start and MCP/Docker sections; Node package metadata [`sdk/node/package.json`](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/node/package.json); Python package metadata [`sdk/python/pyproject.toml`](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/python/pyproject.toml); MCP package metadata [`mcp/pyproject.toml`](https://github.com/clearcotelabs/clearcote-browser/blob/main/mcp/pyproject.toml).

Inference:

- For `browser-fast`, Clearcote should be treated as a Chromium-compatible browser runtime with CDP exposure, not as an MCP tool surface to compose with `browser-fast`.

## Installation and Runtime Requirements

Facts from upstream:

- The current SDK metadata in the repository is `clearcote` `0.27.0` for Node and Python. Node requires Node `>=18` and depends on `playwright-core`; Python requires Python `>=3.8` and `playwright>=1.40`. Sources: [`sdk/node/package.json`](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/node/package.json#L1-L36), [`sdk/python/pyproject.toml`](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/python/pyproject.toml#L5-L31).
- The current pinned free browser release in the Node SDK is `v0.1.0-pre.22`, Chromium `149.0.7827.114`, with Windows x64 and Linux x64 assets. Source: [`sdk/node/src/release.ts`](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/node/src/release.ts#L35-L64).
- The GitHub release `v0.1.0-pre.22` is explicitly a pre-release and provides `clearcote-149.0.7827.114-windows-x64.zip` and `clearcote-149.0.7827.114-linux-x64.tar.xz`, with SHA-256 checksums and signatures. Source: [release `v0.1.0-pre.22`](https://github.com/clearcotelabs/clearcote-browser/releases/tag/v0.1.0-pre.22).
- The Node SDK README says Clearcote ships Windows x64 and Linux x64 binaries; on minimal Linux it requires `xz-utils`, system `tar`, browser runtime libraries such as `libnss3`, `libgbm1`, `libasound2`, X11/GTK-adjacent libraries, and container sandbox handling via `--no-sandbox` or a setuid `chrome-sandbox`. Source: [`sdk/node/README.md` platform note](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/node/README.md#clearcote-node--typescript-sdk).
- Build-from-source is documented as a Linux-host workflow that can build Linux x64 natively and Windows x64 by cross-compilation, needing roughly 16 GB+ RAM and 120 GB disk. Source: [`docs/BUILDING.md`](https://github.com/clearcotelabs/clearcote-browser/blob/main/docs/BUILDING.md#prerequisites).
- macOS and ARM64 are roadmap items, not current shipped binary targets in the inspected sources. Source: [`ROADMAP.md`](https://github.com/clearcotelabs/clearcote-browser/blob/main/ROADMAP.md#phase-5--beyond), plus the SDK's platform table in [`sdk/node/src/release.ts`](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/node/src/release.ts#L63-L68).

Windows/WSL facts and inferences:

- Upstream supports native Windows x64 binaries and a Linux-host cross-build path for Windows. Source: [`docs/BUILDING.md`](https://github.com/clearcotelabs/clearcote-browser/blob/main/docs/BUILDING.md#building-clearcote-from-source).
- Upstream does not document WSL as a special supported runtime in the inspected README/docs/source. It documents Windows x64 and Linux x64, and the local bridge already has WSL-to-Windows process plumbing for native Windows processes.
- Inference: On this repo's Windows target, Clearcote would most naturally run as a native Windows browser process launched through the existing WSL-to-Windows helper pattern, because `browser-fast` already runs native Windows Agent Browser against a Windows CDP WebSocket. On the Linux target, Clearcote can run as the Linux x64 binary if WSLg/runtime libraries are present, but the current Linux path launches Agent Browser's own headed browser instead of accepting an external CDP endpoint.

## Launch Models

Upstream-supported models:

- SDK Playwright drop-in: `launch()` returns a standard Playwright `Browser`. Source: upstream README quick start and [`sdk/node/README.md`](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/node/README.md#usage).
- Direct Playwright/Puppeteer executable path: launch stock Playwright against `C:\clearcote\chrome.exe` with Clearcote switches. Source: upstream README ["Direct - any CDP client"](https://github.com/clearcotelabs/clearcote-browser/blob/main/README.md#direct--any-cdp-client).
- Standing CDP endpoint: `clearcote-serve --port 9222 --fingerprint seed-123 --platform windows`, or SDK `serve()`, which returns `.cdpUrl`, `.wsUrl()`, and `.close()`. Sources: upstream README ["Direct - any CDP client"](https://github.com/clearcotelabs/clearcote-browser/blob/main/README.md#direct--any-cdp-client), [`sdk/node/README.md` standing CDP endpoint](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/node/README.md#standing-cdp-endpoint-serve), Node `serve()` implementation [`sdk/node/src/index.ts`](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/node/src/index.ts#L799-L972), Python `serve()` implementation [`sdk/python/clearcote/_serve.py`](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/python/clearcote/_serve.py#L1-L203).
- Docker CDP endpoint: `docker run -d --rm -p 9222:9222 teamflatearth/clearcote`. Source: upstream README ["Run in Docker"](https://github.com/clearcotelabs/clearcote-browser/blob/main/README.md#run-in-docker-) and [`docker/README.md`](https://github.com/clearcotelabs/clearcote-browser/blob/main/docker/README.md#pull--run).
- Clearcote MCP server: `npx clearcote-mcp` or `pip install clearcote-mcp && clearcote-mcp`, which launches one shared Clearcote browser via `clearcote.serve()` and attaches to it with Playwright over CDP. Sources: [`mcp/README.md`](https://github.com/clearcotelabs/clearcote-browser/blob/main/mcp/README.md#run-it), [`mcp/clearcote_mcp/_facade.py`](https://github.com/clearcotelabs/clearcote-browser/blob/main/mcp/clearcote_mcp/_facade.py#L1-L79).

Local bridge launch facts:

- `browser-fast` pins Agent Browser `0.35.0`. Source: `providers/browser-fast/server.mjs:12`.
- Windows `browser-fast` currently resolves a native Windows Chrome runtime, then runs native Agent Browser with `--cdp <wsEndpoint>` and `--pin-tab`. Source: `providers/browser-fast/server.mjs:254-270`.
- The Windows Chrome runtime requires Windows `cmd.exe`, native Windows `node.exe`, `%LOCALAPPDATA%`, a dedicated profile directory, and returns `browserUrl` plus `wsEndpoint`. Source: `providers/browser/windows-chrome-runtime.mjs:71-133`.
- Local architecture says Windows browser ownership is currently a visible Google Chrome profile at `%LOCALAPPDATA%\mcp-dev-bridge\chrome-profile`; `browser-fast` connects Agent Browser to its WebSocket via `--cdp`. Source: `docs/architecture.md:144`.

## Automation and Control Interfaces

### CDP and WebSocket

Facts:

- Upstream `serve()` starts the Clearcote binary directly with `--remote-debugging-port`, `--remote-debugging-address`, `--remote-allow-origins`, and `--user-data-dir`, waits for `/json/version`, and exposes an HTTP CDP URL. Source: Node implementation [`sdk/node/src/index.ts`](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/node/src/index.ts#L911-L972); Python implementation [`sdk/python/clearcote/_serve.py`](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/python/clearcote/_serve.py#L133-L203).
- Upstream exposes browser-level WebSocket URLs by reading `webSocketDebuggerUrl` from `<cdpUrl>/json/version`. Sources: Node `Server.wsUrl()` [`sdk/node/src/index.ts`](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/node/src/index.ts#L824-L835); Python `Server.ws_url` [`sdk/python/clearcote/_serve.py`](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/python/clearcote/_serve.py#L61-L73).
- Upstream says any CDP client can attach, including Playwright `connect_over_cdp` and Puppeteer `connect`. Sources: upstream README ["Direct - any CDP client"](https://github.com/clearcotelabs/clearcote-browser/blob/main/README.md#direct--any-cdp-client), [`sdk/node/README.md`](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/node/README.md#standing-cdp-endpoint-serve), [`mcp/README.md`](https://github.com/clearcotelabs/clearcote-browser/blob/main/mcp/README.md#just-want-the-raw-endpoint).

Inference:

- Agent Browser 0.35.0 can probably attach to Clearcote if given the Clearcote browser-level WebSocket URL, because local `browser-fast` already uses Agent Browser's `--cdp` option with a browser-level WebSocket endpoint. This is an inference from local use of `--cdp`, not a Clearcote claim about Agent Browser specifically.

### Playwright and Puppeteer

Facts:

- Clearcote markets `launch()` as a standard Playwright `Browser` and says Playwright/Puppeteer can use the same APIs pointed at the Clearcote binary or CDP endpoint. Sources: upstream README lines for Playwright/Puppeteer drop-in, [`sdk/node/README.md`](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/node/README.md#usage), and `serve()` examples.
- Node `launch()` ultimately calls `chromium.launch()` or `chromium.launchPersistentContext()` with `executablePath` set to the Clearcote binary and Clearcote engine args. Source: [`sdk/node/src/index.ts`](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/node/src/index.ts#L586-L754).

### Clearcote MCP

Facts:

- Clearcote MCP exposes navigation/read/action/session/infra tools, including `read_page`, `get_page_html`, `page_elements`, `evaluate_js`, `wait_for`, `current_page`, `get_cookies`, `list_tabs`, `navigate`, `click`, `fill_field`, `press_key`, `new_tab`, `close_tab`, screenshots/PDF, profile save/load, and `get_cdp_endpoint`. Source: [`mcp/README.md`](https://github.com/clearcotelabs/clearcote-browser/blob/main/mcp/README.md#tools) and [`mcp/clearcote_mcp/server.py`](https://github.com/clearcotelabs/clearcote-browser/blob/main/mcp/clearcote_mcp/server.py#L196-L354).
- Clearcote MCP launches one shared Clearcote browser via `clearcote.serve()` and attaches with Playwright `connect_over_cdp`. Source: [`mcp/clearcote_mcp/_facade.py`](https://github.com/clearcotelabs/clearcote-browser/blob/main/mcp/clearcote_mcp/_facade.py#L57-L79).

Inference:

- Clearcote MCP is not the right backend boundary for `browser-fast` because `browser-fast` already exposes its own MCP tools and expects Agent Browser batch command results, snapshots, refs, and tab IDs.

### Tab and Session Semantics

Facts:

- Clearcote MCP has one shared browser and one "current page"; `list_tabs()` returns tab indices, URLs, titles, and which tab is current; `new_tab()` makes the new tab current; `close_tab(index)` closes by index. Source: [`mcp/clearcote_mcp/_facade.py`](https://github.com/clearcotelabs/clearcote-browser/blob/main/mcp/clearcote_mcp/_facade.py#L196-L216).
- `browser-fast` expects Agent Browser tab commands and normalizes `targetId`/`tabId`; execution requires a tab ID from observe and validates that the current tab matches before action execution. Sources: `providers/browser-fast/server.mjs:307-342`, `providers/browser-fast/server.mjs:436-487`, `providers/browser-fast/server.mjs:494-590`.

Inference:

- If Agent Browser attaches to Clearcote CDP, `browser-fast` can keep its current tab semantics. If Clearcote MCP were used directly, tab semantics would need an adapter from index-based current-page tabs to `browser-fast`'s stable tab ID model.

### Accessibility Snapshots and Element Refs

Facts:

- Upstream Clearcote MCP `page_elements()` collects interactive DOM elements by evaluating JavaScript and returns tag/text/type/href/selector fields. Source: [`mcp/clearcote_mcp/_facade.py`](https://github.com/clearcotelabs/clearcote-browser/blob/main/mcp/clearcote_mcp/_facade.py#L31-L54) and [`_facade.py`](https://github.com/clearcotelabs/clearcote-browser/blob/main/mcp/clearcote_mcp/_facade.py#L128-L130).
- Local `browser-fast` obtains snapshots and refs from Agent Browser `snapshot` commands and returns `snapshotItem.refs`. Source: `providers/browser-fast/server.mjs:358-365`, `providers/browser-fast/server.mjs:459-486`.
- Local `browser-fast` translates `e123` refs to Agent Browser `@e123` targets. Source: `providers/browser-fast/server.mjs:367-385`.

Inference:

- Clearcote does not need to provide accessibility refs if Agent Browser remains the control layer. If replacing Agent Browser with Clearcote MCP, `browser-fast` would lose current ref semantics unless a new accessibility snapshot/ref generator is implemented.

### Batch Commands

Facts:

- Local `browser-fast` runs Agent Browser `batch --json` with command arrays and parses an array result. Sources: `providers/browser-fast/server.mjs:254-270`, `providers/browser-fast/server.mjs:273-291`.
- Upstream Clearcote MCP exposes individual tools, not an inspected batch command protocol. Source: [`mcp/clearcote_mcp/server.py`](https://github.com/clearcotelabs/clearcote-browser/blob/main/mcp/clearcote_mcp/server.py#L196-L354).

Inference:

- Batch behavior should remain in Agent Browser. Replacing Agent Browser with Clearcote MCP would require batching and partial-result semantics to be recreated.

### File Upload

Facts:

- Local `browser-fast` supports upload by resolving a logical approved artifact name from a manifest, verifying it is an absolute regular file, translating the path for Windows via `wslpath -w`, and sending Agent Browser an `upload` command. Sources: `providers/browser-fast/server.mjs:40-70`, `providers/browser-fast/server.mjs:300-305`, `providers/browser-fast/server.mjs:372-386`, `providers/browser-fast/server.mjs:494-511`.
- Upstream Clearcote MCP docs/source inspected do not list a file-upload tool. Its capture/write tools are screenshot/PDF/profile save/load. Sources: [`mcp/README.md`](https://github.com/clearcotelabs/clearcote-browser/blob/main/mcp/README.md#tools), [`mcp/clearcote_mcp/server.py`](https://github.com/clearcotelabs/clearcote-browser/blob/main/mcp/clearcote_mcp/server.py#L275-L332).

Inference:

- Upload should continue through Agent Browser against the Clearcote CDP target. Clearcote's upstream docs do not supply a smaller upload-specific API for `browser-fast`.

## Can Existing Agent Browser 0.35.0 Connect Through `--cdp` Without Code Changes?

Answer: Agent Browser itself probably can; the current provider probably cannot use Clearcote without a small endpoint-launch adapter.

Facts:

- Local `browser-fast` already invokes Agent Browser 0.35.0 with `--cdp <wsEndpoint>` on Windows. Source: `providers/browser-fast/server.mjs:12`, `providers/browser-fast/server.mjs:254-270`.
- Upstream Clearcote `serve()` exposes both HTTP CDP and browser WebSocket URL. Source: [`sdk/node/src/index.ts`](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/node/src/index.ts#L824-L835), [`sdk/python/clearcote/_serve.py`](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/python/clearcote/_serve.py#L61-L73).

Inference:

- If a Clearcote browser is already running and its browser WebSocket URL is supplied where `runtime.wsEndpoint` is supplied today, Agent Browser's existing `--cdp` path should be the first thing to test and should not require Agent Browser code changes.
- The inspected local code does not expose an option to substitute Clearcote for the Windows Chrome runtime. `AgentBrowserRunner.windowsBatch()` calls `windowsRuntime()`, which calls `ensureWindowsChrome()`, and `ensureWindowsChrome()` returns a Chrome endpoint from the Windows helper. Source: `providers/browser-fast/server.mjs:217-270`, `providers/browser/windows-chrome-runtime.mjs:115-133`.
- The Linux path does not pass `--cdp`; it launches Agent Browser headed in WSLg. Source: `providers/browser-fast/server.mjs:273-291`. So a Linux Clearcote CDP backend would require adding a CDP endpoint path there too.

## Smallest Adapter at the Existing Boundary

Preferred minimal adapter:

1. Add a browser endpoint resolver alongside, or parameterized into, `AgentBrowserRunner`:
   - `chrome` mode: current `ensureWindowsChrome()` behavior.
   - `clearcote` mode: launch `clearcote-serve` or use Clearcote SDK `serve()` with configured fingerprint/platform/profile/user-data-dir, wait for `/json/version`, extract `webSocketDebuggerUrl`, and return `{ browserUrl, wsEndpoint }` in the same shape as `ensureWindowsChrome()`.
2. Keep `FastBrowser`, `actionCommand()`, upload artifact resolution, tab checks, click new-tab handling, and final observation unchanged.
3. Windows: run native Windows Clearcote and native Windows Agent Browser, matching the existing Windows-target model. Reuse the Windows helper pattern for process lifetime and bounded output. The Clearcote binary can be resolved by SDK auto-download or an explicit `CLEARCOTE_BINARY`/configured path.
4. Linux: add an external-CDP mode to `linuxBatch()` rather than using Agent Browser's own headed launch. It would mirror the Windows args: `--session mcp-browser-fast-linux --cdp <clearcote ws> --pin-tab ... batch --json`.

Why this is the smallest useful boundary:

- `browser-fast`'s public behavior is only `observe` and `execute`. Source: `providers/browser-fast/server.mjs:637-719`.
- Its current semantics are already built around Agent Browser batch commands and refs. Source: `providers/browser-fast/server.mjs:358-405`, `providers/browser-fast/server.mjs:444-511`.
- Clearcote's strongest compatibility surface is CDP/Playwright/Puppeteer, not Agent Browser's command/ref protocol. Source: upstream `serve()` docs and source.

Rejected larger adapter:

- Replacing Agent Browser with Clearcote MCP would require recreating accessibility snapshots, opaque refs, batch semantics, tab target IDs, upload, and partial execution reporting. Upstream Clearcote MCP provides useful tools, but its source shows selector/text/index oriented semantics instead. Sources: [`mcp/clearcote_mcp/_facade.py`](https://github.com/clearcotelabs/clearcote-browser/blob/main/mcp/clearcote_mcp/_facade.py#L31-L54), [`mcp/clearcote_mcp/_facade.py`](https://github.com/clearcotelabs/clearcote-browser/blob/main/mcp/clearcote_mcp/_facade.py#L145-L216).

## Exact Upstream Commands and API Examples

Supported by upstream docs/source:

```bash
pip install clearcote
npm install clearcote
dotnet add package Clearcote
```

Source: upstream README ["12-second tour"](https://github.com/clearcotelabs/clearcote-browser/blob/main/README.md#the-12-second-tour).

```js
import { launch } from "clearcote";

const browser = await launch({
  fingerprint: "user-7423",
  platform: "windows",
  timezone: "America/New_York",
});
const page = await browser.newPage();
await page.goto("https://example.com");
await browser.close();
```

Source: upstream README ["SDK - Playwright drop-in"](https://github.com/clearcotelabs/clearcote-browser/blob/main/README.md#sdk--playwright-drop-in).

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=r"C:\clearcote\chrome.exe",
        args=["--fingerprint=seed-123", "--fingerprint-platform=windows"],
    )
    page = browser.new_page()
    page.goto("https://example.com")
    browser.close()
```

Source: upstream README ["Direct - any CDP client"](https://github.com/clearcotelabs/clearcote-browser/blob/main/README.md#direct--any-cdp-client).

```bash
clearcote-serve --port 9222 --fingerprint seed-123 --platform windows
```

Source: upstream README ["Direct - any CDP client"](https://github.com/clearcotelabs/clearcote-browser/blob/main/README.md#direct--any-cdp-client), Python CLI source [`_serve.py`](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/python/clearcote/_serve.py#L219-L269).

```js
import { serve } from "clearcote";
import { chromium } from "playwright";

const srv = await serve({ fingerprint: "seed-123", platform: "windows" });
console.log(srv.cdpUrl);

const browser = await chromium.connectOverCDP(srv.cdpUrl);
await srv.close();
```

Source: [`sdk/node/README.md` standing CDP endpoint](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/node/README.md#standing-cdp-endpoint-serve).

```bash
docker run -d --rm -p 9222:9222 teamflatearth/clearcote
docker run -d -p 9222:9222 -e CC_PLATFORM=windows -e CC_FINGERPRINT=user-7423 -e CC_BRAND=Edge teamflatearth/clearcote
```

Source: upstream README ["Run in Docker"](https://github.com/clearcotelabs/clearcote-browser/blob/main/README.md#run-in-docker-), [`docker/README.md`](https://github.com/clearcotelabs/clearcote-browser/blob/main/docker/README.md#configure-the-persona-env-vars).

```json
{
  "mcpServers": {
    "clearcote": {
      "command": "npx",
      "args": ["-y", "clearcote-mcp"],
      "env": {
        "CLEARCOTE_FINGERPRINT": "acct-1",
        "CLEARCOTE_PLATFORM": "windows"
      }
    }
  }
}
```

Source: upstream README ["Drive it from an AI agent (MCP)"](https://github.com/clearcotelabs/clearcote-browser/blob/main/README.md#drive-it-from-an-ai-agent-mcp-), [`mcp/README.md`](https://github.com/clearcotelabs/clearcote-browser/blob/main/mcp/README.md#add-it-to-a-client).

## Licensing and Distribution Constraints

Facts:

- Clearcote repository license is BSD 3-Clause. Redistribution in source and binary form is permitted if copyright/license/disclaimer notices are retained; the copyright holder/contributor names cannot be used for endorsement without permission; the software is provided as-is. Source: [`LICENSE`](https://github.com/clearcotelabs/clearcote-browser/blob/main/LICENSE).
- The repository metadata also reports `BSD-3-Clause`. Source: [GitHub repository API metadata](https://api.github.com/repos/clearcotelabs/clearcote-browser) for `clearcotelabs/clearcote-browser`.
- Upstream release notes flag `proprietary_codecs=true` and say H.264/AAC redistribution caveats apply. Source: [release `v0.1.0-pre.22`](https://github.com/clearcotelabs/clearcote-browser/releases/tag/v0.1.0-pre.22).
- Upstream says the free build is open/reproducible, while Pro binaries may include private maintained work and are license-gated. Source: upstream README ["Clearcote Pro"](https://github.com/clearcotelabs/clearcote-browser/blob/main/README.md#clearcote-pro--49month) and Node SDK README ["PRO license"](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/node/README.md#pro-license).
- Widevine is not bundled; the SDK can fetch it from Google's component server when the user opts in. Source: [`sdk/node/README.md` Widevine section](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/node/README.md#widevine--drm-widevine-true).

Inferences:

- Bundling the free Clearcote browser in this repo/distribution should preserve BSD notices and should be reviewed for codec redistribution risk because upstream explicitly calls it out.
- Depending on Pro builds would introduce license-key/runtime-token operational constraints and would not be reproducible from public source according to upstream's own description. That is a poor default for `browser-fast`; use free pinned builds first.

## Project Maturity Risks

Facts:

- Browser release `v0.1.0-pre.22` is marked pre-release and its own caveats say to treat it as a preview. Source: [release `v0.1.0-pre.22`](https://github.com/clearcotelabs/clearcote-browser/releases/tag/v0.1.0-pre.22).
- Security policy says Clearcote is pre-1.0 and only the latest release receives fixes. Source: [`SECURITY.md`](https://github.com/clearcotelabs/clearcote-browser/blob/main/SECURITY.md#supported-versions).
- Verification docs say build provenance/attestation is planned, and current Chromium builds are not yet bit-for-bit deterministic. Sources: [`docs/VERIFY.md`](https://github.com/clearcotelabs/clearcote-browser/blob/main/docs/VERIFY.md#5-planned-verify-build-provenance), [`docs/BUILDING.md`](https://github.com/clearcotelabs/clearcote-browser/blob/main/docs/BUILDING.md#reproducibility-honest-scope).
- There is primary-source version drift: README "What's new" currently names free build `v0.1.0-pre.21` and SDK `0.26.0`, while `sdk/node/src/release.ts` pins `v0.1.0-pre.22`, SDK package metadata is `0.27.0`, and GitHub release metadata shows `v0.1.0-pre.22` as the newest browser asset release. Sources: upstream README ["What's new"](https://github.com/clearcotelabs/clearcote-browser/blob/main/README.md#clearcote-browser), [`sdk/node/package.json`](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/node/package.json#L1-L4), [`sdk/node/src/release.ts`](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/node/src/release.ts#L35-L64), [release `v0.1.0-pre.22`](https://github.com/clearcotelabs/clearcote-browser/releases/tag/v0.1.0-pre.22).
- The GitHub API `latest` endpoint returned `sdk-v0.9.1` with no browser assets, not the newest browser pre-release. Source: [GitHub Releases latest API](https://api.github.com/repos/clearcotelabs/clearcote-browser/releases/latest), observed 2026-08-25.

Inferences:

- Do not rely on GitHub `/releases/latest` to choose a browser binary; filter releases/assets the way the SDK does, or use the SDK's pinned `release.ts`/catalog path.
- Treat Clearcote as an experimental backend until a local smoke test proves Agent Browser 0.35.0 snapshots, tab switching, file upload, and click/new-tab handling work over the Clearcote CDP endpoint.

## Practical Feasibility Verdict

Recommended first implementation:

- Add a Clearcote endpoint resolver and keep Agent Browser unchanged.
- Start with Windows target parity because the existing Windows path already uses `--cdp`; replace only the producer of `runtime.wsEndpoint`.
- Make Clearcote opt-in and pinned. Avoid auto-update by default because `browser-fast` needs predictable behavior, and upstream itself distinguishes pinned and auto-update trust models. Source: [`sdk/node/src/download.ts`](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/node/src/download.ts#L1-L13), [`sdk/node/src/download.ts`](https://github.com/clearcotelabs/clearcote-browser/blob/main/sdk/node/src/download.ts#L66-L86).
- Validate with a local smoke matrix before landing: observe snapshot refs, navigate, click, fill, select, tab open/switch/close, upload via approved artifact, and final-state observation.

Non-goals for first pass:

- Do not route through `clearcote-mcp`.
- Do not rewrite `FastBrowser` around Playwright.
- Do not adopt Clearcote Pro as the default backend.
