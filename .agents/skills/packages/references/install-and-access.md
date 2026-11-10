# Installation, package contents and registry access

In an engine-managed npm project, declare dependencies in ordinary `package.json` and commit `package-lock.json`. The editor installs them before bundling. The CLI's `gameengine package install` restores them without running an npm executable; `--offline` requires cached content, and a complete locked cache also restores offline automatically. Exact versions, ranges and ordinary nested dependencies use npm's own resolver. Existing pnpm and yarn projects keep their manager; `package install` skips them unless `--engine-managed` explicitly opts into engine-managed npm installation.

The selected engine supplies its real runtime as a portable local npm tarball under `.gameengine/npm/`, with a normal required dependency and lock integrity. The engine recreates it after a clone or move. Package runtime peer ranges must match that supplied runtime; do not add a separate registry runtime.

An engine distribution chooses default scoped registries. `gameengine login` uses the running editor's existing login. Its access token is supplied to registry metadata and tarball requests without entering project files, lockfiles or caches. A project may override `registries` with `{ "url": "https://registry.example/npm/", "scopes": ["@studio"], "auth": "env:PACKAGE_TOKEN" }`; other auth choices are `npmrc`, `none` and `login` for a distribution-trusted registry. Literal project credentials are refused. Npm lifecycle scripts are disabled; publish packages ready to use. Engine build steps and native Rust are reported before updating the lockfile. `gameengine --version` supplies the compatibility version for `gameengine.engine`.

Managed npm installs take GitHub dependencies pinned to a full commit (`github:owner/repo#<sha>`), downloaded as archives with preparation disabled; `add --git owner/repo#tag` pins the tag for you. Other Git sources are refused because npm's fetcher can run preparation subprocesses. The unpinned Git recipes below apply to existing pnpm/yarn projects.

```sh
gameengine package add @studio/boosters@^1.2              # a registry (public or private)
gameengine package install --offline                    # a committed lockfile and cached content
gameengine package list                                 # what each package provides
gameengine package check --remote                       # engine range, pinning, git access
```

For pnpm/yarn projects:

```sh
gameengine package add --git studio/boosters#v1.2.0       # GitHub over SSH
gameengine package add --git studio/boosters#v1.2.0 --https
gameengine package add "github:studio/boosters#semver:^1.2"
```

`add`, `remove` and `update` use the engine installer for npm projects and the project's existing
manager for pnpm or yarn, then run `gameengine gen`, so package types, services and plugins land in the generated files.
Commit `package.json`, the lockfile and the regenerated files together. An installed npm package
is on: `add` applies what its `switchOn` brings (plugins, values) and `remove` takes it back out,
as `package on|off` does for a built-in one. Its `settings` work as a built-in package's:
`gameengine package settings @studio/vendor`, `gameengine package set @studio/vendor <key> …`,
the fields under its row in the editor's Packages panel, and `validate` warnings while one is
missing.

Then:

- **Code:** `import { BoostersSystem, Booster } from '@studio/boosters'`; export its systems from your
  game like your own.
- **Components in scenes:** package components work in `scenes/*.scene.json` and the inspector
  as soon as `gen` has run — no import needed.
- **Services / plugins:** package services appear in `src/services.gen.ts`; enable package
  plugins by id in `project.gameengine.json` `plugins`, like your own.
- **Skills:** installed with `gameengine skills update`.
- **Rust systems:** a package with `gameengine.native` makes the project build its own host and
  player. Its Rust systems run only in place of the
  TypeScript twins you register: a package system you don't export from your game doesn't run.
  Your own `native/` or transpiled system with the same name wins. `GAMEENGINE_NATIVE_SYSTEMS=off`
  runs the twins.
- **Images:** a package's images have keys `pkg/<npm name>/<path>`:
  `Sprite { image: "pkg/@studio/boosters/rocket" }` in a scene, like your own `assets/` keys. Bundle
  and asset-group globs and collections see them as `assets/pkg/<npm name>/…`
  (`"include": ["assets/pkg/@studio/boosters/**"]`). They load in dev runs, tests and every cook
  straight from `node_modules`; never copy them into `assets/`. A file of yours with the same key
  (`assets/pkg/@studio/boosters/rocket.png`) wins over the package's, with a warning.

## Pin git dependencies in pnpm/yarn projects

A git dependency without a ref follows the default branch and changes under you. Always pin:
`#v1.2.0` (tag), `#3f2a9c1` (commit) or `#semver:^1.2` (newest matching tag). `package check`
warns on branches and missing refs. The lockfile records the exact commit either way; `update`
moves it.

## Private access and install failures

For approved private Tactile packages, use engine sign-in and the distribution's registry defaults.
Developers do not need a GitHub token or an npm login. Credentials accompany both metadata and
tarball requests, and must never appear in logs, project files, lockfiles or caches.

**Without a working engine login** (signed out, a checkout running without Auth0, or a token the
registry answers with 401), `@tactilegames/gameengine.*` packages fall back to GitHub using the
developer's own git credentials: `GH_TOKEN`/`GITHUB_TOKEN`, then `gh auth token`, then
`git credential fill` for github.com. Nothing prompts, and SSH keys cannot be used. `catalogue`,
`releases` (semver tags), `branches`, `commits` and `add` then read `tactilegames/<name>` on GitHub,
and `add` writes a commit pin such as `github:tactilegames/gameengine.x#<sha>` with no source
tracking. The same credentials download every pinned GitHub dependency whose owner has no
`//api.github.com/repos/<owner>/…:_authToken` in npmrc. `add --git owner/repo#v1.2.0`
pins the tag to its commit. The command logs `no engine login: installing … from GitHub`.

| Symptom | Check next |
|---|---|
| 401 | The engine session's access token may be missing, expired or for the wrong audience. Commands fall back to GitHub when git credentials exist; otherwise sign out of the editor, sign in again and retry. |
| 403 | The signed-in account needs `tactile-create:npm-packages:view`. Ask the owner to check access; repeated login does not grant permission. |
| 404 | Check the exact package name, published version and allowed scope. A local repository or a merged PR alone is not a published package. |
| 503 | Gateway upstream configuration is missing; report it to the registry owner. |
| Integrity mismatch | Stop using that download; investigate the registry/cache response rather than editing integrity hashes. |
| Engine compatibility error | Compare `gameengine --version` with the package's `gameengine.engine` requirement. Update the engine or select a compatible package version. |
| Dependency conflict | Read the conflicting ranges, choose compatible versions and regenerate the lockfile through the installer. |
| Offline cache miss | Restore the locked dependencies online once; an incomplete cache cannot supply a missing tarball. |

These HTTP meanings describe the Tactile Create gateway. Another registry may use different errors.

Existing pnpm/yarn Git projects retain Git's own authentication. Use their existing SSH or
CI credential setup and pin tags or commits. `package check --remote` checks Git access; it
does not prove a registry tarball can be downloaded or that a package works in a game.

For another registry, use the project's explicit auth mode above. A checked-in npmrc may
reference an environment variable, never a literal token. Do not dump resolved npm configuration
or authorization headers to diagnose access.
