---
name: mobile-performance-review
version: 1.21.0
tier: required
description: Mobile performance review of a file, feature or game — measure first (perf.stats, render.stats, profile.markers, `gameengine device perf`), then check CPU, GPU, memory, load-time and download budgets per device class. Use before shipping a feature, when a budget test fails, for 'will this run on low-end phones', or a drop to 30 fps.
---

# Mobile performance review

**Covers:** Reviewing a Game Engine game (a file, a feature, or the whole project) for mobile CPU, GPU, memory, load-time and download-size budgets — measure first (perf.stats, render.stats, profile.markers, T1 structural budgets, `gameengine device perf` on a probe build, Perfetto, the device lab), then read the code the numbers point at. Default budgets per device class (budgets.md), fill rate and bandwidth on 720p Mali-class phones (render scale, msaa 1, hdr false, no post in 2D, device-profiles.json), GPU-bound frames at low clocks, idle screens (every frame draws), frame-rate caps (quality.setTargetFps; 60 on phones, 30 on compat), pipelines.json, UI batching and 3D residency, the sim-step CPU budget at 30 fps on phone-low, why the quality governor stepped down (its `quality` log line: CPU- or GPU-bound, thermal), named trace sections (script.system:<name>, render.*), idle screens that call no scripts, and cheaper per-device content (skill device-tiers); points each finding at the skill that fixes it. Use before shipping a feature, when a budget test fails, or when asked "will this run on low-end phones".

Numbers first, then code. A review that only reads code guesses; one that only measures can't
say what to change. Budgets per device class, with sources: [budgets.md](budgets.md).

## 1. Scope

| Asked to review | Scope |
|---|---|
| A file or system | `gameengine scope src/board.ts` — the file and what it imports |
| A feature | `gameengine scope src/shop src/purchases.ts --dependents` — also what calls into it |
| A package | `gameengine scope node_modules/@studio/boosters/src` (or its path) |
| The project | `gameengine scope src` and every `tests/budgets/*.json` scenario |

Read only the scope's files (engine files are hidden unless you pass `--engine`; don't review
the engine, report engine issues separately). Note the scope in the report.

## 2. Measure

Headless, on this machine (relative numbers, structural facts):

```sh
gameengine test --tier t1                     # structural budgets: drawCallsMax, pipelines created during play, GC pauses > 4 ms
gameengine run --headless --tier mobile --scene scenes/level_01.scene.json   # --tier mobile: see draw calls below
gameengine call perf.start
gameengine step 600
gameengine call perf.stats --stop true        # stepTimeMs/hitchSteps per sim step, presentationTimeMs per frame, scriptTimeMs/gcMaxMs percentiles, systemTimeMs per system, drawCallsMax, jsHeapMB, memoryMB
gameengine screenshot /tmp/frame.png          # headless sessions render only when asked
gameengine call render.stats                  # drawCalls, triangles, instances, pipelines, passes of that frame; culled2d / transparent2d / culledSkeletons: what was left out; worldOccluded: an opaque full-screen UI hid the world, so it was not drawn; particleInstances; culling / cullingSettings: what distance, size, animation, effect and occlusion culling left out, and the switches this device resolved (skill culling)
gameengine call profile.markers               # per-system CPU ms, jobs, GPU passes
gameengine call profile.memory                # memory by category (textures, meshes, audio, heap)
gameengine cook . --platform android          # cook report: bundle and texture sizes
gameengine memory report --device phone-low   # per asset group resident MB, level-switch peak; checks memory.budgets and tests/budgets/memory.json
gameengine test --native both                 # Rust systems vs their TypeScript twins: "Steer: rust 0.31 ms vs ts 12.58 ms per run"
gameengine build android --config release --dry-run   # size budgets (tests/budgets/size.json)
```

**Measure on a release host.** Every run prints `host: <path> (debug|release)`: a debug host runs
Rust (marshalling, native systems, steps) several times slower, so its script and step times
say nothing about a phone. `cargo build --release -p gameengine-host` in the engine checkout,
or point `GAMEENGINE_HOST` (`GAMEENGINE_HOST_HERMES` for the Hermes lane) at a release binary;
the CLI runs the newest build that is not older than its sources.

**Paused sessions** (`run --headless --paused`, then `step`): whole frames mix the steps a
protocol call ran with idle frames, so `frameTimeMs`/`hitchFrames` mean nothing there
(`paused: true` in the report). Read `stepTimeMs` (one sim step, all its systems; `hitchSteps`
over the frame budget) and `presentationTimeMs` (LateUpdate, UI, audio and render per frame).

**Read phone draw-call budgets on the mobile tier** (`--tier mobile` on the session; T1 tests use it
by default): a session without `--tier` on a desktop GPU takes the desktop GPU-driven path, whose
`drawCalls` count its early, late and final indirect records, not what a phone issues. In tests,
`render.expectDrawCalls('<=', n, { width, height })` checks the budget at the phone's resolution
on the one frame it renders; for the peak over a scenario, sample `render.stats()` in a
`renderTest` while it steps through the scenario and assert on the maximum (skill `testing`).
In the desktop player, `gameengine run --perf` prints frame-time percentiles and the worst frames on exit.

On devices (absolute numbers; the only real GPU, thermal and memory truth): see "Profiling on a
device" below, and `gameengine lab run tests/lab/t2.json` with a `perf` job and a budget file
(skill `ship-mobile`).
Gate a hot system by name with `systemsP95Ms` in the device budget
(`tests/budgets/<name>.json` → `devices.<class>.systemsP95Ms: { "Steer": 4 }`, ms per frame at p95).
**Garbage per system:** during a capture `perf.stats` also reports `jsAllocatedBySystemMB` (the ten script
systems that allocated most JS memory, `{ name, mb }`), and a failing structural `jsAllocatedMBMax` names the
top three (`most allocated by Spawn 6.0 MB, Hud 2.3 MB, Move 1.0 MB`): start there (skill `ecs-systems`, "What
a run costs"). Structural budgets play their replay in the budget's own scene.
Times on this machine say which system to look at; only device numbers say whether it is over.
On a phone in someone's hand (a dev or probe build), the engine cheat `engine.perf` shows fps,
frames under 24 fps and frame variance over 10 s, and records a 20 s plain-text report to the
clipboard and the device log (`gameengine cheat perf --record` on a connected session; skill
`cheats`). Ask for that report when a person says a device "feels choppy".

### Profiling on a device

Use a `phone-low` phone (about 3 GB of RAM, a Mali-G52-class GPU; skill `device-tiers`) for the
verdict: a flagship hides what the weakest supported phone cannot do.

1. **Build a probe**, not a dev build: `gameengine build android --config probe` (release-optimised,
   debug protocol on). A dev build is a debuggable APK with Dawn validation, debug logging and a
   world hash every step: its frame times are not a player's. A probe does not hash every step
   (its cook turns `sim.hashInDev` off) unless the project sets `sim.hashInDev: true`; `device
   perf` names the build it measured and warns on a dev build or on such a probe.
2. `gameengine device install` / `device run`, play to the scene, then
   `gameengine device perf --seconds 20` (Android; `--json` for data; `--seconds` up to 300 sets the
   window, and the HUD it turns on goes off again afterwards): the engine's performance report (frame intervals, slow frames, CPU/script/GPU per frame, render load, GC,
   thermal, memory, worst frames), CPU per thread of the app from `/proc` over the same window
   (game, the GPU thread `gameengine-gpu` on OpenGL ES or the render thread `gameengine-render`
   on Vulkan, audio, V8 workers, Dawn), and `dumpsys meminfo`
   (Java, native, graphics, code). Its `setup:` line names what the device runs: profile and
   source (`project` when the project's `device-profiles.json` matched, `database` for the
   engine's), quality level, tier, render scale, msaa, hdr format, memory class; the report also
   prints its frame-rate target. Read its thread lines together:
   - `per frame ms: cpu (main thread)` is the frame loop's whole frame, waits excluded. It
     includes `render phase on the GPU thread (main waits)`: the snapshot, UI layout and submit the
     frame loop hands to the GPU thread and waits through. A large handed-over phase is UI layout
     or extraction cost (UI nodes, 2D content, skeletons), not GPU time.
   - `gpu thread ms: render and present (vsync waits excluded)` is what the GPU thread does
     while the next frame simulates: recording, uploads, present. It only costs the frame when it
     exceeds the frame loop's time, so compare the two; `render.wait` in a trace is the frame loop
     waiting for it.
   - `systems (ms per frame, top N)` lists the sim systems that cost the most, with per-run mean
     and max; `(LateUpdate)` marks presentation systems. The first capture frame's times are
     skipped (they hold everything since launch). Point a `perf-to-rust` or `ecs-systems` finding
     at the named system.
   Launch time is in the device log: `startup: first frame N ms after launch` and `startup: interactive
   N ms after launch` (the first frame with nothing loading).
   Only OpenGL ES phones have a GPU thread; Vulkan and Metal phones and the desktop player lend
   the renderer to a render thread per frame and print neither the `render phase` nor the
   `gpu thread` line.
3. For a timeline, record a Perfetto system trace with app tracing on for the game (Android
   Studio's System Trace, or a Perfetto config whose `ftrace_config.atrace_apps` names the app id
   and `atrace_categories` includes `gfx` and `view`). Without app tracing the engine's sections
   are missing. The engine adds sections:
   `frame`, `sim.step`, `script.system`, `script.call`, `render.wait`, `render.acquire`,
   `render.encode`, `present` — next to the CPU frequency, scheduling and (where the device
   exposes it) GPU frequency tracks. Inside `render.encode`: `render.warm`, `render.batch2d`,
   `render.skel2d`, `render.3d`, `render.particles`, `render.graph`, `render.submit`, and the
   one-time work `render.preload`, `render.pipeline`, `render.texture-upload`,
   `render.atlas-page`, `render.glyph-page`, `render.glyph-upload`, `render.buffer-grow`,
   `render.bind-group`, `render.target`. A long `render.encode` names its cause there. Script
   sections are named per system and function (`script.system:<name>`, `script.call:<fn>`; on
   desktop they appear in `profile.markers`), so a long `sim.step` names the system. Named
   sections cost nothing while tracing is off.
4. `gameengine device logs` (Android: logcat tag `gameengine`; iOS dev and probe builds: the
   session's log) for the hitch lines: `hitch pipeline: N created during play`, `slow render
   frame: … (N pipelines created, N textures uploaded, N buffers grown, N render targets
   allocated, N glyph pages uploaded)` for any render-thread frame over 100 ms in play, the
   `quality` lines (below), and `memory`, `audio` and `[perf] setup:` lines. Release builds log
   Info and above too: logcat on Android, the unified log on iOS (Console.app with the device
   selected, subsystem `gameengine`). Note the timestamps of the spikes you saw and match them
   to these lines and the trace.
5. Capture both kinds of cost: the **steady** cost (a 20 s `device perf` in normal play, the
   p50/p95 frame) and the **spikes** (level start, first effect, first popup, a level switch: the
   worst frames, hitch lines and the trace around them). They have different fixes.

### CPU budget per frame, per tier

The sim runs at 60 Hz whatever the frame rate, so a frame runs as many sim steps as the time it
covers. At 60 fps that is one step and presentation in 16.6 ms; at 30 fps (`compat`, and
`phone-low` by default, ADR 0102) it is **two steps plus presentation in 33.3 ms**. Budget one
sim step (`stepTimeMs` p95, all systems) on a `phone-low` phone at about **8 ms**, leaving
~17 ms for two steps and the rest for UI, audio and render submission; a step over 16 ms
there is a hitch that compounds (the next frame owes more steps). Headless `stepTimeMs` on a
desktop is several times faster than a phone: compare it relative to a baseline, and take the
verdict from `device perf`.

### Diagnose "GPU busy at low clocks"

Symptom: frames over budget, but CPU per thread (`device perf`) is low and `render.encode` is
short; the time sits in `render.acquire` / `present` (waiting on the GPU), often with the GPU at
a low frequency in Perfetto. On OpenGL ES (most Mali-class phones) the `gpu` number is the whole
frame, timed from Dawn's work-done callback (a millisecond or two late from polling), and the
governor counts a window GPU-bound when it misses the target with the GPU 85 % busy; the driver
may block for a buffer inside the first draw, so look at `render.encode` too, not only the
waits. Where timestamps exist (Vulkan, Metal) `gpu` is the whole frame too, every pass from the
world to UI, post and the present blit (ADR 0309), but it times execution, not a frame held back
for a buffer: read the waits as well, as the governor does: an overrunning frame that waited at
least a quarter of its interval on the surface counts as GPU-bound, unless its main-thread work
alone already misses the budget (ADR 0297). Fix fill and
bandwidth, not draw calls: render scale, `msaa: 1`, `hdr: false`, no post profile in 2D, less
overdraw (below). Low clocks under a light load are the driver saving power, not a fault; the
same load at a high clock is what heats the phone.

Drive the scenario the player actually stresses: the busiest level, the biggest board, a full
UI screen over gameplay, 10+ minutes of play for heap growth and thermals. Record a replay of it
(`gameengine replay`) so every later run measures the same thing.

## 3. Read the code the numbers point at

**CPU / script (per frame)**
- Systems that are hot in `profile.markers`: per-entity work over large queries, nested loops
  over entities (O(n²) proximity checks — use `SpatialHash` or `overlap*`), work every step that
  could run on change (`changed()` filters, events) or every N steps.
- Allocation in steady state: arrays/objects/closures created per entity per step, string
  building, `JSON` in systems, spreads of large arrays. Target: zero allocations per frame in play.
- Native calls in loops (`no-native-call-in-loop` lint), `world.get` per entity instead of
  column views, structural changes (spawn/despawn/add component) per frame at scale — pool or
  toggle instead.
- A system over ~1 ms on low devices with a clean algorithm is a candidate for Rust (skill
  `perf-to-rust`). A native system over a large table that loops serially can run in parallel
  ranges (`par_for_each` with a constant batch size); `gameengine native asm <System>` shows
  whether its loop vectorised.
- **Idle screens must call (almost) no scripts.** In Perfetto each script call is a
  `script.system:<name>` section (desktop: `profile.markers`). A menu or paused screen that still
  shows every system each step is paying ~15–40 µs per call on a low-end phone. Gate level systems
  with `runIf` on the game phase, event-driven systems with `runOn`/`{ event }`, systems that react
  to state with `{ changed: T }`, and pure derived-state systems with `skipUnchanged: true` (skill
  `ecs-systems`). A `skipUnchanged` system wakes on writes to any document unless it lists the
  ones it reads in `docs: [...]`. Prove no hash moved with `--hash-trace-baseline`. Count the
  calls: a headless `profile.start` / `profile.stop` lists each frame's `script.system:*` jobs.
- **Garbage every frame stutters.** No `JSON.stringify` cache keys, spreads, `map`/`filter`
  copies or fresh arrays and objects in per-frame views and controllers: compare the primitive
  inputs (and object identity) first and return the cached value. GC pauses show in `device
  perf` (GC per frame) and as `gc` sections in a trace.
- **Hidden entities still cost.** Hundreds of entities kept with `layers: 0` or `visible: false`
  still pay transform propagation and extraction every step. Spawn what shows (or pool it), and
  give the hidden ones no `MeshRenderer` or `Parent`.
- Work that grows with entity count every step: a whole board, list or model rebuilt or rewritten
  each step when one cell moved. Update what changed and keep a dirty flag.
- Meta documents: large state replaced instead of patched (skill `meta-economy`, cost at scale).

**GPU / draw calls**
- Draw calls vs budget (`render.stats`): sprites and UI images not in atlases, several atlases
  interleaved across sorting layers, per-entity material variants, masks and clip rects that
  break batches, text in many fonts/sizes. Per-entity colours or values on one 3D material go in
  `MaterialParams` (one vec4 + depth offset per instance), not in material copies, so many
  instances share one instanced draw.
- Effects: `gameengine vfx stats <effect> --device <class>` per effect (peak particles, overdraw,
  emitters as draws, texture side; skill `vfx`). Overdraw from big alpha quads costs more than
  particle count. Live instances of one effect share one draw per emitter (a combo of 40 bursts
  of a 3-emitter effect is 3 draws), except `space: local`, `orient: local` and random sheet start
  frames, which draw per instance; unsorted effects that agree on blend, mask interaction and
  texture page share draws too (skill `vfx`, ADR 0092), so mixed blend modes and big standalone
  effect textures are what add draws. Many short effects at once: one stopped system and
  `burstAt(system, positions)` instead of an entity each.
- Off-screen and invisible 2D content (outside every orthographic camera, alpha 0,
  `visible: false`) is not drawn but still costs extraction on the CPU (`render.stats().culled2d`
  / `transparent2d`; skill `atlasing`): pool thousands of parked entities, and hide pooled visuals
  from `LateUpdate` with `visible: false`, not `Hidden` (structural).
- A menu or shop screen whose opaque, unrounded background covers the whole screen stops the
  world being drawn under it (`render.stats().worldOccluded`); the world's 3D assets and particles
  stay resident. A translucent, rounded or partial panel does not.
- UI: the UI pass batches draws that do not overlap across tree order; overlapping sprite/text
  pairs still alternate. `<Model>` elements that `spin`/`bob` re-render every frame, still ones once
  (`render.stats().uiModelsRendered`); many UI particle effects are CPU-simulated per frame.
- **Fill rate and bandwidth decide a 2D frame on a 720p Mali-class phone**, not draw calls
  (budgets.md § Fill rate). Overdraw: full-screen transparent layers, big particle quads, stacked
  UI panels. Per tier in `project.gameengine.json` (`render.tiers.<tier>`): `msaa: 1` and
  `hdr: false` for 2D (shapes and text antialias in their shaders), `renderScale` below 1 for 3D
  or heavy fills. Without a post profile a frame takes the lean path: drawn in 8-bit straight
  into the swapchain with the UI in the same pass, and a render scale is upscaled in the present
  blit (the UI stays sharp). Any post profile (bloom, grading, vignette) brings back a float scene
  target and a full-size composite: avoid post in 2D games. Per device, `device-profiles.json`
  (the engine's `android-mali-g5x` runs at 0.75 scale and msaa 1; a project's own `device-profiles.json` is matched first) and
  its `targetFps`.
- **Idle screens** (menus, a paused board, a map waiting for a tap): every frame is drawn and
  presented, still or not (`idleFrames.enabled` is false: the engine does not skip identical
  frames, since a GPU left idle woke at a low clock the quality governor read as load). A still
  screen costs its full GPU frame, so cap it (Thermal below) and keep its draw cheap. A still
  frame writes no per-frame buffers; any 3D, particle effect, video, spinning `<Model>`, tween,
  animated sprite or per-frame UI change writes them again. Sim steps, scripts and UI run every
  frame, so the screen's CPU must be idle too:
  - no `ctx.set(T, {…})` of a resource whose values did not change (an object per call and a row
    rewrite; compare with `ctx.is` and write with `ctx.setField` only on change);
  - derived state (sorted lists, labels, formatted numbers) cached and rebuilt on change, not per
    frame; view models updated only when a value changed;
  - `loadData` once per system run (or cached by the controller), never per entity or per frame
    in a loop;
  - no per-frame allocation (arrays, closures, strings) in `LateUpdate`, UI controllers or
    systems; effects stopped when off screen;
  - and cap the frame rate (Thermal below).
  - **Animate idle screens in short bursts**, not continuously: a button that pulses for 0.5 s
    every 4 s, a shimmer once on open, then still. A loop that never stops (a rotating sunburst,
    a looping idle particle, a bobbing icon) keeps scripts and uploads running every frame and
    the phone warm.
- Pipelines compiled during play (`pipelinesCreatedDuringPlay`; on devices the `hitch pipeline:
  N created during play (…)` log line names them). Materials in a loaded asset group or scene
  warm their own pipelines behind the loading cover; `pipelines.json` adds 2D, particle and post
  pipelines and materials first drawn in play. `gameengine test --tier t1 --record-pipelines`
  plays each `tests/budgets/*.json` replay (a `structural` block and a `replay`) once per GPU tier
  (desktop, mobile, compat) and **replaces** each tier with what that run built, so the replays
  must cover every flow (menus, every level type, effects, popups). `gameengine check` warns when
  it is missing, partial or stale; a release build refuses it (skill `ship-mobile`).
  `render.pipelines` → `blobCache` says whether the disk cache served a second launch.
- 3D: triangles vs budget, LODs, shadow cascades per tier, skinned meshes count, real-time lights.

**Memory**
- Scene render target: the mobile tier defaults to 4× MSAA into a 16-bit float target, about
  40 B/px (four 8-byte samples plus the resolve), ~104 MB at 1080×2400 before depth. A 2D game
  gains nothing from either: `"render": { "tiers": { "mobile": { "msaa": 1, "hdr": false },
  "compat": { "msaa": 1, "hdr": false } } }` in `project.gameengine.json`; without post the frame
  then draws into the swapchain itself, with no scene target at all. (Depth/stencil is still
  allocated every frame; an engine gap.)
- Textures: sizes vs on-screen size, compression per platform (ASTC/ETC2; `compression =
  "astc6x6"` in the `.gmeta` for 44 % of ASTC 4×4 on phones), mipmaps on 2D UI (usually wasteful), atlases half empty, everything loaded up front instead of per level
  (bundles / on-demand). `gameengine profile batches --width 1080 --height 1920` lists sprite
  images at least 2× larger than drawn with the `max_size` that fits (skill `atlasing`).
- Audio: decoded sounds cost 96 KB/s mono, 192 KB/s stereo; stereo SFX that could be `mono =
  true`, music played with `PlaySound` or cooked short enough to decode whole, effects that
  decode on first use in play (skill `audio`).
- 3D meshes, materials and textures count against the groups' `textures` budget and are evicted
  with their group like 2D content; a 3D level outside any group stays resident.
- JS heap: caches without bounds, growing arrays of history, retained closures across scenes.
- Peak at transitions: the old level still loaded while the new one loads. Levels switch behind
  `loading.run` with `unload` before `load`; `memory report`'s peak is the `boot` group plus the
  largest other (skill `asset-memory`).
- Content in no asset group, or one group per game instead of per level: nothing to release.
  Groups over their `tests/budgets/memory.json` entry are findings with the MB number.
- Spawn/despawn of short-lived prefabs in play: pool them (`pool.warm/take/give`); `pool.stats()`
  `misses` > 0 means the pool is too small. `gameengine pool stats` on a running session suggests
  warm counts from each pool's `peak`; `{ grow: true, max }` lets a pool grow instead of missing.
- UI pooled by hiding (`display: none` / `opacity: 0` slots toggled by a class): replace it with
  `<Pooled>` or mount on demand (skill `ui-mvc-views`). Shown UI nodes over the budget
  (`gameengine check` → `ui nodes`) cost on every UI change; `--ui-layout` headless runs and the
  `ui.cascade` / `ui.layout` / `ui.paint` markers show what the UI costs.

**Load and size**
- Work at boot that could be lazy; synchronous big JSON; pipelines not warmed
  (`pipelinesCreatedDuringPlay`); store download over 150 MB without on-demand bundles.

**Thermal / battery**
- 60 fps in menus and idle screens: the screen's UI controller should call
  `quality.setTargetFps(30)` while it shows and `quality.setTargetFps(null)` when it closes
  (`@gameengine/runtime`; presentation only, the 60 Hz sim step and the hash do not change).
  Effects that run while invisible, timers polling services every frame.
- Frame-rate settings: the target is the lowest of `render.targetFps[<tier>]`, the device
  profile's `targetFps` (30–40 for low-end phones in `device-profiles.json`), the thermal
  governor and the screen's cap, never above 60 on phones (ADR 0079) and never above a rate the
  display does not run. The governor's frame-rate step halves the target (120 → 60 → 30) in the engine's
  `default` policy; a project's own policy drops to its `targetFps` at once unless it sets `halveFps`. The project's own
  `render.targetFps` entry replaces the profile's `targetFps`: `"mobile": 60` runs 60 on a phone
  whose benchmark said 30, so set it only for a game that fits 16.6 ms there. 0 is no target,
  not a choice: the profile's `targetFps` still applies. The `compat` tier
  (low-end phones) runs 30 unless `render.targetFps.compat` says otherwise (0: uncapped, i.e. 60), and so does
  any phone in the `phone-low` memory class (3 GB or less) unless `render.targetFps["phone-low"]` is set (ADR 0102).
  `render.targetFps.mobile` does not raise it: setting `"phone-low": 60` is a decision to take only after
  `gameengine device perf` on such a phone shows frames fit 16.6 ms with two sim steps' worth of headroom. Do not ask for 90/120
  on mobile: a steady 60 beats a hot 120. `gameengine run --run-sec 5` prints the target and the
  frame intervals on desktop.

## 4. Where the fix lives

| Finding | Skill |
|---|---|
| Hot system, allocation per step, hot/cold data, Rust port, parallel ranges, vectorisation | `perf-to-rust` |
| Per-step work that could run on change, polling instead of events | `ecs-systems` |
| Spawn/despawn churn, memory over budget, level-switch peaks, loading | `asset-memory` |
| Draw calls from sprites and UI art | `atlasing` |
| Sound memory, first-use decodes, voices | `audio` |
| Particles, overdraw, materials, per-instance values, culling | `vfx`, `vfx-materials`, `models-3d` |
| Too much for a low-end phone (effects, materials, textures, 3D, post): a cheaper version for `phone-low` or `compat` | `device-tiers` |
| O(n²) proximity, big worlds | `overlap-queries`, `open-world-streaming` |
| Any fix that reorders, parallelises or changes math | `determinism` — hashes must not change; prove it with a `--hash-trace` baseline taken before the fix |

Name the skill in the finding's `fix:` line.

Presentation code that must know the device reads `quality.device()` (`{ tier, memoryClass,
qualityLevel, thermal }`; never in sim). Under GPU load and heat the quality governor steps down
further on its own: render scale, `vfx` (VFX capacity and rate) and `lodBias` (coarser LODs).
A review counts what a phone-low phone draws **before** the governor steps in.

### Why the governor stepped down

Every change is an Info line, category `quality`, in every build:
`governor step 1/5 (load, cpu-bound), target 30 fps, render scale 1.00, msaa 0`. `qualityLevel`
and the `n/m` count the steps in effect. The cause names the fix (ADR 0297):

- `load, gpu-bound`: most slow frames were render-side, so it took the policy's next step in
  order (the `default` policy: render scale, then post, shadows, `vfx` and `lodBias`, then MSAA,
  frame rate last). Fix fill and bandwidth (above).
- `load, cpu-bound`: most slow frames were main-thread work (script, GC, sim steps,
  presentation), and a quarter of the last second's frames ran over budget by more than 10 %.
  It took only a frame-rate step, and only after about two seconds of it (a shorter burst, such
  as a drag, keeps the rate): render steps do not lower CPU time, so render quality stays. Fix
  the CPU cost (`perf-to-rust`, `ecs-systems`, allocation per step that feeds GC). It returns to
  60 after four calm seconds (longer after a failed try, up to 16 s) once the frame, counted with
  one sim step instead of two, fits 85 % of 16.6 ms in three frames of four.
- `thermal <state>`: the device's thermal state set a floor (fair the first step, serious half,
  critical all). Fix sustained load and idle screens (Thermal / battery, above).
- `headroom`: a step undone because frames fit again.

A game whose two sim steps plus presentation exceed 16.6 ms owes the clock two steps every frame
after any hitch, so it stays at 30 fps whatever the governor does: budget the sim step as above.

## 5. Report

Start with a summary of at most 20 one-liners, most expensive first, covering both the spikes
(one-time costs: a level start, a first effect, a level switch) and the steady cost (every
frame): `[high] spike: 228 ms at level start: 41 pipelines created in render.pipeline (fix:
pipelines.json; testing)`. Then one entry per finding with its evidence:

```
[high] src/board.ts:212 — MatchScan allocates a Set and two arrays per tile per step
  measured: scriptTimeP95Ms 7.9 on android-low-compat (budget 5); profile: MatchScan 4.1 ms
  fix: reuse module-scoped scratch buffers via a resource; scan only rows touched by the last move
  verify: gameengine test --tier t1; perf.stats scriptTimeMs p95 on the level_12 replay
```

- Severity: **high** = over a budget on a supported device class (or will be at the stated
  scale), **medium** = within 20 % of a budget or grows with content, **low** = hygiene.
- Every finding cites a number (measured, or computed from the code at a stated scale) and a
  budget from `tests/budgets/*.json` or budgets.md. No number, no finding — say what to measure.
- End with: what was measured and on what (headless vs device), what could not be measured here
  (real GPU time, thermals, memory limits need devices), and the budgets file to add if missing.

If the project has no `tests/budgets/*.json`, propose one from budgets.md for its device classes
and a replay of its heaviest scene.
