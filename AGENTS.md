# EIGuests — working notes for agents

A Game Engine game: gameplay is TypeScript on a deterministic ECS, UI is UI documents placed by thin MVC
views, the engine is Rust. Everything goes through the `gameengine` CLI (`--json` for machine output).

**Read `PROJECT.md` first**: the game's own notes, and they win over this file. This file, `CLAUDE.md` and
the skills come from the engine and are replaced when it updates. Never write to `PROJECT.md` on your own (no
notes, logs, summaries or decisions); change it only when a user asks, and then only with what they asked for.

## Finding commands, packages and skills

Look a capability up before guessing flags, hand-writing engine files or writing code the engine already has:

- `gameengine help` lists every command with its options; `gameengine help <command>` shows one in full.
- `gameengine cmd --list` and `gameengine query --list` list the editor's scene commands and queries; `gameengine tool list` lists the project's own tools.
- An SDK, backend, analytics, ads or other shared dependency: `gameengine package list` names the built-ins (switch one on with `package on <name>`), `package search <text>` searches the registry once signed in (skill `packages`). Then run `gameengine skills update` and read the package's own skill: it says how to configure and start it.
- `gameengine skills list` names every installed skill, including the ones the session's list left out.
- Someone asks to be shown where something is ("show me…", "where do I find/change…": switch the mode and spotlight it first, then reply), how to work with any part of the engine ("what about particles?", "how do we…") or wants a tutorial: skill `engine-tutorial`, as well as any skill for that area (the person picks in this chat: MCP `tutorial_pick`, or `gameengine tutorial list --for "<their question>"`).

## Platforms

`platforms` in `project.gameengine.json` (absent means `mobile`); cater to each one listed:

- **mobile**: low-end phone budgets, 9:22 to 3:4 screens inside the safe area (skill `screen-fit`), touch.
- **desktop**: resizable windows up to 21:9, keyboard and mouse.
- **web**: export a static WebGPU game with `gameengine build web` (skill `ship-web`, ADR 0133); serve it over HTTPS or localhost. Check real browser rendering, input and tab lifecycle as well as wasm hash parity (`gameengine test --js v8,web`).

## The loop

1. Change code or content.
2. `gameengine test`: logic tests (T0), fast and deterministic; `--tier t0,t1` adds render goldens.
3. `gameengine run --headless` starts a session to inspect: `world query <Comp>`, `screenshot`, `view render <View>`. Stop each session you start when done (`gameengine session stop --session <pid>`).
4. Prove behaviour with a test or a replay, not by reading code.
5. `gameengine check` before you hand back: engine binaries current, typecheck, `validate`, a desktop cook and a smoke run of the cooked game (`--tests` adds the game tests on V8 and Hermes). Fix what it reports.

The user may have the project open in the editor: it follows the files on disk and hot reloads, so never ask
for a restart unless the engine's own binaries changed. Keep every save compiling, run `gameengine gen` after
`schema/*.schema.ts` edits, and don't run `test`, `check` or `run` while the editor builds native systems
(skill `work-loop`, "The live project").

## Rules

- Sim code is deterministic: `ctx.rng`, `ctx.dt`, `ctx.step`. Never `Math.random`, `Date` or timers; real time comes in as the recorded `WallClock` resource (skill `meta-economy`). Never branch sim code on `DEV`.
- State lives in components and resources (`schema/*.schema.ts`, then `gameengine gen`), never in module variables.
- Input → sim → presentation, never back: sim systems never read cameras, UI, real time or `sim: false` state (skill `sim-boundaries`).
- UI: new screens, popups and widgets are UI documents (`ui/**/*.ui.json`), built and changed only with `gameengine ui doc` (MCP `ui_doc_*`), never by writing the JSON (skill `ui-documents`). A controller fills a view's model and the view raises intents; UI never reads the world.
- **Touch feel: read skill `touch-input` before building or tuning any tap, swipe, drag or pinch control.** Players judge a phone game by how its touch feels. Act as the finger crosses the threshold, not when it lifts (`Swipe` fires mid-gesture by default). Fling with `Drag` `End`'s `velocity`, and keep dragged pieces under the finger with `teleport(e)` each step. Tune thresholds in `input.json` `gestures`, never with hand-made timers.
- **Cameras: read skill `camera` before any camera change.** Start with `gameengine camera list` (each camera's kind and what drives it). The first orthographic camera's size and 2D position come from `WorldView`, not its own fields; follow, shake and shot switches are `CameraFollow`, `CameraShake`, `VirtualCamera` (3D, on the camera's `VisualOffset`) or `WorldViewFollow` (2D, in the sim), never hand-written camera code. Prove it with `gameengine camera shot`.
- **Porting 2D content from Unity: flip z.** Unity's 2D camera looks along +Z, the engine's along −Z, so negate the z of positions you copy from Unity 2D scenes and prefabs; equal-order sprites that Unity drew by depth then keep that order on a `sortByZ` sorting layer (higher z in front; skill `atlasing`). 3D scenes flip x instead, with rotations mirrored (skill `models-3d`); FBX and glTF imports are converted for you.
- Every view and gameplay screen fits every screen shape its platforms have: the board stays whole and clear of the HUD and safe area, views never clip. Check the extremes before handing back (skill `screen-fit`).
- Scenes live in `scenes/`, prefabs in `prefabs/` (other paths fail with `E_DOCUMENT_PATH`). Order a scene's `entities` for a person, as the editor's Hierarchy shows file order: cameras and lights, then the level, gameplay objects and effects, grouped under named parents (`Environment`, `Enemies`); add an entity next to its siblings.
- Debug and QA shortcuts are cheats: `defineCheat` in a `src/**/*.cheats.ts` that nothing imports; release builds leave them out (skill `cheats`).
- A platform service needs its plugin enabled (`validate` fails with `E_PLUGIN`; skill `platform-services`).

## Performance comes first

The game must hold its frame rate on a **phone-low** device (about 3 GB RAM, a Mali-G52-class GPU, 30 fps:
two sim steps plus presentation in 33 ms) within its CPU, GPU, memory and thermal budgets. A design that is
slow at the scale the game needs is wrong even when it works. Before anything heavy, read the matching skill,
measure before and after (`gameengine call perf.stats`, `render.stats`, `profile.markers`), and put the numbers
in your summary. Before shipping, measure a probe build on such a phone (`gameengine device perf`), or at
least run `gameengine test --memory-class phone-low`.

- Sim systems declare when they run (`runIf`, `runOn`, `{ changed: T }`; `skipUnchanged` only for pure functions of what they declare) and update what changed, never the whole board or model.
- Idle screens don't animate continuously: menus and waiting boards animate in short bursts, then hold still.
- Heavy content gets a cheaper version for phone-low in its `overrides` block, never a sim branch.

## Read before

The session's skill list can be cut short, so read these whatever it shows (`.claude/skills/<name>/SKILL.md`,
or `.agents/skills/<name>/SKILL.md` for Codex; `gameengine skills list` names them all):

| Doing | Skill |
|---|---|
| Any task | `work-loop` (commands for each step, the live editor) |
| Sim code | `determinism`, `sim-boundaries`, `ecs-systems` (run conditions, events, change filters) |
| Behaviour or a bug fix | `testing` |
| Any touch control: taps, swipes, drags, pinches, flings | `touch-input` (feel, velocity, `input.json` `gestures`) |
| An interactive widget or MCP App inside chat | `mcp-widgets` (chat controls and live previews) |
| A custom editor tool, panel or mode for designers | `editor-widgets` (every tool a dockable widget in `editor/widgets/`), then `editor-modes` |
| A game screen, popup, button or widget | `ui-documents`, then `screen-fit` for boards, HUDs and views |
| Adding, moving, framing, following, shaking or switching a camera | `camera` (start with `gameengine camera list`) |
| Anything heavy, and before handing it back | `mobile-performance-review` (budgets per device class, the checklist) |
| A hot or over-budget system | `perf-to-rust` (fix it in TypeScript first; prove the hash unchanged with `gameengine test --hash-trace`) |
| Short-lived objects, levels, loading, memory | `asset-memory` (pools, asset groups, budgets) |
| Sprites, UI art, draw calls | `atlasing` |
| A cheaper look per device | `device-tiers` |
| Effects, materials, many 3D instances | `vfx`, `vfx-materials`, `models-3d` |
| Many props, rigs or effects, draw distance, things off screen | `culling` (`render.culling` per device and platform, `DrawDistance`, `Occluder`) |
| Proximity, triggers, big worlds | `overlap-queries`, `open-world-streaming` |
| Sounds and music | `audio` |
| A new screen, material, effect or level flow | `testing` (record `pipelines.json`: a release build refuses a stale one) |
| Numbers from a phone | `ship-mobile`, `mobile-performance-review` |

## Skills, MCP and reviewer agents

- Skills are in `.claude/skills/` (Claude Code) and, as separate copies, `.agents/skills/` (Codex). They update when a Claude Code session starts and when the editor opens the project; **Codex has no hook: run `gameengine skills update --auto` at the start of a Codex session.** Updates keep your edits in either copy but do not copy them to the other.
- The `gameengine` MCP server (the CLI as tools, skill `mcp-tools`) is registered for sessions at the project root: `.mcp.json` (Claude Code, approve it once) and `.codex/config.toml` (Codex, once the project is trusted).
- Reviewer agents `architecture-reviewer` and `mobile-performance-reviewer` are in `.claude/agents/` and `.codex/agents/`. Spawn one where this file or a skill says to; when you cannot spawn subagents, follow its instructions yourself.
