import { worldTest, expect } from '@gameengine/test';
import { LocalTransform } from '@gameengine/runtime';
import { Bubble, Game } from '../src/schema.gen.ts';

worldTest('tapping a bubble pops it', async ({ world, step, input, tap }) => {
  input.view(360, 640, 3);
  await step(40);
  const [bubble] = world.entities(Bubble);
  expect(bubble === undefined).toBe(false);
  const [x, y] = world.get(bubble!, LocalTransform).position;
  await tap([x!, y!]);
  await step(2);
  expect(world.resource(Game).score).toBe(1);
});

worldTest('bubbles that reach the top go away', async ({ world, step }) => {
  await step(900);
  expect(world.resource(Game).spawned).toBe(30);
  expect(world.entities(Bubble).length).toBeLessThan(15);
});

worldTest('a short session pops three bubbles', async ({ world, step, input, tap }) => {
  input.view(360, 640, 3);
  for (let i = 0; i < 3; i++) {
    await step(45);
    const [bubble] = world.entities(Bubble);
    const [x, y] = world.get(bubble!, LocalTransform).position;
    await tap([x!, y!]);
  }
  await step(30);
  expect(world.resource(Game).score).toBe(3);
});

worldTest.replay('tests/replays/a_short_session_pops_three_bubbles.greplay');
