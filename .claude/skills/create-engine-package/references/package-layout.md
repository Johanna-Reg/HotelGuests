# Package layout and public contract

Read the generated repository's `AGENTS.md`, `README.md` and `recipes/README.md` for current setup
and recipe options. An installed engine supplies the APIs; source checkout paths never belong
in a standalone package manifest.

Choose a real minimum engine version in place of `X.Y.Z`. The example lists optional directories
only to show their manifest keys.

```json
{
  "name": "@studio/boosters",
  "version": "1.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts", "./schema.gen": "./src/schema.gen.ts" },
  "peerDependencies": { "@gameengine/runtime": "*" },
  "peerDependenciesMeta": { "@gameengine/runtime": { "optional": true } },
  "gameengine": { "engine": ">=X.Y.Z", "schema": "schema", "skills": "skills", "assets": "assets" }
}
```

- `gameengine` lists only what the package has: `schema`, `services`, `plugins`, `skills`,
  `editor`, `tools`, `assets`, `native`, `build` (directories inside the package) and `engine` (a
  semver range).
- **What a game must set:** `switchOn` (`{ "plugins": ["<id>"], "set": { "crash.forward": "…" } }`:
  plugin ids from its `plugins/`, and dotted values set when the game has none) and `settings`
  (`[{ "key": "appId", "path": "services.vendor.appId", "label": "App id", "help": "…",
  "platforms": ["ios", "android"], "pattern": "^[A-Za-z0-9]{5}$" }]`: one value, or one per
  platform with `platforms`; `pattern` checks literal values, `env:NAME` is always accepted). The
  CLI, MCP, the editor's fields and `validate` all read these, so the game is asked for exactly
  what the package needs. Never put a secret in a setting: settings ship inside the app.
- **Images:** PNG, JPG and TGA files under `assets/` (any depth). Ship a `.gmeta` beside each
  one (`guid` from `uuidgen`, `importer = "texture"`, `[settings]` as in a project: `atlas`,
  `max_size`, …): the engine never writes into `node_modules`, so a file without one gets a GUID
  derived from its path, which changes if you move it. Only images for now: other files under
  `assets/` are ignored.
- **Schema:** declarations in `schema/*.schema.ts`; run `gameengine gen --package .` and commit
  `src/schema.gen.ts` and `schema.gen.json`. Import tokens from `./schema.gen.ts` in the package's
  code. Name types so they won't clash with a game's (prefix them if generic: `BoosterFx`, not `Fx`).
- **Build steps and checks:** `"gameengine": { "build": "build" }` and `build/*.build.ts` files. Read [build steps and checks](build-steps.md).
- Ship TypeScript source; the game's bundler compiles it. `@gameengine/*` is an optional peer: the
  project's engine provides it, so never bundle or pin your own copy.
- Keep sim code deterministic (skill `determinism`): a package system runs inside every game's
  hash and replays.
- Test it inside a sample or a small test project that depends on it, on both JS engines
  (`gameengine test <project> --js both`).
- Version with semver and tag releases (`v1.2.0`) so git users can pin them. A new major is
  needed when you rename or remove a component, field or service method: games' scenes and
  saves reference them.
- Include a skill (`skills/<name>/SKILL.md`) that tells agents how to use the package.

A built-in package has the same layout as an npm package. A package's code ships in the builds of the games that
use it; `examples/services/*` never ship (copy those into the project instead of importing them).

## Current limits

Package assets support images, not scenes, prefabs, data assets, audio or other non-image content.
Rust dependencies between packages use `gameengine.rust.dependencies` mappings and ordinary
Cargo names and versions. Shared libraries declare `gameengine.rust.library`; developer
executables declare `gameengine.rust.tools`. The engine owns compilation and caching for both
runtime and tooling consumers. Packages from a local folder outside the game remain unsupported.
The template's testbed scripts provide the packed-artifact development loop.
