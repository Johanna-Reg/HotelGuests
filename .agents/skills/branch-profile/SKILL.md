---
name: branch-profile
description: CPU branch prediction profiling with gameengine tool branch-run, branch-host, branch-show, branch-diff - mispredicted if/match/dyn calls per Rust or TypeScript line in modelled phone predictors, pattern classes, flush cost, hints (UNPREDICTABLE_BRANCH, POLYMORPHIC_CALL). Use when making hot code branchless or proving it.
---

# Branch profiling loop

`@tactilegames/gameengine.branch-profiler` answers "which branches does the CPU guess wrong, why,
and what does each wrong guess cost". A core runs ahead of its code: it predicts every conditional
branch, `match` and `dyn` call, executes the guessed path, and throws that work away when the guess
was wrong (10–25 cycles each). The tools build the chosen Rust crates with a hook in every basic
block and before every indirect call (woven in after LLVM optimises them), run the program, and
feed each branch to modelled predictors: bimodal, gshare, local history and TAGE-L for directions,
ITTAGE for targets, a BTB and a return stack. No `perf`, no root: the same build and input give the
same numbers, so a before/after diff is a real difference.

Needs Rust (`gameengine setup --native`). The first call builds the profiler into
`.gameengine/branch/` (about a minute); runs go to `.gameengine/branch/runs/<label>`.

## The loop

1. **Measure the starting point** with a label:
   ```bash
   gameengine tool branch-host --command "test . --js v8" --label before --model phone   # the game's own Rust on a woven host
   gameengine tool branch-run --manifest bench/Cargo.toml --label before --args "--n 20000"  # any cargo binary
   ```
   `branch-host` weaves the project's `native/` crate and transpiled systems unless `--crates a,b`
   names others; it needs an engine that builds host variants (`GAMEENGINE_HOST_VARIANT`, engine
   0.1.18+) and runs the engine's job pool on one thread. `branch-run` weaves the manifest's own
   crate, also builds it unwoven, and checks every hot line against that build. `--fn <substring>`
   keeps setup code out of the totals; `--model phone-low|phone|desktop` picks the core;
   `--time 5` adds the median wall time of five unwoven runs. Over MCP the tools are
   `tool_branch_run`, `tool_branch_host`, `tool_branch_show`, `tool_branch_diff`,
   `tool_branch_clean`.
2. **Read the top hotspot** (`H1`): a source line ranked by estimated cycles, its kind (branch,
   match, indirect call), its pattern class, each predictor's mispredictions and hint codes with a
   confidence. A transpiled system's hotspot leads with its TypeScript line: change the TypeScript
   there. `gameengine tool branch-show --run before --sites` lists a line's branch sites
   (unrolled loops give one per copy).
3. **Change one thing** the hint points at (table below), keeping results identical.
4. **Measure again** under a new label and compare: `gameengine tool branch-diff --before before --after after`.
   Then prove it: results unchanged (`gameengine test . --js both`, `--native both` for native
   systems, hash traces), and real time on a desktop **and on both core types of a phone**
   (`--time`, the game's own timers). Keep the change only if the diff and the clocks agree.

## Reading the numbers

- **mispredict** is the model's own predictor: gshare for `phone-low` (little cores), TAGE-short for
  `phone` (big phone cores), TAGE-L for `desktop`, each chosen against phone counters. All five
  direction predictors are in every report; a branch only TAGE-L gets right (a long loop exit, a
  long correlation) is fine on a desktop and costs on phones.
- **Pattern classes** (conditional branches): `random` (follows the data: nothing learns it),
  `early-exit` (a loop leaving after a data-dependent count), `loop` (fixed trip count N),
  `rare` (an `if` in a loop body that goes the other way now and then, alone each time: one
  misprediction each, usually nothing to change), `periodic` (repeats its own short pattern),
  `correlated` (needs other branches' history),
  `biased` (almost always one way: cheap), `mixed`.
- **est. cycles**: mispredictions × the core's measured penalty (the flushed speculative work)
  plus BTB misses × a fetch bubble. For ranking, not a measurement: a misprediction can overlap a
  cache miss, and a branchless rewrite adds work of its own.
- **release build**: `branch` (the unwoven code branches at this line too: trust the hint),
  `select` or `none` (the shipped code has no branch there; the woven build kept one). The hint's
  confidence follows: `high` needs a confirmed branch and 10k+ predictions.
- `--format json` returns the whole report; `parseReport`, `hintCodes` and the `BranchReport`
  types in the package's exports read `report.json` in a project tool.

## Hints and what to try

| Code | Means | Try |
|---|---|---|
| `UNPREDICTABLE_BRANCH` | the outcome follows the data | compute both sides and select (`if c { a } else { b }` on plain values, `min`/`max`, masks); or sort/partition the data so equal outcomes come in runs |
| `EARLY_EXIT` | a `break` on data ends a loop after a varying count | compare a fixed number of items into a bit mask, then `trailing_zeros` (vectorises); bound the loop by a constant |
| `SHORT_LOOP_EXIT` | a fixed short loop's exit mispredicts | fixed trip counts the compiler unrolls (`chunks_exact`, arrays), merge short inner loops |
| `NEEDS_LONG_HISTORY` | only TAGE-L predicts it (big desktop cores) | hoist loop-invariant conditions (one loop per case), fold dependent tests into one or a table |
| `PERIODIC_BRANCH` | every k-th iteration differs | unroll by the period, or split the loop per case |
| `RARE_BRANCH` | a rare outcome, alone each time, mispredicts once each | only if hot: select when both sides are cheap, or handle the rare items apart and drop the test |
| `PARTLY_PREDICTABLE` | mispredicts often, no clear pattern | branchless if both sides are cheap; order the data |
| `UNPREDICTABLE_MATCH` | a `match` picks arms at random | sort or bucket items by variant, one loop per variant, a lookup table for value-only arms |
| `POLYMORPHIC_CALL` | a `dyn`/fn-pointer call changes target | one list per concrete type, or sort by type; enums and static dispatch also inline |
| `BTB_MISSES`, `BTB_PRESSURE` | taken branches miss the branch target buffer | keep cold paths out of line (`#[cold]`, `#[inline(never)]`), less unrolling and inlining in hot loops |
| `RETURN_STACK_OVERFLOW` | deep call chains overflow the return stack | iterate with an explicit stack, flatten hot call chains |
| `NOT_A_BRANCH_IN_RELEASE` | the shipped code has no branch here | leave it, or confirm with `gameengine native asm` and a timing |

## Rules that still apply

- **Sim code stays bit-identical** (skill `determinism`): sorting or partitioning entities for
  predictability must not change the order results depend on. Prove it with `--hash-trace` and
  `--js both` / `--native both`.
- **Branchless is a trade, not a rule.** It removes mispredictions and adds work: in the
  package's practice scenarios a branchless 16-slot search was 1.6–2.9× faster on big phone
  cores and desktops and 10–40% slower on in-order little cores (Cortex-A55/A510). Time both core
  types before keeping it.
- **Measure on a phone** before claiming a speed-up.

## Practice scenarios

The package ships `tools/scenarios/` (in `node_modules/@tactilegames/gameengine.branch-profiler/`):
`filter`, `partition`, `dispatch`, `search`, each `--variant naive|tuned`, kernels named
`<scenario>_naive` / `_tuned`. Profile a naive one, improve it, compare with the tuned one:

```bash
gameengine tool branch-run --manifest node_modules/@tactilegames/gameengine.branch-profiler/tools/scenarios/Cargo.toml --fn _naive --args "dispatch --iters 3"
```

## Limits

Linux x86-64 hosts run the tools; the runtime also works in AArch64 Android binaries the package's
validation built by hand. Only the woven crates are seen (std code inlined into them included);
the engine's own crates in an installed engine are prebuilt and not woven. Branches are rebuilt
from basic blocks after optimisation: an `if` the compiler turned into a select has no branch, and
backend if-conversion that the hooks block is caught by the release check, not modelled. A block
feeds the direction predictors from its first change of direction on. One predictor state for all
threads (behind a lock); a program killed instead of exiting writes no profile; do not weave signal
handlers or a global allocator. Woven runs are much slower than plain ones; never compare their
wall time. Woven host builds take several GB: `gameengine tool branch-clean` removes them.
