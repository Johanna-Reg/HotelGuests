---
name: editor-windows
version: 1.4.0
tier: optional
description: Project editor windows (editor/windows/*.tsx, defineEditorWindow) — floating tool windows in the game's menu that read the scene and edit through the command bus. Use when designers need a pop-up tool (balance table, content audit, batch edit) rather than a whole editor mode.
---

# Editor windows

**Covers:** Adding the project's own editor windows — editor/windows/*.tsx with defineEditorWindow — listed in the game's menu (the menu bar menu named after the game) and opened as floating tool windows that read the scene, select entities and edit through the undoable command bus. Use when designers need a pop-up tool (a balance table, a content audit, a batch edit) rather than a whole editor mode.

A tool designers keep open while they work is better as a dockable widget (skill
`editor-widgets`): they dock it in their own layouts and can still pop it out. Use a window for a
tool opened from the game's menu for a moment (a batch edit, an audit, a report).

Every open game has a menu named after it in the menu bar. Each file in `editor/windows/` adds one
item there; choosing it opens a floating window over the editor (drag the title, resize the
corner, Escape or × closes). The editor reloads the file on save; open windows stay open.

```tsx
// editor/windows/balance.tsx
import { defineEditorWindow, type EditorWindowApi } from '@gameengine/editor-api';

export default defineEditorWindow(({ React, ui }) => {
  // Define components inside the factory: JSX needs the `React` the editor passes in.
  function Balance({ api, close }: { api: EditorWindowApi; close: () => void }) {
    const scene = api.useScene(); // re-renders on every change, undo included
    const spawners = scene.entities.filter((e) => 'Spawner' in e.components);
    return spawners.map((e) => (
      <ui.NumberField key={e.guid} label={e.name} value={Number(e.components.Spawner!.count)}
        onCommit={(v) => void api.execute('scene.setComponentField', { entity: e.guid, component: 'Spawner', field: 'count', value: v })} />
    ));
  }
  return { id: 'td.balance', title: 'Balance', width: 420, height: 320, render: Balance };
});
```

- `id` is unique in the project, letters, digits and `_ . : -` (`td.balance`); `title` (up to 200
  characters) is the menu item and the window title; `width`/`height` (200–4000, default
  420 × 320) are the starting size. A bad one is reported in the status bar against its file.
- `render` gets `api` and `close()`. The api is an editor mode's (skill `editor-modes`) without
  `viewport`: `scene()`/`useScene()`, `selected()`/`useSelection()`, `select`, `schema`, `assets`,
  `query`, `execute`, `group`, `place`, `notify`.
- Write only through `api.execute(...)` / `api.group(...)` (undo, save and prefab overrides stay
  right); new data files through `asset.setText`. Never write project files yourself.
- Use `ui.*` widgets so the window looks like the editor. A throwing window shows its error and a
  Retry button; the editor keeps running.
- Curves (a jump arc, a difficulty ramp, a falloff): use `ui.CurveField`, never a hand-drawn SVG.
  It is a full graph editor: drag keys (a press near one grabs it; Shift one axis, Ctrl/Cmd
  snaps), double-click adds, right-click or Delete removes, wheel zooms, drag empty space pans,
  X/Y min/max fields work at any scale, Fit (or F) frames the whole curve, Expand opens a big view.
  With `tangents` the selected key shows weighted handles and a Linear / Smooth / Broken choice.

  ```tsx
  <ui.CurveField label="Jump curve" keys={keys} limits={{ x: [0, 1], y: [0, null] }} tangents
    onChange={setDraft} onCommit={save} />
  ```

  Keys are `[x, y]` or `[x, y, { mode, in?, out? }]`, sorted by x; store them as JSON in the
  game's data and read them in game code with `evaluateCurve(keys, x)` from `@gameengine/runtime`
  (the maths the graph draws; deterministic and allocation-free, so sim may call it per entity).
  These are not tween eases: `ease: "curve:name"` takes `defineCurve`'s Hermite keys. `limits` keeps keys inside a
  range (open ends are `null`); `onChange` fires during a drag, `onCommit` once per edit;
  `lockX` / `fixedCount` for keys whose time or count is fixed.
- **Its own OS window:** the title bar's pop-out button moves a window into a real OS window (drag
  it to a second display; it opens again there with the project), and its header's button brings
  it back. It keeps the same `api`, React tree, module state and undo, so a store the window shares
  with a mode updates both at once. `render` also gets `detached` and `setDetached(on)` to adapt the
  layout or offer its own button; `detachable: false` keeps it inside, `minWidth`/`minHeight` bound
  its OS window. Use `ui.*` popovers and menus (they open in the window they belong to); code that
  reads the global `document` or `window` reads the editor's, so use the element's
  `ownerDocument` / `ownerDocument.defaultView` instead.
- **From code:** `api.windows.open('td.balance', { display: 1 })` opens a window (here in its own
  OS window on the second display; `detached: false` inside the editor, nothing: where it was last)
  and resolves once it is there; `api.windows.close(id)` closes it. Modes have the same `api.windows`,
  so a mode's button can put its companion window beside the game.
- A window needs no scene-view tools; when it does (picking, overlays), build a mode instead.
- Packages ship windows in `windows/` of their `gameengine.editor` directory (skill `packages`).

## Check it

- `npx tsc -p editor/tsconfig.json` typechecks (copy gem-cascade's `editor/tsconfig.json` if the
  project has none); build and runtime errors show in the status bar.
- `gameengine editor state` lists `windows` (with `detached`, `display`, `bounds`);
  `gameengine editor window td.balance` opens one (`--close` closes it, `--detach [--display 1]
  [--bounds x,y,w,h]` puts it in its own window and answers once it is open, `--attach` brings it back), then
  `gameengine editor screenshot out.png` shows the editor (`--window td.balance`: the detached window alone).

Example: `samples/gem-cascade/editor/windows/scene-stats.tsx` in the engine repository.
