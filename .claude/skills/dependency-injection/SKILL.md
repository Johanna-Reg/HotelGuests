---
name: dependency-injection
version: 1.0.1
tier: optional
description: Presentation services wired with @gameengine/di — tokens, providers, lifetimes, scopes, test overrides, `gameengine di check|graph`. Use for SDK and service wrappers, backend clients, save access, signal listeners, UI controllers and view models, or a package's feature module. Never for sim systems.
---

# Dependency injection (`@gameengine/di`)

**Covers:** Wiring a game's presentation services with @gameengine/di — typed tokens, provider modules (useValue/useFactory/useClass/useExisting, inject), singleton/scoped/transient lifetimes, lazy/eager/warm start, scopes and disposal, test overrides, the creation report, and `gameengine di check|graph`. Use for SDK and service wrappers, backend clients, save access, signal listeners, UI controllers and view models, or a package's feature module. Never for sim systems.

A container for **presentation** objects: SDK wrappers (analytics, ads, consent, IAP), backend
clients, save access, signal listeners, UI controllers and view models, feature modules a package
ships. It creates them on demand, in dependency order, times every creation and checks the
graph before anything runs. The shape is Angular/NestJS providers with .NET lifetimes; there are
no decorators and no reflection (it runs on Hermes).

**Never in sim.** Sim systems get data from queries, resources and events; every container API
throws inside a sim system, and lint `no-di-in-sim` rejects importing `@gameengine/di` in a file
that defines one (skill `sim-boundaries`). A service's outcome reaches the sim as an event.

## Register

```ts
// src/app.di.ts — the convention `gameengine di check` reads
import { module, provider, token } from '@gameengine/di';

export const Consent = token<IConsent>('Consent');          // unique names: they appear in errors and reports
export const Analytics = token<IAnalytics>('Analytics');
export const Shop = token<ShopController>('Shop');

export const servicesModule = module('services', [
  { provide: Consent, useFactory: () => new UmpConsent(), start: 'eager' },
  provider({ provide: Analytics, useFactory: (c) => new FirebaseAnalytics(c), inject: [Consent], start: 'warm' }),
  { provide: Config, useValue: config },
]);
export const uiModule = module('ui', [
  provider({ provide: Shop, useClass: ShopController, inject: [Store, Analytics], lifetime: 'scoped' }),
]);

export default [servicesModule, uiModule];   // or: export const modules = [...]
```

- `inject` lists tokens; the factory or constructor gets their instances in that order.
  `provider({...})` type-checks the parameters against `inject` and the result against the token;
  a plain object literal works without those checks.
- `useExisting: OtherToken` is an alias (same instance). A package ships a module as an ordinary
  export; `module(name, providers, { imports: [otherModule] })` pulls its dependencies in once.
- A factory may be `async` (returns a Promise): consumers wait for it.

Create and use it from presentation code (a `defineUI` controller, a LateUpdate system), and export
`DiWarm` from the game entry if any provider is `warm`:

```ts
// src/ui/hud.tsx
const app = createContainer(modules);
void app.boot();                          // eager providers; sync ones exist when this returns
const shop = app.getSync(Shop);           // created now (sync factory) — throws if it is async and not ready
const analytics = await app.get(Analytics);

// src/main.ts
export { DiWarm } from '@gameengine/di';  // LateUpdate: starts 'warm' providers a slice per frame
```

## Choose start and lifetime

| `start` | Created | Use for |
|---|---|---|
| `lazy` (default) | on first `get` | most things; nothing costs until used |
| `eager` | in `boot()`, in dependency order; independent async ones in parallel | what must exist before play: consent, signal forwarding, crash reporting |
| `warm` | after boot, a per-frame budget (default 2 ms, `warmBudgetMs`), by `DiWarm` | expensive but not urgent: SDK start-up, ad preload, catalogue fetch |

`eager`/`warm` apply to singletons only. Measure before choosing: `app.report()` (below), and the
**hitch warning** — a lazy creation after boot that blocks more than 8 ms (`hitchWarnMs`) logs
`'X' blocked 12.3 ms creating on first get during gameplay … give it start: 'warm'`.

| `lifetime` | One instance per | Typical |
|---|---|---|
| `singleton` (default) | container | SDK wrappers, clients, stores |
| `scoped` | scope | a level's or a screen's controller/view model |
| `transient` | `get` | small stateless helpers |

A singleton must not inject a scoped provider (directly or through transients): it would keep the
first scope's instance forever. `createContainer` refuses it as a **captive dependency**.

## Scopes and disposal

```ts
const level = app.createScope('level');   // names are free-form: session, level, view …
const hud = level.getSync(LevelHud);      // scoped: one per scope; singletons stay shared
level.dispose();                          // child scopes first, then its instances, newest first
```

Disposal calls the provider's `dispose(instance)` hook, else `instance.dispose()`, else
`instance[Symbol.dispose]()`. `useValue`s are never disposed (the container did not make them).
A disposed scope throws on use. `app.dispose()` disposes everything.

## Async creation and failures

Concurrent gets of a provider share one creation. If it fails, every waiter gets a `DiCreateError`
naming the chain (`creating 'Shop' ← needs 'Net' failed: timeout`), nothing is cached, and the
next get tries again — so retry by calling `get` again, not by recreating the container.

## Errors you will see

All graph problems are reported together, at `createContainer` and by `gameengine di check`:

- `missing: 'Shop' (module 'ui') injects 'Store', which no module provides` — add the module.
- `dependency cycle: A (m) → B (m) → A (m)` — inject a narrower token, or `get` one side later.
- `captive dependency: singleton 'Analytics' … injects scoped 'Level' …`
- `duplicate` (two modules provide one token; use `overrides` to replace), `name-clash`, `invalid`.

## Test with overrides

```ts
import { createTestContainer, mock, manualClock } from '@gameengine/di';

const app = createTestContainer([servicesModule], { overrides: [mock(Analytics, fakeAnalytics)] });
app.override(Consent, { useValue: grantedConsent });   // before boot and the first get
```

`createTestContainer` turns the hitch warning off and collects warnings in `app.warnings`;
`manualClock()` makes timings exact (`{ now: clock.now }`), and `app.tick(budgetMs)` drives warm-up
by hand. In a game test the `DiWarm` system ticks on `step()`.

## Read the report

```ts
console.log(formatReport(app.report()));
// boot: 3.20 ms; critical path Consent 1.10 → Analytics 2.00
// provider   lifetime   start  phase  ms  blocking  count  module
```

`bootMs`, the **critical path** (the longest chain of boot creations: boot cannot be faster), and
per provider: `created`, `count`, `ms` (own time until ready), `blockingMs` (time the caller was
stuck in the factory), `phase` (`boot` / `warm` / `lazy`), `start`, `lifetime`. Move long `lazy`
ones to `warm`; move `eager` ones off the critical path when play does not need them.

## Check without running

```
gameengine di check [--entry src/app.di.ts] [--json]   # exit 1 with the problems; creates nothing
gameengine di graph [--json]                            # tokens, deps, lifetime, start as a tree
```

MCP: `di_check`, `di_graph`. Keep work out of `app.di.ts`'s module scope: the check imports it in
Node, where there is no engine.

## Never inject into sim

- No container, token or `get` in a sim system or its file; systems use queries/resources.
- A service result that changes the game becomes an event the UI emits (`PurchaseDelivered`),
  handled by a sim system — never a value a system pulls from a service.
- Nothing the container holds is hashed or replayed; that is why it may hold SDKs and clocks.

Example: `samples/gem-cascade/src/app.di.ts` (analytics forwarding eager, rewarded ads warm, the
progress store and the shop), created in `src/ui/hud.tsx`, tested in `tests/di.test.ts`.
