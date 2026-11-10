---
name: mcp-tools
version: 1.23.1
tier: optional
description: Driving a Game Engine project through MCP instead of a shell — `gameengine mcp`, registering it in a client, which tool to call for what, and the session/verify loop. Use when your client exposes gameengine_* MCP tools, or to wire the engine into a shell-less agent.
---

# Working through MCP tools

`gameengine mcp` is the CLI as MCP tools. Every tool runs one `gameengine … --json` command in the
project, so everything in the other skills applies unchanged — only the calling syntax differs.

## Register it

Projects already register it: `gameengine skills update` installs `.mcp.json` (Claude Code) and
`.codex/config.toml` (Codex), both running `node .gameengine/engine/tools/cli/bin/gameengine.mjs mcp`
through the project's link to the engine checkout. Start the agent at the project root:

- Claude Code asks once to approve the project's `gameengine` server (or `/mcp` → approve); `claude mcp list` shows it.
- Codex reads the project's `.codex/config.toml` once you trust the project; `codex mcp list` shows it.
- Start it at the project root: the CLI path is relative to where the agent spawns the server.
- No tools? Run `gameengine skills update` to restore the `.gameengine/engine` link. Your own servers in `.mcp.json` and tables in `.codex/config.toml` are kept; if you changed the `gameengine` entry itself, the library's version lands beside the file as `.mcp.json.new` / `config.toml.new`: merge it by hand and delete the `.new`.
- Removing the library's `gameengine` entry does not stick: the next update adds it back.

Any other client (from outside the project, so the path is absolute):

```json
{ "mcpServers": { "gameengine": { "command": "node", "args": ["<engine>/tools/cli/bin/gameengine.mjs", "mcp", "--project", "<project dir>"] } } }
```

`gameengine mcp --list` prints every tool with its description.

## Read first

Resources: `gameengine://project` (this project's PROJECT.md: its own notes, read first),
`gameengine://agents` (this project's AGENTS.md) and `gameengine://skills/<name>`. Read the
project notes, the agents guide and the skill for the task before calling tools — the rules (determinism, MVC
views, testing) are the same with or without a shell.

## Interactive widgets

`widget_show` puts an MCP App in the chat for hosts that render them: live UI document editors,
inspectors and previews that call these same tools. Read `gameengine://widget-guide` for the API
and limits and skill `mcp-widgets` for the workflow, approvals and quality checks. Hosts without
MCP Apps still get every tool below.

## The loop

| Step | Tool |
|---|---|
| Start a headless session | `session_start` (`paused: true` to step by hand) |
| Advance | `step` `{ "n": 60 }` |
| Look | `screenshot` (returns the image), `view_render` for a UI view alone (`model` for any state, `size`, `safe`, `landscape`, `times: "end"` for every animation at its end), `view_lint` for layout warnings in every view on the slim and wide device, `material_preview` for a material or shader alone (`mesh` — `used` for the model it is drawn on —, `device` — `android-etc2` for an Android GPU without ASTC, `compare` for editor, Android, Android ETC2 and iOS side by side —, `deviceClass` such as `phone-low`, `testTexture`, `yaw`, `pitch`, `time`; its text lists what will look different on a phone), `material_uses` (where it is drawn, which models fit), `material_model` (a model's sub-materials with their shader and values) and `material_preview` on a model (`material: models/hero.glb`, `overrides: "Skin:roughness=0.4"` for unsaved values), `texture_inspect` (an image of a texture as phones sample it, with the difference), `vfx_preview` for an effect |
| Inspect | `world_query` `{ "components": ["Tile"] }`, `world_get`, `scene_getEntity` |
| Put the game into a state | `cheat_list` (params with their `current` value), `cheat_run` `{ "id": "moves.add", "args": { "amount": 3 } }`, then `step` `{ "n": 1 }`; skill `cheats` |
| Play like a finger | `ui_interactables`, `ui_press` / `ui_tap` `{ "id": "play" }` or `{ "at": "540,1046" }`, `ui_drag` `{ "from": "540,1046", "by": "0,-300", "duration": 0.1 }` (a flick; timed in sim steps, the same paused or running and in a replay), `emit` |
| Record and play replays | `replay_record_start` `{ "path": "tests/replays/x.greplay" }` (restarts the game), drive it, `replay_record_stop`; `replay_play` on a running session or device, `replay_verify`, `replay_diff` `{ "a", "b" }` |
| Quality levels | `quality_which` (`devices`: a CSV or JSON device list) for the level each device gets under `quality.select` and the share of players per level; `quality_features` for the visual features, their cost and where they are on; `quality_show` (`platform`, `level`) for one cell's settings and features with their sources; `test` with `level: "android.low"` resolves content for one; skill `device-tiers` |
| Devices | `device_list`, `device_install`, `device_run` (long), `device_screenshot` (returns the image), `device_logs` |
| Animate a 2D rig | `anim2d_new` (an empty rig and its images folder), `anim2d_pose_bone`, `anim2d_key`, `anim2d_duration`, `anim2d_retime`, `anim2d_mirror`, `anim2d_blend`, `anim2d_variation`, `anim2d_attach_image` (an image into a slot and region), `anim2d_mesh_from_image` and `anim2d_weights` (meshes traced from alpha, bind, auto/prune/smooth weights), `anim2d_constraint_add|set|key|remove|order` (IK, transform, path, physics, slider; 4.3 mapping; physics reset keys), `anim2d_skin_add_placeholder`, `anim2d_skin_items`; `psd_import` (a tagged Photoshop file to a rig; `dryRun` first); check with `anim2d_lint` or `anim2d_problems` (the editor's Problems view; `fix: true` applies the safe fixes; `device` adds what the rig costs there), `anim2d_metrics` (counts and the estimated cost per instance on a device class, costliest features and what to use instead), look with `skel2d_preview` (returns the image), export a GIF, PNG sequence or WebM with `skel2d_export`; skill `animation-2d-agent` |
| Edit a scene | `scene_setComponent`, `scene_createEntity`, … then `scene_save` |
| Change schema | edit `schema/*.schema.ts` (file access needed), then `gen` |
| Verify | `test` (`js: "both"`; `native: "both"` for Rust systems, `cooked`, `minify`, `changed`, `memoryClass`, `level`, `hashTrace` + `checkpointEvery`), `trace_diff` `{ "a", "b", "allow": ["rng:*"] }` (two traces: both builds' commit, the first divergence the allow list does not cover), `check` (`rebuild: true` builds stale engine binaries, `strict: true` fails on layout warnings), `validate`, `world_hash`, `replay_verify` |
| Playable ads | `playable_new`, `playable_export_assets`, `playable_build`, `playable_validate` (read `results[].checks`), `playable_list`; skill `playable-ads` |
| Stop | `session_stop` (the sessions this server started) |

Meta and multiplayer have their own checks: the project's meta tests via `test`, `net_test`
(rollback peers), `mp_test` (a match server and bot clients) and `mp_match` (the game's matchmaker against bots; skill `multiplayer`).

## Rules

- A tool result with `isError: true` is a failed CLI run — read its text, and the `stderr:` item after it; do not retry blindly.
- A result with `_truncated: { bytes, full }` was cut to fit (failed items kept first): read `full` for the rest instead of rerunning.
- `test` with `js: "both"` before calling a change done, exactly as in `work-loop`.
- Code changes still need file access; MCP drives and verifies, it does not edit TypeScript.
- Stop your sessions with `session_stop` when done so the next task starts clean.

## Several agents on one project

Each agent runs its own `gameengine mcp` server, and a server keeps to the sessions it started:

- After `session_start`, session tools (`step`, `screenshot`, `world_*`, the `scene_*` command
  tools, …) go to the newest live session **this server** started, never to one another agent (or
  the user's `gameengine run --headless`) started later.
- Before it has started one, and after `session_stop`, they go to the project's newest session, as
  the CLI does. If its session exits on its own, they fail with "has exited" until you
  `session_start` again, so a crash never hands your calls to someone else's session.
- If `session_start` times out or is cancelled, the engine may still have started: check
  `session_list` and stop the stray session by `session`.
- Project tools (`tool_*`) that run CLI commands themselves reach the project's newest session, not
  the pinned one.
- `session_list` shows every live session of the project (pid or device id). To drive another one
  (the user's, a device), pass it as `session` to `step`, `screenshot`, `world_*`, `cheat_*`,
  `ui_*`, `emit`, `mode`, `call`, `view_render` or `pool_stats`.
- `session_stop` stops only this server's sessions; `session` stops one, `all: true` stops every
  session of the project, other agents' included, so use it only when asked.
- The desktop editor is shared: one editor per project, and the `editor*` tools drive it for every agent.

## Project tools

The project's own commands (`tools/*.tool.ts`, skill `project-tools`) appear as `tool_<name>`
next to the engine's tools. Restart the server after adding one.
