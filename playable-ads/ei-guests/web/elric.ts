/**
 * Elric: the game's skinned model (Elric.glb) posed from clips the engine evaluated
 * (web/elric-anim.json, baked by tools/bake-elric.mjs), skinned on the GPU.
 */
import { readGlb } from '@gameengine/playable';
import { m4, type Renderer, type SkinnedGpu } from './gl.ts';
import anim from './elric-anim.json';

interface Clip { fps: number; length: number; loop: boolean; frames: { r: number[]; h: number[] }[] }
const CLIPS = (anim as { clips: Record<string, Clip> }).clips;
export type ClipName = 'idle' | 'walk' | 'run' | 'cast';

export function clipSeconds(name: ClipName): number {
  const c = CLIPS[name]!;
  return c.length / c.fps;
}

export interface ElricModel {
  gpu: SkinnedGpu;
  parent: number[];
  local: number[][]; // each joint's rest translation in its parent's frame
  ibm: Float32Array;
  rootScale: number; // engine hips metres → GLB model units
}

export async function loadElric(r: Renderer, bytes: Uint8Array): Promise<ElricModel> {
  const glb = readGlb(bytes);
  const g = glb.json as unknown as {
    nodes: { name?: string; children?: number[]; translation?: number[] }[];
    skins: { joints: number[]; inverseBindMatrices: number }[];
    meshes: { primitives: { attributes: Record<string, number>; indices?: number }[] }[];
    images?: { bufferView: number; mimeType: string }[];
  };
  const gl = r.gl;
  const skin = g.skins[0]!;
  const nodeToJoint = new Map(skin.joints.map((n, i) => [n, i]));
  const parentNode: Record<number, number> = {};
  g.nodes.forEach((n, i) => n.children?.forEach((c) => (parentNode[c] = i)));
  const parent = skin.joints.map((n) => {
    const p = parentNode[n];
    return p !== undefined && nodeToJoint.has(p) ? nodeToJoint.get(p)! : -1;
  });
  const local = skin.joints.map((n) => g.nodes[n]!.translation ?? [0, 0, 0]);
  // MAT4 accessors are outside readGlb's reader: read the floats straight from the buffer view.
  const acc = (g as unknown as { accessors: { bufferView: number; byteOffset?: number; count: number }[] }).accessors[skin.inverseBindMatrices]!;
  const [ibmView] = glb.view(acc.bufferView);
  const ibm = new Float32Array(acc.count * 16);
  for (let i = 0; i < ibm.length; i++) ibm[i] = ibmView.getFloat32((acc.byteOffset ?? 0) + i * 4, true);

  // Texture.
  let tex = r.white;
  const img = g.images?.[0];
  if (img) {
    const [dv, len] = glb.view(img.bufferView);
    const blob = new Blob([new Uint8Array(dv.buffer, dv.byteOffset, len).slice()], { type: img.mimeType });
    const url = URL.createObjectURL(blob);
    const im = new Image();
    im.src = url;
    await im.decode();
    tex = r.texture(im);
    URL.revokeObjectURL(url);
  }

  const buf = (data: number[]) => {
    const b = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    return b;
  };
  const parts: SkinnedGpu['parts'] = [];
  for (const mesh of g.meshes) {
    for (const p of mesh.primitives) {
      const a = p.attributes;
      const pos = glb.read(a['POSITION']!).data;
      const nrm = a['NORMAL'] !== undefined ? glb.read(a['NORMAL']).data : pos.map(() => 0);
      const uv = a['TEXCOORD_0'] !== undefined ? glb.read(a['TEXCOORD_0']).data : new Array((pos.length / 3) * 2).fill(0);
      const joint = glb.read(a['JOINTS_0']!, true).data;
      const weight = glb.read(a['WEIGHTS_0']!).data;
      const idx = p.indices !== undefined ? glb.read(p.indices, true).data : pos.map((_, i) => i).slice(0, pos.length / 3);
      const ibo = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
      parts.push({ pos: buf(pos), nrm: buf(nrm), uv: buf(uv), joint: buf(joint), weight: buf(weight), ibo, count: idx.length, u32: false });
    }
  }
  const rootRestY = 0.0601; // Root_M's height in the GLB's model space at rest
  const rootScale = rootRestY / CLIPS['idle']!.frames[0]!.h[1]!;
  return { gpu: { tex, parts }, parent, local, ibm, rootScale };
}

const nlerp = (a: number[], ai: number, b: number[], bi: number, t: number, out: number[], oi: number) => {
  const d = a[ai]! * b[bi]! + a[ai + 1]! * b[bi + 1]! + a[ai + 2]! * b[bi + 2]! + a[ai + 3]! * b[bi + 3]!;
  const s = d < 0 ? -1 : 1;
  let l = 0;
  for (let k = 0; k < 4; k++) {
    out[oi + k] = a[ai + k]! * (1 - t) + b[bi + k]! * t * s;
    l += out[oi + k]! ** 2;
  }
  l = Math.sqrt(l) || 1;
  for (let k = 0; k < 4; k++) out[oi + k]! /= l;
};

/** The pose of a clip at `time` seconds: joint rotations (model space) and the hips position. */
export function samplePose(name: ClipName, time: number): { r: number[]; h: number[] } {
  const c = CLIPS[name]!;
  const n = c.frames.length;
  let f = time * c.fps;
  if (c.loop) f = ((f % c.length) + c.length) % c.length;
  else f = Math.min(Math.max(f, 0), n - 1);
  const i0 = Math.floor(f);
  const i1 = c.loop ? (i0 + 1) % n : Math.min(i0 + 1, n - 1);
  const t = f - i0;
  const a = c.frames[Math.min(i0, n - 1)]!;
  const b = c.frames[i1]!;
  const r = new Array(a.r.length);
  for (let j = 0; j < a.r.length; j += 4) nlerp(a.r, j, b.r, j, t, r, j);
  return { r, h: a.h.map((v, k) => v + (b.h[k]! - v) * t) };
}

export function blendPose(a: { r: number[]; h: number[] }, b: { r: number[]; h: number[] }, t: number) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const r = new Array(a.r.length);
  for (let j = 0; j < a.r.length; j += 4) nlerp(a.r, j, b.r, j, t, r, j);
  return { r, h: a.h.map((v, k) => v + (b.h[k]! - v) * t) };
}

/** Bone matrices (joint world × inverse bind) for a pose, ready for `u_bones`. */
export function boneMatrices(m: ElricModel, pose: { r: number[]; h: number[] }, out = new Float32Array(16 * 21)): Float32Array {
  const n = m.parent.length;
  const world: Float32Array[] = [];
  const S = 0.01; // the rig group's scale in the GLB
  for (let j = 0; j < n; j++) {
    const q = pose.r.slice(j * 4, j * 4 + 4);
    let t: number[];
    const p = m.parent[j]!;
    if (p < 0) t = [pose.h[0]! * m.rootScale, pose.h[1]! * m.rootScale, pose.h[2]! * m.rootScale];
    else {
      const pw = world[p]!;
      const l = m.local[j]!;
      t = m4.apply(pw, l).slice(0, 3);
    }
    world[j] = m4.fromQuat(q, S, t);
  }
  for (let j = 0; j < n; j++) out.set(m4.mul(world[j]!, m.ibm.subarray(j * 16, j * 16 + 16)), j * 16);
  return out;
}
