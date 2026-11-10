---
name: touch-input
version: 1.0.0
tier: required
description: Touch input feel on phones: Tap, Swipe, Drag, Pinch, Rotate, LongPress, PointerState velocity, fling, swipe on threshold vs release, input.json gestures thresholds, following the finger with no lag (teleport), testing swipes. Use when building or tuning any touch, swipe, drag, pinch or tap control.
---

# Touch input that feels good

**Covers:** which input event to build each control on, swipes that answer mid-gesture, velocity
and flings, dragging things that stay under the finger, tuning gesture thresholds in `input.json`,
and proving it in tests. Read it before writing or changing any touch control. Players judge a phone
game by its touch feel in the first seconds, and on phones touch is the only input.

## How input reaches the game

Touches are recorded input. Each step, the engine's input system turns them into world-space events
and the `PointerState` resource, deterministically, before your `PreUpdate` systems run. Thresholds
are in physical millimetres (the same on every screen density), and times are set in seconds and
measured in steps, so replays and rollback reproduce every gesture. Game UI (`ui/**/*.ui.json`) takes the touches that land on it
first: those never reach the sim.

| Event / state | Fires | Use it for |
|---|---|---|
| `Tap { world, screen, count }` | On release, moved under `tapSlopMm`, held under `tapMaxS`; `count` 2 for a double tap | Select, place, fire |
| `Swipe { start, end, dir, dir4, velocity, duration }` | **Once per press**, as the finger crosses `swipeMinMm` (the default) or on release | Swaps, lane changes, dashes |
| `Drag { phase, world, delta, start, velocity }` | `Start` past `dragStartMm`, `Move` per pointer move, `End` on release with the release velocity | Moving pieces, aiming |
| `Pinch { center, scale }` / `Rotate { center, angle }` | Each step two fingers move; relative to the previous step | Zoom, rotate the board |
| `LongPress { world, screen }` | While held still for `longPressS` | Context actions, previews |
| `PointerDown/Move/Up { id, screen, world }` | Every touch, raw | Your own gestures, multi-finger controls |
| `PointerState` resource | Always current | `down`, `world`, `startWorld`, `velocity`, `dragging`, `swiped` |

`velocity` is in world units per second, smoothed over the last moves, and zero once the finger
stops (a release after the finger stopped is no fling).

## Rules

- **Answer on the move, not on the lift.** A swap, dash or lane change reacts the step the finger
  crosses the threshold. That is the default (`swipeOn: "threshold"`). Waiting for the lift is the
  most common reason a swipe game feels sluggish. Use `"release"` only when the gesture's length
  matters (a slingshot, a throw).
- **One `Swipe` per press.** Don't also act on `Drag End` or `Tap` for the same intent. A press that
  swiped never taps, even if the finger comes back.
- **Fling with the release velocity.** For thrown or slid pieces, read `Drag` `End`'s `velocity` and
  decay it in the sim (`v *= 1 - k * ctx.dt`, stop under a small speed). Never compute a velocity
  from `Date` or frame times.
- **Pan the view in screen space.** `velocity` and `world` are in world units through `WorldView`.
  When the pan moves `WorldView.center`, the world point under the finger barely moves. Pan by the
  change in `PointerState.screen` (or `PointerMove` `screen`) converted to world units, and fling
  with the screen speed you track the same way.
- **Keep the dragged thing under the finger.** Sim-moved entities are drawn interpolated between the
  last two steps, so they trail the finger by up to one step. While a piece follows the pointer,
  call `teleport(e)` (`@gameengine/runtime`) every step you move it: it is drawn where this step put
  it, with no blend. Presentation that follows the finger (a cursor, a trail, a highlight) reads
  `PointerState` in `LateUpdate`, which already holds this frame's touch.
- **Use the right space.** Events carry world points through `WorldView` (2D). Don't convert them
  again. In 3D, a controller turns `screen` into a ground point with `screenToWorld` and sends it to
  the sim as an input event (skill `camera`).
- **Leave a dead zone for what you didn't mean.** Act on a direction only past `swipeMinMm`. Pick a
  piece on `PointerDown` but move it only once `Drag` starts, so a tap never nudges it.
- **Big targets.** Touch targets are at least 9 mm (about 50 points). Hit-test taps with a radius,
  not the sprite's exact pixels.
- **Haptics on the action, not on the touch:** tick when the swap or snap happens (skill `haptics`).
- **Sim only.** Gesture events and `PointerState` are sim state. Presentation may read them, but never
  writes back. A UI button is a UI document, not a world tap (skill `ui-documents`).

## Tuning (`input.json`)

```json
{
  "gestures": {
    "swipeOn": "threshold",
    "swipeMinMm": 6,
    "dragStartMm": 4,
    "tapSlopMm": 3,
    "tapMaxS": 0.35,
    "doubleTapS": 0.3,
    "longPressS": 0.5
  }
}
```

Every field is optional; these are the defaults. Distances must be above 0 and at most 100 mm, times
above 0 and at most 10 s. The session refuses anything else, and unknown names, when it starts.
Smaller `swipeMinMm` (4–5) makes swaps snappier but turns sloppy taps into swipes. Test both on a
phone. A playable ad slice keeps the defaults (`gameengine playable build` refuses `gestures`).

## Prove it

Drive input like a player in a `worldTest` (skill `testing`):

```ts
worldTest('a swap starts before the finger lifts', async ({ world, step, input }) => {
  const [x, y] = input.worldToScreen(cellToWorld(8, 8, 3, 3));
  input.pointer('down', x, y);
  await step(1);
  input.pointer('move', x + 120, y); // past 6 mm on the test view, still held
  await step(1);
  expect(world.resource(Board).phase).not.toBe('Idle');
  input.pointer('up', x + 120, y);
  await step(1);
});
```

`swipe(from, to, steps)` and `tap(p)` cover the common cases. A swipe now lands on the step it
crosses the threshold, not on its last step. Assert the fling with a `Drag` `End` velocity and a few
`step`s. Run on both engines (`gameengine test --js both`), and feel it on a phone, at 30 fps on
phone-low too, before handing it back.
