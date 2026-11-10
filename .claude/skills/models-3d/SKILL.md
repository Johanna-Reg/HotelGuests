---
name: models-3d
version: 1.23.0
tier: optional
description: 3D models, rigs and clips — importing FBX and glTF/GLB, .gmeta import settings, prefabs, skinned meshes, outfits, blend shapes, Unity model@clip.fbx animations, meshes built at run time. Use when adding or porting a 3D model, character, rig or animation, or when one looks wrong or does not animate.
---

# 3D models and animation clips

**Covers:** 3D models, rigs and animation clips in Game Engine — importing FBX (straight from Unity or a DCC tool) and glTF/GLB as mesh assets, .gmeta import settings (lods, max_texture_size, material, per-material alpha_mode/alpha_cutoff/double_sided, FBX scale and rig = "generic"), models as prefabs, skinned meshes, outfits on a shared skeleton, body sliders (JointOffset) and blend shapes, Unity's model@clip.fbx animation files played through `file#clip` in *.animctrl.json, meshes built from code at run time (meshes.create: generated terrain, water, trails), and checking imports with gameengine validate. Use when adding or porting any 3D model, character, rig or animation, and when a model looks wrong (size, orientation, missing texture, see-through parts drawing solid, not animating).

Models are mesh assets: drop `.fbx`, `.glb` or `.gltf` under `assets/`, and the engine imports
them (loose files in dev, cooked to `.lmesh` for devices; both go through the same importer, so
what you see in dev is what ships). No conversion step, no Blender round trip.

Every model comes out in the engine's space: **right-handed, Y up, +Z front, metres**. FBX
files are converted from their own axes and units (Maya/Unity centimetres, 3ds Max Z-up,
Blender) on import; glTF already is in that space.

## Import settings (`.gmeta`)

```toml
guid = "…"
importer = "mesh"

[settings]
lods = 2                 # simplified LODs after the full mesh (0–4)
max_texture_size = 2048  # cook-time cap for the model's textures
textures = "none"        # ship no texture copies: the game draws it with its own materials
scale = 1.0              # FBX: multiplies after the unit conversion (Unity's Scale Factor)
rig = "generic"          # FBX: every node is a joint (see "Rigs" below)
material = "materials/toon.material.ts"  # every material of the file draws with this program
uv1 = true               # keep the second UV set (TEXCOORD_1 / FBX's second layer) for uv(1)
vertex_format = "quantized"  # 24-byte vertices on the GPU instead of 52 (default "full")
disk_format = "quantized"    # store them quantized in the file too: about half the download
vertex_colors = true     # FBX: keep the mesh's vertex colours (off by default, see Unity → engine)
merge = "rigid"          # parts each moved by one joint draw as one mesh per material (they stop being nodes)
atlas_materials = true   # with merge: materials differing only in colour texture share one atlas and one draw

[[settings.clips]]       # cut one long take into named clips (Unity's clipAnimations)
name = "Walk"
take = "Take 001"        # optional when the file has one take
start = 0                # seconds, or frames with fps = 30
end = 1.2
```

`[[settings.clips]]` replaces each take it cuts with its pieces (up to 512): a piece plays from 0
and keeps the events inside its range; a name used twice, an `end` before `start`, or a range past
the take is an import error that names the clip.

`material` swaps the shader of a whole model and keeps each of its materials' textures and
values: the `*.material.ts` declares the ones it reads under the built-in names
(`baseColorMap: texture2d()`, `normalMap`, `emissiveMap`, `baseColor`, …) and gets them per
sub-mesh, so a body and its clothes keep their own albedo under one custom shader (Unity: every
renderer's materials on the same custom shader). A `MeshRenderer.material` or `<Model material>`
override still replaces all of them with one material.

The model's file carries a copy of every texture its materials name (in the cooked file, as
KTX2). When that texture is also a project file with its own `.gmeta`, the copy cooks with that
file's `compression`, `quality` and `max_size` (within `max_texture_size`), so `max_size = 512`
and `compression = "astc6x6"` on the PNG shrink the model too. The PNG's per-device `overrides`
do not reach the copy: give the model its own `[settings.overrides.<key>] max_size`. A device can draw
another model altogether: `[settings.overrides.phone-low] use = "models/hero-low.fbx"`. When every draw of the model uses
a material the game sets (`MeshRenderer.material`, `<Model material>`, a `*.mat.json` naming the
project texture), set `textures = "none"`: the copies are never sampled, yet each would be
downloaded, transcoded and uploaded (a 1024² one is about 1.4 MB of GPU memory). The editor and
the cook both drop them, so what you see is what ships.

### See-through parts (eyelashes, hair cards, foliage)

A material draws `opaque`, `mask` (cut out where the colour texture's alpha is under
`alpha_cutoff`, default 0.5; draws in any order) or `blend` (see-through, sorted). glTF says which;
an FBX does not, so the importer decides: an opaque material with an opacity map (Maya's and
3ds Max's `TransparentColor`/`TransparencyFactor` maps included) is `mask`, one less than opaque
is `blend`. A greyscale opacity map in its own file is baked into the colour texture's alpha.
When a part still draws solid (no opacity map in the file, the alpha only in the colour texture),
set it per material, by its name in the file:

```toml
[settings.materials.Lashes]
alpha_mode = "mask"      # opaque | mask | blend
alpha_cutoff = 0.4
double_sided = true      # cards seen from both sides
```

A name the file does not have is an import error that lists the names it has.

The same table gives one sub-material its own shader and values, so texture layers go on the skin
only while eyes and hair keep theirs. `params` sets any parameter or texture of that program by name:

```toml
[settings.materials.Skin]
program = "materials/skin.material.ts"
params = { baseColor = "#e0b0a0", roughness = 0.6, layer1Map = "textures/blush.png" }
```

The editor's **Materials** mode lists a model's sub-materials and edits these with a live preview;
prefer it, or write the table by hand. `gameengine material model models/hero.glb` (MCP
`material_model`) lists the sub-materials with their shader and values, and
`gameengine material preview models/hero.glb --overrides "Skin:roughness=0.4"` renders the model. Per entity, scope an override to one sub-material with its
name: `MaterialOverrides { values: "Skin:layer1Strength=0.8; Hair:hairTint=#6b4429" }` (an entry
without a scope reaches every sub-material).

LODs count lost shading as well as moved positions, so a smooth face keeps its full mesh in a
close-up; `lods = 0` is not needed to avoid creases.

Low-end phones (skill `device-tiers`): `[settings.overrides.phone-low]` then `lod_bias = 1`
picks coarser LODs there (each step accepts a LOD with twice the screen error, −4..4), and a
texture's `.gmeta` `[settings.overrides.phone-low] max_size = 512` uploads a smaller mip from the
same cook; on the model's own `.gmeta`, `max_size` does the same for its embedded images (PBR
models from image-to-3D carry 1–2K maps: `max_size = 256` there). Under load the quality governor adds its own `lodBias` step; the phone-low settings
should fit without it. `min_lod = 1` goes further: the finer LOD is never uploaded there, which
saves about half the model's GPU memory, at the cost of the coarser LOD up close. For the whole
game set `meshMinLod` / `meshLodBias` per class or level in `render.tiers` or `quality.levels`
(skill `device-tiers`); a model's own `overrides` win. A model with `lods = 0` has nothing to bias
or skip: give heavy models LODs.

`vertex_format = "quantized"` halves a static model's vertex memory and bandwidth with no visible
change for props and characters' accessories: positions snap to 1/65535 of the model's largest
side (0.8 mm on a 100 m piece). Leave level geometry hundreds of metres across, or kit pieces
that must meet without a hairline gap, on `"full"`, or quantize only where memory is short:
`[settings.overrides.phone-low] vertex_format = "quantized"` (a tier or memory class, not a
quality level: a level change re-uploads the mesh). Skinned models and models with
blend shapes stay full. The sim (colliders, picking) reads the full-precision mesh.

`disk_format = "quantized"` also stores the model quantized in the cooked file: about half the
download for the model's vertices (playables, big character sets). Unlike `vertex_format` it
moves what the sim reads (positions snap by up to 1/131070 of the largest side; normals,
tangents and UVs snap too), so turning it on
changes that game's hashes once, loose and cooked alike; not per device.

## Use a model

- **Draw the whole file:** `"MeshRenderer": { "mesh": "models/crate.fbx" }`.
- **One mesh of the file:** `models/crate.fbx#Lid` — FBX meshes are named after their node
  (`~1`, `~2` for repeated names), glTF meshes after the mesh.
- **As a prefab:** name the model file where a prefab goes (`spawnPrefab('assets/models/crate.fbx')`,
  drag it from the Project panel into the scene). A static model becomes a root plus one entity
  per node (`Name`, `LocalTransform`, `Parent`, `MeshRenderer file#Mesh`), with GUIDs from the
  node path, so prefab overrides survive re-imports. A **rigged or animated** model stays one
  entity drawing the whole file (its meshes follow the skeleton).
- **Many distinct props that never move** (fences, rocks, plants; Unity's batching static): add
  the `StaticBatch` tag next to each `MeshRenderer` that has a `material`. Marked meshes sharing a
  material, colour, layers and shadow flags in a 32-unit cell draw as one merged mesh, built when
  the scene has loaded. Identical mesh and material pairs already instance, so mark only what
  differs; it costs a merged copy of the vertices, merged meshes draw their finest LOD and cull
  per cell, and a marked entity that moves leaves its cell unbatched until it holds still. Skinned, animated, outlined,
  blend-shaped and `MaterialOverrides` meshes are left out.

## Rigs and skinned meshes

The importer builds one skeleton per file from:

- the bones of every skin (FBX clusters, glTF skins), every FBX `LimbNode`, and every animated
  node, plus their ancestors;
- with `rig = "generic"`: **every node**. Use it for models whose clips animate plain transforms
  instead of bones (Unity "Generic" rigs made of separate parts, e.g. a creature built from separate parts): without
  it such a model has no joints for the clip to move.

A mesh that sits under a joint but has no skin follows that joint rigidly (props parented to a
hand, a part of a mechanical rig). This holds for glTF/GLB as for FBX: a file whose animations move plain
nodes (a gate's wings, a chest's lid, a windmill) needs no skin and no `rig` setting; its animated nodes
become joints and an `Animator` on the entity drawing the whole file plays its clips. A mesh that several
nodes share stays static there: give each moving part its own mesh in the DCC tool. Up to 4 weights per vertex are kept (the strongest).

Rigging a character yourself (Blender, a generated mesh): follow the rigging checklist in skill
`animation-3d-agent` (root and hips, `.L`/`.R` names, sockets, weights), so keyed clips, mirroring
and `BoneAttach` props work on it without trial and error.

## Animation clips

- Clips are resampled at 30 fps at import and compressed. glTF animations and FBX animation
  stacks (takes) become clips named after the animation/take.
- **One take holding several motions:** cut it with `[[settings.clips]]` in the `.gmeta`
  (§ Import settings); `gameengine model info <model>` lists the clips and their frames.
- **Clips made for another skeleton** (a clip pack, a Mixamo character playing another rig's
  clips): give each skeleton a rig profile (`gameengine anim3d rig infer`) and bake the clip onto
  the target with `gameengine anim3d import <src.fbx>#<Clip> --rig <target.rig3d.json> --from-rig
  <source.rig3d.json> --out <clip.anim3d.json>`. Joints pair by alias (`hips`, `upperArm.L`, …),
  rotations carry over relative to each profile's reference pose, and the hips' travel scales
  with hip height; the report lists the aliases paired and those left at the reference pose.
- **Unity's `model@clip.fbx`:** keep the files as they are (`Hero.fbx`, `Hero@Walk.fbx`, …).
  A clip file with one take names its clip after the `@` (`Walk`). Play it on the model by
  naming the file: `"clip": "models/hero/Hero@Walk.fbx#Walk"`. Joints are matched **by
  name**, so any file whose joint names match the model's works (a shared animation library too).
- Animator controllers (`*.animctrl.json`) reference clips by name (`"Idle"`, a clip in the
  entity's own mesh file) or as `file#clip` (another file). Blend trees take either.

```json
{ "name": "Walk", "motion": { "clip": "models/hero/Hero@Walk.fbx#Walk" } }
```

`animClipLength(entity, 'models/hero/Hero@Walk.fbx#Walk')` returns the clip's seconds.

To make or change a motion yourself (a pose, a cheer, a cycle) rather than import one, key it
as a `*.anim3d.json` clip on a rig profile with `gameengine anim3d`: it plays through `file#clip`
the same way (skill `animation-3d-agent`).

In a UI view (a dialogue portrait, a shop character) the same clips play on a `<Model>` without an
entity: `<Model mesh="models/hero/Hero.fbx" animation="models/hero/Hero@Talk.fbx#Talk" queue="models/hero/Hero@Idle.fbx#Idle" />`
on UI time, with `camera.target` to frame the head (skill `ui-mvc-views`).

## Animator controllers: states and transitions

A `*.animctrl.json` has `parameters` (`float`, `int`, `bool`, `trigger`; optional `default`) and
up to 4 `layers`, each with an `entry` state, `states` and `transitions`. A tap that plays a
one-shot and returns (`samples/hero-stage` `assets/anim/hero.animctrl.json`):

```json
{ "name": "Wave", "motion": { "clip": "Wave" }, "loop": false },
...
"transitions": [
  { "from": "Locomotion", "to": "Wave", "conditions": [{ "parameter": "wave", "op": "trigger" }], "duration": 0.25 },
  { "from": "Wave", "to": "Locomotion", "exitTime": 2, "duration": 0.3 }
]
```

```ts
// A fixed-step system whose query writes Animator: query(write(Animator), …)
if (ctx.events.read(Tap).length > 0) triggerAnim(c, i, 'wave');
```

- **Looping is the state's `loop`** (default `true`), not the clip's: a clip's own `"loop": false`
  (in an `*.anim3d.json`) is ignored by the Animator. A one-shot state needs `"loop": false`, or its
  clip starts over; with it the clip holds its last frame until a transition leaves.
- **`exitTime` is seconds of state time**, not a fraction: the state's clock runs at
  `Animator.speed` × the state's `speed`, and the clip plays on it, so "when the clip ends" is the
  clip's length in seconds (`animClipLength(entity, 'Wave')`), whatever the speeds. Leave it out
  to fire as soon as the conditions hold. To blend back while the clip finishes, use
  length − `duration`.
- **`speedParameter`** on a state names a `float` or `int` parameter its `speed` is multiplied by
  (Unity's speed parameter): `{ "name": "Run", "motion": { "clip": "Run" }, "speedParameter": "runRate" }`
  and `setAnimParam(c, i, 'runRate', v)` each step keeps the feet in step with the move speed. A
  `bool` or `trigger` parameter there is refused when the controller loads. `exitTime` counts the
  scaled time.
- **`duration`** is the cross-fade in seconds (default `0.2`; `0` cuts).
- **Conditions** all must hold: `{ parameter, op, value }` with `op` `gt` `lt` `ge` `le` `eq`
  `ne` (against `value`, default 0), `true`, `false`, or `trigger`.
- **Order:** once per fixed step and layer, the first transition in file order whose `from` is the
  current state (or `"*"`, any state other than its own `to`) and whose exit time and conditions
  hold fires; the new state starts at 0 s.
- **Triggers** (`triggerAnim(chunk, i, name)`) stay set until a transition that tests them fires.
  A tap during the one-shot is kept and replays it on return: clear it with
  `setAnimParam(c, i, 'wave', false)` if that is wrong.
- `setAnimParam(chunk, i, name, value)` sets the rest; `playAnim` / `crossFadeAnim(ctx, entity,
  state, …)` enter a state directly (Unity's `Play` / `CrossFade`); `animState(entity)` names the
  playing state in tests.

## Props on bones (`BoneAttach`)

A separate entity (a hat, a weapon, an item in a hand, a swappable part) follows a joint of a
skinned mesh with `BoneAttach { rig, joint, space }` (ADR 0120): the renderer draws it, and every
mesh under it, where it posed that joint this frame, so clips, blends, layers and IK all carry it.

- `space: 'Joint'` (default) is Unity's "child of a bone": parent the prop to the rig, and its
  `LocalTransform` is its offset from the joint.
- `space: 'Bind'` keeps a prop placed on the rig in its bind pose (e.g. a static mesh exported in the
  rig's space) and moves it as the joint moves from there: rigid skinning to that joint.

```json
{ "name": "Hero", "id": "hero", "Animator": { "controller": "anim/hero.animctrl.json" },
  "LocalTransform": {}, "MeshRenderer": { "mesh": "models/hero.glb" },
  "children": [
    { "name": "Hat", "BoneAttach": { "joint": "Head", "rig": "@hero" },
      "LocalTransform": { "position": [0, 0.24, 0] }, "MeshRenderer": { "mesh": "models/hat.glb" } }
  ] }
```

It is presentation only, like the pose: the prop's `WorldTransform` stays where the sim puts it
(the hash ignores attachments), so sim code cannot read where a hand is. Only meshes follow:
particles, lights and sprites under the prop stay at its sim placement. A wrong joint name logs
`BoneAttach: no joint '…'` and the prop stays put; a rig that is hidden or still loading leaves it
at its sim placement too. Playable ads refuse it, as they refuse `Animator`. Example:
`samples/hero-stage/scenes/props.scene.json`.

## Characters: outfits, body sliders, faces (ADR 0127)

- **Clothes, hair, armour on a body**: give each piece its own entity with a `MeshRenderer` and
  `SharedSkeleton { rig: "@body" }`. It is skinned by the body's pose this frame, joints matched
  by name; it needs no `Animator`. Joints the body lacks (a skirt's, a ponytail's) keep their rest
  pose under their parent. One `Animator` on the body poses everything.
  Put a piece at identity under its body (or as a sibling with the same `LocalTransform` under the
  same parent): crowds of dressed rigs then batch like undressed ones. Only a bit-identical world
  batches, so if a dressed crowd draws one call per piece, parent the piece directly to the body.
  An offset piece skins and draws alone.
- **Proportions**: `JointOffset { rig, joint, position, rotation, scale }` changes one joint after
  the clips and before IK (a bigger head, longer legs; children inherit the scale). One entity per
  offset; followers take the result (their own offsets and IK are ignored, and a hidden body
  leaves them posing themselves).
- **Faces and body shapes**: blend shapes (glTF morph targets, FBX blend-shape channels) import
  with the model. `BlendShapes { shapes: "Smile,JawOpen", weights }` sets up to 64 by name; `weights`
  holds up to 64 numbers in the order of the names (`[0.8, 0.2]`; missing ones are 0), and a frame
  costs the shapes with a nonzero weight, not the 64. Skinned meshes on mobile and desktop only: compat phones and unskinned meshes draw the
  neutral face, so never put gameplay meaning on a shape.
- **Colours and texture layers** are material values per entity: `MaterialOverrides` (scope an entry to one
  sub-material with `Skin:`) and texture layers (skill `vfx-materials`); a model's own
  sub-material settings are its `.gmeta` `[settings.materials.<name>]`.

```json
{ "name": "Body", "id": "body", "Animator": { "controller": "anim/hero.animctrl.json" },
  "MeshRenderer": { "mesh": "models/body.glb" }, "BlendShapes": { "shapes": "Smile",
    "weights": [0.6] } },
{ "name": "Jacket", "MeshRenderer": { "mesh": "models/jacket.glb" }, "SharedSkeleton": { "rig": "@body" } },
{ "name": "Legs", "JointOffset": { "rig": "@body", "joint": "UpperLeg.L", "scale": [1, 1.1, 1] } }
```

All four are presentation (not hashed): sim code never reads them, and playable ads refuse them.

## Unity → engine

| Unity | Here |
|---|---|
| Model `.fbx` + its textures | copy the `.fbx` and its texture files; textures are found relative to the FBX, beside it, or in a `Textures/` (or `Texture/`) folder beside it or one level up |
| Model import Scale Factor / Convert Units | automatic unit conversion; `scale` in the `.gmeta` for the Scale Factor |
| Rig: Generic, clips animate the transform hierarchy | `rig = "generic"` on the model's `.gmeta` |
| Rig: Generic/Humanoid with a skinned mesh | nothing to set (skins and bones import) |
| `Model@Clip.fbx` animation files | keep them; reference `Model@Clip.fbx#Clip` from the controller |
| Animation clip split ranges (clipAnimations in the `.meta`) | `[[settings.clips]]` in the model's `.gmeta` (name, take, start, end) |
| Humanoid retargeting between different skeletons | baked at import: `anim3d import … --rig <target> --from-rig <source>` (§ Animation clips); same joint names need nothing (Generic behaviour) |
| Animator Controller | `*.animctrl.json` (parameters, states, transitions, blend trees, layers, events) |
| A `MeshRenderer` parented under a bone (hat, weapon) | an entity parented to the rig with `BoneAttach { rig, joint }` (§ Props on bones) |
| Material colour + albedo texture | base colour and base colour map (FBX colours are read as sRGB, as Unity does); normal and emission maps too |
| Mesh vertex colours (ignored by the Standard shader) | off for FBX by default: meshes come in white, so stray colour sets (Maya's black `SculptFreezeColorTemp`) don't darken them; `vertex_colors = true` in the `.gmeta` keeps them (glTF/GLB always keeps them) |
| Material inspector, custom shaders, PSD/TGA textures | the editor's Materials mode; one shader on all of a model's materials, textures kept: `material = "…material.ts"` in its `.gmeta`; one sub-material's shader and values: `[settings.materials.<name>]` `program` / `params`; one material for everything: `MeshRenderer.material` (skill `vfx-materials`); PSD/TGA: convert to PNG or JPEG under the same name (an FBX that records `Body.psd` finds `Body.png` or `Body.jpg` beside it) |
| `SkinnedMeshRenderer.bones = body.bones` (clothes on a body) | `SharedSkeleton { rig }` (§ Characters) |
| Blend shapes, `SetBlendShapeWeight` | imported with the model; `BlendShapes { shapes, weights }` (weights 0..1, not Unity's 0..100) |
| `MaterialPropertyBlock` (per-renderer values) | `MaterialParams` component (`params` vec4 read by `instanceParams()`, `depthOffset`); instancing is kept |
| Shader `Cull Off` / `Cull Front` | `cull: 'none'` / `'front'` on the material |
| `RenderSettings.fog` | `Fog` component (linear, exp, exp², height falloff) on the camera or scene-wide |
| URP asset HDR off, Render Scale | `render.tiers.<tier>.hdr: false`, `renderScale` in `project.gameengine.json` |

Mirroring: Unity flips X to go left-handed; the engine is right-handed like glTF, so positions
you copy from a Unity scene need `x → -x` (and rotations mirrored) — the same as for glTF ports.

## Meshes built from code (ADR 0134)

Geometry the game computes (a terrain from a seed, water moved per vertex, a ribbon trail, a
sliced shape) is a dynamic mesh: build it from typed arrays, draw it by its key.

```ts
import { meshes } from '@gameengine/runtime';

// From UI code or a LateUpdate system: meshes are presentation and the calls throw in sim systems.
if (meshes.info('pond') === null) {
  // Missing on the first frame and after the world was rebuilt: they are not saved or rolled back.
  const key = meshes.create('pond', { positions, uvs, indices }); // 'dynamic:pond'
  // MeshRenderer { mesh: key, material: 'materials/water.material.ts' }
}
meshes.update('pond', { positions, uvs, indices }); // the counts may change
meshes.destroy('pond');
```

- Streams are flat typed arrays, one entry per vertex: `positions` (Float32Array, required),
  `normals`, `uvs`, `uvs1` (a second set, read by materials with `uv(1)`), `tangents` (xyz and ±1), `colors` (Uint8Array RGBA, **linear**, multiplied
  into built-in materials' colour and alpha), `indices` (Uint16Array up to 65,536 vertices, else
  Uint32Array; left out, every three vertices are a triangle). Missing normals are smooth
  (area-weighted), missing tangents follow the UVs.
- Reuse your typed arrays between updates: an update then makes no vertex-sized garbage in JS,
  and the engine reuses its CPU and GPU buffers (a 10,000-vertex update is about 0.5 ms of CPU
  on a desktop; measure on a phone before rebuilding big meshes every frame). A mesh you don't
  update costs nothing.
- `optimize: true` reorders for the GPU and builds LODs: for meshes built once, never per frame.
- One material per mesh (`MeshRenderer.material`); split by material into several meshes.
  Identical mesh and material pairs instance like file meshes.
- Not supported: physics colliders from a dynamic mesh, skinning and blend shapes on one, partial
  updates, and seeing them in the edit-mode Scene view (Play shows them).
- Limits: 1,048,576 vertices and 3,145,728 indices per mesh, 1,024 meshes, 256 MB in all; names
  use letters, digits, `_`, `-`, `/`.

## Check an import

- `gameengine validate` imports every model as the cook does: `E_MESH` for a file that fails,
  `W_MESH` for an FBX texture it cannot find (not raised when the `.gmeta` sets `material`, or
  every material using it has a `…Map` in `[settings.materials.<name>] params`), and `E_ANIMCTRL` for a `file#clip` whose file is
  not a model or has no such clip (it lists the clips it has).
- `W_MESH` names the texture path the FBX recorded (often an artist's `..\Work\…\Body_4096.png`). The
  file is looked up by that name: when the Unity project holds a renamed or resized copy (`Body_1024.jpg`),
  copy it under the recorded name (PNG or JPEG) or give the model a material.
- `gameengine model info <model>` prints what the import made: meshes, materials, vertices,
  triangles per LOD, joints and bones, blend shapes and every clip with its seconds, frames and
  events — check a phone-low budget or a clip split without opening the editor.
- Look at it: open a scene with the model and `gameengine screenshot`; wrong size means units
  (`scale`), lying on its side means the source axes were not written to the file (re-export
  with axis conversion, or rotate the entity), a still model means its clip matched no joint
  names (compare with the model's node names) or it needs `rig = "generic"`.

## Not imported

FBX lights and cameras, constraints, vertex caches, and UV sets past the second (`uv1 = true`
keeps the second). Keep those in code or re-author them with engine features. Blend shapes do
import (§ Characters).
