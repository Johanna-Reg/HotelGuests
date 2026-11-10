# The reference humanoid: rig, poses and base motions

A starting point for humanoid animation: a canonical skeleton (`builtin:humanoid`), its rig
profile, and eight base clips keyed on it (`humanoid/`, beside this file). Start a character's
idle, walk, run or jump from these instead of from an empty clip: the timing, curves and planted
feet are already right, and they play on your own humanoid once its profile points them at it.
Every clip here lints clean (`anim3d lint`) and is checked by the engine's tests to play the same
on a differently exported humanoid (Mixamo names, an A-pose, other bone frames).

```sh
R=.claude/skills/animation-3d-agent/references/humanoid
gameengine anim3d preview $R/walk.anim3d.json --frames 0,4,8,12,16,20,24,28 --views front,side   # look at one
gameengine anim3d sample $R/run.anim3d.json --frames 0,6 --joints foot.L,toe.L                    # read one
```

## The skeleton

`builtin:humanoid`: 1.8 m tall, Y up, facing +Z, so **+X is the character's left**. 22 joints,
named so `rig infer` maps every one but the root to a humanoid alias. Left limbs are light and
right limbs dark in renders, so a contact sheet shows which side leads.

| Alias | Joint | Parent | Rest position (m, model space) |
|---|---|---|---|
| — | `Root` | — | 0, 0, 0 (on the ground, not animated) |
| `hips` | `Hips` | Root | 0, 0.95, 0 |
| `spine` | `Spine` | Hips | 0, 1.05, 0 |
| `chest` | `Chest` | Spine | 0, 1.22, 0 |
| `neck` | `Neck` | Chest | 0, 1.44, 0 |
| `head` | `Head` | Neck | 0, 1.54, 0 |
| `shoulder.L` | `Shoulder.L` | Chest | 0.03, 1.39, 0 |
| `upperArm.L` | `UpperArm.L` | Shoulder.L | 0.18, 1.39, 0 |
| `lowerArm.L` | `LowerArm.L` | UpperArm.L | 0.46, 1.39, 0 |
| `hand.L` | `Hand.L` | LowerArm.L | 0.72, 1.39, 0 |
| `upperLeg.L` | `UpperLeg.L` | Hips | 0.1, 0.92, 0 |
| `lowerLeg.L` | `LowerLeg.L` | UpperLeg.L | 0.1, 0.5, 0 |
| `foot.L` | `Foot.L` | LowerLeg.L | 0.1, 0.08, 0 |
| `toe.L` | `Toes.L` | Foot.L | 0.1, 0.035, 0.13 |

The right side mirrors the left across X (`Shoulder.R` at −0.03 …). Thigh and shin are 0.42 m
each, so the leg is 0.84 m from hip joint to ankle.

**Naming.** The aliases above are the canonical names every clip keys; the model's own joint
names stay in the profile. `rig infer` maps Mixamo (`mixamorig:LeftUpLeg`), Unity Humanoid,
Rigify (`DEF-thigh.L`), Unreal (`thigh_l`), Biped (`Bip01 L Calf`) and `.L`/`.R` or
`Left…`/`Right…` names onto them. Spine joints count up: the first is `spine`, the second
`chest`, a third `upperChest`. Name a joint it cannot place with `--map Joint=alias`.

## Rest pose and the reference pose

The model **rests in a T-pose** (arms straight out along ±X, legs straight down). Clips do not
key from that: they key from the **reference pose**, standing straight, arms hanging at the sides
(palms in), legs straight, head forward. The profile's `base` turns one into the other:
`upperArm.L` has `"base": { "rz": -90 }`. `rig infer` writes a `base` for any upper arm more than
20° from hanging (a T-pose or an A-pose), so on every rig a clip's zero means "arms down": the
same keys move a T-pose, an A-pose and an arms-down model alike. A model that already rests with
its arms down gets no `base`.

## What the channels mean

Degrees, relative to the reference pose, the same numbers on either side (`.R` mirrors `.L`):

| Joint | `pitch` + | `yaw` + | `roll` + | other |
|---|---|---|---|---|
| `hips` | tips the body forward (legs back) | turns the body to its left | leans the top to its right (−X) | `my` up, `mx` left, `mz` forward (metres) |
| `spine`, `chest`, `neck` | bends forward | turns left | leans right | |
| `head` | nods down | turns left | tilts right | |
| `shoulder` | twists (rarely keyed) | draws the shoulder back | shrugs it up | |
| `upperArm` | raises the arm forward | turns it outward | raises it out to the side | |
| `lowerArm` | | | | `bend` 0–150: flexes the elbow |
| `hand` | flexes the wrist forward | turns it outward | tips it out | |
| `upperLeg` | swings the thigh forward | turns the knee out | swings the leg out | |
| `lowerLeg` | | | | `bend` 0–160: flexes the knee (shin back) |
| `foot` | lifts the toes | turns the toes out | tips the sole outward | |
| `toe` | bends the toes up | | | |

Chains add up: a foot is flat on the ground when `upperLeg.pitch − lowerLeg.bend + foot.pitch`
is 0 (with no hips pitch). IK controls `foot.L.ik` and `hand.L.ik` reach model-space points;
`foot.L`, `foot.R`, `toe.L`, `toe.R` are the contacts lint checks for sliding.

## The base motions

All at 30 fps. `speed` is the ground speed (m/s) of an in-place cycle; locomotion is in place, so
the game moves the entity (or add `anim3d root-motion` and a `RootMotion` component).

| Clip | Frames | Loop | What it shows |
|---|---|---|---|
| `idle` | 90 (3 s) | yes | Breathing and a slow weight shift over planted feet; nothing ever fully still |
| `walk` | 32 (1.07 s) | yes, `speed` 1.125 | Contact, down, passing, up; heel strike, toe roll-off; pelvis turn, tilt and shift; a forward lean the head takes back out; soft-elbowed arms against legs |
| `run` | 24 (0.8 s) | yes, `speed` 3 | A flight phase each step, a lean from the hips, heel folds high, a chest twist that drives arms pumping with elbows near 90° |
| `jump` | 44 | no | Anticipation crouch, push, a gravity arc up and down, contact, absorb, recover; events `takeoff`, `land` |
| `fall` | 24 | yes | The air loop between a jump and a landing: arms out, legs pedalling slowly |
| `land` | 22 | no | Contact on extended legs, a hard 3-frame absorb, a slow rise to the stance; event `land` |
| `punch` | 26 | no | Guard, a 6-frame wind-up, a 3-frame strike (event `hit`), a brief hold, a slow recovery |
| `hit` | 22 | no | A reaction: snap back in 2 frames, settle past neutral, ease home |

`walk`, `run` and `fall` key the left side and mirror it half a cycle later (`mirror`,
`offset` = length / 2); `jump` and `land` mirror it at offset 0. Every standing clip starts and
ends on the same stance (hips 1.2 cm down, knees soft, chest 8° forward with the neck taking it
back, arms 12° out, elbows 22°), so cross-fades
between them stay put.

### Key poses

**Walk** (left leg; the right is the same 16 frames later):

| Frame | Pose | Hips `my` | Left foot (ankle from hip) |
|---|---|---|---|
| 0 | contact: heel strikes ahead, toes up 16° | −0.045 | 0.30 m ahead |
| 4 | down: the leg takes the weight, foot flat | −0.068 (lowest) | 0.15 m ahead |
| 10 | passing: body over the leg | −0.015 (highest) | under the hip |
| 11–20 | heel lifts, toes stay planted and roll | | to 0.43 m behind |
| 20 | toe-off | −0.068 | |
| 23 | knee folds most, foot clears 0.26 m | | |
| 29 | the leg reaches forward | | |

Stride: the ankle travels 0.6 m back per step, 16 frames, so `speed` = 0.6 / (16 / 30). Pelvis:
yaw ±3.5° with the leg that swings forward, roll ±3° (dropping on the swinging side), `mx` ±2 cm
over the standing leg; chest yaw ±7° against it. Spine and chest lean 11° forward and dip into
each contact; the neck takes 5° back so the eyes look ahead. Arms hang 13° out with soft elbows
(22°–38°), swing −12° back to +14° forward two frames behind the legs, and turn in across the
body on the forward swing.

**Run** (left leg; the right is 12 frames later): ball of the foot lands 0.32 m ahead of the hip
at 1, planted and moving back at 3 m/s until toe-off at 7 with the leg straight behind (the
push); heel folds to 0.56 m at 13; thigh drives forward at 17; the foot reaches ahead at 20 and
pulls back before landing (an active landing). Hips lowest at 2 (−0.105), highest in flight at
10 (−0.02). The lean starts at the hips (pitch 7°) and adds 21° up the spine and chest, folding
more into each landing; neck and head take 23° back to look ahead. The chest twists ±16°
against the pelvis (±4°) and drives the arms; neck and head turn back against it. Arms pitch
−28° to +30° with `inOutQuad`, 14°–20° out, elbows 80°–96°.

**Jump:** 0 stand → 8 crouch (hips −0.30, hips pitch 16°, spine 26°, arms −50° back) → 11 push (legs straight,
toes pointed, arms through to 150°) → 19 apex (hips +0.42, legs tucked) → 27 legs reach down →
29 contact → 32 absorb (hips −0.17) → 44 stand. Feet planted 0–10 and 28–44.

**Punch:** 0 guard (both fists by the chin: arm pitch 38°, roll 22°, elbow 128°) → 6 wind-up
(hips and chest turn 5–6° right, the right elbow draws back) → 9 strike (turn 8° left, arm out at
88°, elbow straight) → 11 hold → 26 guard.

## Timing and curves: what makes these read

- **Timing is in frames, at the clip's fps.** Walk 16 frames a step, run 12, a punch's strike 3,
  a hit's snap 2. A motion that feels floaty is usually too many frames, not the wrong ease.
- **Ease per segment, not one ease everywhere.** `inOutSine` for breathing, sways and swings;
  `outQuad` out of a key into a settle (decelerating); `inQuad` into an impact (accelerating);
  `linear` for the fastest part of an action and for dense keys. An ease shapes the segment
  **out of** its key.
- **Gravity is quadratic.** A jump rises with `outQuad` (slowing to the apex) and falls with
  `inQuad` (speeding up): both halves the same length. Height and air time agree when
  height = 4.9 × t² (t = rise time in seconds): 8 frames up is about 0.35 m.
- **Anticipation, action, follow-through.** A crouch before a jump, a wind-up before a punch,
  an absorb after a landing, an overshoot past neutral after a hit. Make the anticipation slower
  than the action.
- **Fast in, slow out.** Hits and strikes take 2–3 frames; recoveries take 10–15.
- **Overlap.** Parts trail what drives them by 1–2 frames: arms behind the legs in a walk, the
  chest after the hips in a breath, the head last. Key the follower's extreme a frame or two later.
- **Counter-rotation.** The pelvis turns with the leg that swings forward, the chest turns
  against it; the head stays level and keeps looking ahead. In a run the chest twist is larger
  than the pelvis turn and swings the arms, so the shoulders do less of the work.
- **Lean, then look ahead.** A body in motion leans into it (11° in a walk, about 30° in a run,
  starting at the hips), and the neck and head take the lean back out so the eyes stay level.
  An upright torso over moving legs reads stiff.
- **Never twin.** Mirrored cycles are offset half a cycle; idles key the two arms a little apart.
- **Hips height follows the legs.** Lowest just after contact (the leg takes the weight),
  highest at passing; in a run, highest in flight.
- **Planted feet do not slide.** Work the leg angles out from where the foot is (two-bone IK
  maths, or key the IK control), mark `planted` spans, set `footLock` for the ankle, and let the
  toes carry the plant once the heel lifts. `anim3d lint` reports any slide over 2 cm.
- **Stride matches speed.** For an in-place cycle, `speed` = distance a planted foot travels back
  ÷ the frames it is planted × fps. Faster means longer strides and fewer frames, not only fewer
  frames.

Common faults in agent-made motion and the fix: everything on `inOutSine` (vary the eases), no
anticipation (add a counter-move first), knees bending the wrong way or past their limit (`lint`
`limit`, check `lowerLeg.bend` is positive), feet sliding or sinking (`lint` `slide`, `planted`,
`footLock`), arms through the body (`upperArm.roll` at least 6–8° at rest, check with
`sample --outline`), straight arms swinging from the shoulder (keep the elbows soft, 20°+ in a
walk, and let the arms hang 12° or more out), a torso that stays upright (lean, above), a run that looks round (whole-frame offsets and `linear` or `inOutQuad`
accents instead of a smooth spline through few keys).

## Use them on your character

1. Profile your model once: `gameengine anim3d rig infer assets/models/hero/hero.glb --out
   assets/anim3d/hero.rig3d.json`. Read the report: every alias the clips key should be mapped,
   and a T- or A-pose model should show a `base` note for its upper arms.
2. Copy the clips you want into the game: `cp $R/walk.anim3d.json assets/anim3d/hero/`.
3. Point each clip at your profile: set its `"rig"` to the profile's path relative to the clip
   (`"../hero.rig3d.json"`), then `gameengine anim3d info` and `gameengine anim3d lint` it.
4. A rig without a joint the clip keys (no `neck`, no `toe.L`): `info` names it. Map the joint
   with `rig infer --map`, or move its keys to the nearest joint you have (a `neck` turn onto
   `head`, with `anim3d apply`), delete the old track by hand and run `anim3d info` again.
5. Scale the metres to your character: angles carry over, metres do not. Measure the leg (`anim3d
   sample <clip> --frames 0 --joints upperLeg.L,foot.L`), and with k = your leg length / 0.84
   run `anim3d scale <clip> --channel hips.my --by k` (also `hips.mx` in `idle` and `walk`,
   `hips.mz` in `hit`) and multiply `speed` by k. `lint` then checks the feet again.
6. Look at it from two sides (`anim3d preview --views front,side`), then play it through an
   Animator (`file#clip`, SKILL.md step 5).

The clips are a base: keep their structure (key frames, eases, planted spans) and change the
amounts for your character's style (`anim3d scale` a channel, `anim3d retime` a cycle).
