---
name: surface-paint
version: 1.0.0
tier: optional
description: Paint on 3D surfaces at run time — paint.create/stamp/clear/coverage, paint:<name> material keys, splats, footprints, wear, territory and coverage scores, UV layouts for painting (uv1), skinned meshes. Use when players or effects paint, mark or wear meshes, or a score depends on painted area.
---

# Surface paint

**Covers:** paint targets (`paint` in `@gameengine/runtime`): GPU textures you paint by stamping
world-space brushes onto an entity's mesh, sampled by any 3D material slot as `paint:<name>`.
For masks your code computes texel by texel (fog of war, lookup tables) use dynamic textures
instead (`textures`, skill `vfx-materials`).

## How it works

A stamp is a sphere in world space. The renderer draws the entity's mesh (posed, for skinned
meshes) into the target's UV space and colours every texel whose surface point is inside the
sphere, so a brush lands where it touches and wraps over edges whatever the UV layout. Texels
outside the UV islands are filled from their neighbours, so seams do not show unpainted lines.

```ts
import { defineSystem, query, read, paint, LocalTransform } from '@gameengine/runtime';
import { Wall, Brush } from './schema.gen.ts';

export const PaintWalls = defineSystem({
  name: 'PaintWalls',
  stage: 'LateUpdate', // paint is presentation: never in a fixed-step system
  queries: { walls: query(read(Wall)), brushes: query(read(Brush), read(LocalTransform)) },
  run(_ctx, { walls, brushes }) {
    if (paint.info('walls') === null) paint.create('walls', { width: 512, height: 512, color: [230, 230, 230, 255] });
    // for each wall the brush touches:
    paint.stamp('walls', wall, { position: [x, y, z], radius: 0.4, color: [255, 60, 20, 255], hardness: 0.6 });
  },
});
```

```json
{ "baseColor": "#ffffff", "baseColorMap": "paint:walls" }
```

- `create(name, { width, height, srgb?, uv?, color? })`: `color` is every texel's start; leave it
  out (transparent) for a layer a `*.material.ts` blends over the base. Colour is stored
  premultiplied by alpha, so blend it as `base * (1 - a) + rgb`. `srgb: false` for data
  masks. Creating again replaces it. Create once per world (`info(name) === null`): targets are
  presentation, cleared when the world rebuilds, never saved, hashed or rolled back.
- `stamp(name, entity, { position, radius, color?, hardness?, erase? })`: `hardness` 0 is all
  soft edge, 1 a hard disc. `erase: true` fades back to the clear colour by the colour's alpha
  (on a partly transparent clear, back to transparent).
  Returns the stamp's number.
- `clear(name, color?)`, `destroy(name)`, `info(name)`, `list()`.
- `coverage(name)`: `{ painted, color, stamps }` from the GPU a few frames after the stamps
  (`stamps` says how many it includes): the painted share of the stamped meshes' surface and the
  paint's average sRGB colour. `null` until measured, and always in headless game tests.

## UV layout

Painting needs a layout where no two parts of the surface share texels. Mirrored or stacked UVs
(common for texture reuse) paint both halves at once. Unwrap a second, non-overlapping set in
the DCC tool, set `uv1 = true` in the model's `.gmeta`, and create the target with `uv: 1`.
`builtin:plane` and `builtin:sphere` have unique UVs; `builtin:cube` maps every face to the
whole texture, so a stamp on one face paints all six: give a painted crate a model with its own
unwrap.

## Performance

- Each stamp is one small draw per sub-mesh of the entity (at most 512 draws a frame; the rest
  wait for the next frame, so keep painted models to few sub-meshes); a frame with stamps adds a
  pass over each changed target; frames without stamps cost nothing. Stamp only while a brush touches (check
  the distance first) and not more than once a frame per brush.
- GPU memory is 9 bytes a texel: a 512² target is 2.4 MB, 1024² 9.4 MB. Use the smallest size
  that looks right at the camera distance: on phone-low a 512² per hero object is plenty. Paint
  targets are not yet counted in `memory report` or the texture budget: add them up yourself.
- Limits: 2048 texels a side, 16 targets, 96 MB in all; at most 256 stamps a target between two
  frames (the oldest of more are dropped).
- Paint is presentation: game rules that depend on painted area read `coverage` from
  presentation code and feed the result back as input, or keep their own sim-side record.

## Testing

Headless game tests have no renderer: assert on `paint.info(name).stamps` and bad input, and
use a render test (`renderTest`, T1 golden) for how it looks.
