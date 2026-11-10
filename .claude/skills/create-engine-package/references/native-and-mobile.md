# Rust systems and mobile SDK plugins

## Choose the part

The template's `plugins` part adds Kotlin and Swift SDK integration with service declarations.
It does not imply a Rust crate. Add `native` only for Rust systems, with a TypeScript twin.
Use `recipes/README.md` and the repository's validation scripts as the current recipe contract.

## Rust against an installed engine

Run `gameengine --version` and `gameengine setup --native` for the matching SDK and pinned
compiler. An installed engine replaces the engine source checkout, not the platform toolchain.
Use normal Cargo manifests, ship the package crate as source in the npm tarball and commit the
consuming game's `Cargo.lock`. The engine API version is distinct from the engine release version.
Use the engine's reexports for values passed into it, such as `gameengine_game::serde_json::Value`;
a separately declared serde_json dependency has its own types in an SDK build.

- **Rust systems:** a Cargo crate under `native/` that depends on `gameengine-game = ">=0.1"` and
  exports `pub static PLUGIN: GamePlugin` (skill `perf-to-rust`). `gameengine gen --package .`
  writes `native/src/schema.gen.rs`; commit it. Keep each system's TypeScript twin, with the same
  name, and prove them equal with `gameengine test <project> --native both --js both`. Ship the
  crate as source (npm installs it, Cargo compiles it into each game); don't publish it to
  crates.io. Declare cross-package Cargo names in `gameengine.rust.dependencies`, mapping each
  to its ordinary npm dependency. The dependency exports its crate directory through
  `gameengine.rust.library`; Cargo uses a name/version dependency, never a path into node_modules.
  The engine uses this graph for editor Play, game tests and exported players. Pin other third-party dependencies exactly
  (`= "=1.2.3"`, a git dependency with `rev`): a hub app lends a package's Rust to the games it
  launches only for the same package build, and that build hash reads `Cargo.toml`, not a
  `Cargo.lock`. `gameengine package check` fails on a looser one. A built-in package's crate exports
  `pub static PACKAGE: gameengine_game::Package` instead.
- **Developer executables:** declare `gameengine.rust.tools.<name>` with `crate`, `bin` and
  optional `features`, then call `ctx.rustTool(name)` from a project tool. The engine builds and
  caches it with pinned Rust; it never enters a game. Use `gameengine package rust check
  --package-dir <repo> --project <scratch>` for fmt, Clippy and tests with the same npm resolution.
  Keep the crate lockfile in the published package. Packages need no custom Cargo build launcher.
- **Rust services (built-in packages only):** declare the service with `rust: true` in
  `services/*.schema.ts`, and give `PACKAGE` a `services` factory returning a
  `gameengine_game::services::Backend` that answers every method of it. The
  package's TypeScript API calls it with `callService`. A session creates the backend only when its
  game switches the package on, and replays never call it. An npm package's service needs a plugin.
  The backend's `reset` runs on every world rebuild (each game test, a hot reload): clear per-session
  state there so tests stay independent. Reach the network through the engine's `net` service
  (`inbox.call("net", …)`), which game tests mock, not a client of your own; never hand the
  backend's `Inbox` to the package's systems (sim code stays free of service outcomes).

## Prove native execution

Generate and commit the schema bindings, register the package systems through the testbed's
public exports and run the template's validation. It checks the systems named in
`packageTemplate.nativeSystems` for `native: true` and `runs > 0` on V8. Another package's Rust
system running, a successful compiler exit, or matching TypeScript hashes does not satisfy this.
Where the selected SDK supports native Hermes execution, validate those systems there too.

## Mobile acceptance

Compile the Kotlin/Swift plugins against the actual vendor SDKs through a game build. Desktop
service mocks and Android/iOS dry-run assembly do not prove native compilation. Then test
initialization, consent/lifecycle behavior and event delivery on the intended devices. Record
what reached the vendor backend separately from compilation and launch.

Mobile Rust requires a release with target-specific SDK assets and installed-SDK mobile builds.
Check the installed release's `gameengine setup --help`, build help and matching release assets.
Desktop native support alone does not establish mobile support. Do not replace missing
installed-SDK support with paths into an engine checkout. Ordinary Android SDK/NDK and iOS build prerequisites still
apply. The SDK/compiler run on the build machine; the app contains the compiled native code.
