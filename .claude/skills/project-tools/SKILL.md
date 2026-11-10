---
name: project-tools
version: 1.2.1
tier: optional
description: Project commands for the CLI and MCP with defineTool (tools/*.tool.ts) — level reports, balance tables, content checks, batch edits. Use when a task repeats, when an agent keeps doing the same multi-step inspection, or when a package should ship a tool.
---

# Project tools

**Covers:** Adding the project's own commands to the gameengine CLI and MCP server with defineTool (tools/*.tool.ts) — level reports, balance tables, content checks, batch edits — so agents and people run one command instead of many steps. Use when a task repeats, when an agent keeps doing the same multi-step inspection, or when a package should ship a tool.

A file in `tools/` that exports `defineTool(...)` becomes both a CLI command and an MCP tool:

```ts
// tools/economy-table.tool.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineTool } from '@gameengine/tools';

export const economyTable = defineTool({
  name: 'economy-table',
  description: 'Prints the upgrade cost curve for levels 1..n and the coins a player earns per level. Use when tuning prices.',
  params: {
    levels: { type: 'integer', minimum: 1, maximum: 100, default: 20, description: 'How many levels' },
    format: { type: 'string', enum: ['json', 'csv'], default: 'json' },
  },
  required: [],
  async run(args, ctx) {
    const cfg = JSON.parse(readFileSync(join(ctx.project, 'data/economy.json'), 'utf8'));
    const rows = Array.from({ length: args.levels ?? 20 }, (_, i) => ({ level: i + 1, cost: cfg.base * cfg.growth ** i }));
    return args.format === 'csv' ? rows.map((r) => `${r.level},${r.cost}`).join('\n') : rows;
  },
});
```

```sh
gameengine tool list
gameengine tool economy-table --levels 30 --format csv
gameengine tool economy-table --params '{"levels":30}' --json
```

Over MCP it is `tool_economy_table` with `levels` and `format` as its input schema. The MCP server
reads tools when it starts: restart it (reconnect the client) after adding one.

## Writing good tools

- **Name and description are the interface.** Agents pick tools from the description: say what
  it returns and when to use it.
- **Params:** `string` (with `enum`), `number`, `integer` (with `minimum`/`maximum`), `boolean`,
  `array` of strings or numbers; `default` fills omitted ones; list mandatory ones in `required`.
  CLI flags are coerced and checked for you.
- **Return data, not prose:** return an object or array (printed as JSON, and structured over
  MCP); return a string only for tables meant for people. Throw an `Error` to fail with a message.
- **Use the engine through `ctx.cli`:** `await ctx.cli(['validate'])`, `ctx.cli(['test', '.', '--filter', 'level 3'])`,
  `ctx.cli(['cmd', 'scene.setComponentField', '--params', JSON.stringify({...})])` for undoable
  scene edits. It returns the command's `--json` output and throws when it fails.
- **Read files directly** for fast reports (tilemaps, JSON data, scenes). Write project files
  only through `ctx.cli` scene commands or when the tool's description says it writes.
- Keep them fast (seconds): an MCP call times out after 2 minutes unless `timeoutMs` says otherwise.
- Tools run in Node with your permissions, never in the game: they don't ship to devices, and
  sim rules (determinism) don't apply — but never make one that phones home or reads secrets.
- A `tools/*.build.ts` file exporting `defineBuildStep` or `defineBuildCheck` (same
  `@gameengine/tools`) is not a tool but a build step or check: it runs when the game is built
  ([build steps and checks](../create-engine-package/references/build-steps.md)).
- Test a tool like any code: a vitest that loads it and calls `run`, or `gameengine tool` in CI.

## In packages

A package ships tools in the directory its `gameengine.tools` names (skill `packages`); they show
up in `gameengine tool list` with the package name. Tool names must be unique across the project
and its packages.

Declare Rust executables in `gameengine.rust.tools` with their crate directory and binary name.
`ctx.rustTool(name)` returns the engine-built executable, using the package's normal npm Rust
dependencies and the pinned compiler. Optional `target`, `profile` and `env` select a cross build
or linker. The engine owns source staging, root locks and caching; do not add a Cargo launcher
to the package. Tool packages in a project's devDependencies are discovered without activating
their runtime crates.

Example: `samples/tile-maze/tools/maze-report.tool.ts` (engine repository).

## Package-owned MCP widgets

Set `mcpWidget: true` to display a tool's returned `WidgetSpec` directly in MCP
Apps clients. Keep the view in the package; no engine-specific panel is needed.

```ts
import { defineTool, type WidgetSpec } from '@gameengine/tools';

export const lab = defineTool({
  name: 'my-lab',
  description: 'Open this package’s authoring view.',
  mcpWidget: true,
  run: (): WidgetSpec => ({
    title: 'My lab',
    html: '<p id="message"></p>',
    data: { message: 'Ready to inspect' },
    javascript: 'engine.root.querySelector("#message").textContent = engine.data.message;',
  }),
});
```

Call `tool_my_lab` once over MCP; the CLI still returns the same widget as JSON.
Read `gameengine://widget-guide` for controls, native viewports, tool calls and
cleanup. HTML/CSS/JavaScript/data share the existing 128 KiB bound. Put dynamic
labels in `textContent` or input values. The flag does not grant approval or
make a tool read-only; keep saving in a separate explicit action.
