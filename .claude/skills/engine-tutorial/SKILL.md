---
name: engine-tutorial
version: 1.3.0
tier: required
description: Editor spotlights and tutorials on any engine area (particles, VFX, animation, UI, materials, scenes, play-testing, builds; editor spotlight, MCP tutorial_pick). Use when someone asks to be shown where something is ("show me…", "where do I find/change…") or how to work with it ("what about X?", "how do we…"), or wants a tutorial.
---

# Engine tutorials

**Covers:** Step-by-step tutorials the person picks here in the chat, for their own question, and that then run inside the open editor; pointing at one place in the editor; and writing tutorials for a game's own modes and panels.

The editor has no agent of its own and no tutorial menu: the person asks you, and you show them in
the open editor. There are two kinds of question, and they get different answers. When they ask you
to build or change something, build it and offer neither.

## "Show me …", "where do I find …", "where do I change …"

A specific setting, panel or control: **show it at once, before you write anything.** Do not explain
first and do not offer a tutorial or ask whether they want to be shown.

1. Start the editor if `gameengine editor state` says none is open (`gameengine editor`).
2. Switch to the mode the place lives in: `gameengine editor mode <id>` (MCP `editor` action `mode`),
   e.g. `editor.vfx` for particle settings, `editor.play` for play-testing.
3. Ring the closest place: `gameengine editor spotlight <target> --text "<one sentence>"` (MCP
   `editor` action `spotlight`). Targets:
   `gameengine tutorial targets`; `widget:<panel id>` is any dock tab (`widget:inspector`,
   `widget:console`, `widget:vfx-emitter`). The text names the exact setting and the one click left to
   reach it ("Pick an emitter on the left, then scroll to Shape: choose sphere, cone, box or circle").
4. Then reply in one or two lines: what is ringed, and that you can change the value for them.

"Focus it again" or "show me again" repeats step 3. `--clear` takes the spotlight away.

## "How do we work with …", "what about …", "teach me …"

A whole area, however it is worded ("what about particle effects?", "how does animation work?", "can
the engine do UI?"): also when another skill (`vfx`, `animation-3d`, `ui-documents`, …) answers it.

1. Answer in two or three sentences. Then offer the tutorials, but only when one matches
   (`score` > 0): a question no tutorial covers gets just the answer.
2. Show the choice in this chat, ranked for their words:
   - **A chat app with MCP Apps** (Claude, ChatGPT, Tactile Create Code): MCP `tutorial_pick` with
     `query` set to their question shows a picker, best match first. A click runs that tutorial in the
     open editor; you do nothing more.
   - **No MCP Apps** (Claude Code in a terminal, Codex): `gameengine tutorial list --for "<their question>" --json`
     (MCP `tutorial_list`). Offer the top matches (`score` > 0; with none, the core ones) as choices,
     at most four: your multiple-choice question tool in Claude Code, a numbered list otherwise.
   Each choice is the tutorial's `title` and its `summary`, word for word. Do not add descriptions:
   the tutorial shows the rest.
3. Run the chosen one: `gameengine editor tutorial <id>` (MCP `editor` action `tutorial` with `id`;
   `--step n` resumes). The editor shows each step next to the control it is about, waits for the
   person to do it, and offers "Do it for me". Start the editor first with `gameengine editor` if it
   is closed.
4. Stay with them: `gameengine editor state` has `tutorial: { id, step, steps }`. Answer questions in
   chat; do not run the steps for them unless they ask.

Play-testing happens in the Play mode (`editor.play`), where games open: the `play-and-devices`
tutorial starts there, not in the Scene view.

## Telling them about things they have not found

At the end of a task, when the work touched an area a tutorial covers and the person seemed to be
missing it (they edited effect JSON by hand while the VFX mode is off), mention that one tutorial in a
single line with its `title`. At most once per session; never as a list. The editor shows its own
"Did you know?" tips in the status bar, so do not repeat those.

## Writing a tutorial for the game's own tools

A game's modes, panels and windows can have tutorials too: `editor/tutorials/<id>.tutorial.json`,
listed with the engine's (marked Project) and checked with `gameengine tutorial check`.

```json
{
  "id": "level-editor",
  "title": "Level editor",
  "summary": "Paint a level and play it",
  "minutes": 3,
  "mode": "levels",
  "tags": ["level", "tiles", "paint", "map"],
  "skills": ["editor-modes"],
  "steps": [
    { "target": "mode-picker", "text": "Open the Mode menu and pick Levels.", "do": { "mode": "levels" }, "done": { "mode": "levels" } },
    { "target": "widget:palette", "text": "Pick a tile, then paint it in the grid." },
    { "target": "play", "text": "Play the level you painted.", "do": { "play": true }, "done": { "playing": true } }
  ],
  "ask": ["Add a spike tile that kills the player."],
  "tips": [{ "id": "level-file", "text": "Level files open in the Levels mode.", "when": { "file": ".level.json" } }]
}
```

- **Short:** `title` at most 40 characters; `summary` one line of at most 60, saying what they can do
  after it, with no full stop; each step's `text` at most 200 (one or two sentences). The check fails
  longer ones: say less, the tutorial shows the rest.
- **Ids, not looks:** a step's `target` is a place from `tutorial targets` or `widget:<panel id>`,
  never a label or position, so moving or renaming a control does not break it.
- `do` (Do it for me): `{ "mode": id | "scene" }`, `{ "play": true }`, `{ "stop": true }`,
  `{ "widget": id }` (adds it to the person's layout), `{ "open": "settings" | "modeLibrary" | "palette" | "buildSettings" | "home" }`.
- `done` (moves on by itself): `{ "mode": id }`, `{ "playing": bool }`, `{ "selected": "entity" | "file" }`, `{ "widget": id }`.
- `mode`: the editor asks to switch that mode on when the project has it off.
- `ask`: up to three example prompts for you, shown on the last step under "Ask your agent".
- `tips`: up to four "Did you know?" lines (at most 90 characters) the status bar shows once, when a
  selected file ends in `file` and/or while `modeOff` is off.
