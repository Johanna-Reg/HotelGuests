---
name: simd-profile
description: SIMD utilisation profiling with gameengine tool simd-run, simd-host, simd-show, simd-diff - exact woven counts of float lane use per loop, hot loops with source lines, vectoriser remarks, hints (NOT_VECTORISED, SHUFFLE_HEAVY). Use when making native or transpiled systems or Rust kernels vectorise, or proving a data-layout change paid off.
---

# SIMD profiling loop

`@tactilegames/gameengine.simd-profiler` answers "how much of each vector register did this run
use, where, and why not more". It builds the chosen Rust crates with a block counter woven into
every basic block *after* LLVM's vectorisers, runs the program, and decodes every executed
instruction with its exact count. No `perf`, no root, no sampling: the same build and input give
the same numbers, so a before/after diff is a real difference.

Needs Rust (`gameengine setup --native`). The first call builds the profiler into
`.gameengine/simd/` (about a minute); runs go to `.gameengine/simd/runs/<label>`.

## The loop

1. **Measure the starting point** with a label:
   ```bash
   gameengine tool simd-host --command "test . --js v8" --label before          # the game's own Rust on a woven host
   gameengine tool simd-run --manifest bench/Cargo.toml --label before --args "--n 20000"   # any cargo binary
   ```
   `simd-host` weaves the project's `native/` crate and transpiled systems unless `--crates a,b`
   names others (in an engine checkout, engine crates too: `--crates gameengine-render`); it needs
   an engine that builds host variants (`GAMEENGINE_HOST_VARIANT`), and a failing test still gives
   its profile. `simd-run` weaves the manifest's own crate unless `--crates` names others. `--fn
   <substring>` keeps setup code out of the totals; `--time 5` adds the median wall time of five
   unwoven runs. Over MCP the tools are `tool_simd_run`, `tool_simd_host`, … with the same parameters.
2. **Read the top hotspot** (`H1`): its source line, lane utilisation, counts and hint codes.
   A transpiled system's hotspot leads with its TypeScript line (`src/crowd.ts:79 (TypeScript,
   transpiled: …)`; JSON `location.typescript`): change the TypeScript there, the transpiler makes
   the Rust. Engines whose transpiler writes no `// ts:` comments give only the file.
   `gameengine tool simd-show --run before --asm --top 1` shows its instructions with their counts:
   read them before guessing.
3. **Change one thing** the hint points at (table below), keeping results identical where they must be.
4. **Measure again** under a new label and compare: `gameengine tool simd-diff --before before --after after`.
   Check correctness (checksums, `gameengine test`, hash traces) and real time (`--time`, or the
   program's own timer). Keep the change only if the diff and the clock agree.

Counts cover the woven crates only; std and other crates appear as calls. Woven crates build without
LTO and with one codegen unit: a cross-crate call LTO would inline in a release build stays a call
here, so check a `CALL_IN_LOOP` against `gameengine native asm <System>` before acting on it. Woven
runs are slower (a counter call per block); never compare their wall time with an unwoven run.

## Reading the numbers

- **lane utilisation**: float lane work ÷ what the same instructions could do at the reference
  width (default: the widest register the run used, at least 128 bits = NEON and SSE). 25% is
  scalar f32; 100% is full registers.
- **vector share**: share of float element work done by packed instructions.
- **empty lane slots**: the ranking key: unused lanes summed over executed float instructions.
- **xN**: loop-head executions (iterations), or function entries for a `body` region.
- **loop regions** are innermost natural loops (a back edge to a dominating header), made of the blocks that reach
  the latch, so an exit stub inside the address range is not counted. A cycle with no dominating entry has no loop
  region unless it sits inside an enclosing natural loop, and blocks no direct branch reaches are never members.
  Executed indirect control flow is still rejected.
- `--format json` returns the whole report; `parseReport` and the `SimdReport` types in the
  package's exports read `report.json` in a project tool.

## Hints and what to try

| Code | Means | Try |
|---|---|---|
| `NOT_VECTORISED` | loop runs its float ops one lane at a time | struct-of-arrays, straight-line body, slices of equal length |
| `SHUFFLE_HEAVY` | vectorised, but lanes are rearranged (AoS `[f32; 3]`, x/y pairs) | one array per field |
| `FLOAT_BRANCH` | branches on float compares | select on values; on SSE2 a bitwise select on an all-ones `u32` mask (a `bool` select may not vectorise there) |
| `RARE_FLOAT_BRANCH` | the branch skips float work that rarely runs | keep the branch; vectorise the *test* (condition for several elements, one `any()`), rare work scalar |
| `CALL_IN_LOOP` / `BOUNDS_CHECK` | a call or panic path per iteration | `#[inline]`, hoist, iterate with `zip`/`chunks_exact`, re-slice to the loop length |
| `FLOAT_REDUCTION` | LLVM keeps a float sum serial | independent partial sums over `chunks_exact(8)`; changes result bits |
| `CONVERT` / `F64_LANES` | f32↔f64 per element; f64 halves lanes | compute in the storage precision (sim code: only with a determinism decision) |
| `SCALAR_REMAINDER` | the scalar tail does much of the work | pad arrays, fixed-size chunks |
| `PER_CALL_SCALAR` | a per-element function called from outside a loop | pass slices, loop inside |
| `COPY_PER_CALL` | `memcpy`/`memmove` once per element from hot code | iterate a `const` array by reference (`for &x in CONST.iter()`), use a `static`, pass references |

`remark:` lines are LLVM's own reasons (`-Cremark=loop-vectorize`) for the region's source lines.

## Rules that still apply

- **Sim code stays bit-identical** (skill `determinism`): element-wise rewrites that keep each
  element's operations and order are fine; reordering a reduction, switching f64 to f32, FMA or an
  approximate `rsqrt` change hashes and need a determinism decision. Prove sim changes with
  `gameengine test --hash-trace` and `--native both`.
- **A layout change has to hold everywhere the data is written.** A struct-of-arrays copy rebuilt
  every frame cost more than it saved on a phone (culling: 0.67–0.84× of naive with a per-frame
  copy, 2.3–2.7× with the layout stored).
- The x86-64 baseline is SSE2 (no blend, no FMA); phones are NEON. A loop LLVM declines on SSE2
  may vectorise on NEON and the other way round: `gameengine native asm <System> --target
  aarch64-linux-android` shows the phone's code. Time the change on a phone before claiming it.
- Measure the speed too: a higher utilisation that does not cut time (memory-bound loops) is not
  worth extra complexity.

## Practice scenarios

The package ships `tools/scenarios/` (in `node_modules/@tactilegames/gameengine.simd-profiler/`):
`particles`, `culling`, `transforms`, `steer`, `energy`, each `--variant naive|tuned`. Profile a
naive one, improve it, and compare with the tuned one:

```bash
gameengine tool simd-run --manifest node_modules/@tactilegames/gameengine.simd-profiler/tools/scenarios/Cargo.toml --fn _naive --args "particles --n 20000 --iters 20"
```

## Limits

Linux x86-64 only so far: the analyser decodes x86-64 ELF, and the counting runtime (POSIX libc)
has no Windows or iOS path. A program killed instead of exiting writes no counts. Woven host builds
take several GB under `.gameengine/simd/`, an installed editor's `.gameengine/sdk-*-variant-simd-*`
and an engine checkout's `target/variants/`: `gameengine tool simd-clean` removes them. Two woven
binaries in one process (a woven library loaded by a woven program) each write the same counts
file, and the later one wins.
