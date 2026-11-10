---
name: editor-widgets
version: 1.1.0
tier: optional
description: Dockable editor widgets (editor/widgets/*.tsx, defineEditorWidget): project tools users dock in their own layouts beside the scene view, split, tab, resize and pop out, and modes place with { widget }. Use when building any custom editor tool, panel or inspector-like view for designers.
---

# Editor widgets

**Covers:** Writing the project's editor tools as dockable widgets — `editor/widgets/*.tsx` with
`defineEditorWidget` — that every user can dock in their own layouts (the Mode picker's **My
layouts**), split, tab, resize and pop out to another display, and that modes place with
`{ widget: id, dock }`. Use when building any custom editor tool, panel or view for designers.

**Write every custom tool as a widget first.** A widget is the unit users arrange: it shows in
the widget list (the **+** in any group's tab strip of a personal layout) under *Project widgets*,
so a designer can put it beside the scene view, under the Hierarchy or on a second monitor without
asking for a new mode. A mode (skill `editor-modes`) is then a *locked* arrangement of widgets and
the editor's panels for one job, and a window (skill `editor-windows`) a tool that floats.

```tsx
// editor/widgets/waves.tsx
import { defineEditorWidget, type EditorModeApi } from '@gameengine/editor-api';

export default defineEditorWidget(({ React, ui }) => {
  // Define components inside the factory: JSX needs the `React` the editor passes in.
  function Waves({ api }: { api: EditorModeApi }) {
    const scene = api.useScene(); // re-renders on every change, undo included
    const spawners = scene.entities.filter((e) => 'Spawner' in e.components);
    return spawners.map((e) => (
      <ui.NumberField key={e.guid} label={e.name} value={Number(e.components.Spawner!.count)}
        onCommit={(v) => void api.execute('scene.setComponentField', { entity: e.guid, component: 'Spawner', field: 'count', value: v })} />
    ));
  }
  return { id: 'td.waves', title: 'Waves', icon: 'list', render: Waves };
});
```

| Field | What it does |
|---|---|
| `id` | Unique in the project (`td.waves`: letters, digits, `_ . : -`). Layouts remember widgets by it, so keep it stable. |
| `title` | The tab title and its name in the widget list. |
| `icon` | An editor icon name (`list`, `tree`, `sliders`, `chart`, `grid`, …) for tight tab strips. |
| `detachable` | `false` keeps it docked (default: users can pop it out into its own OS window). |
| `render` | Gets `{ api, detached, setDetached }`; `api` is the mode api (`useScene`, `execute`, `query`, `select`, `group`, `history`, `play`, `tools`, `windows`, …). |

## Rules for a widget that docks well

- **No fixed size.** It fills whatever group it is docked in: a 200 px side column, a wide bottom
  strip, a whole window. Lay out with flex/grid and `minmax`, scroll inside long lists, never set a
  `width`/`height` on the root. Test it narrow and wide.
- **No assumptions about neighbours.** It may be the only thing on screen, or tabbed behind the
  Console. It may be mounted while hidden in a tab: keep work cheap while nothing changes (derive
  from `api.useScene()` with `useMemo` on `revision`, no polling loops).
- **One widget, one job.** Split a big tool into widgets users can arrange (a list, its details, a
  preview) rather than one panel with its own internal splitters.
- **Its own window.** Out of the dock it runs in another OS window with the same React tree and
  module state: use `ui.*` popovers and menus, and the element's `ownerDocument` instead of the
  global `document` or `window`.
- **Writes go through the command bus** exactly as in modes (`api.execute`, `api.group`,
  `api.history`): undo, save and Play see them. Never write project files yourself.
- **Files edited elsewhere:** a widget that shows data assets, tables or levels re-reads them when they
  change on disk, whoever wrote them (an edit, a tool, an agent, another program):
  `const rev = api.assets.useRevision({ dir: 'assets/data/waves', suffixes: ['.json'] })` as an effect's
  dependency, or `const off = api.assets.onChanged((paths) => …, { dir, suffixes })` (call `off` on unmount;
  `paths` are project-relative, `null` when anything may have changed). Never poll the files.
- **State that must survive** a re-dock or reload lives in the project (assets, the scene) or in
  module state outside the component, not in `useState` alone: moving a widget to another group
  remounts it.

## Placing widgets in a mode

A mode places a widget like a built-in panel, so the same code serves both:

```tsx
panels: [
  { widget: 'td.waves', dock: 'left', size: 300 },
  { builtin: 'scene', dock: 'center' },
  { builtin: 'inspector', dock: 'right' },
],
```

Each widget at most once per mode. Users who want another arrangement pick **Customize a copy**
in the Mode picker: the mode's layout becomes one of their own layouts, editable.

## Checking your work

- Typecheck: `npx tsc -p editor/tsconfig.json` (JSX factory `React.createElement`).
- Save the file: the editor reloads it; errors show in the status bar with the file name.
- In the editor, open **My layouts › New layout**, press **+** in a tab strip and pick it under
  *Project widgets*; drag its tab onto an edge of another group to split.
- Look at it: `gameengine editor screenshot waves.png --widget td.waves` (MCP `editor_screenshot` with
  `widget`) captures just the widget. Its group must be showing its tab, or the widget popped out; show it
  narrow and wide by docking it in a side column and a bottom strip.

Example: `samples/gem-cascade/editor/widgets/level-goals.tsx` in the engine repository.
