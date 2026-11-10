---
name: open-world-streaming
version: 1.4.2
tier: optional
description: Big worlds streamed in cells with @gameengine/stream — StreamFocus, StreamCell, Dormant, per-cell saves, recycled slot rings for procedural worlds, floating origin, SpatialHash. Use for levels larger than a screen or two, endless runners, open world, chunks, regions or LOD.
---

# Open worlds: streaming, dormancy, floating origin

**Covers:** Big worlds in Game Engine — cells streamed around the player with @gameengine/stream (defineStreaming, StreamFocus, StreamCell, Dormant), saved changes per cell, recycle mode for procedural worlds (a fixed ring of slots rebuilt in place, no spawns in play, a keyed change overlay, loading covers that wait for it), the floating origin, SpatialHash, and how systems must treat far or unloaded content. Use for any level larger than a screen or two, endless runners and drivers, or anything with "open world", "chunks", "regions", "tiles", "slots" or "LOD".

## Streaming or a scene switch

| Use | When |
|---|---|
| **Streaming cells** (this skill) | One continuous space the player walks through: no cut, no loading screen; cells load and unload around `StreamFocus` while play goes on. |
| **`scenes.enter` behind `loading.run`** (skill `asset-memory`) | Separate places: levels, a town → a dungeon, menus → play. The sim holds under the cover while groups load, then swaps the whole scene. |

Both combine: each area is a scene entered behind a loading screen; inside it, cells stream.
Put the area's shared art in its asset group and let cells stream the rest. Streaming state
(`stream:cell:*` documents) is world state and survives a switch like every document.

## Layout

- The world is a grid of square **cells**; each cell is a scene (`scenes/cells/<x>_<y>.scene.json`)
  authored in **absolute** coordinates. Generate or edit them like any scene; keep entity ids
  unique per cell (prefix with the cell).
- Put `StreamFocus` on the player (and anything else that must keep its surroundings loaded).

```ts
import { defineStreaming } from '@gameengine/stream';

export const streaming = defineStreaming({
  cellSize: 12,
  loadRadius: 1,        // rings of cells kept loaded around each focus
  activeRadius: 1,      // rings that simulate; the rest are tagged Dormant
  unloadMargin: 1,      // hysteresis: no thrashing at a border
  cellPath: (x, y) => (inWorld(x, y) ? `scenes/cells/${x}_${y}.scene.json` : null),
  rebaseDistance: 24,   // floating origin (optional)
});
export const Streaming = streaming.system;   // export it like any system (runs in PostUpdate)
```

`cellSize` must be positive and the radii/margin whole numbers of cells, or `defineStreaming` throws.

## Procedural worlds: recycle mode

When a cell's content is a pure function of its coordinates and the seed (an endless road, a
city from a seed, a runner's track), don't author cell files and don't spawn per cell: keep a
fixed ring of **slots** that are rebuilt in place. Nothing is spawned or despawned in play, and
memory stays flat however far the player goes (ADR 0129).

```ts
export const city = defineStreaming({
  name: 'City',                 // names the system and its documents
  cellSize: 80,
  loadRadius: 2,                // a 5×5 ring: 25 slots
  plane: 'xz',
  recycle: {
    members: {                  // per slot, spawned once (prefabs in a boot asset group)
      tile: { prefab: 'prefabs/tile.prefab.json', count: 1 },
      lamp: { prefab: 'prefabs/lamp.prefab.json', count: 12 },
      hydrant: { prefab: 'prefabs/hydrant.prefab.json', count: 20 },
    },
    build(ctx, slot) {          // pure of (slot.x, slot.y, slot.seed, slot.changes())
      const tile = layoutTile(slot.x, slot.y, slot.seed);
      tile.hydrants.forEach((h, i) => {
        if (slot.changes()[`hydrant:${i}`]) return;            // knocked over earlier this run
        const e = slot.take('hydrant')!;
        ctx.commands.set(e, LocalTransform, { position: [slot.origin[0] + h.x, 0, slot.origin[2] + h.z] });
      });
      // …members not taken are parked (Disabled + Hidden) after build returns
    },
    perStep: 1,                 // slots rebuilt per step (a whole number: every device agrees)
    lookAhead: 1,               // seconds ahead of the focus: what's ahead is built first
    margin: 0.05,               // share of a cell past the centre cell before the window moves
  },
});
export const City = city.system;
```

- **Size `count` from data:** `city.stats().members` gives each kind's capacity, the most one
  slot used (`peak`) and `misses` (`take` returned null). Limits: `loadRadius` 16 (1,089 slots),
  slots × members 65,536, and 65,536 entities spawned (members × their prefab's entities).
- **The first spawn is one step:** every member spawns on the first step with a focus. Put it
  under the boot cover (below), and keep member prefabs small.
- **Never despawn a member, and never make one `Persistent`** (a ring is scene-owned: a scene
  switch respawns it); park a member by not taking it. Never hold member ids in your own state:
  the slot's next build hands them out again.
- **Changes the player makes** (a knocked hydrant): `city.change(x, y, 'hydrant:3', true)` from a
  sim system, then `city.rebuild(x, y)` to show it now; `build` reads `slot.changes()` (keys
  sorted, so iterating it is deterministic) every time the cell comes back. Keep keys short
  (at most 256 characters) and values small (4 KB of JSON). `city.clearChanges()` and `city.rebuildAll()` at a run restart.
- **Writes that change nothing cost nothing:** a command whose bytes equal the component's (the
  same mesh, the same material) marks no change, so set what the layout says without tracking
  what changed yourself.
- **Two streaming worlds** (cells plus a decor ring) need two `name`s; the one that does not
  rebase runs `after: ['Streaming']`, so its builds see the moved origin.
- **Wait for it under the boot cover:** `loading.boot({ load: ['boot'], runSim: true, until: () =>
  city.ready(), minSeconds: 2 })` resumes the sim under the cover and lifts it once every slot is
  built (`minSeconds` is real time, the same at 30 and 60 fps). Put every mesh a slot can switch
  to in that group, so it is uploaded before play, not the first time a rare tile streams in.
- **Nearest few for presentation** (radar pings, markers): `SpatialHash.nearest(x, y, n, maxDist)`.

## Rules for gameplay systems

- **Skip far things:** query `without(Dormant)` in anything that costs per entity (AI, animation,
  pickups). Dormant entities keep their state and wake when you come back.
- **Never hold entity ids across frames for streamed content** — cells unload. Keep GUIDs
  (`SceneEntity.guid`) or cell-relative ids in documents instead.
- **Runtime spawns that belong to a place** (a dropped item) get `StreamCell { cell: 'x,y' }`, so
  they unload and come back with that cell. Anything without it stays loaded forever.
- **Coordinates:** with a floating origin, `LocalTransform` of root entities is relative to
  `streaming.origin()`. Store absolute positions (targets, waypoints, quest markers) and convert
  with `streaming.toLocal(p)` / `streaming.toWorld(p)`. Taps arrive in local coordinates.
- **Rebasing happens at the end of a step** (Streaming runs in PostUpdate) and moves `WorldView`
  with everything else, so within a step every position and this step's taps share one origin:
  `streaming.toWorld(tap.world)` is right even on the step the origin moves.
- **Camera:** follow the player with the `WorldViewFollow` resource (2D, sim; it moves `WorldView.center`) or `CameraFollow` (3D); skill `camera`.
- **Loading is ahead of you:** in cooked builds the engine reads the cells around the start
  before the first frame and, each time the player enters another cell, the next ring on the IO
  thread, so a cell load never waits on storage. Enter a streamed world from another scene with
  a loading screen whose `load` groups hold the world's scene
  (`loading.run({ load: ['world'], swap: 'scenes/world.scene.json' })`): under the cover it reads
  the cells around that scene's player and swaps once they are in. A cell that is read on the spot
  (the player outran the reads, or `scenes.enter` without a cover) logs `cell scene '…' read from
  storage on the frame thread` and fails `gameengine check`'s smoke run: raise `loadRadius` rather
  than making cells heavy. `streaming.readAhead()` counts those misses (tests, profiling).

## Saves

A cell that changed while loaded (coin picked up, door opened, crate moved) is saved whole
into its own world document `stream:cell:<key>` when it unloads, and loads from there next time;
unchanged cells reload from their scene. That document is part of the world, so save slots
and replays carry it. Float noise under 0.001 does not count as a change.

## Nearby queries

```ts
const near = new SpatialHash(4);             // @gameengine/runtime; rebuild each step
for (...) near.insert(entity, x, y);
near.near(px, py, 3);                        // nearest first, deterministic
```

## Test it

```ts
worldTest('the coin stays taken', async ({ world, step }) => {
  // walk away until its cell unloads, walk back, count coins in that cell
});
```

Assert on `streaming.loaded()`, `Dormant` on far entities, `savedCells()` from `@gameengine/stream` (only changed
cells), and `streaming.toWorld(local)` after rebasing. For a recycle ring, walk many cells and
assert the `StreamSlot` entities are the same ids before and after (no spawn, no despawn), that
live members sit where the layout function says, and that a change survives the cell streaming
out and back. Sample: `samples/open-world` (`tests/meadow.test.ts`).
