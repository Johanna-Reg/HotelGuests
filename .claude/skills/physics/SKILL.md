---
name: physics
version: 1.1.0
tier: optional
description: Rigid-body physics (Box2D, Jolt) — RigidBody2D/3D, Collider2D/3D, kinematic bodies, contact and sensor events, impulses, joints, batch raycasts and overlaps. Use for anything that falls, stacks, bounces or pushes, and when porting Unity Rigidbody/Collider code (physics-free triggers are overlap-queries).
---

# Physics (Box2D in 2D, Jolt in 3D)

**Covers:** Rigid-body physics in Game Engine — RigidBody2D/3D and Collider2D/3D (Box2D and Jolt), compound bodies from child colliders, kinematic bodies and teleports, contact and sensor events, impulses, joints, and the batch queries (raycasts, casts, overlaps with contacts, closestPoint). Use for anything that falls, stacks, bounces, pushes or is pushed, and when porting Unity Rigidbody/Collider code. (Physics-free triggers and rollback games: overlap-queries.)

Components say what exists; the engine steps the physics world in `PostUpdate` with the sim's
fixed `dt` and writes poses back to `LocalTransform` (top-level bodies) and velocities back to
`RigidBody2D/3D`. Everything is deterministic: same inputs, same bits on V8, Hermes and every
device. The physics world is **not** snapshotted — a rollback game uses `overlap-queries`.

## Bodies and colliders

```ts
ctx.commands.spawn({
  LocalTransform: { position: [0, 5, 0] },
  RigidBody3D: { type: 'Dynamic' },                       // 'Static' | 'Kinematic' | 'Dynamic'
  Collider3D: { shape: 'Box', size: [1, 1, 1], density: 200, friction: 0.6, category: 1, mask: 0xffff },
});
```

- A collider without a body is a static body. 3D shapes scale with the entity's scale; 2D
  shapes do not.
- Writing `LocalTransform` or velocities from gameplay teleports or sets them. A **kinematic**
  body follows its `LocalTransform` over the step (it pushes and carries what it touches);
  `teleportKinematic3d(e)` in the step that writes the pose makes it a jump with no velocity
  (Unity setting a kinematic body's transform).
- `Impulse2D/3D` events push bodies; `Joint2D/3D` connect them; `CharacterController3D` walks.
- Events: `CollisionStarted*`, `CollisionEnded*`, `SensorEntered*`, `SensorExited*`
  (a `sensor: true` collider reports overlaps without colliding), and `CollisionDetails3D` when
  `Physics3DSolver.contactDetails` is on (§ Tuning the 3D solver).

## Compound bodies (Unity's child colliders)

A collider entity **without** a body, under a parent chain that has one, is a shape of the
nearest ancestor's body at its transform under it:

```ts
const cart = world.spawn({ LocalTransform: { position: [0, 2, 0] }, RigidBody3D: { type: 'Dynamic' } });
world.spawn({ LocalTransform: { position: [-1, 0, 0] }, Parent: { entity: entityString(cart) }, Collider3D: { shape: 'Sphere', radius: 0.3 } });
world.spawn({ LocalTransform: { position: [1, 0, 0] }, Parent: { entity: entityString(cart) }, Collider3D: { shape: 'Sphere', radius: 0.3 } });
```

- The body may have its own collider too. Mass adds up from every shape's density.
- Moving, resizing or adding a child collider reshapes the body in place (same body, same velocity).
- **3D:** one Jolt body. Its own collider (else its first child's) sets friction, restitution
  and the collision filter; contacts and query hits name the **body** entity; `sensor: true`
  children keep their own sensor body.
- **2D:** each child is its own Box2D shape on the parent's body, with its own material,
  filter and sensor flag; contacts and query hits name the **child** entity.

## Queries (one batch call per system per step)

```ts
import { query3d, raycast3d, overlapSphere3d, overlapCapsule3d, overlapContacts3d, closestPoint3d,
         query2d, raycast2d, overlapCircle2d, closestPoint2d } from '@gameengine/runtime';

raycast3d([{ from, to, mask, exclude: self }]);               // closest hit or null per ray
overlapSphere3d([{ center, radius }]);                         // entity ids, sorted
overlapContacts3d([{ type: 'overlapBox', center, size }]);     // per body: { entity, point, normal, depth }, sorted
closestPoint3d([{ entity, point, maxDistance: 10 }]);          // Collider.ClosestPoint: { point, distance, inside } | null
closestPoint2d([{ entity, point }]);
```

- `normal` moves the query shape out of the body by `depth` (Unity's `ComputePenetration`);
  `point` is the body's deepest point in the query shape.
- `closestPoint` returns the point itself (`inside: true`) inside the body, null without a body
  or when nothing is within `maxDistance` (default 1000). A 3D child collider answers for its
  whole body (unlike Unity's `Collider.ClosestPoint`, which is per collider: to ask about one
  shape alone, give it its own body); a 2D body answers for all its shapes.
- Limits: 4096 queries per call, 4096 bodies per overlap, coordinates within ±1e9. Bad input
  (NaN, a negative radius, an unknown id string) throws.
- Queries see the world as of the last physics step (bodies spawned this step are not in it yet).

## Cost

Sync cost follows what moves. A body whose rows did not change since the last step is not
re-read, a sleeping body is not read back, and a pose already in the ECS is not rewritten.
~800 sleeping kinematic props cost ~0.05 ms per step (release). Keep it that way:

- Don't rewrite the transforms of props that did not move; a write of the same bytes is free,
  a write of new values wakes the sync for that body.
- Start props that should not simulate yet as `Kinematic` (or asleep: `awake: false`) and switch
  them to `Dynamic` when touched.

## Tuning the 3D solver (Unity / PhysX ports)

Jolt runs its own defaults until a game opts in. Both types below are opt-in: without them (or at
their defaults) nothing changes and nothing extra is hashed.

```ts
ctx.set(Physics3DSolver, {
  velocitySteps: 16, positionSteps: 32,   // Jolt: 10 / 2; Unity's PhysX defaults are lower, games raise them
  frictionCombine: 'Average',             // PhysX's default; Jolt's is 'Geometric' √(a·b)
  boxConvexRadius: 0.01,                  // Box corner rounding (Jolt 0.05); 0 = PhysX's sharp boxes
  contactDetails: true,                   // CollisionDetails3D { a, b, relativeVelocity } after each CollisionStarted3D
});
// Per body (Rigidbody.solverIterations, and a stand-in for maxDepenetrationVelocity):
ctx.commands.spawn({ /* … */ RigidBody3DSolver: { velocitySteps: 30, maxBounceSpeed: 2.5 } });
```

- **Stacks that don't fall like Unity's:** sharp boxes first. Jolt's rounded corners let a hit box
  slide off the one below instead of shoving it; `boxConvexRadius` 0–0.02 plus more iterations made
  a ported tower-toppling game's ice stacks fall as in Unity, iterations alone did almost nothing. Changing it
  rebuilds every box once.
- **Friction:** with `'Average'`, use Unity's material values as they are (ice 0.05 on 0.5 = 0.275).
- **Pieces that stop dead on landing:** PhysX pushes sunk bodies out with speed (up to
  `maxDepenetrationVelocity`); Jolt stops them before they sink, so nothing hops. Give the piece some
  `restitution` (0.1 bounces a 22 m/s landing at ~2 m/s), or restitution 1 with
  `RigidBody3DSolver.maxBounceSpeed` for a bounce of min(approach speed, cap).
- `relativeVelocity` is a's velocity minus b's at the contact point; check the sign against the
  Unity code you port. Jolt reports no impulse at contact start.
- The sim steps at 30, 60 or 120 Hz only: Unity's 0.016 s fixed step is not available; expect a
  frame of timing difference here and there.
- Cost: more iterations and sharp boxes cost solver time (about +10–45 % on a stack-heavy level on
  desktop). Measure on `phone-low` before shipping them.

## Stacking and carried bodies

- **Fast impacts between dynamic bodies push through and resolve sideways**: a 1×1 crate dropped from 7.5
  units (about 16 m/s at impact) onto a resting one lands beside it instead of on top. `bullet: true` on
  both does not help. Spawn falling bodies close above where they land, or cap their fall speed in a system,
  so a stack builds.
- **A kinematic platform carries a body by friction**: when it reverses or starts sharply (acceleration above
  about friction × gravity) the cargo slides off. Ease its motion at the ends (e.g. `-range * cos(t)`) and
  give the cargo friction.
- In tests, check outcomes with tolerances (at rest above the floor, not overlapping), never exact positions.

## Testing

```ts
worldTest('the crate lands on the ramp', async ({ world, step }) => {
  const crate = world.spawn({ LocalTransform: { position: [0, 5, 0] }, RigidBody3D: {}, Collider3D: {} });
  await step(120);
  expect(world.get(crate, LocalTransform).position[1]).toBeLessThan(1);
});
```

Run on both engines: `gameengine test <project> --js both`.

## Check it

A test proves the outcome; look at the bodies too when shapes, sizes or joints changed. In a
session (`gameengine run --headless`), `gameengine mode physics` draws the colliders over the
game; `gameengine step 60` then `gameengine screenshot out.png` shows where they settled, and
`gameengine world query RigidBody3D --limit 5` their positions and velocities. `gameengine mode
full` goes back. In the editor the same mode is in the view chip's menu. A collider that does
not line up with its sprite or mesh, or bodies that jitter at rest, show here before any test
fails (skill `work-loop`).
