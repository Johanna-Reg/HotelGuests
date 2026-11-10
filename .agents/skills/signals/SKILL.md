---
name: signals
version: 1.0.1
tier: required
description: Game signals for listeners outside the sim (analytics, achievements, tutorials, stingers) — ctx.signal, signal(), meta.<doc>.<action> signals, onSignal, expectSignal in tests. Use when adding analytics events, achievement or tutorial triggers, or anything that listens for when X happens.
---

# Signals

**Covers:** Game signals in Game Engine — named moments the game reports (coins spent, loot gained, level completed, life lost, purchase made) for listeners outside the simulation — analytics, achievements, tutorials, audio/VFX stingers, the debug console. Covers ctx.signal (sim), signal() (UI), the automatic meta.<doc>.<action> signals, onSignal/onAnySignal listeners, forwarding to an analytics SDK, and expectSignal in game tests. Use when adding analytics events, achievement or tutorial triggers, or anything that "listens for when X happens" without changing the sim.

A signal is a record that something happened, reported once, in order, to whoever listens:
`{ seq, name, source: 'sim' | 'ui' | 'meta', step, fields }`. The game says **what** happened;
analytics, achievements and tutorials decide what to do with it. Game code never calls an
analytics SDK directly, so swapping vendors, adding a second one or testing the events touches
one listener, not every system.

| Where the moment happens | Report it with | Source |
|---|---|---|
| A sim system (`Update`, `FixedUpdate`, …) | `ctx.signal(Token, fields)` | `sim` |
| UI / presentation code (a button, a screen opened, a view shown) | `signal(Token or 'name', fields)` from `@gameengine/runtime` | `ui` |
| A successful meta action (`meta.dispatch`) | automatic: `meta.<doc>.<action>` with `{ payload }` | `meta` |

## Declare sim signals in the schema

A sim signal is also a typed event, so it lives in the schema with its fields typed and
documented. The schema is the catalog of what the game reports; name events after the
moment, in the past tense.

```ts
// schema/game.schema.ts
import { enumOf, event, u32 } from '@gameengine/schema';

export const LootGained = event('LootGained', {
  item: enumOf('LootItem', ['coin', 'gem', 'sword']),
  count: u32(),
}, { sim: true, doc: 'Signal: the player picked up loot.' });
```

Run `gameengine gen`, then emit from the system where the moment is decided:

```ts
if (picked) ctx.signal(LootGained, { item: drop.item, count: drop.count });
```

`ctx.signal` emits the typed event (other sim systems may read it; it is hashed and replayed)
**and** reports the signal. Use it instead of `ctx.events.emit` for anything a listener outside
the sim cares about. It throws in `LateUpdate`: presentation code uses `signal()`.

UI signals need no schema entry; use dotted names (`'ui.shop.opened'`, `'ui.tutorial.skipped'`).
A token still gives typed fields when you have one.

## Listen

```ts
import { onSignal, onAnySignal } from '@gameengine/runtime';
import { services } from './services.gen.ts'; // the project's services (analytics is one, see below)

const off = onSignal(LootGained, (s) => achievements.progress('hoarder', s.fields.count));
onAnySignal((s) => void services.analytics.event({ name: s.name, params: s.fields })); // forward everything
```

- Listeners run **once per frame after the late update**, with every signal from that frame's
  steps in emission order. A frame with three fixed steps delivers all three steps' signals;
  none are lost or doubled (unlike reading `ctx.events` from presentation code).
- Listeners are presentation: they never change sim state directly. A listener that must
  affect the game (grant an achievement reward) dispatches a meta action or sends an input
  event, like any UI code.
- A listener that throws is logged (`category: 'signals'`) and the others still run: a broken
  SDK cannot take down the tutorial.
- Register listeners at startup (module scope or a view's mount) and call the returned
  unsubscribe on unmount.

## Forward to analytics

Keep one module that maps signals to your analytics service. Analytics is a project service
(skill `platform-services`): copy `examples/services/analytics`, whose `src/forwardSignals.ts` is
this module, and run `gameengine gen` so `services.analytics` exists in `src/services.gen.ts`:

```ts
// src/forwardSignals.ts (from examples/services/analytics)
import { onAnySignal } from '@gameengine/runtime';
import { services } from './services.gen.ts';

export function forwardSignals(skip: readonly string[] = []): () => void {
  return onAnySignal((s) => {
    if (skip.includes(s.name)) return;
    services.analytics.event({ name: s.name, params: s.fields }).catch(() => undefined);
  });
}
```

Call `forwardSignals(['ui.debug.toggled'])` once from a UI controller (`samples/gem-cascade/src/ui/hud.tsx`).

Put renames, sampling and consent checks here, not at the emit sites.

## Meta signals

Every successful `meta.dispatch(action, payload, time)` reports `meta.<doc>.<action>` with
`{ payload }` (refused actions report nothing). Coins spent, upgrades bought and rewards
claimed are usually already covered: listen to `meta.shop.buyUpgrade` rather than adding a
second signal next to the dispatch. Read the resulting state with `meta.get()` in the
listener when you need balances.

## Test them

```ts
import { worldTest, expectSignal, recordedSignals } from '@gameengine/test';

worldTest('opening a chest reports the loot', async ({ step }) => {
  await step(120);
  expectSignal(LootGained, { item: 'sword' });        // fields match as a deep subset
  expectSignal('meta.inventory.add');
  expect(recordedSignals(LootGained)).toHaveLength(1); // exactly once
});
```

The log is cleared at the start of each test. `expectSignal` failures list the signals that
were seen. Run with `--js both`: sim signals must come out the same on V8 and Hermes.

## Rules and limits

- **Signals are not state.** Never hashed, not in saves, never read by sim systems. A sim
  system that needs to react reads the typed event instead.
- **Replays re-emit sim signals** (the sim runs again); UI signals are not replayed. Do not
  forward to a live analytics backend from a replay or test run.
- **Names ≤ 128 characters, fields a plain JSON object.** Keep fields small and flat (ids,
  counts, amounts) — they are serialized every frame.
- **Budget:** 10,000 signals per frame, then they are dropped and counted. A signal per
  entity per step is a design bug: report the aggregate (`EnemiesKilled { count }`).
- The last 2,000 signals are kept for tests and the console (`signalHistory(since)`).
