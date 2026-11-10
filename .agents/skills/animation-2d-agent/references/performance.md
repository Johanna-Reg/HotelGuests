# What 2D skeleton features cost (measured)

Read this before choosing a feature for a mobile game. Every number here was **measured**, not
guessed, on engine-made rigs (no art) at mobile scale, and the tiers below follow from them. For a
rig you have, `gameengine anim2d metrics <file> --device <class>` applies the same numbers to it.

## How it was measured

- **Machine:** Apple M2 Max (12 cores), macOS 26, release build, one core per instance (the
  engine poses instances in parallel on its job threads; the numbers are per instance).
- **Rigs** (`gameengine_skel2d::bench`): a 31-bone rig (5 chains of 6 bones, 30 drawn slots, a
  typical phone character) and a 100-bone rig (9 chains of 11, 99 slots, a hero at the `phone`
  budget), one region per bone, animation `a0` rotating every bone with bezier keys. Each row
  switches one feature on over that baseline. 50 and 200 instances: the cost per instance was the
  same at both (it scales linearly with instances).
- **Pose CPU** (tracks, timelines, constraints, physics, world transforms; what the game pays per
  instance per frame, presentation included):
  `cargo test -p gameengine-skel2d --release -- --ignored --nocapture feature_costs`
- **Draw lists** (draw calls, why batches broke, bytes uploaded per frame, CPU-skinned vertices, CPU
  to build the draw list after posing): `cargo test -p gameengine-render --release -- --ignored --nocapture skel2d_feature_costs`
  (needs a GPU).
- **Not measured here:** the GPU's time (vertex skinning, fill, overdraw). A desktop GPU says
  nothing about a phone's; see "What only a device can tell" below.
- The editor's wasm evaluator (viewport, lint, Metrics view) is a tool cost, never a game cost:
  it is not in these numbers.

## The numbers

Pose µs per instance per frame (× the baseline of the same rig); draw columns for 200 instances of
the 100-bone rig (draw calls for all 200, KB uploaded per instance per frame, CPU-skinned vertices
for all 200, draw-list µs per instance).

| Feature | 31 bones µs | × | 100 bones µs | × | Draw calls | KB/inst | CPU verts | Draw-list µs |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **baseline: regions** | 1.48 | 1.00 | 4.59 | 1.00 | 1 | 13.2 | 0 | 5.0 |
| mesh 8 verts, unweighted / 1 / 2 / 4 influences | 1.5 | 1.00 | 4.6 | 1.00 | 1 | 17.8 | 0 | 5.4–5.7 |
| mesh 32 verts, 2 influences | 1.46 | 0.98 | 4.60 | 1.00 | 1 | 45.7 | 0 | 12.9 |
| mesh 128 verts, 2 influences | 1.45 | 0.98 | 4.60 | 1.00 | 1 | 157 | 0 | 26.6 |
| deform keys, 32 verts unweighted | 3.49 | 2.35 | 11.90 | 2.59 | 1 | 145 | 0 | 41.7 |
| deform keys, 32 verts 2 influences | 5.47 | 3.69 | 18.68 | 4.07 | 1 | 145 | 0 | 46.7 |
| clipping (convex or concave), 4 slots | 1.48 | 1.00 | 4.6 | 1.0 | **400** | 14.1 | 3 800–4 000 | 5.6–6.3 |
| clipping convex, every slot | 1.50 | 1.01 | 4.66 | 1.01 | 1 | 19.0 | 47 600 | 14.7 |
| clipping concave, every slot | 1.49 | 1.00 | 4.60 | 1.00 | 1 | 16.4 | 39 400 | 22.0 |
| clipping concave, every slot, mesh 32 verts | 1.47 | 0.99 | 4.58 | 1.00 | 1 | 167 | 489 200 | **238.7** |
| two-colour tint, every slot | 1.49 | 1.00 | 4.64 | 1.01 | 1 | 13.2 | 0 | 5.2 |
| two-colour tint, every 2nd slot | 1.50 | 1.01 | 4.56 | 0.99 | **19 601** | 13.2 | 0 | 5.6 |
| additive blend, every 2nd slot | 1.47 | 0.99 | 4.65 | 1.01 | **19 601** | 13.2 | 0 | 5.3 |
| 2nd atlas page, every 2nd slot | 1.46 | 0.98 | 4.59 | 1.00 | **19 601** | 13.2 | 0 | 5.5 |
| premultiplied alpha | 1.47 | 0.99 | 4.59 | 1.00 | 1 | 13.2 | 0 | 5.1 |
| IK 1-bone, one per chain | 2.33 | 1.57 | 7.08 | 1.54 | 1 | 13.5 | 0 | 5.2 |
| IK 2-bone, one per chain | 2.64 | 1.78 | 7.64 | 1.66 | 1 | 13.5 | 0 | 5.2 |
| transform, one per chain (all its bones) | 7.44 | 5.01 | 24.67 | **5.37** | 1 | 13.5 | 0 | 5.1 |
| path, one per chain (length/tangent) | 5.95 | 4.01 | 19.75 | **4.30** | 1 | 13.2 | 0 | 5.5 |
| path fixed/chain, percent/chainScale, proportional/tangent | 5.5–5.7 | 3.7–3.9 | 18.3–19.0 | 4.0–4.1 | 1 | 13.2 | 0 | 5.4–5.6 |
| physics on every bone, 30 Hz | 13.04 | 8.79 | 68.93 | **15.00** | 1 | 13.2 | 0 | 5.2 |
| physics on every bone, 60 Hz | 18.55 | 12.50 | 95.25 | **20.73** | 1 | 13.2 | 0 | 5.1 |
| physics on every bone, 120 Hz | 28.87 | 19.46 | 147.84 | **32.18** | 1 | 13.2 | 0 | 5.1 |
| physics, one per chain (its root), 60 Hz | 6.55 | 4.41 | 19.81 | 4.31 | 1 | 13.2 | 0 | 5.3 |
| 1 slider (keys one chain) | 1.76 | 1.19 | 5.19 | 1.13 | 1 | 13.2 | 0 | 5.2 |
| 4 sliders | 2.72 | 1.83 | 6.98 | 1.52 | 1 | 13.2 | 0 | 5.1 |
| sequence on every region | 2.22 | 1.50 | 7.84 | 1.71 | 1 | 13.2 | 0 | 5.1 |
| inherit keys on every bone | 2.93 | 1.97 | 9.19 | 2.00 | 1 | 13.2 | 0 | 5.2 |
| 4 tracks (each keying every bone) | 2.56 | 1.72 | 8.23 | 1.79 | 1 | 13.2 | 0 | 5.3 |
| 8 tracks | 4.04 | 2.72 | 13.15 | 2.86 | 1 | 13.2 | 0 | 5.2 |
| cross-fade on track 0 (mid-mix) | 2.05 | 1.38 | 6.62 | 1.44 | 1 | 13.2 | 0 | 5.1 |
| 4 tracks, 1–3 additive | 2.58 | 1.74 | 8.32 | 1.81 | 1 | 13.2 | 0 | 5.1 |
| 3 skins combined (outfits) | 1.54 | 1.04 | 4.65 | 1.01 | 1 | 13.2 | 0 | 5.2 |

Also measured: the editor's deterministic physics scrub (a seek replays physics from 0): 3.0 ms
per seek to 1 s on the 100-bone rig with physics on every bone. Editor only; the game steps
physics live.

Reading it: a 100-bone hero costs ~10 µs per frame (4.6 pose + 5 draw list) on this desktop core.
Phones' big cores are several times slower and low-end ones slower still, so measure there (below)
— but the **ratios** carry over, because they count the same work.

## Why each feature costs what it does

- **Bones and timelines** — every bone's world transform every frame (~0.033 µs), every keyed
  timeline applied by every track entry playing it (~0.012 µs). Linear in both.
- **Meshes and weights: free on the CPU.** Skinning runs in the vertex shader from a static
  buffer uploaded once; influences (1, 2 or 4) and vertex count do not change pose CPU. What grows
  with vertices is the per-frame **index list** (4 bytes per index, rebuilt and uploaded every
  frame: 128-vertex meshes upload 12× the baseline) and the GPU's vertex work (vertices ×
  influences, `vertexInfluences` in `anim2d metrics`). The engine keeps at most 4 influences.
- **Deform keys: the expensive way to bend.** Every keyed vertex is interpolated on the CPU
  (×2.6 unweighted, ×4.1 with 2 influences, since offsets are per influence) and uploaded every
  frame at 32 bytes per vertex (4 influence slots × 8 bytes, even unweighted): 145 KB per instance
  for 99 deformed 32-vertex meshes, 11× the baseline.
- **Clipping: CPU, and it splits batches.** Clipped attachments are skinned and clipped on the CPU
  (per triangle against the polygon: concave polygons are decomposed into convex parts and cost
  ~1.5–2× convex) and drawn by a separate CPU-vertex pipeline. Clipping *some* slots breaks the
  draw twice per instance (into the CPU path and back): 4 clipped slots → 2 draws per instance
  (400 for 200 instances) where the baseline draws all 200 in one. Clipping meshes is the worst
  case measured: 239 µs per instance and 489 200 CPU vertices per frame for 200 instances.
- **Blend modes, two-colour tint, atlas pages: draw calls.** A draw call holds a run of
  attachments with the same atlas page, blend mode (premultiplied or not), two-colour variant, CPU
  or GPU path, mask and skeleton asset — across instances. Alternating any of them in draw order
  costs one draw per change per instance (19 601 draws for 200 instances alternating every slot).
  Tinting *every* slot with two colours, or none, costs nothing; mixing them does. Premultiplied
  alpha costs nothing.
- **Different rigs interleaved** in painter's order break batches too (another atlas page and
  asset): in `samples/rig-yard`, 24 blobs and 8 kites at the same `order` drew in 17 calls; giving
  kites their own `order` made it 3 (`gameengine profile batches` shows the reason per break).
- **IK** — a solve plus re-posing the bones below: ~0.27 µs one-bone, ~0.33 µs two-bone.
- **Transform constraints** — every constrained bone re-solved and its children re-posed: ~0.2 µs
  per constrained bone (×5.4 for one on every chain).
- **Path constraints** — the path is measured (arc length) and every bone placed on it and
  re-posed: ~0.15 µs per bone (×4); spacing and rotate modes differ by under 10%.
- **Physics: the most expensive feature.** Each fixed step re-poses the **whole skeleton** at the
  step's instant and updates every constraint, then the frame poses once more with the result
  interpolated. At 60 Hz on a 60 fps display that is two full poses plus ~0.07 µs per constraint
  per bone it moves (itself and every bone below), per pose: ×21 on every bone of the 100-bone rig,
  ×32 at 120 Hz, ×15 at 30 Hz. One constraint per chain root instead of one per bone: ×4.3. A
  30 fps display steps 60 Hz physics twice a frame.
- **Sliders** — the slider's animation is applied in constraint order (~0.05 µs per timeline it
  keys).
- **Sequences, inherit keys** — a sequence timeline picks a frame (~0.03 µs); an inherit timeline
  re-derives the bone's transform mode (~0.05 µs, 4× a rotate timeline).
- **Tracks, cross-fades, additive** — each layered entry applies its own timelines (+1.2 µs per
  extra track keying all 99 bones); a cross-fade applies both entries; additive costs the same as
  replacing.
- **Skins** — combining outfit skins costs nothing measurable per frame.

## Tiers

| Tier | Features | Why |
|---|---|---|
| **cheap** | regions, meshes (any influences up to 4), premultiplied alpha, two-colour tint on all or no slots, skins and skin composition, a few sliders | GPU skinning from static buffers; no per-frame CPU beyond bones and timelines |
| **moderate** | IK (1.5–1.8× when on every chain), sequences (1.5–1.7×), inherit keys (2×), extra tracks (+0.3× per track of full size), cross-fades (1.4× while mixing), many sliders, meshes with many vertices (index uploads and GPU vertex work) | bounded per-element work; fine when used where needed |
| **expensive** | deform keys (2.6–4×, 11× uploads), transform constraints (5×), path constraints (4×), alternating blend / tint / atlas page in draw order (a draw call per change per instance) | CPU per vertex or per constrained bone every frame, or broken batching |
| **avoid on low-end** | physics constraints (15–32× on every bone; 4× one per chain), clipping (CPU vertices, 2 draws per instance when partial; 239 µs per instance clipping meshes) | whole-skeleton re-poses per step; CPU skinning and a second pipeline |

`anim2d metrics` and `anim2d problems --device phone-low|phone|tablet|desktop` name these per rig:
avoid-on-low-end features warn on `phone-low` and `phone`, expensive ones warn on `phone-low` and
note on `phone` (when they are at least a tenth of the rig's cost), and a rig that costs more than
a rig at the class's `RIG_BUDGETS` warns (`rig-budget`).

## Rules of thumb for mobile (from the numbers)

1. **Bend with bones and weights, not deform keys.** Weighted meshes cost the CPU nothing extra;
   deform keys cost per keyed vertex every frame and 32 bytes per vertex of upload. Use deform keys
   only for a few frames of squash on few vertices (a face), never for a body's motion.
2. **Keep influences at ≤ 4** (the engine's cap; `prune-weights`); 2 is usually enough. On the CPU
   they are free, on the GPU each is a bone read per vertex.
3. **Vertex budgets per device class** (`RIG_BUDGETS`, worst case with every slot showing its
   largest attachment): phone-low 1 500, phone 3 000, tablet 6 000, desktop 20 000; bones 64 / 100
   / 160 / 256; slots 48 / 80 / 128 / 256. Meshes with many vertices cost index uploads (4 bytes per
   index per frame) and GPU vertex work: trace meshes with low `--detail` and add interior vertices
   only where the image bends.
4. **Physics:** a constraint per chain root at 30 Hz, not one per bone at 60–120 Hz; on low-end,
   bake secondary motion into keys and keep physics for the hero only. To switch it off for far,
   small or crowd instances, make the physics constraints **skin constraints** (`anim2d
   skin-constraints $F --skin physics --add hair1,hair2`) and combine that skin only on the
   instances that need it (`setSkeleton2DSkins(ctx, e, ['physics'])`; the default skin always applies): a skeleton with
   no active physics constraint is posed once per frame (from the code: inactive constraints are
   not stepped). `setSkeleton2DConstraintMix(ctx, e, name, { mix: 0 })` skips only the
   constraint's own update; the skeleton is still re-posed at every physics step.
5. **Clipping:** prefer a `SpriteMask` on the entity (`maskInteraction`, stencil on the GPU) or
   pre-cut images. If you clip, clip a few region triangles with a convex polygon, keep the clipped
   slots contiguous, and never clip meshes on low-end.
6. **Draw order:** keep slots of the same blend mode together; tint every slot with two colours or
   none; keep a rig's images in **one atlas group** (one page); give each rig type its own
   `order`/sorting layer so instances of one rig are contiguous. Aim for one draw call per rig type.
7. **Transform and path constraints:** use parenting or keys where they would do; for crowds bake
   path motion into keys.
8. **Tracks:** layer only the bones a layer changes (an upper-body track keys the upper body); keep
   cross-fades short; 1–2 tracks for crowds.
9. **Many instances:** cost is linear in instances; off-screen instances are culled (not posed or
   drawn); pause or hide what the player cannot see; one rig asset for a crowd batches into one draw.

## Two steps: estimate while authoring, prove on a device

**1. Estimate** (no device, no build):

```sh
gameengine anim2d metrics assets/rig/hero.skeleton2d.json --device phone-low   # counts, µs estimate, relative to the budget rig, top features + alternatives
gameengine anim2d metrics assets/rig/hero.skeleton2d.json --device phone --anim run --tracks 2 --json
gameengine anim2d problems assets/rig/hero.skeleton2d.json --device phone-low  # the same findings as warnings / notes
```

MCP: `anim2d_metrics`, `anim2d_problems` (`device`). The editor's Metrics view shows the same
estimate under **Cost per instance** for its device class; the Problems view lists the findings
for `phone`. The estimate is desktop µs, compared with a rig at the class's budget (`relative` 1
= costs what the budget rig costs); it is not a phone's frame time.

**2. Prove it** in the running game:

```sh
gameengine run samples/<game> --run-sec 10 --json             # frame intervals (p50/p95), target fps; --tier compat|mobile, --perf
gameengine run samples/<game> --headless                      # a session (not --paused: per-frame system times need real frames)
gameengine cheat run <your.cheat> …                           # put the scene into the state to measure, if it has one
gameengine call perf.start   # wait a few seconds, then:
gameengine call perf.stats --json   # frameTimeMs, presentationTimeMs (posing and drawing), systemTimeMs["gameengine.Skeleton2D"] (sim track stepping), drawCallsMax
gameengine call profile.markers     # this frame's systems and CPU
gameengine profile batches          # draw calls and why each batch broke (texture = atlas page, blend, kind, mask)
gameengine session stop --all
```

Skeleton posing and draw lists are **presentation**: they show in `frameTimeMs` /
`presentationTimeMs`, not under a system. The sim's `gameengine.Skeleton2D` steps the tracks and
fires events (cheap: ~0.1 ms p95 for 35 rigs on the reference desktop). On a **paused** session,
`gameengine step 300` runs 300 steps in one frame, so `systemTimeMs` per frame adds them up: measure
system times on a running session.

**3. Hold it with a budget** (design.md § 11.5): `tests/budgets/<name>.json` with a replay that
plays the scene, checked in T1 by `gameengine test <project> --tier t1` (structural:
`drawCallsMax`, `pipelinesCreatedDuringPlay`, `gcPausesOver4msMax`) and on devices by
`gameengine lab run <job>` / `gameengine lab phones <job>` (`frameTimeP95Ms`, `gpuTimeP95Ms`,
`systemsP95Ms`, `memoryMB`, …). The replay must start from the project's start scene (the budget
replays it from there): put the scene into its heavy state with a sim cheat the test runs. The
worked example is `samples/rig-yard`:

- `src/crowd.cheats.ts` — sim cheat `rigs.crowd` spawning 32 rigs (blobs; kites with physics and a
  path), each rig type at its own `order`;
- `tests/crowd.test.ts` — runs the cheat and steps 240; recorded with
  `gameengine test samples/rig-yard --record-replays --filter "a crowd of 32 rigs animates"`;
- `tests/budgets/rigs.json` — `structural.drawCallsMax: 4` (ground, one draw per rig type, the
  present), device `frameTimeP95Ms` and `systemsP95Ms: { "gameengine.Skeleton2D": 1 }`;
- `tests/lab/t2.json` — a `perf` scenario on that replay and budget: `gameengine lab run
  samples/rig-yard/tests/lab/t2.json` (desktop virtual devices locally; phones through
  `lab phones` / `lab submit --devices …`).

## What only a device can tell

- **GPU time and fill:** vertex skinning (vertices × influences), overdraw (large transparent
  attachments stacked: `anim2d metrics`/the Metrics view report the drawn **area**, overlaps counted
  twice), additive and screen blends over big areas. Measure `gpuTimeP95Ms` in `perf.stats` or a
  lab run on the device class; compare a variant with smaller or fewer overlapping images.
- **Thermal throttling and the real frame budget:** `gameengine run --json` reports thermal history
  and frame intervals on desktop; on phones run the lab (`gameengine lab phones`) or
  `gameengine device run` + `device logs`, with a probe build (`gameengine build android|ios
  --config probe`).
- **Phone CPU speed:** multiply nothing by a guess; run the budget on the device class and read
  `frameTimeP95Ms` and `presentationTimeMs`.
