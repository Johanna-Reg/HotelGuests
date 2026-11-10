# Animation 2D ops reference (`gameengine anim2d`, MCP `anim2d_*`)

Every op below, its flags and what it does. The workflow is in `SKILL.md`; costs are in
`performance.md`; the editor's way of doing the same is in `editor.md`. `gameengine anim2d`
without arguments prints the usage line of every op.

## Values are relative to the setup pose

As in the format (and Spine): `--rotate 15` means 15° **added** to the bone's setup rotation,
`--x/--y` add skeleton pixels, `--scale 1.2` or `--scale 1.2,0.9` multiplies. A key only
changes the channels you give; a missing axis keeps its animated value at that time.
Skeleton space is +x right, +y up, pixels.

## The ops

```sh
F=assets/rig/hero.skeleton2d.json
gameengine anim2d new $F [--images rig/hero/]              # an empty rig (root bone, default skin) and its images folder; refuses an existing file
gameengine skel2d info $F                                   # bones, slots, animations, durations
gameengine anim2d pose-bone $F --anim walk --time 0.2 --bone thighL --rotate 25 [--ease smooth]
gameengine anim2d pose-chain $F --bones upperArmL,forearmL --target 40,90 --anim reach --time 0.3   # IK: the tip reaches the point
gameengine anim2d key add    $F --anim walk --bone hip --timeline rotate --time 0.3 [--ease ease-in]   # holds the current value
gameengine anim2d key move   $F --anim walk --bone hip [--timeline rotate] --time 0.3 --to 0.35
gameengine anim2d key ease   $F --anim walk --bone hip --time 0.35 --ease ease-in-out
gameengine anim2d key remove $F --anim walk --slot eye --time 0.8                   # all timelines at that time
gameengine anim2d retime     $F --anim attack --duration 0.45        # or --scale 1.5; events and deform move too
gameengine anim2d mirror     $F --anim walk --axis none --as walk-b  # swap L/R bones only
gameengine anim2d mirror     $F --anim wave --axis x --as wave-left  # also negate rotation and x
gameengine anim2d blend      $F --anim walk --with run --weight 0.5 --as jog
gameengine anim2d variation  $F --anim idle --seed 3 --amount 0.2 --as idle-b
gameengine anim2d attach-image $F --image hat --bone head --x 0 --y 30   # new slot on head showing hat.png
gameengine anim2d attach-image $F --image eye_closed --slot eye            # another attachment in a slot
gameengine import psd art/kid.psd --dry-run --json   # a rig from a layered PSD with Spine's tags: check what each layer becomes,
gameengine import psd art/kid.psd                    # then write it (skill spine-import lists the tags)
# The editor timeline's edits (keys are row@time; rows: bone:hip:rotate, slot:eye:attachment,
# deform:skin:slot:attachment, ik:name, transform:name, drawOrder, events:name):
gameengine anim2d keys move      $F --anim walk --keys bone:hip:rotate@0.4,bone:hip:translate@0.4 --by 0.1   # snaps to 30 fps (--fps 0: no snap)
gameengine anim2d keys duplicate $F --anim walk --rows bone:tail1:rotate --by 0.8   # copies later; originals stay
gameengine anim2d keys ripple    $F --anim walk --keys bone:hip:rotate@0.4 --by 0.1   # later keys (and the duration) follow
gameengine anim2d keys offset    $F --anim walk --rows bone:tail1:rotate --by 0.1     # wraps around the loop, keeps it closed
gameengine anim2d keys scale     $F --anim walk --all --pivot 0 --factor 1.25         # negative reverses
gameengine anim2d keys delete    $F --anim walk --rows slot:eye:attachment
gameengine anim2d cleanup        $F --anim walk [--keep-setup]   # drops keys that change no pose
gameengine anim2d curve          $F --anim walk --keys bone:hip:rotate@0.4 --preset automatic   # flat|linear|stepped|easeIn|easeOut|bounce
gameengine anim2d event-add      $F --name hit [--int 0 --float 0 --string "" --audio sfx/hit --volume 1 --balance 0]   # the rig's events table: defaults keys start from
gameengine anim2d event-set      $F --name hit [--string heavy] [--rename impact]   # --rename renames its keys too
gameengine anim2d event-remove   $F --name hit                                      # and every key of it
gameengine anim2d event-key      $F --anim walk --event footstep --time 0.4 [--int 2 --string left --volume 0.8 --balance -0.5]
gameengine anim2d draw-order     $F --anim attack --time 0.2 --order body,armBack,head,armFront   # every slot, first drawn first
gameengine anim2d duration       $F --anim walk --seconds 0.8   # or --clear
gameengine anim2d mix            $F --default 0.1 | --from idle --to walk --duration 0.25 | --from idle --to walk --remove
gameengine anim2d mesh-from-image $F --slot cape --attachment cape [--detail 0.5 --concavity 0.5 --padding 2 --generate 1]
gameengine anim2d bind           $F --slot cape --attachment cape --bones cape1,cape2,cape3 [--nearest]
gameengine anim2d auto-weights   $F --slot cape --attachment cape [--bones cape1,cape2]
gameengine anim2d prune-weights  $F --slot cape --attachment cape [--max 4] [--threshold 0.05]
gameengine anim2d smooth-weights $F --slot cape --attachment cape [--iterations 2] [--strength 0.5]
# Constraints and skins (the editor's constraint tools and Skins view):
gameengine anim2d constraint-add $F --kind ik --bones thighL,shinL --target footTargetL [--set mix=1,bendPositive=false]
gameengine anim2d constraint-add $F --kind ik --bones handR --target-at 40,90 [--target-name aimR]   # a new target bone there
gameengine anim2d constraint-add $F --kind transform --bones shoulderL,shoulderR --target chest --set mixRotate=0.5,local=true
gameengine anim2d constraint-set $F --name legL,legR --set softness=4,stretch=true   # several of one kind at once
gameengine anim2d constraint-set $F --name shoulders --match                         # offsets that keep the first bone in place
gameengine anim2d constraint-order $F [--move legL --to 0 | --order a,b,c | --reset]  # prints the solve order
gameengine anim2d constraint-key $F --anim walk --name legL --time 0.4 --set mix=0   # an IK / transform key
gameengine anim2d constraint-add $F --kind path --bones rope1,rope2,rope3 --slot rope [--set rotateMode=chain,spacingMode=percent]
gameengine anim2d constraint-add $F --kind path --bones tail1,tail2 --path-points 0,0;40,20;80,0   # a new path on a new slot
gameengine anim2d constraint-add $F --kind physics --bones hair1,hair2 --set inertia=0.6,gravity=30   # one per bone
gameengine anim2d constraint-add $F --kind slider --animation smile [--bone dial --set property=rotate,scale=0.01]
gameengine anim2d constraint-set $F --name grip --map rotate:x:scale=2 [--unmap y:y]       # Spine 4.3 property mapping
gameengine anim2d constraint-key $F --anim walk --name rope --time 0.5 --set position=0.4  # one value's timeline
gameengine anim2d constraint-key $F --anim jump --name '' --time 0.2 --reset              # physics reset key (every constraint)
gameengine anim2d constraint-remove $F --name shoulders
gameengine anim2d skin-add-placeholder $F --slot hat --name hat [--skins red,blue] [--link] [--prefix]
gameengine anim2d skin-bones       $F --skin pirate --add hatBone,feather   # or --remove
gameengine anim2d skin-constraints $F --skin pirate --add featherIk
```

- Easing presets (`--ease` on pose-bone and key): `linear`, `stepped`, `ease-in`, `ease-out`,
  `ease-in-out`, `smooth`. A curve shapes the segment **from** that key to the next.
- `pose-bone` and `pose-chain` create the animation when it does not exist. `pose-chain` bends a
  chain (parent first) so its last bone's tip reaches a point in skeleton space (y up), the
  editor's Pose-tool IK drag; it prints the rotations, where the tip landed and the distance left
  (an unreachable point straightens the chain at it). Without `--anim` it edits the setup pose.
- `curve` presets write the format's bezier handles (normalised, or `{ "dy": … }` between equal
  values) exactly as the engine evaluates them: `automatic` follows the neighbours' slope and is
  flat at the first and last key; `easeOut` leaves the key slowly, `easeIn` arrives slowly.
- `cleanup` keeps rows at the setup pose with `--keep-setup` (a layered animation needs them to
  override the tracks below). The mix table sets the cross-fade a track change uses without `mix`.
- Sides pair by name: `left`/`right` (any case), `arm_l`/`arm_r`, `arm.L`/`arm.R`, `L_arm`,
  `footL`/`footR`. Name new bones that way so `mirror` works. Mirroring is exact when the setup
  pose is symmetric.
- `blend` and `variation` write a **new** animation (`--as`); `blend` bakes bone channels at 30
  fps and drops keys a straight line reproduces; `variation` scales each timeline's amplitude by
  a factor from the seed (same seed, same result).
- `attach-image` is the editor Tree's image drop: the PNG (under the skeleton's `images` folder,
  `--image` without the extension) becomes a region sized to it. On `--bone` a new slot drawn in
  front shows it at `--x`/`--y` in the bone's space; on `--slot` it joins that slot (in `--skin`,
  default `default`) placed like the attachment shown, and the slot shows it.

- Meshes and weights (the editor's Edit Mesh and Weights view): `mesh-from-image` turns a region
  into a mesh (or re-hulls a mesh) traced from its image's alpha, then `--generate` runs add
  interior vertices; `bind` weights a mesh (or box, clipping, path) to bones with automatic
  weights from its topology (geodesic over the triangles, so a gap in the mesh stops weight
  leaking across it); `auto-weights` recomputes them over the bound bones; `prune-weights` keeps
  at most `--max` bones per vertex (default 4: **the engine keeps only 4 influences**, so prune
  anything you hand-weighted to more); `smooth-weights` diffuses along the mesh edges. Every op
  keeps the vertices where they are and carries existing deform keys over to the new layout.
  MCP: `anim2d_mesh_from_image`, `anim2d_weights` (action `bind|auto|prune|smooth`).
- Deform keys (`deform` in the format) hold offsets from the setup vertices; for a weighted mesh
  one x, y per weight entry, in that entry's bone space. Prefer bones and weights over deform
  keys: they mix and stay small.
- Constraints: IK takes one bone, or a parent and its child; the target may not be one of the
  bones or under them (the reason is printed). `--set` names fields as the format does: IK `mix`
  (0..1), `bendPositive`, `softness`, `compress`, `stretch`, `uniform`; transform offsets
  `rotation`, `x`, `y`, `scaleX`, `scaleY`, `shearY`, mixes `mixRotate` … `mixShearY`, `local`,
  `relative` (4.0–4.2), or 4.3's property mapping (`--map from:to:offset=…,max=…,scale=…`, then
  `localSource`, `localTarget`, `additive`, `clamp`); IK `scaleY=none|uniform|volume` (4.3; it
  replaces `uniform`). Path: `positionMode` `percent|fixed`, `spacingMode`
  `length|fixed|percent|proportional`, `rotateMode` `tangent|chain|chainScale`, `rotation`,
  `position`, `spacing`, `mixRotate`, `mixX`, `mixY`; the slot must hold a path attachment off the
  constrained bones. Physics: influences `x`, `y`, `rotate`, `scaleX`, `shearX` (0..1; a new one
  rotates), `scaleY` mode, `limit`, `fps`, keyed `inertia`, `strength`, `damping` (0..1), `mass`
  (> 0), `wind`, `gravity`, `mix`, each with a `*Global` flag (then keys go to the skeleton-wide
  timeline, name `""`); `constraint-set` prints Spine's warnings (nothing moved, a bone without
  length, a skin bone outside a skin). Physics is presentation only: the sim and `anim2d lint`
  see the pose without it. Slider: `animation`, `additive`, `loop`, keyed `time` and `mix`, or a
  driving `--bone` with `property`, `from`, `to`, `scale`, `max`, `local` (`--bone none` fixes it
  again). Constraints apply in one **solve order** (IK, transform, path, physics, slider unless
  `order` says otherwise); every edit prints it. `constraint-key --anim walk --name legL --time
  0.4 --set mix=0` keys a constraint as the editor's Animate key does (IK: mix, softness, bend,
  compress, stretch in one key; transform: the mixes; path, physics and slider: only the values
  given, each in its own timeline); `--reset` keys a physics reset.
- Skins: a **placeholder** is one attachment name with an attachment in every skin (default
  every skin but `default`), copied from the one the slot shows (`--from` another), meshes
  optionally linked (`--link`, they share vertices), images optionally `<skin>/<image>`
  (`--prefix`); the slot shows it. Skin bones and constraints are active only while a skin
  listing them is active; ops print `skinIssues` (an attachment using a skin bone its skin does
  not list never shows there) — fix those before shipping.

## Check it

```sh
gameengine anim2d lint $F [--anim walk] [--loop a,b | --once c] [--ground-speed walk=90]
```

| Rule | Meaning | Fix |
|---|---|---|
| `unknown-reference` (error) | a timeline, deform, event or attachment key names something the rig lacks | rename the key's target or add the definition |
| `key-outside-duration` | a key after the animation's `duration` (never reached when looping) or before 0 | `key move` it inside, or `retime` |
| `loop-seam` | a looping animation's pose at its end differs from its start | make the last key equal the first (`key add` at the end, then `pose-bone` to the start values) |
| `foot-slide` | a `foot`/`toe`/`heel` bone at its lowest height (planted) moves sideways against the ground speed | see the recipe below |
| `mesh-fold` | a mesh triangle's winding flips versus the setup pose (the skin turns inside out) | reduce the bend, or add bones/weights |

Everything the editor's Problems view shows, in one list (the lint above plus the engine's refusal
and load warnings, weights over 4 bones, images missing or unused under the skeleton's `images`
folder, empty slots, a setup attachment no skin has, skin scoping, constraints that cannot solve,
and the cost findings of `anim2d metrics` for `--device`, default `phone`: `rig-cost` per expensive
feature with what to use instead, `rig-budget` when the rig costs more than a rig at the class's
budget):

```sh
gameengine anim2d problems $F [--device phone-low|phone|tablet|desktop|none]   # errors, warnings, notes; exit 1 on errors
gameengine anim2d problems $F --fix    # applies the safe fixes: removes unknown references, extends a
                                       # duration over late keys, prunes weights to 4, clears a missing
                                       # setup attachment, sets/clears skin-required flags, adds a bone to its skin
```

What the rig costs on a device class (skill reference `performance.md`): the editor's Metrics view
counts plus an estimate per instance per frame from the engine's measured feature costs, the
costliest features and what to use instead. `problems` lists the same findings (`--device`,
default `phone`; `none` leaves them out):

```sh
gameengine anim2d metrics $F --device phone-low [--anim walk] [--tracks 2] [--fps 60] [--json]
gameengine anim2d problems $F --device phone-low
```

Animations named like `idle`, `walk`, `run`, `loop`, `cycle`, `fly`, `hover` count as looping;
override with `--loop`/`--once`. Bone positions come from the engine's own evaluator (built to
wasm, no host needed; IK and transform constraints applied). A file the engine refuses only for
unknown references is still posed without them; any other refusal gives `poseSource: "none"` and a
`poseError`, and the pose rules are skipped.

## See it

```sh
gameengine skel2d preview $F --anim walk --times 0,0.1,0.2,0.3,0.4 --out walk.png   # contact sheet
gameengine skel2d preview $F --anim walk --gif --out walk.gif                        # 24 frames
gameengine skel2d preview $F --controller rig/hero.animctrl.json --params walking=true --steps 90 --every 15
gameengine skel2d preview $F --setup --view 0,60,200 --background '#202024'   # setup pose, fixed framing (cx,cy,height px) and clear colour
# Export (Spine's GIF / PNG / video export; the editor's Ctrl+E runs the same):
gameengine skel2d preview $F --anim walk --format gif --fps 30 --crop --scale 1 --background transparent --loops 0 --out exports/walk.gif
gameengine skel2d preview $F --anim walk --format png --fps 30 --size 512 --out exports/walk      # walk.0000.png …
gameengine skel2d preview $F --anim walk --format webm --fps 30 --out exports/walk.webm           # needs ffmpeg
```

The engine renders the rig alone (a private headless session, your images, GPU skinning, the
chosen `--skin`), framed on the poses, each frame labelled with its time. None of your game's code
runs in it (no views, systems or WorldView), so a real project previews as cleanly as a sample: no
scratch project needed. Time mode is exact: it sets the track time, so `t=0.4` is the pose at 0.4 s.
Controller mode steps the Animator with your parameters. Open the PNG and look: judge
silhouettes, contact frames and arcs, not numbers alone. Default: 6 frames over the animation.
`--fps n` shoots every frame of the animation (a loop leaves out its end, which is its start; add
`--loop` to a PNG sequence for the same), `--crop` frames the poses' bounds at their own aspect,
`--scale s` sizes frames at s pixels per skeleton pixel, `transparent` keeps alpha (GIF: under half
alpha is transparent).

## Recipe: make a walk cycle

1. Pick the length (0.8 s is a relaxed walk) and the two contact poses at 0 and half.
2. Contact at 0: `pose-bone … --time 0 --bone thighL --rotate 25`, `--bone thighR --rotate -20`,
   `--bone hip --y 0`. Passing pose at a quarter: legs near 0°, `--bone hip --y 4` (the body rises).
3. Second half, legs swapped: contact at half the length (`thighL --rotate -20`, `thighR --rotate 25`),
   passing at three quarters (`hip --y 4`). A rig with sided names can instead get the other-leg
   version of a finished cycle from `mirror --axis none --as walk-b`.
4. Close the loop: the last key equals the first (`anim2d lint` reports `loop-seam` otherwise).
5. Ease: `key ease … --ease smooth` on the hip keys; `stepped` never on a walk.
6. `skel2d preview --anim walk --gif`, look, adjust one bone at a time.

## Recipe: fix a foot slide

1. `anim2d lint $F --anim walk --ground-speed walk=<px/s>`: how fast the game moves the character,
   in skeleton pixels per second = world units per second ÷ `Skeleton2D.scale` (scale 0 means
   1 / `render.pixelsPerUnit`, so 0.9 units/s at 100 px/unit is 90 px/s).
2. The issue gives the planted span (`from`, `to`), the slide in px and the foot's own speed there
   (`impliedGroundSpeed`). If that speed is steady but different, either change the game's speed
   to match, or `retime` the walk by `implied / game speed`.
3. If the foot stops while still planted (a `stepped` key or a hold), move that key to where the
   foot lifts (`key move`), or lift the foot (`pose-bone --y`) there.
4. Lint again until `foot-slide` is gone; preview the contact frames.

## Recipe: retime to match an event

A hit must land on frame 18 at 60 fps (0.3 s), and the event key `hit` sits at 0.36 s of a 0.6 s
attack: `anim2d retime $F --anim attack --scale 0.8333` (0.36 × 0.8333 = 0.3; everything moves
together: keys, events, deform). Check with `gameengine skel2d info $F` (event times) and
`skel2d preview --anim attack --times 0.25,0.3,0.35`. To move only the event, retime is wrong:
`anim2d keys move $F --anim attack --keys events:hit@0.36 --by -0.06`.

## Limits

- No op adds, renames, reparents or deletes setup-pose bones (only `pose-chain` without `--anim`
  rotates them) or draws path vertices: use the editor's rig modes or Spine for those (constraints,
  meshes and weights have their ops above), then animate here.
- Curves are presets; a custom bezier needs a direct edit of the key's `curve`.
- `blend` bakes bone channels (keys every 1/30 s, reduced); slot, deform and event keys come from
  the heavier source.
