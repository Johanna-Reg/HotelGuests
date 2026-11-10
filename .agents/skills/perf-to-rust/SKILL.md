---
name: perf-to-rust
version: 1.6.0
tier: optional
description: Find a slow system with the profiler, transpile the sim to Rust or move a system to hand-written Rust while keeping its TypeScript version as the reference, then run it in parallel ranges and check its codegen. Use when script time or a system's time is over budget.
---

# Performance, and moving a system to Rust

## 1. Measure, don't guess

- `gameengine test --json` reports each sim system's `meanMs`/`maxMs` per test (`systems`); `gameengine call perf.stats` has `systemTimeMs` (p50/p95 per frame, `native: true` for Rust systems), `scriptTimeMs`, `gcMaxMs`, `jsHeapMB`; `gameengine call script.systems` has the last frame.
- Put the numbers in the budget file: `tests/budgets/<name>.json` → `devices.<class>.systemsP95Ms: { "Steer": 4 }` (ms per frame at p95). `gameengine test --tier t2` gates them; a budget naming a system the engine does not report fails.
- Port only a system that is over budget after steps 2 and 3. One hot system is the usual case; a dozen lukewarm ones are a design problem, not a Rust problem.

## 2. Fix it in TypeScript first

Fewer allocations in `run`, typed arrays, no per-row closures, no `Map`/`Set` per step:

- Read columns with `c.col(T)`, resources with `ctx.resource(T)`, event counts with `ctx.events.count(T)`; write with `c.setField` / `ctx.setField`; compare strings and assets with `c.is` / `ctx.is` or ids resolved in `run` (`stringId`).
- Decode into a kept object (`c.get(T, i, into)`, `ctx.get(T, into)`, `ctx.events.forEach`), not `c.get` / `ctx.events.read` per row; avoid `c.rows()`, `q.entities()` and a command per row (skill `ecs-systems`, "What a run costs").
- Declaring many queries, resources or events costs almost nothing when `run` does not touch them (views are built on first use), so a system that mostly returns early is not a porting candidate; `samples/dispatch-bench` in the engine repo measures dispatch.
- Prove the rewrite hash-identical: `gameengine test --hash-trace .gameengine/base` before, `--hash-trace-baseline .gameengine/base` after (skill `determinism`).

## 3. Transpile the sim first

Every project compiles each sim system that fits the transpilable subset to Rust, with no Rust to write or keep in sync (`"native": { "transpile": false }` in `project.gameengine.json` opts out; `GAMEENGINE_TRANSPILE=off` for one run):

- `gameengine native transpile` lists each sim system: `rust`, or `ts` with the construct that kept it out and where (`call … is outside the subset (src/board.ts:62)`). A system left out keeps running as TypeScript, unchanged.
- The Rust is regenerated from the TypeScript before every host build (`.gameengine/transpiled/`, never committed). `gameengine test --native both` must pass: it proves every transpiled system hash-identical.
- In the subset: numbers (as f64, with JavaScript's integer and rounding rules), queries and columns (nested loops too), resources, events, spawns, commands, enums, strings and assets, constant tables, typed arrays, `Map`/`Set`, helpers and local arrow functions (inlined; a helper may write into an array the caller passed it), `forEach`/`map`/`filter`/`every`/`some`/`find`/`Array.from`, object records (interfaces, `T | null`, arrays of them; `{ chunk, row }` and column views kept in them), documents (`defineDoc` get/set/update), meta state (`metaInWorld` get/loaded/dispatch, `defineMeta` actions and invariants), `loadData` (records with `$type` fields and unions too), tunables (converted once per step, not per read), `NavGrid`/`findPath`/`smoothPath`, and the runtime calls with twins (tweens, raycasts, overlap contacts, animation parameters, pools, Skeleton2D play/hit/attachments, `spawnPrefab`, `entityIndex`, `playTimeline` and `stopTimeline`, events with no fields, `ctx.signal`, streaming, `fitWorldView`).
- Stays TypeScript: recursion, a function used as a value, writing a field of a record (JavaScript shares records; build a new one), a meta with `migrate`, runtime calls without a twin. The report names the construct and line.
- In hot loops prefer plain column loops: a loop that calls into the world between rows (a hit test, a computed string, a document write) reaches its table through a handle at each access, which is slower than the loop-wide borrow.
- A release over the air (`gameengine release`) that changes a transpiled system runs its TypeScript (the twin carries the hash of the source it was made from) until the next store build.
- Transpiled code is about as fast as a straight port (crowd sample: 1.6 ms vs 40 ms on Hermes). Steps 5 and 6 are for the systems that need more.
- Project hosts build with the `fast` profile while you iterate (a change relinks in seconds); shipping builds use `release`.

## 4. Shape the data before porting (hot/cold split)

- Keep hot components small: only what the hot loop reads and writes (`pos`, `vel`, a seed). Names, config, UI state and rarely-read fields go in other components.
- Hot loops never make per-entity structural changes (insert/remove a component to flag state); use a field. Spawns and despawns are fine when they are rare (respawns), not per step per entity.
- Per-entity randomness in a parallel system comes from a seed field hashed each use (see `samples/crowd-stress` `mix`), never `ctx.rng` (one sequential stream).

## 5. Move it to Rust by hand

- Create `native/Cargo.toml` with `gameengine-game = "0.1"` in `[dependencies]`, `gameengine-game = { path = "../.gameengine/engine/crates/gameengine-game" }` under `[patch.crates-io]` (for clippy and rust-analyzer; the host patches it to the engine) and an empty `[workspace]`, as `samples/gem-cascade/native/Cargo.toml` does. A path in `[dependencies]` fails the host build with `package collision in the lockfile`. `gameengine gen` links `.gameengine/engine` and writes `native/src/schema.gen.rs`.
- Implement `gameengine_game::System` with the **same name**, stage and `after` as the TS system, and export `pub static PLUGIN: GamePlugin`. It overrides the transpiled system of that name; `GAMEENGINE_NATIVE_SOURCE=transpiled` runs the transpiled one instead, to compare.
- Mirror the TS exactly: same iteration order, the same f64 operations in the same order (`a / d * s` is `(a / d) * s`), round to f32 once at the store (`x as f32`), `sqrt` only (no `sin`/`cos`/`pow` from std: `gameengine_game::math::det`), strings/assets interned in the same order, `let w = Writes::begin(ctx.world, &q, &resources)` before the run and `w.finish(ctx.world)` after it (marks changed only the rows whose bytes changed, like the script bridge; `par_for_each` marks what it visits). A twin keeps its TS `runIf` and `runOn`.
- Never `mul_add` or FMA intrinsics (clippy rejects them): a fused multiply-add rounds differently and splits hashes across CPUs.

## 6. Run it in parallel ranges

```rust
let agent = id::<Agent>(ctx.world);
let spec = QuerySpec::new().write(agent);
par_for_each(ctx, &spec, 1024, |r| {
    let mut cols = r.rows.col_mut::<Agent>(agent);
    let a = &mut *cols; // borrow fields separately
    for i in 0..r.rows.len() {
        // a.pos[i], a.vel[i]…; r.rows.entities()[i]; r.commands.spawn/despawn; r.dt, r.step
    }
});
```

- `batch_rows` is a constant you choose (a few hundred to a few thousand rows of light work). Never derive it from the thread count: it decides the command order.
- A range touches only its own rows. Resources, other entities' components and `ctx.rng` are off limits inside the closure; read what you need before the call.
- Structural changes go to `r.commands`; they are merged in range order, so the TS twin (which loops rows in order) records the same commands.

## 7. Prove it

- `gameengine test --native both --js both` must pass: any hash difference means the port is wrong. With `--native both` it also prints `Steer: rust 0.30 ms vs ts 12.58 ms per run`. Add `--hash-trace` and a mismatch names the first diverging step, the system and the components (the TS-twin lane is compared with the native one).
- Optimising a system in place: `gameengine test --hash-trace .gameengine/base` before, `--hash-trace-baseline .gameengine/base` after (skill `determinism`).
- `GAMEENGINE_JOB_THREADS=1 gameengine test --json` must give the same hashes as the default pool.
- `gameengine native asm <System>` shows the release assembly of the system's functions: vector vs scalar float ops, loops, and FMAs (must be 0). `--show` prints the hottest function, `--target aarch64-linux-android` the phone's code. Scalar is normal and usually fine; branches per entity, f64 math and interleaved fields keep LLVM from vectorising.
- Keep the TS twin. It is the spec, and `GAMEENGINE_NATIVE_SYSTEMS=off` runs it.
