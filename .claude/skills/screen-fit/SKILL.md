---
name: screen-fit
version: 1.3.0
tier: required
description: Screen fit on every phone and tablet shape (9:22 to 3:4, folds, portrait and landscape) — the board whole and clear of HUD and safe area, views that never clip, WorldView fit, @media (aspect), `view render --devices`. Use when building a board, camera, HUD or view, or when something is cut off on a device.
---

# Fit every screen

**Covers:** Making a mobile game fit every screen shape, from very narrow phones (9:22, fold cover screens) to tablets (3:4) and fold inner screens, in portrait and landscape — the board or play area always whole and clear of the HUD, notch and home indicator, views that never clip or overlap, backgrounds that bleed instead of letterboxing. Covers WorldView fit (designAspect, Contain/Cover), fitWorldView/worldFit (the board fitted into the area the HUD and safe area leave free), ui.referenceResolution/match, @media (aspect) breakpoints, text-fit, and the device matrix to prove it with (view render --size/--devices, input.view in renderTests, screenshots). Use whenever you build or change a board, camera, level layout, HUD or any view for a game that runs on phones, and when something "goes off screen" or "is cut off" on some device.

A game that works on the phone in front of you is not done: phones go from **9:22** (fold cover
screens, 21:9 phones) through 9:19.5 and 9:16 to **3:4 tablets** and almost-square fold inner
screens, each with its own notch, punch-hole and home-indicator insets. Every gameplay screen and
every view must work across that whole range. Design for the extremes, not for 9:16.

## The range to support

Aspect is width / height in the game's orientation (portrait: < 1).

| Device | Preset id | Points (w×h) | Scale | Safe area (l,t,r,b pt) | Portrait aspect |
|---|---|---|---|---|---|
| Fold cover screen (narrowest) | `galaxy-z-fold5-cover` | 344×882 | 2.625 | 0,32,0,0 | 0.39 |
| 21:9 phone | `xperia-1-v` | 411×960 | 4 | 0,24,0,0 | 0.43 |
| iPhone 15 Pro | `iphone-15-pro` | 393×852 | 3 | 0,59,0,34 | 0.46 |
| iPhone SE (9:16, no notch) | `iphone-se` | 375×667 | 2 | 0,20,0,0 | 0.56 |
| iPad 10 (3:4) | `ipad-10` | 810×1080 | 2 | 0,20,0,0 | 0.75 |
| Fold inner screen (widest) | `galaxy-z-fold5-inner` | 690×829 | 2.625 | 0,28,0,16 | 0.83 |

These are the points (1/160 inch; scale is device pixels per point) and insets `ViewInfo` and
`input.view` take, as on the device: gestures measure millimetres in points. The preset ids give
the same sizes in `gameengine view render --devices`, the editor's Game view device menu and
`gameengine editor device --preset`.

For a landscape game swap width and height and rotate the insets (a notch then sits left or right).
Every feature is checked at least at **0.39, 0.46 and 0.75** (narrowest, a notched phone,
a tablet); the full table before shipping.

## Gameplay: board and world

The sim owns the 2D camera through `WorldView` (`center`, `orthoSize`, `fit`, `designAspect`;
skill `sim-boundaries`; adding, following or shaking a camera is skill `camera`). How it maps to the screen:

- `orthoSize` is half the visible height **at `designAspect`**.
- `fit: 'Contain'` (default) shows the whole `designAspect` rect on every screen: narrower screens
  fit its width (more world above and below), wider ones fit its height (more at the sides).
- `'Cover'` fills the screen with the rect and cuts the overflow. Use it only for backgrounds or
  free-scrolling worlds, never for a board that must be whole.
- `'Height'` and `'Width'` lock one axis. `'Height'` is what goes wrong on narrow phones: the
  sides fall off screen.

**Rule 1: `designAspect` is the aspect of the content that must be seen, not 9/16.** An 8×10
board with a 0.5-unit margin is 9×11: `designAspect: 9 / 11, orthoSize: 5.5, fit: 'Contain'`.
With `designAspect: 9/16`, `orthoSize` sized from the board height only keeps the width on screen
if the board is narrower than 9:16, which is exactly the bug that shows on narrow phones.

**Rule 2: fit the board into what the HUD and safe area leave free.** `Contain` fits the whole
screen, so a top bar, a booster bar, the notch or the home indicator can still cover board rows.
Reserve the HUD in the fit with `fitWorldView` from `@gameengine/runtime`. `ViewInfo`
(`width`, `height`, `safeArea`) is sim state recorded in the input stream, so the sim does this
deterministically and replays reproduce it:

```ts
import { defineSystem, fitWorldView, read, write, ViewInfo, WorldView } from '@gameengine/runtime';
import { Board } from './schema.gen.ts';

const CELL = 1; // world units per board cell

// HUD bands the board stays clear of, in UI reference px from the safe-area edges; keep them
// next to the HUD styles. Pass the project's ui.referenceResolution / ui.match when not the
// defaults (uiReference: [1080, 1920], uiMatch: 'fit').
const FIT = { reserve: { top: 260, bottom: 300, left: 24, right: 24 } };

export const FitBoard = defineSystem({
  name: 'FitBoard',
  resources: [read(Board), read(ViewInfo), write(WorldView)],
  run(ctx) {
    const b = ctx.resource(Board);
    // The rect that must be visible, in world units: centre, then size (board plus a margin).
    fitWorldView(ctx, 0, 0, b.width[0]! * CELL + 1, b.height[0]! * CELL + 1, FIT);
  },
});
```

- It sets `fit: 'Height'` with the `orthoSize` and `center` that show the rect as large as
  possible, centred in the free area, for this exact screen.
- It only writes when the view changed (rotation, fold, split screen), so steady steps cost a
  few float ops and allocate nothing. Keep the options in a module constant, as above.
- `worldFit(view, rect, opts)` is the same maths as a plain function, for tests and tools.
- The sim never reads the UI's layout. The HUD band sizes are numbers the sim and the HUD's
  stylesheet share, so give the HUD bars **fixed heights** in reference px (no content-sized bars).
  If a band changes per level, put it in level data, not in the view.
- A board whose cells must stay tappable has a floor: at the narrowest screen a cell must be at
  least ~44 pt: `CELL * ViewInfo.height / (2 * WorldView.orthoSize) ≥ 44`. Assert
  it in the device test; below that, change the board, not the fit.
- Taps already arrive in world coordinates (`Tap`, `PointerState`); never convert screen
  coordinates yourself, or input breaks the moment the fit changes.

**Rule 3: bleed, never letterbox.** Whatever is outside the must-see rect shows on some screens:
backgrounds, floors and frames extend well past it (at least the visible extent at 0.39 **and**
0.83 around the rect), or are drawn with `Cover`. Black bars or a hard edge of the level art
on a tablet are bugs.

**3D:** the same rules hold with a perspective camera. Frame the must-see bounds with the
vertical FOV for the current aspect: `fovY` stays fixed and the camera distance grows when
`aspect` falls below the bounds' aspect (fit width), so the scene never crops sideways on a
narrow phone. Keep gameplay-critical objects inside the bounds, not near the screen edge.

## Views

The UI scales a reference layout (`"ui": { "referenceResolution": [1080, 1920] }`, `match` default
`"fit"`: the reference always fits, and the extra room goes to the long axis). On a 0.39 phone
the screen is 1080 reference px wide and ~2770 tall; on a 0.75 tablet it is 1920 tall and ~1440
wide. Lay out for that (skill `ui-mvc-views` for the API):

- **What each `match` costs.** `"fit"` (the default) matches height, and width wherever the
  screen is narrower than the reference: it is Unity's aspect-adjusted CanvasScaler (match height,
  but width below the reference aspect), so a port of one uses `"fit"`, not `"height"`. `"height"`
  on a reference wider than tall phones overflows them: a 1564×2778 canvas on a 0.42 phone is a
  third wider than the screen. `"width"` overflows tablets the same way, vertically. A number
  from 0 (width) to 1 (height) blends the two in log space, as Unity's CanvasScaler Match slider
  does: a port of a Canvas with Match 0.5 sets `"match": 0.5`.
- **Never fix overflow with a transform on containers** (`transform: scale(var(--k))` on anchor
  boxes under `@media (aspect …)`): every rect code measures (`elementRect`, layout boxes) stops
  matching the screen, and flights, drags and hit tests aim at where the box would be unscaled.
  Change `match` (to `"fit"`) so the canvas scale itself changes and layout boxes are screen boxes.

- **Flex, not coordinates.** Bars are `Row`s pinned to the top/bottom, the middle is `flex-grow: 1`.
  Never place an element with an absolute `top` that assumes a 1920-tall screen: on a narrow phone
  it floats in the middle, on a tablet it falls off the bottom.
- **Safe area on every screen-level view:** `<Screen safeArea>`, or `env(safe-area-inset-top)` in
  `calc()` where a background must run under the notch while its content stays clear.
- **Widths that hold at 1080 reference px:** rows of buttons and labels sum to ≤ 1080 minus
  padding, or wrap (`flex-wrap: wrap`), or shrink (`flex-shrink`, `min-width: 0`). Give long and
  localised text a `text-fit: <min> <max>` on a sized box and `overflow: hidden`, so a German
  label shrinks instead of pushing the close button off screen.
- **Popups:** `max-width` / `max-height` in `%` or `vw`/`vh` so they never exceed the screen, and
  scroll (`overflow: hidden` list) when the content can be taller than the narrowest screen.
- **Breakpoints for the extremes:** `@media (aspect < 0.45)` (width is tight and height is
  plentiful: stack side-by-side items, shrink icons) and `@media (aspect > 0.7)` (tablets: cap content width with
  `max-width` and centre it instead of stretching buttons edge to edge). Prefix with the view's
  name as usual.
- A world-anchored label (`worldToUi`) and a view that must line up with the board read the fit
  through `WorldView`, so they stay correct when Rule 2 moves the board.

## Prove it

Do not hand back a board, camera, level or view change without these:

1. **Views:** every sample of every changed view on the extremes:
   `gameengine view render Hud --sample lastMove --devices galaxy-z-fold5-cover,xperia-1-v,iphone-15-pro,ipad-10`
   (narrowest, 21:9, notched and tablet in one sheet; `--landscape` for a landscape game), then
   `--devices galaxy-z-fold5-inner,iphone-se` for the widest and the shortest. Look at the PNG:
   nothing clipped, overlapping or off screen.
2. **Gameplay:** a `renderTest` over the device table that asserts and captures, so CI keeps it:

   ```ts
   import { renderTest, expect } from '@gameengine/test';

   const DEVICES = [
     { name: 'fold cover', width: 344, height: 882, scale: 2.625, insets: [0, 32, 0, 0] },
     { name: '21:9', width: 411, height: 960, scale: 4, insets: [0, 24, 0, 0] },
     { name: 'iphone 15 pro', width: 393, height: 852, scale: 3, insets: [0, 59, 0, 34] },
     { name: 'iphone se', width: 375, height: 667, scale: 2, insets: [0, 20, 0, 0] },
     { name: 'ipad', width: 810, height: 1080, scale: 2, insets: [0, 20, 0, 0] },
     { name: 'fold inner', width: 690, height: 829, scale: 2.625, insets: [0, 28, 0, 16] },
   ] as const;

   // The rect FitBoard keeps visible: a 7×9 board of 1-unit cells plus a 1-unit margin.
   const [w, h] = [8, 10];
   const EPS = 0.01; // the fit touches the free area's edges; WorldView stores f32

   for (const d of DEVICES) {
     renderTest(`board fits ${d.name}`, async ({ step, input, render, ui }) => {
       input.view(d.width, d.height, d.scale, [...d.insets]);
       await step(2);
       // Board corners (a w×h board centred at 0,0) inside the screen, between the HUD bars.
       const [x0, y0] = input.worldToScreen([-w / 2, h / 2]);
       const [x1, y1] = input.worldToScreen([w / 2, -h / 2]);
       render.stats({ width: d.width, height: d.height }); // lays the UI out at this size (the default is 360×640)
       const top = ui.rect('top-bar')!, bottom = ui.rect('bottom-bar')!; // ids on the HUD bars
       expect(x0).toBeGreaterThanOrEqual(d.insets[0] - EPS);
       expect(x1).toBeLessThanOrEqual(d.width - d.insets[2] + EPS);
       expect(y0).toBeGreaterThanOrEqual(top.y + top.height - EPS);
       expect(y1).toBeLessThanOrEqual(bottom.y + EPS);
       render.expectScreenshot('board', { width: Math.round(d.width / 2), height: Math.round(d.height / 2) });
     });
   }
   ```

   Also assert every HUD button's `ui.rect(id)` lies inside the screen and the safe area.
   Run it on both engines: `gameengine test --tier t0,t1 --js both`.
   Only a test with `input.view` changes `ViewInfo`, so this is where a `fitWorldView` game shows
   its fit per device. `gameengine screenshot --width --height` only changes the capture size of
   a running session: use it for views and `Contain` games, not to check Rule 2.

## Smells

| You see | Do instead |
|---|---|
| `designAspect: 9 / 16` with `orthoSize` from the board height | `designAspect` = the board's own aspect (Rule 1), or `fitWorldView` (Rule 2) |
| A fixed `orthoSize` tuned until it "looks right" on one phone | `fitWorldView` from the board size |
| `fit: 'Height'` or `'Cover'` on a board that must be whole | `'Contain'` with the board's aspect, or `fitWorldView` |
| The board's top row under the HUD on notched phones | `fitWorldView` with `reserve` bands (Rule 2) |
| Black bars or the level art's edge on a tablet | Extend backgrounds past the rect, or draw them with `Cover` (Rule 3) |
| `match: "height"` plus `transform: scale(…)` on anchor boxes for narrow phones | `match: "fit"` and no transforms on containers |
| A view positioned with `top: 1500px` | Flex column with bars at the ends and `flex-grow` in the middle |
| A button row that only fits at 9:16 or in English | `text-fit`, `flex-shrink`, `min-width: 0`, wrap, or fewer items below `aspect < 0.45` |
| Screenshots only at the default 1080×1920 | The device table, extremes first |
