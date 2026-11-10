---
name: navigation-3d
version: 1.0.3
tier: optional
description: 3D pathfinding for ground characters — buildNavMesh from static colliders, findPath3D/findPaths3D (batched, budgeted), nearestWalkable, navAscii to see the field, separate() for crowds. Use for NPCs, enemies, companions, click-to-move or anything that walks around 3D obstacles (2D grids are tilemaps-nav).
---

# 3D navigation

**Covers:** Pathfinding for ground characters in 3D in Game Engine — buildNavMesh from static colliders, findPath3D / findPaths3D (batched, budgeted), nearestWalkable, navAscii to see the field, and separate() for crowds. Use for NPCs, enemies, companions, click-to-move or anything that walks around 3D obstacles. (2D grids: tilemaps-nav.)

The walkable field is built from the scene's **static 3D colliders** (no `RigidBody3D`, or a
`Static` one; sensors ignored). Boxes and `builtin:cube` meshes are exact; spheres, capsules
and cylinders count as their bounding prism (conservative). Other mesh colliders are
reported as `skipped` — give walkable geometry box colliders.

```ts
import { buildNavMesh, findPath3D, nearestWalkable, navAscii, separate } from '@gameengine/runtime';

// once, after the level is in the world (a system that runs when a flag is unset, or a test)
const info = buildNavMesh({ cellSize: 0.25, agentRadius: 0.4, agentHeight: 1.8, maxClimb: 0.35, maxSlope: 40 });
// info.skipped > 0 → some colliders were not understood

const path = findPath3D(npcPos, targetPos);   // [[x, y, z], …] or null; start/end snap to the field
const spot = nearestWalkable(clickPos);       // where a click on a wall should send you

// Many agents: one host call, a budget per query, a reason when there is no path.
const results = findPaths3D(agents.map((a) => ({ from: a.pos, to: a.goal })), { maxExpansions: 2000 });
// results[i] = { path, error: null | 'noStart' | 'noGoal' | 'unreachable' | 'budget' }
```

## How it is fast

Walkable cells merge into large rectangles (`info.rects`, usually far fewer than
`info.nodes`); a path searches portal crossings between rectangles, then a funnel pulls it
tight. A path across a 120 m level with 184k cells takes about 2 ms (release) against 44 ms
for cell-by-cell A*, and is on average as short (worst case in the tests: +19%).

- **Budget** with `maxExpansions` when paths are requested every frame; on `'budget'`, keep the
  old path and ask again next frame or with a nearer goal.
- **Batch** all agents that re-path this frame into one `findPaths3D` call.
- **Re-path rarely:** when the goal moves more than a cell or the agent is off its path, not
  every step.
- Corners sit on cell borders beside obstacles; `agentRadius` erosion is what keeps agents off
  walls, so give it the real radius.

- **Rebuild** after static geometry changes (doors that become walls, streamed cells):
  `buildNavMesh` again. Several agent sizes → several fields with `name`.
- **Follow a path** with a `CharacterController3D` or by moving `LocalTransform` toward the next
  waypoint; drop waypoints as you reach them; re-path when the target moves a cell or more.
- **Crowds:** feed desired velocities to `separate(agents, radius)` before moving; it is
  deterministic (index order), fine for tens of agents.
- Paths are deterministic (fixed portal order, ties broken by id, IEEE-exact arithmetic), so
  sim systems may use them. Ground agents only: flying/swimming agents are not supported.

## See it

```ts
console.log(navAscii('default', [{ pos: npc, char: 'N' }, { pos: goal, char: 'G' }]));
```

`#` blocked, `.` walkable, digits for stacked floors. Put the map in a failing assertion when a
path is not what you expect — it shows the obstacle or the gap at once.

## Test

```ts
worldTest('guards reach the gate', async ({ step }) => {
  await step(1);
  buildNavMesh({ cellSize: 0.5 });
  const p = findPath3D(guardStart, gate)!;
  for (const w of p) expect(nearestWalkable(w, 'default', 1)).not.toBe(null); // corners touch walkable ground
});
```

Sample: `samples/crate-yard/tests/nav.test.ts`.

Then check the agents in motion, not only the path: in a session (`gameengine run --headless`),
`gameengine step 300` and `gameengine screenshot out.png` show whether they reached the goal or
piled up at a doorway, and `gameengine mode physics` shows the colliders the mesh was built from.
Assert arrival in a `worldTest` too (each agent's `LocalTransform` within a metre of the goal
after the steps the walk takes), on `--js both`.
