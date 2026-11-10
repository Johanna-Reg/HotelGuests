---
name: asset-memory
version: 1.19.0
tier: required
description: Loading, memory and pooling — asset groups, memory budgets per device class (`gameengine memory report`), object pools (pool.warm/take/give), scene switches and loading screens. Use when adding levels or big content, for level-switch hitches, memory over budget, many short-lived objects, preload or out of memory.
---

# Asset memory, pools and loading screens

**Covers:** Memory and loading in Game Engine — asset groups (assets.groups in project.gameengine.json, assets.load/release/stats), loading assets by key (assets.load({ assets })), memory budgets per device class (memory.budgets, tests/budgets/memory.json, `gameengine memory report`), object pools (pool.warm/take/give/takeMany/giveMany/trim, growing pools, `gameengine pool stats`; UI pools are `<Pooled>`, skill ui-mvc-views), scene switches (scenes.enter, EnterScene, Persistent) loading screens (loading.run, loading.boot, LoadingView, LoadingResumed), what memory warnings free, and how sounds count against budgets (decoded size; sound settings, banks and music are skill audio). Use when adding levels or big content, when a level switch hitches or memory is over budget on phones, when spawning many short-lived objects, or for anything about "loading", "preload", "unload", "pooling" or "out of memory".

Design: `docs/design.md` § 7.16, ADR 0070 (groups), ADR 0089 (data in memory). Working example: `samples/level-hop` in the engine repo.

## Asset groups: what is resident, and when

Declare content that loads and goes together in `project.gameengine.json`:

```json
"assets": {
  "groups": {
    "boot":    { "include": ["branding/**", "assets/ui/**", "prefabs/**"] },
    "level-1": { "include": ["assets/level1/**", "scenes/level_01.scene.json"] },
    "world-2": { "include": ["collection:world-2"] }
  }
},
"memory": { "budgets": { "phone-low": { "total": "150MB", "textures": "96MB", "audio": "24MB" } } }
```

- `include`: project globs (`**` crosses folders) or `collection:<name>` (the collection's whole closure, see skill `content-database`). A glob matching nothing is a warning at start.
- `exclude`: globs (or `collection:<name>`) taken back out of what `include` matched — `{ "include": ["assets/level3/**"], "exclude": ["assets/level3/source/**"] }`. An exclude that removes nothing is a warning. Bundles take `exclude` too, for files that must not ship at all (skill `content-database`).
- **Data assets and tilemaps** (`loadData`, `fromTilemap`): a cooked game reads all in-app data into memory at start (up to 4 MB), and a downloaded bundle's when it mounts. Past that, list each level's data in its group: the load reads it and keeps it for `loadData`, the release drops it. `assets.stats().resident.data` is what data holds. Data in memory neither way is read from storage mid-frame: a hitch, logged once per key (`data asset '…' read from storage on the … thread`).
- Groups are read when a session opens: after editing `assets.groups`, restart a headless session (`gameengine session stop --all`, then `run --headless`). The editor restarts its edit engine by itself when `project.gameengine.json` changes, and offers Restart Play while the game runs. An unknown group in a session started before the edit says so.
- **Load** (`assets.load('level-2')`): reads every member on the IO thread (that is the progress), keeps scene and prefab bytes in memory for the sim's scene switch, uploads sprites and 3D content (within a per-frame upload budget) and decodes sounds ahead of use (streamed music is skipped: it plays from its file; skill `audio`). A loaded group is pinned. A member it cannot read is an error in the log, and `gameengine validate` reports it (`E_GROUP`; a pattern that matches nothing is `W_GROUP`, with the hint that paths start at the project root: `assets/…`, `scenes/…`); `gameengine check`'s cooked smoke run fails on both.
- **3D content** goes to the 3D renderer, not the sprite atlas: glTF/GLB and FBX models (with their embedded images), `*.mat.json` and `*.material.ts` materials, and textures whose `.gmeta` says `kind = "texture"` (what 3D materials and particles sample — give every such texture that kind). List a level's models, materials and textures in its group (the `*.material.ts` programs every level shares belong in `boot`). They count against the `textures` budget and are evicted with released groups like sprites.
- **By key** (`assets.load({ assets: ['story/dialog_12', 'story/dialog_13'] })`): for content better loaded piece by piece than as a whole group — a dialog's images, a shop's icons — load, release and wait on the assets themselves, never a group per asset in `project.gameengine.json`. Each key pins the asset and what it needs (a cooked sprite's atlas page, a material's textures) and is evicted after release like a group's member; an image that is also in a group, or shown by two dialogs, is held once. `assets.progress({ assets })` is its progress and `assets.stats().assets['story/dialog_12']` its status. Mix both in one call with `{ groups: 'story-ui', assets: [...] }`. An unknown key throws `E_NOT_FOUND`; at most 256 keys per call. A loose (dev) run pins only the file itself; its atlas page and material textures count only in a cooked build, so check budgets with `--cooked`.
- **Release** (`assets.release('level-1')`): unpins. Members stay resident, so going back is instant, until the device class's budget needs the room: then the least recently released go first. Assets in no group keep the default unload (dropped a couple of seconds after nothing uses them).
- `assets.stats()`: per group status, cooked and resident bytes, progress; totals against the budget; `unowned` is what play loaded outside every group (textures, audio, count); `overBudget` names what is over. `assets.resident()` lists every resident texture and sound, largest first, with the groups holding it (built only when called: a test or a debug panel, not every frame). Over budget with nothing released left to evict is a warning (log + profiler `memory` marker), never a crash: release groups or raise the budget. The warning's log line lists what holds the bytes (each group, loaded or released, and what is in no group), largest first.
- **Memory warnings** (Android `onTrimMemory`, iOS memory warnings): when memory is critically low, or the game is in the background and may be killed, the engine evicts every resident member of released groups that no loaded group pins, whatever the budget, and frees decoded sounds nothing holds (no voice, waiting trigger, loaded bank or group) — logged once as `freed N textures and meshes and M sounds of released asset groups, and K unused sounds` (category `memory`). Loaded groups are never touched, and neither are pools (they are sim state). A sound triggered outside any group or bank may be freed and decodes again on its next play: keep sounds that must never miss in a loaded group or bank. When the app is about to be killed (`TRIM_MEMORY_COMPLETE`) pending saves are flushed to storage as well.
- **On a device**, every eviction is an Info line in the log (logcat tag `gameengine`, category `memory`: `evicted '<key>' (<MB>) of released <groups> over the <class> budget`), and a member that fails to load again after an eviction is a Warn (`render`: `reload of evicted mesh|material|texture '<key>' failed: <why>`); both are rate-limited. A member whose load failed is tried again when a group holding it loads again.
- **Test residency before shipping**: game tests track none by default (`resident` and `evicted` stay 0). Give a test `{ memory: 'phone-low' }` (or run `gameengine test --memory-class phone-low`) and its frames enforce that class's budgets as a phone does; a `renderTest` also draws every frame, so evicted content must load again to draw. A project budget class with a tiny `textures` (`"memory": { "budgets": { "tight": { "textures": 1 } } }`) evicts anything released and not drawn at once: the harshest check that shared props survive level switches (engine example: `samples/orbit-garden/tests/residency.test.ts`).
- Name a model, its material and its textures apart (`cherry.glb`, `cherry.mat.json`, `cherry_skin.png`): files that differ only in extension (`cherry.glb` and `cherry.png`) share an asset alias, and the loose asset database resolves the mesh to the texture.
- These calls are presentation: UI code, loading screens and tests. They throw in sim systems.
- **When**: load at boot and behind loading screens, never mid-play. One group per level or area, one `boot` group for what every screen needs (UI, the launch image, shared effects, pooled prefabs).

## One scene, many levels (levels the sim spawns)

A game that keeps one scene and spawns each level's content from sim systems (a Unity port with
a `LevelManager` that instantiates the next level in place) uses the same groups and a cover,
just without `swap`:

```ts
// UI controller, when the sim reports the level is won (a signal or a resource it watches):
void loading.run({ name: 'level-2', unload: ['level-1'], load: ['level-2'], model: { label: 'Level 2' } });
```

- The sim holds while `level-2` loads, so no step sees half-loaded content; `LoadingResumed { name: 'level-2' }` arrives as recorded input on the step play continues. Spawn the next level in the system that reads `LoadingResumed` (despawn the old one there too, or on the win), or under the cover with `onCovered` (below), not when the win happens: by then its meshes, materials and textures are resident (the group loaded them under the cover), so the spawn uploads nothing.
- The cover stays up after the resume only for `minFrames`; if spawning makes the renderer upload anything the group did not hold (a texture missing from the group), it shows as a pop-in: add it to the group. `assets.stats().groups['level-2']` shows members and what is resident.
- Pools owned by the level's group (`pool.warm(prefab, n, { owner: 'level-2' })`) drain when the next `loading.run` releases the group.
- Record a replay across the switch and pin it on both engines (`--record-replays --filter`, `--js both`): the sim sees only the recorded inputs.

- **Boot groups loaded from UI code**: the first fixed step waits (at most 2 s) for the scene, prefab and data reads of groups loaded before it, so a `boot` group started by `loading.boot` or `assets.load` at startup is in memory for the first steps.

## Budgets and the memory report

- Device classes: `phone-low`, `phone`, `tablet`, `desktop` (from the GPU tier at run time, and `phone-low` for any Android phone reporting at most 3.3 GB of RAM, whatever its GPU; `assets.setDeviceClass` overrides). The boot log says which and why (`memory class phone-low: 2.7 GB RAM (at most 3.3 GB), gpu tier mobile`). Defaults are conservative (`total`/`textures`/`audio` MB: phone-low 192/128/32, phone 320/224/48, tablet 512/384/64); set the project's in `memory.budgets`.
- `gameengine memory report --device phone-low` (cooks for Android if needed): per group its resident size (textures and meshes as cooked; sounds as decoded, 96 KB/s mono and 192 KB/s stereo from each sound's cooked `.audio.json`, streamed music listed apart as 0), the largest assets, and the **peak** of a level switch (the `boot` group plus the largest other; `--always a,b` names the session-long groups). The sounds of the startup banks (`audio.banks`) are a row of their own, `audio.banks (startup)`, always resident and counted in every peak. A `visualPool`'s prefab loads at boot with the startup assets, so its first spawns read memory. Checks `memory.budgets` and `tests/budgets/memory.json`:

  ```json
  { "phone-low": { "peak": "40MB", "groups": { "level-1": "12MB" } } }
  ```

  Exit 1 when anything is over. Run it after adding content; CI runs it for the samples.

## Object pools

Spawning a prefab in play (`ctx.commands.spawnPrefab`, skill `ecs-systems`) expands it and spawns every entity at the end of the step; pools make instances ahead:

```ts
import { pool } from '@gameengine/runtime';
// A level's first step (Level.steps === 0, or on EnterScene): the pool exists from the start of the next step.
pool.warm('prefabs/coin.prefab.json', 8, { owner: 'level-1', name: 'coins' });
// In a system, from the step after the warm: out of the pool (enabled at the end of this step), or null when empty.
// On the warm's own step the pool does not exist yet and take throws `no pool 'coins'`.
const e = pool.take(ctx, 'coins');
if (e !== null) ctx.commands.insert(e, LocalTransform, { position: [x, y, 0] });
// Back in (disabled and hidden at the end of this step).
pool.give(ctx, e);
```

- Warm before the first take: on step 0 for takes from step 1, or behind a loading screen. A game that spawns on step 0 (the template's bubbles) moves its first take to step 1.
- Parked instances are `Disabled` (out of default queries) and `Hidden`. Game tests see them: `world.entities(Bubble)` in a test lists parked instances too, so count or tap only those without `Disabled` (`!world.has(e, Disabled)`), and update existing tests that count entities when you pool them. `take` and `give` go through the command buffer; set the taken entity's state with commands too. Collect entities during a chunk loop and call `give` after it.
- **Pools reset to the prefab; never reset by hand** (ADR 0136). `take` hands a reused instance out as its prefab makes it: transforms, animation and flipbook state, particle effects, `VisualOffset` and every component value back to the prefab's, and components your game added that the prefab lacks removed. `give` stops tweens on it and forgets its bursts. Put per-use setup in `pool.onTake`, at module scope next to your systems; it runs in the taking system right after the reset:

  ```ts
  pool.onTake('coins', (ctx, e) => ctx.commands.insert(e, Coin, { ttl: 50 }));
  ```

  `pool.warm(prefab, n, { reset: 'none' })` keeps an instance as it was given back; `{ reset: [Health, Sprite] }` resets only those types. A reused instance never slides in from where it was parked.
- Pool state is sim state (`pool:<name>` documents, `Pooled` components): hashed and replayed. Call pool functions from sim systems only.
- **Owner**: an asset group name makes the instances `Persistent` (they survive scene switches) and a loading screen that releases that group drains the pool. No owner: the pool belongs to the scene and goes with the next switch. `pool.drain(owner)` drains by hand.
- **Sizing from data** (ADR 0094): `pool.stats()` gives each pool's `size`, `free` (idle), `peak` (most in use at once), `misses` (takes that found it empty) and `grown`. With a session running (`gameengine run --headless`), `gameengine pool stats` prints them with a suggested warm count; play the busiest level, then warm that many.
- **Growing pools**: `pool.warm(prefab, n, { grow: true, max: 64 })` hands out a new instance on a miss instead of `null` (spawned through the command buffer, so its id is temporary until the end of the step: give it back on a later step). It stops at `max` (default 4096) and misses again. Pools without `grow` never grow, and their state hashes exactly as before.
- **Trimming**: `pool.trim(name, keep)` (sim) despawns idle instances above `keep` at the start of the next step, longest parked first — after a boss wave, before a quieter level. `pool.resetStats()` restarts `peak`, `misses` and `grown`. `peak` is diagnostic (not hashed, not rolled back), so it reads `null` inside sim systems; read it from tests, the CLI or presentation.
- **Pool ECS entities, not UI nodes.** An idle entity costs nothing per frame (it is out of queries and hidden). A UI node hidden with `display: none` or `opacity: 0` is still in the tree: before ADR 0094 it was restyled and laid out every frame (a 61-slot HUD pool took a game from 30 to 8 fps). For UI, use `<Pooled>` (it detaches what it parks) or unmount it; skill `ui-mvc-views`.
- Prefabs with children: every entity is disabled, the root hidden (children hide with it).
- **Make a prefab** with the editor's commands, never by writing its JSON: a batch script (`gameengine editor --batch make-coin.json`) with `"new": true`, `"commands"` that build it (`scene.createEntity`, `scene.setComponentField`) and `"save": "prefabs/coin.prefab.json"`; place it in a scene with `scene.instantiatePrefab` (`source`, `parent`, `name`, `overrides`). The commands are listed in `gameengine cmd --list` and `docs/generated/commands.md`. A hand-written prefab or scene fails `validate` with `W_FORMAT` until `gameengine fmt` rewrites it. Keep a scene id and an entity id from sharing a name: they share one namespace (`E_PRECONDITION: an entity already has id …`).
- **Prefabs live in `prefabs/`, scenes in `scenes/`** — never under `assets/`. Builds ship documents only from those folders, so the engine refuses any other path in dev too (`pool.warm: prefab 'assets/…' is outside prefabs/ …`), and `gameengine validate`/`cook` fail on the file and on string literals naming it. Paths you build at run time are only caught by running: `gameengine check` smoke-runs the cooked game.
- **What a take or give costs:** about what a spawn or despawn does — a host call plus two structural changes per instance (`Disabled` off/on every entity of it, `Hidden` off/on its root), applied at the end of the step. Pools save the instantiate (parsing, expanding, WorldTransform), not the table moves. For many at once use `pool.takeMany(ctx, name, n)` (up to `n`; each one short counts a miss) and `pool.giveMany(ctx, entities)` (one host call; a bad entity parks none of them).
- A warm parses its prefab once however many instances it makes. List pooled prefabs in a group loaded before the warm, or the first read of each warm hits storage (logged as "read from storage during a step").

## Scene switches

- `scenes.enter('level_02')` (or a path). From UI code it becomes the recorded `EnterScene` input of the next step; from a system it applies at the start of the next step. At that step, before any system: pools of released groups drained, every entity without `Persistent` (and its children) despawned, the scene loaded with its resources. Resources and world documents persist: reset per-level state from the scene's `resources`, or on `EnterScene`.
- Tag what must live across levels (a game manager, the player's companion) with `Persistent`.
- `scenes.current()` is the scene the last switch loaded (null before any switch).

## Loading screens

```ts
import { loading } from '@gameengine/runtime';
// In a UI controller (LateUpdate), when the level is done:
void loading.run({ name: 'level-2', load: ['level-2'], unload: ['level-1'], swap: 'level_02', model: { label: 'Level 2' } });
```

1. The view (engine `LoadingView`: still image, optional progress bar and label, fades; or any `@gameengine/ui` view whose model takes `progress` 0..100) plays its enter. The game still runs under the fade.
2. Covered: the sim holds (no steps, so no ticks pass however long IO takes), the world is not drawn, `unload` groups are released, `load` groups load; the view gets `progress`.
3. One step runs with the recorded `EnterScene` (the swap), then the sim holds while the renderer uploads textures and builds recorded pipelines for the new world, still covered.
4. `LoadingResumed { name }` arrives as recorded input on the step the game continues; the view exits.

The cover also waits, at most `maxWarmFrames`, for the loaded groups' sounds to decode (`loading.state().audioPending`; streamed music never counts), so a level's effects play on its first step.

**Big levels: put the content in the scene file and `swap` it.** The scene loads natively (no script call per entity) in the one step that runs under the cover, so its cost is hidden there. A level spawned from script in that step (`onCovered` → a system spawning hundreds of prefabs) pays a command per entity instead. A `pool.warm` queued in the swap step makes its instances at the start of the next step, the first one after the cover lifts (with `LoadingResumed`): size warms for that one step (2,000 instances take about 12 ms on a desktop release host, several times that on a phone).

Replays and both JS engines reproduce it exactly: the sim only ever sees the two recorded inputs. Use `LoadingResumed` in a system to start level timers.

- `loading.boot({ load: ['boot', 'level-1'] })` at startup (e.g. in `defineUI`'s root): shown on the first frame with no enter, image from `branding.launch.image`, continuing the platform launch screen.
- **In-place level starts** (no scene swap, groups already resident): pass `onCovered`. It runs once in the frame the cover starts holding the sim, and what it `emit`s lands on the one step that then runs under the cover (always, even without `swap`), as recorded input — deterministic and replayable:
  ```ts
  void loading.run({ name: 'level-5', onCovered: () => emit(StartLevel, { level: 5 }) });
  ```
  That step also carries `EnterScene { scene: '', release: '' }` (nothing to switch); a system reacting to `EnterScene` should ignore an empty `scene`. Don't emit the start event yourself after checking `loading.held()`: with resident groups the swap step can run before UI code sees the hold.
- The cover draws above every view (views have layers; the cover's is the top one): a HUD or menu the game pushes while it is up lands under it, and `views.clear()` / `views.pop()` leave it alone. Clear the old level's views and push the new ones under the cover in `onCovered`.
- `loading.active()`, `loading.progress()`, `loading.held()` for controllers and tests. One loading screen at a time.
- Custom views: `defineView<{ progress: number }>({ …, enter, exit })`, passed as `view`. Animate with CSS `@keyframes` or `fx-*` effects: they run on the UI clock while the sim holds.
- Warm-up waits until every loaded group's textures and meshes are on the GPU, so nothing pops in after the cover; past `maxWarmFrames` (120) it logs a warning naming what is still uploading and keeps waiting until `stallFrames` fails the run. Pipelines and sounds wait at most `maxWarmFrames`. `minSeconds` keeps a logo up for real time (the same at 30 and 60 fps; `minFrames` counts frames).
- A test with `{ memory: 'phone-low', loading: 'device' }` uploads at the class's per-frame budget, one draw a frame, as the phone does, so a cover's timing and any pop-in after it show in the test. Without it, every frame waits for its own assets.
- `gameengine validate` warns `W_TEXTURE_SIZE` for a texture that cooks above 2048 on phone-low (the cooker's default `max_size` is 4096): add `max_size = 2048` to its `.gmeta`, or cap phones only under `[settings.overrides.phone-low]`.
- **A world that builds over several steps** (a recycling streaming ring, skill `open-world-streaming`): `runSim: true, until: () => city.ready()` resumes the sim under the cover (`LoadingResumed` arrives then) and, once what it brought in has drawn (3 to `maxWarmFrames` frames), lifts the cover only once `until` holds. `until` reads sim state only; one that never holds fails the run after `stallFrames`.
- A step that throws under the cover (e.g. the swap step's `pool.warm` on a missing prefab), or a run with no progress for `stallFrames` (1800), fails the run: the cover lifts, the error is logged (category `loading`; dev builds also show it as a red banner) and the promise rejects. Handle the rejection if the game can recover; never swallow it silently.

## Smaller content

- Textures: `compression = "astc6x6"` in a texture's `.gmeta` (or on every sprite of an atlas group) cooks ASTC 6×6 on iOS and Android: 44% of the default ASTC 4×4. Check sharp art in a screenshot.
- Backgrounds and other soft, opaque full-screen art: `compression = "etc1s"` cooks Basis ETC1S on iOS, Android and web, about a quarter of ASTC 6×6 to download (a 1024×2048 backdrop: 0.2 MB against 0.9 MB) and as small as ASTC 4×4 on the GPU (it is transcoded on load). It blurs fine detail and shows faint 4×4 blocks up close: not for UI, text, pixel art or sharp edges. `gameengine texture inspect <key> --device ios` shows what a phone gets.
- Art authored much larger than it is drawn (a 2048² board drawn at 540 px): `max_size = 1024` in its `.gmeta` caps its cooked size (halving the side quarters the bytes); 9-slice borders stay in source texels (skill `atlasing`).
- **Smaller on low-end phones only:** `[settings.overrides.phone-low]` then `max_size = 512` in a texture's `.gmeta` uploads a smaller mip there from the same cook (a mip skip; no per-class bundles). A texture without mips is cooked with extra levels down to its smallest override, and exactly one uploads. `gameengine memory report --device phone-low` counts it. Atlas sprites are excluded (`W_OVERRIDE_FIELD`). Skill `device-tiers`.
- Source art kept in the repo only for baking or re-exporting: `exclude` it from the bundles (`"exclude": ["assets/source/**"]`) so it neither ships nor warns; `gameengine cook --report` lists it under `excluded`.
- Sounds: decoded sounds cost 96 KB per second mono, 192 KB stereo, whatever their cooked size; `mono = true` halves that and the file (skill `audio`). Keep long music out of groups and banks: streamed tracks are skipped automatically, but a track short enough to cook to ADPCM is decoded whole.
- `pipelines.json` warm-ups record material programs, not level content: re-record (`gameengine test --tier t1 --record-pipelines`) after upgrading so boot stops loading every level. Each run replaces the tiers it records, so it must play every flow (skill `testing`).

## Sounds

Sound settings (`.gmeta` `mono`, `codec`, `stream_after`, `bitrate`, `loudness`/`normalize`,
`cooldown`), banks, music and when a trigger plays are in skill `audio`. For memory: list each
level's effects in its group (decoded behind the cover, freed with the release), keep the boot
bank to sounds every screen uses, and leave music out of both.

## Check it

- A world test drives the flow with frames: `while (loading.active()) await step(1)` — held frames run no step. `await loaded()` (world test context) runs frames until no loading screen is up, the boot cover included: start a test with it when its input must land on playable steps rather than wait under `loading.boot`'s cover. Assert `loading.held()`, the scene (`scenes.current()`), `pool.stats()`, `assets.stats().groups[...]`, pin with `expectHash`, and record a replay of the switch (`--record-replays --filter`). `gameengine test --js both`.
- Tests run on loose files; `gameengine test --cooked` runs them on a fresh cook, and `gameengine check` boots the cooked game for `check.smoke.frames` (600) frames with `check.smoke.input` (recorded input that reaches a level switch) — give it input that crosses your loading screens. Its frames forbid storage reads as a player's do: each `synchronous asset IO (…) on the frame thread` it reports is a read a device blocks on mid-frame (a debug build panics on it) — put that file in the group loaded before it is used.
- `gameengine memory report --device phone-low` for budgets; `profile.markers` shows `memory over-budget`; for a running session `gameengine call profile.memory` gives resident, texture and audio totals; per-group numbers come from `assets.stats()` in game code or a test (it is a script op, not a protocol method).
