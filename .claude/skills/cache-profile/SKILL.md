---
name: cache-profile
description: CPU cache profiling with gameengine tool cache-run, cache-host, cache-show, cache-diff - exact L1/L2/L3 misses in a modelled phone cache, exposed vs prefetchable misses, line utilisation, hot lines (TypeScript too), hints (EXPOSED_MISSES, LOW_LINE_UTILISATION). Use when choosing data layouts (AoS/SoA, hot/cold split) or proving one paid off.
---

# Cache profiling loop

`@tactilegames/gameengine.cache-profiler` answers "which loads and stores miss the cache, how much
of each fetched line is used, and which misses a phone cannot hide". It builds the chosen Rust
crates with a hook before every load and store (woven in after LLVM optimises them), runs the
program, and passes every access through a modelled cache (`phone-low` by default: 32 KB L1,
128 KB L2, 1 MB L3, 64-byte lines). No `perf`, no root, no sampling: the same build and input give
the same numbers, so a before/after diff is a real difference.

Needs Rust (`gameengine setup --native`). The first call builds the profiler into
`.gameengine/cache/` (about a minute); runs go to `.gameengine/cache/runs/<label>`.

## The loop

1. **Measure the starting point** with a label:
   ```bash
   gameengine tool cache-host --command "test . --js v8" --label before          # the game's own Rust on a woven host
   gameengine tool cache-run --manifest bench/Cargo.toml --label before --args "--n 20000"   # any cargo binary
   ```
   `cache-host` weaves the project's `native/` crate and transpiled systems unless `--crates a,b`
   names others; it needs an engine that builds host variants (`GAMEENGINE_HOST_VARIANT`, engine
   0.1.18+), runs the engine's job pool on one thread, and a failing test still gives its profile.
   `cache-run` weaves the manifest's own crate unless `--crates` names others. `--fn <substring>`
   keeps setup code out of the totals; `--model phone|desktop|l1=64k/4,l2=512k/8,line=64` picks
   another cache; `--time 5` adds the median wall time of five unwoven runs. Over MCP the tools
   are `tool_cache_run`, `tool_cache_host`, `tool_cache_show`, `tool_cache_diff`, `tool_cache_clean`
   with the same parameters.
2. **Read the top hotspot** (`H1`): a source line ranked by estimated stall cycles, its misses
   split into **exposed** and **prefetchable**, its line utilisation and hint codes. A transpiled
   system's hotspot leads with its TypeScript line (`src/crowd.ts:79 (TypeScript, transpiled: …)`;
   JSON `location.typescript`, and the report's `typescript` list): change the TypeScript there.
   `gameengine tool cache-show --run before --instr --top 1` lists the line's instructions.
3. **Change one thing** the hint points at (table below), keeping results identical where they must be.
4. **Measure again** under a new label and compare: `gameengine tool cache-diff --before before --after after`.
   Check correctness (checksums, `gameengine test`, hash traces) and real time (`--time`, the
   program's timer, a phone). Keep the change only if the diff and the clock agree.

## Reading the numbers

- **L1 misses**: lines brought into L1, what a phone's line-refill counter counts (within 0–6% on a
  Galaxy Z Flip4, package `docs/validation.md`).
- **exposed / prefetchable**: a miss continuing a constant stride of at most four lines (per
  instruction, or across the instructions of an unrolled loop) is prefetchable: real cores'
  prefetchers fetch it early. Exposed misses (pointer chasing, hashing, random gathers, big
  strides) stall the core for the full latency. **Fix exposed misses first.**
- **line utilisation**: bytes touched ÷ bytes fetched into L1. Low means hot and cold data share lines.
- **est. stall cycles**: the ranking key. Exposed misses cost the model's weights (phone-low: L2 hit
  10, L3 hit 30, memory 150 cycles), prefetchable ones 0.15× that. An estimate for ranking, not a
  measurement; `--weights l2=…,l3=…,mem=…,pf=…` changes it.
- **L2/L3 miss rates** are local (of the level above's misses). L3 numbers are rough: real last
  levels are not LRU.
- `--format json` returns the whole report; `parseReport`, `hintCodes` and the `CacheReport`
  types in the package's exports read `report.json` in a project tool.

## Hints and what to try

| Code | Means | Try |
|---|---|---|
| `EXPOSED_MISSES` | most misses follow no constant stride: the core waits for each | visit data in memory order: sort/bucket it, an index array instead of links, a smaller working set |
| `LOW_LINE_UTILISATION` | at most a quarter of each fetched line is used | split hot from cold fields; one array per field the loop reads (SoA) |
| `STRIDED` | most accesses miss while reading few bytes: consecutive accesses on different lines | walk in layout order (row-major), make the walked field contiguous |
| `WORKING_SET_L1` / `WORKING_SET_L2` | misses served by L2 (or L3): data reused after eviction | block/tile the loop, fuse passes, smaller element types |
| `SPLIT_ACCESS` | accesses straddle two lines | align elements (`#[repr(align(16))]`, power-of-two sizes) |
| `STORE_MISSES` | store misses (write-allocate reads the line first) | write whole lines in order, batch writes, keep written fields apart |

## Rules that still apply

- **Sim code stays bit-identical** (skill `determinism`): moving data (SoA, hot/cold split, sorting
  for locality) must not change iteration order where results depend on it. Prove sim changes
  with `gameengine test --hash-trace` and `--native both`.
- **A layout change has to hold everywhere the data is written**: a copy rebuilt every frame can
  cost more than the misses it saves.
- **Measure on a phone** before claiming a speed-up: the model has no TLB, one hierarchy for all
  threads, and an LRU last level.

## Practice scenarios

The package ships `tools/scenarios/` (in `node_modules/@tactilegames/gameengine.cache-profiler/`):
`particles`, `traversal`, `list`, `hotcold`, each `--variant naive|tuned`, kernels named
`<scenario>_naive` / `_tuned`. Profile a naive one, improve it, compare with the tuned one:

```bash
gameengine tool cache-run --manifest node_modules/@tactilegames/gameengine.cache-profiler/tools/scenarios/Cargo.toml --fn _naive --args "list --iters 3"
```

## Limits

Linux x86-64 hosts only: the hooks read their caller from the x86-64 stack and the analyser reads
ELF. Copies inside libc (`memcpy`, `memset`) and code outside the woven crates are not seen; std
code inlined into a woven crate is. One modelled hierarchy for all threads (behind a lock), no
hardware prefetcher in the cache itself (prefetchable misses are only classified), no TLB, true
LRU. A program killed instead of exiting writes no profile. The model's lock is not re-entrant: do not weave signal handlers or a global allocator. Woven runs are much slower than plain
ones; never compare their wall time. Woven host builds take several GB: `gameengine tool
cache-clean` removes them.
