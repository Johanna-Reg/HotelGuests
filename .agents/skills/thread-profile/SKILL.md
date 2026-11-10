---
name: thread-profile
description: CPU core and thread profiling with gameengine tool thread-host, thread-run, thread-device, thread-diff - per-core load, big vs little core placement, serial work, frame critical path, parallel-region imbalance, hints (POOL_ON_LITTLE, SERIAL_SYSTEM, FEW_CHUNKS). Use when one core is busy while others idle, or to prove a split paid off.
---

# Spreading load over cores

`@tactilegames/gameengine.thread-profiler` answers "which core is overloaded, which thread and
system put the work there, and what would spread it". Its sampler reads every thread of the run
through native OS counters (CPU time, and where available, time waiting for a core, placement and state) every
millisecond, with no `perf` and no root. Engines that write the thread trace
(`GAMEENGINE_THREAD_TRACE`, engine PR #449) add which system or job ran on which thread and when:
frames, the critical path through each and the parallel regions inside systems.

Needs Rust for the sampler (`gameengine setup --native`); the first call builds it into
`.gameengine/thread/` (seconds). Runs go to `.gameengine/thread/runs/<label>`. The phone sampler
needs the Android NDK (`gameengine setup --platform android`).

## The loop

1. **Measure the starting point** with a label:
   ```bash
   gameengine tool thread-host --command "test . --js v8" --label before            # a game test on this machine
   gameengine tool thread-device --bundle com.studio.game --seconds 15 --label phone-before   # a dev/probe build running on a phone
   gameengine tool thread-run --manifest bench/Cargo.toml --args "--n 20000" --label before  # any program
   ```
   Profile one JS engine at a time (`--js v8`). Desktops are shared and noisy: `--repeat 5` keeps
   the median run, `--cpus 0-3` gives the command a phone's core count, `--threads 3` sets the job
   pool (`GAMEENGINE_JOB_THREADS`). `thread-device` takes the engine's frame report first
   (`gameengine device perf`, frame times and fps) and then samples the app; final numbers come
   from a phone. Over MCP the tools are `tool_thread_host`, `tool_thread_device`, `tool_thread_run`,
   `tool_thread_show`, `tool_thread_diff`, `tool_thread_import`, `tool_thread_clean`.
2. **Read the hints first** (ranked by estimated time saved), then the critical path (what each
   frame waited on), the parallel regions (idle share, imbalance, tail, chunks, where the last chunk
   ended) and the thread table (CPU, waits, core classes).
3. **Change one thing** the top hint points at (table below). Keep sim results identical.
4. **Measure again** under a new label and compare: `gameengine tool thread-diff --before before --after after`.
   Check hashes: `gameengine test . --js both`, `--native both`, and `GAMEENGINE_JOB_THREADS=1`
   against the default pool (the job count must never change a hash). Keep the change only if the
   frame time (desktop: several runs; phone: the frame report) agrees with the diff.

## Reading the numbers

- **window**: frames from the trace (`frame`, else `sim.step`), else the process's lifetime (the
  host's start-up included: prefer the trace).
- **core classes**: little, mid, big or prime from the kernel's CPU capacity. Desktops are one class.
- **CPU, waited for a core, off**: running; runnable with no free core (more busy threads than
  cores, or other processes); sleeping or blocked.
- **serial work**: share of the work done while at most one thread ran, and the Amdahl ceiling it
  sets (`now` is the speed-up the run had). From the trace when there is one; from /proc alone it
  is smeared over the kernel's 4 ms tick and undercounts short serial phases.
- **critical path** (traced runs): per frame, serial systems and passes, parallel regions (the
  system that launched them), main-thread work outside any span (engines with a `sim.hash` span
  name the per-step hash) and main-thread idle time.
- **parallel region**: idle share = 1 − busy ÷ (threads × wall); imbalance = busiest ÷ mean
  thread; tail = last end − median end; blocked = time job threads slept inside their spans.
- **switches per job**: voluntary context switches of the job threads per job; about 1 when jobs
  run to the end, dozens when they wait on a lock.

## Hints and what to try

| Code | Means | Try |
|---|---|---|
| `POOL_ON_LITTLE` | job threads run on little cores while big ones are free | engines with ADR 0454 keep the pool on the top-class cores, one thread each, on phones with 3+ of them (dev builds: `debug.gameengine.jobpool`); a smaller pool loses wide work; fewer, longer jobs do not fix placement |
| `MAIN_THREAD_BOUND` | the sim thread is busy, the pool mostly idle | move the biggest serial systems to `par_for_each` |
| `SERIAL_SYSTEM` | a system runs alone on the main thread | native: `par_for_each(ctx, &spec, BATCH_ROWS, …)`; script: a native twin with it (transpiled systems stay serial) |
| `SERIAL_PASS` | an engine pass or span runs alone (`sim.hash`, `apply`, …) | split it if its items are independent; `sim.hash` only runs in dev, probe and test builds |
| `OUTSIDE_SYSTEMS` | main-thread work with no span | mostly the per-step hash with `sim.hashInDev`; else commands and structural changes |
| `FEW_CHUNKS` | fewer chunks than threads, or a long tail | more, smaller fixed batches (about 4 per thread); a constant batch size, never the thread count |
| `SHORT_REGION` | sub-millisecond region, idle with no tail | the cost is waking threads: merge it with other parallel work, use fewer threads, or keep it serial |
| `UNEVEN_CHUNKS` | chunk cost per item varies | smaller chunks, or spread the expensive rows |
| `LITTLE_CORE_TAIL` | the last chunk usually ends on a little core | smaller chunks so big cores take the rest |
| `BLOCKED_IN_JOBS` | job threads sleep inside jobs, or switch many times per job | per-job output buffers merged after the join instead of a shared lock |
| `MAIN_ON_LITTLE` | the sim thread runs on little cores | steadier per-frame work; less main-thread work |
| `OVERSUBSCRIBED` / `BUSY_MACHINE` | threads wait for cores | fewer threads at once / measure on an idle machine or a phone |
| `AMDAHL_CEILING`, `OVER_BUDGET`, `JS_WORKERS` | context | shrink the serial part first; phone-low's budget is 33.3 ms (30 fps) |

## Rules that still apply

- **Sim results stay bit-identical** (skill `determinism`): a batch size is a constant, commands
  merge in range order, and a hash may not depend on the thread count.
- **A trace is the evidence for systems and frames**; /proc alone gives load and placement.
- **Measure on a phone** before claiming a speed-up. A desktop's cores are all big and other
  processes share them.

## Practice scenarios

The package ships `tools/scenarios` (`threadprof-scenarios`, it writes the thread trace too):
`split`, `serial`, `lock`, `jobs`, each `--variant naive|tuned` with the same checksum, and `synth`
(threads with known CPU time, `--truth` writes what they measured themselves).

```bash
gameengine tool thread-run --manifest node_modules/@tactilegames/gameengine.thread-profiler/tools/scenarios/Cargo.toml --args "jobs --variant naive --threads 6" --label jobs-naive
```

## Limits

Linux and Android use `/proc`; Windows x64 uses Tool Help and PDH; macOS ARM64 uses libproc
and Mach. Read `capabilities` before using a report metric. Windows/macOS run-queue wait,
migrations and per-thread placement are unavailable (`null`, not zero); per-core machine load
can still be measured. Windows thread state is unavailable too, so blocked-share hints need
Linux/Android or macOS state samples. Native core classes and clock rates are unknown. `--cpus`
is currently Linux/Android-only in the sampler. `processTree` records native process CPU counters
for the whole recording, including ended threads, independently of a frame-selected window.
macOS uses libproc thread handles, not `pthread_self()` pointers, and notes any engine kernel IDs
matched by unique thread name.

Linux/Android states are read once per tick, so jobs
shorter than two ticks have no blocked share. The kernel publishes a running thread's CPU time at
scheduler ticks: per-thread totals are exact, timing inside a tick is not. On phones the sampler
itself costs about a third of a little core at 2 ms (Android's /proc reads are expensive). Without
an engine trace there are no frames, systems' parallelism or critical path.
