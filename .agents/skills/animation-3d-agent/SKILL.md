---
name: animation-3d-agent
version: 1.6.0
tier: optional
description: 3D character animation as keyed clips (*.anim3d.json) on a rig profile with `gameengine anim3d` / MCP anim3d_*: a reference humanoid with base clips (idle, walk, run, jump), poses, cycles, mirroring, root motion, events, contact-sheet previews, Blender MCP. Use when making or changing 3D animation, a pose or a cycle on a skinned model.
---

# Keyed 3D animation

**Covers:** Authoring 3D character animation in Game Engine as keyed clips (*.anim3d.json) on a rig profile (*.rig3d.json) — as an agent with `gameengine anim3d` / MCP `anim3d_*` (rig infer, import a model's clip as keys, new, pose, reach, key, apply, scale/offset/smooth, retime, mirror, mirror-copy, loop-seam, planted), gameplay data (clip events and footstep markers the sim reads, root motion that moves a RootMotion entity, foot lock, IK swivel, quaternion keys), checking motion by numbers (`sample`), `lint` and engine-rendered contact sheets (`preview`), playing clips through an Animator as `file#clip`, and the editor's Animation 3D mode (off by default; switch it on in the Mode library). Starts humanoids from the reference humanoid's rig and base clips (`references/humanoid.md`). Also when to bring in Blender with the free Blender MCP server, and asking the user before setting it up. Use when making or changing 3D animation, a pose or a cycle on a skinned model.

A keyed clip animates a few channels of a few joints **relative to the rest pose**, on named axes
from a rig profile: "bend `lowerLeg.L` to 45° at frame 10, ease out". The importer bakes it into
an ordinary clip on the model's skeleton, so an Animator, a timeline or a UI `<Model>` plays it as
`assets-relative/path.anim3d.json#<name>` exactly like a glTF/FBX clip (skill `models-3d`). The
format: `docs/anim3d-format.md` in the engine repository (ADR 0126).

One op per change: `gameengine anim3d <op> …` (MCP `anim3d_*`). Each edit rewrites the file in
canonical form after the engine has loaded the result, so a refused edit (an unknown channel, a
key on the mirrored side, a frame outside the clip) leaves the file unchanged and says why. Do not
hand-edit the JSON unless an op cannot express the change; run `anim3d info` afterwards if you do.

## Start from the reference humanoid

For a humanoid, do not start from an empty clip. `references/humanoid.md` (beside this file) has
the canonical skeleton (`builtin:humanoid`: bone layout, alias names, rest and reference pose,
what each channel's sign means) and eight base clips in `references/humanoid/` (idle, walk, run,
jump, fall, land, punch, hit) with their key poses, timing and curves, planted feet included.
Copy the clip closest to what you need, point its `rig` at your profile, scale its metres to
your character and change it from there; the page says how, and why the clips read well.

## The loop

```
rig infer (once per model)  →  new clip  →  block key poses  →  check numbers (sample, lint)
→  look (preview)  →  refine eases, timing, mirror, seam  →  play it (Animator)  →  repeat
```

### 1. A rig profile, once per model

```sh
gameengine anim3d rig infer assets/models/hero/hero.glb --out assets/anim3d/hero.rig3d.json   # or builtin:humanoid, builtin:mannequin
```

Read the report: `unmapped` joints and `notes` (a missing foot chain, a role it could not find)
need a hand fix in the profile (one line per joint). A model that rests in a T-pose or A-pose
gets a `base` on its upper arms, so clips key from arms hanging down on every rig (the
reference pose); keep it. Re-inferring a profile whose clips were keyed without a `base` changes
what their arm keys mean: keep the old profile for them, or re-key. A based arm is in every bake,
so an override layer that keys only the head or a tail needs a mask. It prints the **up axis of the hips' parent
frame**: on a Blender (Z-up) export under a root bone it is often `z`, so `hips.z` raises the body
and `hips.y` moves it backwards. Use `hips.my` (model up) and you need not care. Files are a path
or an asset key (`models/hero/hero.glb`), from anywhere in the project. Conventions it writes, the same on both sides:
`pitch` swings a bone forward (+Z; on a foot it lifts the toes), `roll` swings a limb out to its
side, `yaw` turns about up, knees and elbows have one `bend` axis with limits. Feet and hands get IK controls `foot.L.ik`,
`hand.R.ik` when the chain is a parent chain.

Creatures and props are keyable too: a joint with a side in its name (`Wing_L`, `LeftEar`)
becomes a sided alias (`wing.L`) paired with its other side, so `mirror` works; any other joint
is keyed on its raw `rx/ry/rz`. Name joints yourself with `--map Tail_01=tail,Wing_L=wing.L`
(a humanoid alias such as `upperArm.L` gives that role and its axes).

### Start from a model's clip instead

```sh
gameengine anim3d import assets/models/hero/hero.glb#Run --rig assets/anim3d/hero.rig3d.json --out assets/anim3d/run.anim3d.json [--tol-deg 0.3 --tol-m 0.002] [--joints hips,spine]
gameengine anim3d preview assets/anim3d/run.anim3d.json --compare assets/models/hero/hero.glb#Run --views side
```

Each joint's rotation is decomposed onto the rig's named axes (raw `rx/ry/rz` complete them) and
each channel keeps the fewest linear keys within tolerance. Read the report: keys before and after,
the largest error (degrees and metres, with joint and frame), joints not in the rig, and
`pastLimits`: channels the source takes past the rig's limits, kept as it moves. Widen the limit
or key the pose back (`pose`), as `lint` will warn. Then edit
it like any keyed clip. `sample`, `lint` and `preview` take `model.glb#Clip` directly, so compare
the two by numbers (`sample … --point hand.R:0,0.4,0` follows a sword tip). Too long or too many
joints is refused naming the limit: read at a lower `--fps`, pass `--joints`, or loosen the
tolerance.

A clip made for **another skeleton** (a clip pack, another character's moves) imports with
`--from-rig <the clip skeleton's .rig3d.json>`: joints pair by alias, each paired joint takes the
source's rotation relative to the source profile's reference pose onto the target's, and the
hips' travel scales by the ratio of hip heights. Give both skeletons a profile with the same
humanoid aliases first (`rig infer`, `--map` for names it cannot guess); the report's
`retarget` lists the aliases paired and those left at the reference pose.

### 2. Block the poses

```sh
F=assets/anim3d/cheer.anim3d.json
gameengine anim3d new $F --rig assets/anim3d/hero.rig3d.json --length 40 [--fps 30] [--no-loop] [--speed 1.2]
gameengine anim3d pose $F --frame 0  --set hips.my=0,upperArm.L.roll=10,lowerArm.L.bend=10
gameengine anim3d pose $F --frame 10 --set hips.my=-0.08,upperLeg.L.pitch=25,lowerLeg.L.bend=45 --ease inOutSine
gameengine anim3d pose $F --frame 18 --set upperArm.L.roll=155,head.pitch=-20 --ease outBack
gameengine anim3d mirror $F --from L [--offset 20]     # R follows L (a walk: offset = half the cycle)
gameengine anim3d loop-seam $F                          # looping channels end on their first key
```

Channels: a joint's named axes (degrees), `rx/ry/rz` (degrees about rest axes), `x/y/z` (metres
added to the rest position in the **parent's** frame), `mx/my/mz` (metres along the **model's**
axes: `hips.my` raises or lowers the body on any rig), `sx/sy/sz` (scale multiplied). A knee or
elbow has only `bend`: twist or splay it with its `rx/ry/rz` next to it. Key frame 0 of every
channel you key later, or it holds its first key from frame 0 (`lint` code `hold`). Rotations
interpolate as angles per channel: keys 270° apart sweep the long way (`lint` code `jump`). An ease
shapes the segment **out of** that key: `linear`, `step`, Penner names (`outQuad`, `inOutSine`,
`outBack`, …) or `anim3d key ease $F --channel c --frame f --bezier ox,oy,ix,iy`. Setting a new
value on an existing key without `--ease` keeps that key's ease. `anim3d retime $F --length n`
stretches every key to the new length; add `--keep` to leave keys on their frames (refused when one
would fall past the end).

Plant a foot or reach a point with IK instead of angles:

```sh
gameengine anim3d reach $F --frame 0 --control foot.L.ik --pos 0.1,0,0.05 --weight 1 [--swivel 15] [--bezier of,ox,oy,oz,if,ix,iy,iz]
```

`--swivel` (or `pose --set foot.L.ik.swivel=15`) turns the knee or elbow about the line from the
hip or shoulder to the target without moving the target. A rotation you have as a quaternion
(from a solver or another tool) keys whole on the joint's `q` channel through `apply`:
`{ "channel": "spine.q", "frame": 10, "value": [x, y, z, w], "ease": "inOutSine" }`, slerped
and mirrored, instead of its angles (the joint then takes no other rotation channel).

Many edits at once, each one load and one write (a refused edit leaves the file unchanged):

```sh
gameengine anim3d apply $F --keys edits.json     # [{ "channel": "head.yaw", "frame": 5, "value": 20, "ease": "outQuad" }, { "channel": "head.yaw", "frame": 20, "remove": true }]
gameengine anim3d scale $F --channel 'upperArm.L.*' --from 10 --to 20 --by 1.3   # bigger arm swing there
gameengine anim3d offset $F --channel hips.my --by -0.02                          # whole clip a little lower
gameengine anim3d smooth $F --channel 'spine.*' --passes 2                        # jitter out, ramps kept
gameengine anim3d mirror-copy $F                  # bake the mirror into R keys, then edit the sides apart
```

### 3. Check by numbers before looking

```sh
gameengine anim3d sample $F --frames 0,10,18 --joints head,lowerArm.L --json   # model-space positions + channel values
gameengine anim3d lint $F                                                        # limit, loop-pop, slide, reach, jump, hold, planted, empty
gameengine anim3d planted $F --contact foot.L --spans 0-12,30-40                  # where a foot is down (or --never)
gameengine anim3d planted $F --auto                                               # every contact's resting spans, from the poses
```

Ask concrete questions of `sample`: is the hand above the head at frame 18 (`y` greater)? does
the planted foot keep `y≈0`? `lint` exits 1 on warnings: an `outBack` overshooting a knee limit,
a pop at the loop seam, a contact sliding against the clip's `speed`. `slide` guesses a contact is
planted when it is near the lowest point; for a jump or a kick say where it really is down with
`anim3d planted`. `reach` checks only frames where the control's weight is 1.

### 4. Look

```sh
gameengine anim3d preview $F --frames 0,10,18,28 --views front,side --out /tmp/cheer.png   # contact sheet from the engine
gameengine anim3d preview $F --gif --frames 0,4,8,12,16,20,24,28,32,36 --out /tmp/cheer.gif
```

MCP `anim3d_preview` returns the PNG. Check silhouettes from two sides: a pose that reads from
the front can be broken from the side (knees forward of toes, a spine bent the wrong way).
`--backdrop white|grey|black|green|#rrggbb` drops the floor for a flat colour: a silhouette on
white reads most clearly, green keys out, the game's own background colour compares with a
capture. `--frames-out <dir>` also writes each shot untitled at `--size`
(`f0010-three-quarter.png`) for a frame-by-frame diff against a reference. `anim3d sample --outline` adds each joint's mesh hull points
(bind space, posed with the sample's `pos` and `axes`) when you need where the body is, not only
the bones (does the hand go through the head?).

### 5. Play it in the game

```json
{ "name": "Cheer", "motion": { "clip": "anim3d/cheer.anim3d.json#cheer" } }
```

The clip's `loop` is for authoring (`lint`, `preview`); under an Animator the **state's** `loop`
(default `true`) decides, so a one-shot is `{ "name": "Cheer", …, "loop": false }`. A state's
`speedParameter` names a `float` or `int` parameter its `speed` is multiplied by (Unity's speed parameter:
a walk or run cycle that follows the move speed, set with `setAnimParam` each step); a `bool` or `trigger`
there is refused. Transitions, `exitTime` (seconds, not a fraction) and triggers: skill `models-3d`,
"Animator controllers".

`animClipLength(entity, 'anim3d/cheer.anim3d.json#cheer')` is `length / fps`, and
`animState(entity, layer)` names the playing state. The clip plays on any skinned model whose
joint names match the rig's model. A game test (skill `testing`) on both JS engines proves the
controller plays it.

Layers (at most **4** per Animator) combine in order within their masks:

- an `additive` layer adds its clip's change **from its first frame**: start a hit or a breath
  on the pose it is relative to, or it offsets the body for the whole clip;
- a clip's IK controls are baked into it, so a layer above it can still move a planted foot:
  mask upper-body reactions to the upper body; `IkTarget` and `JointOffset` apply after all layers;
- `"motion": {}` is a state that plays nothing, the resting state of an override or additive
  layer between reactions.

### 6. Gameplay data: events, footsteps, root motion

```sh
gameengine anim3d event $F --frame 0 --name step.L      # an AnimatorEvent when the Animator passes frame 0 (each cycle)
gameengine anim3d event $F --frame 15 --remove          # drop the events at a frame (--name: only that one)
gameengine anim3d root-motion $F --joint hips           # the hips' ground travel and turn become root motion (--off)
gameengine anim3d foot-lock $F --on                     # planted IK feet stay where they touched down
```

- **Events** reach sim code as `AnimatorEvent { entity, layer, state, name }`:
  `for (const e of ctx.events.read(AnimatorEvent)) if (e.name === 'step.L') …`. A blend tree
  sends its heaviest clip's events; a state fading out sends none.
- **Footsteps for free:** every `planted` span sends `<contact>.down` and `<contact>.up`
  (`foot.L.down`), so mark the spans (`planted --auto`, then check them) instead of keying
  footstep events by hand.
- **Root motion:** a clip with `rootMotion` plays in place, and its travel moves an entity that has
  `RootMotion` (`scale`, `turn`) in the sim, along the way the entity faces, blended through
  cross-fades: no movement script to keep in step with the feet. Leave `RootMotion` off an entity
  a script moves itself. It moves `LocalTransform` directly (no physics sweep) and reads only the
  Animator's first layer.
- Both are sim state: prove them with a game test on both JS engines (skill `testing`);
  `samples/hero-stage` `tests/stride.test.ts` is the pattern.

## The editor

The **Animation 3D** mode is built in and **off by default**. Switch it on in the Mode picker's
**Library** (or `"editorModes": { "editor.animation3d": true }` in `project.gameengine.json`).
It shows the engine's render with the skeleton drawn over it (click a bone, drag move/rotate/scale
handles), a joint Hierarchy, the selection's channels (type or drag a value to key it), a dopesheet
(jump, drag keys, change a key's ease or delete it) and a graph editor. Every edit there is one of
the commands above, so you and a person can work on the same clip.

## Generated clips

A clip written by a script (a generator turning reference motion into keys) is fine when an op
cannot express the change: write it, then run `anim3d info` and `anim3d lint` and look at
`preview`, exactly as for keyed clips. Prefer whole-frame delays and linear resampling in a
generator: a cubic spline through few samples rounds off sharp accents (a run's arm pump).

## Rigging checklist (a character for keyed clips)

When you rig a model yourself (Blender, a generated mesh), these make `rig infer`, mirroring and
props work first time:

- **Root and hips:** one root bone at the origin pointing up (+Z in Blender), not deforming; the
  hips are its child. Everything else descends from the hips.
- **Names:** humanoid names with `.L`/`.R` (or `Left…`/`Right…`) on both sides, so `rig infer`
  pairs them and `mirror` works. Knees and elbows bend on one local axis. The reference
  humanoid's layout (`references/humanoid.md`: neck, shoulders, hands, feet and toes) is the
  set the base clips key; copy it when you build a skeleton.
- **Rest pose:** a T-pose or an A-pose, facing forward (+Z in glTF); `rig infer` gives the
  arms a `base` down to the reference pose.
- **Sockets:** a non-deforming bone per prop slot (hand, back), with +Y along the held item, for
  `BoneAttach` (skill `models-3d`).
- **Weights:** at most 4 per vertex, normalised; nothing weighted to the root or a socket.
- **Export:** glTF/GLB (or FBX) with the skin; `rig infer` then reads the result.

Automatic weights fail on generated meshes that are not manifold or have loose islands ("Bone
Heat Weighting: failed to find solution"). A recipe that works, in Blender: duplicate the mesh as
a proxy, voxel-remesh it (about 0.035 m), decimate to about 30%, keep only its largest connected
piece, parent it to the armature with automatic weights, then copy the weights to the real mesh
with a Data Transfer modifier (vertex groups, nearest face interpolated), limit to 4 per vertex
and normalise. Check the shoulders and hips by hand afterwards: the proxy's weights are coarse.

## Blender: a collaborator, not a requirement

Blender is free, and the **Blender MCP** server (free, open source) lets an agent drive it.
Use them together with this tool when the work is outside what keyed clips do well:

- dense motion: mocap cleanup, long hand-keyed performances, cloth or secondary motion baked to
  bones (export glTF/FBX and play it with `file#clip`, skill `models-3d`);
- props whose parts move as rigid pieces (a gate's wings, a lid, a lever): animate the objects'
  transforms and export glTF/GLB or FBX with no armature; the animated nodes become joints and an
  Animator plays the clips (skill `models-3d`, "Rigs and skinned meshes");
- modelling, rigging and skinning a new character, fixing weights or joint orientations;
- retargeting a clip between rigs with different joint names.

Check whether Blender and Blender MCP are already available (an `mcp__blender__*` tool, or
`blender --version`). **If they are not, ask the user whether they want them set up** before
installing anything; never install them unprompted. Keyed clips need neither. If the Blender
add-on reports an older protocol than the server, ask the user to reinstall the add-on from the
same server version and restart its server in Blender before relying on more than running code.

## Limits (v1)

No float curves or additive authoring yet. A clip moves to another humanoid by its aliases and
the reference pose: angles carry over, metres need scaling (`references/humanoid.md`). Clips: 36 000 frames, 32 768
keys, 512 tracks, 32 controls, 256 events and contact markers; an import reads at most 1 000 000 frames × joints; a clip past a
limit is refused with an error naming it. Animators: 4 layers.
