/**
 * "Guests are arriving soon!" — a 3D inn room; drag identical items together on the floor and
 * Elric runs over and merges them with a spell. Each finished item transforms part of the room;
 * prepare the whole suite before the timer runs out. Rules live in the game's
 * src/inn/merge-rules.ts; this file is presentation on the shared runtime.
 */
import { fileBytes } from '@gameengine/playable';
import { ad, files } from 'playable:manifest';
import { adEvent, createStage, EASES, showEndCard, storeUrlFor, whenReady } from '../../_shared/runtime/index.ts';
import {
  CHAINS, ITEM_NAMES, MAX_TIER, ROUND_SECONDS,
  drop, hintPair, roomReady, startBoard, type Board, type Chain, type Item,
} from '../../../src/inn/merge-rules.ts';
import { blendPose, boneMatrices, clipSeconds, loadElric, samplePose, type ClipName } from './elric.ts';
import { m4, MeshBuilder, Renderer, type GpuMesh, type Lights } from './gl.ts';
import { roundRect } from './iso.ts';
import { ICON, itemIcon } from './items.ts';
import { buildRoom, D, SPOTS, W } from './room3d.ts';
import { findPath, walkable } from './path.ts';
import { createSfx } from './sfx.ts';

const SW = 1080;
const SH = 1920;
const FONT = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';
const ITEM_SIZE = 1.12;
const ELRIC_SCALE = 15;
const RUN_SPEED = 3.0;
const CAST_HIT = 0.45; // seconds into the cast clip when the merge happens

type Ctx = CanvasRenderingContext2D;
type V3 = [number, number, number];

function text(c: Ctx, s: string, x: number, y: number, size: number, fill: string, stroke = '#3a1d0c') {
  c.font = `900 ${size}px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.lineWidth = Math.max(4, size * 0.16);
  c.strokeStyle = stroke;
  c.strokeText(s, x, y);
  c.fillStyle = fill;
  c.fillText(s, x, y);
}

function background(k: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.round(SW * k);
  cv.height = Math.round(SH * k);
  const c = cv.getContext('2d')!;
  c.scale(k, k);
  const g = c.createLinearGradient(0, 0, 0, SH);
  g.addColorStop(0, '#1d2547');
  g.addColorStop(0.55, '#2c3563');
  g.addColorStop(1, '#1a1f3c');
  c.fillStyle = g;
  c.fillRect(0, 0, SW, SH);
  c.strokeStyle = 'rgba(10,14,40,0.45)';
  c.lineWidth = 3;
  for (let b = -SW; b < SH + SW; b += 110) {
    c.beginPath();
    c.moveTo(0, b);
    c.lineTo(SW, b + SW * 0.62);
    c.moveTo(0, b);
    c.lineTo(SW, b - SW * 0.62);
    c.stroke();
  }
  return cv;
}

function hudSign(k: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.round(SW * k);
  cv.height = Math.round(240 * k);
  const c = cv.getContext('2d')!;
  c.scale(k, k);
  c.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(c, 46, 28, SW - 92, 196, 40);
  c.fill();
  c.fillStyle = '#7b4522';
  roundRect(c, 40, 18, SW - 80, 196, 40);
  c.fill();
  c.fillStyle = '#a7652f';
  roundRect(c, 52, 28, SW - 104, 172, 32);
  c.fill();
  c.fillStyle = '#5b3417';
  roundRect(c, 96, 104, 340, 82, 40);
  c.fill();
  for (let n = 0; n < CHAINS.length; n++) {
    roundRect(c, 520 + n * 122, 58, 108, 108, 26);
    c.fill();
  }
  return cv;
}

function radialTexture(inner: string, outer: string, ring = false): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  if (ring) {
    c.strokeStyle = inner;
    c.lineWidth = 9;
    c.beginPath();
    c.arc(64, 64, 52, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = outer;
    c.beginPath();
    c.arc(64, 64, 48, 0, Math.PI * 2);
    c.fill();
    return cv;
  }
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  return cv;
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; star: boolean }
interface Job { from: number; to: number; a: Item; made: Item; upgrade?: Chain }
interface Flyer { item: Item; from: V3; to: V3; t: number; chain: Chain }
interface Grow { chain: Chain; t: number }

async function start() {
  const stage = createStage(SW, SH, '#141a33', { maxDpr: 2, maxFps: 60 });
  const c = stage.ctx;
  const k = Math.max(1, Math.min(2, Math.min(stage.canvas.width / SW, stage.canvas.height / SH)));
  const sfx = createSfx();
  const bg = background(1);
  const sign = hudSign(k);

  const r = new Renderer(Math.round(SW * k), Math.round(SH * k));
  const room = buildRoom(r);
  const elric = await loadElric(r, fileBytes(files['elric']!));

  // Billboards and decals.
  const quad = new MeshBuilder();
  quad.quad([-0.5, 0, 0], [0.5, 0, 0], [0.5, 1, 0], [-0.5, 1, 0], [0, 0, 1], [[0, 1], [1, 1], [1, 0], [0, 0]], [1, 1, 1]);
  const decal = new MeshBuilder();
  decal.quad([-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 0, -0.5], [-0.5, 0, -0.5], [0, 1, 0], [[0, 1], [1, 1], [1, 0], [0, 0]], [1, 1, 1]);
  const quadMesh = r.upload(quad);
  const ringMesh = r.upload(decal, r.texture(radialTexture('rgba(255,236,190,0.55)', 'rgba(255,236,190,0.12)', true)));
  const shadowMesh = r.upload(decal, r.texture(radialTexture('rgba(10,6,20,0.55)', 'rgba(10,6,20,0)')));
  const glowMesh = r.upload(decal, r.texture(radialTexture('rgba(255,220,140,0.9)', 'rgba(255,220,140,0)')));
  const itemTex = new Map<string, WebGLTexture>();
  const texFor = (it: Item) => {
    const key = `${it.chain}:${it.tier}`;
    let t = itemTex.get(key);
    if (!t) itemTex.set(key, (t = r.texture(itemIcon(it, 1.5))));
    return t;
  };
  const billboard = (tex: WebGLTexture): GpuMesh => ({ ...quadMesh, tex });

  // Camera: orthographic, isometric-style, looking from the front-right.
  const view = (() => {
    const dir = [1, 1.25, 1];
    const l = Math.hypot(dir[0]!, dir[1]!, dir[2]!);
    const fwd = dir.map((v) => v / l);
    const at = [W / 2 - 0.15, 0.6, D / 2 - 0.1];
    return { fwd, m: m4.lookAt(at.map((v, i) => v + fwd[i]! * 30), at, [0, 1, 0]) };
  })();
  // A little tighter than the whole room: the outer posts may crop, the floor never does.
  const hw = 3.15;
  const hh = (hw * SH) / SW;
  const shiftY = 0.3;
  r.vp = m4.mul(m4.ortho(-hw, hw, -hh + shiftY, hh + shiftY, 0.1, 80), view.m);
  const right = [view.m[0]!, view.m[4]!, view.m[8]!];
  const up = [view.m[1]!, view.m[5]!, view.m[9]!];
  const toScreen = (p: number[]): [number, number] => {
    const q = m4.apply(r.vp, p);
    return [(q[0] * 0.5 + 0.5) * SW, (1 - (q[1] * 0.5 + 0.5)) * SH];
  };
  const floorAt = (sx: number, sy: number, h = 0): [number, number] => {
    const p0 = toScreen([0, h, 0]);
    const px = toScreen([1, h, 0]);
    const pz = toScreen([0, h, 1]);
    const a = px[0] - p0[0], b = pz[0] - p0[0], cc = px[1] - p0[1], d = pz[1] - p0[1];
    const det = a * d - b * cc;
    const ex = sx - p0[0], ey = sy - p0[1];
    return [(ex * d - b * ey) / det, (a * ey - cc * ex) / det];
  };
  const billboardMatrix = (x: number, y: number, z: number, s: number, sy = s) => {
    const m = m4.identity();
    m[0] = right[0]! * s; m[1] = right[1]! * s; m[2] = right[2]! * s;
    m[4] = up[0]! * sy; m[5] = up[1]! * sy; m[6] = up[2]! * sy;
    m[8] = view.fwd[0]!; m[9] = view.fwd[1]!; m[10] = view.fwd[2]!;
    m[12] = x; m[13] = y; m[14] = z;
    return m;
  };

  // Game state.
  let board: Board = startBoard();
  const done = new Set<Chain>();
  let clock = 0;
  let timeLeft = ROUND_SECONDS;
  let started = false;
  let phase: 'play' | 'win' | 'lose' | 'over' = 'play';
  let phaseAt = 0;
  let lastAction = 0;
  let lastTick = Math.ceil(ROUND_SECONDS);
  let drag: { from: number; x: number; z: number; sx: number; sy: number } | null = null;
  let flash = 0;
  let snapshot = '';
  const pops = new Map<number, number>();
  const shakes = new Map<number, number>();
  const locked = new Map<number, Item[]>(); // spots waiting for Elric: the two items he will merge
  const jobs: Job[] = [];
  const flyers: Flyer[] = [];
  const grows: Grow[] = [];
  const particles: Particle[] = [];
  const growOf = (chain: Chain) => grows.find((g) => g.chain === chain);

  // Elric.
  const hero = {
    x: 1.1, z: 3.4, yaw: Math.PI * 0.25,
    clip: 'idle' as ClipName, t: 0,
    prev: null as null | { clip: ClipName; t: number }, blend: 1,
    job: null as Job | null, castT: -1, hit: false,
    path: [] as [number, number][],
  };
  const play = (clip: ClipName) => {
    if (hero.clip === clip) return;
    hero.prev = { clip: hero.clip, t: hero.t };
    hero.blend = 0;
    hero.clip = clip;
    hero.t = 0;
  };

  stage.canvas.setAttribute('role', 'application');
  stage.canvas.setAttribute('aria-label', 'Guests are arriving soon! Drag two identical items together and Elric merges them to prepare the room.');

  const burst = (x: number, y: number, n: number, colors: string[], speed = 420) => {
    for (let p = 0; p < n; p++) {
      const a = (p / n) * Math.PI * 2 + Math.random() * 0.4;
      const v = speed * (0.4 + Math.random() * 0.7);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 140, life: 0, max: 0.5 + Math.random() * 0.5, color: colors[p % colors.length]!, size: 8 + Math.random() * 10, star: true });
    }
  };

  const spotScreen = (i: number, lift = 0.45) => toScreen([SPOTS[i]![0], lift, SPOTS[i]![1]]);
  function spotAt(sx: number, sy: number, radius: number): number {
    let best = -1;
    let bestD = radius * radius;
    for (let i = 0; i < SPOTS.length; i++) {
      const [x, y] = spotScreen(i);
      const d = (sx - x) ** 2 + (sy - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  function attempt(from: number, to: number) {
    const a = board[from];
    const b = board[to];
    const res = drop(board, from, to);
    if (!res || !a) {
      if (to >= 0) shakes.set(to, clock);
      sfx.nope();
      return;
    }
    board = res.board;
    lastAction = clock;
    if (res.kind === 'move') {
      pops.set(to, clock);
      sfx.drop();
      return;
    }
    locked.set(to, [a, b!]);
    jobs.push({ from, to, a, made: res.made!, upgrade: res.upgrade });
    sfx.pick();
  }

  function resolve(job: Job) {
    locked.delete(job.to);
    const [x, y] = spotScreen(job.to);
    burst(x, y, 16, ['#fff3b0', '#ffd25a', '#ffffff', '#c79bff']);
    sfx.merge(job.made.tier);
    if (job.upgrade) {
      const c = room.parts[job.upgrade].center;
      flyers.push({ item: job.made, from: [SPOTS[job.to]![0], 0.4, SPOTS[job.to]![1]], to: c, t: 0, chain: job.upgrade });
    } else pops.set(job.to, clock);
  }

  function upgrade(chain: Chain) {
    done.add(chain);
    grows.push({ chain, t: 0 });
    flash = 1;
    const [x, y] = toScreen(room.parts[chain].center);
    burst(x, y, 28, ['#fff3b0', '#ffd25a', '#c79bff', '#9fe8ff'], 560);
    sfx.upgrade();
    if (roomReady(done) && phase === 'play') {
      phase = 'win';
      phaseAt = clock;
      sfx.win();
    }
  }

  function endCard(won: boolean) {
    phase = 'over';
    showEndCard({
      title: won ? 'Elric prepared a magical suite for the guests!' : 'The guests arrived! Can you help Elric in time?',
      button: ad.cta,
      storeUrl: storeUrlFor(ad.storeUrl),
      image: snapshot || undefined,
    });
  }

  // Input: drag an item onto an identical one (or onto an empty spot to move it).
  const el = stage.canvas;
  el.addEventListener('pointerdown', (e) => {
    if (!started) {
      started = true;
      sfx.unlock();
      adEvent('first-touch');
    }
    if (phase !== 'play' || drag) return;
    const [sx, sy] = stage.toDesign(e.clientX, e.clientY);
    const i = spotAt(sx, sy, 100);
    lastAction = clock;
    if (i < 0 || !board[i] || locked.has(i)) return;
    drag = { from: i, x: SPOTS[i]![0], z: SPOTS[i]![1], sx, sy };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointers cannot be captured.
    }
    sfx.pick();
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const [sx, sy] = stage.toDesign(e.clientX, e.clientY);
    const [x, z] = floorAt(sx, sy + 40, 0.3);
    drag.x = Math.min(W - 0.2, Math.max(0.2, x));
    drag.z = Math.min(D - 0.1, Math.max(0.2, z));
    drag.sx = sx;
    drag.sy = sy;
  });
  const release = (e: PointerEvent, cancelled: boolean) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (cancelled || phase !== 'play') return;
    const [sx, sy] = stage.toDesign(e.clientX, e.clientY);
    const to = spotAt(sx, sy, 120);
    if (to < 0 || to === d.from || locked.has(to)) {
      if (to >= 0 && to !== d.from) shakes.set(to, clock);
      return;
    }
    attempt(d.from, to);
  };
  el.addEventListener('pointerup', (e) => release(e, false));
  el.addEventListener('pointercancel', (e) => release(e, true));

  function updateHero(dt: number) {
    hero.t += dt;
    hero.blend = Math.min(1, hero.blend + dt / 0.18);
    if (!hero.job && jobs.length) {
      hero.job = jobs.shift()!;
      hero.hit = false;
      hero.castT = -1;
      const [tx, tz] = SPOTS[hero.job.to]!;
      // Stand beside the items: in front of them (towards the camera) when there is room, so he
      // is never hidden behind them; otherwise on the side he comes from.
      const l = Math.hypot(hero.x - tx, hero.z - tz) || 1;
      const sides: [number, number][] = [[0.45, 0.45], [0.62, 0], [0, 0.62], [(hero.x - tx) / l * 0.62, (hero.z - tz) / l * 0.62], [-0.62, 0], [0, -0.62]];
      const side = sides.find(([dx, dz]) => walkable(tx + dx, tz + dz)) ?? sides[3]!;
      hero.path = findPath(hero.x, hero.z, tx + side[0], tz + side[1]);
    }
    const job = hero.job;
    if (!job && phase !== 'play' && roomReady(done)) {
      // Celebrate facing the camera, raising the arms again every couple of seconds.
      hero.yaw += (Math.PI * 0.25 - hero.yaw) * Math.min(1, dt * 6);
      if (hero.clip !== 'cast' || hero.t > clipSeconds('cast') + 0.6) {
        hero.clip = 'idle';
        play('cast');
      }
      return;
    }
    if (!job) {
      play('idle');
      return;
    }
    const [sx, sz] = SPOTS[job.to]!;
    if (hero.castT < 0) {
      const [tx, tz] = hero.path[0] ?? [hero.x, hero.z];
      const dx = tx - hero.x;
      const dz = tz - hero.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.05 && hero.path.length > 1) {
        hero.path.shift();
        return;
      }
      if (dist < 0.05) {
        hero.castT = 0;
        play('cast');
        hero.yaw = Math.atan2(sx - hero.x, sz - hero.z);
        return;
      }
      play('run');
      const step = Math.min(dist, RUN_SPEED * dt);
      hero.x += (dx / dist) * step;
      hero.z += (dz / dist) * step;
      const want = Math.atan2(dx, dz);
      let dy = want - hero.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      hero.yaw += dy * Math.min(1, dt * 14);
      return;
    }
    hero.castT += dt;
    const want = Math.atan2(sx - hero.x, sz - hero.z);
    hero.yaw += (want - hero.yaw) * Math.min(1, dt * 10);
    if (!hero.hit && hero.castT >= CAST_HIT) {
      hero.hit = true;
      resolve(job);
    }
    if (hero.castT >= Math.min(clipSeconds('cast'), CAST_HIT + 0.35) && (jobs.length || hero.castT >= clipSeconds('cast'))) {
      hero.job = null;
    }
  }

  function lights(): Lights {
    const lit = done.has('light') ? 1 : 0;
    const g = growOf('light');
    const f = lit ? (g ? Math.min(1, g.t / 0.6) : 1) : 0;
    const cl = done.has('clean') ? 0.08 : 0;
    const mix = (a: number[], b: number[]) => a.map((v, i) => v + (b[i]! - v) * f);
    return {
      dir: [0.45, 1, 0.75],
      dirCol: mix([0.5 + cl, 0.55 + cl, 0.72 + cl], [0.62, 0.6, 0.6]),
      sky: mix([0.36 + cl, 0.4 + cl, 0.58 + cl], [0.5, 0.48, 0.54]),
      ground: mix([0.2, 0.19, 0.26], [0.3, 0.25, 0.24]),
      lamp: room.lampGlow,
      lampCol: [0.75 * f, 0.52 * f, 0.3 * f],
    };
  }

  function partModel(chain: Chain, lux: boolean): { m: Float32Array; show: boolean } {
    const g = growOf(chain);
    const isDone = done.has(chain);
    if (!g) return { m: m4.identity(), show: lux === isDone };
    const [cx, cy, cz] = room.parts[chain].center;
    let s: number;
    if (lux) s = g.t < 0.15 ? 0 : EASES.outBack(Math.min(1, (g.t - 0.15) / 0.5));
    else s = 1 - Math.min(1, g.t / 0.2);
    if (s <= 0.001) return { m: m4.identity(), show: false };
    const m = m4.mul(m4.trs(cx, 0, cz, 0, 1), m4.mul(m4.trs(0, 0, 0, 0, s, s), m4.trs(-cx, 0, -cz, 0, 1)));
    void cy;
    return { m, show: true };
  }

  function render3d() {
    const L = lights();
    const I = m4.identity();
    const w = Math.round(SW * k);
    const h = Math.round(SH * k);
    r.begin(w, h);
    const clean = done.has('clean');
    r.draw({ ...room.floor.mesh, tex: clean ? room.floor.clean : room.floor.ruined }, I, L);
    r.draw({ ...room.stone.mesh, tex: clean ? room.stone.clean : room.stone.ruined }, I, L);
    r.draw(room.wood, I, L);
    r.draw({ ...room.glass.mesh, tex: clean ? room.glass.clean : room.glass.ruined }, I, L, { unlit: 0.6 });
    for (const chain of CHAINS) {
      for (const lux of [false, true]) {
        const { m, show } = partModel(chain, lux);
        if (!show) continue;
        const meshes = lux ? room.parts[chain].lux : room.parts[chain].ruined;
        meshes.forEach((mesh, n) => {
          const glow = chain === 'light' && lux && n === 1;
          r.draw(mesh, m, L, glow ? { unlit: 1, emit: [0.25, 0.2, 0.05] } : {});
        });
      }
    }
    // Elric.
    let pose = samplePose(hero.clip, hero.t);
    if (hero.prev && hero.blend < 1) pose = blendPose(samplePose(hero.prev.clip, hero.prev.t + hero.t), pose, hero.blend);
    r.draw(shadowMesh, m4.trs(hero.x, 0.015, hero.z, 0, 0.9), L, { alpha: 0.9, unlit: 1 });
    r.skinned(elric.gpu, m4.trs(hero.x, 0, hero.z, hero.yaw, ELRIC_SCALE), boneMatrices(elric, pose), L);

    // Transparent things, back to front: cobwebs, floor rings, items.
    if (!clean || growOf('clean')) r.draw(room.webs, I, L, { alpha: clean ? Math.max(0, 1 - (growOf('clean')?.t ?? 1) / 0.3) : 0.9, unlit: 0.4 });
    if (done.has('light')) {
      const pulse = 0.75 + Math.sin(clock * 3) * 0.1;
      r.draw(glowMesh, m4.trs(room.lampGlow[0], 0.02, room.lampGlow[2] + 0.4, 0, 2.6 * pulse), L, { alpha: 0.5, unlit: 1 });
    }
    const draws: { depth: number; fn: () => void }[] = [];
    const depth = (x: number, y: number, z: number) => x * view.fwd[0]! + y * view.fwd[1]! + z * view.fwd[2]!;
    for (let i = 0; i < SPOTS.length; i++) {
      const [x, z] = SPOTS[i]!;
      const item = board[i];
      const showRing = phase === 'play';
      if (showRing) r.draw(ringMesh, m4.trs(x, 0.02, z, 0, 0.82), L, { alpha: item ? 0.9 : 0.45, unlit: 1 });
      const pair = locked.get(i);
      if (pair) {
        // The two items Elric is about to merge, circling each other.
        pair.forEach((it, n) => {
          const a = clock * 6 + n * Math.PI;
          const px = x + Math.cos(a) * 0.18;
          const pz = z + Math.sin(a) * 0.18;
          draws.push({ depth: depth(px, 0.4, pz), fn: () => r.draw(billboard(texFor(it)), billboardMatrix(px, 0.08, pz, ITEM_SIZE * 0.9), L, { alpha: 0.999, unlit: 1 }) });
        });
        continue;
      }
      if (!item || drag?.from === i) continue;
      let s = ITEM_SIZE;
      const popAt = pops.get(i);
      if (popAt !== undefined) {
        const t = (clock - popAt) / 0.35;
        if (t >= 1) pops.delete(i);
        else s *= EASES.outBack(Math.max(0.01, t));
      }
      let ox = 0;
      const shakeAt = shakes.get(i);
      if (shakeAt !== undefined) {
        const t = clock - shakeAt;
        if (t > 0.3) shakes.delete(i);
        else ox = Math.sin(t * 60) * 0.06 * (1 - t / 0.3);
      }
      const bob = Math.sin(clock * 2.4 + i) * 0.03;
      draws.push({ depth: depth(x, 0.4, z), fn: () => r.draw(billboard(texFor(item)), billboardMatrix(x + ox, 0.06 + bob, z - ox, s), L, { alpha: 0.999, unlit: 1 }) });
    }
    if (drag) {
      const item = board[drag.from];
      if (item) {
        const { x, z } = drag;
        r.draw(shadowMesh, m4.trs(x, 0.02, z, 0, 0.7), L, { alpha: 0.7, unlit: 1 });
        draws.push({ depth: depth(x, 3, z) + 50, fn: () => r.draw(billboard(texFor(item)), billboardMatrix(x, 0.35, z, ITEM_SIZE * 1.1), L, { alpha: 0.999, unlit: 1 }) });
      }
    }
    for (const f of flyers) {
      const t = Math.min(1, f.t);
      const e = EASES.inOutQuad(t);
      const mid = [(f.from[0] + f.to[0]) / 2, Math.max(f.from[1], f.to[1]) + 1.8, (f.from[2] + f.to[2]) / 2];
      const p = [0, 1, 2].map((a) => (1 - e) ** 2 * f.from[a]! + 2 * (1 - e) * e * mid[a]! + e * e * f.to[a]!);
      const s = ITEM_SIZE * (t < 0.2 ? EASES.outBack(t / 0.2) * 1.35 : 1.35 - (t - 0.2) * 0.6);
      draws.push({ depth: 100, fn: () => r.draw(billboard(texFor(f.item)), billboardMatrix(p[0]!, p[1]! - s / 2, p[2]!, s), L, { alpha: 0.999, unlit: 1 }) });
    }
    draws.sort((a, b) => a.depth - b.depth).forEach((d) => d.fn());
  }

  function drawHand(x: number, y: number, press: number, alpha: number) {
    c.save();
    c.globalAlpha = alpha;
    c.translate(x + 20, y + 30);
    c.rotate(-0.35);
    c.scale(1 - press * 0.12, 1 - press * 0.12);
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#2b1a10';
    c.lineWidth = 6;
    roundRect(c, -14, -48, 28, 70, 14);
    c.fill();
    c.stroke();
    roundRect(c, -30, 0, 74, 72, 26);
    c.fill();
    c.stroke();
    c.restore();
  }

  function hud() {
    c.drawImage(sign, 0, 0, SW, 240);
    const secs = Math.max(0, Math.ceil(timeLeft));
    const low = started && timeLeft < 10 && phase === 'play';
    text(c, 'GUESTS ARRIVE IN', 266, 68, 36, '#fff4d6');
    const pulse = low ? 1 + Math.sin(clock * 12) * 0.06 : 1;
    c.save();
    c.translate(266, 146);
    c.scale(pulse, pulse);
    c.fillStyle = '#fff4d6';
    c.strokeStyle = '#3a1d0c';
    c.lineWidth = 6;
    c.beginPath();
    c.arc(-112, 0, 26, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(-112, 0);
    c.lineTo(-112, -16);
    c.moveTo(-112, 0);
    c.lineTo(-100, 6);
    c.stroke();
    text(c, `0:${String(secs).padStart(2, '0')}`, 30, 2, 70, low ? '#ff7a6b' : '#ffe27a');
    c.restore();
    CHAINS.forEach((chain, n) => {
      const x = 574 + n * 122;
      const y = 112;
      const isDone = done.has(chain);
      c.globalAlpha = isDone ? 1 : 0.32;
      c.drawImage(itemIcon({ chain, tier: MAX_TIER }, k), x - 56, y - 56, 112, 112);
      c.globalAlpha = 1;
      if (isDone) {
        c.fillStyle = '#5bd45b';
        c.strokeStyle = '#1d5a1d';
        c.lineWidth = 4;
        c.beginPath();
        c.arc(x + 38, y + 38, 18, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.strokeStyle = '#fff';
        c.lineWidth = 6;
        c.beginPath();
        c.moveTo(x + 29, y + 38);
        c.lineTo(x + 36, y + 45);
        c.lineTo(x + 48, y + 30);
        c.stroke();
      }
    });
  }

  function banner(title: string, sub: string, t: number, color: string, y: number) {
    const e = EASES.outBack(Math.min(1, t / 0.45));
    c.save();
    c.translate(SW / 2, y);
    c.scale(e, e);
    c.fillStyle = 'rgba(30,12,50,0.85)';
    roundRect(c, -470, -120, 940, 240, 50);
    c.fill();
    c.strokeStyle = '#f0c35c';
    c.lineWidth = 8;
    c.stroke();
    text(c, title, 0, -30, 70, color);
    text(c, sub, 0, 60, 40, '#fff4d6');
    c.restore();
  }

  // Local preview only: advance the ad by whole seconds even while the browser throttles frames.
  if (['localhost', '127.0.0.1'].includes(location.hostname)) {
    (window as unknown as { __ei: unknown }).__ei = {
      advance(seconds: number) {
        for (let t = 0; t < seconds; t += 1 / 30) frame(1 / 30);
      },
      spots: () => SPOTS.map((_, i) => spotScreen(i).map((v) => Math.round(v))),
    };
  }
  stage.loop((dt) => frame(dt));

  function frame(dt: number) {
    if (document.hidden) return;
    clock += dt;
    if (started && phase === 'play') {
      timeLeft -= dt;
      const whole = Math.ceil(timeLeft);
      if (whole < lastTick) {
        lastTick = whole;
        if (whole <= 10 && whole > 0) sfx.tick();
      }
      if (timeLeft <= 0) {
        timeLeft = 0;
        phase = 'lose';
        phaseAt = clock;
        drag = null;
        sfx.lose();
      }
    }
    if (phase === 'win' && clock - phaseAt > 3.6) endCard(true);
    if (phase === 'lose' && clock - phaseAt > 2.6) endCard(false);

    updateHero(dt);
    for (const g of grows) g.t += dt;
    for (let n = flyers.length - 1; n >= 0; n--) {
      const f = flyers[n]!;
      f.t += dt / 0.85;
      if (Math.random() < 0.7) {
        const t = Math.min(1, f.t);
        const e = EASES.inOutQuad(t);
        const mid = [(f.from[0] + f.to[0]) / 2, Math.max(f.from[1], f.to[1]) + 1.8, (f.from[2] + f.to[2]) / 2];
        const p = [0, 1, 2].map((a) => (1 - e) ** 2 * f.from[a]! + 2 * (1 - e) * e * mid[a]! + e * e * f.to[a]!);
        const [x, y] = toScreen(p);
        particles.push({ x, y, vx: (Math.random() - 0.5) * 80, vy: 40, life: 0, max: 0.5, color: '#ffe9a0', size: 7, star: true });
      }
      if (f.t >= 1) {
        flyers.splice(n, 1);
        upgrade(f.chain);
      }
    }

    c.drawImage(bg, 0, 0, SW, SH);
    render3d();
    if (phase === 'win' && !snapshot && clock - phaseAt > 1.2) {
      // The finished suite for the end card: the room cropped square, over the night backdrop.
      const shot = document.createElement('canvas');
      shot.width = shot.height = 640;
      const sc = shot.getContext('2d')!;
      const [sx, sy, sw] = [40, 330, 1000];
      sc.drawImage(bg, sx, sy, sw, sw, 0, 0, 640, 640);
      sc.drawImage(r.canvas, (sx * r.canvas.width) / SW, (sy * r.canvas.height) / SH, (sw * r.canvas.width) / SW, (sw * r.canvas.height) / SH, 0, 0, 640, 640);
      snapshot = shot.toDataURL('image/png');
    }
    c.drawImage(r.canvas, 0, 0, SW, SH);
    if (flash > 0) {
      c.fillStyle = `rgba(255,240,200,${flash * 0.3})`;
      c.fillRect(0, 0, SW, SH);
      flash = Math.max(0, flash - dt * 2.5);
    }

    // Tier pips and the flyers' names.
    for (let i = 0; i < SPOTS.length; i++) {
      const item = board[i];
      if (!item || locked.has(i) || drag?.from === i || item.tier >= MAX_TIER) continue;
      const [x, y] = spotScreen(i, 0);
      for (let p = 0; p < item.tier; p++) {
        c.fillStyle = '#ffd25a';
        c.strokeStyle = '#7a4a10';
        c.lineWidth = 3;
        c.beginPath();
        c.arc(x - (item.tier - 1) * 10 + p * 20, y + 18, 7, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
    }
    for (const f of flyers) {
      const t = Math.min(1, f.t);
      const e = EASES.inOutQuad(t);
      const mid = [(f.from[0] + f.to[0]) / 2, Math.max(f.from[1], f.to[1]) + 1.8, (f.from[2] + f.to[2]) / 2];
      const p = [0, 1, 2].map((a) => (1 - e) ** 2 * f.from[a]! + 2 * (1 - e) * e * mid[a]! + e * e * f.to[a]!);
      const [x, y] = toScreen(p);
      text(c, ITEM_NAMES[f.item.chain][f.item.tier - 1]!, x, y + 110, 36, '#ffe27a');
    }

    hud();

    // Hint hand while idle (and before the first touch).
    const pair = phase === 'play' && !drag && jobs.length === 0 && !hero.job && (!started || clock - lastAction > 3.5) ? hintPair(board) : null;
    if (pair && !locked.has(pair[0]) && !locked.has(pair[1])) {
      const cycle = (clock % 1.8) / 1.8;
      const [ax, ay] = spotScreen(pair[0]);
      const [bx, by] = spotScreen(pair[1]);
      const m = EASES.inOutQuad(Math.min(1, Math.max(0, (cycle - 0.18) / 0.55)));
      drawHand(ax + (bx - ax) * m, ay + (by - ay) * m, cycle < 0.15 || cycle > 0.78 ? 0 : 1, cycle > 0.9 ? (1 - cycle) * 10 : 1);
    }
    if (!started) {
      c.fillStyle = 'rgba(20,10,40,0.75)';
      roundRect(c, 90, 1600, SW - 180, 190, 44);
      c.fill();
      text(c, 'Guests are arriving soon!', SW / 2, 1660, 56, '#ffe27a');
      text(c, 'Merge items to help Elric prepare the room', SW / 2, 1735, 38, '#fff4d6');
    } else if (phase === 'play') {
      text(c, 'MERGE 2 IDENTICAL ITEMS!', SW / 2, 1740, 44, '#fff4d6');
    }

    for (let n = particles.length - 1; n >= 0; n--) {
      const p = particles[n]!;
      p.life += dt;
      if (p.life >= p.max) {
        particles.splice(n, 1);
        continue;
      }
      p.vy += 700 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = 1 - p.life / p.max;
      c.globalAlpha = a;
      c.fillStyle = p.color;
      const rr = p.size * (0.5 + a * 0.5);
      if (p.star) {
        c.beginPath();
        c.moveTo(p.x, p.y - rr);
        c.lineTo(p.x + rr * 0.3, p.y);
        c.lineTo(p.x, p.y + rr);
        c.lineTo(p.x - rr * 0.3, p.y);
        c.closePath();
        c.moveTo(p.x - rr, p.y);
        c.lineTo(p.x, p.y + rr * 0.3);
        c.lineTo(p.x + rr, p.y);
        c.lineTo(p.x, p.y - rr * 0.3);
        c.closePath();
        c.fill();
      } else c.fillRect(p.x - rr / 2, p.y - rr / 2, rr, rr * 0.6);
    }
    c.globalAlpha = 1;
    // Sparkles over Elric's hands while he casts.
    if (hero.castT >= 0 && hero.castT < 0.8 && Math.random() < 0.6) {
      const [x, y] = toScreen([hero.x, 1.7, hero.z]);
      particles.push({ x: x + (Math.random() - 0.5) * 80, y, vx: (Math.random() - 0.5) * 120, vy: -200, life: 0, max: 0.5, color: ['#c79bff', '#9fe8ff', '#fff3b0'][Math.floor(Math.random() * 3)]!, size: 9, star: true });
    }

    if (phase === 'win' || (phase === 'over' && roomReady(done))) {
      const t = clock - phaseAt;
      if (Math.random() < 0.5 && t < 2.5) {
        particles.push({ x: Math.random() * SW, y: 220, vx: (Math.random() - 0.5) * 200, vy: 150, life: 0, max: 2, color: ['#ffd25a', '#c79bff', '#9fe8ff', '#ff8fb1'][Math.floor(Math.random() * 4)]!, size: 16, star: false });
      }
      banner('MAGICAL SUITE READY!', 'The guests will love it!', t, '#ffe27a', 1640);
    } else if (phase === 'lose' || phase === 'over') {
      c.fillStyle = 'rgba(10,6,24,0.45)';
      c.fillRect(0, 0, SW, SH);
      banner("TIME'S UP!", 'The guests have arrived...', clock - phaseAt, '#ff8a7a', 960);
    }
  }
}

whenReady(() => void start());
