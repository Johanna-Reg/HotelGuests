---
name: keyframe-animation
version: 1.0.0
tier: optional
description: Keyframe animation of scene entities — *.timeline.json v2 (path tracks, lane keys, step, tangents), TimelinePlayer, playTimeline, TimelineEvent, `gameengine timeline` and MCP timeline_*, the editor's Animation dock and Rec. Use to animate doors, chests, UI props, banners or cutscenes in games and playable ads.
---

# Keyframe animation of entities (`*.timeline.json`)

**Covers:** keyframe animation of scene entities and their children in games and playable ads:
the timeline file (v2), the `TimelinePlayer` component and `playTimeline`/`stopTimeline`, events,
the `gameengine timeline` commands (MCP `timeline_*`) and the editor's Animation dock. Use to
animate doors, chests, pickups, banners, intros and cutscenes without code per value.

For frame-by-frame sprites use skill `flipbook-2d`; for rigs, `skeleton-2d` or
`animation-3d-agent`; for a one-off value change from code, `tween()`.

## The file

```json
{
  "$schemaVersion": 2,
  "duration": 1,
  "tracks": [
    { "type": "tween", "path": "Lid", "component": "LocalTransform", "field": "position.y",
      "keys": [{ "at": 0, "value": [0.55] }, { "at": 0.5, "value": [0.95], "ease": "OutBack" }] },
    { "type": "tween", "path": ".", "component": "LocalTransform", "field": "scale",
      "keys": [{ "at": 0, "value": [1, 1, 1] }, { "at": 0.4, "value": [1.1, 0.9, 1], "ease": "step" }] },
    { "type": "activation", "path": "Lid/Sparkles", "ranges": [[0.5, 1]] },
    { "type": "events", "keys": [{ "at": 1, "name": "opened" }] }
  ]
}
```

- **Who a track moves:** `path` is under the entity with the `TimelinePlayer` (`.` is that
  entity, `Lid/Hinge` goes down by `Name`), so one timeline animates every copy of a prefab.
  Give each animated child a unique `Name` among its siblings. `target` names an entity by
  global `Name` instead (cutscenes that move several roots).
- **What it keys:** a whole number field (`scale`: 3 numbers) or one lane (`position.y`,
  `color.a`). Key lanes when only one axis moves, so the others stay free. Rotations are
  quaternions and key whole (`rotation`, 4 numbers).
- **Between keys:** linear by default; `ease` names the curve **into** that key (`OutQuad`,
  `InOutBack`, …, or `step` to hold the previous value). One-lane keys may carry `tangents`
  (`{ "mode": "smooth" | "linear" | "broken", "in": [dx, dy], "out": [dx, dy] }`); an ease wins.
- Other tracks: `audio` (`sound`, `volume`, `bus`), `events` (fire `TimelineEvent`), `camera`
  (switches which named camera is active), `animation` (Animator states; not in playable ads).

## Playing it

A `TimelinePlayer { timeline, playing, loop, speed, time }` in the scene plays from the start;
`playing: false` waits for code. From a fixed-step system:

```ts
playTimeline(ctx, chest, 'anim/chest-open.timeline.json', { speed: 1.5, loop: false });
stopTimeline(ctx, chest);
```

Read `TimelineEvent { entity, name, time }` and `TimelineFinished { entity }` in sim systems
(both are sim events: replays and both JS engines see them at the same step). The player state
is sim state: never start one from LateUpdate or UI code; send an event the sim handles.

## Making and editing timelines

Agents edit with the same pure edits as the editor, checked by the engine's rules and written in
the canonical text (a one-key change is a one-line diff):

```bash
gameengine timeline new assets/anim/door.timeline.json --duration 0.6
gameengine timeline key set anim/door.timeline.json --path Leaf --component LocalTransform --field rotation --at 0.6 --value 0,0.707,0,0.707 --ease OutCubic
gameengine timeline show anim/door.timeline.json          # track and key numbers
gameengine timeline key move anim/door.timeline.json --track 0 --key 1 --at 0.5
gameengine timeline key ease anim/door.timeline.json --track 0 --key 1 --tangents smooth
gameengine timeline event anim/door.timeline.json --at 0.6 --name opened
```

Humans use the editor's **Animation** dock (under the scene view): select the entity, **Create
animation**, drag the ruler to scrub (the scene shows that moment), press a field's key button in
the Inspector, or turn on **Rec** and move things with the gizmos or the Inspector: each edit
becomes a key at the playhead and the scene file stays as it was. The same dock works in the
Playable Ads mode on the selected ad's slice.

## Proving it

- A game test: play the timeline, step past a key, assert the value (`gameengine test --js both`).
- Playable ads: in `web/mirror.ts` pass the slice's timelines to `createPlayable`
  (`timelines: new Timelines(Object.fromEntries(Object.entries(slice.timelines).map(([k, v]) => [k, bytes(v)])))`,
  skill `playable-ad-porting`) and run `gameengine playable verify <ad>`.

## Cost on phones

A step costs O(tracks) per playing player after the first lookup of each target; a stopped
player costs nothing. Hundreds of playing timelines are fine; for thousands of identical
looping props prefer a shader or a `VisualTween`.
