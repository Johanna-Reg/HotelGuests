# Built-in packages, settings and migration

Built-in packages are versioned with the engine and need no install:

```json
// project.gameengine.json
"packages": ["<name>"]
```

`gameengine package list` shows the ones switched on and the ones available, and
`gameengine package on <name>` / `off <name>` switches one and runs `gameengine gen` (edited by hand,
run `gen` yourself). The editor's Packages panel does the same for a person (a checkbox per
built-in package) and lists the npm packages with their pinning. A package can bring more with its
switch (its `switchOn` in package.json): `package on <name>` also adds the plugin it names and
values such as `crash.forward`, and `off` takes them back out. A package that needs values from the game (an app
id per platform) lists them as `settings`: `gameengine package settings <name>` shows them,
`gameengine package set <name> <key> --ios <v> --android <v>` (or `<value>` for one value) writes
them, checked against the package's pattern; `env:NAME` reads one from the build environment, and
an empty value (`--ios ''`) leaves the package off there on purpose.
The panel shows the same fields under a switched-on package's row, and `validate` warns
(`W_PACKAGE_SETTING`) while one is missing. MCP: `package_switch`, `package_settings`, `package_set`. Then use it like an installed package
([installation and access](install-and-access.md)): `import … from '@gameengine/<name>'`,
images `pkg/@gameengine/<name>/…`. Importing a built-in
package the game does not switch on fails the bundle, naming the switch. Its code ships in the
game's builds; its `editor/`, `tools/`, `dev/`, `tests/` and `build/` never do. Some carry Rust systems: those
are already compiled into the engine, so your game needs no Rust toolchain for them, and your player
gets a package's Rust only when you switch the package on. Some answer a service in their Rust
(`rust: true` in the package's `services/`): call it from
UI or other non-sim code like any service; it needs no plugin, and test mocks still win over it. Others
ship a native plugin for their service: name the plugin in `plugins` as well (`package on` adds it
when the package's `switchOn` lists it), and set its `services` keys; the package's skill lists them.
Some have build steps that run when you build the game (turning a settings file of yours into
a generated `src/*.gen.ts`): after editing such a file, `gameengine build-steps run` refreshes the generated
file now (every build does it too), and the file you edited never ships. Read [build steps and checks](../../create-engine-package/references/build-steps.md) when changing one.

## Installed package settings

An installed npm package is active. `package add` applies its `switchOn` plugins and values;
`package remove` takes them back out. Configure it with its full npm name:

```sh
gameengine package settings @studio/vendor
gameengine package set @studio/vendor appId --ios <public-app-id> --android <public-app-id>
```

The Packages panel shows the same fields, and `gameengine validate` warns while a required value
is missing. Settings ship inside the app. Keep upload tokens and other secrets in the build
environment, never in these fields.

## Replacing a built-in package

Follow the replacement package's migration skill. Disable the built-in copy before activating
the remote copy, then check imports, plugin IDs, settings and service initialization. Test the
game on both JS engines and compile the affected platforms. A facade test with mocks does not
prove device SDK initialization or vendor event delivery.
