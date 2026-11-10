---
name: animation-2d-agent
version: 2.1.3
tier: optional
description: 2D skeleton rigging and animation with `gameengine anim2d` / MCP anim2d_* on *.skeleton2d.json, or guiding an artist through the Animation 2D editor mode (Spine-style tools). Use when rigging, weighting, keying or exporting 2D rigs, or picking rig features that stay cheap on phones.
---

# Using the Animation 2D tool

**Covers:** Using Game Engine's 2D animation tool end to end — as an agent with `gameengine anim2d` / MCP `anim2d_*` ops on *.skeleton2d.json, or guiding an artist through the editor's Animation 2D mode (Setup/Animate, Spine's tools and hotkeys). Create or import a rig (PSD with Spine's layer tags, Spine JSON/binary), bones/slots/attachments, meshes (Trace), weights, IK/transform/path/physics constraints and sliders, skins and placeholders, keys, curves, events, draw order, mix table; check with `anim2d lint`, `anim2d problems`, `anim2d metrics --device` and `skel2d preview`/export; export back to Spine. Includes measured per-feature costs for mobile (physics, clipping, deform keys, transform/path constraints, blend and atlas-page batch breaks vs cheap GPU-skinned meshes) and how to prove a rig's cost on a device (run --json, perf.stats, profile batches, tests/budgets). Use when rigging or animating 2D skeletons, choosing rig features for phones, or helping someone use the Animation 2D editor.

Two ways to do the same work on a `*.skeleton2d.json` (the format: skill `skeleton-2d`):

- **Agents:** one semantic op per change — `gameengine anim2d <op> <file> …` (MCP `anim2d_*`). Each
  op rewrites the file in canonical form, re-parses it with the engine (a file the engine would
  not load is restored and the op fails), prints a JSON summary with `--json`, and lists the valid
  options when a name, time or value is wrong. Never hand-edit the JSON.
- **People:** the editor's **Animation 2D** mode, Spine's interaction model and hotkeys.
  `references/editor.md` is the guide to give an artist: panels, tools, keys, and which op each
  action matches.

References in this folder: `references/ops.md` (every op and flag, the lint rules, previews,
recipes), `references/editor.md` (the editor by hand), `references/performance.md` (**measured
cost of every feature, tiers, mobile rules, how to prove it on a device**).

## The workflow

```
create / import  →  set up (bones, slots, meshes, weights, constraints, skins)
                 →  animate (keys, curves, events, draw order, mixes)
                 →  check (lint, problems, metrics --device, preview)  →  repeat
                 →  ship (budget test on device classes) / export back to Spine
```

Values in keys are **relative to the setup pose** (Spine's convention): `--rotate 15` adds 15°,
`--x/--y` add skeleton pixels (+y up), `--scale 1.2` multiplies.

### 1. Create or import the rig

```sh
gameengine anim2d new assets/rig/kid.skeleton2d.json    # an empty rig: root bone, default skin, images folder assets/rig/kid/
gameengine import psd art/kid.psd --dry-run --json      # what each tagged layer becomes ([bone] [slot] [skin] [mesh] [merge] [origin] …; skill spine-import)
gameengine import psd art/kid.psd                       # PNG per layer + assets/<name>.skeleton2d.json; --skeleton f --prune to reimport
gameengine import spine art/hero.json --atlas art/hero.atlas --device phone --strip-unused idle,walk   # Spine 3.0 and 3.4–4.3; warns over the device budget
gameengine skel2d info assets/hero.skeleton2d.json      # bones, slots, skins, animations, constraints
```

Bones of the setup pose come from the PSD/Spine import or the editor (Create tool, N); `anim2d`
has no bone-creation op. Images become slots with `anim2d attach-image $F --image hat --bone head`
(or `--slot s` for another attachment).

### 2. Set up: meshes, weights, constraints, skins

```sh
gameengine anim2d mesh-from-image $F --slot cape --attachment cape --detail 0.3 --generate 1   # Trace the hull from the alpha
gameengine anim2d bind $F --slot cape --attachment cape --bones cape1,cape2,cape3              # automatic weights
gameengine anim2d prune-weights $F --slot cape --attachment cape --max 2                       # the engine keeps ≤ 4
gameengine anim2d constraint-add $F --kind ik --bones thighL,shinL --target-at 20,0 --target-name footTargetL
gameengine anim2d constraint-add $F --kind physics --bones hair1 --set fps=30                  # costly: see performance.md
gameengine anim2d skin-add-placeholder $F --slot hat --name hat --skins red,blue
```

Transform, path and slider constraints, constraint keys and order, skin bones and constraints:
`references/ops.md`.

### 3. Animate

```sh
gameengine anim2d pose-bone $F --anim walk --time 0.2 --bone thighL --rotate 25 --ease smooth
gameengine anim2d pose-chain $F --bones upperArmL,forearmL --target 40,90 --anim reach --time 0.3   # IK to a point
gameengine anim2d keys move $F --anim walk --keys bone:hip:rotate@0.4 --by 0.1
gameengine anim2d curve $F --anim walk --rows bone:hip:rotate --preset automatic
gameengine anim2d event-add $F --name hit [--int 1 --string heavy --audio sfx/hit]   # define an event before keying it
gameengine anim2d event-key $F --anim hurt --event hit --time 0.1
gameengine anim2d draw-order $F --anim attack --time 0.2 --order body,armBack,head,armFront
gameengine anim2d mix $F --from idle --to walk --duration 0.2
gameengine anim2d retime $F --anim attack --duration 0.45     # mirror, blend, variation, cleanup: ops.md
```

### 4. Check

```sh
gameengine anim2d lint $F --ground-speed walk=90        # loop seams, foot slides, mesh folds, late keys, unknown references
gameengine anim2d problems $F --device phone [--fix]    # the editor's Problems view, plus cost findings for the device class
gameengine anim2d metrics $F --device phone-low         # counts, budget, estimated cost per instance, costliest features + what instead
gameengine skel2d preview $F --anim walk --times 0,0.2,0.4,0.6 --out walk.png   # engine-rendered contact sheet: look at it
gameengine skel2d preview $F --anim walk --format gif --fps 30 --crop --out exports/walk.gif
```

MCP: `anim2d_lint`, `anim2d_problems`, `anim2d_metrics`, `skel2d_preview` (returns the PNG),
`skel2d_export`.

### 5. Ship and hand back

- Mobile: run `anim2d metrics --device <class>` on every rig and act on its findings; then prove the
  scene on the device (next section).
- Back to Spine: `gameengine export spine $F --out art/spine --version 4.2|4.3` (MCP
  `spine_export`); Spine's **Import Data** reads it.

## Performance for mobile (summary of `references/performance.md`)

Measured on engine-made 31- and 100-bone rigs (M2 Max, release). Pose CPU × the regions-only baseline
of the 100-bone rig; draw calls for 200 instances.

| Tier | Features (measured) |
|---|---|
| cheap | regions; meshes with 1–4 influences (×1.0: skinned on the GPU); premultiplied alpha; two-colour tint on every slot or none; skins and outfit composition; a slider (×1.1) |
| moderate | IK (×1.5–1.7 on every chain); sequences (×1.7); inherit keys (×2.0); 4 / 8 full tracks (×1.8 / ×2.9); cross-fades (×1.4 while mixing); 128-vertex meshes (12× uploads, 5× draw-list CPU) |
| expensive | deform keys (×2.6 unweighted, ×4.1 weighted, 11× uploads); transform constraints (×5.4); path constraints (×4.0–4.3); blend mode, two-colour tint or atlas page alternating in draw order (19 601 draws instead of 1) |
| avoid on low-end | physics (every bone ×15 at 30 Hz, ×21 at 60 Hz, ×32 at 120 Hz; one per chain root ×4.3); clipping (2 draws per instance when partial; clipped meshes 239 µs per instance on the CPU) |

Rules: bend with weights, not deform keys; ≤ 4 influences (2 is usually enough); physics on chain
roots at 30 Hz, or baked into keys on low-end; a `SpriteMask` instead of clipping; group slots by
blend and tint; one atlas group per rig; each rig type at its own `order` so instances batch; stay
within `RIG_BUDGETS` (phone-low 64 bones / 48 slots / 1 500 vertices, phone 100 / 80 / 3 000).

**Two steps:** estimate while authoring with `anim2d metrics --device` / `anim2d problems
--device`; prove it in the game with `gameengine run <p> --run-sec 10 --json`, a headless
session's `perf.stats` and `profile.markers`, `gameengine profile batches`, and a
`tests/budgets/<name>.json` checked by `gameengine test <p> --tier t1` and `gameengine lab run|phones`
(worked example: `samples/rig-yard/tests/budgets/rigs.json`). The commands are in
`references/performance.md`.
