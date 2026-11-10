---
name: flipbook-2d
version: 1.3.2
tier: optional
description: Frame-by-frame 2D animation — *.clip2d.json clips, the Clip2D component, frame events, and Animator state machines (*.animctrl.json) over 2D clips or skeletons. Use for sprite characters, pickups, props and effects animated with frames, and attack, hit or death logic keyed to frames.
---

# 2D flipbook clips

**Covers:** Frame-by-frame 2D animation in Game Engine — *.clip2d.json clips (frames from atlases, durations, once/loop/pingpong, frame events, keyed offset/scale/rotation/tint/flipX), the Clip2D component, playClip2D/setClip2D/clip2DFrame, Clip2DEvent/Clip2DFinished, and Animator state machines (*.animctrl.json) whose states play 2D clips or Skeleton2D animations. Use for sprite characters, pickups, props and effects animated with frames, and for "attack/hit/death" logic keyed to animation frames.

A clip is `assets/<dir>/<name>.clip2d.json` (spec: `docs/clip2d-format.md` in the engine;
JSON Schema `docs/generated/clip2d.schema.json`). Frames are sprite keys: `assets/hero/run_0.png`
is `"hero/run_0"`. Put a clip's frames in one atlas group (`atlas = "hero"` in each frame's
`.gmeta`) so every animated sprite sharing the page is one draw call.

```json
{
  "$schemaVersion": 1,
  "fps": 12,
  "loop": "loop",
  "frames": "hero/run_{0..7}",
  "events": [{ "frame": 2, "name": "footstep" }, { "frame": 6, "name": "footstep" }],
  "keys": { "offset": [{ "frame": 0, "value": [0, 0] }, { "frame": 4, "value": [0, 0.04], "ease": "outQuad" }, { "frame": 8, "value": [0, 0] }] }
}
```

- `frames`: a range string, or a list of keys / `{ "sprite", "duration" }` (seconds; default 1 / fps).
- `loop`: `once` (stops on the last frame), `loop`, `pingpong` (0 1 2 3 2 1 0 …).
- `events`: fire when playback **enters** the frame, once per crossing, every loop; `int`,
  `float`, `string` payloads ride along.
- `keys`: `offset` / `scale` `[x, y]`, `rotation` (degrees), `tint` (`"#rrggbb[aa]"`), `alpha`,
  `flipX`; `frame` may be fractional (2.5 = half way through frame 2); `ease` is how the value
  moves into the key: `linear` (default), `inQuad` … `inOutBounce`, or `step`.

A new `*.clip2d.json` needs its `.gmeta` before `validate` passes: write it with `gameengine cmd asset.setText` (it writes a new file under `assets/` with its sidecar) or run `gameengine cook` once after adding files, and commit the `.gmeta`; until then `validate` fails with `E_ASSET: no .gmeta sidecar`.

## Play one

A clip draws through the entity's `Sprite` (the sprite's size, anchor, colour and flip still
apply; the clip sets the image and adds its keys on top):

```json
{ "LocalTransform": { "position": [0, 0, 0] },
  "Sprite": { "size": [0.64, 0.64], "anchor": [0.5, 0.05] },
  "Clip2D": { "clip": "hero/run.clip2d.json" } }
```

```ts
import { playClip2D, setClip2D, clip2DFrame, Clip2DEvent, Clip2DFinished } from '@gameengine/runtime';

playClip2D(ctx, e, 'hero/jump.clip2d.json', { loop: 'once' }); // same clip again: keeps playing
playClip2D(ctx, e, 'hero/jump.clip2d.json', { restart: true }); // from frame 0
setClip2D(ctx, e, { playing: false });                          // pause; also speed, loop, time (seek)

for (const ev of ctx.events.read(Clip2DEvent)) if (ev.name === 'footstep') { /* ev.entity, ev.frame, ev.int … */ }
for (const done of ctx.events.read(Clip2DFinished)) { /* a once clip ended: done.entity, done.clip */ }
```

Playback is **sim state** (hashed, replayed): change it only from fixed-step systems (pass
`ctx`) or tests/setup (`null`) — never from LateUpdate, views or UI (send an intent). Events are
sent in PostUpdate: read them in Update of the next step. `world.get(e, Clip2D).frame` is the
frame shown; `clip2DFrame(e)` returns the full sample (sprite, offset, scale, rotation, tint).

## State machines: let the Animator pick the clip

Most characters are a state machine. Use the engine's `*.animctrl.json` (the same format and
graph editor as 3D): a state's motion is a 2D clip.

```json
{ "$schemaVersion": 1,
  "parameters": [{ "name": "speed", "type": "float" }, { "name": "attack", "type": "trigger" }],
  "layers": [{ "name": "Base", "entry": "Idle",
    "states": [
      { "name": "Idle",   "motion": { "clip2d": "hero/idle.clip2d.json" } },
      { "name": "Run",    "motion": { "clip2d": "hero/run.clip2d.json" } },
      { "name": "Attack", "motion": { "clip2d": "hero/attack.clip2d.json" }, "loop": false }
    ],
    "transitions": [
      { "from": "Idle", "to": "Run", "conditions": [{ "parameter": "speed", "op": "gt", "value": 0.1 }], "duration": 0 },
      { "from": "Run", "to": "Idle", "conditions": [{ "parameter": "speed", "op": "le", "value": 0.1 }], "duration": 0 },
      { "from": "*", "to": "Attack", "conditions": [{ "parameter": "attack", "op": "trigger" }], "duration": 0 },
      { "from": "Attack", "to": "Idle", "exitTime": 0.44, "duration": 0 }
    ] }] }
```

Scene: `"Sprite": {…}, "Animator": { "controller": "hero/hero.animctrl.json" }` (no `Clip2D`).
Drive it with `setAnimParam(chunk, i, 'speed', v)` / `triggerAnim(chunk, i, 'attack')` from a
system whose query writes `Animator`. Rules:

- The clip plays on the state's time; `"loop": false` on a state plays its clip once.
- `exitTime` is seconds in the state: for "when the attack ends" use the clip's length
  (`clip2DInfo(asset).duration`).
- The clip's frame events arrive as `Clip2DEvent` with `state` set; frame 0's fire on entering.
- Cross-fade `duration` does not blend sprites (the new clip shows at once); use 0.
- The top layer whose state plays a clip is drawn (e.g. an overlay layer for a hit flash).
- To enter a state directly (Unity's `Animator.Play` / `CrossFade`) instead of through a
  transition: `playAnim(ctx, e, 'Attack', { offset })` and `crossFadeAnim(ctx, e, 'Idle', 0.2,
  { normalized: true })` (seconds, or with `normalized` fractions of the state left / entered);
  `animClipLength(e, 'Attack')` gives a state's length. A direct entry does not fire frame 0's
  events or state events at 0 s.
- `2D skeletons`: a state's motion may be `{ "skeleton2d": "walk" }` on an entity with a
  `Skeleton2D` — the layer's track plays that animation with the transition's cross-fade.

## In UI views

A clip in a HUD, popup or menu (a spinning coin, an animated icon) is a `<Flipbook clip="…">`
element in the view (skill `ui-mvc-views`), not an entity: it plays on UI time, sorts and clips
with the UI, and its `onEvent` / `onFinish` handlers are presentation only.

## Check your work

- `gameengine clip2d info assets/hero/run.clip2d.json` — frames with start times, cycle length,
  events, keyed properties.
- An Animator that drives a `Skeleton2D`: `gameengine skel2d preview <rig> --controller hero/hero.animctrl.json
  --params attacking=true --steps 60 --every 6 --out run.png` renders the run (engine frames, labelled by time).
  For `Clip2D`/sprite state machines, step a paused session and `screenshot` instead.
- `gameengine clip2d sheet assets/hero/run.clip2d.json --out run.png` — look at the frames side
  by side (bars: duration; red: frames with events).
- `gameengine validate` — `E_CLIP2D` names the JSON path at fault and frames that are not
  sprites; `E_ANIMCTRL` flags states naming a missing clip. The cook fails on the same.
- Game tests (`skill testing`): count events over many loops (`step(600)` then compare with
  `world.get(e, Clip2D).loops`), transitions (`world.get(e, Animator).state[0]`), once clips
  (`finished`, `Clip2DFinished`), bad input (`expect(() => playClip2D(…)).toThrow(…)`), and a
  `renderTest` golden. Run with `--js both`. Example: `samples/rig-yard/tests/flipbook.test.ts`.

## Performance

Stepping a clip is a binary search over frame starts per step; sampling is a few key lookups
per frame; drawing is the batched sprite path. Hundreds of animated sprites on one atlas page
are one draw call. Keep frames the same size where you can (trimming handles transparent
borders), and prefer one atlas group per character.
