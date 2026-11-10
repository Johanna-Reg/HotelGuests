---
name: determinism
version: 1.7.2
tier: required
description: The determinism rules every sim system follows so tests, replays and device parity hold — ctx.rng not Math.random, ctx.step/WallClock not Date.now, math.* trig, no module state, ordered iteration, no DEV branches, and proving a change hash-identical. Use when writing or reviewing any system code, or a hash mismatches.
---

# Determinism

The sim runs at a fixed step and its state hash must be identical on every device, JS engine and
replay. A mismatch is a P0 bug.

| Use | Never |
|---|---|
| `ctx.rng.range(lo, hi)`, `ctx.rng.between`, `ctx.rng.float` | `Math.random()` |
| `ctx.step`, `ctx.dt`; the `WallClock` resource (recorded, `wallClock.feed()`) for real time | `Date.now()`, `performance.now()`, timers |
| `math.*` from `@gameengine/runtime` (`roundHalfUp`, trig) | `Math.sin/cos/pow` on sim values |
| State in components/resources | Module-level variables |
| Iterate query chunks in order | Iterating a `Set`/`Map` built from unordered input |
| The same sim code in every build | Branching sim/system code on `DEV` (presentation only) |
| Entities, components and resources for lifetimes | `WeakRef`, `FinalizationRegistry` (collection timing differs per JS engine and GC run; lint `no-sim-nondeterminism`) |

- `DEV` is true in dev runs and false in cooked builds, so a sim system that branches on it hashes differently on a shipped device than in tests and replays. Never branch sim or system code on `DEV`; use it in presentation only (debug overlays, logs, views). Lint: `no-sim-nondeterminism`.
- Cheats that change sim state are `defineCheat` sim cheats (skill `cheats`): they run as a system from a recorded input event, so a bug found after a cheat replays exactly. Never write sim state from outside a step.
- Anything that comes from outside the step (the device clock, a save read from storage, a data file edited in dev) reaches the sim only as recorded input: `WallClock` (`wallClock.feed()`), `metaInWorld(meta, { persist })` (`MetaLoaded`), `defineTunables` (`TunablesChanged`). Replays carry those inputs and never read the clock, storage or files.
- The frame rate (`quality.setTargetFps`, device caps) never changes the sim: it keeps its fixed step and runs more steps per frame at a lower frame rate.
- **Scratch buffers:** a module-level typed array (`const tmp = new Float32Array(16)`) used as scratch is allowed when every use writes it fully before reading it: it carries no state from one call or step to the next, so hot reload, replays and rollback are unaffected. Reading a value left there by an earlier call is module state and breaks all three; `Map`/`Set`/array caches at module level are never allowed (lint `no-module-mutable-state`).
- **Curves:** `evaluateCurve(keys, x)` from `@gameengine/runtime` (the keys `ui.CurveField` edits) is safe in sim: plain arithmetic, no allocation, O(log n) per call. Keys must be sorted by x. It is not a tween ease (`ease: "curve:name"` takes `defineCurve`'s Hermite keys).
- Each system has its own RNG stream, keyed by its name: renaming a system changes its randomness.
- **Skipping is part of determinism.** `runIf`, `runOn` and `skipUnchanged` decide whether a system
  runs, from sim state only, so every device skips the same steps. `skipUnchanged` is a promise
  that a run with unchanged inputs changes nothing: a system that draws from `ctx.rng`, counts
  steps or follows `ctx.time` breaks it, and the hash moves (and replays diverge) once it skips.
  Check an opt-in with `gameengine test --hash-trace .gameengine/base` before and
  `--hash-trace-baseline .gameengine/base` after; `N of N identical` is the proof.
- Presentation (UI, VFX, audio pitch jitter) may be non-deterministic; it must never write sim state, and sim must never read it (skill `sim-boundaries`).
- String and asset fields hash their text, not their interned ids, so interning order (schema defaults, UI code) never moves the hash. An id kept in a plain `u32`/`i32` field does hash as a number: store strings in `string` fields.
- Check: `gameengine test --js both` (V8 and Hermes must agree), `--js v8,web` when the game ships on the web (the wasm build must agree too), `gameengine replay verify <file>`.

## Prove a sim change hash-identical (refactors, optimisations, ports to Rust)

1. **Before editing**, record a baseline: `gameengine test --hash-trace .gameengine/base` (add `--filter "<test>"` to narrow it). It writes, per test, every step's hash and at each step the hash after every system and of every component, resource, document and RNG stream.
2. Make the change.
3. `gameengine test --hash-trace-baseline .gameengine/base`. Each test that left the baseline fails with one line: `diverges from the baseline at step 20 in system Countdown (differs: Board)` — the step, the system that wrote different state, and the state it wrote. No failures and `N of N identical to their baseline` is the proof.
4. `--js both` (or `--js v8,web`) compares Hermes (or the web host) with V8 the same way (and `--native both` the TS twins with the Rust systems): a lane mismatch names its step, system and components too.

- Long tests: `--checkpoint-every 10` records the per-system breakdown every 10 steps (every step's hash is always kept); a divergence between checkpoints names the step and tells you to rerun that test with `--checkpoint-every 1`.
- Replays: `gameengine replay verify <file>` prints the first diverging step; for a replay recorded with checkpoints (`--checkpoint-every 1` on `test --record-replays` or `replay record start`) also the system, the components and each system's recorded hash next to the playback one. A replay without them: `gameengine replay rehash <file> --checkpoint-every 1 --out <copy>` on the last build that passed, then `replay verify <copy>`. `gameengine replay record start --path tests/replays/x.greplay` restarts the game from a fresh world (a replay always plays from step 0) and `record stop` writes it there.
- Two traces side by side: `gameengine trace diff <a> <b>` (two `.hashtrace` files, or two `--hash-trace` directories) prints the commit and engine each was recorded with and, per test, the first diverging step, system and parts. An accepted difference (`--allow "rng:*"`, `--allow doc:telemetry`) is skipped so the next one shows; that needs a checkpoint at the step in both traces (`--checkpoint-every 1`).
- A divergence in a system you did not touch usually means different input reached it (a changed event, a different step), or it reads state an earlier system wrote differently: look at the components listed, then at who writes them.
