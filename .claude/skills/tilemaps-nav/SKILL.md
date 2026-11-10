---
name: tilemaps-nav
version: 1.1.3
tier: optional
description: Tile layers and grid pathfinding in Game Engine — *.tilemap.json levels, the Tilemap component and editor panel, NavGrid.fromTilemap, findPath and smoothPath (sim-safe, integer costs). Use for levels made of tiles, mazes, grid boards, or anything that walks around walls on a 2D grid (3D obstacles are navigation-3d).
---

# Tilemaps and navigation

**One source of truth.** A level is `assets/<dir>/<name>.tilemap.json`
(`{ "columns", "rows", "tiles": [...] }`, row 0 at the top, `-1` empty). The `Tilemap`
component draws it; navigation reads the same file, so what you see is what the sim walks.

**Edit it** in the editor's Tilemap panel (pick a layer, click or drag to paint, Enter/Space
from the keyboard) or as JSON. Both save the same file; a running session picks it up at once.
A new tilemap file needs its `.gmeta`: write it with `gameengine cmd asset.setText` (it writes a new file under `assets/` with its sidecar) or run `gameengine cook` once after adding files, and commit the `.gmeta`; until then `validate` fails with `E_ASSET: no .gmeta sidecar`. The `Tilemap` component's
`sortingLayer` defaults to `Background`, which a new project's `render.sortingLayers` (`["Default"]`) lacks:
add the layer there or set `sortingLayer` to one the project declares.

**Walk it** from any system (sim-safe: integer costs, fixed neighbour order):

```ts
import { NavGrid, findPath, smoothPath } from '@gameengine/runtime';

const isFloor = (t: number) => t === 0 || t === 2; // pure: tile index in, walkable out
const grid = () => NavGrid.fromTilemap('maze/level1.tilemap.json', isFloor, { origin: [-5.5, -7.5] });

const g = grid();                                  // once per system run, then reuse it
const path = findPath(g, g.cellOf(from), g.cellOf(to)); // null when unreachable
const waypoints = smoothPath(g, path ?? []).map((c) => g.centerOf(c));
```

- `origin` is the world position of cell (0, 0)'s lower-left corner — the Tilemap entity's
  position. Cells are `[x, y]` with `y` up.
- Call `fromTilemap` once per system run: it re-reads only when the file changed, and each call
  returns a fresh grid (a host call plus a copy), so hoist it out of per-entity loops.
- A cooked game reads tilemaps into memory at start with the data assets (up to 4 MB together);
  past that, list each level's `*.tilemap.json` in its asset group, or `fromTilemap` reads storage
  mid-frame (a logged hitch that `gameengine check` reports; skill `asset-memory`, ADR 0089).
- Dynamic blockers: every `fromTilemap` grid is your own, so `setWalkable` and `cost` edits never
  leak into other callers or the next run; weights go in `cost` (0–255, a straight step is 10).
- `lineOfSight` is a full supercover: every cell the segment touches must be walkable, and a
  segment through an exact corner needs both cells beside that corner.
- `findPath(..., { diagonal: false })` for 4-way movement; `maxNodes` caps the search.

**Test it** with `worldTest`: step, then assert every position is `grid.isWalkable` and the
agent arrives, on `--js both`. See `samples/tile-maze`.

**Check it** after editing a map or the walkable rule: `gameengine screenshot out.png` in a
session shows the layer as drawn (a tile index off by one shows at once), and a test that walks
the agent from start to goal on the edited level catches a wall that closed the only route.
`gameengine check` reports a tilemap or atlas that loads mid-frame.
