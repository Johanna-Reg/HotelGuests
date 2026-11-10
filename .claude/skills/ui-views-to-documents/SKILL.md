---
name: ui-views-to-documents
version: 1.3.0
tier: required
description: Porting TSX views (src/views/*.view.tsx) into UI documents so they edit in the UI mode — inventory, mapping, keeping ids, thin <Widget doc> views, before and after renders. Use when an older project's views are missing from the UI documents Library, or when asked to port, convert or migrate views.
---

# Port TSX views to UI documents

**Covers:** Moving an existing project's TSX views (defineView in src/views/*.view.tsx with ui/*.style.css) into UI documents (ui/**/*.ui.json) so they show and edit in the editor's UI mode — the inventory, before renders, what moves into documents and what stays TSX, the TSX/CSS to document mapping (Button, Text, Sprite, Show, For, ScrollView, fx-* entrances, 9-slice), keeping element ids so flow tests pass, rewriting each view to a thin <Widget doc>, and proving the port with before/after renders and the game tests. Use when a project made before UI documents has views that are not in the UI documents Library, or when asked to port, convert or migrate views to documents.

A project made before UI documents (ADR 0122) has its UI as TSX views and stylesheets. They keep working, but
the editor's UI mode only shows documents, so designers cannot tune them. A project that stays on TSX
also rebuilds by hand what documents carry: flight points (`point=target`, `widgetPoint`, aimed at by
`ui.animateTo`), `keepCaps` fills, 9-slice faces and content padding from the texture's `.gmeta`, and editing in the editor.
So port a view before copying it into a new screen; `gameengine
check` warns about TSX views that place no document. Porting a view moves its
**looks** into documents and leaves a **thin TSX view** that places them, fills their properties from the model,
maps their events to the view's old intents and keeps the motion. Controllers, models, intents and tests do not
change. Read the `ui-documents` skill first: it has the commands, the format and the split.

Port one view at a time, smallest first, and keep every step compiling: the user may have the editor open.

## 1. Inventory and before renders

```sh
gameengine view list                                   # every view with its samples
gameengine view render Pause --sample default --devices --out .gameengine/port/before/Pause-default.png
```

Render **every sample of every view** you will port, on `--devices` (a slim and a wide phone). These PNGs are
the contract: after the port the same renders must match. Also run the game tests once and note the result
(`gameengine test`), so a failure afterwards is yours.

For each view, list: its model fields, its intents (and their payloads), the element ids its tests use
(`ui.press('resume')`, `ui.rect('score')`), its `layer` / `dims` / `blockInput` / `enter` / `exit`, and what it
draws that documents cannot hold (below).

## 2. Decide what moves

| In the view | Goes to |
|---|---|
| Panels, rows, columns, labels, icons, images, buttons, toggles | a document |
| A button or chip used in several views | its own `widget` document, placed with `use` |
| A whole popup or screen with an entrance | a `view` document (Enter / Exit poses, `dialog` or `screen`) |
| Text that depends on the model (`Score 120`, a price) | a text property (`{score}` placeholder in a label) |
| `<Show when>` around an element | a `yesno` property with a pose that hides it (`show=` on the layer) |
| Two looks of one thing (locked / open, gold / silver) | an `enum` property with a pose per value |
| `<For each>` over model items | a `list` property and a `repeat` of an item document |
| `<ScrollView>` | an element with `scroll` (a Repeat inside it is virtual) |
| Screen anchors (`.a-top`, `.a-bot`), `@media (aspect …)`, `env(safe-area-*)` | **stays TSX/CSS**: the view places the documents inside its anchors |
| `<Text rich>`, `<Particles>`, `<Model>`, `<Skeleton>`, `<Flipbook>`, `<Pooled>` | **stays TSX**, in a `codeArea` of the document |
| `fx-*` entrances, `@keyframes` loops, staggers, `animateOnChange` | **stays in the view**: `refs` + `ui.animate`, or the view document's Enter pose for a plain fade / slide / scale |

A view that is mostly code areas (a 3D portrait lab, a particle showcase) is not worth porting: leave it TSX and
say so.

## 3. Build the documents with the CLI

Never write the JSON by hand: `gameengine ui doc` validates every edit against the
whole project and writes the file as the editor does.

```sh
gameengine ui doc new pause --kind view
gameengine ui doc settings pause behaviour=dialog dims=yes         # the old view's popup / dims, as the document's stack behaviour
gameengine ui doc set pause root bg=#00000000 pad="0 24"           # the root: a full-screen element
gameengine ui doc add pause element --parent root --id p_panel --set image=ui/panel --set w=320 --set pad="24 20"
gameengine ui doc add pause label --parent p_panel --id p_title --text PAUSED --set fontSize=44 --set color=#ffffff
gameengine ui doc prop add pause score --type number --default 0
gameengine ui doc add pause label --parent p_panel --id p_score --text '{score}' --set fontSize=28
gameengine ui doc add pause use --parent p_panel --doc button --key resume
gameengine ui doc show pause                                        # check the outline after each few edits
gameengine view render doc:pause --devices --out .gameengine/port/doc-pause.png
```

Mapping CSS to document fields (`ui doc show` prints the same names):

| CSS / TSX | Document field |
|---|---|
| `flex-direction` | `dir` (`column` / `row`) |
| `align-items`, `justify-content`, `gap`, `flex-grow` | `align`, `justify`, `gap`, `grow` |
| `width`, `height` (px or %) | `w`, `h` (`auto`, a number, `50%`) |
| `padding`, `margin` (`top right bottom left`) | `pad`, `margin` (`"t r b l"` or one number) |
| `position: absolute` + `left/top` in a box | `position=anchored`, `anchor`, `offset`, `pivot` |
| `background-color`, `border-radius`, `opacity` | `bg` (`#rrggbbaa`), `radius`, `opacity` |
| `background-image` / `<Sprite src slice="auto">` | `image=<texture key>` (9-slice comes from the texture's `.gmeta` border) |
| `object-fit`, `background-flip` | `fit`, `flip` |
| `tint` (CSS multiplies) | `tint` + `tintMode=multiply` (the document default, colorize, gives other colours) |
| `background-slice: N` with no border in the texture's `.gmeta` | add the border to the `.gmeta` (`[settings] border = { … }`), then `image=` |
| `flex: 1 1 0` (equal shares) | `w=0 grow=1` |
| `max-width`, `min-width`, `align-self` | none: a fixed `w`, or keep that wrapper in the TSX view |
| a negative `margin` (an overlapping ribbon) | `position=anchored` with `offset` (negative margins do not lay out as in CSS) |
| `font-size`, `font-weight`, `color`, `text-align` | `fontSize`, `weight`, `color`, `textAlign` |
| `text-fit: min max` | `fontSize` = max, `fitMin` = min |
| `text-stroke`, `text-shadow` | `outline` + `outlineColor`, `shadowX/Y` + `shadowColor` + `shadowSoft` |
| `background: linear-gradient(…)` + `background-clip: text` | `gradient="linear-gradient(…)"` |
| `overflow: hidden` | `clip=true` |
| `transform: translate / scale / rotate` | `tx`, `ty`, `scale`, `rotate` (animate these in poses, not `w` / `h`) |
| `:active` / pressed looks | `ui doc settings <doc> behaviour=button`, then `--state pressed` |
| `transition: … 0.1s ease-out` on the press | `ui doc settings <doc> transition="easeOut 100"` |
| `display: none` | `hide=true` (in a pose) |

Sizes in documents are reference px, as in CSS. Give each document one sample per sample the old view had
(`gameengine ui doc sample results best score=980 best=yes`), then `gameengine ui doc check`. A placed widget's
property is set by its name (`ui doc set pause p_resume label=Resume`; `@score` binds it to the holder's property).

## 4. Keep element ids

Tests find elements by id, and `onIntent` hears the use's **key**. Make every key the id the old view used:
a button `<Button id="resume">` becomes `use … --key resume`. Inside a `<Widget>` placed **without** `id`, the
key is the element id (`ui.press('resume')` keeps working); `<Widget id="pause">` prefixes it (`pause.resume`).
So place a ported view's document without `id`, unless the old ids were already prefixed.

## 5. Rewrite the view

The model, samples, name, layer and intents stay (except `layer: 'popup'`, which is gone: popups are screens now). Only `render` changes, and the stylesheet loses the rules the
document now holds (keep the anchor and placement rules).

```tsx
export const PauseView = defineView<PauseModel>({
  name: 'Pause',
  blockInput: true,
  samples: { default: { score: 120 } },
  render: (model, { intent }) => (
    <Widget doc="pause" props={{ score: () => model().score }} onIntent={(_, e) => intent(e.path.at(-1)!)} />
  ),
});
```

- Run `gameengine gen` after the document edits: `src/ui.gen.ts` types the `props`, `codeAreas` and `refs`, so a
  wrong property name or value fails the typecheck. Its doc comment lists the events `onIntent` will hear.
- `e.path.at(-1)` is the pressed use's key, whatever the document's kind. A view document's own events are the keys
  themselves; a widget document placed without `id` prefixes them with a key from its first text property.
- Which kind: a whole popup or screen is a `view` document; parts placed inside the TSX view's anchors (a title
  block, a button column) are `widget` documents, one per anchor group.
- A button's own `haptic=` has no document field: it gets the project's `ui.button` default. Keep a stronger
  haptic only by leaving that button TSX, and say so.
- An intent with a payload: read it from the event (`(_, e) => intent('haptics', e.on)` for a toggle's
  `haptics: changed`). Map names that differ with a small table (`const INTENTS = { 'pause-quit': 'quit' }`).
- A view document brings its own Enter / Exit poses: drop the view's `enter: 'fx-fade-in'` once the document's
  Enter pose does the same, or keep the `fx-*` and leave the poses empty. Never both.
- What stays TSX goes in a code area: `codeAreas={{ logo: <Sprite src="ui/logo" class="logo" /> }}`.

## 6. Prove it

```sh
gameengine gen && npx tsc --noEmit                 # or your project's typecheck script
gameengine view render Pause --sample default --devices --out .gameengine/port/after/Pause-default.png
gameengine test                                   # the flow tests, unchanged
```

Put each before and after side by side and look at them: same layout, text, images and sizes on both devices. A
few px of text placement is fine; a missing element, a different size or a clipped label is not. Fix it in the
document (`ui doc set`), render again. Then `gameengine check`. In your summary, list the views ported, the
ones left TSX and why, and the before/after renders.

## Traps

- `ui doc` refuses an edit the format refuses and writes nothing: read the message, it names the field.
- An `enum`'s values are kebab-case words; a yes/no pose names `yes` / `no`.
- A label's text never changes per pose: two labels with hide poses, or a text property.
- Documents do not read CSS variables or `@media`: per-aspect layout stays in the view's anchors.
- `image` takes a texture key without extension (`ui/panel`), as `<Sprite src>` does.
- A number shown with separators is `prop add … --type number --format thousands` (`compact`, `percent`, `fraction`).
- An element pads 8 when added: set `pad=0` where the CSS had none. `point` names are kebab-case.
- Remove a document with `ui doc delete` (it refuses while something places it), never `rm`.
