---
name: video
version: 1.0.2
tier: optional
description: Video playback — *.video.json clips, the VideoPlayer component, video:<name> textures, fullscreen cutscenes with skip and subtitles, playVideo and friends, VideoFinished and VideoCue. Use for intros, cutscenes, in-level screens, animated banners and anything that plays footage.
---

# Video

**Covers:** Video in Game Engine — *.video.json clips (a .mp4/.mov source or a synthetic test clip, cues, subtitles, alpha, audio bus, per-device transcodes), the VideoPlayer component on a sprite, the `video:<name>` texture key for sprites and UI images, fullscreen cutscenes with skip and subtitles, playVideo/pauseVideo/seekVideo/skipVideo/videoState, and reacting to VideoFinished / VideoCue in the sim. Use for intros, cutscenes, TVs and screens in a level, animated shop banners, and anything that plays footage.

Video is **presentation** (ADR 0062, design.md § 7.15). A clip never changes sim state; the sim
hears about it only through two events that arrive as recorded input on the step after the frame
that raised them, so replays reproduce them without decoding anything:

- `VideoCue { entity, player, video, name, time }` — a cue marker was crossed (once per crossing, loops too).
- `VideoFinished { entity, player, video, skipped }` — the clip ended or was skipped (never for a looping clip, never for `stopVideo`). A clip that fails to load also ends, as skipped, so the game never waits forever.

## A clip

`assets/video/intro.video.json` (paths are relative to this file):

```json
{
  "source": "intro.mp4",
  "width": 1280, "height": 720, "fps": 30, "duration": 12.5,
  "cues": [{ "time": 4.0, "name": "door" }, { "time": 9.5, "name": "logo" }],
  "subtitles": { "en": "intro.en.srt", "de": "intro.de.vtt" },
  "audio": { "bus": "Voice", "volume": 1 },
  "alpha": "none",
  "transcode": { "android": { "codec": "h264", "maxHeight": 720, "bitrate": 2500 } }
}
```

- `width`/`height`/`fps`/`duration` are only needed when the cook has no `ffmpeg` to probe the source: headless runs (tests, CI, agents) cannot decode `.mp4`, so they play a deterministic **placeholder** of that size, rate and length — cues, ends, skips and layout are tested exactly anyway.
- `synthetic` instead of `source` generates a test clip bit-exactly (`{ "pattern": "bars" | "counter", "width", "height", "fps", "frames", "tone": Hz, "alpha": true }`): use it for tests and goldens.
- `alpha`: `stacked` (colour on top, alpha below in one frame; works everywhere) or `hevc` (HEVC with alpha on Apple; the cook makes a stacked copy for other devices when ffmpeg is present).
- Subtitles: SubRip or WebVTT; the file for `text.language` is picked (then its primary subtag, then `en`).
- The cook stores media uncompressed in the bundle (native players read it in place), extracts the audio track for the mixer and transcodes per `transcode` entry — with `ffmpeg` on `PATH`; without it the source ships as is and the cook says so. Videos go into collections and on-demand bundles like any asset.

## On a sprite, or anywhere a texture goes

```json
{ "name": "TV", "LocalTransform": {}, "Sprite": { "size": [1.76, 0.99] },
  "VideoPlayer": { "video": "video/tv.video.json", "name": "tv", "loop": "Loop" } }
```

`VideoPlayer` fields: `video`, `name` (empty: `e<entity index>`), `autoplay`, `loop` (`Asset`/`Once`/`Loop`), `volume`, `bus`, `speed`, `sprite` (draw on this entity's `Sprite`). The player's frame is the texture **`video:<name>`**: another sprite can show it (`"Sprite": { "image": "video:tv" }`), and so can a UI image (`<Image src="video:tv" />`, with a width and height in its style: the frame size is not known before the first frame). Until the first frame the key draws transparent.

## From code (UI, LateUpdate systems, tests — never fixed-step systems)

```ts
import { playVideo, playCutscene, pauseVideo, resumeVideo, seekVideo, skipVideo, stopVideo, setVideo, videoState } from '@gameengine/runtime';

playCutscene('video/intro.video.json');                 // fullscreen, skippable, subtitles on
playVideo('video/tv.video.json', { name: 'tv', loop: true, volume: 0.5 });
seekVideo('tv', 2.5); pauseVideo('tv'); resumeVideo('tv'); setVideo('tv', { speed: 2 });
videoState('tv');   // { state, time, duration, frame, frames, size, subtitle, decoder, … } or null
```

Every call throws inside a fixed-step system: the sim must not depend on presentation timing.
Start cutscenes from a LateUpdate system that reads sim state, and react in the sim:

```ts
export const IntroCutscene = defineSystem({
  name: 'IntroCutscene', stage: 'LateUpdate', resources: [read(Level)],
  run(ctx) {
    const l = ctx.get(Level);
    if (l.wantsIntro && !l.introDone && videoState('intro') === null) playCutscene('video/intro.video.json');
  },
});

export const IntroDone = defineSystem({
  name: 'IntroDone', events: [VideoFinished], resources: [write(Level)],
  run(ctx) {
    for (const e of ctx.events.read(VideoFinished)) if (e.player === 'intro') ctx.set(Level, { introDone: true });
  },
});
```

A fullscreen cutscene takes pointer input while it shows (a tap skips a skippable one; the tap
never reaches the game). On iOS/Android the shell may play it on a native layer with its own
skip button and subtitles; elsewhere the engine draws it letterboxed. Subtitles need a font
(`text.defaultFont`).

## Timing

Clips with audio follow the mixer (the audio device's clock); without audio, or headless, they
advance by presentation time — one fixed step per frame in tests, so a clip started on step N
raises its cues and end on the same steps on V8, Hermes and every machine.

## Check it

- `gameengine video info <file>` — size, rate, frames, cues, subtitles and which decoder plays it here.
- `gameengine video sheet <file> [--every 0.5]` — a contact sheet PNG (red strips: cells with a cue). Look at it.
- `gameengine video validate` — every descriptor, the files it names, every frame decodes; `gameengine validate` reports `E_VIDEO`.
- Tests: `worldTest` — step, then assert on your sim state (`VideoFinished` / `VideoCue` handling) and on `videoState(name)`; `renderTest` goldens of a synthetic clip on a sprite. Run `gameengine test --js both`.

## Rules

- Never gate sim logic on `videoState` — react to `VideoFinished` / `VideoCue`.
- Use `synthetic` clips (or the placeholder) in tests; real footage decodes differently per device.
- Keep a clip's audio in the clip (or `audio.track`), not as a separate `PlaySound`: the video clock follows its own track.
- A clip in a bundle mounted from another game (`releases.mount`) plays as `playVideo('<id>:home/loop.video')`: the cooked alias, without `.json`.
- Not yet: 3D material textures from video, network streams, DRM, GPU zero-copy decode paths (frames upload as RGBA).
