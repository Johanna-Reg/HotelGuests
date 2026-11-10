/** Grid pathfinding on the room floor so Elric walks around the furniture, not through it. */
import { D, W } from './room3d.ts';

const CELL = 0.2;
const NX = Math.ceil(W / CELL);
const NZ = Math.ceil(D / CELL);
const MARGIN = 0.3; // Elric's radius

/** Furniture footprints (x0, z0, x1, z1) in world units. */
const BLOCKS: [number, number, number, number][] = [
  [0.1, 0, 2.0, 2.95], // bed
  [1.95, 0, 2.75, 1.15], // nightstand (upright or toppled)
  [3.2, 0, 5.0, 0.95], // wardrobe or crates
];

const free = new Uint8Array(NX * NZ);
for (let iz = 0; iz < NZ; iz++)
  for (let ix = 0; ix < NX; ix++) {
    const x = (ix + 0.5) * CELL;
    const z = (iz + 0.5) * CELL;
    const inRoom = x > MARGIN && x < W - MARGIN && z > MARGIN && z < D - MARGIN;
    const hit = BLOCKS.some(([x0, z0, x1, z1]) => x > x0 - MARGIN && x < x1 + MARGIN && z > z0 - MARGIN && z < z1 + MARGIN);
    free[iz * NX + ix] = inRoom && !hit ? 1 : 0;
  }

const cellOf = (x: number, z: number): [number, number] => [
  Math.min(NX - 1, Math.max(0, Math.floor(x / CELL))),
  Math.min(NZ - 1, Math.max(0, Math.floor(z / CELL))),
];

export function walkable(x: number, z: number): boolean {
  const [ix, iz] = cellOf(x, z);
  return free[iz * NX + ix] === 1;
}

/** The nearest walkable point to (x, z). */
export function nearestWalkable(x: number, z: number): [number, number] {
  if (walkable(x, z)) return [x, z];
  let best: [number, number] = [x, z];
  let bestD = Infinity;
  for (let i = 0; i < free.length; i++) {
    if (!free[i]) continue;
    const cx = ((i % NX) + 0.5) * CELL;
    const cz = (Math.floor(i / NX) + 0.5) * CELL;
    const d = (cx - x) ** 2 + (cz - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = [cx, cz];
    }
  }
  return best;
}

function lineFree(ax: number, az: number, bx: number, bz: number): boolean {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL * 0.5));
  for (let i = 0; i <= n; i++) {
    const t = i / Math.max(1, n);
    if (!walkable(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
  }
  return true;
}

/** Waypoints from a to b (b included, a not), shortened where the line is clear. */
export function findPath(ax: number, az: number, bx: number, bz: number): [number, number][] {
  [bx, bz] = nearestWalkable(bx, bz);
  if (lineFree(ax, az, bx, bz)) return [[bx, bz]];
  const [sx, sz] = cellOf(...nearestWalkable(ax, az));
  const [tx, tz] = cellOf(bx, bz);
  const start = sz * NX + sx;
  const goal = tz * NX + tx;
  const cost = new Float32Array(NX * NZ).fill(Infinity);
  const from = new Int32Array(NX * NZ).fill(-1);
  const open: number[] = [start];
  cost[start] = 0;
  const h = (i: number) => Math.hypot((i % NX) - tx, Math.floor(i / NX) - tz);
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (cost[open[k]!]! + h(open[k]!) < cost[open[bi]!]! + h(open[bi]!)) bi = k;
    const cur = open.splice(bi, 1)[0]!;
    if (cur === goal) break;
    const cx = cur % NX;
    const cz = Math.floor(cur / NX);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= NX || nz >= NZ) continue;
        const ni = nz * NX + nx;
        if (!free[ni]) continue;
        if (dx && dz && (!free[cz * NX + nx] || !free[nz * NX + cx])) continue;
        const c = cost[cur]! + (dx && dz ? 1.414 : 1);
        if (c < cost[ni]!) {
          if (cost[ni] === Infinity) open.push(ni);
          cost[ni] = c;
          from[ni] = cur;
        }
      }
  }
  if (from[goal] === -1 && goal !== start) return [[bx, bz]];
  const cells: [number, number][] = [];
  for (let i = goal; i !== start && i !== -1; i = from[i]!) cells.push([((i % NX) + 0.5) * CELL, (Math.floor(i / NX) + 0.5) * CELL]);
  cells.reverse();
  cells[cells.length - 1] = [bx, bz];
  // String-pull: keep only the corners the straight line cannot skip.
  const out: [number, number][] = [];
  let px = ax;
  let pz = az;
  for (let i = 0; i < cells.length; i++) {
    const next = cells[i + 1];
    if (next && lineFree(px, pz, next[0], next[1])) continue;
    out.push(cells[i]!);
    [px, pz] = cells[i]!;
  }
  return out;
}
