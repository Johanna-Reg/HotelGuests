---
name: device-tiers
version: 1.20.0
tier: required
description: Cheaper content per device — phone-low first, quality levels low/medium/high per platform (quality.select, quality.levels, --level), opt-in visual features per level (quality features, quality show, W_FEATURE_OFF), overrides in materials, VFX, textures, meshes, post, audio. Use when a game runs badly on phones or an effect is missing on a device.
---

# Device tiers

**Covers:** Cheaper content per device in Game Engine — designing for phone-low first, and the `overrides` block keyed by GPU tier (compat, mobile, desktop) or memory class (phone-low, phone, tablet, desktop, memory.budgets names) in materials, VFX, texture and mesh .gmeta, post profiles, render.tiers and audio; how they merge (class over tier), what may differ (presentation only), quality.device(), the governor's vfx/lodBias steps, and how to check each on a device class (validate, material preview --class / --device, texture inspect, vfx stats --device, memory report --device, renderTest { memory }, --memory-class phone-low). Use when a game runs badly on low-end phones, when adding heavy content (an effect, material, big texture, 3D model, post profile), when adding a cheaper look for phone-low or compat, or when an override does not apply.

Design: `docs/design.md` § 6 "Per-device content" and ADR 0103 in the engine repo. Working
example: `samples/orbit-garden` (`tests/tiers.test.ts`).

## Design for phone-low first

The weakest phone the game ships on sets the design; richer devices get extra, not the other way
round. A `phone-low` phone is about 3 GB of RAM, a Mali-G52-class GPU and a slow CPU, and runs
at **30 fps** unless the project opts up (ADR 0102): one frame is 33 ms for two 60 Hz sim steps
plus presentation. Before adding heavy content, decide what that phone draws:

- **Make a cheaper version** when the content is heavy on the GPU or memory: big alpha quads or
  dense particles (overdraw), multi-texture or lit materials, post profiles, textures at 1024 or
  more, high-poly 3D, many voices. Measure first: `vfx stats --device android-low-compat` over
  the overdraw budget, `memory report --device phone-low` over budget, or `device perf` frames
  over 33 ms (skill `mobile-performance-review`, budgets.md).
- **Keep the same version** when it is cheap already (a small sprite, a flat material): an
  override nobody needs is one more thing to keep in sync.
- **Never cut what the player needs to play**: what a tap hits, what scores, what the board
  shows. Cut density, resolution and polish (glow, secondary particles, post, shadows).

## Keys and merging

A device has these keys, least specific first:
- its **GPU tier**: `compat`, `mobile`, `desktop` (after any device-profile lowering);
- its **memory class**: `phone-low` (3.3 GB of RAM or less, or any compat GPU), `phone`,
  `tablet`, `desktop`, or a `memory.budgets` name;
- its **quality level**: `low`, `medium` or `high`;
- its **quality platform**: `ios`, `android`, `desktop` or `web`;
- the two together: `android.low`, `ios.high`, `web.medium`, …

Content carries one `overrides` block. On a device each applying key's entry merges over the
last in that order, so `android.low` wins over `low`, which wins over `phone-low`. Objects merge,
`null` removes a field, anything else replaces. VFX emitters are addressed by name. `desktop` is
the tier and class, never the platform: on PCs write `desktop.low` / `desktop.medium` /
`desktop.high`. Overrides resolve when content loads and when the keys
change, never per frame.

## Quality levels (low, medium, high per platform)

Each platform has three levels, picked once at boot from what the device reports. The engine's
rules (from 3DMark Wild Life Extreme scores and best-selling phones):

| Platform | low | medium | high |
|---|---|---|---|
| android | compat GPU, 3.3 GB or less, GPU score under 550 (Galaxy A06, A16, Redmi Note 13) | score 550+ and 4 GB+ (Galaxy A25–A56, Pixel 8) | score 2600+ and 6 GB+ (Galaxy S24) |
| ios | 3.3 GB or less, A12 and older (iPhone XR, SE 2) | A13–A14 (iPhone 11, 12) | A15 and newer (iPhone 13 on) |
| desktop | software or Intel HD/UHD graphics | everything else | a discrete GPU or Apple M chip |
| web | anything but a desktop OS with a discrete GPU | that | — |

A project replaces a platform's rules in `project.gameengine.json`; first match wins, and the
last rule should have no `when` so every device gets a level:

```json
"quality": {
  "select": { "android": [
    { "level": "high", "when": { "gpuScore": ">=3000", "ramGb": ">=8" } },
    { "level": "medium", "when": { "gpuScore": ">=700" } },
    { "level": "low" }
  ] },
  "levels": {
    "low": { "msaa": 1, "renderScale": 0.8, "targetFps": 30 },
    "android.low": { "post": false },
    "high": { "sceneDepth": true }
  }
}
```

- `ramGb` is what the phone reports, below its marketed size (4 GB reports about 3.7): cut at
  3.5 for 4 GB and 5.5 for 6 GB. A GPU the score table does not know scores from the
  first-launch benchmark.
- `when` facts: `gpuScore`, `ramGb`, `cpuCores` (`">=4"`, `"<3.3"`), `chip` (`">=a15"`, `"m1"`),
  `capability` (`compat`/`mobile`/`desktop`), `gpu`, `model`, `soc`, `os` (substring or list),
  `discrete` (true/false). A rule on a fact the device did not report does not match.
- `quality.levels.<key>` takes the `render.tiers` fields plus `targetFps` (a cap: the lowest
  applying one wins). `render.tiers` and `render.targetFps` accept the level keys too.
- Tests, the editor and tools pick no level: they take the one their tier and class give
  (compat or phone-low → `low`, mobile → `medium`, desktop → `high`) with no platform, so goldens
  do not depend on the machine. `--level android.low` (on `test` and `run`) forces one; a bare
  `--level low` keeps no platform.
- **Desktop graphics setting (opt-in):** `"quality": { "playerChoice": { "desktop": true } }` lets
  the game's own settings menu offer Low / Medium / High / Automatic. Show it only when
  `quality.levelChoice().offered`; `quality.setLevel('low')` (or `null` for Automatic) rebuilds the
  renderer on `desktop.low` next frame and is remembered across launches. Phones and the web never
  offer it. Put the per-level differences in `quality.levels["desktop.<level>"]`.
- Check a rule change before shipping: `gameengine quality which --devices players.csv`
  (`platform,model,gpu,soc,ramGb,share`; model ids with commas in quotes) prints each device's
  level, the rule that picked it and the share of players per `<platform>.<level>` (MCP
  `quality_which`). Without `--devices` it reports this machine.

## Visual features per level

Costly visuals are named features: bloom, SSAO, depth of field, SMAA, scene depth, scene inputs
(materials reading the scene), clearcoat, reflection probes, spot shadows, depth prepass, 2D
lighting, area lights (`areaLights`: Rect, Disk and Tube lights; point lights where off), soft
shadows (`softShadows`, PCSS, desktop only: for PC games, never on for phones or web). Do not guess what exists or what it costs; ask the engine:

- `gameengine quality features` (MCP `quality_features`): what each does and needs, the lowest
  GPU tier that runs it, its GPU ms and memory on three reference phones (estimates until
  measured), the `<platform>.<level>` cells it is on in for this project, the content using it.
- `gameengine quality show --platform android --level low` (MCP `quality_show`): every setting
  and feature that cell runs with, the key each came from, and why an off feature is off.
- `gameengine quality set ios.high reflectionProbes=on bloom=default` (MCP `quality_set`):
  writes switches into `quality.levels.<key>` (`default` removes one) and prints the catalog
  again. The editor's Build > Quality Levels & Visual Features window runs the same command: a
  grid of features by platform and level, and each feature's cost and the files that use it.
- `gameengine device perf --feature-sweep` (or `quality sweep` on a `run --headless` session
  with a viewport): this device's GPU and frame ms for each feature, measured off then on. Use
  it on a phone-low device before turning a costly feature on for `low`.

Special visuals are opt-in: bloom, SSAO, depth of field, scene inputs, clearcoat, reflection
probes, spot shadows, area lights and soft shadows are off until a key switches them on. A feature the device's tier cannot
run stays off:

```json
"quality": { "levels": {
  "high": { "features": { "bloom": true } },
  "ios.high": { "features": { "reflectionProbes": true, "spotShadows": true }, "sceneDepth": true },
  "desktop": { "features": { "bloom": true, "ssao": true, "clearcoat": true } }
} }
```

- Adding an effect means adding its switch for the levels that can pay for it: check its cost in
  `quality features` against the 33 ms phone-low frame. SMAA, scene depth and the depth prepass
  keep their tier defaults (desktop on).
- A post profile that leaves `bloom` or `ssao` out still asks for them (both default on in a
  profile): switch them on, or set `"enabled": false` in the profile so `W_FEATURE_OFF` stays quiet.
- A project file at `"$schemaVersion": 1` still runs every special visual its tier has, and
  `validate` warns `W_QUALITY_FORMAT`. `gameengine migrate` moves it to version 2 and writes the
  ones its content runs as `render.tiers.<tier>.features`, so nothing it draws changes; review
  that diff and narrow it per level.
- `sceneDepth` and `lighting2d` keep their own fields; SSAO and depth of field do nothing without
  `sceneDepth`.
- Post features follow a level change at once; clearcoat, probes, spot shadows, depth prepass and
  scene inputs apply when the renderer starts.
- `gameengine validate` warns `W_FEATURE_OFF` when content asks for a feature some cell has off
  (a post profile with SSAO, a clearcoat material, a probe, a shadowed spot light) and names the
  switch. Either turn it on there, or accept the fallback and give that content a cheaper
  `overrides` entry.

## Where it goes

| Content | Example |
|---|---|
| `*.mat.json` | `"overrides": { "phone-low": { "use": "materials/plastic.mat.json" } }` |
| `*.material.ts` | `material('Gem', { …, fallback: 'materials/plastic.mat.json', overrides: { compat: { use: 'materials/flat.material.ts' } } })` |
| `*.vfx.ts` / `*.vfx.json` | `effect('Confetti', [...], { overrides: { 'phone-low': { capacityScale: 0.5, rateScale: 0.5 }, compat: { emitters: { glow: { enabled: false } } } } })` |
| texture `.gmeta` | `[settings.overrides.phone-low]` then `max_size = 512` |
| mesh `.gmeta` | `[settings.overrides.phone-low]` then `max_size = 256`, `lod_bias = 1`, `min_lod = 1` |
| `*.post.json` | `"overrides": { "phone-low": { "bloom": { "enabled": false } } }` |
| `render.tiers` in `project.gameengine.json` | `"phone-low": { "post": false, "renderScale": 0.8, "lighting2d": false }` |
| `audio` in `project.gameengine.json` | `"maxVoices": 32, "overrides": { "phone-low": { "maxVoices": 16 } }` |

- **Materials:** `use` draws another material (at most 4 hops). `fallback` is drawn when the
  material cannot load or build on the device. Neither moves `pipelines.json` records. Skill
  `vfx-materials`.
- **VFX:** `capacityScale` and `rateScale` (the rate also scales bursts); emitter fields by name,
  `enabled: false` to drop one; `use` draws another effect. All emitters disabled draws nothing.
  Edit a `*.vfx.json`'s block with `gameengine vfx set <fx> sparks.rate 40 --device phone-low`
  (or `capacityScale` / `rateScale` / `use`; `null` removes), not by hand. A new effect or other
  text asset needs its `.gmeta`: create it with `gameengine cmd asset.setText` (it writes a new
  file under an existing `assets/` folder with its sidecar) or run `gameengine cook` once, and
  commit the `.gmeta`.
  Skill `vfx`.
- **Textures:** `max_size` becomes a mip skip at upload, so one cook serves every device. A
  texture without mips is cooked with extra levels down to its smallest override. It changes
  texels, never how big a sprite or UI image draws, and loose runs apply it too (the smaller of
  the file's `max_size` and the device's). **Atlas
  sprites cannot take it** (`W_OVERRIDE_FIELD`): give a phone-low look by a smaller atlas group
  or `max_size` on the whole sprite (skill `atlasing`).
- **Per platform, not per device:** a texture's cooked *format* (and `quality`, `max_size`) can
  differ by iOS / Android / desktop with `[settings.platform.ios]` (`compression = "none"`) or
  the project default `textures.platform.android` in `project.gameengine.json` (ADR 0108). That
  is a cook setting, so it cannot go in `overrides` (`E_OVERRIDE_FIELD`); `gameengine texture
  inspect <key> --device ios,android` shows each platform's result.
- **Meshes:** each `lod_bias` step accepts a LOD with twice the screen error (−4..4); `min_lod`
  (0–4) never uploads the finer LODs, so the device does not spend memory on them (about half a
  mesh's GPU memory per step). For every mesh at once, set `meshLodBias` / `meshMinLod` in
  `render.tiers.<key>` or `quality.levels.<key>` (e.g. `"android.low": { "meshMinLod": 1 }`); a
  mesh's own `overrides` win. A mesh's `max_size` skips the top mips of its embedded images,
  as a texture's does. Skill `models-3d`.
- **Sky material:** an `Environment.skyMaterial` sky runs its material on every uncovered pixel.
  `skyScale` (0.25–1, default 1) in `render.tiers.<key>` or `quality.levels.<key>` shades it at
  that fraction of the width and height and stretches it behind the scene: `"phone-low":
  { "skyScale": 0.5 }` runs it on a quarter of the pixels, while desktop and high levels keep 1.
- **Post:** `render.tiers.<key>.post` is `false` (no post: the lean 2D path) or a profile key
  that replaces every camera's profile.
- **Render settings:** `msaa`, `keepMsaa`, `renderScale`, `post`, `lighting2d`, `sceneDepth`, `meshLodBias`,
  `meshMinLod` and `skyScale` follow a key change at run time; `hdr` and `shadow*` apply when the renderer starts.
- **Anti-aliasing:** 3D gets 4x MSAA by default on mobile and desktop, and FXAA (or SMAA where the
  `smaa` feature is on) when `msaa` is 1. Some GPUs' device profiles turn MSAA off (Mali-G5x,
  PowerVR); `"keepMsaa": true` on a level keeps the project's MSAA there, and the governor still
  turns it off when the phone runs hot or slow. For sharper edges on strong devices, opt the high
  level in: `"high": { "msaa": 4, "keepMsaa": true, "renderScale": 1.25 }` (above 1 renders more
  pixels than the screen: GPU cost grows with the square; measure with `gameengine device perf`).
  Nothing here costs a game that leaves it unset.
- **SSAO and depth of field on phones:** they read the scene depth, which only desktop has by
  default. Opt phones in with `"mobile": { "sceneDepth": true }` and keep `"phone-low":
  { "sceneDepth": false }`; with MSAA that adds a half-size depth-only pass of the opaque scene.
  Compat never draws them, and a device that benchmarks low turns them off, so the game must look
  right without them: never put what the player needs to read into SSAO or depth of field.
- **Audio:** `audio.maxVoices` caps every sound's own `maxVoices`; a new sound steals the oldest
  voice of equal or lower priority. Skill `audio`.
- **Not yet:** UI views, fonts and 2D skeletons take no overrides; ship one version sized for
  phone-low.

## Rules

- **Presentation only.** Scenes, prefabs and data assets cannot have overrides
  (`E_OVERRIDE_SIM`): hashes and replays must be identical on every device. Gameplay is the same
  on every phone; only how it looks and sounds differs.
- **`quality.device()` is presentation only.** It returns `{ tier, memoryClass, level,
  platform, levelRule, qualityLevel, thermal, language }` (`qualityLevel` is the governor's step)
  for UI controllers and `LateUpdate` code (e.g. skip a decorative effect). It throws
  in sim systems and the `no-presentation-import-in-sim` lint flags it (skill `sim-boundaries`).
  Prefer an `overrides` block over code: it is checked by `validate` and shows in the reports.
- **The frame rate is a cap, not content.** `render.targetFps` takes the same keys, but the
  lowest applying entry wins. Raise `"phone-low"` only after `gameengine device perf` on such a
  phone shows frames fit 16.6 ms with headroom (skill `mobile-performance-review`).
- **The quality governor stacks on top.** Under load and heat it scales VFX further (`vfx`) and
  biases LODs (`lodBias`): the phone-low version should already fit without it. A phone that
  cannot hold 60 fps drops to 30 and wins back the render steps that fit at 30. A heavy 3D game
  that would rather run 30 fps with its full look than 60 with a blurred one sets
  `"governor": "visuals-first"` on a `render.tiers` or `quality.levels` entry (e.g. `"mobile"`):
  that ladder lowers the frame rate before render scale, post or shadows.
- **Tell the governor when the game is loading.** It already ignores frames while assets and
  pipelines load and for 0.5 s after a start or launch. Work the engine cannot see, such as
  building a level's meshes or spawning its contents over a few frames, would read as load and
  lower the render scale or frame rate for the rest of the level: call `quality.settle(seconds)`
  (presentation, at most 3 s) from the `LateUpdate` or UI code that starts it, once per load:
  asks that run into each other hold for their first 3 s only. Thermal steps still apply.

## Check it

- `gameengine validate`: `W_OVERRIDE_KEY` (a typo such as `phone_low`, or an emitter name that
  matches nothing), `E_OVERRIDE_FIELD`, `E_OVERRIDE_USE`, `E_OVERRIDE_SIM`.
- `gameengine material preview <key> --tier mobile --class phone-low --out m.png`; add `--device android`
  (or `ios`) to see its textures as that platform's cook leaves them (ADR 0107).
- `gameengine texture inspect <key> --device android,android-etc2,ios`: the cooked texels per device
  (`android-etc2`: a compat-tier Android GPU without ASTC, where textures arrive as ETC2), PSNR per
  mip level, and the size each memory class uploads after its `max_size`.
- `gameengine vfx stats <fx> --device phone-low` (a memory class reads its budget row:
  `phone-low` → `android-low-mid`, `phone` → `android-mid`, `tablet` → `ipad`;
  `android-low-compat` adds the compat tier; prints the resolved tier and class).
- `gameengine memory report --device phone-low` (counts texture overrides).
- `gameengine test --memory-class phone-low`, or a `renderTest(…, { memory: 'phone-low' })`,
  resolves every override for that class and enforces its memory budget. To compare in one test,
  call `assets.setDeviceClass('phone-low')` and step.
- On a phone-low phone (`gameengine build android --config probe`, `gameengine device perf`):
  the `setup:` line names the level and the rule that picked it, then the tier and memory class.
