---
name: vfx
version: 1.16.0
tier: optional
description: Particle effects (*.vfx.json) — emitters, forces, colour and size over life, sub-emitters, `gameengine vfx preview|stats|set`, recipes (burst, trail, smoke, fire, confetti, hit flash), mobile rules. Use for any visual effect, explosion, magic, pickup sparkle or UI flourish, and before shipping one to phones.
---

# Particle effects

**Covers:** Particle effects in Game Engine — the *.vfx.json data form (emitters with spawn, shape, lifetime, speed, forces, colour and size over life, sprite sheets, blend, collision, sub-emitters), the preview → adjust loop with `gameengine vfx preview` contact sheets and `vfx stats` budgets, small edits with `vfx set`, recipes (burst, sparkle, trail, smoke, fire, confetti, UI glint, hit flash) and mobile performance rules. Use for any visual effect, explosion, magic, pickup sparkle or UI flourish, and before shipping one to phones.

Effects are **data**: `assets/fx/<name>.vfx.json`, the exact JSON the engine loads (no build
step, hot reloaded). A `*.vfx.ts` (the `@gameengine/vfx` DSL) is for effects built by code; it
compiles to the same data (`pnpm gen` → `*.vfx.gen.json`). Format: `docs/vfx-format.md`, JSON
Schema `docs/generated/vfx.schema.json`. Designers edit either in the editor's **VFX mode** (on by default; its effect list finds an effect by name, path,
emitter, texture or any text in it).

Effects are presentation only: the sim decides *when* (spawn an entity with
`ParticleSystem: { effect: 'fx/boom.vfx.json', seed }`), never reads particles back.

## Effects in 3D and tilted orthographic views

Particles face and project through a perspective camera, and through an orthographic one tilted
off the z axis (a tilted orthographic 3D scene), as 3D meshes do. A flat 2D camera keeps the 2D
view's plane. `Camera.space` (`Auto`, `Space2D`, `Space3D`) overrides the guess when a camera is
built in an unusual way (the kind rule is skill `camera`). A pooled effect restarts on its own when `pool.take` hands it out again
(skill `asset-memory`).

## Draw order and masks in 2D

By default an effect draws after every 2D sprite. To put it between sprites (debris under a
piece, a glow behind a character), give the `ParticleSystem` a sorting layer and order, as on a
`Sprite` (Unity's sorting layer / order in layer): it draws after sprites with the same layer
and order and before higher ones. On a `sortByY` sorting layer (skill `atlasing`) it sorts by its
entity's position plus `SortPivot.offset`, like sprites; each `burstAt` burst sorts at its own y.
On a `sortByZ` layer it sorts by its origin's world z (each burst at its own z).

```ts
ParticleSystem: { effect: 'fx/shards.vfx.json', sortingLayer: 'Default', order: 1 } // in a scene or ctx.commands.spawn
```

`maskInteraction: "VisibleInside" | "VisibleOutside"` clips it by `SpriteMask` stencil masks like a
sprite (soft `softAlpha` masks do not clip particles). Each sorted effect breaks sprite batching
once; leave `sortingLayer` empty when the effect may draw on top. `Skeleton2D` takes the same
`maskInteraction`.

## The loop: look, change one thing, look again

```bash
gameengine vfx preview boom --times 0,0.1,0.3,0.6,1 --out /tmp/boom.png   # read the PNG
gameengine vfx set boom sparks.speed 2..4        # or [2,4]; one number means [n, n]
gameengine vfx set boom sparks.color "#ffb347"   # hex is sRGB, stored as linear RGBA
gameengine vfx preview boom --out /tmp/boom.png  # compare
gameengine vfx stats boom --device android-low-compat   # before you call it done
```

- **Always look** after a change: a contact sheet (labelled frames, the effect alone, fixed
  seed, engine-rendered) costs ~2 s. `--background checker|light|#rrggbb` for dark or alpha effects (or
  the game's own background colour),
  `--gif` for motion, `--seed n` for another random draw, `--tier compat` for the CPU path.
- Pick times that show the story: birth, peak, decay (`vfx stats` prints the peak time).
- Other edits: `vfx add-emitter boom [name] [--from sparks]`, `remove-emitter`, `move-emitter
  boom sparks 0` (list order is draw order), `vfx set boom sparks.shape.radius 0.4`,
  `vfx set boom sparks.texture fx/spark`, `vfx set boom sparks.collision null` (null removes →
  engine default). Every command takes `--json`; MCP: `vfx_preview`, `vfx_stats`, `vfx_set`,
  `vfx_validate`.
- `gameengine vfx validate` (also part of `gameengine validate`) reports what the engine would
  refuse, with JSON pointers. `gameengine vfx convert x.vfx.ts` turns a code effect into data.
- **A new effect needs its `.gmeta` sidecar**: create it with `gameengine cmd asset.setText
  --params '{"path":"assets/fx/boom.vfx.json","text":"…"}'` (it writes a new file under
  `assets/` with its sidecar) or run `gameengine cook` once after adding
  files, and commit the `.gmeta`; until then `validate` fails with `E_ASSET: no .gmeta sidecar`.

## Emitter cheat sheet

| Module | Keys (defaults) |
|---|---|
| Spawn | `capacity` 256 (live cap), `rate` 0 /s, `bursts` `[{at, count}]`, `duration` 1 s, `loop` true, `delay` 0, `rateOverDistance` 0 /unit (trails behind a moving emitter, spread along its path), `prewarm` false (a looping emitter starts full) |
| Shape | `shape: {kind: point\|sphere\|cone\|box\|circle, radius, angle (cone, rad), size (box), surface, rotation [x,y,z] degrees}`; cone emits along +Y, circle in XY (2D) |
| Initial | `lifetime` [1,1], `speed` [1,1], `size` [0.1,0.1] (quad width, world units), `rotation`, `spin`, `color` / `color2` (random mix) |
| Forces | `gravity` [x,y,z], `drag`, `maxSpeed` (0: no limit), `inheritVelocity` (sub-emitters) |
| Over life | `colorOverLife` `[[t, r,g,b,a], …]` × start colour; `sizeOverLife` `[[t, scale], …]` (linear between keys) |
| Rendering | `texture` (image key, none = soft dot), `material` (a `*.mat.json`/`*.material.ts` key drawn unlit over the textured particle: its surface reads the particle colour as `vertexColor`, the quad uv, and `instanceParams` = life fraction, random, age; dissolves and scrolling noise; one extra draw per material, so drop it for `phone-low` in `overrides`), `sheet {cols, rows, fps, startFrame}` (fps 0: once per life; `startFrame` a frame, `[min, max]` or `"random"` per particle — varied debris shards), `mesh` (a model key, `models/rock.glb#Shard`: each particle draws that mesh, unlit with a facing shade, tumbling by its rotation; at most 2,048 triangles and capacity 256; back faces culled; one draw per emitter and `material` is ignored, so keep it to debris, coins and leaves), `blend` additive\|alpha, `orient` billboard\|velocity (+ `stretch`, `lengthScale`)\|horizontal\|vertical\|world\|local, `aspect` (height / width), `space` world\|local |
| Collision | `collision {bounce, friction, lifetimeLoss}` — scene depth, desktop GPU only |
| Sub-emitters | `subEmitters [{on: death\|collision, emitter, count ≤ 64}]`; the child has no rate/bursts, same space, capacity = parent × count |

Ranges are `[min, max]`; colours are **linear** RGBA (values above 1 glow brighter with
additive blending). 1 to 8 emitters per effect.

## Recipes (paste into `"emitters": [...]`, then preview and tune)

**Burst** (pickup pop, impact): one-shot sphere, drag to slow, shrink out.
```json
{"name":"burst","capacity":64,"bursts":[{"at":0,"count":48}],"loop":false,"shape":{"kind":"sphere","radius":0.1},"lifetime":[0.4,0.8],"speed":[3,6],"drag":2,"size":[0.1,0.2],"color":[1,0.651,0.147,1],"colorOverLife":[[0,1,1,1,1],[1,1,0.147,0.042,0]],"sizeOverLife":[[0,1],[1,0]],"blend":"additive"}
```
**Sparkle** (idle shine on a collectible): slow, few, fade in and out, two colours.
```json
{"name":"twinkle","capacity":48,"rate":24,"shape":{"kind":"circle","radius":0.8},"lifetime":[0.5,0.9],"speed":[0,0.2],"size":[0.08,0.16],"spin":[-4,4],"color":[1,0.922,0.578,1],"color2":[0.347,0.687,1,1],"colorOverLife":[[0,1,1,1,0],[0.3,1,1,1,1],[1,1,1,1,0]],"sizeOverLife":[[0,0],[0.3,1],[1,0]],"blend":"additive"}
```
**Trail** (behind a moving projectile): world space, no speed — the *emitter* moves. For a continuous ribbon
(a sword swipe, a dash streak) use the `Trail` component instead (below).
```json
{"name":"trail","capacity":128,"rate":90,"lifetime":[0.4,0.6],"speed":[0,0.1],"size":[0.12,0.16],"color":[0.212,0.716,1,1],"colorOverLife":[[0,1,1,1,0.8],[1,0.014,0.117,1,0]],"sizeOverLife":[[0,1],[1,0.2]],"space":"world","blend":"additive"}
```
**Smoke**: few, big, alpha, rising, growing, slow spin; a soft texture beats the dot.
```json
{"name":"smoke","capacity":40,"rate":12,"shape":{"kind":"circle","radius":0.2},"lifetime":[1.6,2.4],"speed":[0.4,0.8],"gravity":[0,0.6,0],"drag":0.8,"size":[0.5,0.8],"rotation":[0,6.28],"spin":[-0.5,0.5],"color":[0.323,0.323,0.323,1],"colorOverLife":[[0,1,1,1,0],[0.15,1,1,1,0.45],[1,1,1,1,0]],"sizeOverLife":[[0,0.5],[1,1.6]],"blend":"alpha"}
```
**Fire**: additive flame (yellow → orange → dark red) plus a few embers (second emitter).
```json
{"name":"flame","capacity":96,"rate":60,"shape":{"kind":"cone","angle":0.25,"radius":0.15},"lifetime":[0.5,0.9],"speed":[1.2,2],"gravity":[0,1.5,0],"size":[0.35,0.5],"color":[1,0.434,0.051,1],"colorOverLife":[[0,1,0.888,0.352,0.9],[0.4,1,0.144,0.005,0.7],[1,0.216,0.005,0,0]],"sizeOverLife":[[0,0.6],[0.3,1],[1,0.2]],"blend":"additive"},
{"name":"embers","capacity":32,"rate":8,"shape":{"kind":"cone","angle":0.4,"radius":0.2},"lifetime":[0.8,1.4],"speed":[1.5,2.5],"gravity":[0,0.5,0],"size":[0.04,0.07],"color":[1,0.527,0.117,1],"colorOverLife":[[0,1,1,1,1],[1,1,0.051,0,0]],"blend":"additive"}
```
**Confetti** (win screen): one cone burst up, gravity and drag, spin, alpha; use a small
rectangle texture for paper.
```json
{"name":"confetti","capacity":96,"bursts":[{"at":0,"count":80}],"loop":false,"shape":{"kind":"cone","angle":0.6},"lifetime":[1.6,2.2],"speed":[4,7],"gravity":[0,-6,0],"drag":1.5,"size":[0.1,0.16],"rotation":[0,6.28],"spin":[-8,8],"color":[1,0.078,0.22,1],"color2":[0.078,0.638,1,1],"colorOverLife":[[0,1,1,1,1],[0.8,1,1,1,1],[1,1,1,1,0]],"blend":"alpha"}
```
**UI glint** (button or card shine, repeats every 1.5 s): one particle; give it a four-point
star texture.
```json
{"name":"glint","capacity":4,"bursts":[{"at":0,"count":1}],"duration":1.5,"lifetime":[0.5,0.5],"speed":[0,0],"size":[0.6,0.6],"rotation":[0.785,0.785],"spin":[3,3],"color":[1,1,1,1],"colorOverLife":[[0,1,1,1,0],[0.4,1,1,1,1],[1,1,1,1,0]],"sizeOverLife":[[0,0.2],[0.4,1],[1,0.1]],"blend":"additive"}
```
**Hit flash**: one big quick quad plus velocity-stretched shards.
```json
{"name":"flash","capacity":1,"bursts":[{"at":0,"count":1}],"loop":false,"lifetime":[0.12,0.12],"speed":[0,0],"size":[1.2,1.2],"color":[1,0.905,0.631,1],"colorOverLife":[[0,1,1,1,1],[1,1,1,1,0]],"sizeOverLife":[[0,0.6],[1,1.2]],"blend":"additive"},
{"name":"shards","capacity":16,"bursts":[{"at":0,"count":12}],"loop":false,"shape":{"kind":"circle","radius":0.05},"lifetime":[0.2,0.35],"speed":[5,8],"drag":6,"size":[0.08,0.12],"color":[1,0.745,0.216,1],"orient":"velocity","stretch":0.06,"colorOverLife":[[0,1,1,1,1],[1,1,0.216,0.051,0]],"blend":"additive"}
```

## Trails: a ribbon behind a moving entity

`Trail` (Unity's TrailRenderer) is a strip through the entity's last positions, not particles:

```ts
Trail: { image: 'fx/streak', color: '#9fd8ff', time: 0.35, width: 0.4, endWidth: 0, blend: 'Additive', sortingLayer: 'Fx' }
```

- A point is kept each `minDistance` (0.05) the entity moves and lives `time` sim seconds (0.5); at most 64,
  the head always at the entity. `width` → `endWidth` and `color` → `endColor` (transparent by default) blend
  along the age; the image's x runs from the entity to the oldest point. For a ported width curve or colour
  gradient, key them over the age (0 head, 1 oldest): `widthCurve: [0, 1, 0.3, 1.4, 1, 0], widthKeys: 3` (scales
  of `width`) and `gradient: [0, 1, 1, 1, 1, 1, 1, 0.4, 0, 0], gradientKeys: 2` (`age, r, g, b, a`, linear
  colour), up to 8 each; values hold past the ends.
- `emitting: false` stops adding points and lets it fade out; `visible` hides it without a structural change.
- Under a perspective camera it turns to face the eye; under a flat or tilted orthographic camera it lies in
  the 2D plane. It sorts and batches like a sprite (`sortingLayer`, `order`, `blend`).
- Cost: one CPU-built strip of up to 64 segments a trail, no allocation past the frame's batch buffers, no draw
  of its own when it batches. Use one per moving hero or projectile, not on hundreds of pooled bits (use a
  particle trail there).

## Effects inside the UI

The same `.vfx.json` plays in a view with `<Particles effect="fx/confetti.vfx.json" restart={() => model().opened} />`
(`@gameengine/ui`, skill `ui-mvc-views`): drawn in the view's tree order, clipped by `overflow: hidden`, sized in
reference px (`unit`, default 100 px per effect unit, so `speed: 10` is 1000 px/s and `size: 0.5` is 50 px), always on
the CPU simulator (keep UI effects to a few hundred particles). Effect +Y is up the screen. Sheets need an untrimmed
texture (`trim = false` in its `.gmeta`); `collision` does nothing in the UI.

Use CSS-animated sprites (`fx-*`, `@keyframes`) for a few hand-placed sprites with an exact path (a star landing, a
badge pulse); use UI particles for many randomised bits (confetti, sparkles, coin bursts, glints); use a world effect for
anything in the game scene. Check a UI effect in its view: `gameengine view render <View> --times 0.2,0.6,1.2`.

## Mobile performance rules

`gameengine vfx stats <effect> --device <class>` checks these (defaults in
`@gameengine/vfx` `VFX_BUDGETS`, derived from `mobile-performance-review/budgets.md`; replace
with your lab numbers). Per effect instance:

| Class | Peak particles | Overdraw share | Draws (emitters) | Texture side |
|---|---|---|---|---|
| `android-low-compat` (CPU simulation) | 300 | 1× | 4 | 128 px |
| `android-low-mid`, `iphone-oldest` | 1000 | 1× | 6 | 256 px |
| `android-mid` | 2000 | 1.25× | 8 | 256 px |
| `android-high`, `iphone-current`, `ipad` | 5000 | 1.5× | 8 | 512 px |

- **Overdraw is the usual killer** on phones, not particle count: every pixel of every quad is
  shaded, even where a soft dot is transparent. Fewer, smaller particles; shrink them over life;
  avoid many big overlapping quads (smoke, fog). The estimate assumes the effect fills the view
  (worst case); pass `--view-height <world units>` for your camera.
- **Additive vs alpha:** additive is order-independent and cheap to get right — sparks, glows,
  fire, magic. Alpha blending shows ordering (particles are drawn per emitter, not depth
  sorted) — use it for smoke, dust, confetti, and keep those counts low.
- **Counts:** set `capacity` to what the effect needs (it is also the memory reserved); a
  looping emitter holds about `rate × lifetime[1]`. `vfx stats` warns when every slot is used.
- **Draw calls:** one per emitter per *effect*, however many instances play (ADR 0092): every live
  `ParticleSystem` of `fx/boom.vfx.json` that draws at the same place (unsorted, or the same
  sorting layer/order slot) with the same `maskInteraction` shares one draw per emitter, on the
  GPU and CPU paths. So 40 overlapping combo bursts of a 3-emitter effect are 3 draws, and it pays
  to reuse one effect with a different `seed` rather than copy it. What still draws per instance:
  emitters with `space: local`, `orient: local` or a random `sheet.startFrame` (their look depends
  on the instance), and sorted effects that are not next to each other in sort order (effect X,
  then Y, then X again on one layer is three draws: sort order wins). Different unsorted
  effects share a draw too when blend, `maskInteraction` and texture *page* agree: textures
  only effects use are atlased together (`auto-effects`), so prefer one blend mode across effects
  that play together and keep their textures small. 2–3 emitters per effect is typical.
- **Many bursts, one entity:** `burstAt(system, [[x, y], …])` (`@gameengine/runtime`, from UI,
  `LateUpdate` or a sim system: a sim call is sent once, so a rollback re-run adds no second burst) plays
  the system's effect once at each position — a combo's 40 pops without
  40 entities. Create the host system stopped (`ParticleSystem: { effect, emitting: false }`);
  each burst gets its own random stream, and a system keeps its last 256. Batched instances are not ordered among each
  other, so overlapping alpha-blended instances may stack differently — additive is unaffected.
- **Textures:** small (64–128 px for sparks and dots, 256 for smoke), in a sheet rather than
  many files; no texture at all is cheapest (the soft dot).
- `android-low-compat` simulates on the CPU: particle count is CPU time there. Collision is
  desktop only; effects must look right without it.
- Measure the real thing: `gameengine lab` (T2) with the effect on screen; `vfx stats --render`
  adds what the engine reports for one frame.

## Cheaper on low-end phones

Author the effect for `android-low-compat` first, then give richer devices more; when the full
effect is over that class's budget, give low-end phones a cheaper version in the same file
(skill `device-tiers`):

```ts
export default effect('Confetti', [/* emitters, each with a name */], {
  overrides: {
    'phone-low': { capacityScale: 0.5, rateScale: 0.5 },     // the rate also scales bursts
    compat: { emitters: { glow: { enabled: false } } },       // emitters by name
  },
});
```

- `capacityScale` and `rateScale` apply to every emitter; `emitters.<name>` patches one emitter's
  fields, `enabled: false` drops it (all disabled draws nothing); `use: 'fx/confetti_lite.vfx.json'`
  draws another effect instead. `*.vfx.json` takes the same `overrides` block.
- Edit a `*.vfx.json`'s overrides with `vfx set … --device <tier or memory class>` (the key under
  `overrides`), not by hand: `vfx set boom capacityScale 0.5 --device phone-low`,
  `vfx set boom sparks.rate 40 --device phone-low`, `vfx set boom glow.enabled false --device
  compat`, `vfx set boom use fx/boom_lite.vfx.json --device compat`; `null` removes the entry.
- Check it: `gameengine vfx stats <fx> --device phone-low` (a memory class: `phone-low` reads
  the `android-low-mid` budget, `phone` `android-mid`, `tablet` `ipad`; `--device
  android-low-compat` adds the compat tier) prints the resolved tier and class and the budgets
  for that version; `gameengine validate` reports a misspelled key or
  emitter name (`W_OVERRIDE_KEY`).
- Under load and heat the quality governor scales every effect further (`vfx` step): the
  phone-low version should fit its budget without it.
