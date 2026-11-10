# Build steps and checks

Work that runs when the game is built, never on Play: code generated from a settings file, an
analytics schema from the game's event types, symbols uploaded after the build. A package keeps its
steps in `build/*.build.ts` (with `"gameengine": { "build": "build" }`); the game keeps its own in
`tools/*.build.ts`. Each file exports one or more `defineBuildStep(...)`:

```ts
// tools/events.build.ts: the game's own step, id game/events
import { defineBuildStep } from '@gameengine/tools';

export const events = defineBuildStep({
  name: 'events',
  description: 'The analytics schema from every class extending AnalyticsEvent',
  // phase: 'pre-build' (default) | 'post-build' | 'build-failed'
  // bucket: 'first' | 'before-default' | 'default' (default) | 'after-default' | 'last'
  run(ctx) {
    const { ts, checker, files } = ctx.types(); // the game's src/, type-checked with its tsconfig
    // …find the classes, their properties (checker.getPropertiesOfType) and JSDoc tags…
    ctx.write('src/analytics/events.gen.ts', code); // any project file, in place
    ctx.artifact('analytics-schema.json', schema, { group: 'analytics' }); // for the build server
  },
});
```

- **When:** `gameengine build android|ios` runs the `pre-build` steps first and then reads the
  project's settings, so a step may set the version or an icon. The `post-build` steps run once the
  app is built and within its size budget (`ctx.build.app` is its path, `ctx.build.symbols` the
  iOS dSYMs), and the `build-failed` steps once after any failure (`ctx.build.error`), a budget or
  a store upload included. `platforms: ['ios']` limits a step to some platforms.
  Dry runs run them too, with `ctx.build.dryRun` set: skip uploads and signing then. `gameengine
  build-steps list` shows the steps in order; `gameengine build-steps run [--phase post-build]
  [--platform ios]` runs a phase now.
- **Order:** by bucket, then by id. Never depend on another package's step by name: pick a bucket.
  The game has the last word in `project.gameengine.json`: `"buildSteps": { "@studio/boosters/levels": "last",
  "@studio/analytics/upload": false }` moves a step or turns it off. A step's id is `game/<name>`,
  `<built-in package>/<name>` or `<npm name>/<name>`.
- **Context:** `ctx.read(path)` (text, or `null`), `ctx.glob('src/**/*.ts')` and
  `ctx.write(path, content)` for any project file (not `.gameengine/`). `ctx.types()` for static
  analysis: Microsoft's native TypeScript 7.1 API (`ts`, `program`, `checker`), the game's source `files` and
  `diagnostics()` (fail when the game doesn't type-check: its types turn `any`), computed once per
  phase. The engine owns the native compiler session: never close it or retain its objects after the phase.
  Migrating old steps: use `type.getSymbol()`, resolve declaration handles with `.resolve()`,
  and read JSDoc tag `.text` directly (it is a string; `displayPartsToString` is gone).
  `program` is the native program, with `getSourceFileNames()` instead of `getSourceFiles()`.
  `ctx.artifact(name, content, { group })` and `ctx.addArtifact(path, { group, name })` (a
  file; zip a folder first) put files in the artifacts folder (`--artifacts <dir>`, else
  `<outDir>/artifacts`), listed in `build-report.json` `artifacts` for the build server to collect,
  failed builds included. Two steps can't write the same artifact. `ctx.message('warning', text)`
  adds a line to the build's summary. `ctx.build` has the platform, config, outDir, artifactsDir and
  dryRun; `ctx.log` prints.
- **Files that never ship:** list the files (not folders or patterns) a step reads that must stay
  off devices in `private: ['boosters.json']`. Keep those at the project root or in a folder of their own, never in
  `assets/`, `src/`, `scenes/`, `plugins/` or the settings files. The build fails if one would ship
  (imported by game code, cooked into content, a branding image, `include_bytes!` in native code).
- **Generated files the game imports** (`src/*.gen.ts`): commit them, since Play and tests read what
  is on disk, and keep the output deterministic so a build doesn't churn them.
- Throw to fail the build; the error names the step. Steps run in Node with your permissions:
  write only what the description says. Example: `samples/tile-maze/tools/events.build.ts`.

### Checks: steps that only look

A step that only inspects the project (a missing SDK key, a wrong app id, an unused preset) is a
check: export `defineBuildCheck(...)` from the same files. Checks are a separate kind so a build
can skip them without leaving a generated file stale.

```ts
// tools/keys.build.ts: the game's own check, id game/keys
import { defineBuildCheck } from '@gameengine/tools';

export const keys = defineBuildCheck({
  name: 'keys',
  description: 'The ads SDK key is set, and test ads are off in release builds.',
  // phase: 'pre-build' (default) | 'post-build'; bucket orders the phase's checks
  run(ctx) {
    const ads = JSON.parse(ctx.read('project.gameengine.json') ?? '{}').services?.ads ?? {};
    if (!ads.sdkKey) ctx.fail('services.ads.sdkKey is empty'); // fails the build (throwing does too)
    if (ctx.build.config === 'release' && ads.testAds)
      ctx.warn('services.ads.testAds is on in a release build', { file: 'project.gameengine.json' }); // never fails it
  },
});
```

- **When:** a phase's checks run before its steps, and every check runs even after one failed,
  so the build lists every problem at once. With the default `--checks fail` a failed check stops
  the build before the phase's steps run.
- **Building anyway:** `gameengine build android|ios --checks warn` turns check errors into
  warnings and builds; `--checks off` runs no check. Use them to get a build out of a project you
  know is broken; the report says the checks were downgraded or skipped.
- **Read-only:** a check reads, globs and type-checks (`ctx.read`, `ctx.glob`, `ctx.types()`) but
  never writes project files: its context has no way to, and don't write through Node either.
  `ctx.scratch` is an empty folder of its own inside the build folder, deleted when it ends, for
  files and tools it needs. Await everything that reports: findings count until `run` returns.
- **Evidence:** `ctx.evidence(name, content)` and `ctx.addEvidence(path)` keep a diff or a log as
  an artifact under `checks/<check id>/`. Every build writes `checks/checks.json` (the mode and
  each check's verdict: passed, warned, failed, downgraded or skipped), failed builds included; the
  build summary lists every finding. A staged build keeps its first stage's mode. `gameengine
  build-steps run --checks warn` runs a phase's checks and then its steps now.
