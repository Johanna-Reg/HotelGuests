---
name: architecture-review
version: 1.3.1
tier: required
description: Architecture review of a game (a file, feature, package or the whole project) for layering (input → sim → presentation), data ownership, module boundaries, determinism, testability and scale. Use before merging a feature, when splitting code into a package, or when asked whether a design is sound.
---

# Architecture review

**Covers:** Reviewing the architecture of a Game Engine game — a file, a feature with its dependencies and dependents, a package, or the whole project — across TypeScript sim systems, UI views, services, Rust native systems, schema, scenes and packages: layering (input → sim → presentation), data ownership, module boundaries, determinism, testability and how it scales with content and team. Use before merging a feature, when splitting code into a package, or when asked whether a design is sound.

Judge the design against how this engine works, not against generic patterns. The rules that
matter most are the ones that break replays, saves, tests and teams later.

## 1. Scope

```sh
gameengine scope src/shop                    # the feature and what it imports
gameengine scope src/shop --dependents       # …and what depends on it (blast radius)
gameengine scope src --depth 1               # the top-level structure only
gameengine package list                      # packages in play, and what each provides
```

Review what the scope lists; engine and package internals are out of scope unless asked (flag a
misuse of their API, not their code). Also read `schema/*.schema.ts` for the types the scope
uses and the scenes/prefabs that instantiate them.

## 2. What to check

**Layers — input → sim → presentation (skill `sim-boundaries`)**
- Sim systems read only sim state, input events and resources; never cameras, UI state, real
  time, `sim: false` components, services or storage. Presentation reads sim, never writes it
  except through events/intents/commands.
- UI is MVC views: controllers fill models, views raise intents (skill `ui-mvc-views`). A view
  reaching into the world, or game rules inside a view, is a finding. A new screen, popup or widget
  keeps its looks in a UI document (skill `ui-documents`); new looks hand-built in TSX and CSS that a
  document could hold are a finding, as is a document's look restyled from code.
- Services (SDKs) are called from UI/presentation only; their outcomes enter the sim as recorded
  events (skill `platform-services`). Analytics goes through signals (skill `signals`).

**Data ownership**
- Every piece of state has one owner: a component (per entity), a resource (per world), a
  document / meta state (progression, economy — skill `meta-economy`), or a save. Module-level
  mutable state in sim code is a bug (lint `no-module-mutable-state`), and so is the same fact
  stored in two places.
- Schema: types small and cohesive, fields named for meaning, `sim: true` only for what the
  simulation needs (it is hashed and replayed); events for things that happen, not for state.
- Saves and documents are versioned with migrations for every shape change.

**Determinism (skill `determinism`)**
- No `Math.random`, `Date`, timers, iteration over unordered sources, or float-sensitive math
  outside `math.*` in sim. Tests run on V8 and Hermes with equal hashes.

**Modules and dependencies**
- Systems grouped by feature, not by kind; a feature exposes a small surface (its systems, its
  schema types, a few functions) and other features use that, not its internals.
- Dependency direction: gameplay features don't import each other in cycles (`scope --dependents`
  shows who depends on what); shared code moves down into a common module or a package, never up.
- Packages (skill `packages`): reusable code has no knowledge of the game using it, a clear
  `gameengine` manifest, prefixed type names, pinned versions, and its own tests.
- Rust native systems (skill `perf-to-rust`) keep a TypeScript twin as the reference and are
  covered by replay parity; Rust used only where the profiler justified it.

**Testability**
- Rules testable with `worldTest` without rendering; balance testable with `simulateMeta`;
  UI testable through view samples; each feature has tests that fail when its rule breaks.
- Recorded replays for critical flows; goldens only where pixels matter.

**Scale — content, players, team**
- What grows with content (levels, items, entities) and how: data in scenes/data assets versus
  hard-coded in systems; per-level code is a smell.
- Hot paths identified early (skill `mobile-performance-review` for budgets).
- Files and modules that everyone must edit for every feature (merge-conflict magnets): a
  central `switch`, one giant schema file, one system doing everything.
- Editor workflow: can designers change the content this code reads without a programmer
  (scenes, prefabs, data, custom editor modes — skill `editor-modes`)?

**Language-specific**
- TypeScript: strict types at boundaries (no `any` in schema-facing code), discriminated unions
  for states, no classes holding sim state, pure functions for rules.
- Rust: plain data in, plain data out over `&mut World`; no panics on content data; no
  `HashMap` iteration order in results.
- JSON scenes/prefabs/CSS: canonical form (`gameengine fmt`), references by id, prefabs for
  anything repeated, styles in `.style.css` rather than inline values. Scenes live in `scenes/`,
  prefabs in `prefabs/` (anything else fails `validate` with `E_DOCUMENT_PATH`).
- Debug and QA shortcuts are `defineCheat` in `*.cheats.ts` files next to their feature, imported
  by nothing (skill `cheats`); not `if (DEV)` branches in systems or buttons in game views.

## 3. Report

```
[must] src/shop/offers.ts:40 — the offer timer reads Date.now() inside the OfferRotation sim system
  why: breaks replays and V8/Hermes parity; offers differ per device clock
  fix: feed the device clock as the recorded WallClock resource (wallClock.feed()) and pass
       WallClock.ms as `now` into the offers meta action (skill meta-economy)
[should] src/hud/*.tsx — three views read world entities directly …
[consider] schema/game.schema.ts (410 lines) — one file every feature edits; split by feature
```

- **must** = breaks a rule above (determinism, layers, ownership) or blocks testing;
  **should** = will hurt within the next features or at the stated scale;
  **consider** = a better shape, optional.
- Each finding: location, why it matters *in this engine*, and the smallest fix. Prefer moving
  code to the right layer over adding abstraction.
- End with a short picture of the scope's structure (features, their dependencies, owners of
  state) and the two or three changes with the best payoff.
