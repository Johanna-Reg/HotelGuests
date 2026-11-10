/**
 * The inn room in 3D: stone walls, wooden beams and a plank floor, built from boxes in world
 * units (X right, Z towards the camera, Y up). Each upgrade has a ruined and a luxurious mesh.
 */
import type { Chain } from '../../../src/inn/merge-rules.ts';
import { MeshBuilder, type GpuMesh, type Renderer } from './gl.ts';
import { glassTexture, plankTexture, rugTexture, stoneTexture } from './textures.ts';

export const W = 5.2;
export const D = 4.6;
export const H = 2.9;
const FH = 0.42; // front walls, cut away low so the items near them stay in view
const T = 0.3;
export const DOOR: [number, number] = [2.0, 3.0];

const hex = (h: string) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const WOOD = hex('#b8723a');
const WOOD_DARK = hex('#6a4129');
const WHITE = [1, 1, 1];

export interface RoomMeshes {
  stone: { ruined: WebGLTexture; clean: WebGLTexture; mesh: GpuMesh };
  floor: { ruined: WebGLTexture; clean: WebGLTexture; mesh: GpuMesh };
  wood: GpuMesh;
  glass: { ruined: WebGLTexture; clean: WebGLTexture; mesh: GpuMesh };
  parts: Record<Chain, { ruined: GpuMesh[]; lux: GpuMesh[]; center: [number, number, number] }>;
  webs: GpuMesh;
  lampGlow: [number, number, number];
}

function cobwebTexture(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.strokeStyle = 'rgba(235,238,245,0.85)';
  x.lineWidth = 2;
  for (let a = 0; a <= 6; a++) {
    const ang = (a / 6) * (Math.PI / 2);
    x.beginPath();
    x.moveTo(0, 0);
    x.lineTo(Math.cos(ang) * 128, Math.sin(ang) * 128);
    x.stroke();
  }
  for (let r = 1; r <= 4; r++) {
    const rr = r * 30;
    x.beginPath();
    for (let a = 0; a <= 6; a++) {
      const ang = (a / 6) * (Math.PI / 2);
      if (a === 0) x.moveTo(rr, 0);
      else x.quadraticCurveTo(Math.cos(ang - 0.13) * rr * 0.85, Math.sin(ang - 0.13) * rr * 0.85, Math.cos(ang) * rr, Math.sin(ang) * rr);
    }
    x.stroke();
  }
  return c;
}

export function buildRoom(r: Renderer): RoomMeshes {
  // Walls: inner faces of the back (z = 0) and left (x = 0) walls, outer faces of the low front walls.
  const stone = new MeshBuilder();
  stone.box(-T, 0, -T, W, H, 0, WHITE, 0.5, 'nz');
  stone.box(-T, 0, 0, 0, H, D, WHITE, 0.5, 'nx');
  stone.box(0, 0, D, W + T, FH, D + T, WHITE, 0.5);
  stone.box(W, 0, 0, W + T, FH, DOOR[0], WHITE, 0.5);
  stone.box(W, 0, DOOR[1], W + T, FH, D, WHITE, 0.5);
  // Plinth.
  stone.box(-T, -0.3, -T, W + T, 0, D + T, hex('#55596a'), 0.5, 'py');

  const floor = new MeshBuilder();
  floor.quad([0, 0.001, D], [W, 0.001, D], [W, 0.001, 0], [0, 0.001, 0], [0, 1, 0], [[0, D / 2], [W / 2, D / 2], [W / 2, 0], [0, 0]], WHITE);
  // Threshold through the door.
  floor.quad([W, 0.002, DOOR[1]], [W + T, 0.002, DOOR[1]], [W + T, 0.002, DOOR[0]], [W, 0.002, DOOR[0]], [0, 1, 0], [[0, 0.5], [0.2, 0.5], [0.2, 0], [0, 0]], WHITE);

  const wood = new MeshBuilder();
  const P = 0.24;
  // Posts.
  wood.box(-T - 0.05, -0.3, -T - 0.05, -T + P, H + 0.25, -T + P, WOOD);
  wood.box(W - 0.05, -0.3, -T - 0.05, W + T + 0.05, H + 0.25, -T + P, WOOD);
  wood.box(-T - 0.05, -0.3, D - 0.05, -T + P, H + 0.25, D + T + 0.05, WOOD);
  wood.box(W - 0.06, -0.3, D - 0.06, W + T + 0.06, FH + 0.4, D + T + 0.06, WOOD);
  wood.box(2.45, -0.3, D - 0.04, 2.7, FH + 0.3, D + T + 0.05, WOOD);
  // Top trims and front caps.
  wood.box(-T, H, -T, W + T, H + 0.12, 0.02, WOOD);
  wood.box(-T, H, 0, 0.02, H + 0.12, D + T, WOOD);
  wood.box(-0.02, FH, D - 0.02, W + T + 0.02, FH + 0.1, D + T + 0.02, WOOD);
  wood.box(W - 0.02, FH, -0.02, W + T + 0.02, FH + 0.1, DOOR[0], WOOD);
  wood.box(W - 0.02, FH, DOOR[1], W + T + 0.02, FH + 0.1, D, WOOD);
  // Mid beams on the tall walls.
  wood.box(2.5, 0, -0.08, 2.72, H, 0.04, WOOD);
  wood.box(-0.08, 0, 2.3, 0.04, H, 2.52, WOOD);
  // Skirting.
  wood.box(0, 0, 0, W, 0.14, 0.05, WOOD_DARK);
  wood.box(0, 0, 0, 0.05, 0.14, D, WOOD_DARK);
  // Doorway posts, kept low: a full door frame in the cut-away wall would hide the items behind it.
  wood.box(W - 0.05, -0.3, DOOR[0] - 0.2, W + T + 0.1, FH + 0.4, DOOR[0], WOOD);
  wood.box(W - 0.05, -0.3, DOOR[1], W + T + 0.1, FH + 0.4, DOOR[1] + 0.2, WOOD);
  // Window frames on the left wall.
  for (const z of [1.1, 3.3]) {
    wood.box(0, 1.15, z - 0.42, 0.1, 1.25, z + 0.42, hex('#9ea4ae'));
    wood.box(0, 2.25, z - 0.42, 0.1, 2.35, z + 0.42, hex('#9ea4ae'));
    wood.box(0, 1.15, z - 0.42, 0.1, 2.35, z - 0.34, hex('#9ea4ae'));
    wood.box(0, 1.15, z + 0.34, 0.1, 2.35, z + 0.42, hex('#9ea4ae'));
  }
  // Lanterns outside.
  wood.box(W + T, 1.05, 0.95, W + T + 0.12, 1.3, 1.15, hex('#3a2a1c'));
  wood.box(3.5, 0.95, D + T, 3.7, 1.2, D + T + 0.12, hex('#3a2a1c'));

  const glass = new MeshBuilder();
  for (const z of [1.1, 3.3]) glass.quad([0.03, 1.25, z + 0.34], [0.03, 1.25, z - 0.34], [0.03, 2.25, z - 0.34], [0.03, 2.25, z + 0.34], [1, 0, 0], [[0, 1], [1, 1], [1, 0], [0, 0]], WHITE);

  const parts = {} as RoomMeshes['parts'];
  const lux = (b: MeshBuilder, tex?: WebGLTexture) => r.upload(b, tex);

  // CLEAN: dust piles, rubble and boarded windows vs a rug and curtains.
  {
    const ruin = new MeshBuilder();
    const grey = hex('#8c8a84');
    for (const [x, z, s] of [[2.0, 2.7, 0.35], [4.6, 3.8, 0.3], [1.1, 4.1, 0.28], [3.9, 1.0, 0.25], [2.9, 4.2, 0.22]] as const) {
      ruin.cylinder(x, 0, z, s, 0.1, grey, 8);
      ruin.cylinder(x + 0.05, 0.1, z - 0.03, s * 0.6, 0.08, hex('#a3a09a'), 8);
    }
    for (const [x, z, yaw] of [[3.3, 3.5, 0.6], [1.6, 2.9, -0.4], [4.5, 2.4, 1.2]] as const) ruin.rotBox(x, 0.04, z, 0.7, 0.06, 0.12, yaw, 0, hex('#5a3a24'));
    for (const z of [1.1, 3.3]) {
      ruin.rotBox(0.08, 1.75, z, 0.04, 0.12, 0.95, 0, 0.6, hex('#7a5134'));
      ruin.rotBox(0.09, 1.75, z, 0.04, 0.12, 0.95, 0, -0.6, hex('#7a5134'));
    }
    const rich = new MeshBuilder();
    for (const z of [1.1, 3.3]) {
      rich.box(0.04, 1.1, z - 0.6, 0.16, 2.45, z - 0.42, hex('#7b3fa6'));
      rich.box(0.04, 1.1, z + 0.42, 0.16, 2.45, z + 0.6, hex('#7b3fa6'));
      rich.box(0.02, 2.42, z - 0.65, 0.2, 2.5, z + 0.65, hex('#e8b85a'));
    }
    const rug = new MeshBuilder();
    rug.quad([2.0, 0.012, 4.2], [4.9, 0.012, 4.2], [4.9, 0.012, 1.0], [2.0, 0.012, 1.0], [0, 1, 0], [[0, 1], [1, 1], [1, 0], [0, 0]], WHITE);
    parts.clean = { ruined: [lux(ruin)], lux: [lux(rich), lux(rug, r.texture(rugTexture()))], center: [3.3, 0.3, 2.6] };
  }
  // BED.
  {
    const ruin = new MeshBuilder();
    ruin.rotBox(1.0, 0.12, 1.4, 1.5, 0.18, 2.3, 0, 0.06, hex('#5a3a24'));
    ruin.rotBox(0.95, 0.26, 1.2, 1.2, 0.05, 1.5, 0.15, 0.05, hex('#8d8c87'));
    ruin.rotBox(1.9, 0.35, 2.4, 0.12, 0.9, 0.12, 0, 0.7, hex('#6a4129'));
    ruin.rotBox(0.5, 0.18, 2.55, 0.5, 0.1, 0.3, 0.4, 0, hex('#c8a85a'));
    const bed = new MeshBuilder();
    const frame = hex('#b06a33');
    bed.box(0.15, 0, 0.02, 1.95, 1.35, 0.24, frame);
    bed.box(0.25, 1.35, 0.02, 1.85, 1.5, 0.24, frame);
    bed.box(0.2, 0, 0.24, 1.9, 0.42, 2.7, frame);
    bed.box(0.27, 0.42, 0.28, 1.83, 0.6, 2.62, hex('#f4ecd6'));
    bed.box(0.24, 0.44, 1.2, 1.86, 0.66, 2.68, hex('#9a63c4'));
    bed.box(0.24, 0.44, 1.08, 1.86, 0.68, 1.24, hex('#f4ecd6'));
    bed.box(0.38, 0.6, 0.36, 0.98, 0.8, 0.88, hex('#fffaf0'));
    bed.box(1.12, 0.6, 0.36, 1.72, 0.8, 0.88, hex('#fffaf0'));
    bed.box(0.15, 0, 2.7, 1.95, 0.75, 2.86, frame);
    bed.box(0.24, 0.5, 2.66, 1.86, 0.54, 2.7, hex('#f0c35c'));
    parts.bed = { ruined: [lux(ruin)], lux: [lux(bed)], center: [1.05, 0.6, 1.4] };
  }
  // WARDROBE.
  {
    const crate = hex('#9c7350');
    const ruin = new MeshBuilder();
    ruin.box(3.4, 0, 0.15, 4.15, 0.6, 0.85, crate);
    ruin.box(4.3, 0, 0.1, 4.85, 0.42, 0.62, crate);
    ruin.rotBox(3.75, 0.82, 0.5, 0.55, 0.42, 0.5, 0.3, 0, crate);
    ruin.rotBox(4.95, 0.75, 0.12, 0.14, 1.6, 0.05, 0, -0.25, hex('#8a5e3c'));
    ruin.rotBox(3.2, 0.65, 0.12, 0.14, 1.3, 0.05, 0, 0.3, hex('#7b5536'));
    const ward = new MeshBuilder();
    const body = hex('#6a3a20');
    ward.box(3.35, 0, 0.05, 4.85, 2.25, 0.82, body);
    ward.box(3.28, 2.25, 0.0, 4.92, 2.4, 0.9, hex('#8a4f2c'));
    ward.box(3.45, 0.15, 0.82, 4.07, 2.1, 0.86, hex('#7d4528'));
    ward.box(4.13, 0.15, 0.82, 4.75, 2.1, 0.86, hex('#7d4528'));
    ward.box(4.0, 1.0, 0.86, 4.05, 1.25, 0.9, hex('#f0c35c'));
    ward.box(4.15, 1.0, 0.86, 4.2, 1.25, 0.9, hex('#f0c35c'));
    ward.box(3.38, 0, 0.82, 3.48, 0.12, 0.92, hex('#4a2814'));
    ward.box(4.72, 0, 0.82, 4.82, 0.12, 0.92, hex('#4a2814'));
    parts.wardrobe = { ruined: [lux(ruin)], lux: [lux(ward)], center: [4.1, 1.1, 0.45] };
  }
  // LIGHT: toppled nightstand and dead sconce vs a lit crystal lamp and sconce.
  {
    const ruin = new MeshBuilder();
    ruin.rotBox(2.35, 0.25, 0.75, 0.55, 0.5, 0.6, 0.5, 1.4, hex('#5a3a24'));
    ruin.box(2.6, 1.6, 0.0, 2.68, 1.85, 0.12, hex('#3a2a1c'));
    ruin.cylinder(2.85, 0, 1.1, 0.06, 0.08, hex('#d8d0b8'), 6);
    const lit = new MeshBuilder();
    lit.box(2.05, 0, 0.08, 2.65, 0.65, 0.62, hex('#a8673a'));
    lit.box(2.1, 0.32, 0.62, 2.6, 0.36, 0.64, hex('#6f401f'));
    lit.cylinder(2.35, 0.65, 0.35, 0.1, 0.05, hex('#e9b44c'), 10);
    lit.cylinder(2.35, 0.7, 0.35, 0.03, 0.28, hex('#6b4a2a'), 6);
    const glow = new MeshBuilder();
    glow.cylinder(2.35, 0.95, 0.35, 0.16, 0.22, hex('#fff2b8'), 12);
    glow.box(2.56, 1.62, 0.0, 2.76, 1.95, 0.16, hex('#ffe39a'));
    parts.light = { ruined: [lux(ruin)], lux: [lux(lit), lux(glow)], center: [2.35, 0.9, 0.4] };
  }

  // Cobwebs: one stretched across the back corner, two flat on the walls (texture fans from uv 0,0).
  const webs = new MeshBuilder();
  webs.quad([0.04, H, 0.04], [0.04, H - 1.0, 0.04], [0.04, H - 0.6, 0.95], [0.04, H, 1.0], [1, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]], WHITE);
  webs.quad([0.04, H, 0.04], [0.95, H, 0.04], [0.95, H - 0.6, 0.04], [0.04, H - 1.0, 0.04], [1, 0, 1], [[0, 0], [0, 1], [1, 1], [1, 0]], WHITE);
  webs.quad([W - 0.05, H, 0.02], [W - 0.05, H - 0.8, 0.02], [W - 0.85, H - 0.5, 0.02], [W - 0.85, H, 0.02], [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]], WHITE);
  webs.quad([0.02, H, D - 0.05], [0.02, H, D - 0.85], [0.02, H - 0.5, D - 0.85], [0.02, H - 0.8, D - 0.05], [1, 0, 0], [[0, 0], [0, 1], [1, 1], [1, 0]], WHITE);

  return {
    stone: { ruined: r.texture(stoneTexture('#73767c', 1, 11), true), clean: r.texture(stoneTexture('#8a8f99', 0, 11), true), mesh: r.upload(stone) },
    floor: { ruined: r.texture(plankTexture(false), true), clean: r.texture(plankTexture(true), true), mesh: r.upload(floor) },
    wood: r.upload(wood),
    glass: { ruined: r.texture(glassTexture(false)), clean: r.texture(glassTexture(true)), mesh: r.upload(glass) },
    parts,
    webs: r.upload(webs, r.texture(cobwebTexture())),
    lampGlow: [2.35, 1.1, 0.5],
  };
}

/** Floor spots for the 14 board cells (startBoard order), in world units. */
export const SPOTS: [number, number][] = [
  [2.65, 1.5], [3.65, 1.5], [4.6, 1.5],
  [2.65, 2.5], [3.65, 2.5], [4.6, 2.5],
  [2.65, 3.5], [3.65, 3.5], [4.6, 3.5],
  [0.6, 3.55], [1.6, 3.55],
  [1.15, 4.3], [2.15, 4.35], [3.15, 4.35],
];
