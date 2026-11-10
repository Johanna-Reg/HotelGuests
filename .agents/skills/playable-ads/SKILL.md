---
name: playable-ads
version: 1.6.1
tier: required
description: Playable ads — cut a game slice in playable-ads/<ad>/, verify it, rewrite it for the web, story-video ads (*.story.json, createStoryVideo), then `gameengine playable build|validate` per network (AppLovin, Unity, Meta, Google, TikTok…). Use for any playable, HTML5, MRAID or interactive video ad, end card, loading phase or size problem.
---

# Playable ads (ADR 0069)

**Covers:** Making playable ads from the game in Game Engine — cut an engine slice in playable-ads/<ad>/, verify it in the engine, rewrite it for the web against playable-ads/_shared/runtime, then gameengine playable export-assets | build | validate per ad network (AppLovin, Unity, ironSource, Google, Meta, Mintegral, TikTok). Use for any playable ad, HTML5 ad, MRAID ad, end card or ad-network size problem.

A playable ad is a single HTML file the ad network runs in a web view. The engine is not its
runtime: you **cut a slice of the game** that runs in the engine, then **rewrite that slice for
the web** against the shared web runtime. Nothing under `playable-ads/` ever ships in the game.

## First, ask the size target

Before cutting anything, ask the user which cap the ad must fit, unless they already said:

- **Below 2 MB:** every network, Meta included.
- **Below 4 MB:** every network but Meta (ironSource is the tightest left).
- **Below 5 MB:** AppLovin, Unity, Google, Mintegral and TikTok only.

Put only the networks that fit in `playable.json` `networks`, and plan the slice to the cap:
images, audio, skeletons (~600 kB evaluator) and physics (below) all count against it. Report the
built size against that cap, not only against each network's.

## Workflow

1. **Create:** `gameengine playable new <ad> [--from-scene scenes/x.scene.json] --json`.
   You get `playable-ads/<ad>/` (slice project, `playable.json`, `web/`) and, the first time,
   `playable-ads/_shared/runtime/`.
2. **Cut the slice** in `playable-ads/<ad>/src/main.ts`: re-export only the game systems the
   ad's loop needs (`export { SetupBoard } from '../../../src/board.ts'`), add ad-only systems
   (a timeout, a scripted first move) in the slice's own `src/`, and set the ad's numbers in
   its scene (`scenes/`). Import from the game; never import the ad from the game — the
   bundler fails that. Ad-only art goes in `playable-ads/<ad>/assets/`, never in the game's
   `assets/` (it would ship). The game's `assets/` are readable from the slice as they are.
   **New presentation is allowed, inside the slice:** you may author new effects (`*.vfx.json`,
   or `*.vfx.ts` with its compiled `*.vfx.gen.json`), 2D skeletons and animations
   (`*.skeleton2d.json`, `gameengine anim2d` edits) and flipbooks (`*.clip2d.json`,
   `SpriteAnimation` frames) for the ad, in `playable-ads/<ad>/assets/`. Never add or edit them in
   the game's `assets/`: to change a game effect, rig or clip for the ad, copy it into the slice
   under a key of its own and edit the copy. The slice reads its own assets before the game's.
3. **Verify in the engine:** `gameengine playable run <ad> --headless --steps 600 --json` (hash,
   entities), a session + `gameengine screenshot`, or the editor's Playable Ads mode → Run slice.
   The loop should read in 30 seconds: first move within 3 s, a win or a clear end.
4. **Physics.** A slice may use the game's physics (`RigidBody2D`, `Collider2D`, `Joint2D`, the 3D
   bodies); it runs in the engine like any system. The web side is the constraint: the
   `@gameengine/playable` profile runs 3D physics on the engine's own Jolt bridge (Box, Sphere,
   Capsule and ConvexHull bodies, no joints or characters; about 530 kB of the ad,
   `playable-ad-porting` § 3D physics), but not 2D physics yet (Box2D is proven bit-identical in
   wasm, about 150 kB, 67 kB compressed; the mirror module is in progress, ADR 0023 amendment), so
   a slice with 2D physics is a **rewrite** for now. Before you choose, ask whether the loop needs
   real physics: a throw, a drop or a bounce that only looks physical is often a tween or simple
   kinematics in a slice system, which ports. Keep the physics the loop does need small (a few
   bodies, short runs), and count the physics module against the size target.
5. **Port or rewrite for the web.** When the slice's systems fit the playable profile, port it:
   the ad runs the slice's own systems on `@gameengine/playable` (skill `playable-ad-porting`,
   proved with `gameengine playable verify <ad>`). Otherwise **rewrite** it in `playable-ads/<ad>/web/main.ts`: same rules, constants, tween
   lengths (engine steps − 1, at 60 Hz) and ease names (`Tweens` uses the engine's), drawn on
   the `createStage()` canvas. Import assets from `playable:manifest` (`images`, `sounds`,
   `videos`, `ad`; a video over the board plays through `createAlphaVideo` from `@gameengine/playable`,
   stacked alpha by default, skill `playable-ad-porting`; a story told in full-screen clips is § Story video); list them in `playable.json` `assets` as key → asset alias (`"gem_red": "tiles/gem_red"`).
   Port pure rules (matching, scoring) as plain functions; keep DOM and canvas code apart.
6. **Build and validate:** `gameengine playable build <ad> --json`, then
   `gameengine playable validate <ad> --json`. Fix every failed check; read `results[].checks`.
7. **Look at it:** the editor's Playable Ads mode shows `dist/preview` in phone frames, with a
   size meter per network (off by default: the user switches it on in the Mode picker's Library).
   Tell the user what to try there.
8. **Check it plays:** `gameengine playable validate <ad> --run` plays each build in headless
   Chromium with every loading phase failing, taps until the end card shows and checks the
   network's store call fired.
9. **Promote:** when the same web code (a gem renderer, a hand tutorial, a board) is used by a
   **second** ad, move it into `playable-ads/_shared/` and import it from both. Not before.

## Loading phases (ADR 0348)

The first frame waits for **core** only. Put what the first seconds do not show in phases:

```json
"phases": [
  { "name": "audio", "assets": ["swap", "match"], "start": "first-touch" },
  { "name": "level2", "assets": ["level2_board", "boss"], "deadlineSec": 12 }
],
"endCard": ["icon"],
"budgets": { "coreBytes": 300000 }
```

- Every asset key no phase lists is core. List phases in the order the player needs them.
- `start: "first-touch"` for what only matters once the player plays (sounds: audio is silent
  until the first touch anyway). `deadlineSec` (default 10) is when the phase counts as missed.
- `endCard` keys stay in core (the build refuses otherwise): the CTA never waits on a phase.
- In `web/`: `const loader = createPhaseLoader(phases)` (from `@gameengine/playable/phases`,
  `phases` from `playable:manifest`), `loader.start()` once core is decoded, then
  `loader.whenReady('level2').then(use, fallback)`. `p.decoded` has the images decoded,
  `p.sounds` go to `Sounds.add`. On a missed phase **always have a fallback**: a lighter variant,
  skip ahead, or the end card. A missed phase keeps loading: for content that is still useful
  late (sounds), add it from `loader.on` when its state turns `ready`, not only from `whenReady`.
- Never call the loader from a system: it throws in sim. Phases hold `assets` only; the start
  scene, `data`, clips, effects, skeletons and wasm stay in core.
- Transports come from the network: inline in the HTML everywhere, files in the zip on Google and
  TikTok (`dist/<network>.zip`, upload that). A network in `playable-ads/networks.json` may allow
  `remote` phases from `remote.base` (`--remote-base`); never for the seven built-in networks.
- Try a slow and a failing network in the editor preview (**Loading**), and run `validate --run`.
- `playable:start`, `playable:first-touch`, `playable:phase`, `playable:end-card` and
  `playable:cta` are window events for the company's own tracking; the ad itself sends nothing.

## Story video (ADR 0433)

An interactive "choose what happens next" ad made of clips: no game slice and no sim, only the web
side. One opaque clip plays at a time under the canvas; the ad's code draws captions, choices and
the end card over it.

```json
{ "start": "intro",
  "clips": {
    "intro":  { "video": "intro", "end": { "go": "wait" } },
    "wait":   { "video": "wait", "cues": [{ "id": "pick", "time": 0.4, "wait": {
                  "choices": { "left": { "go": "left" }, "stay": { "go": "ending", "at": 1.2 } },
                  "loop": { "from": 1 }, "timeoutSec": 8, "timeout": "stay" } }] },
    "left":   { "video": "left", "end": { "go": "ending" } },
    "ending": { "video": "ending", "end": { "go": "idle" } },
    "idle":   { "video": "idle", "cues": [{ "id": "endcard", "time": 0.5, "wait": { "loop": true } }] } } }
```

- **The file:** `web/<ad>.story.json`, imported by `web/main.ts`. `video` is a key in
  `playable.json` `assets` (`.mp4`, H.264). `cues` are sorted by time; each has an `action`, a
  `wait` or neither (then only your `onCue` sees it). Actions: `{ "go": clip, "at": s }` (the same
  clip is a seek), `{ "install": true }`, `{ "end": true }`. A clip's `end` runs when it plays out;
  without one the last frame stays.
- **Waits:** without `loop` the clip pauses on the cue; with `loop` (`true`, or `{ "from", "to" }`
  seconds, default the cue to the clip's end) it repeats by seeking. Make the motion in a loop
  window repeat cleanly (a breathing pose), or bake a forwards-then-backwards loop into the clip
  when you encode it; never cache frames in the browser (hundreds of MB). `choices` may be empty: an
  end screen that loops.
- **Landing on cues:** a jump fires the cues at or after its time. To seek back into one master
  clip without firing the cue that sent you away, land just past it (16.1 for a cue at 16).
- **The code:** `createStage(1080, 1920, null)` (a cleared canvas), then
  `createStoryVideo(story, { videos, under: stage.canvas, backdrop: 'blur', onCue, onChoices,
  onChoicesHidden, onChoice, onInstall, onEnd })` from `@gameengine/playable/video`; draw the ids
  `onChoices` gives and call `video.choose(id)` on a tap; `adEvent('cue')` / `adEvent('choice')`
  from the runtime report progress; `whenReady(start, (v) => video.setVisible(v))`. The first
  touch turns the sound on. Show the end card from a cue (`onCue('endcard')`) or `onEnd`.
- **Size:** branch clips are a loading phase; after a miss, once `video.waitingFor` names a clip
  (the story needs one that has not arrived), `video.go('<end screen>')`, not before. Unchosen
  clips are never decoded, but every byte counts against the cap: keep clips 720×1280 or smaller,
  H.264 at about 0.5 Mbit/s, mono AAC at 64 kbps, no audio track where there is none, and branch
  with short reactions that rejoin a shared ending. Clips in a `remote` phase need CORS headers on
  the CDN, or the sound plays silent.
- **Check:** `playable build` fails on a clip that is not a video asset, a cue past its clip's end,
  a timeout that is not a choice, a cue inside a wait loop or a cue that jumps back onto itself. Try it in the editor's Playable Ads
  mode (and its Loading switch), then `playable validate --run`. Example:
  `samples/video-lounge/playable-ads/pick-a-path` in the engine repository.

## Rules every ad must follow (networks reject otherwise)

- **One file, nothing external:** no `fetch`, XHR, WebSocket, CDN script, font or image URL.
  Everything is inlined by `playable build` (Google and TikTok get a zip whose files load by
  relative path). Only the network's own tag is allowed (`mraid.js`,
  Google's Exit API).
- **CTA through the network:** call `openStore(url)` / `showEndCard()` from the runtime; it uses
  `mraid.open`, `ExitApi.exit`, `FbPlayableAd.onCTAClick`, `install`, or `openAppStore` per
  build. Never `window.location` or your own `<a href>`.
- **Audio** only after the first touch (`Sounds.unlock()` in `onFirst`), muted while hidden.
- **Timers** (the 30-second end) start at the first touch, not at load.
- **Start** through `whenReady()`: MRAID `ready` and viewable, or DOM ready in a browser.
- **End:** show the end card (`showEndCard`), which also calls Mintegral's `gameEnd`.
- **Size caps:** Meta 2 MB, ironSource 4 MB, the others 5 MB (ask which one the ad targets,
  above). Aim for well under 1 MB:
  WebP images (`export.images: "webp"`), MP3 at 96 kbps, 3D models with `export.meshes:
  "quantize"` or `"meshopt"` (skill `playable-ad-porting`), only the assets the loop shows.
- Portrait and landscape both have to work; the stage letterboxes a fixed design size.

## Commands

| Step | Command |
|---|---|
| List ads, builds, sizes | `gameengine playable list --json` |
| Scaffold | `gameengine playable new <ad> [--from-scene …]` |
| Run the slice | `gameengine playable run <ad> [--headless --steps N]` |
| Export assets only | `gameengine playable export-assets <ad>` (needs `cwebp`, `ffmpeg`) |
| Build all networks | `gameengine playable build <ad> [--network meta,unity]` |
| Check networks | `gameengine playable validate <ad> [--network tiktok] [--run]` (exit 1 on a failure; `--run` plays each build headless with its phases failing) |

MCP: `playable_list`, `playable_new`, `playable_export_assets`, `playable_build`, `playable_validate`.
