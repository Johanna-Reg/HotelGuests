---
name: spine-import
version: 1.8.1
tier: optional
description: Spine and PSD import and export — `gameengine import spine` (JSON and .skel, Spine 3.0 and 3.4 to 4.3), `import psd` for tagged Photoshop files, `export spine`, atlases, import warnings, rig cost on phones. Use when an animator hands over Spine files or a PSD, when re-importing, or when a rig must go back to Spine.
---

# Spine import

**Covers:** Bringing Spine animations into Game Engine and back — JSON (3.0, 3.4–3.8, 4.0–4.3) or binary .skel (3.0, 3.4–3.8, 4.0–4.2) exports with loose images, `gameengine import spine` to *.skeleton2d.json, Spine 3 curves and rotations converted, rig budgets per device class, which Spine features cost most on phones (anim2d metrics), --strip-unused, --atlas to unpack a Spine atlas (--keep-pma), the report of bone weights over 4; clipping, sequences, linked meshes, two-colour tint, path, physics and slider constraints, 4.3 transform mappings and IK scaleY import and play; `gameengine import psd` turns a tagged Photoshop PSD/PSB into a skeleton and PNGs (Spine's layer tags, guides) and reimports it; `gameengine export spine` writes a rig back to Spine 4.2/4.3 JSON. Use when an animator hands over Spine files or a tagged PSD, when porting Spine data from a Unity project (often 3.x), when re-importing after a Spine change, when an import prints warnings, or when a rig must go back to Spine.

The engine plays 2D skeletons from its own format, `*.skeleton2d.json` (spec:
`docs/skeleton2d-format.md` in the engine repo). Spine files are **converted once** by the
optional importer; the game never reads Spine data at runtime. Spine 3.0, 3.4–3.8 and 4.0–4.3
JSON exports and 3.0 and 3.4–4.2 binary exports are supported; 3.1–3.3 exports are refused
(re-export from Spine 3.4 or newer), and so are 4.3 binaries (export JSON).

## Export from Spine

1. Spine → Export → **JSON** (binary works too for 3.0 and 3.4–4.2, e.g. the `.skel.bytes` a
   Unity project already has). "Nonessential data" is optional.
2. **Images: not packed.** Tick "Pack" off (or export the images folder separately): the engine
   packs its own atlases from loose images (skill `atlasing`). Put the images under
   `assets/<name>/`, keeping Spine's attachment paths (`goblin/left-arm.png`).
3. Already have a packed export (`hero.atlas` + `hero.png`)? Use `--atlas` below; it cuts every
   region back into a loose PNG. Prefer an atlas at scale 1 (the importer warns otherwise). A
   premultiplied-alpha (PMA, `pma: true`) atlas is un-premultiplied with a warning (soft, dark
   edges); add `--keep-pma` to keep it premultiplied: the skeleton gets
   `"premultipliedAlpha": true` and is drawn with Spine's PMA blending.

## Import

```sh
gameengine import spine art/hero-pro.json --out assets/chars/hero.skeleton2d.json --images chars/hero/
gameengine import spine art/hero-pro.json --atlas art/hero.atlas     # also unpack the atlas
gameengine import spine art/hero.skel.bytes --atlas art/hero.atlas --keep-pma   # binary, PMA kept
gameengine import spine art/hero-pro.json --json                     # machine-readable report
```

In the editor, **Animation 2D → Tree → New → Import Spine…** (or the palette's "Import Spine…",
or dropping the `.json`/`.skel` with its `.atlas` on the Project panel) runs the same command
with these options and shows the report, then opens the skeleton.

- JSON or binary is decided by the file's content. Defaults: name from the file
  (`hero-pro.json`, `hero.skel.bytes` → `hero`), output `assets/<name>.skeleton2d.json`
  inside a project, image prefix `<name>/` (so attachment `head` is `assets/hero/head.png`).
- Re-import after every Spine change; treat the `.skeleton2d.json` as generated from the
  `.spine` project (edit in Spine, not by hand), unless the team moves the rig to the engine.
- Exit 2 with a message for 3.1–3.3 or non-Spine files.

## Spine 3.x exports (older games)

Import 3.0 and 3.4–3.8 exports as they are (`.json`, `.skel`, `.skel.bytes`); no re-export
needed, except for a 3.0 JSON with a transform constraint, which is refused. 3.1–3.3 exports are
refused: open the project in Spine 3.4 or newer and export again. The importer converts what
changed in Spine 4 instead of copying it:

- **Curves.** Spine 3 stores a key's bezier handles normalised to the segment (0..1); Spine 4
  stores them in seconds and values. Copied verbatim, every eased key pulls towards time 0 and
  value 0 and the rig "breathes". The importer denormalises them, and **warns** ("curves with time
  handles outside their key segment") when a file read as Spine 4 carries handles outside their
  segment: that is 3.x data under a 4.x version (or a hand-edited file). Re-export it, or fix
  `skeleton.spine` to the version that wrote it.
- **Rotations** turn the short way round between keys, as Spine 3 did.
- **3.0 and 3.4** bones with `inheritRotation`/`inheritScale` off get the nearest 3.5+ transform
  mode, with a warning: those bones land within a few pixels of Spine 3.0/3.4, not exactly.
  Re-export from 3.5+ for an exact match.
- **3.0** flipX/flipY bone keys and setup-pose bone flips are dropped with a warning: they have
  no 4.x form.

## Rig budgets and `--strip-unused`

Every import prints the rig's size (bones, slots, vertices when every slot shows its largest
attachment, attachments, images) and **warns when it is over the budget of a device class**
(`--device phone-low|phone|tablet|desktop`, default `phone`):

| Class | Bones | Slots | Vertices |
|---|---|---|---|
| phone-low | 64 | 48 | 1500 |
| phone | 100 | 80 | 3000 |
| tablet | 160 | 128 | 6000 |
| desktop | 256 | 256 | 20000 |

A rig made for another platform (hundreds of bones and animations) is caught here, not in the
frame time. Keep only what the game plays:

```sh
gameengine import spine art/rocket.skel.bytes --atlas art/rocket.atlas --strip-unused idle,launch,land --device phone-low
```

`--strip-unused` keeps the named animations and the attachments the setup pose or those
animations show (by name, in every skin), and drops the other animations and attachments; images
nothing draws any more are not unpacked from `--atlas` (without `--atlas` the report lists them to
delete). Bones, slots, bounding boxes and points stay: game code finds them by name. Bones and
slots over budget need fixing in Spine (or a split rig).

Size is half the story: **which features** a rig uses decides what it costs per frame. After the
import, run

```sh
gameengine anim2d metrics assets/chars/hero.skeleton2d.json --device phone-low   # estimate per instance, costliest features, what instead
gameengine anim2d problems assets/chars/hero.skeleton2d.json --device phone-low  # the same as warnings, with the import's other problems
```

The Spine features that cost most, measured on the engine (skill `animation-2d-agent`,
`references/performance.md`): **physics constraints** (every bone of a 100-bone rig at 60 Hz: ×21
the pose cost; one per chain root: ×4), **clipping** (CPU skinning and clipping, two draw calls per
instance when only some slots are clipped), **deform keys** (×2.6–4, and 32 bytes per vertex
uploaded every frame — Spine rigs often use them where weights would do), **transform** (×5) and
**path** (×4) constraints, and blend modes or two-colour tint alternating in draw order (a draw
call per change). Weighted meshes, premultiplied alpha, two-colour tint on every slot, skins and
sliders are cheap.

## What converts and plays

Clipping attachments (with 4.3 `convex`/`inverse`), image sequences (4.1+: every frame image —
`path` + zero-padded number — must exist as a sprite; `gameengine validate` names a missing frame),
sequence keys, linked meshes (kept as links: they share the source mesh and inherit its deform
and sequence keys, 4.3 cross-slot too) and two-colour tint (`dark`, `rgba2`/`rgb2`) import
without warnings and draw on every device tier. Clipping runs on the CPU: keep clip polygons
small (few edges, convex) and the clipped slots few and contiguous in draw order (clipping breaks
the draw into the CPU path and back: two extra draws per instance).

## Warnings: what is kept but not played

Every warning but the weight report names Spine data the engine does not evaluate. The data is
kept under `unsupported` in the file (nothing is dropped):

| Warning | Effect in the game | What to do |
|---|---|---|
| drawOrderFolder timelines (4.3) | those draw-order keys do not play | key the draw order on the animation instead |
| vertices weighted to more than 4 bones | the engine keeps each vertex's 4 largest weights, renormalised | if the report's largest dropped weight is above ~0.1, prune weights in Spine and re-export |

Path, physics and slider constraints, 4.3 transform constraints (any property mapping) and IK
`scaleY` modes import with their timelines and play (4.0–4.3 JSON, 4.0–4.2 binary). Physics is
presentation: the game's sim and its bone queries (`skeleton2DBone`) see the bones before
physics, the drawn skeleton swings (see the `skeleton-2d` skill). A 4.2 file's physics plays
with 4.3's maths (the importer writes 4.2's defaults out), which moves a little differently from
Spine 4.2's preview.

The weight report lists every affected attachment (`skin/slot/attachment`, influences dropped,
vertices affected, largest dropped weight); `--json` has it as `droppedWeights`.

Warnings about anything else are importer bugs: report them with the Spine file.

## Photoshop (PSD) import

Artists who lay a character out in Photoshop can skip Spine's own PSD step: `gameengine import
psd` reads the `.psd`/`.psb` and applies **Spine's layer tags** (same names and meaning as Spine's
Import PSD), writing a PNG per layer under `assets/<images>` and a `*.skeleton2d.json`.

```sh
gameengine import psd art/kid.psd                          # new skeleton assets/kid.skeleton2d.json, images under assets/kid/
gameengine import psd art/kid.psd --dry-run --json         # what every layer becomes; writes nothing
gameengine import psd art/kid.psd --scale 0.5 --padding 2 --no-trim --exclude-hidden
gameengine import psd art/kid.psd --skeleton assets/kid.skeleton2d.json --prune   # reimport
```

In the editor: **Animation 2D → Tree → New → Import PSD…** (or the palette, or drop the `.psd`
on the Project panel). The dialog previews each layer with its tags and outcome before importing.

| Tag | Effect |
|---|---|
| `[bone]` / `[bone:name]` | the group (or layer) gets a bone at the centre of its first visible layer; an existing bone keeps its position |
| `[slot]` / `[slot:name]` | the group's layers share one slot (it shows the first visible one) |
| `[skin]` / `[skin:name]` | the group's layers are skin placeholders; images go under `<skin>/` |
| `[folder]` / `[folder:a/b]` | prefixes attachment names and image paths (`/x` starts over) |
| `[mesh]` / `[mesh:name]` | a mesh whose hull is traced from the layer's alpha (Spine's Trace; a fully opaque rectangle stays its 4 corners), or a linked mesh of the mesh whose path ends with `name` |
| `[merge]` | the group becomes one image (normal, multiply, screen, linear dodge composited) |
| `[overlay]` | drawn into every layer below it, inside their pixels; no image of its own |
| `[origin]` | this layer's centre is the skeleton's 0,0 (else the first guides, else the canvas centre) |
| `[trim]`, `[trim:false\|canvas\|mask]` | trim to pixels, keep the canvas size, or cut to the layer mask |
| `[ignore]` | skipped with its children |
| `[path:file]`, `[name:n]` | the image file name, the attachment name |
| `[scale:n]`, `[pad:n]`, `[rotate:90]` | image resolution, padding and quarter turns; the attachment compensates so it looks the same |
| `[bones]`, `[slots]`; `[!bone]`, `[!slot]`, `[!name]`, `[!path]` | tag every immediate child; opt a child out |

A value with `*` on a group is a pattern for its children (`[slot:*-s]`). Layer opacity becomes the
attachment's alpha; Normal/Multiply/Screen/Linear Dodge become the slot's blend.

**Reimport** (`--skeleton`, Spine 4.3's behaviour): images, region placement and new layers
update; bone positions, animations, and mesh vertices and weights stay. `--prune` removes the
attachments (with their keys and PNGs) whose images the PSD no longer makes — only images an
earlier PSD import made, when the skeleton records them (`source.images`).

**Refused or not applied:** 16/32-bit and CMYK/Lab/indexed documents (convert to 8-bit RGB);
layer effects, adjustment and fill layers, vector masks and Photoshop clipping masks are listed as
warnings (rasterise or merge them, or use `[overlay]`); other blend modes draw as Normal. Pixels
past the canvas edges are dropped, as Photoshop's own export drops them: a layer that bleeds off
the canvas becomes the image of its part on the canvas, placed there.

## Check the result

- `gameengine skel2d pose <file> --anim <a> --time <t> --json` prints bone world transforms,
  slot attachments and draw order for any pose (compare with Spine's preview).
- Curves, IK, transform, path and slider constraints, skins, events, deform and draw order keys
  import exactly; physics matches Spine 4.3's own loop within a thousandth of a pixel;
  the engine's importer is tested against the official Spine runtime on Spine's own examples.

## Back to Spine

`gameengine export spine assets/chars/hero.skeleton2d.json --out art/spine --version 4.2`
(or `4.3`; MCP `spine_export`) writes `art/spine/<name>.json`, Spine JSON with the loose images'
folder relative to it: in Spine, **Import Data** on that file. Everything the engine plays goes
back (constraints, skins, every attachment and timeline, curves exactly); what the chosen version
cannot hold is printed as a warning, never dropped silently (4.2: sliders, clipping
convex/inverse, IK `volume` and physics scaleY modes; cross-slot linked meshes become copies).
Engine-only data (`mixes`, `premultipliedAlpha`) has no place in Spine JSON and is reported.
Re-importing an export of the version the rig came from gives the same `*.skeleton2d.json` byte
for byte. Using exported data with Spine's own runtimes is subject to Spine's licence.
