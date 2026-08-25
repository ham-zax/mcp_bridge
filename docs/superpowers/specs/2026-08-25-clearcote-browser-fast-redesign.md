# Clearcote Browser-Fast Redesign

## Goal

Make Clearcote a first-class `browser-fast` backend without expanding the model-facing MCP surface. `browser-fast` keeps only `observe` and `execute`; Clearcote owns the persistent browser identity and humanized interaction behavior, while Agent Browser keeps compact accessibility snapshots, refs, and tab identity.

## Availability baseline — 2026-08-25

There are three different capability surfaces and they must not be conflated:

1. what the installed Clearcote SDK exposes;
2. what the currently downloadable browser tier can execute;
3. what `browser-fast` has actually wired through.

### Installed Clearcote SDK

`clearcote@0.27.0` is the current npm `latest` and is pinned in `providers/browser-fast`. Its Node API exposes `launch`, `launchPersistentContext`, `launchAgent`, and `serve`, plus saved/imported profiles, render-coherence inspection, Widevine setup, extensions, proxy/GeoIP handling, browser-version selection, and the full fingerprint option surface.

The SDK accepts fingerprint/persona controls including seed, platform/brand/version, TLS profile, GPU strings, hardware concurrency, device memory, screen metadata, locale/timezone/location, WebRTC settings, captured fingerprint profiles, storage quota, and Canvas Bridge. `humanize: true` covers click, hover, double-click, type, fill, press, select, mouse move/click/wheel, keyboard input, locator equivalents, and drag operations.

### Browser tier actually available without a license

The current free Linux release resolved by `clearcote@0.27.0` is `v0.1.0-pre.22`, Chromium `149.0.7827.114`.

The free tier includes the identity surface and synthetic humanization: seeded personas/per-site farbling, canvas/WebGL/audio/font identity controls, metadata overrides, `lightStealth`, TLS ClientHello shaping, proxy + GeoIP coherence, persistent profiles, extensions, Widevine support, and synthetic humanized input.

Do not infer support merely because an SDK option exists. Current version/tier gates include:

- `profile: "auto"` real-profile selection requires engine major 150+; its hosted profile source is licensed, with a local imported-profile fallback;
- independent `gpuStringSpoof` and `canvasNoise` controls require engine 150 r12+;
- `shaderDialect` requires PRO engine 151 r15+;
- SOCKS5 UDP relaying requires PRO engine 151 r17+;
- PRO adds recorded human trajectories, coalesced-pointer realism, coherent WebRTC srflx fabrication, host-candidate concealment, and request-header hygiene.

The deployed free 149 build therefore must not be described as having every option implemented by the current SDK. Features above its engine/tier gate remain unavailable until the selected browser build changes.

### `browser-fast` source implemented in this working tree

The working tree now contains:

- V2 named Clearcote profile configuration while V1 remains readable;
- `ManagedClearcoteRuntime` using `launchPersistentContext()` and a persistent bridge-owned `userDataDir`;
- an ephemeral loopback DevTools endpoint from that same Clearcote browser for Agent Browser observation;
- normal Agent Browser snapshots, refs, and exact CDP `targetId` binding on the managed browser;
- managed Clearcote input for `click`, `fill`, `type`, `check`, `uncheck`, `select`, `press`, `hover`, wheel `scroll`, and `drag`; Agent Browser supplies the exact ref/focus/geometry and target identity while the Clearcote-owned Playwright page performs the input. When `humanize: true`, browser-fast uses non-center interior points for geometry-only fallbacks, gives standalone `type` a Clearcote-owned pointer approach before typing, and routes drag through Clearcote's held-button settle path plus persona grab/release dwells; wheel input already uses Clearcote's scroll-anchor/easing wrapper. Automatic ambient motion remains opt-in because it can interfere with caller-controlled actions.

The expanded path was exercised through `FastBrowser.execute` on a local smoke page: fill, type, check, select, hover, scroll, press, and click completed with the expected final DOM state.

Still not wired through `browser-fast`:

- proxy/GeoIP, TLS-profile, captured-profile, Canvas Bridge, extension, Widevine, browser-version, license/PRO, or advanced fingerprint configuration in the V2 profile schema;
- removal of the legacy external `cdpPort` compatibility path.

### Live bridge state

The live Linux selector is V2 managed Clearcote profile `x-main`. The loaded `browser-fast` schema advertises the new input actions, and a live local smoke call completed fill, type, hover, and click through the managed runtime. Prior refs from the old backend are invalid across this switch.

The public `observe`/`execute` contract remains the right abstraction and should not change.

## Ownership model

```text
ChatGPT / domain workflow
        |
        v
browser-fast
  observe / execute
        |
        +-----------------------------+
        |                             |
        v                             v
Agent Browser                    Clearcote runtime
snapshot / refs                  persistent profile
stable target IDs                persona / launch options
ref -> geometry                  humanized actions
        |                             |
        +-------------+---------------+
                      |
                      v
               Clearcote Chromium
```

### Agent Browser owns

- accessibility snapshots and compact `@eN` refs;
- current-tab binding and CDP `targetId` identity;
- ref inspection such as `get box @eN`;
- tab enumeration used by existing transition detection;
- the existing Chrome execution path.

### Clearcote runtime owns

- browser process lifecycle when the selected backend is Clearcote;
- a persistent `userDataDir` per configured profile;
- stable fingerprint/persona launch options;
- the loopback CDP endpoint used by Agent Browser observation;
- Playwright context/pages created by Clearcote's Node SDK;
- Clearcote's `humanize` behavior for supported actions.

### `FastBrowser` continues to own

- operation serialization;
- observed-tab validation;
- action ordering and fail-fast behavior;
- partial/unknown result reporting;
- one-new-tab transition handling;
- approved upload artifact resolution;
- final observation.

## Configuration

Replace the Clearcote `cdpPort`-only selector with a named managed profile. Chrome remains the default.

```json
{
  "version": 2,
  "linux": {
    "browser": "clearcote",
    "profile": "x-main"
  },
  "clearcote": {
    "profiles": {
      "x-main": {
        "fingerprint": "x-main",
        "platform": "linux",
        "brand": "Chrome",
        "headless": false,
        "humanize": true
      }
    }
  }
}
```

The profile directory is derived locally under the bridge state directory instead of accepting an arbitrary model-supplied path. Secrets such as proxy credentials or license keys do not belong in the model-facing browser action schema.

V1 configuration remains readable during migration: existing `chrome` configuration keeps working; the old external Clearcote `cdpPort` form remains an explicit compatibility path until the managed runtime is complete, then can be removed in a coordinated migration.

## Clearcote runtime

Use the official Node package (`clearcote`) rather than a Python sidecar. The provider is already Node 24, and the SDK supplies the required persistent-context and humanization behavior. Pin the package version in `providers/browser-fast/package.json` so the browser/runtime contract does not drift independently of this provider.

For a managed profile:

1. Resolve the profile configuration.
2. Create the bridge-owned profile directory if missing.
3. Launch `clearcote.launchPersistentContext(userDataDir, options)` with `humanize` enabled according to the profile.
4. Expose a loopback CDP port on the same Chromium process so Agent Browser can attach to the exact browser that the Clearcote Playwright context owns.
5. Reuse the runtime until it exits or the selected profile changes.
6. On shutdown, close the Clearcote context and its browser process without deleting the persistent profile directory.

The runtime must not silently rotate fingerprint, profile directory, platform, locale, or proxy configuration while an authenticated profile is active.

## Action routing

`observe` remains unchanged: Agent Browser observes the selected backend over CDP.

`execute` routes actions by backend.

### Chrome

Keep the existing Agent Browser command path unchanged.

### Clearcote

Use Agent Browser only to resolve and validate refs, then execute supported interaction through the Clearcote-owned Playwright page so the SDK's humanization wrapper remains active.

Managed input actions:

- `click`
- `fill`
- `type`
- `check`
- `uncheck`
- `select`
- `press`
- `hover`
- wheel `scroll`
- `drag`

Navigation, tab operations, waits, and approved uploads continue through Agent Browser. The split is per action, not a second MCP surface.

For ref-targeted actions, the executor must bind the Clearcote page to the same CDP `targetId` validated by `FastBrowser`. It must not guess by URL or positional tab index.

## X profile

An authenticated X account should use one stable Clearcote profile, for example `x-main`.

The profile persists:

- cookies;
- local storage and IndexedDB;
- cache and browser profile state;
- the configured Clearcote identity;
- the Clearcote motor persona derived from the stable fingerprint seed.

Use headed mode for this profile so manual login, MFA, or challenge handling can be completed in the same persistent browser. Do not automate account-warmup, follow churn, or other behavior whose purpose is to disguise automation or bypass X enforcement.

## Failure semantics

The existing `browser-fast` failure contract remains authoritative.

- If the selected Clearcote runtime cannot start, fail the operation before browser mutation.
- If the observed `targetId` no longer matches, return `TAB_CONTEXT_MISMATCH` as today.
- If ref resolution fails, do not fall back to an unverified selector.
- If a Clearcote action outcome cannot be established, report it as unknown/partial rather than retrying automatically.
- A backend/profile switch is allowed only between complete `browser-fast` operations; prior refs are invalid after a switch.

## Implementation status

Started on 2026-08-25 and activated in the live bridge on the same date.

- V2 named Clearcote profile configuration is implemented while V1 remains readable.
- `clearcote@0.27.0` is pinned in the `browser-fast` provider; npm currently reports `0.27.0` as `latest`.
- The selected free engine is currently `v0.1.0-pre.22`, Chromium `149.0.7827.114`.
- `ManagedClearcoteRuntime` owns `launchPersistentContext()`, bridge-state profile storage, and the ephemeral loopback CDP endpoint.
- Agent Browser observation attaches to that managed browser and remains the ref/target-ID owner.
- Managed Clearcote routes `click`, `fill`, `type`, `check`, `uncheck`, `select`, `press`, `hover`, wheel `scroll`, and `drag` through the Clearcote-owned humanized Playwright context. Navigation, tabs, waits, and approved uploads remain on the Agent Browser path.
- The live selector now uses the persistent `x-main` Clearcote profile in headed mode with a stable fingerprint seed, `Asia/Kolkata`, and `en-US,en`.
- A live MCP smoke on the local Clearcote page completed `fill -> type -> hover -> click`; the final snapshot contained `live-clearcote`, confirming the loaded service is using the new managed input path.
- `lightStealth` is exposed as an optional V2 profile boolean and remains off when omitted. Operators may enable it per profile. With Clearcote 0.27.0, enabling it consumes the fingerprint seed during launch-argument construction before the humanization installer reads that field, so the stable fingerprint-derived motor persona is not preserved on that path; the persistent browser profile itself is unaffected.
- Broader launch/persona controls such as proxy/GeoIP, imported profiles, Canvas Bridge, extensions, Widevine, version/PRO selection, and eventual removal of the legacy external-port compatibility path remain future integration work.

## Implementation sequence

1. Extend backend configuration to represent named Clearcote profiles while preserving the current Chrome path. **Implemented.**
2. Add a managed Clearcote runtime using the official Node SDK and a bridge-owned persistent profile directory. **Implemented.**
3. Make Agent Browser observation attach to the managed runtime's CDP endpoint. **Implemented.**
4. Route current high-value Clearcote-native input actions through the runtime while preserving `FastBrowser`'s existing action/result contract. **Implemented and live-smoked.**
5. Keep current architecture/operations documentation synchronized while the legacy V1 external-port form remains a compatibility path. **In progress.**

## Deliberate non-goals

- Do not expose Clearcote's full MCP tool catalog to the model.
- Do not add model-visible fingerprint, TLS, proxy, or humanization controls to `execute`.
- Do not reimplement Clearcote's Bezier, typing, or scroll algorithms in `browser-fast`.
- Do not add Firefox to this Chromium-CDP backend.
- Do not add automated X cadence, warm-up, proxy-rotation, or enforcement-evasion policy.
