---
name: vfx-materials
version: 1.26.0
tier: optional
description: Materials and shaders (*.material.ts, *.mat.json) and particle effect code — MaterialParams, overrides, texture layers, decals, culling, fog, Materials mode sliders, `gameengine material preview`. Use for shaders, look development and porting Unity materials (the effect workflow is the vfx skill).
---

# VFX and materials

**Covers:** Authoring particle effects (*.vfx.json data, or *.vfx.ts code) and materials (*.material.ts, *.mat.json) in Game Engine — per-entity values (MaterialParams, MaterialOverrides and saving them as an instance), texture layers (makeup, tattoos, dirt), camera inputs, culling, fog, decals and depth offsets, slider ranges for the editor's Materials mode, `gameengine material preview` (on the model a material is drawn on, as a device cooks its textures, with the UV checker), `material uses` and `texture inspect`. Use for visual effects, shaders and look development, and when porting Unity materials; the `vfx` skill has the effect workflow in depth.

**Effects** (`assets/fx/*.vfx.json`), GPU on mobile and up, CPU on compat. The data form is the
default: the editor's VFX mode (on by default, like Materials) and `gameengine vfx set|preview|stats` edit and check it. The
**`vfx` skill** has the preview → adjust loop, recipes and mobile budgets.

```json
{ "$schemaVersion": 1, "name": "Sparks", "emitters": [
  { "name": "burst", "capacity": 256, "bursts": [{ "at": 0, "count": 80 }], "loop": false,
    "shape": { "kind": "cone", "angle": 0.3, "radius": 0.1 }, "lifetime": [0.4, 0.8], "speed": [3, 6],
    "gravity": [0, -9.8, 0], "size": [0.05, 0.1], "color": [1, 0.651, 0.147, 1],
    "colorOverLife": [[0, 1, 1, 1, 1], [1, 1, 0.147, 0.042, 0]], "blend": "additive" } ] }
```

Code-driven effects use the DSL in `*.vfx.ts` (`gameengine gen` compiles them to `*.vfx.gen.json`;
`gameengine vfx convert` turns one into data):

```ts
export default effect('Sparks', [
  emitter('burst', {
    capacity: 256, bursts: [{ at: 0, count: 80 }], loop: false,
    shape: cone(0.3, 0.1), lifetime: [0.4, 0.8], speed: [3, 6], gravity: [0, -9.8, 0],
    size: [0.05, 0.1], color: '#ffd36b', colorOverLife: gradient([0, '#ffffff', 1], [1, '#ff6b3a', 0]),
    blend: 'additive',
  }),
]);
```

- Effects are presentation only: they never change sim state.
- Many instances of one effect share one draw per emitter, and `burstAt(system, positions)` plays
  many pops from one stopped system; the rules are in skill `vfx` (ADR 0092).
- Look at every change: `gameengine vfx preview <effect> --out fx.png` (contact sheet), and
  `gameengine vfx stats <effect> --device android-low-compat` before shipping.
- **A material on particles** (ADR 0262): set an emitter's `material` to a `*.material.ts`/`*.mat.json`
  key (`gameengine vfx set <effect> <emitter>.material materials/x.material.ts`, or the material button
  in the VFX mode's Images list). The particle draws unlit with that surface: `vertexColor()` is the
  textured particle colour, the uv is the quad's 0..1, and `instanceParams()` is (life 0..1, a per-particle
  random, age in seconds, 0), so a dissolve reads `instanceParams().x`. Return alpha, or the quads draw
  square. The emitter's `blend` wins over the material's blend, alphaCutoff and doubleSided. Each emitter
  with a material is its own draw, so drop it for `phone-low` in `overrides`. The 2D VFX player draws the
  plain image; check the look in its 3D view or with `gameengine vfx preview`. Playable ads draw the image.
- **A material on a sprite** (opt-in, `Sprite.material`): a dissolve, a glowing edge, a scrolling
  shine. The sprite draws unlit with the material's surface: `vertexColor()` is the texel (trim, flip,
  fill and the colour pass applied) times `Sprite.color`, `uv()` is 0..1 over the whole sprite (y down,
  flipped with the image; a sliced sprite gives each cell its own 0..1), `instanceParams()` is
  `Sprite.params` (four floats, set them from a `LateUpdate` system), and `time()`, `materialGlobal(i)`
  and `screenUV()` work. `objectToWorld(v)` turns by the sprite's unit axes; `objectPosition()` is zero.
  The sprite's `blend` and mask apply; return alpha. The material runs only on the image's texels (a
  cooked, trimmed sprite discards past them), so it cannot draw an outline or glow beyond the image. Material textures (a noise map with `kind = "texture"`)
  work, and so do `dynamic:` textures through a material slot. Lit and toon materials draw unlit, and
  2D lighting and soft masks skip the material (the sprite draws plain).

  ```ts
  // assets/materials/dissolve.material.ts — params.x: 0 whole … 1 gone
  export default material('Dissolve', {
    blend: 'blend',
    params: { noise: texture2d(), edgeColor: uniform.color('#ffb347'), edge: uniform.f32(0.08, { min: 0, max: 0.3 }) },
    overrides: { 'phone-low': { use: '' } }, // off on phone-low: the plain sprite
    surface: ({ noise, edgeColor, edge }) => {
      const c = vertexColor();
      const t = instanceParams().x;
      const n = texture(noise, uv()).r;
      const keep = smoothstep(t, t.add(0.02), n);
      const rim = smoothstep(t.add(edge), t, n).mul(keep);
      return unlit({ color: c.rgb.add(edgeColor.rgb.mul(rim).mul(2)), alpha: c.a.mul(keep) });
    },
  });
  ```

  **Cost:** sprites without a material batch exactly as before and pay nothing. Sprites batch per
  material: consecutive sprites with the same material, page, blend and mask share one draw, and each
  switch to or from a material is a draw (`profile batches` says `material`). While any sprite in the
  frame has a material, every sprite instance also uploads 16 bytes of params. A material that is
  still loading hides its sprite (as on particles). **phone-low:** `"use": ""` in the material's
  `overrides` (`.mat.json`: `"overrides": { "phone-low": { "use": "" } }`) turns it off on that device:
  the sprite falls back to the plain sprite shader, pixel for pixel, with no sim branch; or `use` a
  cheaper material. Particles take `"use": ""` the same way. The editor and web builds draw sprite
  materials; playable ads draw the plain sprite.
- **Materials** (`assets/materials/*.material.ts`) compile to WGSL for every tier: `gameengine gen` writes
  the `*.material.gen.json` next to each, then check with `gameengine material validate`. A new
  `*.material.ts` also needs its `.gmeta` sidecar (else `E_ASSET: no .gmeta sidecar`): create the file with
  `gameengine cmd asset.setText --path assets/materials/x.material.ts --text "…" --create`, which writes
  the sidecar only when it creates the file, or run `gameengine cook` once; commit the `.gmeta`. Look with `gameengine material preview <key> --out m.png`
  (`--mesh sphere|cube|plane|cylinder|torus|cloth|quad|<mesh key>|used`, `--yaw`/`--pitch` radians, `--time s` for animated
  shaders, `--light studio|flat`, `--environment env/x.hdr --background environment`; to match a reference capture:
  `--light-yaw`/`--light-pitch` radians and `--light-intensity` for the key light, `--ambient #rrggbb`, `--fov`
  radians; the output's `rig` names the camera and lights it drew with; MCP `material_preview`).
  Look after every edit, and at two or three times when the shader animates. The editor's **Materials** mode
  follows your edits live: it hot-reloads the preview, highlights what changed and keeps a version history.
  It also lists imported models' sub-materials and saves their values to the model's `.gmeta`
  (`[settings.materials.<name>]`: `program`, `params`; skill `models-3d`).
- **Skip work a pixel cannot show** (layered noise in terrain, sky and water): `mix(base, layer, w)` runs
  `layer` on every pixel, even where `w` is 0. Write `mix(base, when(w, layer), w)` (same pixels; the layer
  runs only where `w > 0`) or `branch(cond, near, far)` (a real `if`; `cond` is a scalar, `near` where it is
  above 0): near detail only, far woods only, clouds only where covered. Untextured samples and `fn()` helpers
  that take derivatives run before the `if` anyway; pass gradients to `texture` to keep a sample inside.
- **Preview on the right model, as a device sees it** (ADR 0107): `--mesh used` previews on the model the
  material is drawn on (`gameengine material uses <key>` lists the scene, prefab and data-asset sites and models that fit,
  and says when a mesh lacks UVs or vertex colours the material reads; MCP `material_uses`). `--device
  android|android-etc2|ios|desktop` shows textures as that device's GPU samples them after the cook (`android-etc2`:
  an Android GPU without ASTC, where the universal cook becomes ETC2; `compare`: the editor's look, Android's with
  and without ASTC, and iOS's side by side in one image; add `--class phone-low` for that class's overrides): compressed and decoded back, with the
  mipmaps and colour space their `.gmeta` gives. `--test-texture` draws the built-in UV checker
  (`builtin:uv-checker`, tiles A1–H8, a fine-stripe row) in the albedo slots; `--mesh cloth` is a draped
  panel with clean UVs. Materials mode has all three (mesh list "Used by this material", "Textures", "UV
  checker").
- **Textures for materials:** give each one `kind = "texture"` in its `.gmeta` (the default `sprite` cooks
  without mipmaps: smooth in the editor, shimmering on a phone) and `srgb = false` for normal maps and masks;
  `gameengine validate` warns about both (`W_TEXTURE_MIPS`, `W_TEXTURE_SRGB`) and about one-texel stripes and
  checks that compression smears (`W_TEXTURE_DETAIL`). `gameengine texture inspect <key> --device android,ios`
  writes the cooked texels, the difference from the source, every mip level and the size each memory class
  uploads (`--sheet file.png`: source, cooked and difference in one image; MCP `texture_inspect` returns it).
- **A visual bug seen on a phone** (shimmer, moiré, blocky or wrong colours): `material_preview` with `device:
  "compare"`, `deviceClass: "phone-low"`, `mesh: "used"` shows it next to the editor's look, and its warnings say
  which `.gmeta` setting causes it; fix, preview again, then `gameengine validate`.
- **Cheaper on low-end phones** (skill `device-tiers`): `material('Gem', { …, fallback:
  'materials/plastic.mat.json', overrides: { compat: { use: 'materials/flat.material.ts' } } })`.
  `use` draws another material on that tier or memory class; `fallback` is drawn when the material
  cannot load or build on the device. A `.mat.json` takes `"overrides": { "phone-low": { "use":
  "…" } }` or per-device `params`. Look at each version with `gameengine material preview <key>
  --tier mobile --class phone-low`; `validate` reports a missing target (`E_OVERRIDE_USE`). Neither
  moves `pipelines.json` records.
- **Hand-tunable params:** give scalar params a slider range, which Materials mode shows:
  `glow: uniform.f32(0.6, { min: 0, max: 2, step: 0.05, doc: 'emission strength' })`. Colours
  (`uniform.color`) get a picker. Designers tune values in `*.mat.json` instances
  (`{ "material": "materials/x.material.ts", "params": { "glow": 1.2 } }`), which need no compile.
- **Per-frame globals** (Unity's `Shader.SetGlobalVector`): material params are fixed per asset,
  so values that change every frame go in the presentation resource `MaterialGlobals`
  (`v0`…`v7`, `vec4`, zeros until set). A `LateUpdate` system writes it; any material reads
  `materialGlobal(i)` (`vec4f`, `i` 0–7) — in the forward, prepass and shadow passes alike.
  Never write it from sim code. A hole in the ground:

```ts
// assets/materials/hole_ground.material.ts — cut a disc (centre .xz, radius .w)
export default material('HoleGround', {
  blend: 'mask',
  surface: () => {
    const hole = materialGlobal(0);
    const d = length(worldPosition().swizzle('xz').sub(hole.swizzle('xz')));
    return pbr({ baseColor: color('#6a8f4e').rgb, alpha: smoothstep(hole.w, hole.w.add(0.02), d) });
  },
});

// src/hole.ts — Hole is a game component on the hole entity
export const HoleGlobals = defineSystem({
  name: 'HoleGlobals',
  stage: 'LateUpdate',
  query: query(read(Hole), read(WorldTransform)),
  resources: [write(MaterialGlobals)],
  run(ctx, q) {
    for (const c of q.chunks()) {
      const m = c.col(WorldTransform).matrix; // column-major: translation at 12..14
      if (c.length > 0) ctx.set(MaterialGlobals, { v0: [m[12]!, 0, m[14]!, c.col(Hole).radius[0]!] });
    }
  },
});
```
- **Vertex offset** (wind, sway, spirals): `vertexOffset: (params) => vec3` adds a world-space
  offset to each vertex, in the lit and shadow passes alike. It reads `uv()`, `worldPosition()`,
  `worldNormal()`, `vertexColor()`, `time()`, params and `materialGlobal(i)`; no textures.
  **Decals**: `depthOffset: 0.01` (world units towards the camera) wins the depth test against the
  surface underneath without lifting the decal. Coplanar surfaces with equal depth offsets resolve
  the same on every tier (the later draw wins); pick a winner with `depthOffset`, not draw order.
  **Screen space**: `screenUV()` (0..1, y down).
  **Scene behind** (Unity's `SceneDepth` / `SceneColor`; `blend: 'blend'` materials, fragment
  only): `depthFade(1)` (0 where the surface meets the opaque scene, 1 a world unit deeper: water
  depth tint, shore foam, soft intersections), `sceneDepth()` / `surfaceDepth()` (linear, world
  units), `sceneColor(screenUV().add(offset))` (refraction) and `sceneAvailable()` (0 on compat,
  where depth reads far and colour black: pick a fallback look with it). Only cameras drawing such
  a material copy the scene (8–12 bytes a pixel while it is on screen); give `phone-low` a cheaper
  material through `overrides` when the effect is not worth it there.
  **Sun** (both stages): `mainLightDirection()` (towards the sun, normalised; up without one) and
  `mainLightColor()` (linear colour × intensity; black without one): a ported shader that lit itself from a
  hand-kept light uniform reads these instead. Particles, sprites and shadow passes see no sun.
  **Additive**: `blend: 'add'` (Unity's `Blend SrcAlpha One`) draws with the blended surfaces after the
  opaque scene, without writing depth: glows, light shafts, energy shells. Return alpha; it scales the add.
  **Sun shadow**: `mainLightShadow()` (fragment only: 0 in the sun's shadow, 1 lit; 1 without a
  sun or on meshes that don't receive shadows) for stylised shading, e.g. an ink line along
  shadow edges in a `toon()` graph. Only materials that read it pay to sample the shadow first.
  **Two-sided**: `frontFacing()` (1 or 0) with `doubleSided: true`. **Object space** (both
  stages): `objectPosition()` (pivot in world space), `objectToWorld(v)` (object-space direction
  → world, rotated and scaled), `objectScale()`; e.g. a liquid level that stays level:
  `step(worldPosition().y.sub(objectPosition().y), objectScale().y.mul(fill))`.
- **Per-entity values** (Unity's `MaterialPropertyBlock`): put `MaterialParams` next to the
  `MeshRenderer` — `params` (a `vec4`, read with `instanceParams()` in both stages) and
  `depthOffset` (added to the material's). Entities sharing mesh and material still draw as one
  instanced batch. Do not pack values into `MeshRenderer.color`; that stays the tint.
  A hit flash: the material blends to white by `instanceParams().x`, and a `LateUpdate` system
  fades it from the sim's last hit (presentation only: the sim never reads `MaterialParams`):

```ts
// assets/materials/hit_flash.material.ts
export default material('HitFlash', {
  params: { baseColor: uniform.color('#4f8cff'), flashColor: uniform.color('#ffffff') },
  surface: ({ baseColor, flashColor }) => {
    const flash = instanceParams().x; // 0..1, per entity
    return pbr({ baseColor: mix(baseColor.rgb, flashColor.rgb, flash), emissive: flashColor.rgb.mul(flash) });
  },
});

// src/flash.ts — Game.hits (sim: true) counts hits; HitFlash { hits, at } is a sim: false resource
export const HitFlashFade = defineSystem({
  name: 'HitFlashFade',
  stage: 'LateUpdate',
  query: query(read(Enemy), write(MaterialParams)),
  resources: [read(Game), write(HitFlash)],
  run(ctx, q) {
    const now = ctx.step * ctx.dt;
    const hits = ctx.get(Game).hits;
    if (hits !== ctx.get(HitFlash).hits) ctx.set(HitFlash, { hits, at: now });
    const amount = hits === 0 ? 0 : Math.max(0, 1 - (now - ctx.get(HitFlash).at) / 0.3); // 0.3 s fade
    for (const c of q.chunks()) {
      const p = c.col(MaterialParams).params; // vec4 per row: x at i * 4
      for (let i = 0; i < c.length; i++) p[i * 4] = amount;
    }
  },
});
```
- **Per-entity looks** (a skin tone, a jacket colour, a swapped texture): `MaterialOverrides {
  values: "tint=#c68642; roughness=0.7; baseColorMap=textures/denim.png" }` sets any uniform or
  texture of the entity's material for that entity (numbers, `x y z`, `#rrggbb`, texture keys; at
  most 64 entries and 4 KB). On a model with several sub-materials an entry scoped by name,
  `Skin:layer1Strength=0.8`, reaches only that sub-material; an unscoped entry reaches all of them.
  Entities with the same values batch together; every distinct look is one
  material, so keep looks to a palette, not a value per entity per frame (that is
  `MaterialParams`). In the editor, tune the values in the inspector, then **Save** under
  `MaterialOverrides` writes them as a `*.mat.json` instance (bus `asset.saveMaterialInstance`;
  agents: `gameengine editor call cmd.execute`), which other entities can then use.
- **A model's own sub-material values** live in its `.gmeta`: `[settings.materials.<name>]` with
  `program` (a `*.material.ts` to draw that sub-material with) and `params` (its values and
  textures by name), and travel with the model to scenes, the cook and devices; entity overrides
  apply over them. `gameengine material model <model.glb>` (MCP `material_model`) lists the
  sub-materials with their programs, values and textures; `gameengine material preview
  <model.glb> --overrides "Skin:roughness=0.4"` draws the whole model with values tried on.
- **Texture layers** (e.g. makeup, tattoos, dirt): `params: { ...layerParams(3) }` and
  `applyLayers(p, base.rgb, 3)` lay up to 8 maps over the mesh's UVs, each with a tint and a
  strength (0 hides it). Pick each entity's layers with `MaterialOverrides`
  (`layer1Map=textures/blush_02.png; layer1Strength=0.8`). The maps are the layers of one texture
  array (`layerMaps`), so all of them take one of the material's 8 texture slots; **give every
  layer texture of a material the same size** (and the same `.gmeta` compression and mips): a
  layer that differs from the first bound one draws as white and the log names the size it
  should have. An unbound layer costs no memory. Each layer is a texture fetch per pixel: give
  phone-low fewer layers through the material's `overrides` (skill `device-tiers`). Your own
  arrays: `texture2dArray({ layers: ['dirt', 'scratches'] })`, sampled with
  `texture(p.decals.layer('dirt'), uv())`.
- **Second UV set**: `uv(1)` reads a mesh's second texture coordinates (lightmap-style unwraps:
  baked softbox highlights, paint or dirt masks, detail maps) in the surface and in `vertexOffset`.
  Models keep the set only with `uv1 = true` in their `.gmeta`, dynamic meshes take `uvs1`; a mesh
  without one gives `uv(1)` its first set, and `validate` warns (`W_MATERIAL_UV1`). The stream is
  bound only for materials that read it, so it costs nothing elsewhere. Built-in `*.mat.json`
  materials read the first set only. Compat skinned meshes read their first set.
- **Dynamic textures**: images your code writes at run time (a paint or dirt mask, fog of war, a
  lookup table) go in any texture slot as `dynamic:<name>`. They are presentation: create and
  write them from UI code or a LateUpdate system.

  ```ts
  import { textures } from '@gameengine/runtime';
  if (textures.info('paint') === null) textures.create('paint', { width: 256, height: 256, srgb: false, color: [0, 0, 0, 255] });
  textures.fill('paint', [255, 0, 0, 255], { x, y, width: 4, height: 4 }); // or write(name, Uint8Array, rect)
  // { "baseColorMap": "dynamic:paint" }, or an instance: { "material": "materials/x.material.ts", "params": { "mask": "dynamic:paint" } }
  ```

  Only written rectangles upload, at the next frame, so write the area that changed. Sampled with
  repeat: keep a texel of border on a mask that must not wrap. One mip level (draw it near its own size), at most 2048 pixels a side, 64 textures, 64 MB in all. Until
  `create` the slot shows its default. Sprites read them through a sprite material (`Sprite.material`);
  plain sprites and UI do not read them yet.
- **Paint targets**: paint stamped onto a mesh by world-space brushes (splats, wear, territory)
  goes in a texture slot as `paint:<name>`; the GPU draws each stamp in the mesh's UV space and
  measures coverage. Skill `surface-paint`.
- **Area lights and soft shadows**: `Light.kind` `Rect` (`width`, `height`), `Disk` (`radius`)
  and `Tube` (`length`, `radius`) shine from their whole surface; they are the opt-in feature
  `areaLights` (the mobile and desktop tiers can run it; a point light where off, and leave it
  off for `low`, whose phones run the mobile tier). PCSS soft shadows are
  `softShadows`, desktop only: `Light.sunAngle` (about 0.01–0.1) widens the sun's, and
  `shadowSoftness` (or a rect or disk light's own size) a local light's. Switch them per level
  (skill `device-tiers`).
- **Studio lighting on mobile**: a softbox look needs no area lights. Light the scene with a
  softbox HDR through `Environment.lightingMap` (the skybox keeps `map`), warm or cool it with
  `Environment.tint`, and bake the big soft highlights of hero props into a texture read with
  `uv(1)` (unwrap the second set in the DCC tool, bake there, set `uv1 = true`). Shape point and
  spot lights with `Light.falloff`: `InverseSquare` (default, physical), `Linear`, `Constant` or
  `Exponent` with `falloffExponent`; all cost the same.
- **Procedural sky**: put the material in `Environment.skyMaterial` instead of a dome mesh. It draws
  behind everything, unlit (`baseColor` + `emissive`), only on pixels nothing covers.
  `worldPosition()` is on a sphere 1000 units around the camera, `worldNormal()` and `viewDirection()` point
  back at the eye (the view ray is `viewDirection().negate()`), and `uv()` is equirectangular (u around
  the horizon, v from the zenith). On phones set `skyScale` (0.25–1) per device key (skill
  `device-tiers`): 0.5 runs the sky on a quarter of the pixels. Keep clouds behind `when()` so a clear
  sky skips them.
- **Camera** (both stages): `cameraPosition()`, `cameraForward()`, `cameraRight()`, `cameraUp()`,
  `worldToView(p)`. Shadow passes see the camera the shadows are for. A billboard in
  `vertexOffset`: `cameraRight().mul(uv().x.sub(0.5)).add(cameraUp().mul(uv().y.sub(0.5)))`.
- **Drawn over everything**: `depthTest: false` with `blend: 'blend'` or `'add'` ignores the depth buffer and draws after the other transparent draws (a target marker through walls, a pickup glow); an opaque material refuses it.
- **Culling**: `cull: 'back' | 'front' | 'none'` (`none` = `doubleSided: true`); a `*.mat.json`
  instance may override `cull`. `front` draws the inside of a shell (a sky dome, a portal).
- **Fog**: a `Fog` component (on a camera, or anywhere for every camera) fogs every 3D material
  in the forward pass — linear, exponential or exponential squared, with height falloff. Opt out
  with `fog: false` and apply `fogFactor()` yourself (0..1). Sky, sprites and particles are not
  fogged.

```ts
export default material('Grass', {
  params: { sway: uniform.f32(0.15) },
  surface: () => pbr({ baseColor: color('#4f8a3a').rgb }),
  // vertex colour r: 0 at the root, 1 at the tip
  vertexOffset: ({ sway }) => vec3(sin(time().mul(2).add(worldPosition().x)).mul(sway).mul(vertexColor().r), 0, 0),
});
```
- Keep draw calls inside the budget (`drawCallsMax`); `gameengine test --tier t1` reports it.
- **Loading views** (`RenderStatus`, presentation resource, written before `LateUpdate`):
  `frame`, `pendingAssets` (assets the last rendered frame waited for), `pendingPipelines`
  (warm-up pipelines not compiled yet). Show a loading view until `frame` has passed the frame
  the level spawned on and `pendingAssets + pendingPipelines` has stayed 0 for a few frames.
  Headless sessions, tests and no-GPU hosts report 0 and keep counting frames.

```ts
// src/loading.ts — LoadingState is a game resource ({ spawnFrame, quietFrames, visible })
export const LoadingView = defineSystem({
  name: 'LoadingView',
  stage: 'LateUpdate',
  resources: [read(RenderStatus), write(LoadingState)],
  run(ctx) {
    const s = ctx.get(RenderStatus);
    const l = ctx.get(LoadingState);
    if (!l.visible) return;
    const quiet = s.frame > l.spawnFrame && s.pendingAssets + s.pendingPipelines === 0 ? l.quietFrames + 1 : 0;
    ctx.set(LoadingState, { quietFrames: quiet, visible: quiet < 3 }); // the UI controller hides the view
  },
});
```
