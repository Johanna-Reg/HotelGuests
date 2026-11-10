/** Isometric projection for the room: x runs to the lower right, y to the lower left, z up. */
export const C30 = Math.cos(Math.PI / 6);

export interface Iso {
  ox: number;
  oy: number;
  s: number;
}

export function project(iso: Iso, x: number, y: number, z = 0): [number, number] {
  return [iso.ox + (x - y) * C30 * iso.s, iso.oy + (x + y) * 0.5 * iso.s - z * iso.s];
}

type Ctx = CanvasRenderingContext2D;

/** Draw in the wall plane y = y0 (u along x, v up z). */
export function planeX(c: Ctx, iso: Iso, y0: number, x0 = 0) {
  const [ox, oy] = project(iso, x0, y0, 0);
  c.transform(C30 * iso.s, 0.5 * iso.s, 0, -iso.s, ox, oy);
}

/** Draw in the wall plane x = x0 (u along y, v up z). */
export function planeY(c: Ctx, iso: Iso, x0: number, y0 = 0) {
  const [ox, oy] = project(iso, x0, y0, 0);
  c.transform(-C30 * iso.s, 0.5 * iso.s, 0, -iso.s, ox, oy);
}

/** Draw in the horizontal plane at height z (u along x, v along y). */
export function planeZ(c: Ctx, iso: Iso, z = 0) {
  const [ox, oy] = project(iso, 0, 0, z);
  c.transform(C30 * iso.s, 0.5 * iso.s, -C30 * iso.s, 0.5 * iso.s, ox, oy);
}

export function poly(c: Ctx, iso: Iso, pts: [number, number, number][], fill: string, stroke?: string, lw = 2) {
  c.beginPath();
  pts.forEach(([x, y, z], i) => {
    const [sx, sy] = project(iso, x, y, z);
    if (i === 0) c.moveTo(sx, sy);
    else c.lineTo(sx, sy);
  });
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.lineJoin = 'round';
    c.stroke();
  }
}

export interface BoxColors {
  top: string;
  left: string; // the +y face, facing the lower left
  right: string; // the +x face, facing the lower right
  line?: string;
}

/** A box from (x0,y0,z0) to (x1,y1,z1); draws the three faces the camera sees. */
export function box(c: Ctx, iso: Iso, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: BoxColors) {
  const line = col.line;
  poly(c, iso, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], col.left, line);
  poly(c, iso, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], col.right, line);
  poly(c, iso, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], col.top, line);
}

/** Seeded random for art that looks the same every load. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}
