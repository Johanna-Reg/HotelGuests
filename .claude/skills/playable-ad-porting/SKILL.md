---
name: playable-ad-porting
version: 1.14.0
tier: required
description: Porting a playable-ad slice onto @gameengine/playable so the web ad runs the game's own systems — the web entry, supported features, input, sprites, HUD and sound, `gameengine playable verify`. Use when an ad's web build should run the game's code, or when verify reports a divergence.
---

# Porting a slice to a playable ad (`@gameengine/playable`)

**Covers:** Porting a playable-ad slice out of the engine onto @gameengine/playable, so the ad runs the slice's own systems (rules, tweens, gestures, timings, 3D physics) in a web view instead of a hand rewrite. Covers the web entry (web/mirror.ts), what the playable profile supports (including Jolt 3D physics and WebGL meshes), input/sprites/HUD/sound/end-card wiring, what the mirror draws for you (sprites, Skeleton2D, Clip2D flipbooks, particle effects) and rebuilding the slice's materials and views in web/ so the ad looks like the game, proving the port with gameengine playable verify and a side-by-side screenshot check, and building it in the networks' format. Use when an ad's web build should run the game's code, or when verify reports a divergence.

Playable ads use a smaller runtime than full WebGPU engine browser exports (`ship-web`).
`@gameengine/playable` is a TypeScript copy of the engine's
ECS core (world, scheduler, commands, events, RNG, tweens, gestures, transforms) that runs a
slice's **own systems, unchanged** inside the ad. You write only presentation; the rules come from
the game. `gameengine playable verify` proves the port by playing the same input on the engine
and the mirror and comparing state hashes step by step.

Read the `playable-ads` skill first: the slice, `playable.json`, assets, networks and their rules
are the same. This skill replaces step 4 of it (the hand rewrite) when the slice fits the profile.

## The goal: the ad looks and plays like the engine slice

**The port must be as close to the engine slice as you can make it — look, framing, effects, HUD,
end screen — not only its rules.** `verify` proves the rules and `validate` proves the networks'
rules; nothing automated proves the look, so you must (workflow step 5). A port that passes every
check with flat-colour stand-ins for the game's shader, a text counter for its HUD and the generic
end card is a prototype, not a port. The first Save Simon port did exactly that; the second pass,
rebuilt from the game's own shader, effect files and views, cost 114 kB and no sim change.

- **Rebuild, don't drop.** Presentation the profile refuses (materials, UI views,
  rotation, tint) moves to `web/` and is rebuilt there from the game's own sources (table below).
  Cutting it from the slice never means cutting it from the ad.
- **No silent downgrades.** Never replace engine presentation with a stand-in (flat colour,
  generic end card, plain text, a missing effect) without telling the user first and getting
  their agreement. A "known gaps" line at the end of the summary is not that.

## Port or rewrite?

Ask the user the size target first if the `playable-ads` skill's question has not been answered
(below 2 MB for every network, below 4 MB without Meta, below 5 MB without Meta and ironSource):
a port costs about 230 kB, skeletons add the ~600 kB evaluator, and the networks in
`playable.json` must match the answer.

Decide by what the **sim** needs. Port when the slice's systems use only what the playable
profile has (below). Rewrite by hand (the `playable-ads` skill) when the loop's rules need 2D
physics, joints, character controllers, navigation, video or services, or when the ad must be far
smaller than about 230 kB (skeletons add the ~600 kB evaluator, 3D physics ~530 kB inlined).
**3D physics ports** when its bodies fit the lite profile (§ 3D physics). Presentation (materials,
meshes, UI views, sprite rotation or tint) never forces a rewrite: it moves to `web/`.

**Physics:** 3D bodies that fit the lite profile port (§ 3D physics). 2D physics (rigid bodies,
colliders and joints in 2D), 3D joints and character controllers are outside the profile, and the
port refuses a slice that spawns or loads them. Box2D already runs bit-identically in wasm (about
150 kB, ADR 0023 amendment) and a 2D module on the 3D one's model is in progress; until it lands,
either cut the 2D physics from the slice when the loop only needs physical-looking motion (tweens
or kinematics in a slice system port fine), or rewrite the ad. Never fake physics in `web/` while the slice keeps
it: `verify` would pass on a slice the ad no longer matches.

**New effects, flipbooks and 2D animation** made for the ad live in the slice
(`playable-ads/<ad>/assets/`), never in the game's `assets/` (skill `playable-ads`, step 2); the
port plays them like the game's own.

## The format

```
playable-ads/<ad>/
  project.gameengine.json   the slice ("playable": { "game": "../.." }), runs in the engine
  playable.json             "web": "web/mirror.ts", networks, assets (keys → aliases)
  src/main.ts               the slice's systems: re-exports from the game + ad-only systems
  scenes/<ad>.scene.json    the slice's start scene (cooked into the ad by the build)
  web/index.html            the template with <!--playable:script-->
  web/mirror.ts             presentation only: input in; sprites, HUD, sound, end card out
```

- Every rule lives in `src/` (the slice), never in `web/`. If the ad needs a different rule (fewer
  moves, a timeout, a scripted first move), it is a slice system, verified in the engine like
  any system.
- `web/` may import the slice (`../src/main.ts`), `@gameengine/runtime`, `@gameengine/playable`,
  `playable:manifest`, `playable:slice` and `playable-ads/_shared/`. Game code never imports
  `@gameengine/playable` (lint fails, it does not resolve, and the bundler refuses it).
- Every asset a sprite or `PlaySound` names (`tiles/gem_red`, `audio/swap`) needs a key in
  `playable.json` `assets`: the build inlines only those and maps alias → key (`aliases`).

## The playable profile

| Supported | Refused, naming what is outside the profile |
|---|---|
| Components, resources, tags, events; queries with read/write/with/without/changed/added; `runIf`, `runOn`, `after`/`before`; the same declaration checks the engine makes at boot | Host ops other than schema, strings, assets, input, log, `data.read` (`loadData` of the records `playable.json` `data` lists), the skeleton track ops and (with the physics module) `physics3d.query`/`teleport`: 2D physics, nav, `pool`, `prefab.spawn`, `transform.snap` (`teleport`), saves, services, `net`, video, `anim.defineCurve`; skeleton queries and overrides (`skeleton2DBone(s)`, `skeleton2DSlots`, `skeleton2DBounds`/`Hit`/`Boxes`, `setSkeleton2DBone`, IK/mix/attachment/colour/skins overrides, `setSkeleton2DPhysics`/`resetSkeleton2DPhysics`); camera rigs (`CameraFollow`, `CameraShake`, `VirtualCamera`), and the engine's `WorldViewFollow` system does not run in an ad (a slice moves `WorldView.center` itself, skill `camera`) |
| Documents (ADR 0100 amendment: documents and the wall clock): `defineDoc`, metas (`metaInWorld`) and tunables (with their record in `playable.json` `data`), hashed as the engine hashes them. A **persisted** meta (`persist`) runs in memory in a slice, in the engine's run of it too: `loaded()` is true at once, it starts from its initial state and is never saved, so a board whose rules keep their state in a persisted meta ports unchanged | Saves (`defineSave`, `storage`), `MetaLoaded` (an ad never reads a save) |
| `wallClock.feed` and `WallClock`: ticks from the page's clock as recorded `WallClockTick` input (`verify` runs a clock that moves with the steps); `ctx.signal` and meta signals, delivered to `onSignal` listeners in `web/` once per `p.render` (sounds, HUD and analytics from the game's own signals) | Other UI `emit` events; transient recorded JSON (`emitInputData` / `ctx.inputData`) |
| 3D physics (ADR 0100 amendment 2): `RigidBody3D` and `Collider3D` (Box, Sphere, Capsule, ConvexHull), `Physics3DSolver` and `RigidBody3DSolver` tuning, contact and sensor events (`CollisionDetails3D` too), `Impulse3D`, `query3d`/`raycast3d`/`overlapSphere3d`/`overlapCapsule3d`, `teleportKinematic3d`: the engine's own bridge and Jolt through `physics3dWasm` (§ 3D physics) | `Cylinder` and `Mesh` colliders, compound bodies (a `Collider3D` under a `RigidBody3D`), `Joint3D`, `CharacterController3D` |
| `Skeleton2D` (ADR 0100 amendment): its tracks, queues and `Skeleton2DEvent`s run the engine's own code through `@gameengine/skel2d-wasm`; `playSkeleton2D`, `queueSkeleton2D`, `clearSkeleton2DQueue`, `skeleton2DTrack`, `setSkeleton2DSkin`, `setSkeleton2DTrack`, `skeleton2DInfo`; `drawSkeletons` draws them (alpha and blend modes; physics constraints swing with presentation time, as in the engine) | `Skeleton2DFollower`, an Animator driving a skeleton |
| `ctx.commands` (spawn, despawn, insert, remove, set), `ctx.rng`, `math.*`, `ctx.step`/`dt`, `onWarm` hooks | Keyboard, gamepad, text and action input; an `input.json` with actions (build and verify refuse the slice); UI `emit` events other than the wall clock feed's |
| Sim `tween()` (every ease but `curve:`) and `VisualTween`s; `TweenCompleted` | Components whose engine systems it does not have, when spawned, inserted or in the scene: `Animator`, `IkTarget`, `BoneAttach`, `SharedSkeleton`, `JointOffset`, `BlendShapes`, `MaterialOverrides`, 2D rigid bodies, colliders and joints, `Joint3D`, `CharacterController3D`, `VideoPlayer`, `StreamCell`/`StreamFocus`, `Tilemap` |
| Pointer input and its gestures with several fingers: `Tap`, `Swipe`, `Drag`, `LongPress`, `Pinch`, `Rotate` (velocity included, default thresholds); `ViewInfo`, `WorldView` | UI views (`*.view.tsx`), `@gameengine/ui`, `@gameengine/vfx`, materials, `input.json` `gestures` (the build refuses them) |
| `Clip2D` flipbooks (`*.clip2d.json`): the engine's clip stepping, `Clip2DEvent`, `Clip2DFinished`, `playClip2D`/`setClip2D`/`clip2DInfo`/`clip2DFrame`; `SpriteAnimation` and `SpriteFrameEvent`. `drawSprites` draws the clip's frame (offset, scale, alpha, flip) when given `clips: p.clipFrames` | |
| `TimelinePlayer` (`*.timeline.json`, skill `keyframe-animation`): tween, activation, audio, event and camera tracks with the engine's own key interpolation, `playTimeline`/`stopTimeline`, `TimelineEvent`, `TimelineFinished`; pass `timelines: new Timelines(…slice.timelines)` to `createPlayable` | `animation` tracks (they drive an Animator) |
| `ParticleSystem` (`*.vfx.json`, compiled `*.vfx.ts`): the engine's `ParticleClock` and `vfx.burstAt`, simulated by `@gameengine/vfx`'s twin of the engine's CPU simulator; `drawSprites` draws them among the sprites by `sortingLayer`/`order` when given `particles: p.particles` (soft dots, textures and sheets, additive or alpha) | Not drawn: depth collision, `maskInteraction`, per-device `overrides` (the ad plays the base effect), 3D orientations (`horizontal`, `vertical`) |
| `LocalTransform`/`WorldTransform` with `Parent`; `drawSprites`: position, size and scale, 9-slices, alpha, `flipX`; `MeshRenderer` (presentation only), drawn by `createRenderer3D` (§ 3D meshes) | Not drawn (the sim is unaffected): sprite rotation, `flipY` and negative scale, tint, fills, masks, blend modes, `Text2D`, `Shape`, `Light2D`; in 3D: point and spot lights, shadows, `Fog`, skyboxes and environment maps, `ReflectionProbe`, `Outline`, post, skinned meshes |

Cut the slice until `gameengine playable verify` runs: a **sim** system the ad does not need is
better removed from `src/main.ts` than stubbed in `web/`. Presentation you cut from the slice is
rebuilt in `web/` to match the game:

| Refused in the slice | Rebuild in `web/` from |
|---|---|
| A custom material (`*.material.ts`) | its WGSL ported line for line to the GLSL `surface()` hook of `createRenderer3D` (§ 3D meshes), with the same globals and per-instance params |
| UI views (`*.view.tsx`) | DOM laid out in the stylesheet's reference px; the same art (9-slices from the `.gmeta` borders, its `body` as overhang past the box and its `content` as the default padding), font (subset) and `fx-*` keyframes; the CTA button calls the end-card/`openStore` path |
| Sprite rotation, `flipY`, tint | your own sprite pass (or pre-tinted art) |
| Camera framing (`fit: Height` …) | a stage that fits the same axis as the game's camera, not the template's letterboxed 1080×1920 "contain" |
| Tunables without their record in `playable.json` `data` | constants with the same values |
| A `VideoPlayer` (a character over the board, an end-card clip) | `createAlphaVideo(videos.key)` from `@gameengine/playable`, drawn with `draw(ctx, x, y, w, h)` each frame: list the `.mp4` (H.264, every network's web view) or `.webm` in `playable.json` `assets`; it is inlined as `videos` in `playable:manifest`. Stacked alpha (colour above, alpha below, as the engine's cook makes it) by default, `layout: 'opaque'` otherwise; WebGL composites it, a CPU fallback reads it back. Keep it short and small: it counts against the network's size cap |
| A full-screen story told in clips (choices that cut or seek between videos) | Not a port: a story-video ad, web only (skill `playable-ads` § Story video). Its choices never enter a slice |

`web/` can read component rows, not only resources and events: `p.world.tables` and
`p.world.getRow(entity, p.world.id('Component'))` are public (read-only; decode with the
component's layout). Per-cell or per-entity state a shader or effect needs comes from there.

Transient recorded JSON (`emitInputData` / `ctx.inputData`) is outside this profile and is
rejected explicitly. Full engine browser builds support it. Keep live service snapshots out
of a playable slice; ordinary supported gameplay inputs remain unchanged.

## Workflow

1. **Slice first** (`playable-ads` steps 1–3): `gameengine playable run <ad> --headless --steps 600 --json`
   in the engine. The loop must read in 30 seconds there before you port anything.
2. **Point the build at the port:** in `playable.json` set `"web": "web/mirror.ts"` (or pass
   `--web web/mirror.ts` to `build`), and list every asset the slice's sprites and sounds name.
3. **Write `web/mirror.ts`** from the template below: input → `p.step`, a fixed-step loop,
   `drawSprites`, the HUD from resources, sounds and the end card from this step's events.
4. **Prove it:** `gameengine playable verify <ad> [--seeds 1,2,3] [--steps 2400]`. Each seed is
   seeded taps, swipes, drags and long presses over the view, played on the mirror, written to
   `dist/verify/seed-N.greplay` and verified on the engine. All seeds must pass.
5. **Compare it with the slice.** Screenshot the engine slice (`gameengine playable run <ad>` +
   `gameengine screenshot`) and the web preview at the same moments — intro, mid-play, end
   screen — and compare them side by side. Fix every difference you can; list the rest to the
   user plainly ("the water is flat blue instead of the shader") and ask before shipping them.
6. **Build and validate:** `gameengine playable build <ad> --json`, then
   `gameengine playable validate <ad> --json` (sizes, single file, no requests, MRAID, CTA).
7. **Look at it** in the editor's Playable Ads mode (`dist/preview`) and tell the user what to try.

## `web/mirror.ts` template

The template is the minimum wiring, not the target: it draws sprites, a text HUD and the generic
end card. Replace those with the game's own look (§ The goal).

```ts
import { boot } from '@gameengine/runtime';
import { createPlayable, drawSprites, listenPointers, resource, stepEvents, viewEvent, type InputEvent } from '@gameengine/playable';
import { ad, aliases, images, sounds } from 'playable:manifest';
import * as slice from 'playable:slice';
import * as game from '../src/main.ts';
import { createStage, loadImages, showEndCard, Sounds, storeUrlFor, whenReady } from '../../_shared/runtime/index.ts';

function start(img: Record<string, HTMLImageElement>) {
  // 1080×1920 design units (1920, 1080 for landscape). It renders at most 2x density and 60 fps; on a
  // slow phone pass { renderScale: 0.75 } or { maxFps: 30 } as the 4th argument rather than drawing less.
  const stage = createStage();
  const audio = new Sounds(sounds);
  const p = createPlayable({ boot, game, scene: Uint8Array.from(atob(slice.scene), (c) => c.charCodeAt(0)), seed: slice.seed, dt: slice.dt });
  const byAlias = Object.fromEntries(Object.entries(aliases).flatMap(([alias, key]) => (img[key] ? [[alias, img[key]!]] : [])));
  // Each finger gets its own pointer id; the view and pointers are in points, as gestures measure millimetres.
  let pending: InputEvent[] = [viewEvent(stage)];
  window.addEventListener('resize', () => pending.push(viewEvent(stage)));
  listenPointers(stage, (e) => pending.push(e), () => audio.unlock());
  let ended = false;
  let acc = 0;
  stage.loop((dt) => {
    acc += dt;
    for (let n = 0; acc >= slice.dt && n < 5; n++, acc -= slice.dt) {
      p.step(pending);
      pending = [];
      for (const s of stepEvents(p.world, 'PlaySound')) {
        const key = aliases[s.sound as string];
        if (key) audio.play(key, { volume: s.volume as number, rate: s.pitch as number });
      }
      for (const e of stepEvents(p.world, 'LevelEnded')) // the slice's end event
        if (!ended) (ended = true), showEndCard({ title: ad.title, button: ad.cta, storeUrl: storeUrlFor(ad.storeUrl) });
    }
    p.render(Math.min(acc / slice.dt, 1));
    drawSprites(stage.ctx, p.world, { width: stage.width, height: stage.height, images: byAlias, sortingLayers: slice.sortingLayers, pixelsPerUnit: slice.pixelsPerUnit });
    // HUD: read sim resources, e.g. resource(p.world, 'Score')!.value, and draw text on stage.ctx.
  });
  return (muted: boolean) => audio.setMuted(muted);
}

let mute: (muted: boolean) => void = () => {};
whenReady(() => void loadImages(images).then((img) => (mute = start(img))), (visible) => mute(!visible));
```

**Skeletons.** When the start scene has `Skeleton2D`s, `playable:slice` also carries `skeletons`
(the rigs it names, base64) and `skel2dWasm` (the evaluator). Compile it asynchronously (browsers
refuse large synchronous compiles), pass both to `createPlayable`, and draw after the sprites;
list each rig image in `playable.json` `assets` (`"blob_body": "rig/blob/body"`):

```ts
import { Skel2dWasm } from '@gameengine/skel2d-wasm';
const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const skel2d = await Skel2dWasm.fromBytes(bytes(slice.skel2dWasm)); // start() becomes async
const skeletons = Object.fromEntries(Object.entries(slice.skeletons).map(([k, v]) => [k, bytes(v)]));
const p = createPlayable({ boot, game, scene: bytes(slice.scene), seed: slice.seed, dt: slice.dt, skel2d, skeletons });
// in the loop, after drawSprites:
drawSkeletons(stage.ctx, p.world, p.skeletons, { ...view, images: byAlias, alpha, dt: slice.dt });
```

`samples/rig-yard/playable-ads/blob-walk` is the worked example.

**Flipbooks.** The build embeds every `*.clip2d.json` the start scene or the slice's `src/` names
(a missing one fails the build) as `slice.clips`. Pass them to `createPlayable` and the frames to
`drawSprites`; list every frame image in `playable.json` `assets` (`"coin_0": "flip/coin_0"`):

```ts
const p = createPlayable({ boot, game, scene: bytes(slice.scene), seed: slice.seed, dt: slice.dt, clips: slice.clips });
drawSprites(stage.ctx, p.world, { ...view, images: byAlias, clips: p.clipFrames });
```

`samples/rig-yard/playable-ads/slime-flip` is the worked example.

**Particles.** The build embeds every effect the start scene or the slice's `src/` names
(`*.vfx.json`, or a `*.vfx.ts` as its compiled `*.vfx.gen.json`) as `slice.effects`. Pass them to
`createPlayable` and the particles to `drawSprites`; list every effect texture in `playable.json`
`assets` (`"shards": "fx/shards"`):

```ts
const effects = Object.fromEntries(Object.entries(slice.effects).map(([k, v]) => [k, bytes(v)]));
const p = createPlayable({ boot, game, scene: bytes(slice.scene), seed: slice.seed, dt: slice.dt, effects });
drawSprites(stage.ctx, p.world, { ...view, images: byAlias, particles: p.particles });
```

`samples/fireworks/playable-ads/night-sky` (the game's own launch, tap and cleanup systems) and the
shards `slime-flip` throws with `burstAt` are the worked examples.

## 3D physics

A slice whose sources or start scene name `RigidBody3D` or `Collider3D` gets `physics3dWasm` in
`playable:slice`: the engine's own physics bridge and a lite build of the same Jolt (ADR 0100
amendment 2), about 940 KiB, deflated and inlined as base64 (~530 kB of the ad). The mirror keeps a shadow of
the physics entities in it every step, so bodies, contacts, sensors and query results hash as in
the engine and `verify` proves them like any other state. Compile it asynchronously and pass it on:

```ts
import { Physics3dWasm } from '@gameengine/playable';
const physics3d = await Physics3dWasm.fromBytes(bytes(slice.physics3dWasm)); // start() becomes async
const p = createPlayable({ boot, game, scene: bytes(slice.scene), seed: slice.seed, dt: slice.dt, physics3d });
```

- **What fits:** static, kinematic and dynamic bodies with one `Box`, `Sphere`, `Capsule` or
  `ConvexHull` collider each (`builtin:` hulls, or a model listed in `playable.json`
  `colliderMeshes`: the build cooks its geometry and `playable:slice` carries it as `meshes`, which
  `createPlayable` takes), damping, restitution, sensors, collision categories, `Impulse3D`, waking a
  kinematic body by switching it to dynamic, and every `physics3d` query and teleport.
- **What stops the run** with the reason: a `Cylinder` or `Mesh` collider, a collider under a body
  (a compound), `Joint3D`, `CharacterController3D`. Replace them in the slice: a box or hull for
  the cylinder or mesh, one collider per body, a kinematic body driven by a slice system for the
  character. Those slice changes are verified like any other.
- **Many props (hundreds to thousands):** cost follows the bodies that move, not the bodies
  there are. Each step the mirror sends the shadow only entities that are new or have a row
  written since the last step, and Jolt skips sleeping bodies; 1,500 resting props cost about
  0.3 ms a step on a desktop, against 2.8 ms when every body was sent. Keep it that way:
  - Props that wait for the player start out of the simulation: `RigidBody3D` `{ type: 'Dynamic',
    awake: false }` (Jolt adds them asleep; touching an awake body wakes them and their stack), or
    `Kinematic` until a slice system switches them to `Dynamic` near the player (crate-drop's
    `WakeProps`). Never spawn a pile awake and let it settle: every body is simulated until it sleeps.
  - Find what to wake with one bounded `overlapSphere3d` around the player each step, never by
    looping over every prop.
  - Change a prop's rows only when it needs to. Writing the same bytes costs nothing, but a system
    that nudges every prop each step (a bob, a scale pulse, zeroing a velocity) sends them all again;
    animate the look in presentation instead.
  - A collected or swallowed prop leaves physics (despawn it, or pool it without its `RigidBody3D`)
    and falls by `tween()`, not by simulation.
- **Size:** about 530 kB inlined, so with Meta's 2 MB cap the rest of the ad has about 1.2 MB.
  Keep meshes low-poly and textures small.
- **Data records:** a slice whose systems call `loadData` lists the records in `playable.json`
  `"data": ["data/levels/level_01.json", …]`; the build inlines them as `playable:slice` `data`
  and `createPlayable({ data })` answers `data.read` from them. `listData` works unchanged; avoid
  helpers that load every record (sorting all levels) and name the record directly.
- **Steering and goals in `verify`:** fuzzed taps rarely reach a level's goals. Write a scripted
  route (`[{ "step": n, "events": [{ "type": "pointer", … }] }]`, generated by a small script in the
  ad) and run `gameengine playable verify <ad> --input verify/route.json`; check that it collects
  what the loop is about before trusting the match.
- `samples/crate-yard/playable-ads/crate-drop` is the worked example (the game's laser and goal
  systems unchanged; a kinematic sweeper wakes props through an overlap query). A full game's
  level runs the same way: a ported hole game's level-1 ad keeps the game's hole, ground, collection and
  prop-wake systems and replaces only its meta flow with two ad-only systems.

## 3D meshes

`MeshRenderer` is presentation: the slice keeps it, the hash ignores it, and `web/` draws it with
`createRenderer3D` (WebGL; no three.js, ~10 kB gzipped):

```ts
import { createRenderer3D } from '@gameengine/playable';
import { fileBytes } from '@gameengine/playable';
import { aliases, files } from 'playable:manifest'; // .glb and .mat.json assets listed in playable.json, packed: fileBytes(files[id])
const r = createRenderer3D({ meshes, materials, images, shaders }); // decode `files` into these
await r.ready;
// each frame, after p.render(alpha): draw at the stage's pixel size, then composite under the HUD
r.draw(p.world, { width: stage.canvas.width, height: stage.canvas.height, time });
stage.ctx.drawImage(r.canvas, 0, 0);
```

- **Drawn:** the lowest-order visible `Camera` (perspective or orthographic, `layerMask`), each
  `MeshRenderer` at its `WorldTransform` (built-in cube, sphere, plane, cylinder, torus, or a GLB
  `"file.glb"`/`"file.glb#Mesh"`), the first directional `Light`, `Environment` ambient, and
  `*.mat.json` materials (PBR approximated, unlit, toon, matcap; opaque, mask and blend).
- **Custom materials:** a `*.material.ts` needs its WGSL ported to a GLSL `vec4 surface()` passed as
  `shaders['x.material.ts']`. It reads `v_world`, `v_normal`, `v_uv`, `u_color`, `u_instance`
  (`MaterialParams.params`; both per-instance varyings, so never declare them as uniforms), `u_globals[8]` (`MaterialGlobals.v0..v7`), `u_time`, the light and
  camera, and each material parameter as `p_<name>`. A LateUpdate system writing
  `MaterialGlobals` (a moving hole) reaches the shader as in the engine.
- **Meshes:** GLB with embedded images, triangle lists only; Draco is refused. `playable.json`
  `export.meshes` decides what the build does to them: `"strip"` (default, lossless: drops tangents,
  colours and other data the renderer never reads), `"quantize"` (8-bit normals, 16-bit UVs, about
  25 % smaller inline), `"meshopt"` (also `EXT_meshopt_compression`, about 55 % smaller) or
  `"source"`. Skinned, animated or morphing models are copied as they are (the build notes say so).
  Code in `web/` that reads GLBs itself (shadows, culling) must use `readGlb` or `parseGlb` from
  `@gameengine/playable` before you pick `"meshopt"`. Heavy models still go to the ad's own
  `assets/` (read before the game's) decimated with smaller textures. The build deflates `files`.
- **Draw calls:** the renderer instances: every `MeshRenderer` of one mesh part and material draws
  in one call, so many copies of a few props are cheap; many distinct materials or `.glb#Mesh`
  parts are not.
- **Params:** only the params a `.mat.json` lists become uniforms; fill the rest from the
  `*.material.ts` defaults in `web/` before passing materials to the renderer.
- `samples/orbit-garden/playable-ads/garden-orbit` is the worked example (a hole-cut ground shader
  moved through `MaterialGlobals`).

## Rules for the presentation code

- **Input reaches the sim only as `InputEvent`s** passed to `p.step`: use `listenPointers` (one
  id per finger, positions in view points) and `viewEvent` (first, and on resize), both given the `stage`. `p.step`
  rounds them as the engine does, so `ctx.input` reads the same numbers. Never write components
  or resources from `web/`; a tap the sim should see is a pointer event.
- **Fixed steps:** step at `slice.dt` from an accumulator (at most 5 steps a frame), never once per
  animation frame. `p.render(alpha)` once per frame runs LateUpdate systems and visual tweens.
- **Read, don't write:** `resource(world, 'Name')` and `stepEvents(world, 'Event')` (this step's
  events, each once) feed the HUD, sounds and end card.
- **The networks' rules still hold** (`playable-ads`): audio after the first touch, the CTA through
  `showEndCard`/`openStore`, `whenReady` to start, no requests. Timers that should start at the
  first touch are slice systems that wait for the first `Tap`/`Swipe`, not `web/` timers.
- Never call `p.hash()` in an ad: it is for `verify` and costs far more than a step.

## When `verify` fails

`✗ seed N: diverges at step S: <Component> (engine …, mirror …)` names the first step and the
types whose state differs. In order of likelihood:

1. **The slice reads something outside the profile** (the run fails first with `host op '…' is
   not in the playable profile` or `input '…' is not in the playable profile`): cut that system
   from the slice or rewrite the ad by hand.
2. **Engine-native behaviour the mirror lacks** (a native system writing that component): check
   the profile table; report it to the engine team with the replay from `dist/verify/`.
3. **A mirror bug**: the replay in `dist/verify/seed-N.greplay` reproduces it; hand it to the
   engine team with the step and components. Do not work around it in `web/`: a port that only
   matches with workarounds is a rewrite.

Nondeterminism in the slice (`Math.random`, wall clock) fails in the engine's own tests first;
the `determinism` skill covers it.

## Commands

| Step | Command |
|---|---|
| Run the slice in the engine | `gameengine playable run <ad> [--headless --steps N --json]` |
| Prove the port | `gameengine playable verify <ad> [--seeds 1,2,3] [--steps 2400] [--js v8\|hermes] [--json]` |
| Build every network | `gameengine playable build <ad> [--web web/mirror.ts] [--network meta,unity]` |
| Check the networks' rules | `gameengine playable validate <ad> [--network tiktok]` |
