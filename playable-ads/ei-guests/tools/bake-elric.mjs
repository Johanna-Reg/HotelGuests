// Bakes Elric's clips for the web build: the engine evaluates each clip (`gameengine anim3d sample
// --frames all`), this keeps every skin joint's model-space rotation per frame plus the hips'
// position, in the joint order of Elric.glb's skin. The ad rebuilds the pose with the GLB's own
// bone lengths, so it matches the engine's playback.
//
//   node tools/bake-elric.mjs <Sneak-Out project dir>
//
// Run from playable-ads/ei-guests. Writes web/elric-anim.json.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const game = process.argv[2];
if (!game) throw new Error('usage: node tools/bake-elric.mjs <Sneak-Out project dir>');
const here = process.cwd();
const ge = process.platform === 'win32' ? 'gameengine.cmd' : 'gameengine';

const clips = [
  { name: 'idle', clip: 'assets/models/elric/Elric@Idle.fbx#Idle', cwd: game, loop: true },
  { name: 'walk', clip: 'assets/models/elric/Elric@Walk.fbx#Walk', cwd: game, loop: true },
  { name: 'run', clip: 'assets/models/elric/Elric@Run.fbx#Run', cwd: game, loop: true },
  { name: 'cast', clip: 'assets/anim/elric-cast.anim3d.json', cwd: here, loop: false },
];

const glb = readFileSync(join(here, 'assets/models/elric/Elric.glb'));
const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
const joints = json.skins[0].joints.map((i) => json.nodes[i].name);

function quatFromAxes([x, y, z]) {
  // Columns of the rotation are the joint's axes in model space.
  const m00 = x[0], m10 = x[1], m20 = x[2];
  const m01 = y[0], m11 = y[1], m21 = y[2];
  const m02 = z[0], m12 = z[1], m22 = z[2];
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  const n = Math.hypot(...q);
  return q.map((v) => Math.round((v / n) * 1e4) / 1e4);
}

const out = { joints, clips: {} };
for (const c of clips) {
  const raw = execFileSync(ge, ['anim3d', 'sample', c.clip, '--frames', 'all', '--json'], { cwd: c.cwd, encoding: 'utf8', shell: true, maxBuffer: 64 << 20 });
  const s = JSON.parse(raw.trim().split('\n').pop());
  if (!s.ok) throw new Error(`${c.name}: ${s.error}`);
  const alias = new Map(s.skeleton.map((k) => [k.name, k.alias]));
  const frames = s.frames.map((f) => {
    const rot = joints.map((name) => {
      const j = f.joints[alias.get(name)];
      if (!j) throw new Error(`${c.name}: no ${name} in frame ${f.frame}`);
      return quatFromAxes(j.axes);
    });
    const hips = f.joints[alias.get(joints[0])].pos.map((v) => Math.round(v * 1e4) / 1e4);
    return { r: rot.flat(), h: hips };
  });
  out.clips[c.name] = { fps: s.fps, length: s.length, loop: c.loop, frames };
  console.log(`${c.name}: ${frames.length} frames`);
}
writeFileSync(join(here, 'web/elric-anim.json'), JSON.stringify(out));
console.log('wrote web/elric-anim.json');
