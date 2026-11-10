---
name: ui-documents
version: 1.7.0
tier: required
description: UI documents (ui/**/*.ui.json) for every HUD, menu, popup, button and widget, built and changed with `gameengine ui doc` (MCP ui_doc_*), never hand-written JSON — layers, layout, states, poses, drivers, lists, transitions, placing one from a thin view. Use whenever a ui/**/*.ui.json is made or changed.
---

# UI documents: widgets and views as data

**Covers:** Building game UI as UI documents (ui/**/*.ui.json, ADR 0122), the format the editor's UI mode edits — widgets (buttons, toggles, chips, bars, rows) and views (screens, dialogs) made and changed with `gameengine ui doc` (MCP ui_doc_*), never hand-written JSON. Covers layers (elements, labels, icons, placed widgets, repeats, code areas), layout, anchors, images and text; a widget's face (text, number, yes/no, enum, list, choice, image and trigger properties) and its events; states and poses (Pressed, Disabled, yes/no and enum values, number Empty/Full with Range/Steps/Smooth drivers, Fill, lit up to, reactions, Enter/Exit) and their transitions; lists (Repeat, groups, tab bars, virtual scrolling lists); screens and dialogs on the view stack; placing a document from a thin TSX view (<Widget doc props onIntent refs codeAreas>, src/ui.gen.ts), samples, renders and tests. Use for every new HUD, menu, popup, button or widget, and whenever a ui/**/*.ui.json changes.

A **UI document** (`ui/**/*.ui.json`) is a widget or a whole screen that a person can open and tune in the
editor's **UI** mode. The split, from ADR 0122:

- **The document holds the looks:** structure, layout, images, text, and every look that follows state
  (Pressed, a toggle's on, an enum's value, a number's position, a reaction, a view's Enter / Exit).
- **Code holds the flow and the motion:** a thin `defineView` places the document, fills its properties from
  the model and turns its events into intents (skill `ui-mvc-views` for views, controllers and the stack).
  Entrances, loops, staggers and one-off moments are `ui.animate` in that view.

New UI is documents: every new HUD, screen, popup, button or row. A TSX-only view is for what documents cannot
hold (end of this skill). A project with older TSX views ports them with the `ui-views-to-documents` skill.

## The loop

Edit documents only with `gameengine ui doc` (MCP `ui_doc_list`, `ui_doc_show`, `ui_doc_check`, `ui_doc_edit`).
It runs the editor's own edits, checks every document alone and the whole set as `pnpm gen` does, and writes
all its files or none: a refused edit writes nothing and names the field. It keeps GUIDs and fixes the
documents that place the one it changes. Hand-written JSON skips all of that.

```sh
gameengine ui doc list                      # every document: kind, file, title, properties
gameengine ui doc show chip                 # read this, not the JSON: layers + style, properties, poses with their flags, events, where used
# … edits (below) …
gameengine ui doc set shop s_buy style.label=… | props.label=…   # a key that is both a style field and the placed widget's property
gameengine ui doc check                     # the whole set
gameengine gen                              # src/ui.gen.ts: <Widget doc> props, code areas and refs as types
gameengine view render doc:chip --sample rich --devices --out chip.png   # look at it on a slim and a wide phone
```

`--dry-run` on any edit says what it would write. `--json` on any command gives the result as data (new layer
ids, files). The editor follows the files: a saved document hot-reloads in place in the editor and a running game.

## Kinds and behaviours

| Make | Command | What you get |
|---|---|---|
| A widget (button, chip, bar, row, card) | `ui doc new reward-chip` | `kind: widget`, a row root to build in |
| A screen or dialog | `ui doc new shop --kind view` | `kind: view`, a full-size root, `behaviour: screen` |
| A tab bar | `ui doc new tabs --kind tab-bar` | the bar (a Repeat of toggles in an Exactly-one group over a `tabs` list, `selected` choice) and its private `tabs-tab` |
| Step progress, stars | `ui doc new steps --kind segmented-bar` | a row lit up to `progress` over `steps` segments, and its private segment toggle |

A widget's `behaviour` is what it does when pressed: `ui doc settings <doc> behaviour=button` (sends its key) or
`behaviour=toggle` (flips its yes/no `on`, sends `changed`), default `none`. Only buttons and toggles have the
Pressed and Disabled states. A view's behaviour is how the stack shows it (below). `title=` names it in the editor.

Build in place, then promote: `ui doc make-widget shop s_card shop-card` turns a container you built into its own
widget document, placed where it was (refused while the holder's poses change layers inside it, or a code area
sits inside it: move those looks into the new widget as a property first). Make a widget for anything shown twice (a button, a chip, a row).

## Layers

```sh
gameengine ui doc add reward element --parent root --id r_panel --set dir=column --set pad="24 20" --set image=ui/panel
gameengine ui doc add reward label --parent r_panel --id r_title --text '{coins} coins' --set fontSize=28 --set weight=800
gameengine ui doc add reward icon --parent r_panel --id r_coin --set image=ui/sprites/coin --set size=48
gameengine ui doc add reward use --parent r_panel --id r_collect --doc button --key collect   # place a widget
gameengine ui doc add reward repeat --parent r_list --doc reward-row --property rewards  # one copy per list item
gameengine ui doc add reward codeArea --parent r_panel --key particles                  # an empty box code fills
gameengine ui doc set reward r_title color=#ffcc00 fitMin=18        # field=value on the base look ("" clears)
gameengine ui doc move reward r_coin --parent r_panel --index 0 · duplicate · remove
```

- Name layers with `--id` in the document's short prefix (`r_title`); poses and `set` refer to them, and without
  one the result names the id it made (`rew_button`).
- **Elements** are containers (every element can hold children, show an image and be pressed).
- **Labels:** `--text 'Level {level}'` shows a property inside text; `property=title` makes the whole text a
  property a holder sets; `loc:key` localises. A label never changes its text per state: two labels with hide
  poses, or a text property.
- **Icons:** `image=` a texture key (no extension): a white glyph tinted by `color`, or a sprite in its own
  colours; `property=icon` lets holders pick it (an `image` property); `fit` places it in its box. Any element's
  `image=@art` shows an `image` property instead of a fixed texture.
- **Any layer:** `show=<yes/no property>` shows it only while that is yes; `point=target` names it as a point
  (where a reward flies to: `ui.animateTo(icons, { to: 'coins.target' })`, skill `ui-mvc-views`).
- A new element pads 8 and a new view's root has a background: set `pad=0` or `bg=` where the design has none.
  A field the layer does not take is refused with the list of those it does.

**Layout** (UI Toolkit's flex model, reference px): `dir` (`column`/`row`), `align`, `justify`, `w`/`h` (`auto`,
a number, `50%`, or `clamp(min, preferred, max)` of those), `minW`/`maxW`/`minH`/`maxH`, `grow` (`w=0 grow=1` for
equal shares), `shrink`, `gap`, `pad` / `margin` (`"t r b l"` or one number),
`hide`, `clip=true` (clips children), `mask=ui/portrait_mask` (the layer and its children draw only where that
texture is opaque, 9-sliced by its `.gmeta` borders: Unity's `Mask`; code areas take it too). **Anchored** (taken out of the flow, placed on the parent):
`position=anchored anchor="1 0" offset="-8 8"` (anchor 0–1 of the parent; `pivot` follows the anchor unless set,
`centre` or `"x y"`). Use anchors for overlaps (a badge on a corner, a ribbon): a negative `margin` does not lay out as in CSS. Set `attach=true` on an element placed over or past its parent on purpose (a badge, a ribbon): layout
warnings then leave it out of the escape and overlap checks.

**Per aspect:** a layer's `aspect` restyles it on tall or wide screens, keyed by width ÷ height (at most 8
breakpoints): `ui doc set shop s_grid aspect='{"<0.6":{"pad":12},">=9/16":{"w":640}}'`.

**Paint:** `bg` (`#rrggbbaa`), `radius`, `opacity`, `tx`/`ty`/`scale`/`scaleX`/`scaleY`/`rotate` (the cheap fields to
animate in poses). A state or pose eases a px-to-px `w`/`h` change (a resize, costing a layout per frame while it
plays); any other size change jumps and is warned about. **Images:** `image=ui/panel` on any element, 9-sliced by the texture's own `.gmeta`
borders (fix a border there, not per element; `sliceScale` scales it), its `.gmeta` body drawn past the box (a
hard shadow; on an unsliced, stretched image the body fills the box and the transparent margin or shadow around it
reaches past in proportion, so a sprite with padding sizes by its opaque area) and its content padding used while
the element sets none (a sized, sliced image with no children overhangs its box by its border, like the
source); `fit`, `flip`, `keepCaps` (a Fill that grows
the 9-slice instead of clipping it: a clipped pill loses its round end, so turn it on for every filling button,
counter or bar; add `squeezeCaps` for a bar whose short fills squeeze their round ends instead of starting as a
whole pill, as Unity's sliced Image does), `imageSwap=cut|fade` for images swapped by poses; colour in order `tint` (+ `tintMode`
colorize | multiply, `tintAmount`), `saturation`, `brightness`, `imageAlpha` (Grey out: `saturation=0` on the same
texture). **Fill:** `fill=horizontal|vertical|radial`, `fillAmount` 0–1, `fillOrigin` (`start`, `end` or `center`): a clip reveal
for bars and rings. **Text:** `font` (a font asset key, e.g. `fonts/Digits`, for a label that is not in the project's
default face; one per label, never changed by a state), `fontSize` (max) with `fitMin` (shrinks to fit), `weight`
(600 and up draws synthetic bold and adds the class `.ud-bold`; a project whose face is already bold sets
`font-synthesis: none` on it), `letterSpacing` (px after each letter), `upper` (upper-cased after `loc:` keys
resolve), `color`, `textAlign` (may change in a state), `outline` +
`outlineColor` (outside the letters, at most 0.2 em), `shadowX/Y` + `shadowColor` + `shadowSoft`, `gradient` (a CSS
`linear-gradient(#ffe066, #ff9a00)` filling the letters in place of `color`: top to bottom, any angle, up to 5 stops). Sizes
may be fractional (`fontSize=27.5`); a face that draws larger than the original game's at the same size takes a
project-wide multiplier in `project.gameengine.json` `ui.fontScale` (`{ "fonts/Display": 0.82, "*": 1 }`, by font key)
instead of every label's size being lowered by hand.

**Text artifacts:** an outline of about 0.06 em or more on text drawn small on screen (a scaled-down game
view, a slim phone) can show a faint box in the outline colour around each letter (engine shader bug).
Check outlined labels at the smallest size (`gameengine view render <View> --devices`) and report boxes
rather than thinning outlines to hide them. Judge a rebuilt engine only in a fresh `gameengine run
--headless` or a restarted editor: a long-running process keeps drawing with the old binary.

## A widget's face: properties and events

Properties are what a holder sets; events are what it hears. `ui doc show` lists both, `src/ui.gen.ts` types them.

| Type | Make it | Drives |
|---|---|---|
| `text` | `prop add card title --type text --default Shop` | a label's `property=` or `{title}` in its text |
| `number` | `prop add chip amount --type number --format thousands` | `{amount}` in a label (`value`, `thousands`, `compact`, `percent`, `fraction`); with a Range, Empty / Full poses, Fill, lit up to |
| `yesno` | `prop add card sale --type yesno --default no` | a `no` and a `yes` pose; `show=sale` on layers |
| `enum` | `prop add mission status --type enum --values locked,active,claimable,claimed` | one pose per value (kebab-case words) |
| `list` | `prop add board entries --type list --of lb-row` | a Repeat stamping `lb-row` per item; items are `{ key, …lb-row's properties }` |
| `choice` | `prop add tabs selected --type choice --list tabs` | the key of the copy that is on (`selected=` on the Repeat) |
| `image` | `prop add card art --type image --default ui/sprites/gem` | an icon's `property=` |
| `trigger` | `prop add chip denied --type trigger` | a reaction; the holder fires it by changing a counter |

`prop rename` / `prop remove` move or drop what every placing document gives it, its samples included (`prop
remove` warns about the holders whose values go). `ui doc prop values mission status locked,active,done` changes
an enum's values in place: holders keep the values that remain, and those set to a removed one are listed and
fall back to the default.

**Placing a widget** (`add … use --doc button --key collect`): its key is the name of its events and the element
id tests press. Set its properties by name: `ui doc set shop s_buy label=Buy` (a literal), `price=@price` (bound
to the holder's property, so a view-level value reaches it), `label=loc:shop.buy`, `count=3`, `on=true`. A use's
own style places it (`w`, `margin`, `grow`, anchors); a holder's poses may only `hide`, fade, move, scale or
rotate a placed widget, never restyle its inside: give the widget a property or an enum for that.

**Events the holder hears:** a placed button's key (`collect`); a toggle's `<key>: changed` (with `on`); an inner
widget's event through each holder's key (`coins: plus`); a Repeat copy's with its item key
(`missions: claim (m3)`); a dialog's `dismiss` (`tapOutside=dismiss`). A view document adds no prefix of its own.

## States and poses

A **pose** is a set of field changes on the document's layers. Poses stack in layers, later ones winning:
number blends (Empty → Full), then yes/no and enum values, then the Interaction states (Pressed, Disabled), then
reactions on top. Set a field in one with the flag `ui doc show` prints next to it:

```sh
gameengine ui doc set button b_root scale=0.92 ty=2 --state pressed
gameengine ui doc set button b_root saturation=0 opacity=0.6 --state disabled     # <Widget disabled={…}> drives it
gameengine ui doc set toggle t_knob anchor="1 0.5" offset="-4 0" --pose on=yes
gameengine ui doc set mission mr_claim hide=false scale=1.06 --pose status=claimable
gameengine ui doc set card c_ribbon hide=true --pose sale=no      # hide=no / yes as well as false / true
gameengine ui doc set reward root opacity=0 scale=0.86 --pose enter              # a view's Enter from / Exit to
```

**Transitions** have fixed durations (a view's exit and the scrim keep time with them). The document's default:
`ui doc settings button transition="back 240 1.4"`; a pose's own: `ui doc set button b_root
transition="easeOut 100" --state pressed` (it is the whole pose's, whichever layer you name; `""` returns it to
the default). A reaction has its own `in=` and `back=` instead. Forms: `instant`, `easeOut <ms>`,
`easeInOut <ms>`, `linear <ms>`, `back <ms> [overshoot]`, `elastic <ms> <amplitude> <period>`. Keep presses
around 100–150 ms and poses 200–350 ms.

### Numbers that drive looks

A number gets **drivers**, applied top to bottom, so order matters: Smooth then Steps eases and snaps each
shown value to whole steps (a counter), Steps then Smooth eases between snapped targets. A change keeps a driver
where it is, a new one goes last, and `--index n` puts it at a position:

```sh
gameengine ui doc driver bar progress range min=0 maxFrom=goal     # clamp and give a 0–1 position (max=100, or follow another number)
gameengine ui doc driver chip amount smooth min=300 max=1200       # count up, longer for a bigger change (ms)
gameengine ui doc driver chip amount steps by=1                    # then snap what it shows to whole numbers
gameengine ui doc set bar pb_fill fillAmount=0 --pose progress=empty
gameengine ui doc set bar pb_fill fillAmount=1 bg=#7cf29aff --pose progress=full   # blended by the position
gameengine ui doc set steps root lit=progress                      # toggle children lit up to the number
gameengine ui doc driver chip amount steps --index 0                # move Steps first
gameengine ui doc driver chip amount steps --remove
```

The Range's 0–1 position is what Empty / Full poses blend by and what `lit` lights up to.

### Reactions

A **reaction** is a moment over everything else: it plays in, holds and plays back by itself when a number goes
up or down, or a trigger fires (a chip's Gain, a Denied shake):

```sh
gameengine ui doc reaction chip gain on=amount change=up when=end in="easeOut 90" hold=110 back="elastic 420 1.2 0.3"
gameengine ui doc set chip c_root scale=1.12 --reaction gain
gameengine ui doc reaction chip denied on=denied change=trigger in="easeOut 40" hold=60 back="elastic 480 1 0.3"
gameengine ui doc set chip c_root bg=#c0392bff tx=9 --reaction denied
```

A new reaction starts as the editor's does (the root scaled to 1.1; in easeOut 90, hold 110, back elastic 420;
a number's waits for its Smooth to arrive, `when=end`; `when=now` plays at once). Give only what differs, and
set its look with `--reaction`. The holder fires a trigger by giving it a new value:
`props={{ denied: () => model().deniedCount }}`.

## Lists, groups and toggles

- **Repeat** stamps a widget once per item where it sits: `--property rewards` (a list: one copy per item, each
  item's fields as the copy's properties), `--property steps` (a number: that many), or `--count 3`. `gap=`,
  `grow=true` (copies share the width: tabs), `selected=<choice>` (the copy that is on).
- **List items** come from code (`props={{ rewards: () => model().rewards }}`, each `{ key, … }`; the key is
  what events carry) or a list's `--default '[{"key":"a","label":"A"}]'` for previews.
- **Groups:** `ui doc set tabs root group=one` (exactly one on: tabs), `oneOrNone`, `many`; the holder hears
  `<key>: changed` with `selection`. **Lit up to:** `lit=<number>` turns its toggle children on up to it.
- **Scrolling:** `ui doc set board b_list scroll="vertical items bounce"` (`horizontal`, snap `items` or
  `pages`, `bounce`). A Repeat **alone** in a scroll element whose row widget has a fixed size (`h=` on its root)
  is **virtual**: only the rows in view exist (10k rows are about 160 nodes). Keep long lists virtual.
- **Scroll to:** `ui doc set board b_list scroll.to=focus scroll.align=center "scroll.transition=easeOut 250"`
  binds where the list goes to a text, choice or enum property: `start`, `center`, `end`, or an item key of
  the Repeat inside (a virtual row not built yet too). A new value moves it, gliding on the transition; the
  same value leaves the player's offset; a drag, fling or wheel stops a glide. `scroll.follow=yes` goes back
  to the target each time content is added (a feed that keeps its newest row in view).

## Screens and dialogs

A view document on the view stack brings its own behaviour:

```sh
gameengine ui doc settings no-lives behaviour=dialog dims=yes tapOutside=dismiss
gameengine ui doc settings shop behaviour=screen safe=yes
```

- `screen` covers the views under it (they play Exit and leave the tree until it is popped); `dialog` blocks
  the views below and the stack's one scrim (`ui.scrim` in `project.gameengine.json`) dims behind it (`dims`).
  Never draw a backdrop in the document.
- Its Enter / Exit poses (`--pose enter`, `--pose exit`) are the view's entrance and exit unless `defineView` or
  `views.push` sets one. Use one or the other, never both.
- `safe=yes` (default) keeps the root's content inside the safe area; a direct child of the root set to
  `safeArea=full` reaches the screen edges under the notch (a background, a top bar's colour). A share of
  each inset, per platform if needed (a Unity HUD's 65 % top): `"safe": { "top": 0.65, "bottom": 0.4,
  "android": { "top": 1 } }` in the view.
- A template may fill `t()` values (`"Wave {n}"`, `"{headline}"`): it is formatted in the current language and
  follows a language switch; `ui layout` shows the drawn `text` and its `loc`.

## Placing a document from code

```tsx
// src/views/reward.view.tsx: the view stays thin; ui.gen.ts types props, codeAreas and refs.
export const RewardView = defineView<RewardModel>({
  name: 'Reward',
  description: 'Coins won and Collect. Intents: collect, dismiss.',
  samples: { small: { coins: 120, adReady: true }, big: { coins: 99999, adReady: false } },
  render: (model, { intent }) => (
    <Widget
      doc="reward"
      props={{ coins: () => model().coins, adReady: () => model().adReady }}
      codeAreas={{ particles: <Particles effect="vfx/confetti.vfx.json" /> }}
      refs={(key, node) => key === 'collect' && ui.animate(node, 'fx-pulse-loop')}
      sounds={{ collect: 'audio/ui/collect' }}
      onIntent={(_, e) => intent(e.path.at(-1)!)}
    />
  ),
});
```

- `props` take values or functions (reactive). `codeAreas` fill code areas by key (a placed widget's as
  `<key>.<area>`): what you pass stays yours across reloads. `refs` gets each point and placed widget's node
  by key (`coins.target` nested), again after a hot reload: start motion there.
- **Over the world:** `follow={{ entity, pivot: [0.5, 1], offset: [0, -12] }}` (or `{ point: [x, y, z] }`) pins the
  widget's root over an entity or point each frame (a damage number, a health bar), hidden while it is behind the
  camera. Hold it in a layer that covers the view; every following widget together costs one
  `camera.uiPoints` call a frame.
- On the `<Widget>`: `disabled` drives a button's Disabled state, `haptic` / `sound` set a button document's own
  feedback, `sounds` a placed button's by key, `id` prefixes every element id and event (`pause.resume`).
- **Event keys and ids:** a view document placed without `id` sends its placed widgets' keys as they are, and
  they are the element ids (`ui.press('collect')`). A *widget* document placed without `id` (`<Widget
  doc="button">`) is keyed by a slug of its first text property's value, else the document name: give it an
  `id`, or read the pressed key as `e.path.at(-1)`.
- `refs` runs while the widget builds, after the effects the view created first: start an entrance that depends
  on the state at open from `refs`, and react to later changes from an effect.
- A view whose render is one view document is pushed like any view (`views.push(RewardView, model)`); controllers
  and models are unchanged by documents.
- Export the view from `src/main.ts` (or a file it imports): `view list` and `view render` find views in the bundle.
- Screen fit stays in TSX/CSS: place widget documents inside the view's anchors (`.a-top`, `.a-bot`) with a class
  that positions them; documents read no `@media` or CSS variables (skill `screen-fit`).

## Samples, renders and tests

- Give every state a document can show a sample: `ui doc sample mission claimable status=claimable progress=20
  goal=20` (`--remove` drops one); `state=pressed` or `state=disabled` samples a button's Interaction state
  (`$state`). `view render doc:<name> --sample <s> --devices` renders it alone;
  `--times 0,0.1,0.2,0.4` makes a contact sheet of a transition. Look at the PNG.
- `view render` draws the document alone: the stack's dim behind a dialog is not in the picture. A widget
  document sits on a neutral stage; `--background #rrggbb` (the reference's colour) or `--background transparent`
  (a PNG with alpha) draws it on that instead, so it diffs against a capture of the original. `view render` and
  `view lint` build the view at the size they render, so `%`, `clamp()` and `aspect` resolve as on that device.
- `gameengine ui layout <id>` takes a document node id (`xp_bar`) as well as an element id, and lists hidden
  nodes with empty boxes (a state's unused duplicate) only with `--all`.
- Game tests press documents like TSX: `ui.press('collect')`, `ui.rect('coins.target')`, and read the events your
  view turned into intents.

## Cost on phones

- Opening a view is mostly script, about 0.3 ms per placed widget on a phone-low device: a screen of 40 widgets
  is about 12 ms, so prefer a few widgets with properties over many tiny ones, and keep long lists virtual.
- A pose change restyles only the nodes it touches; an idle document costs nothing per frame. Transitions and
  reactions play natively; a Smooth driver runs a little script each frame only while its number moves. Do not
  change a property every frame from code: set the target and let Smooth ease it.

## What stays TSX

`<Text rich>`, `<Particles>`, `<Model>`, `<Skeleton>`, `<Flipbook>` and `<Pooled>` go in a **code area**.
Screen anchors and `@media` beyond aspect (width, orientation), `align-self`, and a per-button
haptic stronger than the project's `ui.button` default stay in the view's TSX/CSS. A view that is mostly code
areas (a 3D portrait, a particle showcase) can stay a TSX view (skill `ui-mvc-views`).

## Traps

- Not refused is not right: render it and look. Read the warnings too: an unused property, or an `image` swapped
  in a pose (it jumps instead of animating; prefer a second element faded with `opacity`).
- `ui doc delete` (refused while something places it) and `ui doc rename` (every reference follows; TSX naming
  the old name is listed for you to fix), never `rm` or `mv`.
- Run `gameengine gen` after document edits and before typechecking the view: a stale `ui.gen.ts` fails `tsc` on
  a property that exists.
- Names: documents kebab-case, properties and reactions camelCase, enum values and points kebab-case.
- `image` keys have no extension (`ui/panel`); a missing border belongs in the texture's `.gmeta`.
- A toggle's value names (`valueNames`, sent as `value` with `changed`) are set in the editor's Widget panel;
  `ui doc` has no command for them yet.
