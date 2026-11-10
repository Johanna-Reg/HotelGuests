---
name: ui-mvc-views
version: 1.36.0
tier: required
description: Game UI views and controllers — defineView placing a UI document, a controller filling its model from the world, intents, the view stack, UI animation, sprites, pooled scrolling lists, text, models and rigs in views, the Unity UI mapping. Use for the code side of any HUD, menu or popup (its looks are ui-documents).
---

# UI: views, controllers, intents

**Covers:** Game UI as MVC views — defineView with a model and samples placing a UI document, a controller that fills it from the world, intents back, the view stack, stylesheets, UI animation (fx-* effects, @keyframes, view enter/exit, ui.animate, reward icons flying to a counter with ui.animateTo and drawnRect) and sprite drawing (9-slice borders, fills, tiling, mirroring, object-fit, blend modes, overflow clipping), view layers (screen/overlay, loading covers on top; dialogs are screens), dimming dialogs (dims, ui.scrim), lists and pooled lists (For, Pooled, ScrollView drag/fling/wheel scrolling, scroll-snap and overscroll bounce, what UI costs per frame, node budgets), pointer drags (onPress/onDrag), per-field useResource, particles, 3D models (skinned characters playing clips, framed portraits), 2D skeletons and flipbook clips inside views, text (rich markup, auto size, outlines, gradients), and the Unity Image/TextMeshPro/CanvasScaler mapping. Use for the views and controllers of any HUD, menu or popup (skill ui-documents for its looks), and when porting Unity UI.

**View** (`src/views/<name>.view.tsx`): shows only its model, raises intents, has samples. Its looks are a UI
document (skill `ui-documents`): the view places it, fills its properties from the model and maps its events.

```tsx
export const HudView = defineView<{ score: number; movesLeft: number }>({
  name: 'Hud',
  description: 'Score and moves. Intents: pause.',
  samples: { start: { score: 0, movesLeft: 20 }, lastMove: { score: 2980, movesLeft: 1 } },
  render: (model, { intent }) => (
    <Screen safeArea class="hud"><View class="a-top">
      <Widget doc="hud-bar" class="hud-bar" props={{ score: () => model().score, moves: () => model().movesLeft }}
        onIntent={(_, e) => intent(e.path.at(-1)!)} />   {/* the document's pause button sends `pause` */}
    </View></Screen>
  ),
});
```

A TSX-only view writes the same render with `<Text>`, `<Button>`, `<Sprite>` and classes from `ui/*.style.css`;
keep that for what documents cannot hold (below).

**Controller** (`src/ui/*.tsx`, in `defineUI`): reads the world, pushes views, turns intents into sim events.

```ts
const score = useResource(Score);
const hud = views.push(HudView, untrack(() => ({ score: score().value, movesLeft: 20 })), {
  onIntent: (name) => name === 'pause' && emit(PauseRequested, { paused: true }),
});
createEffect(() => hud.update({ score: score().value, movesLeft: 20 }));
```

- Views never touch the world or services; controllers never build UI. That split is what makes views previewable.
- `useResource(T)` subscribes **per field**: it returns a live, read-only record, and an effect re-runs only when a field it read changed. A HUD reading `board().phase` does not re-run when `board().timer` moves every step, so a resource that changes every step needs no separate presentation-only copy. Keep a snapshot with `{ ...board() }` (the record itself always reads current values); it is `null` while the resource does not exist. `untrack(board)` returns the live record, whose field reads still subscribe: read untracked fields inside the callback, `untrack(() => board().phase)` or `untrack(() => ({ ...score() }))`.
- `useDoc(doc)` does the same for a world document or a `metaInWorld` handle (`useDoc(shopState)`): it re-runs when the document's version changes and returns the same frozen value until then.
- What the UI still costs per frame, for all `defineUI` systems together (the first to run in a frame refreshes for all): one host call for every tracked resource's change tick, one for input (`ui.poll`), one to send queued node ops when there are any, and one per `useDoc` document (its version). A resource whose tick moved is read once (one host call) and compared field by field; only effects of changed fields run, and only changed props queue ops.
- Styles go in `ui/*.style.css` (classes, `@media (aspect > 0.7)`); prefix a view's classes with its name.
- Every state a view can be in gets a sample. Check: `gameengine view render Hud --sample lastMove --out hud.png` (`--model '<json>'` for any other state, `--size 393x852 --safe 0,59,0,34` for a device; MCP `view_render`).
- Check a layout on a slim and a wide screen in one call: `gameengine view render Hud --sample lastMove --devices` renders it on `pixel-8` (20:9) and `ipad-10` (4:3), each with its own size, scale and safe area, side by side (stacked with `--landscape`); `--devices iphone-se,galaxy-tab-s9` picks others. `--json` (and MCP `view_render` with `devices`) gives each device's rect in the sheet.
- Every view must hold from 9:22 phones to 3:4 tablets: flex bars instead of fixed `top`, `text-fit` on labels, `max-width` on tablets. Skill `screen-fit` has the rules and the device table.
- In the editor, the **UI** mode is the visual UI editor: it edits documents, not TSX. Selecting a `*.view.tsx` in the Project panel previews that view from its first sample in the inspector. Keep TSX positions (placing documents in the view's anchors included) in `ui/*.style.css`, not inline `style` props.
- Popups stack: `views.push` returns a handle with `update` and `close`.
- **Dialogs dim with the stack's scrim:** never draw a backdrop in a view. `defineView({ dims: true, blockInput: true, … })` (or `views.push(V, m, { dims: true })`) asks the stack to draw its one scrim just under the view: the project's `ui.scrim` (`{ "color": "#05070d", "opacity": 0.6, "ms": 220 }` in `project.gameengine.json`). A second dimming dialog takes the scrim, and it moves back once that one is gone; it fades in with the first and out with the last one's exit. UI documents of kind `view` (`<Widget doc="no-lives" />` as a view's whole render) bring their own behaviour: Enter / Exit poses, screens that cover and uncover, and `tapOutside: dismiss` sending a `dismiss` intent.
- **Code areas put your TSX inside a UI document:** `<Widget doc="art-quit" codeAreas={{ 'quit.content': <Text rich>…</Text> }} />` fills a document's empty `codeArea` box; what you pass stays yours across reloads (skill `ui-documents`).
- **Layers:** views draw by layer — `screen` (default), then `overlay` (toasts, banners) — and in push order within a layer. Dialogs and popups are screens: a screen a dialog opens draws over it. Set the layer on the view (`defineView({ layer: 'overlay' })`) or per push (`views.push(V, m, { layer: 'overlay' })`). A loading cover (`loading.run`/`loading.boot`) draws above every layer: a HUD or menu pushed while it is up (or in the same frame, after it) lands under it. `views.pop()` and `views.clear()` leave the cover (and the cheat console, also on top) to their owners; `views.top()` still names them while they are up (`gameengine.LoadingView`, `gameengine.CheatConsole`: the engine's views are named `gameengine.*`, a prefix your view files cannot use, and a view name defined in two files is refused). `views.pushBelow(cover, V, m)` puts `V` on top of its own layer, under the cover. A `defineUI` root element mounted while a cover is up also goes under it. To start a level in place, clear the old views and push the new ones in `loading.run({ onCovered })` (skill `asset-memory`).
- Button feedback for the whole project goes in `project.gameengine.json`, not on every button:
  `"ui": { "button": { "haptic": "light", "hapticOn": "click", "sound": "audio/tap", "volume": 0.8 } }`.
  A button's own `haptic` / `sound` wins (`null` opts out); `sound={{ src: 'audio/buy', volume: 0.5 }}` sets a volume;
  the sound plays on the UI bus as presentation (`audio.play`): it never reaches the sim, a replay or the hash, and a
  test sees it in `audio.sounds()`;
  `hapticOn: 'click'` plays on the completed tap as Unity's `onClick` does (default `press`: touch-down).
  `haptic` takes a preset or a `haptics.json` entry name tuned per platform (skill `haptics`).
- An `emit` while the UI first mounts (the root or its first effect run) reaches the sim on the next step.

## Lists, pooled lists and what UI costs

What a frame costs is the **shown** UI that **changed** (ADR 0094): a change restyles the changed node and its subtree, and relays out only what Taffy sees change; a frame with no UI change does no styling or layout. `display: none` subtrees and detached nodes cost nothing per frame (only memory). So:

- `<For each={() => items()}>{(item, i) => …}</For>` builds an item's UI when it arrives and destroys it when it leaves; items that stay are not touched.
- `<Pooled each={() => flights()} warm={{ count: 30, item: idle }} max={64} name="flights">{(f, i) => <Flight f={f()} />}</Pooled>` parks the UI of items that leave (detached) and hands it to the next item that comes: `item` and `index` are accessors, so read `f()` inside reactive props. A reused or first-shown UI replays its CSS animations as a new element does, and does not transition from its old style. Use it for UI that comes and goes many times a second (flying icons, floating texts, hit numbers); `warm` builds item UIs up front (during a loading screen), `max` caps the idle ones kept. `uiPoolStats()` gives `active`, `idle`, `peak`, `created` and `dropped` per list: set `warm` to the `peak` of your busiest level.
- **Never pool UI by hiding it** (`display: none` / `opacity: 0` slots that are shown by a class): it works, but every per-item effect keeps running, and on engines before ADR 0094 every hidden node was restyled and laid out every frame. Unmount it, or use `<Pooled>`.
- A node shown again after `display: none`, or inserted again after a detach, replays its CSS animations (as in a browser).
- **Scrolling lists:** `<ScrollView id="levels" class="levels" contentClass="level-rows" onScroll={(e) => …}>{rows}</ScrollView>` (CSS `overflow: scroll`, or `overflow-y` / `overflow-x`). Give it a size (`height`, or `flex-grow: 1` in a column); its children sit in a content container (`contentClass` for `padding` / `gap`) that grows with them, and `horizontal` lays them out in a row. `scrollTo` sets where it opens: `'end'`, `'start'`, or `{ id: 'card-2', align: 'center' }` (`align` `start` by default) puts that descendant at the start, centre or end of the list's box, clamped to the content. It holds until the player scrolls: every layout places it again (fonts and images arriving, another view size, rows added later). After that the same value on a re-render leaves the player's offset, and a new value moves it again, stopping a fling or bounce. On a `scroll-snap` list it rests on the nearest snap point or end. `{ to: 'end', duration: 250, easing: 'expr(2 * t - t * t)', follow: true }` glides there instead (easing as `ui.animate` takes it), and `follow` goes back each time the content grows, even after the player scrolled away: a chat keeps its newest line in view with one constant value. A drag, fling or wheel stops a glide; taps land where rows are drawn. A drag scrolls it once it moves past about 2 mm (30 reference px): the Button it started on gets `pressOut` and no `press`, so dragging a list never taps a row; a release flings it, a touch stops a fling (and taps nothing), and the mouse wheel scrolls the list under the mouse on desktop. The offset is presentation (never in the sim or replays); rows scrolled out of view draw nothing, and `ui.rect`, `ui.press`, `ui.interactables` follow the scroll. `scroll-snap: <length> | pages` settles a released list on the next row (or page) in the direction it moved, and `scroll-snap-threshold: 33%` makes it turn only past that share of the way or on a flick (a swipeable tab pager); `overscroll: bounce` stretches it past an edge and eases back. `clip-softness: 0 100px` (`<x> <y>`, or one length for all four edges) fades the rows to transparent over that far inside the list's top and bottom edges as they scroll out, instead of cutting them (Unity's `RectMask2D.softness`); a card with `overflow: hidden` inside a fading edge fades with it. Long lists: rows still exist as nodes, so past a few hundred use `<Pooled>` inside it and keep the node budget below (a UI document's Repeat in a scroll element is virtual: only the rows in view exist).
- **Handlers get the pointer:** `onPress`, `onPressIn`, `onPressOut` receive `{ x, y, dx, dy }` (view px, as `ui.rect`: where the pointer is and how far it moved since the press began); `() => …` handlers keep working. `onDrag={(e) => …}` fires on every move while the element is held (a slider, a drag handle); a ScrollView around it leaves its drags to it. `onScroll` gets the new offset (`x`, `y`) and the change (`dx`, `dy`). Every pointer event has `phase` (`'down'`, `'move'`, `'enter'`, `'leave'`, `'up'`, `'cancel'`); `onPressOut` fires when the held pointer leaves too, so a virtual joystick resets in `onPointerUp`, which fires once when the pointer that pressed the element lifts or is cancelled, wherever it is then.
- **What a node draws:** `gameengine ui layout [<id>]` prints the tree with each node's screen box after transforms, scroll and clipping (`hidden` when it is off screen or transparent), opacity, text size and line count, `OVERFLOWS` when text is larger than its box (cut off, or spilling out: no ellipsis is drawn), and scroll offsets; `--json` (MCP `ui_layout`, protocol `ui.layout`) adds a style summary per node.
- **Node budget:** `gameengine check` lays the UI out during its smoke run and reports the most nodes shown at once (`ui nodes`); above 1000 it warns, and `check.smoke.uiNodes` in `project.gameengine.json` makes a budget it fails on. Rough guide per device class: phone-low 600, phone 1200, tablet 2000 shown nodes. Profile with `gameengine run --headless --ui-layout` and `perf.stats` / `profile.markers` (`ui.cascade`, `ui.layout`, `ui.paint` markers with node counts).

## Views and UI documents

New screens, popups and widgets are **UI documents** (`ui/**/*.ui.json`) that people tune in the editor's UI
mode; the view places them and keeps the model, intents and motion. Skill `ui-documents` covers
building them with `gameengine ui doc` (widgets, properties, states and poses, lists, dialogs) and placing them
(`<Widget doc props onIntent refs codeAreas>`, `src/ui.gen.ts`). The rest of this skill is the view side, and
the TSX for what documents do not hold: particles, models, skeletons, rich text and pooled lists (in a
document's code area), per-aspect layout, and views that are mostly those. Port older TSX views with the
`ui-views-to-documents` skill.

## Animation

UI motion is CSS played natively over UI time (presentation: no JS per frame, never in sim systems).
Reach for the built-in effects first; every project has them, below its own stylesheets.
Script motion CSS cannot express (a count-up, a popup queue's timer) goes in `onUiFrame((now) => …)` from `@gameengine/ui`:
it runs once per UI frame with UI time in seconds until you call the stop it returns, and costs nothing while none is set.
When several effects feed one view in a frame (a placement updates the board, the score and the goals), updating the view from each renders it once per effect.
Note the change in the effects and apply it from `onUiFrameEnd(() => …)`: it runs once per UI frame after the frame's effects and before its ops go to the engine, so the view renders once and shows it in the same frame (from `onUiFrame` it would land a frame late).
It runs until you call the stop it returns, whoever registered it: in a view or a popup's controller, `onCleanup(onUiFrameEnd(…))`. A change noted by an effect the hook's own writes trigger waits for the next frame's hook.

| Enter | Exit | Attention (once) | Loops |
|---|---|---|---|
| `fx-pop-in` `fx-fade-in` `fx-scale-in` `fx-slide-in-up/down/left/right` | `fx-pop-out` `fx-fade-out` `fx-slide-out-up/down/left/right` | `fx-bounce` `fx-shake` `fx-wiggle` `fx-attention` `fx-pop` `fx-pulse` | `fx-pulse-loop` `fx-glow-loop` `fx-heartbeat` |

Tune per element: `--fx-duration` (`0.5s`), `--fx-delay`, `--fx-strength` (1 = normal, 2 = bigger), `--fx-distance` (slides, px).

```tsx
// A view that pops in, fades out and is modal: defaults for every push.
export const Reward = defineView<RewardModel>({ name: 'Reward', samples, enter: 'fx-pop-in', exit: 'fx-fade-out', blockInput: true, render });
views.push(Reward, model, { enter: 'fx-slide-in-up' }); // override per push; `null` = none
views.pop();                                             // leaves the stack now, nodes go after the exit
// A looping CTA and stars that land one after another, all in TSX/CSS:
<Button class="collect fx-pulse-loop" label="Collect" onPress={() => intent('collect')} />
{[0, 1, 2].map((i) => <Sprite src="ui/star" class="star fx-pop-in" style={{ '--fx-delay': `${0.25 + i * 0.12}s` }} />)}
<Text animateOnChange={{ effect: 'fx-pop', strength: 1.5 }}>{() => model().coins}</Text>
```

From controllers (Web Animations shape, ms): `ui.animate(ref, 'fx-bounce', { duration, delay, iterations, easing, strength })`
→ `{ finished: Promise<boolean>, cancel, pause, play, finish }`; `ui.stagger(parentRef | refs, 'fx-slide-in-left', { each: 40, from: 'start' | 'end' | 'center' })`.
Get refs with `ref={(n) => (node = n)}`. `finished` never rejects (false when cancelled or removed).

Own motion is plain CSS: `@keyframes` (`from`/`to`/`%`, per-keyframe `animation-timing-function`) and `animation` /
`animation-*` (iteration-count incl. `infinite`, direction, fill-mode, play-state, `animation-composition: add` to layer on the
element's own transform). Animatable: `transform`, `opacity`, `background-color`, `color`, `border-color`, `tint`,
`text-stroke`, `text-shadow`, `border-radius`. Easings: CSS names, the engine set (`out-back`, `in-out-sine`, …),
`cubic-bezier()`, `steps()`, or a formula of the progress `t` with `expr()` (evaluated natively; it may leave 0..1):
a Unity shake `sin(t·(1+8t)·4π)·max·(1−t)` is two keyframes (`rotate(0)` → `rotate(<max>)`) with
`animation-timing-function: expr(sin(t * (1 + 8 * t) * 4 * pi) * (1 - t))` (or `easing: 'expr(…)'` in `ui.animate`) —
no baked samples. Names: `t`, `pi`, `e`; functions `sin cos tan abs sqrt exp floor fract sign min max pow step clamp mix smoothstep`.
`var(--x, fallback)` and `calc()` work in any value; `calc()` mixes units, takes parentheses and scales `env()`:
`padding-top: calc(env(safe-area-inset-top) * 0.5 + 20px)` (`%` only combines with `%`).

- Reduced motion is honoured for you (`ui.setReducedMotion(true)` from a settings toggle, `ui.reducedMotion` in
  `project.gameengine.json`): motion is dropped, enters/exits become short fades. Style extra cases with
  `@media (prefers-reduced-motion: reduce)`.
- Check it without a device: `gameengine view render Reward --times 0,0.1,0.2,0.4 --out reward.png` writes a contact sheet
  (enter from t=0); `--phase exit` samples the exit instead, from the pop of the view at rest (its enter and CSS animations
  ended). `--json` reports `span`, the transition's length without loops, to pick times from. UI Preview in the editor has
  Replay, Pause and a scrubber.
- In tests, UI time advances by the fixed step: `const f = ui.animate(n, 'fx-bounce').finished`, set a flag in `.then`,
  `await step(n)` (world tests may only await `step`), and a `renderTest` screenshot at a fixed step is a stable golden.

## Flying an icon to a counter

Coins, gems, lives and items flying onto a counter or button go through `ui.animateTo`, never hand-written keyframes:

```tsx
// Pooled icons (see Lists), launched from the reward, onto the chip's `target` point.
await ui.animateTo(icons, {
  from: 'reward.icon',                    // default: where each icon is
  to: ['coins.target', 'play'],           // the counter's icon, then a fallback when it is not shown
  land: 'target-size',                    // or a scale factor
  stagger: 70, duration: 720, arc: 0.25, easing: 'in-out-sine',
  onLand: (i) => { setShown((n) => n + perIcon); if (i === 0) ui.animate(chipRef, 'fx-bounce'); },
});
```

- **Measure in screen space.** Both ends are measured with `drawnRect` as the icons launch: the box drawn after every
  ancestor's transform, scroll and clip (the numbers `gameengine ui layout` prints). `elementRect` is the layout box
  without transforms: anything under a scaled or moved ancestor is elsewhere on screen, so never aim at it.
- **Aim at the target's icon**, not the whole button or capsule: give the document a point (`target`, skill
  `ui-documents`) or the icon an id. Never type in screen positions.
- **Land at the target's size** (`land: 'target-size'`) and **declare a fallback** for when the counter is not shown
  (another screen covers it): the first id in `to` that is shown wins. With none shown it logs a warning and nothing
  moves, never a silent fade.
- **Prove it lands:** render the last frame on the narrowest and widest device (`view render <View> --devices --times
  end`: every animation and flight at its end), and add a renderTest on both that ends the flight with
  `ui.finishAnimations()` and checks `expect(icon).toLandOn('coins.target')` (centres within 2 px, where both are
  drawn; `samples/ui-gallery` `tests/animate-to.test.tsx`).
- **Layout numbers live in CSS.** A count or spacing that changes with the screen (columns, a gap, a breakpoint) is a
  custom property in a media query, read with `ui.cssVar('grid', '--cols')`, never a second copy of the breakpoint
  in script.

## Particles, 3D models and 2D skeletons in views

All three are elements: they draw in **tree order** (siblings before them behind, after them in front), scale with the canvas
and are clipped by an `overflow: hidden` parent, like a Sprite. Size and place their box with CSS.

```tsx
<View class="medal">                                     {/* overflow: hidden clips the glow */}
  <Particles class="glow" effect="vfx/shine.vfx.json" />  {/* behind the coin */}
  <Model class="coin" mesh="builtin:torus" material="ui/coin.mat.json" rotation={[90, 0, 0]} spin={120} bob={[0.06, 1.6]} />
</View>
<Particles class="confetti" effect="vfx/confetti.vfx.json" restart={() => model().opened} />  {/* last: in front */}
<Model mesh={item.mesh} color={item.color} rotation={[20, 35, 0]} />  {/* a still list item: renders once */}
<Model class="portrait" mesh="models/hero/Hero.fbx" animation={() => `models/hero/Hero@${model().line}.fbx#${model().line}`}
  loop={false} mix={0.2} queue={{ animation: 'models/hero/Hero@Idle.fbx#Idle', mix: 0.3 }} restart={() => model().lines}
  camera={{ fov: 30, distance: 0.6, pitch: 0, target: [0, 1.6, 0] }} onFinish={() => intent('lineDone')} />  {/* a talking head */}
<Skeleton class="cat" skeleton="rig/cat.skeleton2d.json" animation={() => model().mood} mix={0.25}
  queue={() => (model().mood === 'cheer' ? 'idle' : null)} restart={() => model().cheers} skin={() => model().skin} />
```

- `Particles`: `effect` (a `*.vfx.json`, see the `vfx` skill), `emitting` (false stops, live particles finish; true again
  restarts), `restart` (a new value replays the effect from the start: put a counter in the model and bump it from the
  controller or an intent), `unit` (reference px per effect unit, default 100), `seed`. Emits from the box's centre.
- `Model`: `mesh`, `material`, `color`, `rotation` (Euler degrees), `spin` (deg/s about Y, or `[x, y, z]`), `bob`
  (`amplitude` or `[amplitude, seconds]`), `scale`, `camera: { fov, distance, pitch, yaw }`, `light: { direction, color,
  intensity, ambient }`. Rendered into a shared render-target page and drawn as a sprite; it renders again only when a
  prop or its pose changes. `spin`/`bob` re-render it every frame: keep them to the item in focus in long lists, and pin it
  in a test with `render.stats().uiModelsRendered`. `camera.target` (`[x, y, z]`, model units after `scale`) is the point
  the camera orbits and looks at: frame a head on a full-body model with it and a short `distance` (a Unity porthole's
  orthographic size `s` at model scale `k` is about `distance = s / k / tan(fov / 2)` with `target` at the head).
- **Clips on a skinned `Model`** (the `models-3d` skill imports them): `animation` (`file#clip`, e.g. Unity's
  `Hero@Talk.fbx#Talk`, or a clip of the mesh's own file; a changed name plays it, cross-fading over `mix` seconds;
  `null` is the bind pose), `loop` (default true), `queue` (`'Idle'`, or `{ animation, loop, mix }`: what follows a
  one-shot, starting `mix` seconds before its end), `restart` (a counter: replays `animation`), `timeScale` and `speed`
  (multiplied; 0 holds the pose) and `onFinish()` (a one-shot `animation` reached its end, once per play; a clip that
  is not in the file plays nothing and never finishes; the UI warns once in the console). The clip plays
  on **UI time** in the host and poses through the world's skinning code (joints matched by name, as `*.animctrl.json`
  clips): no `Animator`, no hash, and a contact sheet shows the pose at each time. A playing clip renders every frame; a
  finished one-shot without a queue, or `timeScale: 0`, renders once. One clip at a time with one cross-fade: blend
  trees, layers, masks and IK stay on a world `Animator`. `overflow: hidden` clips to a rectangle; for a shape, put
  `mask-image: url("<image>")` on an element around the model: it and everything in it draw only where that image is
  opaque, stretched over its box (a portrait whose rig leaves the frame above but is cut by its round bottom).
- `Skeleton` (a `*.skeleton2d.json`, see the `skeleton-2d` skill): the same play/queue/mix API as `Skeleton2D`, as props.
  `animation` (a changed name plays it on the base track, cross-fading over `mix` seconds), `loop` (default true),
  `queue` (`'idle'`, or `{ animation, loop, additive, mix, delay }`: what follows when it ends), `restart` (a new value plays
  `animation` again: a counter for a one-shot that is already the current name), `timeScale`, `layers` (tracks 1–7 over the
  base: `[{ animation: 'blink', alpha, loop, additive, mix, queue, timeScale, restart }]`; `additive` adds the layer's bone
  offsets to the base instead of replacing them), `skin`, `speed` (every track; 0 holds
  the pose), `color`, `flip` (`'x' | 'y' | 'both'`), `scale` (zoom) and `bounds` (`[minX, minY, maxX, maxY]` skeleton px
  to fit into the box; default the setup pose's, so pass it when an animation reaches past the setup pose). It plays on
  **UI time** in the host, never in the sim: no `Skeleton2DEvent`s, no hash, no entity; a seek or contact sheet shows the
  pose at that time. Rendered into the same page as `Model`s: a playing skeleton renders every frame, a paused or
  finished one once (`render.stats().uiModelsRendered`); all of a frame's playing skeletons share one offscreen pass
  (`uiCellPasses`), and one faded to opacity 0, off screen or outside its clip is not rendered. Game logic that reacts to a character's animation events stays a
  world `Skeleton2D`.
- `Flipbook` (a `*.clip2d.json`, see the `flipbook-2d` skill): `clip`, `playing` (false holds the frame), `loop`
  (`'asset' | 'once' | 'loop' | 'pingpong'`), `speed`, `restart` (a counter: replays from the start), `color`, `flip`,
  `onEvent(e)` (the clip's frame events: `e.name`, `e.frame`, `e.int`, …) and `onFinish()` (a `once` clip ended; it
  holds its last frame). The frame's sprite is stretched over the box: size it to the frames' aspect in CSS. Keyed
  `offset` moves it in box sizes. It draws as a plain batched sprite (no render target), so lists of animated icons are
  cheap. UI time, presentation only: game rules keyed to frames stay on a world `Clip2D`. Events fire on rendered
  frames (test them in a `renderTest` that calls `render.stats`, as `samples/rig-yard/tests/flipbook-view.test.ts`);
  a looping clip shown after being hidden reports at most its last cycle.
- **CSS sprites vs UI particles:** a few hand-placed sprites that pop, pulse or slide → `fx-*` / `@keyframes` on a
  `Sprite` (exact, art-directed). Many randomised bits (confetti, sparkles, coin bursts, glints) or an effect that already
  exists as `.vfx.json` → `<Particles>`. Anything in the game scene → a world `ParticleSystem`, not the UI.
- Both preview, scrub and render as contact sheets like the rest of the view (UI time), and `renderTest` goldens are stable.
- Unity ports: a `ParticleSystem` under a Canvas (UIParticle, Coffee.UIExtensions) → `<Particles>` with the converted
  effect; a `RawImage` showing a `RenderTexture` from a 3D preview camera → `<Model>` (an `Animator` playing the
  character's `model@clip.fbx` takes → `animation`/`queue` props, the camera's framing → `camera.target`/`distance`); a Spine `SkeletonGraphic` (a HUD
  character, a menu icon) → `<Skeleton>` with the imported rig (`spine-import`), never a baked flipbook; an `Animator`/`SpriteRenderer` frame
  animation on a UI `Image` → `<Flipbook>` with the clip; `AnimationState`
  calls from the view's script (`SetAnimation`, `AddAnimation`, `timeScale`, `Skin`) → props driven by the model.

## Layout for Unity ports

Layout is flexbox and grid (Taffy); Unity's layout groups map onto them:

| Unity | Here |
|---|---|
| HorizontalLayoutGroup / VerticalLayoutGroup | `<Row>` / `<Column>` (`flex-direction`), `gap` for spacing, `padding` |
| Child Force Expand (each child centred in an equal share) | children `flex: 1 1 0`, content centred with `justify-content: center` / `align-items: center` inside each child |
| Child Alignment | `justify-content` (main axis) and `align-items` (cross axis) on the container |
| LayoutElement preferred / flexible width | `flex-basis` = preferred, `flex-grow` / `flex-shrink` = flexible, `min-width` = min |
| GridLayoutGroup (cell size, spacing, constraint count) | `display: grid; grid-template-columns: repeat(<count>, <cell>px); gap: <spacing>px` |
| ContentSizeFitter | the default: a box without a size fits its content |

## 9-slice & Unity mapping

Sprites (`<Sprite>`/`<Image>`, or `background-image` on any element) draw stretched, 9-sliced,
filled, tiled or mirrored. **Border values are source texels** (the PNG as the artist made it,
before gmeta `max_size`), never screen px.

- **Order.** Put borders on the texture once, in its `.gmeta`, and use `auto` everywhere:
  `[settings] border = { top = 12, right = 18, bottom = 8, left = 6 }` → `<Sprite src="ui/frame" slice="auto" />` or
  `background-slice: auto;`. Inline: the prop takes **named sides** `slice={{ top: 12, right: 18, bottom: 8, left: 6 }}`
  or one number; CSS takes **`top right bottom left`** like `margin` (`background-slice: 12 18 8 6`). Arrays are refused
  (Unity's `spriteBorder` is x=left, y=bottom, z=right, w=top: never copy the four numbers in that order).
- **Body and content padding live there too.** `body = { bottom = 16 }` is the box inside the texture: the art outside
  it (a button's hard shadow) draws past the element without growing its layout or hit area. `content = { top = 48,
  right = 104, bottom = 56, left = 104 }` (inside the body) is the padding of every element showing the texture on the
  sides it does not pad itself. Both apply where the texture draws 9-sliced (`slice="auto"` with a border), never to an
  image leaf (`<Sprite src>` alone is measured as its whole texture). A declared `background-outset` or `padding-*`
  wins. Set them once and drop the per-view paddings that repeated them.
- **Keep it round.** Borders wider than the box on an axis shrink in proportion (Unity's GetAdjustedBorders), which
  squashes round corners and caps. So:
  - `sliceScale` keeps each border at most half of the box's smaller side (top + bottom ≤ height, left + right ≤
    width): caps that draw 120 px tall at `sliceScale` 1 need 0.5 or less on a 60 px-high button.
  - A capsule (pill button, counter, bar) slices on its long axis only, with full-height caps: border left and right
    of half the texture's height, top and bottom 0, and a `sliceScale` that makes the caps exactly the box's height.
  - Labels centre on the texture's `.gmeta` `content` box (it pads every element showing the texture, a `<Sprite
    slice="auto">` with children included), never on hand-tuned margins or offsets per view.
  - A progress fill reveals its parent's art (`background-fill-keep: caps`, or `keepCaps` in a document) instead of
    shrinking its width, so it keeps its round end at every amount.
- **Check it.** `gameengine view render <View>` prints `warning: … leave no stretchable middle …` when left+right
  (or top+bottom) cover the whole image while the element is stretched on that axis: the signature of swapped borders.
  It (and `gameengine ui layout`, and `gameengine view lint` over every view on the slim and wide device) also warns
  about caps squashed by a small box (with the `sliceScale` that keeps them round), a child out of its parent,
  in-flow siblings drawn over each other, text larger than its box and a label off its face's content box. Fix
  what it names; mark a badge or ribbon placed over an edge on purpose with `overlap: attach` (`attach` in a
  document). `gameengine check --strict` fails on them.

| Unity (Image / Canvas) | Game Engine |
|---|---|
| Sprite Editor border (L, B, R, T) | gmeta `border = { left, bottom, right, top }` + `slice="auto"` |
| Image Type Sliced | `slice="auto"` / `background-slice: auto` |
| Android nine-patch padding and optical bounds | gmeta `content = { … }` and `body = { … }` |
| Pixels Per Unit Multiplier `m` (sprite PPU `p`, canvas ref PPU 100) | `sliceScale = 100 / p / m` (`background-slice-scale`) |
| Borders wider than the rect (GetAdjustedBorders) | same: both shrink in proportion |
| Fill Center off | `fillCenter={false}` / `fill-center: false` |
| Image Type Tiled | `tile` / `background-repeat: repeat` (whole image; tiled 9-slice centres are not supported) |
| Image Type Filled, Horizontal/Vertical/Radial360, origin, clockwise, fillAmount | `fill={{ method: 'radial360', origin: 'top', amount, clockwise }}` / `background-fill: radial top 75%` (no 9-slice while filled; Radial90/180 unsupported) |
| negative `localScale.x` on an Image | `flip="x"` / `background-flip: x` (or `transform: scale(-1, 1)`, same pixels, also flips children) |
| a half-frame plus its mirrored copy | one element: `mirror="x"` / `background-mirror: x` with the half art |
| RectMask2D / Mask on a scroll list | `overflow: hidden` (a screen-aligned scissor; clicks outside are ignored); `RectMask2D.softness` (x, y) is `clip-softness: <x>px <y>px`. A `Mask` on an Image (sprite-shaped, `showMaskGraphic` off) is `mask-image: url("<image>")` on the same-sized element: it and its children draw through the image's alpha; a *Sliced* mask image adds `mask-slice: auto` (its `.gmeta` borders keep their size). In a UI document it is the `mask` field |
| ScrollRect (drag, inertia, wheel, elasticity, snapping) | `<ScrollView>` (`horizontal` for a horizontal one), `overscroll: bounce`, `scroll-snap`; no scrollbars |
| CanvasScaler ScaleWithScreenSize, match 0 / 1 / 0.5 | `"ui": { "referenceResolution": [w, h], "match": "width" \| "height" \| 0.5 }` (default `"fit"`) |
| An aspect-adjusted CanvasScaler (match height, width below the reference aspect) | `"match": "fit"`, never `"height"` plus transforms on anchor boxes (skill `screen-fit`) |
| Image Preserve Aspect | `fit="contain"` / `object-fit: contain` (`cover` fills the box and cuts the rest) |
| a material with additive / multiply blending on an Image | `blend="additive"` / `mix-blend-mode: plus-lighter`; `multiply`, `screen` |
| TMP outline | `text-stroke: 4px #000` (up to 0.2 em; past ~1/18 em it draws as rings of copies, so keep very wide outlines to short labels) |
| TMP Color Gradient (vertical, or any angle) | the web's gradient text: `background: linear-gradient(#ffe066, #ff9a00); background-clip: text;` (top to bottom by default; `to right`, `45deg`, up to 5 stops; the gradient spans the element's box, not each letter). A gradient on a box is not drawn: use an image |
| TMP underlay (offset, dilate, softness) | `text-shadow: 0 6px <blur> <spread> #000`: blur and spread top out around 1/16 em |
| TMP rich text (`<b>`, `<i>`, `<color=#hex>`, `<size=…>`) | `<Text rich>` with the same tags (`<size=1.5>` is an em multiplier, not points) |
| TMP Auto Size (min / max) | `text-fit: 24px 72px` on a sized box: the largest size that fits |
| TMP keeps trailing spaces | `white-space: pre` (no wrap) or `pre-wrap`; the default trims them as CSS does |
| TMP Character Spacing | `letter-spacing: 2px` (UI documents: `letterSpacing`) |
| TMP UPPERCASE style | `text-transform: uppercase` (documents: `upper`); keys resolve first, then each language upper-cases |
| TMP Bold with no bold font asset | `font-weight: 700` draws synthetic bold (documents: `weight`); a rule that picks a bold face adds `font-synthesis: none` |
| A full-bleed band under the notch (a top bar's colour) inside a `safeArea` node | `safe-area: bleed` on that child: its edges at the safe rect reach the screen's, its content keeps its place (documents: `safeArea=full`) |
| A localisation table (I2 Localization, a converter's CSV turned JSON) | `gameengine import strings <table.json> [--lang en] [--dry-run]` merges its keys into `locales/<lang>.json` (added or replaced, the rest kept); `t('key')` reads them, and `gameengine validate` reports literal keys `locales/en.json` lacks (`t('…')`, `{loc}` in documents, `locKey` in scenes) as `E_TEXT_KEY` |

- **Draw calls.** The UI pass batches draws that do not overlap even when they alternate in tree order (buttons and
  their labels): what still costs a draw is overlapping content with different textures, text over sprites over text.
- Match the reference too: a Unity canvas of 1284×2778 matched to height is `referenceResolution: [1284, 2778], match: "height"`,
  unless its scaler switches to width on narrower screens (most mobile ports do): then it is `match: "fit"`.
- **Row gotcha.** `Row` is `align-items: center`. A child whose own children are all `position: absolute` has height 0,
  so it is centred on the row's middle and its content hangs half a row low. Give such children `align-self: stretch`
  (or a height).
