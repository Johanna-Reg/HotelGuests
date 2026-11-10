---
name: rollback-multiplayer
version: 1.3.0
tier: optional
description: Real-time multiplayer with rollback netcode in Game Engine — PlayerInputs, defineButtons/playerInput, what sim state rollback allows, and `gameengine net test` (latency, jitter, SyncTest). Use for any versus or co-op game where players act at the same time, or for a desync or rollback bug.
---

# Rollback multiplayer

Every device simulates **every** player. The engine predicts late inputs and, when the real
ones arrive, rewinds to a snapshot and re-simulates. That only works if the game is a pure
function of its world and the players' inputs.

## Read inputs from `PlayerInputs`, never from devices

```ts
import { defineButtons, playerInput, PlayerInputs, read } from '@gameengine/runtime';

export const buttons = defineButtons(['dash', 'fire', 'jump'] as const); // ≤ 32

export const Move = defineSystem({
  name: 'Move',
  query: query(write(Player), write(LocalTransform)),
  resources: [read(PlayerInputs)],
  run(ctx, q) {
    const inputs = ctx.get(PlayerInputs);
    // for each Player entity: const inp = playerInput(inputs, player.index)
    // inp.stick is [-1..1, -1..1]; buttons.isDown(inp.buttons, 'dash')
  },
});
```

Players are entities with a `Player { index }` component (0–3 in `PlayerInputs`). A game for more
than four players (up to 32 in input sync) reads seats 4 and up from `MorePlayerInputs`:
`playerInput(inputs, index, ctx.get(MorePlayerInputs))` with `read(MorePlayerInputs)` declared;
matches of four or fewer never write it, so their hashes stay as they were. Device input (keys and gamepad through
`multiplayer.buttons`/`stick`, touch through `multiplayer.setInput`) is turned into `PlayerInputs`
by the netcode for the local player; sim systems never read
`Tap`, pointers or keys in a networked game.

## Rules (rollback breaks silently if you bend them)

- **All state in the world:** components, resources, `defineDoc` documents. No module-level
  variables, no caches in closures, no `Date.now()`/`Math.random()` (use `ctx.rng`).
- **Deterministic math only:** `math.*` from `@gameengine/runtime`, not `Math.sin/hypot/…`.
- **No physics yet:** games with `RigidBody2D/3D` are refused (their native worlds are not
  snapshotted). Write movement and collision as systems.
- **Cheap steps:** a rollback re-simulates several frames in one frame; keep a step well under
  2 ms. `gameengine net test` prints ms per peer frame.
- Effects (sound, particles, screen shake) belong in `LateUpdate`/presentation, which never
  re-runs on rollback.
- **Feel online** (skill `multiplayer`, "Input latency and prediction"): a missing remote input repeats
  that seat's last one, so every change of theirs is a rollback; `multiplayer.onPredict` guesses better
  (pure, speculative frames only), `multiplayer.onSample` puts the mouse of this frame into this
  frame's step, and `multiplayer.pacing` sizes the client's lead and window from the link.

## Test it — every change

```bash
gameengine net test --players 2 --latency 4 --jitter 2 --frames 600       # peers vs a perfect reference
gameengine net test --players 4 --latency 8 --jitter 4 --synctest 6       # + re-simulate 6 frames each frame
```

`divergence` names the first frame and peer that differ; `synctest` failures mean some state
lives outside the world. Both must be empty. Keep a `gameengine net test` line in CI.

Single-player unit tests set inputs directly:

```ts
world.setResource(PlayerInputs, { players: 2, stick0: [1, 0], buttons1: buttons.bit('fire') });
await step(30);
```

Playing online (joining a match server, rooms, relay vs authoritative servers, the key and pad
map, `gameengine mp test`, building a server for Linux, Windows or macOS) is skill
`multiplayer`. Sample: `samples/rollback-arena`.
