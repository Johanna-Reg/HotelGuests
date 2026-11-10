---
name: gpu-profile
description: Mobile GPU profiling with gameengine tool gpu-capture, gpu-ab, gpu-diff, gpu-device - bytes per pass from load/store, MSAA/HDR tile fit, overdraw, shader op mix, draws, full-screen post, on a phone-low model and real phone counters, with hints (WORLD_FRAGMENT_COST, FULLSCREEN_COST). Use to make a game cheaper on phone GPUs or prove a change did.
---

# GPU profiling loop

`@tactilegames/gameengine.gpu-profiler` answers "what does one frame of this game cost a phone GPU,
where, and what setting or asset would make it cheaper". Phone GPUs draw the screen in small tiles in
on-chip memory; what costs them is memory traffic (passes that load or store attachments, wide HDR
formats, full-screen post passes), shading every layer of blended overdraw, and draws. The profiler
captures one frame from a headless session and prices it on a **device model** (`phone-low` by
default: a Mali-G52 MC2 phone at 720x1600 and 30 fps), then checks the model on a real phone's
own GPU counters.

The first call builds the analyser into `.gameengine/gpu/` (needs Rust: `gameengine setup --native`,
about a minute). Runs go to `.gameengine/gpu/runs/<label>`.

## The loop

1. **Capture the starting point:**
   ```bash
   gameengine tool gpu-capture --label before                    # phone-low, the start scene after 120 steps
   gameengine tool gpu-capture --label before --device adreno-7xx --scene scenes/level3.scene.json --steps 600
   ```
   Same scene, steps and device model give the same frame, so captures compare. `--device` is
   `phone-low` (Mali-G52), `mali-g76` (Galaxy S10), `adreno-7xx` (Galaxy Z Flip4), `apple`
   (estimated) or `desktop`. The session runs at that phone's size, quality level and memory class,
   so `render.tiers.phone-low`, `quality.levels.android.low` and post-profile `overrides` apply as
   on the phone.
2. **Read the top hint** (`H1`): what to change, the pass, how many milliseconds it should save on
   the model, its confidence, and the A/B recipe. `gameengine tool gpu-show --run before --pass 3d.forward`
   lists one pass's attachments (format, size, samples, load/store, read later or not).
3. **Try the lever without editing the project:**
   ```bash
   gameengine tool gpu-ab --override '{"features":{"bloom":false}}' --label no-bloom
   gameengine tool gpu-diff --before before --after no-bloom
   ```
   `gpu-ab` runs a shadow copy whose quality level carries the override (`msaa`, `hdr`,
   `renderScale`, `post`, `features`, `lighting2d`, `sceneDepth`, `shadowSize`, `shadowCascades`,
   `shadowPcf`);
   `project.gameengine.json` is untouched.
4. **Make the change** (the hint's `change:` line names the key and where it comes from today),
   check the game still looks right (`gameengine screenshot`) and its tests and hashes still pass
   (`gameengine test --js both`: GPU settings never change the sim hash), capture again, diff.
5. **Confirm on a phone** before claiming a speed-up: build a probe APK
   (`gameengine build android --config probe`), install it, then
   ```bash
   gameengine tool gpu-device --label phone-before --model before   # adb: counters, governor steps, fps, temperature
   ```
   Keep a change when the model diff, the phone's GPU cycles or time per frame, and the frame rate
   agree. Compare warm runs (`warmup`, default 20 s) at similar temperatures.

Over MCP the tools are `tool_gpu_capture`, `tool_gpu_ab`, `tool_gpu_show`, `tool_gpu_diff`,
`tool_gpu_device`, `tool_gpu_trace`, `tool_gpu_shader`, `tool_gpu_clean`, with the same parameters.

## Reading the numbers

- **est. ms**: the model's estimate for ranking: the larger of shading time (op mix × fragments ÷
  the GPU's unit rates, including varying interpolation), blending time and memory time (after
  framebuffer compression), plus per-draw cost. Not a measurement; desktop GPU ms is shown alongside
  and is never phone time. Against two farm phones: calibration scenes within 6% (Galaxy S10) and
  13–30% low (Galaxy Z Flip4), 3D frames within about ±30%, render-scale changes within two points
  (the package's `docs/validation.md`).
- **MB per frame** and **load/store/resolve/tex**: traffic per pass from formats, sizes and
  load/store, before the phone's lossless framebuffer compression; `dramBytes` in the JSON is the
  estimate after it (flat or dark images compress far more).
- **tile**: Mali tile size in pixels (16x16 = 256 is full; "shrunk" costs throughput), or Adreno bins.
- **fragments xN**: fragments per target pixel. `overdraw` counts come from the engine (or its
  overdraw view: world sprites and meshes, not the game UI); otherwise one per pixel is assumed.
- **confidence**: `modelled` (engine-reported attachments), `inferred` (attachments inferred from
  the pass list and settings, on engines without `render.gpuFrame`), `measured` (engine counts),
  `static` (a shader's source-level op mix: a pattern, not cycles).
- **missing from this engine**: what this engine version cannot report and what the model assumed
  instead.

## Hints and what to try

| Code | Means | Try |
|---|---|---|
| `PASS_SPLIT_ROUNDTRIP` | a pass loads what an earlier pass stored: the attachment goes out to memory and back | a lean frame (no post profile or outlines) draws world and UI in one pass; fewer bloom levels |
| `MSAA_STORED` | all samples of a multisampled target are written to memory | as above, so the resolve stays on chip; or `msaa: 1` on low levels |
| `STORE_UNUSED` | a stored attachment nobody reads | engine store op (report it) |
| `TILE_BUDGET` | colour + depth bits per pixel shrink Mali tiles or need many Adreno bins | `msaa: 2` or `1`, `hdr: false` on that level |
| `WIDE_FORMAT` | HDR (RGBA16F) targets double colour traffic | `hdr: false` where nothing needs values above 1 |
| `FULLSCREEN_COST` | a full-screen post pass costs this much | `features.bloom/smaa/ssao/dof: false`, `post: false` or a cheaper post profile on low levels, `renderScale` for scene-size passes |
| `WORLD_FRAGMENT_COST` | the world pass's shading is a large share of the frame (fragments × the materials' compiled ALU) | `renderScale` 0.8 on that tier (fragment work falls with its square; a Galaxy Z Flip4 ran orbit-garden 26% cheaper), lighter materials |
| `OVERDRAW_HIGH` / `BLEND_OVERDRAW` | many fragments per pixel; blending stops hidden-pixel removal | fewer full-screen layers, trimmed sprites, smaller particles; `render.debugView overdraw` shows where |
| `LATE_Z` | a shader discards or writes depth: hidden pixels get shaded | blend instead of alpha test, draw it after opaque geometry |
| `F16_CANDIDATE` | colour maths in f32 only | engine decision first (shader-f16 is not enabled yet) |
| `SFU_HEAVY` / `TEXTURE_BOUND` | the static op mix points at one unit | fewer pow/exp/sin per pixel; fewer taps, mipmaps, compressed textures |
| `DRAWS_HIGH` | many draws in a pass | `gameengine profile batches`: atlas textures, share materials, instance |
| `PIPELINE_HITCH` | pipelines created mid-run | `gameengine test --record-pipelines` so builds ship `pipelines.json` |

## On a phone

- `gpu-device` (adb) and `gpu-trace` (a trace pulled another way) report per frame: GPU time
  (Mali GPU cycles at the measured clock; Adreno render-stage time), external read/write bytes
  (Mali), fragments, late-Z share, texture L1 miss rate and half-precision ALU share (Adreno), the
  driver's render stages with bins per pass (Adreno), frame rate and temperatures, and model vs device
  when `model` names a capture of the matching device model.
- The capture restarts the app (the render-stage layer loads at app start), sets the GPU profiler
  debug property and starts the vendor's counter producer, and **restores both, plus Qualcomm's KGSL
  counter switch, when it ends**; its log's `restored:` line shows the values.
- Farm phones reachable only through a remote shell: `gpu-device --plan true` stages the script
  and prints the push / run / pull steps, then `gpu-trace --run <label>` analyses the pulled trace.
- Counters are device-wide (the compositor is included) and clocks move with load and heat: compare
  medians of warm runs, and prefer GPU cycles per frame over milliseconds.
- **Read the `engine settings` line.** The engine's quality governor lowers render scale and MSAA
  on a phone that looks GPU-bound (a Galaxy S10 stepped twice within two seconds of launch). When it
  stepped, the phone rendered the governor's settings, not the build's: an A/B pair then compares
  the governor's choices, so capture the model at those settings (`gpu-ab --override
  '{"renderScale":0.72}'`) and repeat runs. A change that keeps the governor one step higher is a
  real gain even when cycles barely move.
- Adreno: GPU time is shader busy × clock when the driver gives the app no render stages, and its
  byte counters count cache traffic, so the report shows bus busy instead of DRAM bytes.

## Limits

Android phones with Perfetto GPU producers (Adreno, Mali) only; no iOS counters (Apple's need
Xcode). Engines without the GPU introspection hooks (`render.gpuFrame`, `render.shaders`,
`render.overdraw`) get attachments inferred from the pass list and settings (as engine 0.1.18 plans
frames), overdraw from the overdraw view, and shader costs only for the engine's post passes, which
then rank too high. 3D materials are uber-shaders the model prices without knowing which branch each
pixel takes, and small triangles shade partial quads it does not count. Times are estimates; the
package's `docs/validation.md` says how far the model was from two farm phones, and that no Mali-G52
phone was available to check `phone-low` directly.
