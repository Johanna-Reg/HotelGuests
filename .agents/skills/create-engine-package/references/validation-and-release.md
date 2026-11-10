# Validation, maintenance and release

## Packed-artifact proof

Read the repository's `AGENTS.md`, scripts and testbed before changing its validation. The
template's `npm run validate` checks engine compatibility, TypeScript, unit tests, generated
files, the tarball allowlist and source/packed testbeds on V8 and Hermes. The packed run installs
the tarball into an isolated copy; tracked testbed inputs stay untouched.

Use public exports in the testbed. Test service startup and the package behavior a game relies
on. For Rust, require the named systems to report native execution, as described in
[native and mobile](native-and-mobile.md). Unit tests stay in memory. Tests with real files,
processes or network belong to the explicit E2E command and its isolated scratch directory,
with cleanup on failure. Testbeds, authoring scripts, credentials and caches stay out of tarballs.

Record source validation, packed validation, native compilation, native execution and vendor
delivery separately. A green mock test or dry-run assembly cannot stand in for a device test.

## Existing package maintenance

- Read its pinned CI engine and declared minimum separately. Raise the minimum only when a new
  API requires it; update the CI pin as ordinary maintenance. Never add an upper bound to protect
  an old package from future engine changes.
- Compare template infrastructure with the current template before porting changes. Keep a
  template/CI update separate from package behavior when it can be reviewed independently.
- Commit generated TypeScript/JSON/Rust schema bindings. A game's installation cannot generate
  missing files through npm scripts.
- Package skills teach game developers how to use the package. The repository's `AGENTS.md`
  teaches package maintainers how to develop and verify it.

## CI and automatic releases

The template calls the dedicated
[`tactilegames/gameengine.package-workflows`](https://github.com/tactilegames/gameengine.package-workflows)
repository, with validation and publishing pinned to the same immutable commit. It is separate
from Unity UPM workflows. Read the caller and shared workflow for current inputs and permissions
instead of copying their implementation here.

Publishing requires a configured identity, a matching repository/package name, no `private: true`,
and `PACKAGE_PUBLISHING=enabled`. The template itself and unconfigured copies cannot publish.
The gate is the checked-in `scripts/release-check.mjs`; use the repository's release-check
command to inspect eligibility. Passing CI alone does not enable publication. Use existing
authorized publication credentials through CI; never put them in package settings or logs.

After validation passes, eligible default-branch merges run semantic-release. Conventional
`feat` commits produce a minor, `fix`/`perf`/`refactor` a patch, and breaking changes a major.
Check `release.config.cjs` for the actual branch and rules. Other changes may produce no release.
Renaming or removing a public component, field or service method needs a breaking release
because scenes and saves refer to those names.

Publication uses GitHub Packages. Consumers read through the engine's configured registry,
including Tactile Create for approved private packages. Publication does not update games'
lockfiles or create a searchable catalog in the editor. It appears in a game's Packages panel
after installation into that game.

## Extracting a built-in package

Preserve its public behavior, settings, service lifecycle and platform plugins in the standalone
package. Include a migration skill telling games how to disable the built-in before enabling
the replacement. Keep the built-in until the replacement is published and a real gateway install
has been verified. Check a newly installed game, packed tests, platform compilation and relevant
device/vendor behavior before claiming replacement acceptance.
