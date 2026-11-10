---
name: camera
version: 1.3.0
tier: required
description: Cameras — read before adding, moving, aiming, framing, zooming, following, shaking or switching a Camera. The three kinds (2D, tilted ortho, perspective), what WorldView drives, CameraFollow, CameraShake, VirtualCamera, WorldViewFollow, `gameengine camera list|visible|frame|shot`, W_CAMERA_* codes.
---

# Cameras

**Covers:** which kind of camera you have, who drives each of its values, moving, following,
shaking and switching cameras, screen and world conversions, and proving what a camera shows.
Fitting a board to every screen shape is skill `screen-fit`.

**Start every camera task with `gameengine camera list`.** It prints each camera's kind, what
drives each value (`WorldView`, a rig, its own fields) and what it shows. Never reason about a
camera from the scene file alone.

## 1. The kind decides everything

| Kind (`camera list`) | `Camera` | Placed by | View size |
|---|---|---|---|
| `flat2d` (board, side view) | `Orthographic`, looking down -Z | `WorldView.center` | `WorldView.orthoSize`, `fit`, `designAspect` |
| `ortho3d` (isometric, top-down 3D) | `Orthographic`, tilted more than about 2.5° off -Z | `LocalTransform` | `WorldView.orthoSize`, `fit`, `designAspect` |
| `perspective` | `Perspective` | `LocalTransform` | `fovY` |

- `Camera.space` forces the kind (`Space2D`, `Space3D`); `Auto` uses the 2.5° rule. The scene view, particles, screen ops and `camera list` all use this one rule.
- **The first orthographic camera takes `orthoSize`, `fit`, `designAspect` (and in 2D its x/y) from the `WorldView` resource.** Its own fields are ignored; `validate` warns `W_CAMERA_DRIVEN` when they were edited. Change `WorldView` in a sim system instead.
- When several cameras could be the 3D one, perspective wins over tilted ortho, then the lowest `order`.
- A 2D camera looks down -Z, so a higher z is nearer. 2D draw order does not use the camera: it is sorting layer, then `order`, then y or z on `sortByY`/`sortByZ` layers (skill `atlasing`), the same under every camera. Unity's camera looks along +Z: negate z when porting Unity content onto a `sortByZ` layer.

## 2. Move it the right way

| You want | Do this | Never |
|---|---|---|
| Place or aim a camera | `LocalTransform` | `VisualOffset` to place it (`W_VISUAL_OFFSET`) |
| Move or zoom a 2D view | Write `WorldView` in a sim system (taps map through it) | Edit the camera's transform or `orthoSize` |
| Follow a target in 2D | Set the `WorldViewFollow` resource (`target`, `damping`, `deadZone`, `lookahead`, `bounded` with `boundsMin`/`boundsMax`); it runs in the sim, replays repeat it | `CameraFollow` on a flat camera (`W_CAMERA_FOLLOW_2D`) |
| Follow a target in 3D | `CameraFollow` + `VisualOffset` on the camera (`offset`, `damping`, `deadZone`, `lookahead`, `bounded`) | A sim system reading `Camera` |
| Mouse-look on desktop | `services.system.setMouseCapture({ enabled: true })` from UI code (needs the `system` plugin); then `PointerHover`/`PointerMove` positions accumulate raw motion, so turn by the difference between successive ones in a sim system. Clicks land at that virtual position. Releasing, or the window losing focus, jumps the pointer back to the real cursor in one move: cap the turn per step. In editor Play the game view locks on the next click and Escape unlocks (the game gets the Escape key). Web: the browser pointer lock, taken on the next click and again after Escape (the game gets the Escape key). Answers `captured: false` in tests and phones: keep a drag fallback | Reading the OS cursor, or assuming capture held after a focus change |
| Shake | `CameraShake` + `VisualOffset` on the camera, then `shakeCamera(camera, 0.5)` from presentation. `style`: `Noise` (default, a smooth wander) or `Jitter` (a new random jolt along the world axes every frame, the hard hit of many mobile games); `falloff`: `Squared` (default, trauma²) or `Linear` (keeps more of a small shake) | Writing shake into `LocalTransform` |
| Cut or blend between shots | Entities with `VirtualCamera` (`priority`, `blend`, `fovY`) and a `LocalTransform`; the highest priority that is not Hidden or Disabled drives the camera, which needs `VisualOffset`. The shot is where the source is *drawn*, its own `VisualOffset` included, so a first-person game turns the view from presentation state (a `LateUpdate` write to the source's `VisualOffset.rotation`) ahead of the sim; the camera itself and what is under it use their sim pose | Copying poses into the camera every frame |

- Rigs (`CameraFollow`, `CameraShake`, `VirtualCamera`) are presentation: never hashed, they hold still while the game is paused and in the editor's edit world, and they need `VisualOffset` on the camera (`W_CAMERA_RIG` when it is missing; at run time the rig does nothing).
- Sim code never reads a camera or a rig. Gameplay that depends on the view uses `WorldView`.

## 3. Several cameras

- They draw in ascending `order`; a camera on top needs `clear: false` (`W_CAMERA_ORDER`: two full-screen cameras at the same order, one hiding the other). `viewport` gives split screen or an inset.
- An orthographic camera draws between `near` (-100) and `far` (100) along its view axis: cover a tilted scene's depth.
- Limits: `layerMask` filters 3D meshes only (2D draws in every camera); only the first camera with a `postProfile` gets post; only the primary camera's `renderScale` counts. MSAA is `render.tiers.<tier>.msaa` (`Camera.msaa` was removed: `E_RETIRED_API`).
- A scene with no camera draws through an implicit flat 2D camera, so its 3D meshes do not show (`W_CAMERA_NONE`).

## 4. Screen and world (presentation only; they throw in sim)

- 3D: `worldToScreen(p, w, h)` and `screenToWorld(x, y, w, h, { planeY })` go through the primary 3D camera, rigs included.
- 2D: `worldToUi(x, y)` / `uiToWorld(x, y)` go through `WorldView`. Taps already reach the sim in world units (`PointerState`, `Tap`); do not convert them again.
- 3D taps: a controller turns the tap into a ground point with `screenToWorld` and sends it to the sim as an input event.

## 5. Prove it before handing back

1. `gameengine camera list` — the kinds and drivers are what you meant.
2. `gameengine camera visible <entity…>` — the key objects are on screen; `camera frame <entity…> [--write]` computes a framing that fits them on the slim and wide device.
3. `gameengine camera shot [--camera <c>]` (or `gameengine screenshot --camera <c>`) — look at the slim and the wide shot. `--no-ui` on either draws the world alone, without the game UI and overlays (framing a shot under a full-screen HUD).
4. A game test: `drawnTransform(camera)` for rigs, a `worldToScreen` → `screenToWorld` round trip for conversions (see `samples/orbit-garden/tests/camera-rigs.test.ts`).
5. `gameengine check`: no `W_CAMERA_*` or `W_VISUAL_OFFSET` left that you did not mean.

In a game test, judge what the player sees, not how it is built: `worldToUi(0, 0)` moves while a 2D view
shakes or follows, whichever rig does it, and is back at rest after; for framing, project the play area's
corners with `worldToScreen` under several `input.view(w, h, scale)` sizes (a 22:9 phone, a 4:3 tablet) and
check every corner is on screen. Test taps (`tap`, `input.worldToScreen`) follow the camera's `VisualOffset`
as a player's tap does, so a tap during a shake lands off by the shake.

In the editor: select a camera to see its frustum and a preview of what it shows; **Align with
view** (Ctrl/⌘+Shift+F) moves it to the scene view (not a flat 2D camera: set `WorldView`),
**Align view to selected** (Alt+Shift+F) looks through it, **F** frames the selection. The
Inspector greys out the fields `WorldView` or a rig drives.
