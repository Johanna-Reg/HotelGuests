---
name: editor-modes
version: 1.13.0
tier: optional
description: Project editor modes (editor/modes/*.tsx, defineEditorMode) — custom panels docked beside the built-in ones, viewport tools, inspectors and palette actions through @gameengine/editor-api and the undoable command bus. Use when designers need a level, wave, dialogue or content tool next to the game view.
---

# Editor modes and inspectors

**Covers:** Building the project's own editor tools — editor modes (editor/modes/*.tsx with defineEditorMode: the mode's own panels plus the editor's built-in ones — the running game (play), the scene view, hierarchy, inspector, console … — docked left/right/bottom/centre and sized, a viewport tool with pointer input in world coordinates, snapping, picking and overlays), whole-entity inspectors, custom component editors and palette actions — through @gameengine/editor-api, writing only through the undoable command bus. Use when designers need a level, wave, dialogue or content tool next to the game view, or when an inspector should show more than one component.

The editor loads your project's editor code and reloads it on save. Everything lives in
`editor/` (never in the game bundle) and is typed by `@gameengine/editor-api`:

| File | What it adds |
|---|---|
| `editor/editors.tsx` | `register(api)`: component editors, whole-entity inspectors, palette actions |
| `editor/widgets/<name>.tsx` | one dockable widget each: `export default defineEditorWidget(...)` (skill `editor-widgets`) |
| `editor/modes/<name>.tsx` | one editor mode each: `export default defineEditorMode(...)` |
| `editor/windows/<name>.tsx` | one floating window each, opened from the game's menu (skill `editor-windows`) |

Game Engine packages ship the same layout in the directory their `gameengine.editor` names
(skill `packages`); their modes appear next to yours.

**Write tools as widgets first** (skill `editor-widgets`): users dock widgets in their own layouts
(**My layouts** in the Mode picker), beside the scene view or on a second display, without a mode.
A mode is a *locked* layout: users resize it but cannot move or close its panels; **Customize a
copy** turns it into one of their own layouts. Build a mode when a job needs a fixed arrangement,
a viewport tool or header controls; place your widgets in it with `{ widget: id, dock }`.

## A mode

A mode is a workspace for one job: its own panels (the scene view fills the centre unless a
panel docks there), an optional viewport tool, header controls (`toolbar`), and code that runs
while it is active. Only the header (project, **Mode** picker, the mode's tools) stays; the
Scene mode's toolbars and panels are hidden. Designers switch with **Mode**; the editor remembers
the choice per project. Switching modes never resizes the window: the mode fits itself into the
window as it is (`resizeWindow` is deprecated and ignored). Play works as usual: panels stay, the tool steps aside.

The editor's own modes sit in the same picker: Play, VFX (searchable effect list), UI documents
(the visual editor for `ui/**/*.ui.json`, skill `ui-documents`), Materials (shaders, materials and
imported models' sub-materials with a live preview and generated controls), Rig and Playable Ads. Build a project mode
for what they do not cover; its `id` may not reuse theirs (`editor.*`).

```tsx
// editor/modes/waves.tsx
import { defineEditorMode, type EditorModeApi } from '@gameengine/editor-api';

export default defineEditorMode(({ React, ui }) => {
  // Define components inside the factory: JSX needs the `React` the editor passes in.
  function Waves({ api }: { api: EditorModeApi }) {
    const scene = api.useScene(); // re-renders on every change, undo included
    const spawners = scene.entities.filter((e) => 'Spawner' in e.components);
    return spawners.map((e) => (
      <ui.NumberField key={e.guid} label={e.name} value={Number(e.components.Spawner!.count)}
        onCommit={(v) => void api.execute('scene.setComponentField', { entity: e.guid, component: 'Spawner', field: 'count', value: v })} />
    ));
  }
  return {
    id: 'td.waves',           // unique in the project; remembered per project
    title: 'Waves',
    icon: '≋',
    panels: [{ id: 'waves', title: 'Waves', dock: 'left', render: Waves }],
    viewportTools: [/* see below */],
    onActivate: (api) => () => { /* cleanup when the mode stops or reloads */ },
  };
});
```

## Laying out a mode from the editor's own panels

`panels` mixes your panels with the editor's surfaces, `{ builtin, dock, size? }`, and the
project's widgets, `{ widget, dock, size? }`, so a tool can take the big centre and keep the
running game beside it:

```tsx
panels: [
  { builtin: 'play', dock: 'left', size: 380 },              // the running game + its Play/Stop
  { id: 'level', title: 'Level', dock: 'center', render: Level }, // your editor takes the rest
  { builtin: 'console', dock: 'bottom', size: 160 },
],
```

| `builtin` | What it is |
|---|---|
| `play` | The game view with Play/Stop above it; "Press Play" until a game runs; never the edit world |
| `scene` | The scene view: your viewport tools, overlays, asset drops, camera widgets |
| `hierarchy`, `inspector`, `project`, `console`, `profiler`, `tests`, `replays`, `cheats`, `build`, `devices`, `content`, `materials`, `grading`, `tilemap`, `animation`, `uiPreview`, `skills`, `packages`, `packageBrowser` | The Scene mode's panels |
| `materialList`, `materialPreview`, `materialValues` | The Materials mode's panels: shaders, materials and models with their sub-materials; the live preview; the values, textures and shader of what is picked. They share one pick, and `materialValues` alone edits the selected entity's model (a character creator can place it beside its own sliders) |

- Each builtin and each widget at most once per mode; panels in one region are tabs, in your order.
- A mode's own panels also show in every personal layout's widget list (under the mode's name), so
  they must lay out at any size too (skill `editor-widgets` § Rules).
- `size` (px) is a region's starting width (`left`/`right`) or height (`bottom`), 140–800; the
  first panel in a region that gives one wins. `center` takes the rest. Users can drag the
  splitters; their sizes are remembered per mode.
- `scene` and `play` can both be shown (e.g. scene centre, game right). A mode that places
  `scene` keeps its viewport tools while the game plays.
- With no `center` panel the centre shows the combined scene/game view, unless you placed `scene`
  or `play` elsewhere; then give the mode a centre panel.
- Your panels can pop out into their own OS window (the tab strip's pop-out button; a second
  display beside the game), keeping the same `api` and module state; the region collapses while
  one is out, and closing its window docks it again. `render` gets `detached` and
  `setDetached(on)` (a `bare` panel has no strip for the button, so it offers its own);
  `detachable: false` keeps one in the dock. Built-in panels stay inside. Use `ui.*` popovers and
  menus; code reading the global `document` or `window` should use the element's `ownerDocument`.
- `api.windows.open(id, { detached?, display? })` / `api.windows.close(id)` open the project's editor
  windows (skill `editor-windows`) from a mode, e.g. a companion window on the second display.

## Reading and writing

- **Read:** `api.scene()` / `api.useScene()` (entities with `guid`, `name`, `parent`,
  `components`, `prefab`), `api.selected()` / `api.useSelection()`, `api.schema.types()`,
  `api.schema.enumValues('TileKind')`, `api.assets.list()` and `api.assets.thumbnailUrl(path)`
  for an `<img>`. Anything else through `api.query('scene.inspect', …)` (docs/generated/commands.md).
- **Follow files on disk:** `api.assets.useRevision({ dir: 'assets/data/levels', suffixes: ['.json'] })` is a
  number that grows each time matching files change, whoever wrote them (the bus, a project tool, an agent,
  a text editor): put it in the dependencies of the effect that re-reads them. `api.assets.onChanged(listener,
  { dir, suffixes })` calls back with the project-relative paths (`null`: anything may have changed) and
  returns the unsubscribe function, for `onActivate`'s cleanup.
- **Write only through the command bus:** `api.execute('scene.setComponentField', …)`,
  `api.place(prefabOrAsset, { position })`, `api.select([...])`. Never write scene or prefab files
  yourself: the bus keeps undo/redo, save, the crash journal and prefab overrides right.
- **New files (a level, a wave table):** `api.execute('asset.setText', { path: 'assets/data/levels/l3.json',
  text })` creates the file and, under `assets/`, its `.gmeta` (a new GUID) in one undo step. A new
  data asset (`$type`) answers `dataType`, and the editor runs `gameengine gen --content` for you (the data
  index, collections, materials and effects only; schema bindings are left alone), so `listData` and
  collections see it without a manual step (skill `content-database`). Outside the editor run
  `gameengine gen --content` after adding or removing assets, and plain `gameengine gen` after a schema change.
- **One undo step for many edits:** `await api.group('Fill row', async () => { … })`. A throw or a
  failed command rolls the whole group back and resolves `false`.
- **Undo of the tool's own** (a task, a chapter): `const h = api.history('story:' + taskPath)`, then
  `h.execute(...)` / `h.group(label, fn)` for its edits and `h.undo()` / `h.redo()` on the panel's
  buttons and keys. The scene's Ctrl+Z never reaches these steps, nor they the scene's; call
  `h.clear()` when the task changes. Scoped edits are file edits (`asset.*`,
  `project.setAssetGroup`); JSON edits undo per value, so tasks sharing `locales/en.json` undo in any
  order. `h.undo()` rejects with `E_CONFLICT` (and clears the history) when a value it would restore
  was changed since: show the message, never retry.
- **Asset groups for imported files:** `project.setAssetGroup { name, include: ['assets/story/ch1/bg.png'] }`
  (and `project.removeAssetGroup`) in the import's group, so one undo takes back both; Play picks
  it up on its next start. Prefer `assets.load({ assets: [...] })` in the game (skill
  `asset-memory`) over a group per asset when nothing else needs the group.
- **Play and the game:** `await api.play.start()` resolves once the game runs (a "Play task" button:
  start, then `await api.game.cheats.run('story.goto', { task })`); `api.play.stop()`,
  `api.play.useState()` for a Play/Stop control. `api.game.call('ui.stack')` and the other methods
  the editor's panels use reach the running game; every call rejects when Play is not running.
- **Network and files outside the project:** a mode cannot fetch (the editor allows no external
  connections). Put that work in a project tool (`tools/import-chapter.tool.ts`, skill
  `project-tools`) and run it: `const r = await api.tools.run('import-chapter', { sheet, chapter })`
  gives `{ ok, result, error }`; pass `{ onLog, signal }` for progress lines and Cancel. The tool
  writes data assets; the mode reads them after.
- Errors: throw, or `api.notify(message, 'error')`. A panel that throws is contained (the rest of
  the editor keeps working) and shows a Retry button; fix the file and save.

## Viewport tools

A tool takes left-button and hover input on the scene view (middle/right still move the camera;
**Select** in the toolbar hands the view back to the gizmos):

```ts
{
  id: 'paint', title: 'Paint', cursor: 'copy',
  onPointer: async (e, api) => {
    if (e.phase !== 'down' || !e.world) return;           // e.world: z = 0 plane in 2D, ground in 3D
    const cell = api.viewport.snap(e.world, 1);           // grid snapping
    const hit = api.viewport.pick(cell, 0.5)[0];          // entities near a point, nearest first
    if (e.shift && hit) await api.execute('scene.deleteEntity', { entity: hit });
    else if (!hit) await api.place('prefabs/wall.prefab.json', { position: cell });
  },
  overlay: ({ pointer, api }) => {                         // world units; redrawn on moves, edits, camera
    if (!pointer?.world) return [];
    const c = api.viewport.snap(pointer.world, 1);
    return [{ kind: 'rect', min: [c[0] - 0.5, c[1] - 0.5], max: [c[0] + 0.5, c[1] + 0.5] }];
  },
}
```

Pointer events: `phase` (`down`, `move`, `up`, `hover`, `leave`), `view` (0…1), `world`,
`dimension`, `shift`, `alt`, `mod` (Ctrl/⌘). Overlay shapes: `line`, `rect`, `circle`, `label`
(`color`, `fill`, `width`, `dashed`). Call `api.viewport.redraw()` after your own state changes.

Limits today: overlays draw in 2D scenes only; in 3D, pointer events carry the ground point
(`y = 0`), not a full ray. `pick` is position based (translations summed up the parents).

## Inspectors (editor/editors.tsx)

```tsx
export default function register({ React, ui, registerComponentEditor, registerEntityInspector, registerAction }: EditorApi) {
  registerEntityInspector({
    id: 'gems.tile', title: 'Tile preview', requires: ['Tile', 'Sprite'],
    render: ({ entity, components, commit }) => <ui.Button onClick={() => commit('Tile', 'kind', 'Bomb')}>Make bomb</ui.Button>,
  });
}
```

`registerComponentEditor(component, Editor)` replaces one component's fields (with
`DefaultFields` for the rest); `registerEntityInspector` adds a section above the components for
entities with every `requires` component; `registerAction` adds a command palette entry.

## Checking your work

- Typecheck: `npx tsc -p editor/tsconfig.json` (JSX factory `React.createElement`).
- Build errors and runtime errors show in the editor status bar with the file name.
- Look at a widget alone: `gameengine editor screenshot level.png --widget <widget id>` (MCP
  `editor_screenshot` with `widget`) while its tab is showing or it is popped out; `--window <id>` for an
  editor window.
- Every edit a mode makes is a bus command, so `gameengine cmd …` can reproduce it and
  `gameengine validate` checks the result.

Example: `samples/gem-cascade/editor/modes/level.tsx` in the engine repository (a Level panel in
the centre, the game docked left, the Console below).
