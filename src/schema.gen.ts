// @generated — do not edit. Regenerate with `pnpm gen` (tools/bindgen).
import { typeToken, registerSchema, type EntityId } from '@gameengine/runtime';

export type { EntityId };

/** Project schema IR, registered with the engine when the bundle boots. */
export const schemaIr = {
  "version": 1,
  "package": "EIGuests",
  "enums": [],
  "types": [
    {
      "name": "Bubble",
      "kind": "component",
      "sim": true,
      "fields": [
        {
          "name": "radius",
          "kind": "f32",
          "scalar": "f32",
          "lanes": 1
        },
        {
          "name": "speed",
          "kind": "f32",
          "scalar": "f32",
          "lanes": 1,
          "doc": "Units per step"
        }
      ],
      "package": "EIGuests"
    },
    {
      "name": "Game",
      "kind": "resource",
      "sim": true,
      "fields": [
        {
          "name": "score",
          "kind": "u32",
          "scalar": "u32",
          "lanes": 1,
          "doc": "Bubbles popped"
        },
        {
          "name": "spawned",
          "kind": "u32",
          "scalar": "u32",
          "lanes": 1
        }
      ],
      "package": "EIGuests"
    }
  ],
  "commands": [],
  "protocol": [],
  "services": []
} as const;
registerSchema(schemaIr);

export interface BubbleViews {
  radius: Float32Array;
  /** Units per step */
  speed: Float32Array;
}
export interface BubbleValue {
  radius: number;
  /** Units per step */
  speed: number;
}
/** Bubble (component, sim) */
export const Bubble = typeToken<BubbleViews, BubbleValue>('Bubble', 'component', { sig: 'radius:f32:1,speed:f32:1', read: (v: BubbleViews, i: number, o: Record<string, unknown>) => { o.radius = v.radius[i]; o.speed = v.speed[i]; return o; } });

export interface GameViews {
  /** Bubbles popped */
  score: Uint32Array;
  spawned: Uint32Array;
}
export interface GameValue {
  /** Bubbles popped */
  score: number;
  spawned: number;
}
/** Game (resource, sim) */
export const Game = typeToken<GameViews, GameValue>('Game', 'resource', { sig: 'score:u32:1,spawned:u32:1', read: (v: GameViews, i: number, o: Record<string, unknown>) => { o.score = v.score[i]; o.spawned = v.spawned[i]; return o; } });
