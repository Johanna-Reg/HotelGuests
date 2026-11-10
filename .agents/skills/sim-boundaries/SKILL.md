---
name: sim-boundaries
version: 1.16.0
tier: required
description: The one-way flow input → sim → presentation — what each layer may read and write, what enforces it, and what to do instead of reading cameras, real time or UI from sim code. Use when a system, view, effect or controller needs data from another layer.
---

# Sim boundaries: input → sim → presentation, never back

Replays, `--js both`, device parity and rollback all re-run the sim from recorded input and
compare state hashes. That only works if the sim depends on nothing but its input and its own
state. Presentation may lag, drop frames or differ per device; it must never feed back.

| Layer | What it is | Reads | Writes |
|---|---|---|---|
| **Input** | Device input recorded per step | — | `ctx.input` events, `Tap`/`Swipe` events, the PC mouse (`PointerHover` with the left button up, `MouseDown`/`MouseUp` for the other buttons, which drive no gesture; `MouseWheel`), `PointerState`, `ViewInfo`, `DeviceMotion` (tilt), `PlayerInputs` (via `playerInput`); UI `emit(Event)` |
| **Sim** | `PreUpdate`/`Update`/`PostUpdate` systems (the default stage) | input above, `sim: true` components/resources/events, `ctx.rng`, `ctx.dt`/`ctx.step`/`ctx.time`, `WorldView`, documents | `sim: true` state, documents (`defineDoc`), events, commands; it may also *write* presentation components, write-only through commands (`ctx.commands.set(e, MeshRenderer, { color })`) |
| **Presentation** | `LateUpdate` systems, `defineUI` controllers, views (`*.view.tsx`), VFX, audio, cameras, tweens on visuals | anything sim, `sim: false` state, `RenderTime`, `gameengine.clock`, `gameengine.kv`, `services` | `sim: false` fields only; sim changes go back as input (`emit` an event) |

## Where it is enforced today

- **Binding** (`gameengine-bind`): a sim system whose query or resources name a `sim: false` type fails with `E_SCHEMA … may not read presentation type` — `write(T)` too, since a write query's column is readable and presentation changes it; set presentation fields with `ctx.commands.set` (applied at the end of the step); a LateUpdate system that writes a `sim: true` type fails with `… may not write sim type`.
- **LateUpdate** (`gameengine-sim`): structural commands (spawn, despawn, remove) are refused (`LateStructural`); it gets its own RNG streams and empty `ctx.input`, and never changes the hash.
- **Runtime guards** (`@gameengine/runtime`): inside a sim system `Math.random` and `Date.now` throw (`boot.ts`), and so do `gameengine.kv`, `gameengine.clock.wallNow`, `gameengine.crash.describeStack` and `services.*`. `defineDoc(...).set/update` throws *outside* a sim system: documents are sim state.
- **Hash** (`gameengine-ecs`): only `sim: true` columns and resources are hashed, so presentation can change freely without breaking replays — and cannot rescue a sim that reads it.
- **Lint** (`@gameengine/eslint-plugin`):
  - `no-presentation-read-in-sim` — `read/write/withTag/without/changed/added(T)` or `ctx.get/resource(T)` of a `sim: false` type inside a sim system.
  - `no-presentation-import-in-sim` — a file that defines a sim system (any `defineSystem` not in `LateUpdate`) imports `@gameengine/ui`, `@gameengine/vfx`, `@gameengine/materials`, a `*.view.tsx` or any `.tsx` module (type-only imports are fine); and `gameengine.kv`, `gameengine.clock`, `services.*`, `quality.*` (including `quality.device()`; it throws in sim) and `platform.*` used inside a sim system. Per-device differences go in content `overrides` (skill `device-tiers`), never in sim code. Extra modules: `{ modules: ['./juice.ts'] }`.
  - `no-sim-nondeterminism` — wall clock, `Math.random`, `Math.sin`/`hypot`/… outside LateUpdate, and `DEV` inside a sim system's `run`.
  - `no-di-in-sim` — a file that defines a sim system imports `@gameengine/di`; the container is presentation-only and its APIs throw in sim (skill `dependency-injection`).

## How tests rely on it

- `worldTest` drives only input (`tap`, `swipe`, `input.*`) and asserts on sim state; replays store only `InputFrame`s plus the hash stream. Anything the sim reads that is not in that stream breaks `worldTest.replay` and `gameengine replay verify`.
- `gameengine test --js both` compares hashes of V8 and Hermes; presentation differences between them are invisible, sim differences fail.
- T1 goldens capture presentation from a fixed step count, so presentation must be a function of sim state (plus its own seeded RNG).
- `gameengine replay play`/`load` (and the editor's replay) show the recorded session only as far as the screen is derived from sim state: during playback every `services.*` call, `storage` reads included, answers with its mock (a save read returns `found: false`, so `defineSave(...).load()` gives the defaults with `fresh: true`). A view that decides from a save read in presentation (a first-launch popup, "welcome back", the best score) shows the mock's answer, not what the recorded player saw.
- Views render alone from samples (`gameengine view render`) because they never touch the world.

## Common temptations, and what to do instead

| Temptation | Instead |
|---|---|
| Read `Camera` in sim to convert a tap to world space | Tap events and `PointerState` already carry world coordinates; the sim owns `WorldView` and the camera follows it |
| Move the camera from gameplay | Write `WorldView` or set `WorldViewFollow` (2D, sim); in 3D put `CameraFollow`/`VirtualCamera` on presentation entities (skill `camera`) |
| Real time (production while the app is closed, cooldowns, daily reward) | Export `wallClock.feed()` and read the `WallClock` resource (`ms`, `tzOffset`) in sim: the device clock arrives as recorded `WallClockTick` input, never goes back (a clock set back holds it), and tests move it with `clock.set/advance`. In-level timers and animation clocks stay on `ctx.step`/`ctx.time` |
| Spawn visuals from LateUpdate (a carried stack, a coin pile, floating labels) | A `visualPool({ name, prefab, size, draws: Sprite })` (ADR 0091; `draws` names the root's drawn component, so unused items get `visible: false` and are culled): export its `system` (the sim spawns the items once), and in a LateUpdate system `const f = pool.begin(q)` over `pool.query()`, `f.show(x, y, z, scale)` per visual, `f.end()`. Only `VisualOffset` changes, so the hash never sees it |
| A constant a system imported, edited while the game runs | `defineTunables(Token, 'data/…json')` and `get()` it in the system: a dev edit reaches the sim as recorded `TunablesChanged` input at one step (skill `content-database`) |
| UI decides a rule ("can afford?", "level won") | The sim decides and exposes the result in a resource; UI shows it and `emit`s intents (`PurchaseRequested`), the sim validates them |
| Sim reads a settings value (`kv`, services, locale) | UI reads it and sends an event, or it is a sim resource written from recorded input |
| A view decides from the save (first-launch popup, onboarding done, welcome back) with `defineSave(...).load()` in UI | Keep that state in a persisted meta (`metaInWorld(meta, { persist: true })`, skill `meta-economy`): the save reaches the sim as recorded `MetaLoaded` input, so replays show what the player saw. The view waits for `state.loaded()` (before it, `get()` is the initial state) and reads `useDoc(state)` |
| Gameplay waits for an animation or particle to finish | Keep the duration in sim (steps or a timer component); presentation plays it in the same time |
| An effect that follows a moving entity (a wake, a ring, a label) | Read `drawnTransform(e)` in LateUpdate: where the entity is drawn this frame (blended between steps, `VisualOffset` included). `WorldTransform` is where the last step left it, so a follower reading it lags or leads. A sim move that must not slide (a respawn, a portal): `teleport(e)` in that step |
| A tween/VFX on a sim value | Tween a presentation copy (`VisualTween`, sprite offsets) in LateUpdate; the sim value jumps |
| Shake, lean or pop an entity (tap shake, board shake, hint lean, scale pop) | Give it a `VisualOffset` where it is authored (scene, prefab, or the sim's spawn command) and write `position`/`rotation`/`scale` from a LateUpdate system (`write(VisualOffset)`). It is drawn over the sim transform, its children follow, and the hash, physics and sim queries never see it; never write `LocalTransform` for juice. Never place, turn or size an entity with it: author the pose in `LocalTransform` and leave the authored `VisualOffset` at rest (`{}`), or the editor's gizmo sits away from the drawn object and Inspector edits snap back to what LateUpdate writes (`gameengine validate` warns `W_VISUAL_OFFSET`) |
| A UI label or flying reward follows a 2D sprite | `worldToUi(x, y)` from the UI controller: UI reference px through `WorldView` and the canvas scale (`uiToWorld` back); the 3D twins are `worldToScreen`/`screenToWorld` (perspective camera first, else a tilted orthographic one) |
| Tint a mesh or flip a sprite from gameplay | `ctx.commands.set(e, MeshRenderer, { color })` in the sim system (write-only, applied at the end of the step), or a LateUpdate system that derives it from sim state |
| Extra checks or cheats in dev (`if (DEV)` in a system) | Never branch sim code on `DEV` (false in cooked builds, so hashes differ); gate debug overlays and logs in presentation; a cheat is a `defineCheat` in a `*.cheats.ts` file, and a sim cheat runs from a recorded `CheatRequested` event (skill `cheats`) |
| Tilt controls (roll a ball by tilting the phone) | `motion.setEnabled(true)` when the tilt screen starts (`false` when it ends; it resets on world rebuild), then read `ctx.get(DeviceMotion).gravity` in the sim: gravity in g in screen axes (+x right, +y up, +z out of the screen; zero until the first reading), recorded input in 1/4096 g steps, so replays and both JS engines agree. Tests inject readings with `input.motion(x, y, z)`; the sensor only runs on phones |
| Show text in the player's language | Nothing to do: phones use their language when `locales/<lang>.json` (or its base language) exists, else `text.language`. Presentation code reads it from `quality.device().language`; sim code never branches on it (devices differ) |
| Show the device, OS, app version, build config, engine version or locale (support screen, analytics, a flavour's services) | `platform.info()` and `await platform.storage()` from UI controllers or startup code: presentation only, they throw in sim. `app.config` (`dev`, `probe`, `release`) tells a probe from a release, which `DEV` cannot, and `app.cheats` says the build carries cheats; both are `null` outside a built player. The channel and running content release are `releases.status()`. A phone re-reads `locale` on returning to the foreground; a desktop reads it once at start. Missing values are `null`, and `target`, `os.name` and `formFactor` are open: keep a default branch. Tests answer a fixed value (`host: 'test'`), except `engine.version`, which is the real one and changes with every engine update: compare it by shape, never in a whole-object `toEqual` |
| Slow motion, a pause menu, a hit-stop | `timeScale.set(0.3)` / `pause()` / `resume()` (`@gameengine/runtime`, Unity's `Time.timeScale`, 0–4): it paces the fixed-step clock, so fewer steps run a second and each keeps its size; hashes and replays are unchanged. Tweens, Animator, particles, flipbooks and physics slow with it; UI, cameras and LateUpdate keep wall time, so a pause menu still animates. `set` is allowed in sim (a hit-stop), `get` is presentation only, and a paused sim runs no step, so only UI code can resume it. It resets to 1 on a world rebuild; `gameengine test` steps by count and ignores it. Never scale `ctx.dt` yourself |
| A LateUpdate system that remembers something between frames (a footstep timer, the last value a sound followed) | `const s = ctx.local(() => ({ lastStep: 0 }))`: the same object every run of that system, never hashed, recorded or rolled back, made again on a new boot (a new world, a test). LateUpdate only (it throws in sim); not a module-level `let`, which survives world rebuilds and leaks between tests |
| Cap the frame rate while a menu shows | `quality.setTargetFps(30)` from the screen's UI controller: presentation only, never in the hash or replays |
| A click or menu sound from UI code | `audio.play(key, { bus: 'UI' })` from the controller (Button `sound` does it for you): presentation, never in the hash; emitting `PlaySound` from UI would record it as sim input |
| React to the app leaving or returning, or quit it | `app.onLifecycle((state) => …)` (`'background'`: save now; `'foreground'`: refresh) and `app.quit()` (false on iOS, which never quits itself), from presentation code; the sim does not run while backgrounded |
| Shared helper imports `@gameengine/ui` | Split it: pure logic in a `.ts` module the sim imports; the signal/view glue next to the controller |

## Large external results

Do not put changing full JSON snapshots in an event string field: the world interns every
unique string for its lifetime. Declare an empty `sim: true` marker and use the transient
recorded-input API (ADR 0273):

```ts
// schema: export const SnapshotArrived = event('SnapshotArrived', {}, { sim: true });
// presentation:
emitInputData(SnapshotArrived, validatedWireJson); // from @gameengine/runtime
// sim system: events: [SnapshotArrived], runIf: { event: SnapshotArrived }
for (const value of ctx.inputData<Snapshot>(SnapshotArrived)) applySnapshot(value);
```

Pass encoded JSON to avoid serializing whole snapshots again inside the API. Payloads must
fit 512 KiB UTF-8 and 64 JSON container levels; marker names fit 128 UTF-8 bytes. The live UI outbox permits eight pending data records
and 2 MiB of encoded payload, rejecting excess with `E_BACKPRESSURE`. Apply results only in
sim. Empty marker rows retain normal event scheduling; payloads stay in the current recorded
input frame, so replays retain them without a growing world string table. Ordinary small typed
events remain the default. Full engine browser builds support this API; playable ads reject it.
Check native V8/Hermes and the web hash lane, plus actual service input in a compiled player.

Ordinary `ctx.input` keeps empty marker rows without their large payloads. Use `ctx.inputData`
to read those values; it selects one marker and decodes it once per system context. Different
contexts receive separate values, and the cache does not survive a step.
