---
name: packages
version: 1.17.0
tier: optional
description: Game Engine package add, install, update and remove; built-in activation, settings, engine login, lockfiles and compatibility. Use when a game needs a shared dependency, a package migration or help with registry access. For creating or maintaining the package itself, use create-engine-package.
---

# Use packages in a game

A Game Engine package is an npm package with a `gameengine` field in `package.json`. Built-ins
ship with the engine and are switched on per game. Independent packages are installed into the
game and may supply systems, services, plugins, schema, images, skills or build steps.

## Common path

1. Run `gameengine --version` and `gameengine package list` in the game. Read the package's
   own skill when available for imports, settings and platform requirements. Check that the requested package
   version is published; a repository or merged PR alone is not installable.
2. For a built-in, run `gameengine package on <name>`. For a published registry package, run
   `gameengine package add @scope/name@<version-or-range>`. Tactile packages use
   `@tactilegames/gameengine.<name>`. Approved private reads use engine sign-in, without a
   developer GitHub token or npm login.
3. Inspect `gameengine package settings <name>` and set the required public values with
   `gameengine package set <name> <key> ...`. `add` and `on` apply declared activation defaults
   and regenerate bindings. Never put a secret in settings; they ship in the app.
   A package's iOS permission texts (its plugin's `<lang>.lproj/InfoPlist.strings`, such as the ATT prompt) are
   replaced per key and language from the game's `ios/<lang>.lproj/InfoPlist.strings`, never by editing or forking
   the package (skill `ship-mobile`).
4. Import the package's public exports and register its systems like the game's own. Run
   `gameengine validate` and game tests on V8 and Hermes. Compile affected native plugins;
   mocks alone do not verify a mobile SDK.
5. Commit `package.json`, the lockfile and regenerated files together. On a fresh checkout,
   `gameengine package install` restores engine-managed npm dependencies without running npm
   or lifecycle scripts. A complete locked cache also works offline.

Use `gameengine package update <name>` to move a locked dependency deliberately, and
`gameengine package remove <name>` to remove it. Built-ins use `package off <name>`. Inspect
the project's existing package manager before changing it; pnpm/yarn projects keep their manager.

The editor's Packages panel shows built-ins and the project's installed packages. It is not a
registry catalog. Publishing a package does not add it to a game automatically.

## Read only the reference needed

| Task | Read |
|---|---|
| Install, update, restore offline, use package exports/images/Rust, change registry or diagnose access | [Installation and access](references/install-and-access.md) |
| Activate built-ins, configure package settings or replace a built-in with a remote package | [Built-ins and settings](references/built-ins-and-settings.md) |
| Create, extract or maintain a package repository | [Create an engine package](../create-engine-package/SKILL.md) |
| Change a game's or package's build steps/checks | [Build steps and checks](../create-engine-package/references/build-steps.md) |

Read further references only for the current task. Package authors should keep usage guidance in
their own shipped skill; package repository setup and CI instructions stay in that repository.
