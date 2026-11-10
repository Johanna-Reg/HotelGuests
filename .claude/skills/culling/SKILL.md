---
name: culling
version: 1.1.0
tier: optional
description: Culling per device and platform — render.culling (distance, layerDistances, minScreenSize, animation, particles, occlusion, lodCrossFade, lodHysteresis, perspective2d), DrawDistance/HLOD, Occluder, AlwaysAnimate, VisibilityNotifier. Use for off-screen cost, draw distance, LOD pops, occlusion or "is it on screen".
---

# Culling

**Covers:** what the engine leaves out of a frame and how a project switches each part per device class and platform (ADR 0138, design.md § 6.10): distance and screen-size culling, off-screen animation and effects, CPU and GPU occlusion, LOD cross-fades and HLOD hand-overs, 2D under perspective cameras, and the presentation visibility API.

Culling is presentation: it never changes the hash, replays or tests' results. What can cost more
than it saves is off by default where it might; measure before turning it on.

## Switches (`project.gameengine.json`)

```json
"render": {
  "culling": {
    "layerDistances": { "3": 40 },
    "minScreenSize": 0.004,
    "overrides": { "phone-low": { "minScreenSize": 0.01, "layerDistances": { "3": 25 } } },
    "platforms": { "ios": { "occlusion": "gpu" }, "web": { "occlusion": "cpu", "occluderTriangles": 2048 } }
  }
}
```

| Field | Default | What it does |
|---|---|---|
| `distance` | on | `DrawDistance` and `layerDistances` apply |
| `layerDistances` | none | per `MeshRenderer.layers` bit: max distance (nearest point of the bounds) |
| `minScreenSize` | 0 (off) | drop meshes whose sphere covers less than this share of the view height |
| `animation` | on | skinned meshes no view or shadow can show are not posed |
| `particles` | on | effects off every camera are not simulated or drawn |
| `occlusion` | `auto` | `auto` GPU Hi-Z on desktop only; `gpu` anywhere it is supported; `cpu` `Occluder` raster; `off` |
| `occluderTriangles` | 16384 desktop, 4096 else | CPU occluder budget per camera (max 65536) |
| `lodCrossFade` | 0.25 s desktop, 0.2 s mobile, 0 on `phone-low` (only its own override turns it on) and compat | dithered LOD switches; also turns on `DrawDistance.fade` |
| `lodHysteresis` | 0.25 | a coarser LOD is taken only once its screen error is this share under the limit, so a mesh held at a switch distance never flickers (0..0.5) |
| `perspective2d` | on | sprites, tiles, text, shapes culled under perspective cameras |

Resolution order: tier defaults → fields → `overrides` (tier or memory class, as everywhere) →
`platforms` (`ios`, `android`, `web`, `windows`, `macos`, `linux`; the OS the player was built
for). `gameengine validate` names bad values (`E_CULLING`). Check what a device got:
`gameengine call render.stats` → `cullingSettings` (resolved) and `culling` (what each test left
out: `distance`, `small`, `occluded`, `occluderTriangles`, `animations`, `effects`, `fading`).

## Components (all presentation, `sim: false`)

- `DrawDistance { min, max, fade }` on a `MeshRenderer` or `ParticleSystem`: drawn only between
  `min` and `max` from the camera (0: no limit). HLOD: detailed mesh `{ max: 50, fade: 6 }`, its
  cheap stand-in `{ min: 50, fade: 6 }` → a dithered hand-over (needs `lodCrossFade > 0`, else a
  hard cut at 50). Effects cut hard.
- `Occluder` (tag): this mesh's coarsest LOD hides what is behind it when `occlusion` is `cpu`.
  Only big, solid, simple meshes (walls, buildings, terrain chunks); every triangle costs CPU.
  An occluder culled or fading at that camera, or one with blend shapes or a vertex-offset
  material, hides nothing.
- `AlwaysAnimate` (tag): a rig keeps posing, or an effect keeps simulating, off screen. Rigs with
  `BoneAttach` children and shown `SharedSkeleton` wearers pose anyway.
- `VisibilityNotifier { radius }`: the engine writes `visible`, `changed` (one frame) and
  `distance` after each drawn frame. Read it in `LateUpdate` or UI only (pause a looping sound,
  stop a costly presentation system, start an intro when a thing comes on screen). Never in sim:
  devices and window sizes see different things (lint and binding refuse `sim: false` reads).

```json
{ "name": "Tower", "MeshRenderer": { "mesh": "models/tower.glb" }, "DrawDistance": { "max": 120 }, "Occluder": {} }
```

## Rules

- Phone-low first: keep `occlusion` and `lodCrossFade` off on `phone-low`/`compat` (the defaults;
  `lodHysteresis` still stops LOD flicker there) unless a probe build shows a win (`gameengine device perf`, before and after). GPU Hi-Z costs a depth prepass
  and compute; fades draw twice and lose early-Z; CPU occlusion costs per occluder triangle.
- Prefer `DrawDistance`/`layerDistances`/`minScreenSize` for many small props: near-free, and the
  shadows go with them.
- Off-screen effects keep their slot and restart when seen, caught up at most one lifetime
  chain; a long looping effect that must look mid-cycle at once needs `AlwaysAnimate`.
- Gameplay that needs "is it visible" uses a sim rule (distance, camera bounds you compute from sim
  state), never `VisibilityNotifier`.
- Prove it: `render.stats` counts before and after, and the frame time in a Perfetto capture
  (`3d.cull`, `3d.cull.animation`, `3d.cull.occluders`, `visibility.notifiers`).
