---
name: ecs-systems
version: 1.15.0
tier: required
description: How to write gameplay as ECS systems in Game Engine — schema components and resources (gameengine gen), defineSystem, queries and chunks, commands, events, stages and ordering, run conditions (runIf, runOn, skipUnchanged) and work that scales with change. Use when adding or changing game logic, components or a system.
---

# ECS systems

**Types** live in `schema/*.schema.ts`; run `gameengine gen` after editing them.

```ts
export const Bubble = component('Bubble', { radius: f32(), speed: f32() }, { sim: true });
export const Game = resource('Game', { score: u32() }, { sim: true });
```

**A system** declares everything it touches; the engine hands it column views.

```ts
export const Rise = defineSystem({
  name: 'Rise',                     // stable: it keys the RNG stream and hot reload
  after: ['Spawn'],                 // ordering within the stage (default stage: Update)
  query: query(read(Bubble), write(LocalTransform)),
  resources: [write(Game)],
  events: [Tap],
  run(ctx, q) {
    for (const c of q.chunks()) {
      const pos = c.col(LocalTransform).position;   // flat typed array, 3 lanes per row
      for (let i = 0; i < c.length; i++) pos[i * 3 + 1] += c.col(Bubble).speed[i]!;
    }
  },
});
```

- **Names:** every system name is the game's except `gameengine.*`, the engine's and its packages' systems (`gameengine.UI` is `defineUI`'s name when you give none; an unnamed `defineStreaming` is `Streaming`); two systems of one name fail at boot. Types and enums are the same: one named like an engine type is refused by `gameengine gen` and when the game loads (`<Name> is an engine type; rename yours and run gameengine gen`), never merged into the engine's.
- Structural changes go through `ctx.commands` (`spawn`, `despawn`, `insert`, `remove`, `spawnPrefab`); they apply at the end of the step.
- **When commands land.** A sim system's commands apply **at the end of the step**, after every
  `PostUpdate` system. So a system later in the same step — including a `PostUpdate` one — still
  sees an entity despawned in `Update`, with its old component values; only the next step's
  systems, and this frame's `LateUpdate`, do not. A presentation system that reads a piece the sim
  just removed draws it one more frame: mark it in the sim first (a `Dead` field or tag the look
  systems skip), or read the sim state the despawn follows from, never the entity's absence.
  A `LateUpdate` system is the other way round: its commands apply as it returns, before the next
  system and before the frame is drawn, together with the in-place writes of its own run. So
  mixing `c.set(T, i, …)` (write query, in place) with `ctx.commands.set(e, T, …)` in one
  LateUpdate system is safe — both show in the same frame — and in a sim system the command lands
  a step later than the in-place write. Prefer one or the other per component, so the order is
  obvious to the next reader.
- **LateUpdate reads step values, the frame draws blended ones.** A frame draws each moving
  entity between the last two sim steps, blended by `RenderTime.alpha` (0: the previous step, 1:
  the latest), while a `LateUpdate` system reads the latest step's components. So art a look
  system picks from sim state (a frame index from a progress field) runs up to a step ahead of
  the transforms on screen: blend the value too (`prev + (cur - prev) * alpha`, with `prev` kept
  in a presentation component), or place the follower with `drawnTransform(e)`. A pose that
  jumps (a cell turning 180°, a chain snapping back, a respawn) slides or spins for a frame
  unless the step that moves it calls `teleport(e)`, which draws that step's move at once
  (skill `sim-boundaries`).
- **Prefabs from gameplay:** `const e = ctx.commands.spawnPrefab('prefabs/enemy.prefab.json', { position: [x, y, 0] })` (also `rotation`, `scale`, `overrides: { Health: { hp: 3 } }`) spawns the whole prefab, children linked, at the end of the step; `e` is a temp id later commands can use (`ctx.commands.insert(e, Parent, { entity: p })`). Keep the prefab in a loaded asset group so it is never read from storage mid-step. For many short-lived copies use a pool (skill `asset-memory`). **Many at once** (a room's 350 props, a level's coins): `ctx.commands.spawnMany('prefabs/coin.prefab.json', [[x, y, 0], …], { overrides })` is one host call for all of them (each entry `[x, y, z]` or `[x, y, z, qx, qy, qz, qw, sx, sy, sz]`, at most 4096 a call), returning the roots' temp ids in order; a loop of `spawnPrefab` costs a call each.
- **Run conditions:** `runIf: { resource: GamePhase, field: 'state', value: 'Playing' }` (or a list,
  all must hold; `op: '!=' | '<' | '<=' | '>' | '>='`; `{ resource }` alone = the resource exists;
  `{ resource, field }` = the field is non-zero; `value: { resource: Level, field: 'minMoves' }`
  compares two fields; `{ query: query(withTag(Falling)) }` holds while some entity matches, and
  with `changed()`/`added()` while a row changed since the system last ran; `{ changed: Board }` or
  `{ changed: [Board, Tile] }` while that resource or a row of that component was written since it
  last ran; `{ event: Tap }` while a Tap is pending; `{ any: [condA, condB] }` holds while one does,
  up to 64 conditions nested 8 deep). The engine checks it before calling the system, so menus skip
  level systems for free. A skipped system's `changed()` filters catch up on everything since it
  last ran. Writes applied after a system ran (`ctx.commands`, applied at the end of the step,
  and transform propagation) and writes between steps count once, in its next check. **Give every system the narrowest condition that is true**: a system that runs every
  step with nothing to do still costs a script call (~1 µs on a desktop, 15–40 µs on a low-end
  phone), and an idle screen should call (almost) none.
- **`skipUnchanged: true`:** for a system whose result depends only on what it declares (its
  queries, resources and events), e.g. a label that shows the score or a system that derives
  positions from cells. The engine skips steps in which none of that changed (no row of its
  queries was written, and none moved into or out of their tables; no document changed; no input
  arrived), so an idle screen calls nothing. Spawns and despawns of entities its queries do not
  match do not wake it. Any document write does, unless it lists every document it reads in
  `docs: [progress]` (the handles `defineDoc` returns). A system that follows entity ids stored in
  components to entities its queries do not match must not opt in: their despawn does not wake it.
  ```ts
  export const ScoreLabel = defineSystem({
    name: 'ScoreLabel',
    query: query(read(Score), write(ScoreText)),
    resources: [read(Level)],
    skipUnchanged: true, // runs only when Score rows, ScoreText rows or Level changed
    run(ctx, q) { /* … */ },
  });
  ```
  Only opt in if running it twice in a row changes nothing the second time. Never for a countdown,
  a tween or anything using `ctx.step`/`ctx.time`/`ctx.dt`, a system that draws from `ctx.rng` each
  step, or one that reads tunables, services or `ctx.input` (read input as events). A wrong opt-in
  changes the hash: prove it with `gameengine test --hash-trace` before and `--hash-trace-baseline`
  after (skill `determinism`).
- **Change detection:** a write marks a row changed only if it changes the row's bytes, whether through `write(T)` views or a command (`insert` of a component the entity has, `set`, `setField`), so `changed(T)` queries (and transform propagation) see real changes. Re-inserting the value a component already holds does not wake a `changed(T)` filter or a `{ changed: T }` condition: change a value, or send an event. Prefer `changed()`/`added()` filters and events over scanning every row each step.
- **Work scales with what changed, not with what exists.** When one tile moves, update that tile:
  never rebuild or rewrite a whole board, grid, list or model every step something moves (a full
  `ctx.set` of a big resource, re-deriving every cell's position, re-sorting every entity). Keep a
  dirty flag (a field, a `changed()` filter or an event) and do the work only on steps that set it.
  Size it for the shipped game: 10× the sample's entities should cost the same on a still step.
- **`runOn: [Tap, Swipe]`:** the system runs only in steps with one of those events to read (added to `events` for you); other steps skip it natively, like `runIf`. Use it for systems that only react to events.
- **Resources:** `ctx.resource(T)` returns field views (`ctx.resource(Game).score[0]`), no copy; `ctx.setField(Game, 'score', 5)` writes one field in place. `ctx.get(T, into)` refills `into`; `ctx.get(T)` without it and `ctx.set(T, {...})` allocate (see What a run costs).
- **Keyboard and gamepad:** bind named actions in `input.json` at the project root (`{ "actions": { "moveX": [{ "negative": "ArrowLeft", "positive": "ArrowRight" }], "jump": [{ "key": "Space" }, { "button": 0 }] } }`; keys are `KeyboardEvent.code` names: `KeyA`, `Digit1`, `ArrowUp`, `Space`) and read the `ActionState` entities (compare `name` with `stringId('moveX')` resolved before the loop, `value` -1..1, `pressed`, `justPressed`, `justReleased`) in a sim system; the same input works in the editor's Play view, `gameengine run` and gamepads. A name the engine does not know logs `input.json: unknown key` and never fires. Raw keys come as `KeyEvent { code, down, mods }`, where `code` is `Keys.<name>` from `@gameengine/runtime` (`keyName(code)` goes back), never a browser `keyCode`. The `ActionState` entities outlive scene switches (like resources), so a system that cached nothing keeps reading them in the next scene. Tests press keys by name: `input.key('ArrowRight', true)`. Example: `samples/tile-maze` (`KeysToTarget`).
- **Events:** `ctx.events.read(T)` returns decoded copies (declare `T` in `events` or `runOn`); `ctx.events.forEach(T, (e) => …)` hands one refilled object per event (copy what must outlive the call); `ctx.events.count(T)` counts without decoding; `ctx.events.emit(T, v)` / `ctx.signal` need no declaration, so list only events you read.
- **Comparing strings and assets:** `stringId('red')` / `assetId('texture', 'gems/red.png')` resolve a value inside `run`, before the loop (never interning it; never keep an id at module level: a rollback or a new world replaces the tables); compare the numbers in the loop, or use `c.is(Gem, i, 'kind', 'red')` / `ctx.is(T, field, value)`. `stringOf(id)` and `assetKey(id)` go the other way. Never import `@gameengine/runtime/internal`; lint `no-module-level-ids` flags ids resolved at module level.
- **Entity fields** (`Parent.entity`, your own `entity()` fields) are two `u32` lanes in a view; read one as an `EntityId` with `c.get(Parent, i).entity` (also native) or `entityAt(c.col(Parent).entity, i)` (TypeScript only), never by building it from the lanes. Compare with `===`: `@gameengine/test`'s `world.get` and `world.events` return the same `EntityId`s.
- **Small fixed arrays:** `array(f32(), 8)` in the schema (number kinds, up to 64) is one column of 8 lanes: `c.col(T).samples[i * 8 + k]`, decoded as `number[]`.

**What a run costs.** The engine hands a system only what it touches: a column's views are made on the first `c.col(T)` of each chunk (then reused), a resource's on the first `ctx.resource(T)`, an event's on the first `read`. A declared query, resource or event that a run never touches costs almost nothing, and `q.count` counts rows without any view. Allocation-free in hot loops: views, `q.count`, `c.setField` / `ctx.setField`, `c.is` / `ctx.is`, `ctx.events.count`. Decoding into an object you keep is allocation-free too: `c.get(T, i, into)`, `ctx.get(T, into)`, `ctx.events.forEach`. Allocating: `c.get` / `ctx.get` without `into` and `ctx.events.read` (an object per row, an array per vector field), `c.set` / `ctx.set` (the object literal you pass), `c.rows()`, `q.entities()`, `ctx.commands.*`. A module-level scratch buffer (`const tmp = new Float32Array(3)`) that every use overwrites before reading is fine: it carries no state between runs (skill `determinism`).
- Stages: `PreUpdate`/`Update`/`PostUpdate` are sim (fixed step, hashed); `LateUpdate` runs per frame for presentation and may write only `sim: false` fields. Keep the two in separate files (skill `sim-boundaries`). A LateUpdate system keeps state between frames in `ctx.local(() => ({ … }))`, never in a module `let`.
- **Slow motion and pause:** `timeScale.set(0.5)` / `pause()` / `resume()` runs fewer steps a second, each of the same `ctx.dt`, so never scale `dt` yourself; sim code may call `set` (a hit-stop) but never branches on `get()` (skill `sim-boundaries`).
- **Numbers designers tweak** (speeds, rewards, production times) go in a data asset read through `const Tuning = defineTunables(TuningDef, 'data/tuning.json')`; call `Tuning.get()` inside `run`, never copy it into a module constant, so a dev edit applies at the next step (skill `content-database`).
- **Visuals presentation adds and removes** (a coin pile, a carried stack, labels): LateUpdate cannot spawn, so use a `visualPool` the sim fills once (skill `sim-boundaries`).
- Export every system from `src/main.ts` (and the systems helpers return: `wallClock.feed()`, a visual pool's `system`).
- One system, one job. Many small systems beat one big one; they are easier to test and to move to Rust.
- Tracing "what happens when X": follow the events it emits, then `gameengine call script.systems` for the order.

- Large changing JSON from presentation uses an empty event marker, `emitInputData(marker, encodedJson)`
  and `ctx.inputData<T>(marker)`, with the marker declared in `events` and `runIf`/`runOn`.
  This avoids interning full packet history; see `sim-boundaries`, Large external results.
