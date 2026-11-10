# The editor's Animation 2D mode (for guiding an artist)

The same work as the `anim2d` ops, by hand. Spine users find Spine's interaction model, terms and
default hotkeys (rebindable with the editor's `keymap` setting; every action is also in the command
palette). Each step names the op an agent would run instead (`ops.md`).

## Open it

- Pick **Animation 2D** in the editor's Mode picker, then a `*.skeleton2d.json` in the mode's file
  picker (top bar). **Setup | Animate** in the top bar (or the label in the viewport's top-right corner)
  switches the mode; each mode remembers its own layout. In Animate the viewport frame takes the
  accent colour.
- Panels: **Viewport** (centre), **Tree** with the selection's properties under a splitter (right),
  **Timeline** (bottom, Animate: Dopesheet and Graph tabs). Secondary tabs behind a region's `‹`:
  **Animations**, **Skins**, **Weights**, **Problems**, **Metrics**, **States** (right), **Preview**
  and **Audio** (bottom, Animate).
- Start a rig: the **+** right of the skeleton picker (top bar, both modes, with or without a rig
  open) has **New skeleton…**, **Import PSD…** and **Import Spine…**; the Tree shows the same three
  buttons when no skeleton is open. New skeleton asks for a name (Enter creates), a folder (default
  `assets/rig/`) and an images folder (default `<folder>/<name>/`), runs `gameengine anim2d new`, then
  opens the rig in Setup with `root` selected. The imports also run from the palette or by dropping
  the `.psd` / Spine file on the Project panel; their dialogs preview what each layer becomes, then
  run `gameengine import psd` / `import spine`.
- Add to the open rig: the Tree's **+** (Setup) adds a bone, slot, skin, event or animation.

## Tools and hotkeys (viewport)

| Key | Tool / action |
|---|---|
| B | Pose (move at the origin, aim elsewhere; with a parent → child chain selected, drag the last bone: IK across the chain — `anim2d pose-chain`) |
| C / V / X / Z | Rotate (Shift: 15°) / Translate / Scale (Shift: uniform) / Shear |
| N | Create (Setup): drag out a child of the selected bone |
| G | Weights tool (Setup) |
| right click (no drag) | back to the last tool |
| Arrows (Shift ×10) | nudge the selection with the current tool |
| Space, Esc | deselect; Ctrl toggles, clicking again cycles through what is under the pointer, drag on empty space box-selects |
| Ctrl+1…0 / 1…0 | store / recall a selection; PageUp/PageDown step through earlier selections |
| F2 | rename (every reference follows) |
| H / Ctrl+H | hide (editor only) / show all |
| P | set parent (pick the new parent) |
| Delete | delete the selection |
| + / − (Shift: ×5) | move the slot in the draw order (Animate: keys the draw order) |
| Ctrl+F / Ctrl+Shift+F | zoom 100 % / fit the skeleton |
| Ctrl+E / Ctrl+Shift+E | Export GIF, PNG sequence or WebM / export again |

There is no Select tool: every tool selects on click. The **transform card** at the bottom shows
Rotate / Translate / Scale / Shear as value fields (Spine's math: `+10`, `*2`, `-=5`; drag a label
to scrub) with **Local / Parent / World** axes, **Bones** and **Images** compensation and, in
Animate, key buttons (grey: no key, orange: changed, green: keyed) and **Auto Key**. View options
(the tool card): which bones / images / meshes are selectable, visible, named; rulers; background;
ghosting (onion skin) in Animate.

## Set up a rig (Setup)

1. **Bones:** Create (N) drags out children; drag a bone onto another in the Tree to reparent
   (keeps its world pose); the tip of a selected bone changes its length. *(Agents: setup-pose bones
   come from PSD/Spine import or the editor; `anim2d` has no bone-creation op.)*
2. **Images → slots and attachments:** drag a PNG from the Tree's **Images** node (the skeleton's
   `images` folder) onto a bone (new slot and region), onto a slot (another attachment) or into
   the viewport. *(`anim2d attach-image`.)* To swap the art of an existing region or mesh, pick another
   image in the attachment's **Image** field (Spine's Path): its keys and placement stay; a region takes
   the new image's size.
3. **Meshes:** an attachment's **Convert to mesh** / **Edit mesh**: Modify, Create, Delete, New hull,
   Generate (interior vertices), **Trace** (hull from the image alpha, live preview), Reset, Freeze,
   UV view. *(`anim2d mesh-from-image`.)*
4. **Weights:** the **Weights** tab and tool (G): Bind the mesh to bones, **Auto** weights, brushes
   (Add / Remove / Replace), Smooth, **Prune** (keep ≤ 4 influences — the engine's cap), Swap,
   Weld, locks, a heat map; vertices over 4 influences are flagged. *(`anim2d bind`,
   `auto-weights|prune-weights|smooth-weights`.)*
5. **Constraints:** select the bones (one, or a parent and its child, for IK; several for
   transform, path, physics) and choose **New IK / Transform / Path / Physics constraint** (the
   Constraints node's `+` or the palette); then click the target bone, or empty space for a new
   target (path: a slot holding a path, or empty space for a new path). **New slider** is in an
   animation's properties. The Constraints node lists the **solve order**; drag to reorder.
   *(`anim2d constraint-add|set|order|remove`.)*
6. **Skins:** the **Skins** tab: New, Duplicate, pins to preview combinations, skin bones and
   constraints by drag; skin placeholders from a slot. *(`anim2d skin-add-placeholder`,
   `skin-bones`, `skin-constraints`.)*
7. Other attachments: bounding box, point, clipping (with its end slot) and path, from New on a
   slot.

## Animate (Animate)

1. Pick or create the animation in **Animations**.
2. Pose with the tools. With **Auto Key** on every change writes a key; off, changes are pending
   (orange) until **K** (key every pending change), **L** (key the current tool's channels of the
   selection), **Ctrl+L** (all transforms of the selection) or **Ctrl+Shift+L** (every shown bone).
   Dragging a mesh's vertices keys a deform. *(`anim2d pose-bone`, `key add`.)*
3. **Playback:** D play / pause, A play backward, Q first frame, E last key, W / S next / previous
   key, R / F next / previous frame (Shift: 10), Ctrl+R loop.
4. **Dopesheet:** box select, drag to move (snaps to frames), Ctrl+Shift-drag duplicates, Alt-drag
   ripples, Offset, scale by the box edges, copy / paste onto other bones, Clean up.
   *(`anim2d keys move|duplicate|ripple|offset|scale|delete`, `cleanup`.)*
5. **Graph:** value curves and bezier handles; presets Automatic, Flat, Linear, Stepped, Ease In /
   Out, Bounce. *(`anim2d curve`.)*
6. Events, draw order, attachment and colour keys from the properties and the key buttons;
   **Preview** mixes up to 8 tracks with the mix table; **Audio** shows event sounds.
   *(`anim2d event-key`, `draw-order`, `mix`.)*

## Check (both modes)

- **Problems:** the engine's refusal and warnings, the animation lint, weights over 4, missing and
  unused images, empty slots, skin scoping, constraints that cannot solve, and what the rig costs
  on a phone (expensive features, over the budget rig); click to select, **Fix** where safe.
  *(`anim2d problems [--fix] [--device]`.)*
- **Metrics:** bones, constraints, slots, attachments, vertices, triangles, drawn area, clipping;
  in Animate the animation's timelines, keys, curves and deform vertices ("selected / all" with a
  selection); the budget for a device class; **Cost per instance (estimate)**: µs per frame and
  × the class's budget rig, draw calls per instance, bytes uploaded, and the costliest non-cheap
  features (hover for why and what to use instead). *(`anim2d metrics --device`;
  `performance.md`.)*
- **States:** runs an Animator controller on the rig with its parameters as controls.
- **View in engine** (tool card): the same pose rendered by the engine beside the viewport.
- **Export** (Ctrl+E): GIF, PNG sequence or WebM through the engine. *(`skel2d preview --format`.)*
