---
name: skeleton-2d
version: 1.12.1
tier: optional
description: 2D skeletal animation at run time — *.skeleton2d.json rigs, the Skeleton2D component, tracks and queues, skins, events, bone queries, hit tests, procedural overrides, rigs in UI views, `gameengine skel2d`. Use for characters or props animated with bones, including converted Spine exports.
---

# 2D skeletal animation

**Covers:** 2D skeletal animation in Game Engine — *.skeleton2d.json rigs, the Skeleton2D component, playSkeleton2D/queueSkeleton2D/setSkeleton2DSkin (8 tracks, queues, additive layers, empty animations, mix tables — Spine 4.3's AnimationState), Skeleton2DEvent (keys and start/interrupt/end/complete/dispose), bone queries, bounds and bounding-box hit tests, Skeleton2DFollower, procedural overrides (aim a bone, move an IK target, swap attachments and slot colours, combine outfit skins), path/physics/slider constraints (physics is presentation only), rigs inside UI views (<Skeleton> with onEvent) and in playable ads, `gameengine skel2d info|pose|preview` and `gameengine anim2d` edits. Use for characters or props animated with bones (including Spine exports converted by spine-import).

A rig is `assets/<dir>/<name>.skeleton2d.json` (the engine's format, Spine's concepts:
bones, slots, skins, region and mesh attachments, IK, transform, path, physics and slider
constraints, animations with events). Spine users convert exports with the `spine-import` skill. Its images are
sprites under the rig's `images` prefix (`"images": "rig/hero/"` + `"body"` →
`assets/rig/hero/body.png`); give them one atlas group so the whole rig is one draw call.

## Put one in a scene

```json
{ "LocalTransform": { "position": [0, -1, 0] },
  "Skeleton2D": { "skeleton": "rig/hero.skeleton2d.json", "animation": "idle", "skin": "default",
                  "sortingLayer": "Default", "order": 2 } }
```

`animation` starts looping on track 0. `scale` 0 means 1 / `render.pixelsPerUnit` (rig pixels
→ world units); `flipX` mirrors (turning characters), `speed` scales every track, `color` tints.
`maskInteraction: "VisibleInside" | "VisibleOutside"` clips it by `SpriteMask` stencil masks, as on a
`Sprite` (a character in a porthole or scroll window; soft `softAlpha` masks do not clip skeletons).
It is a hashed field like the rest of `Skeleton2D`, but only changes what is drawn.
Inside the rig, Spine's clipping attachments clip slots (a polygon, concave is fine; `inverse`
keeps the outside), sequences flip frame-by-frame images (`skeleton2DSlots` reports the frame's
`image`), linked meshes share one mesh between images, and slots with `dark` tint with two
colours — all on every tier (docs/skeleton2d-format.md). Clipping skins and clips its slots on the
CPU and draws them through a second pipeline (clipping some slots costs two draw calls per
instance): prefer `maskInteraction` with a `SpriteMask`; measured costs of every feature are in
skill `animation-2d-agent`, `references/performance.md`.
On a `sortByY` sorting layer it sorts by its entity's position (add `SortPivot` to move the sort
point to the feet), on a `sortByZ` layer by its entity's world z (higher in front); skill `atlasing`.

## Drive it from sim systems

```ts
import { playSkeleton2D, queueSkeleton2D, clearSkeleton2DQueue, skeleton2DTrack, setSkeleton2DSkin, Skeleton2DEvent } from '@gameengine/runtime';

// Track 0 is the base; tracks 1–7 go over it (an aim, a blink, a breathing layer).
playSkeleton2D(ctx, e, 0, 'run', { loop: true, mix: 0.2 });   // cross-fade 0.2 s from what played
queueSkeleton2D(ctx, e, 0, 'idle', { loop: true, mix: 0.2 }); // when run's current cycle ends (minus the mix)
playSkeleton2D(ctx, e, 1, 'breathe', { loop: true, additive: true }); // adds to the pose below
playSkeleton2D(ctx, e, 2, null, { mix: 0.3 });                 // empty animation: fade track 2 out
setSkeleton2DSkin(ctx, e, 'armor');

for (const ev of ctx.events.read(Skeleton2DEvent)) {
  if (ev.kind === 'Event' && ev.name === 'footstep') { /* ev.entity, ev.animation, ev.track, ev.int, ev.float, ev.string */ }
  if (ev.kind === 'Complete' && ev.animation === 'attack') { /* a one-shot ended (or a loop finished a cycle) */ }
}
```

These are Spine 4.3's `AnimationState` calls (`setAnimation`, `addAnimation`,
`setEmptyAnimation`, `TrackEntry.additive`), so Spine code ports line by line:

- `play` disposes what the track had queued; `queue` appends (up to 8 per track: one more
  throws `E_QUEUE_FULL`; `clearSkeleton2DQueue` drops them). Queue `delay` > 0 = seconds after
  the entry before it **started**; `delay` ≤ 0 (default) = at its end (the end of its next cycle
  when it loops) minus `mix`, plus `delay`. A clear track plays a queued entry now.
- `null` is the **empty animation**: the track fades out over `mix` to the tracks below and then
  clears. Fade a layer **in**: `playSkeleton2D(ctx, e, 1, null, { mix: 0 })` then
  `queueSkeleton2D(ctx, e, 1, 'aim', { mix: 0.3 })`.
- `additive: true` (per entry) adds rotate/translate/scale/shear and deform keys, as offsets from
  the setup pose, on top of the tracks below, scaled by the track's alpha (`setSkeleton2DTrack`).
  Colour, attachment, draw-order and constraint keys still replace. Key an additive animation as
  offsets from the setup pose (a breathing scale of 1.03, an aim rotation of +20°). Additive on
  track 0 adds to the setup pose, which is rarely what you want.
- A cross-fade lasts `mix` seconds at the skeleton's `speed`, whatever the track's `timeScale`
  (Spine's rule: the animations slow down, the fade does not).
- `timeScale` is per track, not per entry as in Spine: the animation fading out plays at the
  track's current `timeScale` too, so changing it mid-fade (`setSkeleton2DTrack`) also changes
  how fast the outgoing animation runs (Spine keeps the outgoing entry's own).
- Leave out `mix` and the rig's mix table gives it: `"mixes": { "default": 0.15, "pairs":
  [{ "from": "run", "to": "idle", "duration": 0.3 }] }` in the `*.skeleton2d.json`.
- `skeleton2DTrack(e, track)` reads what a track plays, fades from and has queued (sim-safe).
- Track state is **sim state** (hashed, replayed): change it only in fixed-step systems (pass
  their `ctx`) or in tests/setup (`null`). LateUpdate, views and UI send an event or intent
  instead. Unknown names, tracks outside 0–7 or bad numbers throw with the valid options, in the
  engine and in playable ads alike.
- Key events (`kind: 'Event'`) fire once per crossing, every loop. Track-entry events
  (`Start`, `Interrupt`, `End`, `Complete`, `Dispose`; `name` empty) follow Spine's order. All
  arrive in the step after they happen (the native system runs in PostUpdate; read them in
  Update of the next step). Filter by `kind` when you count keys.
- `listSkeleton2DAnimations('rig/hero.skeleton2d.json')` gives names, durations and event times.

## Or let an Animator pick the animation

A `*.animctrl.json` state machine can drive the rig: give the entity an `Animator` and use
`"motion": { "skeleton2d": "walk" }` in its states. Each layer plays on the track with its index
(an Animator has up to 4 layers: tracks 0–3), cross-fading over the transition's `duration`, at
the state's `speed`, with the layer's `weight` as the track's alpha; a layer with
`"blend": "additive"` plays additive entries (Spine's additive); parameters, triggers and
exit times work as usual (`setAnimParam`, `triggerAnim`). Skill `flipbook-2d` has the controller
format; the same controller can mix 2D clip states and skeleton states on different entities.

## Or show it inside a UI view

A character in a HUD, a popup or a menu icon is a `<Skeleton>` element in the view, not an
entity: `<Skeleton skeleton="rig/hero.skeleton2d.json" animation={() => model().mood} mix={0.2}
queue="idle" />`. Its props mirror play/queue/mix (`animation`, `loop`, `mix`, `queue`, `restart`,
`layers` — tracks 1–7, each with `additive` — `timeScale`, `skin`, `speed`) and it plays on UI time, so it never touches the hash and
sends no `Skeleton2DEvent`s. For a sound or a burst on a key, `onEvent={(e) => …}` gets its event
keys and track-entry events (`e.kind`, `e.name`, `e.int`, …) on UI time; game rules that react to
animation events stay on a world `Skeleton2D`. Its physics constraints swing on UI time too
(restarting when the element appears again). UI skeletons have no bone queries. Skill
`ui-mvc-views` has the props; check it with
`gameengine view render <View> --times 0,0.2,0.4`. Never bake a rig into a flipbook for the UI.

## Constraints: path, physics, sliders

Spine 4.3's constraints play as in Spine, in one shared `order` (docs/skeleton2d-format.md):
path constraints move bones along a `path` attachment (ropes, tank treads, vines), sliders pose
an animation at a time a bone drives (a dial, a blend by an aim bone), transform constraints take
4.3's property mapping, IK takes `scaleY: "uniform" | "volume"`.

**Physics constraints are presentation** (hair, tails, cloth flaps): the drawn skeleton swings,
but the sim never sees it — `skeleton2DBone(s)` return the bones *before* physics, the world
hash ignores it, replays and rollback are unaffected. Never put a hitbox or a gameplay
attachment on a physics bone; put it on the bone physics hangs from. The renderer steps physics
at the constraint's `fps` with the presented frames (the same swing at 30 or 120 fps), feeds it
the entity's movement (moving or turning the entity makes tails lag) and resets it on a rollback,
a seek (a track jumping back), a long pause or a teleport (a jump farther than a tenth of a
second at the constraint's `limit`). Cost: one extra pose per physics step for skeletons that
have physics, nothing for the rest. A render test sees physics only if it renders every frame
(`render.stats({ width: 64, height: 36 })` per step, then the screenshot; `samples/rig-yard`
`tests/kite.test.ts`). Tools preview it with the wasm evaluator's `physics: 'live'` (a dt per
frame) or `'scrub'` (a deterministic replay from the animation's start); playable ads step it
too (`drawSkeletons`).

A gust, a skeleton turned upside down, a respawn: set Spine's skeleton wind and gravity, or ask for
a reset, from sim code (sim state, so replays reproduce them; physics itself stays out of the hash):

```ts
setSkeleton2DPhysics(ctx, e, { windX: -2, gravityY: 1 }); // multiply every constraint's wind and gravity (default wind (1, 0), gravity (0, 1)); fields left out keep theirs
resetSkeleton2DPhysics(ctx, e);                           // next frame takes the current pose as rest (after a respawn or a jump cut)
setSkeleton2DConstraintMix(ctx, e, 'tail', { mix: 0 });   // turn one physics constraint off (or fade it)
```

## Attach things to bones

```ts
const hand = skeleton2DBone(e, 'hand');            // world x, y, rotation (deg), scaleX, scaleY
const [l, r] = skeleton2DBones(e, ['footL', 'footR']); // ask for all you need in one call
const slots = skeleton2DSlots(e, ['weapon']);      // attachment name, sprite key, colour
```

Deterministic (the same bits on every device and JS engine), so sim systems may use them for
hitboxes; presentation uses them for VFX. They pose from the current track state, the overrides
below and the entity's world transform of the last step. Each call poses that skeleton once
(without physics; about one frame's pose of it: ~4.6 µs for a 100-bone rig on a desktop core), so
ask for every bone you need in one `skeleton2DBones` call, and never query every entity every step:
use a follower.

To keep something on a bone every step (a sword, a hat, an effect at the tail tip), give it a
`Skeleton2DFollower` instead of a system that queries: `{ skeleton: "@blob", bone: "tail2",
point: "tip", inheritRotation: true, inheritScale: false, offset: [0, 0] }` in the scene (`point`
names a point attachment; `offset` is in the bone's space, skeleton px). One native pass places
every follower after the skeletons advanced (sim: its `LocalTransform` is hashed and replayed;
a flipped skeleton mirrors it). The follower needs a `LocalTransform`.

```ts
const b = skeleton2DBounds(e);                 // world AABB of what it draws
const hit = skeleton2DHit(e, tap.world[0], tap.world[1]); // { box, slot } of the topmost bounding box, or null
const boxes = skeleton2DBoxes(e);              // world polygons [x0, y0, x1, y1, …] of every box shown
```

Tap and hit tests use `box` attachments (bounding boxes) in the rig, not the drawn images.

## Override the pose from code

Sim state, like tracks: pass the system's `ctx`; they last until cleared.

```ts
setSkeleton2DBone(ctx, e, 'head', { rotation: aimDeg, mix: 1 });    // local x, y, rotation, scaleX, scaleY
setSkeleton2DIkTarget(ctx, e, 'leg', { x, y, space: 'world' });      // move an IK target (or space 'skeleton')
setSkeleton2DConstraintMix(ctx, e, 'leg', { mix: 0 });              // IK/physics `mix`; transform: rotate, x, y, scaleX, scaleY, shearY or `mix`
setSkeleton2DConstraintMix(ctx, e, 'rope', { rotate: 0.5 });         // path: rotate, x, y or `mix`
setSkeleton2DConstraintMix(ctx, e, 'dial', { time: 0.4, mix: 1 });  // slider: time (ignored when a bone drives it) and mix
setSkeleton2DAttachment(ctx, e, 'eye', 'blink');                     // null hides the slot
setSkeleton2DSlotColor(ctx, e, 'body', [1, 0.5, 0.5, 1]);
setSkeleton2DSkins(ctx, e, ['body/gold', 'hat/red']);                // outfits: later skins win, then default
clearSkeleton2DBone(ctx, e, 'head'); clearSkeleton2DConstraint(ctx, e); clearSkeleton2DSlot(ctx, e);
```

- Bone overrides apply after the animations and before the constraints (IK, transform, path,
  slider, and physics in presentation), so children, IK and physics follow (aim a spine bone and
  the arm comes with it).
- A runtime attachment or colour replaces the slot's *setup* value for this entity: an animation
  that keys the slot shows its keys while it plays, as Spine's `setAttachment` lasts until the next
  attachment key. Clear it to go back to the rig's setup.
- `setSkeleton2DSkin` (one skin) replaces a combination; `setSkeleton2DSkins(ctx, e, [])` goes
  back to the component's `skin`. Skin-required bones and constraints are active when any listed
  skin lists them.
- Limits per entity: 8 bones, 4 constraints, 8 slots, 8 skins (`E_OVERRIDES_FULL`: clear one).
- Native (Rust) systems cannot call these yet: use TypeScript systems.

## Edit a rig in the editor, or as an agent

The editor's **Animation 2D** mode (Mode picker, off by default: switch it on in its Library; **Setup | Animate**) is a Spine-shaped editor:
bones, slots, meshes, weights, constraints, skins, the dopesheet and graph, Problems and Metrics
views, Import PSD / Spine and Export. Agents do the same with `gameengine anim2d` ops (MCP
`anim2d_*`), `anim2d lint|problems|metrics` and `skel2d preview`. Skill `animation-2d-agent` has
the workflow; its `references/editor.md` is the editor guide for an artist.

## Check your work

- `gameengine skel2d info assets/rig/hero.skeleton2d.json` — bones, slots, skins, animations
  with durations and events; warnings (dropped weights).
- `gameengine skel2d pose assets/rig/hero.skeleton2d.json --anim run --time 0.4 [--skin s] [--json]`
  — every bone's world matrix, slot attachments and colours, draw order at that time.
- `gameengine skel2d preview assets/rig/hero.skeleton2d.json --anim run --times 0,0.2,0.4 --out run.png`
  — the rig rendered alone by the engine (none of the game's views or systems) at those times as a
  contact sheet (`--gif`, `--skin`, `--controller x.animctrl.json --params k=v` for an Animator
  run). Look at it.
- `gameengine anim2d lint assets/rig/hero.skeleton2d.json` — seams, foot slides, mesh folds,
  keys past the end, unknown references.
- `gameengine anim2d metrics assets/rig/hero.skeleton2d.json --device phone-low` — what the rig
  costs per instance (estimate from measured feature costs) and its costliest features with what
  to use instead; `anim2d problems --device …` lists them as warnings.
- `gameengine validate` reports format errors with the element at fault and images that are
  not sprites; the cook fails on the same.
- Game tests: events over loops, cross-fades (`world.get(e, Skeleton2D).from[0]`), skins via
  `skeleton2DSlots`, and a `renderTest` golden of a pose (`samples/rig-yard/tests/rig.test.ts`);
  queues, additive layers and track-entry events step by step with `world.events(Skeleton2DEvent)`
  and `skeleton2DTrack` (`samples/rig-yard/tests/tracks.test.ts`); followers, overrides, outfit
  skins and tap hit tests (`samples/rig-yard/tests/kit.test.ts`).
- Playable ads: skeletons run in the ad on the engine's own track code (`playable-ad-porting`);
  `gameengine playable verify <ad>` proves it hash for hash.

## Performance

What each rig feature costs is measured in skill `animation-2d-agent`, `references/performance.md`
(physics and clipping cost most; meshes and weights are skinned on the GPU and cost the CPU nothing
extra). For game code:

- **Instances:** posing runs natively on job threads into preallocated buffers, linear in
  instances (no per-frame allocation). Instances off every camera are neither posed nor drawn
  (`render.stats().culledSkeletons`); hide or remove what the player cannot see.
- **Batching:** instances of one rig with the same atlas page, blend mode and two-colour variant
  are one draw call. Keep a rig's images in one atlas group, give each rig type its own `order` or
  sorting layer so its instances are contiguous (24 blobs and 8 kites interleaved: 17 draws; kites
  at their own order: 3), and check with `gameengine profile batches`.
- **Queries:** `skeleton2DBone(s)`, `skeleton2DSlots`, `skeleton2DBounds`, `skeleton2DHit` and
  `skeleton2DBoxes` each pose the skeleton once: one call per entity per step for the few that need
  it, followers for anything that rides a bone.
- **Overrides** (`setSkeleton2DBone`, IK targets, mixes, attachments, colours, skins) are applied
  inside the same pose (bounded work: per entity at most 8 bones, 4 constraints,
  8 slots, 8 skins). `setSkeleton2DConstraintMix(…, { mix: 0 })` skips a physics constraint's
  update but the skeleton is still re-posed at each physics step; to drop physics for crowd
  instances, make its constraints skin constraints and combine that skin only where wanted.
- **Tracks:** each layered track applies its own timelines; key only the bones a layer changes.
- Compat-tier devices skin on the CPU (same look and batching, more CPU per vertex).
- Prove it on the device: `gameengine run <p> --run-sec 10 --json`, a session's `perf.stats`
  (skeleton posing is presentation: `frameTimeMs`/`presentationTimeMs`; the sim system
  `gameengine.Skeleton2D` steps tracks) and a `tests/budgets/*.json` (example:
  `samples/rig-yard/tests/budgets/rigs.json`).
