/**
 * Bubbles rise from the bottom of the screen; tap one to pop it. Everything here is sim
 * code (fixed step, seeded random), so a recorded replay reproduces a session exactly.
 */
import { defineSystem, query, read, write, Tap, LocalTransform, WorldView } from '@gameengine/runtime';
import { Bubble, Game } from './schema.gen.ts';

const VIEW_SIZE = 8;
const EDGE = 9;
const SPAWN_EVERY = 30;
const COLORS = Object.freeze(['#ff6b8a', '#6bc5ff', '#ffd36b'] as const);

export const SetupView = defineSystem({
  name: 'SetupView',
  resources: [write(WorldView)],
  run(ctx) {
    if (ctx.get(WorldView).orthoSize !== VIEW_SIZE) ctx.set(WorldView, { orthoSize: VIEW_SIZE, designAspect: 9 / 16, fit: 'Contain', center: [0, 0] });
  },
});

export const SpawnBubbles = defineSystem({
  name: 'SpawnBubbles',
  after: ['SetupView'],
  resources: [write(Game)],
  run(ctx) {
    if (ctx.step % SPAWN_EVERY !== 0) return;
    const radius = ctx.rng.between(0.5, 0.9);
    ctx.commands.spawn({
      LocalTransform: { position: [ctx.rng.between(-3.5, 3.5), -EDGE, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      Shape: { kind: 'Circle', size: [radius * 2, radius * 2], radius, color: COLORS[ctx.rng.range(0, COLORS.length)]! },
      Bubble: { radius, speed: ctx.rng.between(0.03, 0.06) },
    });
    ctx.set(Game, { spawned: ctx.get(Game).spawned + 1 });
  },
});

export const RiseAndPop = defineSystem({
  name: 'RiseAndPop',
  after: ['SpawnBubbles'],
  query: query(read(Bubble), write(LocalTransform)),
  resources: [write(Game)],
  events: [Tap],
  run(ctx, q) {
    const taps = [...ctx.events.read(Tap)].map((t) => t.world);
    let popped = 0;
    for (const c of q.chunks()) {
      const b = c.col(Bubble);
      const pos = c.col(LocalTransform).position;
      for (let i = 0; i < c.length; i++) {
        const x = pos[i * 3]!;
        const y = pos[i * 3 + 1]! + b.speed[i]!;
        pos[i * 3 + 1] = y;
        const r = b.radius[i]!;
        if (taps.some(([tx, ty]) => (tx - x) ** 2 + (ty - y) ** 2 <= r * r)) {
          popped++;
          ctx.commands.despawn(c.entity(i));
        } else if (y > EDGE) {
          ctx.commands.despawn(c.entity(i));
        }
      }
    }
    if (popped > 0) ctx.set(Game, { score: ctx.get(Game).score + popped });
  },
});
