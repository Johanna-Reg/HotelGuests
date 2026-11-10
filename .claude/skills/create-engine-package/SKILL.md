---
name: create-engine-package
version: 1.4.0
tier: optional
description: Create and maintain Game Engine package repositories from the GitHub template using an installed engine. Use when extracting reusable code, adding schemas, mobile SDK plugins, Rust or build steps, testing a packed package, or changing its minimum engine version, CI and automatic release.
---

# Create or maintain an engine package

Use this skill for the package repository. For consuming a package in a game, read
[packages](../packages/SKILL.md). Use the installed engine; authors do not need engine source.

## New repository

Create `tactilegames/gameengine.<name>` through the GitHub template
[`tactilegames/gameengine.package-template`](https://github.com/tactilegames/gameengine.package-template).
Use **Use this template**, or:

```sh
gh repo create tactilegames/gameengine.<name> --template tactilegames/gameengine.package-template --private --clone
```

The npm name is `@tactilegames/gameengine.<name>`. The dot separates the engine target from the
name; hyphens belong inside the name, such as `gameengine.web-service-client`.

In the new checkout, read `AGENTS.md`, `README.md` and `recipes/README.md`, then use its explicit
configuration step:

```sh
npm ci --ignore-scripts
npm run configure -- --name <name> --description "What this package does"
```

Start with the TypeScript base. Add only the parts needed through
`npm run configure -- --parts <comma-separated-parts>`. There is no first-push rewriting or
engine command that creates repositories. For an existing package, keep its identity and
start with its repository instructions instead of running initial configuration again.

## Develop and deliver

1. Check `gameengine --version` against the package's minimum. Declare only
   `gameengine.engine: ">=X.Y.Z"` with no upper bound. Packages adapt when newer engines break
   them; engine releases do not wait for package compatibility. Pin the CI engine separately.
2. Implement the public exports and add tests in the same repository's `testbed/`. Ship
   ready-to-use TypeScript, generated bindings and declared directories through the npm
   `files` allowlist. Engine installs run no npm lifecycle scripts.
3. Run `npm run validate` and the explicit E2E command from the repository. Validation must
   exercise the packed tarball on V8 and Hermes, not merely the source tree. Verify native
   execution and mobile SDK delivery separately when those parts are present.
4. Open a scoped PR with the evidence and remaining gaps. Eligible default-branch merges
   version and publish automatically. Enabling publication or changing credentials/access
   still needs owner authorization. Games keep their lock until they update.

## Read only the reference needed

| Task | Read |
|---|---|
| Add schema, services, assets, exports, settings, tools, editor modes or a usage skill | [Package layout](references/package-layout.md) |
| Add Rust systems or Kotlin/Swift SDK plugins; establish native/mobile proof | [Native and mobile](references/native-and-mobile.md) |
| Add code generation, build checks, private build inputs or upload steps | [Build steps and checks](references/build-steps.md) |
| Maintain the testbed, CI, versions, release gate or built-in extraction | [Validation and release](references/validation-and-release.md) |

The package repository owns its current setup and CI commands. These references explain the
engine contract; do not copy the template's scripts or shared workflows into this skill.
