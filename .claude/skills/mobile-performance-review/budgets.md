# Mobile performance budgets — default guidance

Starting numbers for `tests/budgets/*.json` and for the
`mobile-performance-review` skill, collected from public platform guidance and common practice
(2026). They are **defaults to start from**, not measurements of your game: replace them with
numbers from your own device lab runs (`gameengine lab`) as soon as you have them.

## Device classes

| Class (lab id) | Typical hardware | Target |
|---|---|---|
| `android-low-compat` | 2–3 GB RAM, 4–6 year-old SoC, GLES/Vulkan 1.0 | 30 fps, must not crash |
| `android-low-mid` | 3–4 GB RAM | 60 fps casual / 30 fps 3D |
| `android-mid` | 4–6 GB RAM | 60 fps |
| `android-high` / `iphone-current` / `ipad` | 8 GB+ | 60 fps (never above: the engine caps phones at 60, ADR 0079) |
| `iphone-oldest` | oldest supported iPhone (3 GB) | 60 fps casual / 30 fps 3D |

## Frame time (CPU and GPU)

| Metric | Default | Why |
|---|---|---|
| `frameTimeP95Ms` | 16.6 at 60 fps, 33.3 at 30 fps | 60 fps leaves 16.66 ms per frame, 30 fps 33.33 ms. |
| `gpuTimeP95Ms` | ≤ 70 % of the frame (≈ 11–12 ms at 60 fps) | Phones throttle under sustained load; plan for 35–45 % less than peak and use only 60–70 % of the GPU at the target rate. |
| `scriptTimeP95Ms` | low 5–8, mid 4, high 2 | Leaves the rest of the CPU frame for engine, render submission and the OS. |
| `stepTimeMs` p95 (one 60 Hz sim step) | ≈ 8 on `phone-low` | At 30 fps a frame runs two steps plus presentation in 33.3 ms (ADR 0102). |
| `hitchFrames` | 0 over 2× the frame budget during play | Visible stutter; "slow rendering" in Android vitals is frames over 16 ms. |
| Frozen frames | none over 700 ms | Android vitals' frozen-frame threshold. |
| `gcMaxMs` / GC pauses over 4 ms | ≤ 8 ms max, 0 over 4 ms during play | A GC pause is a hitch; steady-state play should not allocate per frame. |

Fixed cost per script system call (release, M-series): V8 ≈1.1 µs, Hermes ≈3.4 µs, independent of
entity count when the system returns early; phones ≈10–15× that. 16 always-on systems on a
`phone-low` device cost ≈0.5–1 ms per step before they do any work.

Budget for **sustained** play (10+ minutes, warm device), not a cold device's first minute.
Lower the frame rate in menus and idle screens: 60 fps costs roughly 1.5–2× the power of 30 fps.

## Draw calls and geometry

| Metric | Low | Mid | High |
|---|---|---|---|
| Draw calls per frame (2D / casual) | ≤ 50 | ≤ 100 | ≤ 200 |
| Draw calls per frame (3D) | ≤ 100 | ≤ 200 | ≤ 500 |
| Triangles per frame (3D) | ≤ 100 k | ≤ 300 k | ≤ 1 M |
| Overdraw (2D, full-screen average) | ≤ 2× | ≤ 2.5× | ≤ 3× |

Draw calls are usually the first bottleneck in 2D and simple 3D mobile games: atlas sprites and
UI, share materials, avoid interleaving sorting layers between atlases. The engine's structural
budget `drawCallsMax` is checked in T1 on every run (the engine keeps a 60-object
board plus UI under 30 draws).

## Fill rate and bandwidth (720p Mali-class phones)

Low-end Android phones (Mali-G52/G57, PowerVR GE-series, Adreno 5xx–610; 720×1600 screens)
share a few GB/s of memory bandwidth between the GPU, CPU and display. A 2D frame there is
bound by how many full-screen pixels it writes and reads, not by draw calls. Bytes per screen
pixel per frame, by how the engine draws (computed from its render paths, ADR 0099):

| Setup | Passes | ≈ DRAM bytes per pixel | 720×1600 at 60 fps |
|---|---|---|---|
| `msaa: 1`, `hdr: false`, no post (lean path) | scene + UI straight into the swapchain | 4 | ~0.3 GB/s |
| Same with `renderScale: 0.75` | scaled 8-bit scene; upscale + UI in the present pass | 2.3 written + 2.3 read + 4 | ~0.6 GB/s |
| Tier defaults (MSAA 4× into a float target: `rg11b10ufloat` 4 B or `rgba16float` 8 B), no post | resolve written, read by the present blit, swapchain written | 4–8 + 4–8 + 4 | ~0.8–1.4 GB/s |
| Any post profile | float scene, each effect's passes, a full-size composite, then the UI | the row above plus a read and a write per effect pass | 1.5 GB/s and up |

MSAA samples themselves stay in on-chip tile memory and are discarded after the resolve; the
numbers count what reaches DRAM, before blending reads and texture fetches.

Each full-screen transparent layer (a backdrop, a vignette sprite, a dimmer) adds a read and a
write of every pixel it covers. Defaults for low-end phones:

- 2D: `"render": { "tiers": { "mobile": { "msaa": 1, "hdr": false }, "compat": { "msaa": 1, "hdr": false } } }` and no post profile.
- 3D or heavy fills: `renderScale` 0.75–0.85 per tier or per device (`device-profiles.json`;
  the engine's `android-mali-g5x` profile ships 0.75 with msaa 1).
- Overdraw ≤ 2× full-screen average (table above), at most one full-screen translucent layer.
- Idle screens write no per-frame buffers between animations. Every frame still draws (`idleFrames.skipped` stays 0), so cap menus as below.
- 30 fps on the `compat` tier and on `phone-low` phones (the engine defaults) and in menus (`quality.setTargetFps(30)`).

## Memory

| Metric | `android-low-compat` | low-mid / `iphone-oldest` | mid | high |
|---|---|---|---|---|
| `memoryMB` (peak RSS) | ≤ 350 | ≤ 400 | ≤ 450 | ≤ 600 |
| `jsHeapMB` | ≤ 32 | ≤ 32 | ≤ 48 | ≤ 64 |
| Texture memory (part of RSS) | ≤ 120 MB | ≤ 150 MB | ≤ 200 MB | ≤ 300 MB |

- iOS kills an app over its per-process limit without a crash log (jetsam): roughly 900 MB on a
  3 GB iPhone SE and about half of RAM on newer devices. Stay far below it: the OS, the web view
  of an ad SDK and a video ad can take hundreds of MB on top of the game.
- A 2 GB Android phone leaves roughly 0.8–1.2 GB to apps, shared with everything in the
  background; Android's low-memory killer ends the biggest background process first, so a
  game that is large when the player switches to another app restarts cold when they return.
  Android 17 adds a hard per-app ceiling based on device RAM.
- Measure peak, not average: loading a level while the previous one is still resident is
  usually the peak.

## Loading and size

| Metric | Default | Why |
|---|---|---|
| Cold start to first interactive frame | ≤ 5 s on low devices, ≤ 2 s high | Android vitals counts 5 s+ as a slow cold start. |
| `loadMs` (level load) | low 2500, mid 1500, high 1000 | |
| Store download (base) | ≤ 150 MB | Over 200 MB, the App Store requires Wi-Fi (cellular limit) and Play shows a mobile-data warning; Play's base module is capped at 200 MB compressed. Put the rest in on-demand bundles (asset packs: ≤ 1 GB install-time, ≤ 2 GB total). |

## Where the numbers come from

- Android vitals thresholds (slow cold start 5 s, frozen frames 700 ms, 16 ms frames):
  [Android Developers — Slow rendering](https://developer.android.com/topic/performance/issues/render),
  [Infinum QA handbook — Android vitals](https://infinum.com/handbook/qa/tools/using-android-vitals).
- Thermal headroom and sustained performance:
  [Android Developers — Thermal API](https://developer.android.com/games/optimize/adpf/thermal),
  [Bugnet — mobile game overheating and throttling](https://bugnet.io/blog/how-to-fix-mobile-game-overheating-thermal-throttling).
- Draw calls and triangles:
  [Unity — mobile art optimization tips](https://unity.com/how-to/mobile-game-optimization-tips-part-2),
  [DEV — optimizing Unity games for low-end devices (2026)](https://dev.to/unitysourcecode/optimizing-unity-games-for-low-end-devices-a-practical-performance-guide-for-2026-1d5b),
  [MessyPoly — polygon budgets for mobile games](https://www.messypoly.com/learn/polygon-budgets-mobile-games).
- Memory limits:
  [Codoid — iOS jetsam testing](https://codoid.com/mobile-application-testing/ios-jetsam-testing-stop-misdiagnosing-memory-kills-as-crashes/),
  [Apple Developer Forums — jetsam per-process limit](https://developer.apple.com/forums/thread/688973),
  [Android Developers — memory management for games](https://developer.android.com/games/optimize/memory-overview),
  [Android Developers — low memory killers](https://developer.android.com/topic/performance/vitals/lmk),
  [Stora — Android 17 app memory limits](https://stora.sh/blog/2026-04-25-android-17-memory-limits-guide).
- Download size:
  [Play Console Help — app size limits](https://support.google.com/googleplay/android-developer/answer/9859372?hl=en),
  [Adapty — app size limits](https://adapty.io/glossary/app-size/).
