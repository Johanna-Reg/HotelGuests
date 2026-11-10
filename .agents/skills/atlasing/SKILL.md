---
name: atlasing
version: 1.18.0
tier: optional
description: Sprite atlases and 2D draw calls — atlas groups in .gmeta, trimming, page sizes, UI art in atlases, keyed-out backgrounds, nearest filtering and r8 textures, `gameengine profile batches|atlas`. Use when draw calls are over budget, when adding sprites or UI art, or before a mobile build.
---

# Atlasing

**Covers:** Cutting 2D draw calls with sprite atlases in Game Engine — atlas = "auto" or named groups in .gmeta, trimming, page sizes per platform, UI images in atlases, keying out a background colour (key = "#ffffff"), the art warnings of gameengine validate (art cut out on a background, frame lines), and the reports that say why draws broke and which images are far larger than drawn (gameengine profile batches, profile atlas). Use when draw calls are over budget, when adding sprites or UI art, or before a mobile build.

Consecutive 2D draws merge into one draw call while they share a texture page, blend mode,
mask interaction and kind (sprite, shape, text). Atlases put sprites on shared pages. World
sprites, tilemap tilesets, sprite masks and UI images, icons and 9-slices all draw the same way,
so all of them can be atlased.

## Put sprites in atlases

In the sprite's `.gmeta` (`[settings]`):

| Setting | Effect |
|---|---|
| `atlas = "auto"` | Grouped with the sprites it is used together with (default choice) |
| `atlas = "hud"` | Named group: always packed with the other `"hud"` sprites (wins over auto) |
| `atlas = "none"` | Never atlased |
| `trim = false` | Keep transparent borders (trimming is on by default) |
| `filter = "nearest"` | Sampled nearest-neighbour: pixel art and crisp UI stay sharp when magnified, no upscaled source art needed (default `"linear"`). Sprites, tiles, UI images and 9-slices only: mesh and material textures ignore it |
| `format = "r8"` | One linear 8-bit channel, uncompressed: a greyscale image's grey (else its red), a quarter of RGBA8 — masks, height or noise maps, lookup tables (default `"rgba8"`) |

Or turn auto on for every sprite without an `atlas` setting, in `project.gameengine.json`:

```json
"atlas": { "auto": true, "maxPageSize": { "desktop": 4096, "mobile": 2048 }, "pot": false }
```

- **Auto grouping** reads scenes, prefabs, `ui/*.style.css`, views and scripts for sprite names
  (`"tiles/gem_red"`, and prefixes such as `` `tiles/gem_${kind}` `` or `'tiles/gem_' + kind`).
  Sprites used by the same scenes share pages; art used by one rare screen gets its own page
  instead of bloating the pages every level loads. Name sprites with literal strings or prefixes
  the scan can see; a name built another way lands in the `auto-unused` group.
- **Kept out automatically:** textures sampled by materials, effects or glTF files, `normalMap`
  textures (these need their own texture: give them `kind = "texture"`), sprites over half a page,
  sprites whose `srgb`/`compression` differ from the rest.

A page is cooked with its group's first sprite's (by path) texture settings, so give every sprite
of a group the same `compression`: `compression = "astc6x6"` makes a group's pages ASTC 6×6 on
iOS, Android and web (44% of ASTC 4×4's bytes, slightly softer; desktop stays BC7) — good for big
backgrounds and UI art, check small text and sharp edges in a device screenshot first. Those
pages pack on the 6×6 block grid, so they cannot be power-of-two: with `atlas.pot` on, the cook
refuses an `astc6x6` group.
Per-platform entries (`[settings.platform.ios] compression = "none"`, or the project's
`textures.platform` default; ADR 0108) count too: automatic groups only join sprites that cook
alike on every platform, and `gameengine validate` warns `W_ATLAS_SETTINGS` when a named group's
sprites disagree on one.

**Filter and format split pages.** A page has one sampler and one texel format, so nearest and
`r8` textures never share a page with linear RGBA ones: a named group `hud` becomes `hud`,
`hud@nearest` and `hud@r8` (each its own pages and draws, in cooked and loose runs alike; `validate`
warns `W_ATLAS_SETTINGS` when a group mixes them), and automatic groups keep them apart. Give a
whole group the same `filter`. An `r8` texture ignores `srgb` and `compression` (always linear,
uncompressed); the sprite shader samples it as `(r, 0, 0, 1)`, so a plain sprite shows it red:
read `.r` in your own sprite material to use the value. `gameengine texture inspect <key>` shows
both settings.

Loose (dev) runs pack a **named** group onto pages of its own once all its sprites have loaded,
the same way every run, so draw counts in dev and T1 match cooked devices; `"auto"` groups exist
only in cooked content (dev shares runtime pages for them).
- **Trimming** cuts transparent borders; the sprite keeps its size, anchor and pivot. Nothing to do
  in code.
- Pages are at most 4096 on desktop and 2048 on phones; `pot: true` makes page sides powers of two.
- Each sprite sits in a cell of whole 4×4 compression blocks with its edge extruded around it, so
  BC7/ASTC/ETC2 never blend two sprites at a shared edge. Nothing to pad by hand.

## 9-slice sprites, trimming and max_size

A 9-slice sprite keeps its borders in its own `.gmeta`, in source texels, next to the atlas settings, with
its body (the box; art outside it is overhang) and content padding (inside the body) beside them:

```toml
[settings]
atlas = "auto"
border = { top = 12, right = 18, bottom = 8, left = 6 }   # named sides only
body = { bottom = 4 }                                     # a 4-texel shadow below the box
content = { top = 6, right = 14, bottom = 6, left = 14 }  # default padding, inside the body
max_size = 256
```

- Views use `slice="auto"` (CSS `background-slice: auto`); only `auto` takes the gmeta border. Zero borders
  (`slice={0}`, `{}`, a world `Sprite` in mode Sliced with `slice` all 0) mean no slicing.
- A world `Sprite` in mode Sliced keeps its caps when you change `Sprite.size`; a Transform scale stretches
  the caps too, as in Unity, so animate a stretching bar or frame through `size`, never `scale`.
- `body` and `content` apply to UI elements showing the texture 9-sliced (skill `ui-mvc-views`).
- **`max_size`** halves the cooked texels, not the borders: every border value (gmeta, CSS, props) is in the
  source image's texels, and the cook records the source size in the manifest (`spriteMeta`), so lowering
  `max_size` for memory never moves a slice.
- **`max_size` never changes how big art draws:** a sprite or UI image without an explicit size draws
  at its source size, cooked or loose. Loose runs and the editor apply `max_size` as the cook does, so
  what you see while authoring is the texel count a device gets.
- **Trimming** is safe for 9-slices: the transparent margin is cut, and cells that fall wholly in it are
  skipped at draw time. Borders that meet (no centre texels: a pill or a circle cut in half) are fine: the
  stretched centre repeats the texel next to it instead of filtering across the seam. Set `trim = false` only for art whose transparent margin must still take space in layout.
- **Per device:** atlas sprites take no per-device `max_size` (`[settings.overrides.<key>]`,
  `W_OVERRIDE_FIELD`): an atlas page serves every device. Size atlas art for `phone-low` (one
  `max_size` for everyone); textures outside atlases (backgrounds, 3D, particles) can shrink per
  device (skill `device-tiers`).
- Keep one copy of a sprite however large it is drawn: scale borders with `sliceScale` (skill `ui-mvc-views`)
  instead of resampling the art.

## Scrolling textures, masks per group and ribbons

- **Scroll a texture instead of baking frames.** `Sprite.uvOffset` moves the image inside the
  quad and `uvScale` repeats it; a Simple sprite with either set wraps, and a Tiled sprite scales
  and offsets its tiles. Animate the offset in a `LateUpdate` system (a conveyor, water, a body
  sliding into a hole) and keep one image instead of a frame per step. The wrap samples the
  atlas cell's extruded border, as tiling does, so a scrolling sprite stays in its atlas.
  Sliced and Filled modes ignore both.
- **Tiled sprites:** a tile is the image's size at `render.pixelsPerUnit` unless `tileSize` sets it in local units per axis, and tiles start
  at the quad's left and bottom edges (move the start with the anchor, or scroll with
  `uvOffset`). Set `tileSize` whenever the tile length matters to gameplay or art.
- **Filled sprites** fill from `fillOrigin` (Horizontal: `Left` or `Right`; Vertical: `Bottom` or
  `Top`; Radial360: any side, turning `fillClockwise`); `Auto` is left, bottom and bottom. The
  fill edge is hard: for a soft reveal use a mask or a scrolling `uvOffset` on art with the fade
  in it.
- **Two masks that must not clip each other** get their own group: `SpriteMask.group` (1–8) and
  the same number as `maskGroup` on the `Sprite`, `SpriteRibbon` or `ParticleSystem` that it
  clips. Group 1 is the default, so existing masks are unchanged, and `Skeleton2D` and soft
  (`softAlpha`) masks are always group 1 — a masked skeleton needs a group 1 mask over it, or it
  tests a bit nothing wrote and disappears. Each group in use costs a pipeline and breaks batches
  like the mask interaction does, so use one group per purpose, not one per entity.
- **A rope, tentacle, trail or path** is one `SpriteRibbon`, not a sprite per segment: up to 64
  points (`points` as x, y pairs with `pointCount`), `smooth` for a curve through them, `width`
  blending to `endWidth`, the image's x laid along the strip, its first and last `caps` texels
  kept once at the ends and the rest tiled every `tileLength` units, scrolled by `uvOffset` in
  repeats. It sorts, masks and batches like a sprite (with other CPU-vertex draws on its page)
  and costs its quads on the CPU, so give a long ribbon a `tileLength` that keeps the repeats to
  tens, not hundreds. Set the points from a `LateUpdate` system; the sim keeps the path's state.

## Art on a background, frame lines, oversized images

`gameengine validate` checks every sprite PNG (code `W_ART`):

- **"the border is opaque and one colour … probably art cut out on a background"**: the sprite was
  exported on a white (or other flat) background, so it draws as a box. Re-export it with
  transparency, or key the colour out at import:

  ```toml
  [settings]
  key = "#ffffff"        # this colour becomes transparent when the image is loaded or cooked
  key_tolerance = 8      # 0–255 per channel (default 8: JPEG noise on a flat background)
  ```

  Keyed texels next to the art take the art's colour, so filtering adds no light halo; trimming then
  cuts the keyed border like any transparent one. Loose runs key the PNG the same way.
- **"opaque one-colour line along the edge: top row …"**: a frame line the exporter left in; it shows
  as a hairline around the sprite. Crop it off or make it transparent.
- A flat fill (a white tint square) is never flagged. Silence a false positive with `art_check = false`.

`gameengine profile batches` also lists **sprite images far larger than drawn**: at least 2× the
largest size they were drawn at in the captured frame, on both axes, with the `max_size` that
keeps them at or above that size. Capture at the device's resolution
(`profile batches --width 1080 --height 1920`): drawn sizes scale with it. The last capture's list
is kept in `.gameengine/drawn-sizes.json`, and `profile atlas` and `memory report` repeat it next
to their cook-time numbers. Lower `max_size` in the `.gmeta` (9-slice borders stay in source
texels, see above) and cook again.

## See what breaks batches

```sh
gameengine cook --platform android       # writes .gameengine/cooked/android/atlas-report.json
gameengine profile atlas --platform android
gameengine run --headless --scene scenes/level_01.scene.json
gameengine step 60
gameengine profile batches               # every 2D batch and why it broke from the one before
```

`profile batches` reasons: `texture` (another page, or a sprite that is not atlased), `clip` (UI `overflow: hidden`), `kind`
(sprite ↔ shape ↔ text), `glyphPage`, `blend`, `mask`, `material` (another `Sprite.material`, or
one next to none; a 2D lighting normal map). Sprites sharing a material batch together: keep them next to
each other in sort order, and drop the material on `phone-low` (skill `vfx-materials`).
"same state as batch N" means sort order split two draws that could have merged.

Loose dev runs (`gameengine run`, `gameengine test`) pack every image into shared runtime pages
in load order, so they show sort-order and kind breaks but not the cook's `"auto"` grouping: one
board can spread over several runtime pages in dev and sit on one page on a device, or the other
way round. `profile batches` says so (`texture break(s) involve runtime pages`). Measure draw
counts on cooked content — `gameengine cook --platform android`, then
`gameengine run --headless --cooked .gameengine/cooked/android` and `profile batches` — or on a
probe build on a device (skill `ship-mobile`). Named groups pack the same way loose and cooked.

## Fixes, in order

1. A standalone texture splits a run (`texture 'x' (not atlased)`): give it `atlas = "auto"`.
2. Two atlas pages alternate: put the sprites drawn together in one named group (`atlas = "board"`
   on every piece, background and frame of the board — a named group wins over auto, and it packs
   the same in dev and on devices), or keep each page's sprites on contiguous sorting layers / orders.
   A group too big for one page splits: lower `max_size` on art authored much larger than it is
   drawn (a 2048² backdrop drawn at 540 px needs `max_size = 1024` at most) so the group fits.
3. Text between UI images always breaks (`kind`): group icons and panels so text comes after
   them in the same container rather than interleaved.
4. Different blend modes or masks alternate: order the additive or masked items together.
5. `profile atlas` shows a page with low fill or `could be atlased` entries: act on them before
   a mobile build (fewer pages = less memory and fewer draws).
6. Source art kept only for baking (layered originals, hi-res masters next to the exported
   sprites) must not ship or be atlased: `"exclude": ["assets/source/**"]` on the bundles in
   `project.gameengine.json` (skill `content-database`).

7. Off-screen and invisible items already cost nothing: sprites, tiles, glyphs and shapes
   outside every orthographic camera, and those with alpha 0 or `visible: false`, are left out
   before batching (`not drawn:` line of `profile batches`, `render.stats().culled2d` /
   `transparent2d`), so they never split a run. Hide pooled visuals from `LateUpdate` with
   `Sprite.visible = false` (or `Shape`/`Text2D`), which is not structural, instead of `Hidden`.

Particle textures are atlased too: sprites only effects use go into one `auto-effects` group,
so emitters of different effects can share a draw (skill `vfx`).

## Sorting layers, y-sorting and z-sorting

Draw order is sorting layer (the order of `render.sortingLayers` in `project.gameengine.json`),
then `order`, then — in a layer marked `sortByY` — world y (lower in front), or — in a layer
marked `sortByZ` — world z (higher in front), then spawn order.
Top-down and isometric scenes put characters, props and buildings on one y-sorted layer:

```json
"render": { "sortingLayers": ["Ground", { "name": "Farm", "sortByY": true }, "Foreground"] }
```

Sprites, shapes, text, 2D skeletons and sorted particle effects on that layer sort by their
entity's origin (each item its own entity's, children included), so put the origin where the
object touches the ground: sprite `anchor: [0.5, 0]` with the entity at the feet. When the origin
must stay elsewhere (a tree pivoting at its middle), add `SortPivot: { offset: [0, -2] }`: the
sort point in the entity's local space (it scales and turns with the entity). y-sorting reorders draws every frame things move,
so keep a y-sorted layer's sprites on one atlas page to keep it one batch.

Content ported from Unity, where equal-order sprites draw by distance along the camera's view
axis, keeps that order on a `sortByZ` layer:

```json
"render": { "sortingLayers": ["Ground", { "name": "Map", "sortByZ": true }, "Foreground"] }
```

Sprites, shapes, text, tilemaps (each as one unit), 2D skeletons and sorted particle effects on
it sort by their entity's world z, parents included; `SortPivot` does not change it. The engine's
2D camera looks along -Z, so a higher z is nearer and draws in front: Unity's camera looks along
+Z, so negate Unity's z when porting. Where z interleaves sprites of different atlas pages the
batch splits, as in Unity: keep such a layer on one page too. A layer is `sortByY` or `sortByZ`,
not both (`validate` reports `E_CONFIG`).

Keep `render.expectDrawCalls('<=', n)` in a render test so a regression fails `gameengine test`
(skill `testing`).
