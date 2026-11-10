---
name: overlap-queries
version: 1.1.0
tier: optional
description: Physics-free overlap checks — Bounds2D/3D shapes, overlapPairs and overlapQuery, raycastBounds, the TypeScript twin. Use for pickups, triggers, hitboxes, 'what is near me', line of sight, and rollback games. Not for things that push or bounce (that is physics).
---

# Overlap queries without a physics world

**Covers:** Physics-free overlap checks in Game Engine — Bounds2D/Bounds3D shapes (circle/sphere, AABB, oriented box, capsule), overlapPairs2D/3D, overlapPairsInto2D/3D, overlapQuery2D/3D, raycastBounds2D/3D, and the pure TypeScript twin (contactShapes, rayShape, sweepPairs). Use for pickups, triggers, hitboxes, "what is near me", line of sight against gameplay shapes, and any rollback game (physics is not snapshotted). Not for things that must push or bounce off each other: that is physics2d/physics3d.

`Bounds2D` / `Bounds3D` are plain `sim: true` components. The `overlap.*` host ops read
them straight from the world every call — no bodies to create, no physics step, no
state outside the ECS — so the results are hashed, replayed and **rollback-safe**.

| You want | Use |
|---|---|
| Pickups, triggers, hazards, hitboxes, "who is inside this area", proximity | `Bounds2D`/`Bounds3D` + `overlap*` (this skill) |
| A rollback / netplay game (`gameengine net test`) | this skill — rollback refuses `RigidBody2D/3D` |
| Things that collide, stack, bounce, have mass or joints | `RigidBody2D/3D` + `Collider2D/3D`; its queries are `query2d`, `raycast2d`, `overlapCircle2d`, `query3d`, … |
| Nearest-first point lookups only (no shapes) | `SpatialHash` |

`physics2d/3d` queries also work, but only against colliders in a physics world, and that
world lives outside the ECS (not snapshotted, not rolled back).

## Shapes

```ts
// schema: engine components, nothing to declare
Bounds2D { shape: 'Circle' | 'Aabb' | 'Box' | 'Capsule', size: [w, h], radius, height, offset: [x, y], angle, layer, mask }
Bounds3D { shape: 'Sphere' | 'Aabb' | 'Box' | 'Capsule', size: [x, y, z], radius, height, offset: [x, y, z], rotation: quat, layer, mask }
```

- Placed at the entity's **world position and rotation** (`LocalTransform` through `Parent`),
  read at call time: a position written earlier in the same step counts.
- `size` is the full extent (Aabb, Box). `Capsule`: `height` is the distance between the cap
  centres along local **y**, `radius` around it. `offset` turns with the entity; `angle`
  (2D) / `rotation` (3D) add to the entity's rotation. `Aabb` ignores every rotation.
- **Scale does not apply** — sizes are world units (a parent's scale still moves children).
- Negative sizes or non-finite numbers make the op throw, naming the entity.
- `Disabled` entities are skipped.
- Shapes are closed: **touching counts** as overlapping (depth 0).

## Host ops (one call per batch, sorted results)

```ts
import {
  overlapPairs2D, overlapContacts2D, overlapQuery2D, overlapQueries2D,
  raycastBounds2D, raycastBoundsAll2D, raycastBoundsBatch2D,     // …and the same with 3D
} from '@gameengine/runtime';

overlapPairs2D();                 // [[a, b], …] every overlapping pair, a < b, sorted by (a, b)
overlapPairs2D({ mask: 0b10 });   // only shapes whose layer is in the mask
overlapContacts2D();              // [{ a, b, normal, depth }, …] normal points a → b

const pairs = new Uint32Array(4 * 1024);       // hot loops: no array per pair
const n = overlapPairsInto2D(pairs);           // the pair count, written or not
for (let k = 0; k < Math.min(n, pairs.length / 4); k++) {
  const a = entityAt(pairs, 2 * k), b = entityAt(pairs, 2 * k + 1);
}
// n > pairs.length / 4: only the first pairs fit; grow to 4 * n lanes and call again

overlapQuery2D({ shape: 'Circle', pos: [x, y], radius: 3, mask: ENEMY }); // entities, sorted
overlapQueries2D([{ shape: 'Box', pos, size: [2, 1], angle }, …]);        // many in one call

raycastBounds2D(from, to, { mask });   // first hit { entity, t, point, normal } or null
raycastBoundsAll2D(from, to);          // every hit, sorted by (t, entity)
raycastBoundsBatch2D([{ from, to, all: true }, …]);
```

- **Pairing:** `a` and `b` pair when `a.layer & b.mask` and `b.layer & a.mask` are both non-zero.
  Queries and rays use their own `mask` against each shape's `layer`.
- **Order:** entities by (index, generation) — the same on every peer, engine and device.
- **Rays** run from `from` to `to`; `t` is the 0..1 fraction. A ray that starts inside a
  shape hits it at `t = 0` with the normal against the ray.
- **Contacts:** moving `b` by `normal * depth` separates the pair. Depth is exact for
  circles/spheres/capsules apart at their cores; for boxes and crossing cores it is the
  smallest push over the separating axes (SAT) — enough to separate, sometimes more than the
  true penetration.
- Limits: 4096 queries or rays per call, 100 000 pairs, coordinates within ±1e9. Past a
  limit the call throws.

## Example: ownership in layers (samples/rollback-arena)

```ts
// player i is on layer 1 << i; a mine's mask leaves out its owner, so own mines never report
export const MINE_LAYER = 1 << 4;
export const mineBounds = (owner: number) => ({ shape: 'Circle', radius: 0.2, layer: MINE_LAYER, mask: 0b1111 & ~(1 << owner) });

export const Detonate = defineSystem({
  name: 'Detonate',
  query: query(read(Mine)),
  run(ctx, q) {
    const owners = new Map<EntityId, number>();
    for (const c of q.chunks()) for (let i = 0; i < c.length; i++) owners.set(c.entity(i), c.get(Mine, i).owner);
    for (const { a, b } of overlapContacts2D()) {
      const mine = owners.has(a) ? a : owners.has(b) ? b : undefined;
      if (mine !== undefined) ctx.commands.despawn(mine);   // pairs are sorted: same result on every peer
    }
  },
});
```

Pickups the same way: `Bounds2D` on the player and the coins, a coin layer, one
`overlapPairs2D()` per step, despawn what the player touches.

## The TypeScript twin (no host needed)

The same narrowphase and broadphase in TS, bit-identical to the Rust (only `+ - * /`,
`sqrt`, comparisons, `math.sin/cos`):

```ts
import { shape2D, shape3D, boundsShape2D, contactShapes, overlapShapes, rayShape, shapeContains, sweepPairs, queryShapes } from '@gameengine/runtime';

const sword = shape2D({ shape: 'Capsule', pos: [x, y], height: 1.2, radius: 0.15, angle });
const hurt = shape2D({ shape: 'Box', pos: [ex, ey], size: [0.8, 1.6] });
contactShapes(sword, hurt);          // { normal, depth } | null
rayShape(hurt, [0, 0], [10, 0]);     // { t, normal } | null
```

Use it for shapes that are not entities (a swing arc this step, a preview), for pure unit
tests, and to check a host result. `boundsShape2D(bounds, position, rotation)` places a
component value exactly as the host does (read f32 fields through `math.fround`).

## Performance

- Pairs: sort-and-sweep along x in Rust, O(n log n) plus the pairs whose x ranges meet.
  Measured (release, x86-64, mixed shapes): ~50 ns per narrowphase pair; 2000 shapes with
  ~4400 overlapping pairs in ~3 ms. Queries and rays scan every shape with an AABB reject
  first (O(n) per query) — batch them into one call. The TS twin is ~50× slower per pair:
  fine for a handful of shapes, use the host ops for the world.
- Each call re-reads every `Bounds*` and its transform. Pairs cross from Rust as u32 lanes;
  `overlapPairs2D` then makes one `[a, b]` array per pair, `overlapPairsInto2D` none (a swarm
  with thousands of pairs per step wants the latter; a module-level `Uint32Array` scratch is
  allowed, since every call writes the pairs before they are read). Contacts, queries and rays still come back as JSON.
  Call once per system per step, not per entity (`no-native-call-in-loop`); share the result.

## Rollback safety

Everything lives in `sim: true` components, so a restore puts the shapes back and the next
call sees them; there is nothing to rebuild. Keep what you do with the results sorted-order
driven (iterate the returned arrays, not a `Set` of your own), and check with
`gameengine net test <project> --players 4 --latency 8 --jitter 4 --synctest 6`.

## Testing

```ts
worldTest('touching an enemy mine sets it off', async ({ world, step }) => {
  world.spawn({ LocalTransform: { position: [-2.6, 0, 0] }, Mine: { owner: 1 }, Bounds2D: mineBounds(1) });
  expect(overlapPairs2D().length).toBe(1);
  await step(1);
  expect(world.count(Mine)).toBe(0);
});
```

Unit-test geometry with the twin in plain Vitest; run game tests on both engines:
`gameengine test <project> --js both`.
