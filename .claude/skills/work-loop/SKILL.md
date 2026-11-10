---
name: work-loop
version: 1.15.0
tier: required
description: The edit → test → inspect loop for a Game Engine game and the CLI command for each step — gameengine test, hash traces, goldens, headless sessions, step/screenshot/world query, ui press, view render, cheats, replays. Use at the start of any gameplay, UI or content task, or when unsure which command checks a change.
---

# Work loop

The commands below need `gameengine` on PATH. If the session started with "gameengine is not on PATH", put it there once: `node .gameengine/engine/tools/cli/bin/gameengine.mjs setup --path` (or `node tools/cli/bin/gameengine.mjs setup --path` in the engine checkout; plain `setup` does it too, with the toolchain) writes a launcher into a user bin directory on PATH (`--dir <dir>` picks one; `gameengine doctor` checks it), then start a new session. Until then, `node .gameengine/engine/tools/cli/bin/gameengine.mjs` runs the same CLI.

| Step | Command |
|---|---|
| Logic tests | `gameengine test` (sharded across cores, `--jobs N`; `--js both` runs V8 and Hermes at once; `--filter "*swap*"` for one, `--changed` for the test files you touched). The output starts with `host: <path> (debug|release)`; `gameengine check --rebuild` rebuilds stale engine binaries |
| Prove a change left the sim alone (refactor, optimisation, port to Rust) | before editing `gameengine test --hash-trace .gameengine/base`, after it `gameengine test --hash-trace-baseline .gameengine/base`: `N of N identical` is the proof, a failure names the step, system and components (skill `determinism`). No equivalence fuzzers, second copies of the project or end-of-test hash guessing |
| Render goldens | `gameengine test --tier t0,t1` (`--update-goldens` after an intended change) |
| Start a session | `gameengine run --headless` (`--paused` to step by hand) |
| Advance / look | `gameengine step 60`, `gameengine screenshot out.png`, `gameengine world query Tile --limit 5`, `gameengine call render.probe '{"points":[[180,320]],"regions":[[0,0,360,80]]}'` (pixel colours and region means, no image to read) |
| Edit live | `gameengine world set <entity> <Comp> '<json>'`, `gameengine cmd scene.createEntity --name Box` |
| Press the UI | `gameengine ui interactables --width 1179 --height 2556` (what takes presses, topmost first), `gameengine ui press <id>` / `ui drag <id> --by 0,300` / `ui type <id> <text>` (hit-tested, through the real input path), raw points on the game too: `ui tap --at x,y`, `ui drag --from x,y --by 0,-300 --duration 0.1` (a flick: timed in sim steps, the same paused or running and in a replay), `gameengine emit <Event> '<json>'` |
| A UI view alone | `gameengine view render Hud --sample midway --out hud.png` (`--model '<json>'` for any state, `--size WxH`, `--safe l,t,r,b`, `--landscape`, `--times` for animations and UI particles, `--times end` for the settled frame with every animation and flight at its end); `gameengine view lint` renders every view on the slim and wide device and lists squashed caps, children out of their parent, overlaps and text too big for its box |
| A material alone | `gameengine material preview materials/gem.mat.json --mesh torus --yaw 0.8 --time 1.5 --out m.png` (skill `vfx-materials`) |
| Put the game into a state | `gameengine cheat list`, `gameengine cheat run moves.add amount=3` then `gameengine step 1` (skill `cheats`) |
| Look at one thing | `gameengine mode sprite --entity 5:1`, `gameengine mode particles --entity 7:1`, `gameengine mode physics`, `gameengine mode sim` (no rendering), `gameengine mode full` |
| Play it for real | `gameengine run --perf` (frame times and the worst frames on exit; the game's console on stderr) |
| Replays | `gameengine replay record start --path tests/replays/x.greplay` (restarts the game from a fresh world) … `stop`; `gameengine replay verify <file>` names the first diverging step (and, recorded with `--checkpoint-every 1`, the system and components); skill `determinism` |
| Frame rate | `gameengine run --run-sec 10 --json`: the frame-rate target, the display's refresh rate and measured frame intervals (skill `mobile-performance-review`) |
| Memory and loading | `gameengine memory report --device phone-low` (asset groups against budgets; skill `asset-memory`) |
| Rust systems | `gameengine test --native both` (Rust = its TypeScript twin), `gameengine native asm <System>` (skill `perf-to-rust`) |
| What a build ships | `gameengine build android --config release --dry-run --report` (skill `ship-mobile`) |
| Playable ads | `gameengine playable new` / `run` / `build` / `validate <ad>` (skill `playable-ads`) |
| Stop | `gameengine session stop --all` |
| The editor the user watches | `gameengine editor state`, `gameengine editor mode editor.play`, `gameengine editor play` / `stop`, `gameengine editor stream on` (URL in `editor state`), `gameengine editor call render.stats --role game`, `gameengine editor restart-engine` (when `editor state` says `editEngine.running: false`), `gameengine editor screenshot out.png` (MCP `editor`, `editor_screenshot`) |
| The editor's console | `gameengine editor console --level error` (`--since <next>` for only new entries, `--follow` to keep reading): script errors, rejected hot reloads, cook failures, stale engine binaries |
| Before handing back | `gameengine check`: validate, cook, and a smoke run of the cooked game (`check.smoke` in `project.gameengine.json`: `frames`, `input`); `--tests` adds the game tests on V8 and Hermes, `gameengine test --cooked` runs them on cooked content |

- Hot reload is on in sessions: save a file, the session keeps its world. A bundle that fails to build or load is rejected and the last good build keeps running; the reason is in the console. In the editor, each reload logs `reloaded: …` (category `hot-reload`): wait for it with `gameengine editor console --since <next>` instead of asking the user to restart anything.
- A schema change is not a plain reload: the editor restarts its edit engine, which rebuilds the project's native host first. Run `gameengine gen` before saving code that uses new schema types, and wait for `edit engine restarted` or `restart failed: …` in the console (AGENTS.md "The live project" says what to do on a failure).
- Session-start config (`project.gameengine.json`, `pipelines.json`, `input.json`) is the exception: a headless session needs `session stop` and `run` again; the editor restarts its edit engine itself and offers Restart Play.
- Every command takes `--json`. Read errors; they name the fix.
- **New asset files need a `.gmeta` sidecar** (its GUID and importer): create text assets (effects, materials, tilemaps, clips, banks, data) with `gameengine cmd asset.setText` (it writes a new file under `assets/` with its sidecar) or run `gameengine cook` once after adding files, and commit the `.gmeta`; until then `validate` fails with `E_ASSET: no .gmeta sidecar`.
- Done means a test or replay shows the behaviour, not that the code compiles.
- **An animated result is checked at its last frame.** A view at rest says nothing about where a flight, a fill or a slide ends: render it at the end (`view render <View> --times end`, or `--times` up to the end on the slim and the wide device) and assert where it landed in a test (`ui.finishAnimations()`, then `expect('coin').toLandOn('coins.target')`; skill `testing`).

## The live project

The user may have the project open in the editor or running while you work. The editor follows the files on
disk, so a project change never needs the editor restarted, by you or the user.

- Scripts (`src/`, `schema/`, `ui/`, regenerated `*.gen.ts`) hot reload; assets, scenes, prefabs, locales, styles
  and `haptics.json` reload in place and content re-cooks; editor lists (Project browser, scenes, playable ads,
  textures, skills, cheats) relist by themselves.
- Order multi-file changes so every save compiles: create a file before saving the import that names it, and
  run `gameengine gen` after editing `schema/*.schema.ts`, before saving code that imports the new types from
  `schema.gen.ts`. Or work in a copy and apply the change in one go.
- Confirm a change landed with `gameengine editor console --since <next>`: category `hot-reload` logs
  `reloaded: …` per reload, or why it was rejected.
- After a schema change, wait for `scripts changed the schema: edit engine restarted with the new scripts` or
  `restart failed: …`. When the native build fails, the edit engine keeps running on the last host that built,
  or the stock host (`…; running the edit world on …`); fix the build error logged above it.
- `gameengine editor state` reports `editEngine` (`running`, and `error`: why the last start failed). When it is
  not running, fix the cause, then `gameengine editor restart-engine` (unsaved edits are restored); the next
  saved script change also retries. `gameengine editor play` works meanwhile and plays the saved scene.
- Do not run `gameengine test`, `check` or `run` while the editor is building native systems (`building the
  native systems of …` without a following `Finished`, `edit engine restarted` or `restart failed`): they
  build the same project host (V8) and wait for, or fail with, the editor's build.
- The open scene follows its file while the editor has no unsaved edits of it, and prefab instances follow
  their prefab files. With unsaved edits the editor keeps its copy and logs a warning (a save would overwrite
  your file), so prefer editing the open scene through the editor (`gameengine editor call cmd.execute …`).
- Never run importers that delete or rewrite assets while the game is playing.
- Only a change to the engine itself (its Rust binaries) needs a restart: rebuild every binary that reads the
  changed format (`gameengine doctor` lists stale ones), then ask the user to restart the editor.
- To make `gameengine check` a gate, add a Stop hook to `.claude/settings.json`. It blocks finishing once when
  the check fails; if it still fails, the agent stops and reports what is failing:
  `"Stop": [{ "hooks": [{ "type": "command", "command": "gameengine check --hook", "timeout": 900 }] }]`
