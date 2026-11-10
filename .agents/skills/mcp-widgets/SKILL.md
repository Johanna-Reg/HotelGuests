---
name: mcp-widgets
version: 1.2.1
tier: optional
description: MCP App widgets via `widget_show` — live UI document editors, inspectors, layer trees, engine previews and one Save, built on engine.callTool, viewport, live, field, tree, history and task. Use when building or polishing an interactive widget for a chat host, or when one is slow, unthemed, inaccessible, stale or saves wrongly.
---

# Building engine widgets for chat hosts

`widget_show` puts an interactive MCP App in the chat: your HTML, CSS and browser JavaScript, run
in the host's sandbox, talking to this project's engine through `engine.callTool`. This skill is
the workflow and the quality bar. The API reference and every limit live in the resource
**`gameengine://widget-guide`**: read it first, every time, because it is the version this engine
serves. Driving the engine without a widget is skill `mcp-tools`; the documents themselves are
skill `ui-documents`.

## Pick the smallest widget that does the job

Build up only as far as the task needs:

1. **No widget.** One change the user described in words: call `ui_doc_*` tools directly.
2. **`engine.controls`** — a labelled form with debounced live preview and a Save button. Enough
   for a handful of values on known layers (the example in the guide).
3. **Custom HTML + helpers** — a hierarchy, an inspector built from `ui_doc_inspect` metadata, a
   canvas with picking and gizmos, a timeline. Compose the helpers below with your own markup.
4. **Anything else** — arbitrary DOM, canvas and CSS stay supported. The helpers are optional;
   use them where they fit and plain code where they don't.

| Helper | Use it for |
|---|---|
| `engine.viewport` + `engine.gizmo` | Show engine PNGs, pick named layers, drag/resize a rectangle in view points |
| `engine.live` | Latest-only preview queue: one call in flight, newer drafts replace queued ones |
| `engine.field` | One labelled inspector row with parse, inline errors and optional reset |
| `engine.tree` | Keyboard-navigable hierarchy with filter, Alt+↑/↓ reorder and gated drag reparenting |
| `engine.history` | Bounded JSON undo/redo with Ctrl/⌘+Z that leaves text editing alone |
| `engine.task` | One exclusive operation (load, Save, sampling): locks panels, settles previews, then runs |

`tools/cli/examples/mcp-authoring` in the engine checkout uses all of them in one studio (layers,
canvas, inspector, poses, JSON, 16-frame animation scrubbing). Read it when you need a pattern the
example below does not show.

## Who does what

The engine is the authority; the browser only holds a draft.

- **Engine (tools):** layout, text shaping, images, easing and animation sampling
  (`ui_doc_preview` with `times`/`phase`), validation, bounds for picking, and the one atomic,
  hash-guarded write (`ui_doc_save`). No game code runs in a preview.
- **Browser (your code):** the draft document, selection, panels, input, undo history, zoom and
  the cached frames it was given.
- Never re-implement layout, easing or styling in CSS or canvas to fake a faster preview: it will
  disagree with the device. Fast scrubbing comes from caching engine frames (a contact sheet with
  up to 16 `times`), not from simulating them.

## Package previews that run locally

A package tool can opt into a cached web build with `mcpWidget: true` and
`webPreview: { project: './preview/project', entry: './preview/client.ts', prebuilt: 'preview/prebuilt' }`. Paths resolve from the original tool file. Package CI uses `gameengine web-preview --project <template> --owner <build-project> --entry <browser-entry> --export <new-directory>` to export a full build plus a separate UI-only program. Ship the exported directory through the npm allowlist and verify its inclusion. `prebuilt` loads those files without an engine checkout or compiler. Missing or corrupt declared artifacts fail; they never trigger a source build. Omitting `prebuilt` explicitly retains source development, where the first open bundles only the browser entry. Mount ordinary browser controls and a local
viewer first. Request generated data only after geometry edits; never request screenshots for
camera movement. A package tool with `mcpAppData: true` returns up to 8 MiB through standard
result metadata. `engine.json(result)` reads it without model-context text truncation.

The browser entry exports `function mount(engine)`. Offer an optional action that calls
`await engine.webPreview(canvas)` on a separate canvas. It loads the shipped engine program when `prebuilt` is declared. Source-only previews build a cached player with the installed native packages and require an engine checkout, Rust and Emscripten. Its
`nativeCall(packageName, operation, arg)` invokes the same Rust operation locally. Coalesce
drafts with `engine.live`. Simulation stays paused; settled and hidden previews stop rendering.

Keep file reads and explicit hash-guarded Save in package tools. The local runtime has cooked
content in memory and never writes back to the project. One widget owns one runtime, with
64 KiB UTF-8 requests, 1 MiB responses, a 32-call queue and a 2048-pixel render limit per side.
Register package observers and listeners with `engine.onCleanup`; runtime teardown is automatic.

The optional runtime needs WebGPU, a secure context, and host policy allowing WebAssembly and
dynamic JavaScript execution. Standard MCP Apps does not guarantee these browser permissions.
Catch startup failure and retain the baseline viewer. Use no private CSP flags or host changes.
Tool visibility and read-only hints do not override host approval. Verify the actual host before
claiming support; a successful build has not proved browser rendering.

## The live draft loop

1. `ui_doc_inspect({doc})` → `document`, `baseHash`, `fields`, `layerFields`, `poseFields`.
   Keep `baseHash`; build controls from the metadata instead of hard-coding property lists.
2. Edit a local copy. Every mutation goes through one function that records history, bumps a
   draft revision and schedules a preview with a **clone** of the draft.
3. `engine.live({run})` previews with `ui_doc_preview({doc, document, baseHash})`. After each
   await check `current()` (and your revision) before touching the image or bounds.
4. Previews are bounded: debounced, latest-only, no calls while idle and none per pointer move
   beyond what the queue coalesces. Do not loop or poll the engine.
5. **Save** = cancel pending samples, settle the queues, then one `ui_doc_save` with the same
   draft and `baseHash`; store the returned hash. Edits are locked while it runs.
6. A refused Save (document changed by another writer) means reload, not retry: show the error
   and offer Reload.

## Approvals and honesty

`ui_doc_inspect`/`ui_doc_preview` are annotated read-only and `ui_doc_save` as a write. The
**host** decides what it prompts for; the engine cannot. Some hosts ask once per Save, some ask
for every app-initiated call, some do not render MCP Apps at all (every tool still works without
the widget). So:

- Do not add your own "Are you sure?" before Save on top of the host's approval. Do guard
  destructive *local* actions (discarding an unsaved draft) with a second click or undo.
- Do not tell the user a host will or will not prompt, or that a widget works in a host, unless
  you saw it there. A tool call already sent cannot be revoked by closing the widget.
- Disable Save while the draft is pristine or work is running, so one click is one write.

## Busy state, staleness and cleanup

- Wrap load, Save, frame sampling and any blocking validation in **one** `engine.task` with
  `lock` (the panels being edited) and `settle` (your live queues). `run` shares the running
  promise instead of queuing, so guard buttons with your own busy flag and give separate
  operations separate tasks if they may overlap.
- `current()` turns false when the widget is replaced or closed. After every await: `if
  (!current()) return;`. Never write UI or state from a stale callback.
  This is the callback argument supplied by `engine.live` or `task.run`, not an
  `engine.current()` method (there is none). Initial `engine.callTool` awaits already reject
  when their widget is replaced; catch that error instead of inventing a global current check.
- Keep the original tool result for `viewport.show(result)` or `engine.preview(result)`:
  it contains the image blocks. Use `engine.json(result)` separately for metadata such as
  `bounds` and `baseHash`; decoded JSON alone is not an image result.
- Register timers, observers and document listeners with `engine.onCleanup`. Helpers dispose
  themselves on teardown, but **dispose `engine.field` handles yourself** when you rebuild an
  inspector, or old rows pile up until the widget closes.

## Undo

- `history.change(() => mutate(draft))` for discrete edits: one snapshot, rolled back if the
  mutation throws, no entry when nothing changed.
- `history.record()` once at the **start** of a drag or other continuous gesture, then mutate
  freely; never one entry per pointer move.
- Capture what the user perceives as state (draft plus selection), keep it JSON and small.
  `restore` must update the draft *and* the rendered UI (tree, inspector, preview).
- Undo after Save makes a new unsaved draft; it never writes on its own.

## Look and feel

- **Theme:** the host sets `data-bs-theme="light|dark"` on `<html>` and may supply CSS variables
  (`--color-background-primary`, `--color-text-primary`, `--color-border-primary`,
  `--font-sans`, …). Define your colours as tokens with light defaults, a
  `[data-bs-theme='dark']` set, and a `prefers-color-scheme` fallback when no theme arrives. Check
  both themes; never ship dark-only colours.
- **Width:** chat columns run from about 300 to 1400 px. No fixed `min-width`; collapse three
  panels to canvas + sidebar, then to one column, and confirm `scrollWidth === clientWidth`.
- **Height:** the frame auto-resizes to content, so never size from `vh` (it feeds back). Use
  fixed panel heights with internal scrolling on wide layouts.
- **Canvas:** offer Fit (default, follows resizes) and 1:1. Keep the engine image crisp and
  unstretched; picking and gizmos work in view points, not CSS pixels.
- **Density:** 12–13 px UI text, 28–32 px controls, humanised labels ("Width", not "w"), reset
  buttons only on overridden values, and one obvious primary action.

## Keyboard, feedback and motion

- Every action reachable by keyboard: the tree (arrows, Home/End, type-ahead, Alt+↑/↓), a Parent
  field as the keyboard route for reparenting, visible `:focus-visible` rings, Ctrl/⌘+S for Save
  if you add it (blur the focused field first so its value commits).
- Icon buttons get `aria-label`; toggles use `aria-pressed`; keep a humanised visible label but
  set the input's `aria-label` to the raw key if tests or agents address fields by key.
- Feedback: a saved/unsaved indicator, `engine.setStatus` for progress and results (it is the
  live region; do not add a second one), field errors inline via `parse`/`onCommit` throws. Every
  error says what to do next: retry, reload, fix a value.
- Values from documents go in `textContent` or input values, never `innerHTML`.
- Honour `prefers-reduced-motion`: no decorative transitions, and playback shows the final frame
  (scrubbing still steps through frames). Stop playback when the document is hidden.

## A complete small widget

Edits the heading and panel colour of UI Gallery's `confirm` view with live engine previews,
undo and one Save. Call `widget_show` with `data: { "doc": "confirm" }` and:

```html
<div class="mini">
  <header><strong>Confirm dialog</strong><span id="state">Saved</span>
    <button id="undo" aria-label="Undo">↶</button><button id="redo" aria-label="Redo">↷</button>
    <button id="save" class="btn btn-primary btn-sm" disabled>Save</button></header>
  <div class="body"><div id="fields"></div><div id="stage"></div></div>
</div>
```

```css
.mini { display: grid; gap: 8px; font: 13px/1.4 var(--font-sans, system-ui); }
.mini header { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.mini header strong { margin-right: auto; }
.mini .body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
@media (max-width: 560px) { .mini .body { grid-template-columns: minmax(0, 1fr); } }
#stage .engine-viewport { width: min(100%, 320px) !important; }
```

```js
const $ = (s) => engine.root.querySelector(s);
const doc = engine.data.doc;
const inspected = engine.json(await engine.callTool('ui_doc_inspect', { doc }));
let draft = structuredClone(inspected.document);
let baseHash = inspected.baseHash;
let dirty = false;
const fields = [];
const view = engine.viewport({ target: $('#stage'), width: 393, height: 852 });
const preview = engine.live({
  run: async (document, current) => {
    const result = await engine.callTool('ui_doc_preview', { doc, document, baseHash });
    if (current()) await view.show(result);
  },
});
const saving = engine.task({ lock: [$('#fields')], settle: [preview] });
const history = engine.history({
  capture: () => draft,
  restore: (value) => {
    draft = value;
    dirty = true;
    refresh();
  },
  keyboardTarget: engine.root,
  enabled: () => !saving.running(),
  onChange: sync,
});

function sync() {
  $('#state').textContent = saving.running() ? 'Saving…' : dirty ? 'Unsaved' : 'Saved';
  $('#save').disabled = !dirty || saving.running();
  $('#undo').disabled = !history.canUndo();
  $('#redo').disabled = !history.canRedo();
}
function edit(mutate) {
  history.change(() => mutate(draft));
  dirty = true;
  refresh();
}
function refresh() {
  for (const field of fields.splice(0)) field.dispose();
  $('#fields').replaceChildren();
  const bg = draft.nodes.cf_panel.style?.bg;
  fields.push(
    engine.field({
      target: $('#fields'),
      label: 'Heading',
      type: 'text',
      value: typeof draft.nodes.cf_title.text === 'string' ? draft.nodes.cf_title.text : '',
      parse: (raw) => {
        if (!String(raw).trim()) throw new Error('Enter a heading');
        return raw;
      },
      onCommit: (text) => edit((d) => (d.nodes.cf_title.text = text)),
    }),
    engine.field({
      target: $('#fields'),
      label: 'Panel colour',
      type: 'color',
      value: (bg ?? '#ffffff').slice(0, 7),
      onCommit: (hex) => edit((d) => ((d.nodes.cf_panel.style ??= {}).bg = hex + 'ff')),
      onReset: bg === undefined ? undefined : () => edit((d) => delete d.nodes.cf_panel.style.bg),
    }),
  );
  preview.schedule(structuredClone(draft));
  sync();
}
$('#undo').onclick = () => history.undo();
$('#redo').onclick = () => history.redo();
$('#save').onclick = () => {
  const run = saving.run(async (current) => {
    const result = engine.json(await engine.callTool('ui_doc_save', { doc, document: draft, baseHash }));
    if (!current()) return;
    baseHash = result.baseHash;
    dirty = false;
    engine.setStatus('Saved · one validated write');
  });
  sync();
  run.catch((error) => engine.setStatus(`Save failed: ${error.message}. Reload if the file changed elsewhere.`)).finally(sync);
};
refresh();
```

Scale it up by deriving the field list from `inspected.fields`/`layerFields`, a tree from
`document.nodes`, and picking from the preview's `bounds`, as the studio example does.

## Acceptance checks before you hand it over

- Opens with the saved document and Save disabled; the first edit flips it to Unsaved.
- Each edit shows a new **engine** image within about a second; rapid typing does not stack
  calls (count `ui_doc_preview` calls) and nothing is called while idle.
- The source file is unchanged until Save; Save makes exactly one `ui_doc_save`, then reads Saved.
- A Save after another writer changed the file fails with a message that says to reload.
- Undo/redo restore both the draft and what is on screen; a drag is one undo step.
- Readable and unclipped in light and dark at about 320, 700 and 1200 px; no horizontal scroll.
- Everything works by keyboard; inputs have names; errors appear next to the field.
- Replacing or closing the widget mid-render or mid-save leaves no timers and no stale writes to
  the page.
- In a host you could not test, say so plainly rather than claiming it works there.
