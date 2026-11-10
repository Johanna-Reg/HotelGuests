---
name: cheats
version: 1.10.0
tier: optional
description: Cheats and debug commands — defineCheat in src/**/*.cheats.ts, the in-game console, `gameengine cheat list|run`, MCP cheat_*, the Cheats panel, cheat() in tests, the engine.perf widget, store screenshots (engine.capture, F9), release stripping. Use for any debug or QA shortcut, or to put the game in a state for a test or an agent.
---

# Cheats

**Covers:** Cheats in Game Engine — shortcuts that put the game into a state (add moves or coins, win or lose the level, unlock a feature, reset a save) for development, QA and agents. Covers defineCheat in src/**/*.cheats.ts (typed int/number/bool/string/enum params with step and current values, sim cheats vs presentation cheats), the in-game cheat console (two-finger double tap or Shift+Escape), `gameengine cheat list|run`, the MCP cheat_list/cheat_run tools, the editor's Cheats panel, cheat() in game tests, the engine's own engine.perf performance widget (fps, slow frames, variance, a 20 s report to the clipboard), store screenshots from the frozen game (engine.capture: every store size in every language as RGB PNGs), and how builds strip them (dev and probe carry cheats, release only with --cheats or cheats.release). Use when adding a debug or QA shortcut, when a test or an agent needs the game in a given state, or when asked for a "cheat", "debug command" or "console command".

A cheat is one declaration next to the feature it changes. The engine lists it in the in-game
console (grouped, searchable, with fields for its params), in `gameengine cheat list`, in the
editor's **Cheats** panel while Play runs, and runs it the same way from all of them and from
game tests. Cheats ship in dev and probe builds only; the bundler adds them, so a release build
has no trace of them unless the project opts in.

## Add a cheat

Put it in a file ending `.cheats.ts` under `src/`, next to the feature (`src/board.cheats.ts`,
`src/shop/shop.cheats.ts`). **Nothing may import a `*.cheats.ts` file** — not `main.ts`, not a
system. The bundler imports them in builds with cheats; a build without cheats fails if game code
reaches one (the `cheats` rule in `FORBIDDEN_MODULES`).

```ts
import { query, read, write } from '@gameengine/runtime';
import { defineCheat } from '@gameengine/runtime/cheats';
import { addMoves } from './board.ts';
import { progress } from './progress.ts';
import { Board, Moves, Score, Tile, TileKind } from './schema.gen.ts';

// A sim cheat: runs as a system in PreUpdate of the next step, from a recorded CheatRequested
// event, so it is deterministic and replays repeat it. Same rules as any system.
export const AddMoves = defineCheat({
  id: 'moves.add', // stable: CLI, tests and agents use it; ids starting `engine.` are the engine's (refused)
  group: 'Moves', // one group per feature
  title: 'Add moves',
  description: 'Continues a level lost on moves',
  params: { amount: { type: 'int', default: 5, min: 1, max: 99 } },
  resources: [write(Moves), write(Board), read(Score)],
  run(ctx, { amount }) {
    addMoves(ctx, amount); // reuse the feature's own code
  },
});

// With a query and an enum param (the args are typed: kind is 'Red' | … | 'Bomb').
export const SetTile = defineCheat({
  id: 'tile.set',
  group: 'Board',
  title: 'Set a tile',
  params: {
    x: { type: 'int', min: 0, max: 15 },
    y: { type: 'int', min: 0, max: 15 },
    kind: { type: 'enum', values: ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Bomb'], default: 'Bomb' },
  },
  query: query(write(Tile)),
  run(_ctx, { x, y, kind }, q) {
    for (const c of q.chunks()) {
      const t = c.col(Tile);
      for (let i = 0; i < c.length; i++) if (t.cell[i * 2] === x && t.cell[i * 2 + 1] === y) t.kind[i] = TileKind[kind];
    }
  },
});

// A presentation cheat: runs at once, outside the sim — saves, meta documents, service mocks,
// UI. It must not write sim state directly; raise the sim event the feature already handles.
export const ResetProgress = defineCheat({
  id: 'progress.reset',
  group: 'Progress',
  title: 'Reset saved progress',
  presentation: true,
  async run() {
    await progress.write({ bestScore: 0, levelsCompleted: 0, purchases: 0 });
  },
});
```

Params: `int`, `number` (`min`, `max`, `step`), `bool`, `string`, `enum` (`values`), each with an
optional `default`, `doc` and `current`. Arguments arrive checked: unknown names, out-of-range numbers and unknown enum
values are refused with `E_PARAMS` before anything runs; strings from the command line are coerced.

`step` is what the console's -/+ and the editor's slider (shown when `min` and `max` are set) move
by. A cheat's `current` reports the game's values now for its params, so the console, the editor
and `gameengine cheat list` (`now 1234`) start from them instead of the defaults:

```ts
export const SetScore = defineCheat({
  id: 'score.set',
  group: 'Level',
  title: 'Set score',
  params: { value: { type: 'int', default: 2900, min: 0, max: 1_000_000, step: 100 } },
  current: (world) => ({ value: world.resource(Score).value }),
  resources: [write(Score)],
  run(ctx, { value }) {
    ctx.set(Score, { value });
  },
});
```

`current` runs when the cheats are listed, between steps, with a read-only `world`
(`world.resource(T)`; read a document with its handle's `get()`). Keep it a plain read: it gets no
`ctx`, cannot write and never changes a hash. Return only the params it knows; a getter that
throws, a value of the wrong type or an unknown name is left out (a `cheats` warning in the log).

**Sim or presentation?** If the state is in components or resources (moves, score, board, a
level's phase), write a sim cheat: it goes through the input record like a tap. If it is in a
save, a meta document, a service or the UI, write a presentation cheat. Never change sim state
from a presentation cheat except through `emit(SomeEvent)`.

## Run cheats

| Who | How |
|---|---|
| Player / QA on a device or the desktop player | two-finger double tap (or Shift+Escape, the `cheats.key` default; also in the editor's Play view) opens the console; tap a group, set params, **Run** |
| Agent with a shell | `gameengine run --headless --paused`, then `gameengine cheat list`, `gameengine cheat run moves.add amount=3` (or `--arg amount=3`, `--args '{"amount":3}'`), then `gameengine step 1` |
| Agent over MCP | `cheat_list`, `cheat_run { id, args }` (then `step`) |
| Editor | the **Cheats** panel while Play runs |
| Game test | `await cheat(AddMoves, { amount: 7 })` in `worldTest` (runs it and steps once) |

A sim cheat applies on the **next** step: on a paused session run `gameengine step 1` before
reading the world. Several sim cheats requested for the same step run in system order, not in
the order they were requested; step between them when the order matters.

```ts
import { expect, worldTest } from '@gameengine/test';
import { AddMoves } from '../src/board.cheats.ts'; // tests may import cheat files; tests never ship

worldTest('moves.add continues a lost level', async ({ world, step, cheat }) => {
  await step(2);
  const before = world.resource(Moves).left;
  await cheat(AddMoves, { amount: 7 });
  expect(world.resource(Moves).left).toBe(before + 7);
});
```

Use cheats to put a test or a screenshot into a state quickly instead of scripting many taps.
A presentation cheat's `run.done` settles when it finishes; step until it does.

## Engine cheats: the performance widget

Every build with cheats also has the engine's own cheats in the console's **Engine** group, even
when the project declares none. `engine.perf` (**Performance widget**) shows a bar at the top of
the screen: fps, `<24fps` (the share of frames slower than a 24 fps frame, 41.7 ms) and `var`
(frame-interval stddev / mean), all over the last 10 s. Its record button measures 20 s and puts
a plain-text report (device model and OS, interval percentiles, hitches, CPU / script / GPU per
frame, draw calls / triangles / upload bytes per frame, GC pauses, thermal state at start and end
with changes, memory, and the worst frames with their time, render load and any GC) on the clipboard — paste it to an agent — and in the log; its X
turns it off. Off, it costs nothing; on, it updates twice a second.

To keep it on across sessions, switch on **Keep performance widget on between runs**
(`engine.perf.keep`, `on: true`): the device remembers the choice
(`perf-hud.json` in the app's user data) and the widget opens by itself at every boot, rebuild and
hot reload of a build with cheats — in a hub and in each game it launches — until it is switched
off (which leaves the open widget alone). X still closes it until the next boot; a hand-back, an
ask or its answer is not a boot, so the widget stays as it was in the game. A recording in progress ends with its session, so take the report before switching.

| Who | How |
|---|---|
| QA on a device | open the console, **Engine** → **Performance widget** → Run; later tap the record dot |
| Measuring across sessions or game switches | console → **Engine** → **Keep performance widget on between runs**, on (later off); or `gameengine cheat run engine.perf.keep on=true` |
| Agent with a shell | `gameengine cheat run engine.perf action=on`; `gameengine cheat perf` prints the numbers; `gameengine cheat perf --record` records and prints the report (also on a device session) |
| Agent reading a device | `gameengine device logs` has the report (category `perf`) |

The clipboard needs the `system` plugin; without it the widget says so and the report is only in
the log. For budgets and CI use `perf.stats` and T1/T2 budgets (skill `mobile-performance-review`):
the widget is for a person holding the phone.

`engine.crash` (**Native crash**, `kind=segfault|abort|panic`) crashes the engine in Rust: SIGSEGV in
`gameengine_core::forced_crash::segfault`, SIGABRT, or a panicking host op, which aborts with the
panic as the abort message on Android. Use it on a device build to check that native
engine crashes reach the game's crash reporter plugin (the engine captures none itself).
Another cheat in a `*.cheats.ts` file can run it with `runCheat('engine.crash', { kind: 'segfault' })`.
Builds without cheats have neither the cheat nor a working host op; a release build with cheats
(`--cheats`, `cheats.release`) has it for anyone who opens the console.

## Engine cheats: store screenshots

`engine.capture` (**Store screenshots**) turns one frozen moment of real gameplay into the store
set: every store size, each laid out with its own size, density and safe area, in every language
the game has, as RGB PNGs (no alpha, which both stores refuse) at the exact pixel sizes.

1. Play to the moment (the editor's Play, `gameengine run`, the desktop player).
2. Press **F9** (or run the cheat with `action=freeze`). The game holds as under the editor's Pause:
   no steps, no UI time, and every input but releases is dropped (not kept for later). A blue bar
   at the bottom shows the keys.
3. Press **Enter** (or `action=capture`). The bar says "Capturing…", then how many PNGs went
   where and how long it took.
4. Press **Escape** or **F9** (or `action=resume`) to play on.

Files go to `screenshots/store/<UTC time>/<shot>/<language>.png` in the project, with a
`capture-<UTC time>.json` (the step, each shot's size, scale and safe area, each file, each error). The bar,
the error banner and the cheat console never show in a capture. Defaults: iPhone 6.9" (1320×2868)
and 6.3" (1206×2622), iPad 13" (2064×2752), Android phone (1080×1920) and tablet (1440×2560),
turned for `ui.orientation: "landscape"`; languages are every `locales/<lang>.json`. Change them
in a cheats file:

```ts
// src/store.cheats.ts
import { configureStoreCapture } from '@gameengine/ui/store-capture';

configureStoreCapture({
  languages: ['en', 'de', 'ja'],
  shots: [
    { id: 'iphone-6.9', width: 1320, height: 2868, scale: 3, safeArea: [0, 62, 0, 34], folder: 'iPhone' },
    { id: 'ipad-13', width: 2064, height: 2752, scale: 2, safeArea: [0, 24, 0, 20], folder: 'iPad' },
  ],
  key: 'F9', // a KeyboardEvent.code name, optional Shift+/Ctrl+/Alt+/Meta+
  folder: '~/Desktop/Store', // project-relative, or your Desktop, Pictures or Documents
  path: '{folder}/{language}/{n}.png', // each capture adds 1.png, 2.png… to the store folders
});
```

`path` takes `{stamp}`, `{n}`, `{shot}`, `{folder}` (the shot's `folder`, else its id),
`{language}`, `{width}` and `{height}`. It needs `{stamp}` or `{n}`, so no capture writes over
another, and must name its own file for every shot and language.

`freezeForCapture()`, `captureStoreScreenshots()` and `storeCaptureState()` do the same from code
(a cheat that sets a scene up and freezes it). Before each shot renders, the UI is laid out at
the shot's size and the game runs one UI frame (effects and `onUiFrame`, no time passing, no sim
step), so UI code follows the shot, and `elementRect` there measures that shot's boxes:

- **Size and safe area:** `t("key")` text, `Text2D.locKey`, styles and `<Screen safeArea>` follow
  by themselves. UI code that positions things from the view reads `usePresentationView()` (or
  `presentationView()`) from `@gameengine/ui`, never `ViewInfo`: it is `ViewInfo` in play and the
  shot's view during a capture. Its `pointsPerUnit` turns points into UI units.
- **The game's own localization:** register it, and each language's shots render in it. `get`
  and `set` run as presentation, outside the sim: keep the language in module state or a signal
  the UI reads, not in a document or a resource (a write there throws).

- **What no store screenshot should show:** hide debug UI, FPS counters or dev badges in
  `onCaptureStart` and bring them back in `onCaptureEnd`. End runs whenever start did, even when
  a shot or a callback failed. Both run as presentation, like the language hook.

```ts
import { onCaptureEnd, onCaptureStart, onStoreCaptureLanguage } from '@gameengine/ui/store-capture';
onStoreCaptureLanguage({ get: () => i18n.language(), set: (language) => i18n.setLanguage(language) });
onCaptureStart(() => setDebugOverlay(false));
onCaptureEnd(() => setDebugOverlay(true));
```

Anything the UI frame does not reach stays as frozen: sim state, and layout a sim system computed
from `ViewInfo`. A folder outside the project is for desktop sessions only, and a phone dev build
has the cheat but cannot write into the project. Release builds never have it,
not even with `--cheats` (no debug protocol): the cheat says so. It is refused in a multiplayer
match (`E_BUSY`): the peers would wait on a frozen game.

## Builds

| Build | Cheats |
|---|---|
| editor Play, `gameengine run`, tests | yes |
| `build android|ios --config dev|probe`, `cook` | yes |
| `--config release`, `cook --release` | no — unless `--cheats`, or `"cheats": { "release": true }` in project.gameengine.json (an internal QA track) |

`gameengine build … --report` says `cheats: included` when they are in. Release builds have no
debug protocol, so there only the in-game console runs them.

Console settings in `project.gameengine.json` (all optional):

```json
"cheats": { "gesture": "twoFingerDoubleTap", "key": "Shift+Escape", "release": false }
```

`gesture`: `twoFingerDoubleTap` (default), `cornerDoubleTap` (two taps in the top-left corner;
works with a mouse), `none`. `key`: a `KeyboardEvent.code` name with optional `Shift+`, `Ctrl+`, `Alt+` or `Meta+` prefixes
(default `Shift+Escape`), empty for none.

## Checks

- `gameengine cheat list` shows yours with the right group, params and defaults.
- A game test runs each new sim cheat and asserts its effect (`gameengine test --js both`).
- `gameengine build android --config release --dry-run --report` has no `cheats:` line.
- `gameengine cheat list` also lists `Engine: engine.perf`, `Engine: engine.capture` and `Engine: engine.crash`; a game test that pins the list includes them.
