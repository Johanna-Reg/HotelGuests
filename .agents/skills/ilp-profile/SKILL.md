---
name: ilp-profile
description: Instruction-level parallelism with gameengine tool ilp-run, ilp-host, ilp-show, ilp-diff - per hot loop the carried chain, pipe and front-end bounds, in-order stalls on little cores (A55/A510) vs big (A78/A710/X2), hints (SINGLE_ACCUMULATOR, POINTER_CHASE, IN_ORDER_STALLS). Use when a loop is slow on phones or to prove a rewrite helped.
---

# ILP profiling loop

`@tactilegames/gameengine.ilp-profiler` answers "how much independent work does this hot loop give
the core, and what stops it running ahead". It counts how often each loop and block ran (block
counters woven into the chosen Rust crates), reads the same crates compiled unwoven to AArch64
and x86-64 assembly, and runs every loop through modelled cores:

| Core | Kind | Numbers from |
|---|---|---|
| `a55`, `a510` | little, in-order (2 and 3 wide) | the package's microbenchmarks on the phones |
| `a78`, `a710` | big, out-of-order | the package's microbenchmarks on the phones |
| `x2` | prime, out-of-order | the package's microbenchmarks timed on a phone (unpinned, no counters) and Arm's guide |
| `apple` | A14/M1-class big core | published measurements (low confidence) |
| `desktop` | Ice Lake / Tiger Lake | microbenchmarks on an i7-11800H |

Per loop and core: cycles per iteration (a cycle simulation), what binds it (loop-carried
chain, a pipe group, the front end, the out-of-order window, in-order stalls, memory) and hints
with the expected gain. These are **model estimates**: rank and compare with them, time on a
phone before claiming a speed-up.

Needs Rust (`gameengine setup --native`); the phone cores need the `aarch64-linux-android` target
(`gameengine setup --platform android`) and, for a game's crates, the engine's mobile native SDK
(`gameengine setup --native --target aarch64-linux-android`). Without them the report says the phone
cores were not modelled. The first call builds the profiler into `.gameengine/ilp/`.

## The loop

1. **Measure the starting point** with a label:
   ```bash
   gameengine tool ilp-host --command "test . --js v8" --label before        # the game's own Rust (native and transpiled systems)
   gameengine tool ilp-run --manifest bench/Cargo.toml --label before --args "--n 20000"   # any cargo binary
   ```
   `--fn <substring>` keeps setup out; `--cores a55,a78` limits the cores; `--rank a710` ranks by
   another core (default `a55`, the phone-low little core); `--cache <cache-run report.json>` feeds
   a cache-profiler run's exposed misses into the memory-level parallelism model; `--time 5` adds
   unwoven wall times. Over MCP: `tool_ilp_run`, `tool_ilp_host`, `tool_ilp_show`, `tool_ilp_diff`,
   `tool_ilp_clean`.
2. **Read the top loop** (`L1`): the function and source line (the TypeScript line for transpiled
   systems), iterations per compilation, a table of cores with cycles per iteration, IPC, the bound
   and estimated total cycles, the carried chain, and hints with source lines.
   `gameengine tool ilp-show --run before --instr --top 1` lists the loop's instructions with
   their lines and, for code behind a branch, the share of iterations that ran it.
3. **Change one thing** the hint points at (table below), keeping results identical where they must be.
4. **Measure again** and compare: `gameengine tool ilp-diff --before before --after after`. Check
   correctness (`gameengine test . --js both --native both`, hash traces) and real time (a phone,
   `--time`). Keep the change only when the clock agrees.

## Reading a loop

- **little vs big:** an in-order core (`a55`, `a510`) stops at the first instruction whose input is
  not ready, so a chain inside an iteration costs its full latency there even when iterations are
  independent; an out-of-order core overlaps iterations until its window is full. A loop can be
  `in-order stalls` on the little cores and `throughput-bound` on the big ones: fix for the phones
  you ship to (phone-low has little cores doing the work).
- **latency-bound:** the carried chain sets the pace (`carried chain on …` names its instructions).
- **throughput-bound: <pipe>:** that pipe group is busy every cycle; the divider is the usual one.
- **front-end-bound:** instructions cannot arrive faster: fewer instructions, or vectorise.
- **window-bound:** a long chain inside each iteration, more than the window can overlap.
- **memory-bound:** only with `--cache`: misses dominate; `SERIAL_MISSES` when they chain.
- `(a..b)` after the total: a table slot chosen by data may repeat between iterations; `a` with no
  repeats, `b` if every iteration repeats; the cycles column uses the repeats measured in the run.

## Hints and what to try

| Code | Means | Try |
|---|---|---|
| `SINGLE_ACCUMULATOR` | one register accumulates every element: each add waits for the last | k independent accumulators (the hint gives k), combined after the loop; float sums then round differently (skill `determinism`) |
| `DEPENDENCY_CHAIN` | a carried chain that is not a plain reduction | split the recurrence, compute what does not depend on the last iteration first, reassociate integers |
| `POINTER_CHASE` | each load's address is the previous load's value | walk several independent chains side by side; an index array in visiting order |
| `DIVIDE_CHAIN` / `DIVIDE_THROUGHPUT` | a divide or sqrt on the chain / the divider busy every cycle | divide once and multiply by the reciprocal (exact only for powers of two: sim code decides), hoist out of the loop |
| `MEMORY_CHAIN` | a load reads the slot a recent store wrote (`counts[x] += 1`) | spread repeats over several tables, count runs in a register |
| `IN_ORDER_STALLS` | a little core waits at an instruction for an input that is not ready | interleave two or four elements' work, load an iteration ahead, split chains into trees |
| `WINDOW_LIMITED` | a long chain inside each iteration | evaluate as a tree (Estrin, pairwise sums), fewer instructions per iteration |
| `PORT_BOUND` / `FRONT_END_BOUND` | the loop is at the core's throughput | fewer operations or instructions per element, vectorise (gameengine.simd-profiler) |
| `SERIAL_MISSES` | cache misses that chain or dominate | issue loads earlier and together; fix the layout (gameengine.cache-profiler) |
| `CALL_IN_LOOP` / `BRANCHY_LOOP` | calls or branches the model does not cost | inline small callees; check branches with gameengine.branch-profiler |

## Rules that still apply

- **Sim code stays bit-identical** (skill `determinism`): reordering independent work keeps the
  results; reassociating float math (more accumulators, reciprocals) changes them. Prove sim changes
  with `gameengine test . --js both --native both` and hash traces.
- **Measure on a phone** before claiming a speed-up: the model is calibrated within about 10–25%
  per loop on the phone cores it names, not exact.

## Practice scenarios

`tools/scenarios/` in the installed package: `accum`, `chase`, `divide`, `histogram`, `horner`,
`obstacles` (crowd-stress's obstacle avoidance), each `--variant naive|tuned`, kernels
`<scenario>_naive` / `_tuned`, equal checksums. Profile a naive one, improve it, compare:

```bash
gameengine tool ilp-run --manifest node_modules/@tactilegames/gameengine.ilp-profiler/tools/scenarios/Cargo.toml --fn _naive --args "accum --iters 3"
```

## Limits

Linux x86-64 hosts only (the load hooks read their caller from the x86-64 stack; the analyser reads
ELF). Counts come from the host's compilation: a phone loop the host compiled differently (fully
unrolled, say) gets estimated iterations. No branch mispredictions, no TLB, cache misses only with
`--cache`; the out-of-order repeat cost of a data-indexed slot is fitted, not simulated. Woven runs
are slow: never compare their wall time. `gameengine tool ilp-clean` removes the woven builds.
