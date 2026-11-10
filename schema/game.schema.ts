import { component, f32, resource, u32 } from '@gameengine/schema';

export const Game = resource('Game', { score: u32({ doc: 'Bubbles popped' }), spawned: u32() }, { sim: true });

export const Bubble = component('Bubble', { radius: f32(), speed: f32({ doc: 'Units per step' }) }, { sim: true });
