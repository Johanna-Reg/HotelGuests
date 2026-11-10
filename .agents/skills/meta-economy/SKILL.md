---
name: meta-economy
version: 1.5.2
tier: optional
description: Meta game state with @gameengine/meta (defineMeta) and world documents (defineDoc) — progression, currencies, inventory, upgrades, quests, daily rewards, the recorded WallClock, persisted meta and migrations. Use for anything a player keeps between levels or sessions.
---

# Meta state and economy

**Covers:** Meta game state — progression, currencies, inventory, upgrades, quests, daily rewards — with @gameengine/meta (defineMeta, actions, invariants, migrations, simulateMeta) and world documents (defineDoc), plus the recorded WallClock, persisted meta (MetaLoaded), tunables and visual pools (ADR 0091, samples/meta-hub). Use for anything a player keeps between levels or sessions.

Meta is **one plain-JSON document per concern**, changed only by **named pure actions**.
Not entities, not ad-hoc resources, not module variables.

```ts
// src/meta.ts
import { defineMeta, refuse } from '@gameengine/meta';

export const shop = defineMeta({
  name: 'shop',                 // world document `meta:shop`
  version: 1,                   // bump when the shape changes, add migrate()
  initial: { coins: 0, level: 0, claimedAt: -1 } as Shop,   // plain JSON only
  actions: {
    earn: (s: Shop, n: number) => ({ ...s, coins: s.coins + n }),
    upgrade: (s: Shop, _: null) => {
      if (s.coins < cost(s.level)) refuse('not enough coins');     // a refusal, state unchanged
      return { ...s, coins: s.coins - cost(s.level), level: s.level + 1 };
    },
    daily: (s: Shop, _: null, env) => {                           // time comes in, never read
      if (env.now - s.claimedAt < 86_400) refuse('already claimed');
      return { ...s, coins: s.coins + 25, claimedAt: env.now };
    },
  },
  invariants: { coinsNonNegative: (s) => s.coins >= 0 },          // checked after every action
  migrate: (old, from) => { /* from v1 → current */ },
});
```

- **Actions are pure:** return a new state or `refuse(reason)`. No host calls, no randomness,
  no `Date.now()`. Random rewards: roll with `ctx.rng` in the system and pass the result in the
  payload. Wall-clock time (daily rewards, production): pass `WallClock.ms` as `now` (below).
- **Invariants** catch bugs where they happen: an action that breaks one (or returns a state that
  is not plain JSON) throws with the action and payload in the message. Refusals are for the
  player; invariants are for you.
- **Versions:** saves store `{v, state}`. Change the shape → bump `version`, write `migrate`,
  add a test loading an old save. Every load checks the invariants, current version included.

## In the game

```ts
import { metaInWorld } from '@gameengine/meta/world';
export const shopState = metaInWorld(shop, { persist: true });   // or { persist: { slot, throttleMs } }

// in a sim system; `now` is required (ctx.time, or WallClock.ms)
const r = shopState.dispatch('upgrade', null, ctx.time);
if (!r.ok) toast(r.reason);
// anywhere (views, LateUpdate)
shopState.get().coins;
```

Dispatch from **sim** systems (it writes a world document: hashed, replayed, saved). For
other one-off JSON state use `defineDoc(name, defaults)` from `@gameengine/runtime` directly; its
`set`/`update`/`reset` throw outside a sim system (LateUpdate, UI, a test body), `get` works anywhere.
Names starting `tunables:`, `meta:`, `stream:` or `visualPool:` are the engine's documents and
refused; read those through their API (`metaInWorld`, `defineTunables`). A `defineSave` whose name
another one already defined with a different version or schema (`meta-<name>` is `metaInWorld`'s)
is refused at its first load or write.

## Kept on the device

`persist` keeps the meta in device storage (the `storage` service, save type `meta-<name>`, slot
`default`); nothing else to write:

- **Load:** read on the first frame, migrated with your `migrate` and checked, and handed to the
  sim as recorded `MetaLoaded` input a step or two after boot. Until then `loaded()` is false,
  `get()` is the initial state and `dispatch` refuses with `'not loaded'`: guard systems with
  `if (!state.loaded()) return;` so nothing is granted on a state the save is about to replace.
- **Save:** written when the state changes, at most once per `throttleMs` (default 1000), and at
  once when the app goes to the background (the engine flushes storage after).
- **Wait until it is saved:** `await state.flush()` writes the current state now and resolves once
  storage has it, with the barrier's receipt: `{ durability: 'native' }` on a device, `'strict'`
  in a browser, `'memory'` in tests, where saves never reach a disk. Use it from presentation code before something that cannot be undone if
  the save is lost, such as finishing an in-app purchase after its goods were granted: finish
  first and a crash before the throttled write loses a paid purchase for good. It saves the state
  **as it is when called**: a grant sent as recorded input lands a step later, so call `flush()`
  only once `get()` shows it (from a `LateUpdate` system, a signal the action emits, or `useDoc`),
  never straight after `emit`. It rejects when the write fails, before the save has loaded, when
  this session does not save the meta (an unreadable save, replay playback, a playable-ad slice),
  for a meta without `persist`, and from a sim system; on a rejection, do not go ahead. Never call
  it every frame: each call bypasses the write throttle and asks storage for a barrier.
- **A save that does not load** (written by a newer build, damaged, breaks an invariant) is logged
  and left alone: the meta starts from its initial state and is not written this session. React
  to `MetaLoaded` (its `error` is set) if the player should be told.
  Use `persist: { requireIntact: true }` for receipt-bearing state that must not roll back:
  failed reads and recovered older backups leave it unloaded, and dispatch/flush refuse.
  The game owns repair. The first successful flush writes even unchanged initial or migrated
  state before its barrier confirms it; reading that state alone is not confirmation.
- Replays and `--js both` see only the recorded `MetaLoaded`, never storage.
- **Anything the screen shows from the save** (first launch, onboarding done, "welcome back",
  best score) lives in a persisted meta, and the view decides once `loaded()` is true, from
  `useDoc(state)`. Never from `defineSave(...).load()` in UI: during replay playback storage
  answers with its mock (`fresh: true`), so `replay play` would show a first launch the recorded
  player never saw.

## Time that runs while the app is closed

Production, cooldowns, energy regen and daily rewards run on the device clock, which sim code
never reads directly. Export the engine's feed and read the recorded `WallClock` resource:

```ts
import { defineSystem, read, wallClock, WallClock } from '@gameengine/runtime';
export const clockFeed = wallClock.feed({ periodMs: 1000 });   // LateUpdate: sends the clock as input

export const Produce = defineSystem({
  name: 'Produce',
  resources: [read(WallClock)],
  runIf: { resource: WallClock, field: 'ms', op: '>', value: 0 },   // 0 until the first tick
  run(ctx) {
    if (!farmState.loaded()) return;
    const now = ctx.resource(WallClock).ms[0]!;                    // UTC ms; local day: + tzOffset * 60000
    if (now - farmState.get().plantedAt >= GROW_MS) farmState.dispatch('collect', { growMs: GROW_MS }, now);
  },
});
```

- Store **timestamps** in the meta (`plantedAt`, `claimedAt`) and let the action count what
  elapsed (`Math.floor((env.now - s.plantedAt) / growMs)` crops): one step after a day away pays
  the whole day, and nothing ticks per step.
- `WallClock.ms` **never goes back**: a device clock set back holds it, so timers cannot be
  rewound for free rewards. It is still the device's clock: validate high-value rewards on a
  server if the game has one.
- Tests start at `TEST_WALL_MS` and move it with `clock.set(ms)` / `clock.advance(ms)`; the sim has
  it at the next step. Save flows: write the slot before the first step to start from a save
  (`defineSave(saveToken('meta-<name>', 1, { type: 'object' }), …).write({ v, state })`), check
  `services.calls('storage.write')`, and `app.background()` for the write on pause.

## Live numbers and presentation visuals

- **Numbers designers tweak** (grow times, rewards, spacing) are neither meta state nor module
  constants: `defineTunables(Token, 'data/tunables/x.json')` and `Tuning.get()` inside the system.
  A dev edit reaches the sim as recorded `TunablesChanged` input at one step, so replays repeat it
  (skill `content-database`).
- **Visuals the presentation adds and removes** (a coin pile that follows the balance, a carried
  stack): a `visualPool({ name, prefab, size, draws })` the sim fills once; a LateUpdate system
  places them (`pool.begin(q)`, `f.show(x, y, z, scale)`, `f.end()`), and unused items get
  `visible: false` (skill `sim-boundaries`, ADR 0091).
- **In a view:** `useDoc(shopState)` (skill `ui-mvc-views`); never read the device clock or storage
  in UI to emit it to the sim.

## Fast at any size

A dispatch costs about **0.05 ms on V8 and 0.07 ms on Hermes whether the state holds 100 or
10,000 items** (measured in the engine). That holds because:

- States are **frozen and shared**: an action gets the current state without a copy and
  returns a new one built with spreads. Mutating the state throws (`Cannot assign to read
  only property`); that is a bug in the action.
- Only **what changed** is written: `{ ...s, coins: s.coins + n }` sends one field to the engine,
  and the engine re-hashes only that path.
- Loading (and the invariant checks in it) runs once per change, not on every `get()`.

Keep it that way:

- **Spread only the path you change.** `({ ...s, inventory: { ...s.inventory, [id]: n } })`
  touches one key. Rebuilding a big array or object (`items.map(...)`, `JSON.parse(JSON.stringify(s))`)
  makes every entry new, and all of it is written again.
- **Large collections as objects keyed by id**, not arrays: removing from an array shifts every
  later index (the whole array is rewritten); deleting a key is one change.
- **One `defineMeta` per concern** (wallet, inventory, quests, settings): invariants run after
  every action over that meta's state, so keep them cheap — no scan of a 10,000-item inventory
  per coin change; keep a counter in the state instead.
- `defineDoc(...).update(fn)` hands out a mutable copy of the whole document: fine for small
  documents, use `set({...prev, field})` for big ones.
- Things that are not meta (thousands of placed objects, per-entity data) belong in components.

## Test the economy, not just the code

```ts
worldTest('upgrades stay reachable', async () => {
  const r = simulateMeta(shop, {
    players: 1000, steps: 200, seed: 1,
    policy: (s, rng) => (s.coins >= cost(s.level) ? { action: 'upgrade', payload: null } : { action: 'earn', payload: 1 + rng.int(5) }),
    track: { coins: (s) => s.coins, level: (s) => s.level },
    stuckAfter: 50,
  });
  expect(r.final.level.min).toBeGreaterThan(3);   // pacing
  expect(r.stuckPlayers).toBe(0);                  // nobody soft-locked
});
```

`r.actions` shows refusal reasons by count (is "not enough coins" 90 % of tries?), `r.curve`
shows tracked numbers over time. Write one simulation per balance question and keep it as a
test; change numbers, rerun, read the report.

Samples: `samples/tile-maze` (`src/meta.ts`, `tests/meta.test.ts`); `samples/meta-hub` (a persisted farm on
`WallClock` time, `tests/hub.test.ts`).
