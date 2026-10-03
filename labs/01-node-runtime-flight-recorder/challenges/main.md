# Node Runtime Flight Recorder

Build a CLI that runs another Node program and records what happened during the run: lifecycle, stdout, stderr, memory, CPU, event loop delay, active handles, warnings, crashes, signals, and exit behavior.

The finished recorder is a parent process. It launches a child Node process, observes the process boundary, injects a small probe when the parent needs in-process data, and writes reports a developer can inspect after the run. Starter target programs live in `files/fixtures/`. Copy each fixture into your lab project's `fixtures/` directory when a phase asks for it.

## Phase 0: Create The Project

### Goal

Create a CLI project shell that accepts a target script path, prints useful help, and rejects invalid flags clearly.

### Why this matters

The recorder is a durable tool with a real project shape. It will launch other programs, create reports, write sidecar files, and preserve failure evidence. A predictable project layout keeps those artifacts separated from the implementation.

Start with command shape and failure behavior. Later phases can then focus on observation with project wiring already settled.

### Build

Work through these setup steps in order. Check each step after the checkpoint passes.

#### Step 1: Create the project manifest

**Task**: Create `package.json` for the recorder project. Configure ESM with `"type": "module"`, set `"private": true`, add an `"engines"` entry for Node v24 or newer, and add a `flight` npm script that runs `src/cli.js`.

**Mechanics**: Node reads package metadata before it loads project files. The `"type": "module"` field fixes how `.js` files are parsed, and the engine range records the runtime baseline for the lab.

**Hint**: Keep the manifest small. The only script that needs to work in this phase is `flight`.

**Checkpoint**: `package.json` clearly states ESM mode, Node v24 or newer, and a `flight` script.

#### Step 2: Create the project folders

**Task**: Create `src/`, `fixtures/`, `reports/`, and `out/`.

**Mechanics**: The recorder needs separate locations for implementation files, observed target programs, generated reports, and temporary run output.

**Hint**: Keep generated artifacts out of `src/`. Report files belong under `reports/`, and scratch output belongs under `out/`.

**Checkpoint**: Each folder exists and has a single clear job.

#### Step 3: Create the CLI entry file

**Task**: Create `src/cli.js`. Make it print a short usage screen when run with `--help`.

**Mechanics**: The CLI entrypoint owns argument parsing and dispatch. It should stay small while the run logic moves into separate modules.

**Hint**: The help text should name the target script argument and the report flags planned for later phases.

**Checkpoint**: `npm run flight -- --help` prints usage text and exits successfully.

#### Step 4: Parse the target path

**Task**: Update `src/cli.js` so the first non-option argument becomes the target script path.

**Mechanics**: Node gives the CLI an argv array. The recorder needs to split recorder options from the child script path before it can launch anything.

**Hint**: Store both the original target text and an absolute resolved path. Reports need both values. For recording mode, keep recorder flags before the target path. Once the parser has consumed the target, the remaining arguments belong to `targetArgs`.

**Checkpoint**: `npm run flight -- fixtures/hello.js` accepts the target path and prints a parsed command summary.

#### Step 5: Define the initial option object

**Task**: Normalize parsed input into one object with `target`, `targetArgs`, `json`, `html`, `markdown`, `envFile`, `nodeFlags`, `timeoutMs`, and `sampleMs`.

**Mechanics**: A stable option object prevents later phases from passing loose argument arrays through the codebase.

**Hint**: Set defaults now. `json` can default to `reports/flight.json`; `sampleMs` can default to `250`. The `--` after `npm run flight` only tells npm to pass the rest through. In the recorder's own argv, `npm run flight -- --json reports/run.json fixtures/hello.js --child-arg` means `--json` belongs to the recorder and `--child-arg` belongs to the target.

**Checkpoint**: A temporary debug print shows one structured options object for valid commands.

#### Step 6: Treat help as success

**Task**: Make `--help` print usage and exit with code `0`.

**Mechanics**: Help output is a successful CLI operation. Scripts and checks rely on that exit code.

**Hint**: Set `process.exitCode = 0` or return normally from the CLI main function.

**Checkpoint**: `npm run flight -- --help` exits successfully.

#### Step 7: Reject unknown flags

**Task**: Make unknown recorder flags print an error on stderr and exit with a failure code.

**Mechanics**: Silent flag mistakes create false test results. A recorder should fail early when the command shape is invalid.

**Hint**: Keep an allowlist for the flags introduced so far.

**Checkpoint**: `npm run flight -- --wat fixtures/hello.js` fails clearly, while `--help` still succeeds.

### Run

Run `npm run flight -- --help`.

### Expected behavior

The CLI prints usage text. A valid target path parses cleanly. Unknown flags fail with a clear stderr message.

### Hints

Keep this phase focused on command shape. The recorder should accept a target path before it knows how to launch it.

### Debugging notes

If arguments appear to vanish, print `process.argv` inside `src/cli.js`. `npm run flight -- --help` passes `--help` through to your script.

### Checkpoint

The project has the expected folders, the `flight` script runs, `--help` succeeds, a target path parses, and unknown flags fail.

### Reflection

Explain which capabilities come from the recorder's parent process boundary.

## Phase 1: Launch A Child Node Process

### Goal

Run a target Node script from the CLI and preserve the child's exit result.

### Why this matters

The recorder observes a real process from the outside. The child has its own PID, memory space, environment snapshot, stdio streams, and exit status. The parent owns the recording session.

The first useful recorder behavior is simple: launch the child, wait for it to finish, and return the same outcome to the shell.

### Build

Check each step after the target process runs through the parent.

#### Step 1: Add the first fixture

**Task**: Copy `files/fixtures/hello.js` into `fixtures/hello.js`.

**Mechanics**: Fixtures give the recorder stable target programs. Each later fixture stresses a different runtime behavior.

**Hint**: Keep fixtures inside the project the learner is building. Reserve `src/` for implementation files.

**Checkpoint**: `node fixtures/hello.js` prints a short message and exits with code `0`.

#### Step 2: Create the run module

**Task**: Create `src/run.js` and export an async `run(options)` function.

**Mechanics**: Launch logic will grow quickly. Keeping it outside `src/cli.js` gives the CLI one job and the runner one job.

**Hint**: Pass the normalized options object from Phase 0 into `run()`.

**Checkpoint**: `src/cli.js` imports `run()` and calls it when a target path exists.

#### Step 3: Spawn the child Node process

**Task**: Use `child_process.spawn()` with `process.execPath` and the resolved target path.

**Mechanics**: `process.execPath` launches the same Node binary that started the recorder. That keeps the lab's runtime consistent.

**Hint**: Start with `stdio: ["ignore", "inherit", "inherit"]`.

**Checkpoint**: `npm run flight -- fixtures/hello.js` prints the child's message.

#### Step 4: Capture the final child result

**Task**: Listen for `error`, `spawn`, and `close`. Resolve the run result from `close` with `{ pid, exitCode, signal }`.

**Mechanics**: The `close` event reports after stdio streams have closed. That gives the parent the final process result for this phase.

**Hint**: Use `error` for launch failures and `close` for process completion.

**Checkpoint**: A debug log can show the child's PID and exit code after the child finishes.

#### Step 5: Preserve the child exit code

**Task**: Set the recorder's `process.exitCode` to the child exit code when the child exits by code. Use `1` for recorder infrastructure failures.

**Mechanics**: The shell, npm, CI, and parent processes read the recorder's exit code. The wrapper must carry the observed program's failure state outward.

**Hint**: Set `process.exitCode` after report writing paths finish. Direct `process.exit()` can cut off async writes.

**Checkpoint**: A child that exits with code `0` makes the recorder exit with code `0`.

### Run

Run `npm run flight -- fixtures/hello.js`.

### Expected behavior

The child script runs, prints its message, and exits. The parent receives the child PID and exit code.

### Hints

Keep a single launch path. Later observers should attach to the same `child` object.

### Debugging notes

If the target path lookup fails, print the resolved target path. If the recorder exits with `0` after a child failure, the parent lost the child's exit status.

### Checkpoint

The parent receives the child's exit code and exposes it through the recorder process exit code.

### Reflection

Explain the difference between the parent process and the observed child process in this tool.

## Phase 2: Capture stdout And stderr

### Goal

Stream child stdout and stderr through the recorder while recording byte counts and output timestamps.

### Why this matters

Standard I/O is the first visible process boundary. A child can succeed, fail, warn, or hang, and its output often carries the first evidence.

The recorder should pass output through live while retaining bounded evidence for reports.

### Build

Check each step after live output and `reports/stdio.json` agree.

#### Step 1: Add the noisy fixture

**Task**: Copy `files/fixtures/noisy.js` into `fixtures/noisy.js`.

**Mechanics**: The fixture writes to both stdout and stderr so the recorder can prove it handles both streams.

**Hint**: Run the fixture directly once before recording it.

**Checkpoint**: Direct execution prints lines on stdout and stderr.

#### Step 2: Pipe child stdio into the parent

**Task**: Change spawn stdio to `["ignore", "pipe", "pipe"]`.

**Mechanics**: Piped stdio gives the parent readable streams for the child's output. The parent can inspect chunks before forwarding them.

**Hint**: Keep stdin ignored for now. Output observation is enough for this phase.

**Checkpoint**: `child.stdout` and `child.stderr` exist when the child starts.

#### Step 3: Forward stdout chunks

**Task**: On each `child.stdout` chunk, write the original Buffer to `process.stdout`.

**Mechanics**: Live passthrough keeps the developer experience close to running the child directly.

**Hint**: Use `process.stdout.write(chunk)`. Avoid `console.log(chunk)`.

**Checkpoint**: Running the recorder still shows stdout lines in the terminal.

#### Step 4: Forward stderr chunks

**Task**: On each `child.stderr` chunk, write the original Buffer to `process.stderr`.

**Mechanics**: Stderr carries diagnostics and failure evidence. It should stay on the error stream.

**Hint**: Mirror the stdout path, but keep counters separate.

**Checkpoint**: Running the recorder still shows stderr lines in the terminal.

#### Step 5: Record byte counts and previews

**Task**: Maintain `stdout.bytes`, `stderr.bytes`, and `events`. Each output event should include `type`, `at`, `bytes`, and a capped `preview`.

**Mechanics**: Byte counts come from the Buffer chunks. Previews give report readers evidence while keeping report size bounded.

**Hint**: Count `chunk.length` before converting the preview to text.

**Checkpoint**: The in-memory stdio state has separate byte counts for stdout and stderr.

#### Step 6: Write the stdio report

**Task**: Write `reports/stdio.json` when the child closes.

**Mechanics**: The first report file proves the recorder can preserve evidence after the child exits.

**Hint**: Create `reports/` before writing. Use JSON indentation while developing.

**Checkpoint**: `reports/stdio.json` includes stdout and stderr byte totals plus timestamped events.

### Run

Run `npm run flight -- fixtures/noisy.js`.

### Expected behavior

Logs still appear in the terminal, and `reports/stdio.json` records stdout and stderr byte counts.

### Hints

Use one timeline clock for all events. `performance.now()` works well for offsets inside one recorder run.

### Debugging notes

Converting a Buffer to a string before counting bytes can produce wrong byte totals for binary output.

### Checkpoint

`reports/stdio.json` includes `stdout.bytes`, `stderr.bytes`, and at least one event for each stream.

### Reflection

Explain why live stdio streaming is the right policy for a recorder.

## Phase 3: Record Process Lifecycle

### Goal

Capture spawn time, exit time, signal, exit code, and elapsed duration in a lifecycle report.

### Why this matters

A run has several states: launch attempt, successful spawn, process close, signal termination, and recorder failure. Lifecycle data becomes the base record that later samples attach to.

Every report needs the same lifecycle fields so failures and successful runs can be compared.

### Build

Check each step after the non-zero fixture produces a report.

#### Step 1: Add the exit-code fixture

**Task**: Copy `files/fixtures/exit-code.js` into `fixtures/exit-code.js`.

**Mechanics**: The fixture gives the recorder a controlled non-zero exit.

**Hint**: Run it directly and inspect the shell exit code before recording it.

**Checkpoint**: Direct execution exits with code `7`.

#### Step 2: Create the lifecycle module

**Task**: Create `src/lifecycle.js` with helpers for starting and finishing a lifecycle record.

**Mechanics**: Lifecycle fields are shared by JSON, HTML, Markdown, and comparison reports.

**Hint**: Keep the shape stable: `pid`, `startedAt`, `exitedAt`, `exitCode`, `signal`, and `elapsedMs`.

**Checkpoint**: The runner can create a lifecycle record before calling `spawn()`.

#### Step 3: Record start state

**Task**: Set `startedAt` as an ISO timestamp and save a monotonic start time before `spawn()`.

**Mechanics**: Wall timestamps are useful to humans. Monotonic time is the right source for duration math.

**Hint**: Use `performance.now()` for elapsed time and `new Date().toISOString()` for wall time.

**Checkpoint**: The lifecycle record has a start timestamp even if launch fails.

#### Step 4: Record child identity

**Task**: Set `pid` on the `spawn` event.

**Mechanics**: The PID exists after the operating system creates the child process.

**Hint**: Launch failures can reach the `error` event before a PID exists.

**Checkpoint**: Successful runs include the child PID in the lifecycle record.

#### Step 5: Record final state

**Task**: On `close`, set `exitedAt`, `exitCode`, `signal`, and `elapsedMs`.

**Mechanics**: The final lifecycle event tells the rest of the recorder how the run ended.

**Hint**: Keep one finalization function so report writing runs once.

**Checkpoint**: The lifecycle record contains final status and elapsed time.

#### Step 6: Write `reports/lifecycle.json`

**Task**: Write the lifecycle record at the end of the run.

**Mechanics**: Non-zero exit codes still need reports. The parent should write evidence before returning the child status.

**Hint**: Use `process.exitCode`, then let report writes finish.

**Checkpoint**: `reports/lifecycle.json` includes `pid`, `startedAt`, `exitedAt`, `exitCode`, `signal`, and `elapsedMs`.

### Run

Run `npm run flight -- fixtures/exit-code.js`.

### Expected behavior

The child exits with a non-zero code. The recorder reports that code clearly and exits with the same code.

### Hints

Keep launch errors separate from child process failures. They are different failure domains.

### Debugging notes

`exit` and `close` can both fire. Use one final result path for report writing.

### Checkpoint

`reports/lifecycle.json` contains the required lifecycle fields.

### Reflection

Explain why developer tooling must preserve the child exit code.

## Phase 4: Forward Signals

### Goal

Forward `SIGINT` and `SIGTERM` from the recorder to the child and record the signal path.

### Why this matters

The parent owns the terminal session for the run. When a user presses `Ctrl+C`, the recorder receives the interrupt and must pass shutdown intent to the process it launched.

Signal forwarding keeps the recorder from trapping the observed process.

### Build

Check each step after a Ctrl+C run exits cleanly.

#### Step 1: Add the long-running fixture

**Task**: Copy `files/fixtures/long-running.js` into `fixtures/long-running.js`.

**Mechanics**: A long-running child gives you time to send a signal and observe shutdown behavior.

**Hint**: Run it directly once and press Ctrl+C.

**Checkpoint**: The fixture logs work repeatedly and handles `SIGINT` or `SIGTERM`.

#### Step 2: Track whether the child is running

**Task**: Add an `isChildRunning(child)` helper that checks `exitCode` and `signalCode`.

**Mechanics**: Signal sending and process exit are separate states. The parent needs the final state and the sent-signal record.

**Hint**: Use the child object's public exit fields.

**Checkpoint**: The helper returns false after the child closes.

#### Step 3: Listen for parent signals

**Task**: Add parent listeners for `SIGINT` and `SIGTERM`.

**Mechanics**: Installing a signal listener makes the parent responsible for shutdown behavior.

**Hint**: Keep the listener small. Record the signal and call a shutdown helper.

**Checkpoint**: Pressing Ctrl+C records a parent signal event.

#### Step 4: Forward the signal to the child

**Task**: Isolate the child from the recorder's terminal signal path, then if the child is running, call `child.kill(signal)` and record the forwarded signal.

**Mechanics**: On POSIX systems, `detached: true` starts the child in a separate process group. That keeps terminal `Ctrl+C` delivery focused on the recorder path, then the recorder sends the signal to the child. Use `detached: process.platform !== "win32"` so Windows keeps its normal process behavior.

**Hint**: Add the `detached` option to the same `spawn()` call that already owns stdio. Store timeline events with `type: "parent-signal"` and `type: "forwarded-signal"`.

**Checkpoint**: The child logs that it received the signal.

#### Step 5: Add a kill timeout

**Task**: Add `--kill-timeout-ms`, default it to `5000`, and send `SIGKILL` when the child remains alive after the deadline.

**Mechanics**: Developer tools need a bounded shutdown path. A stuck child should produce evidence and then be terminated.

**Hint**: `unref()` the timeout so parent shutdown can proceed when no other work remains.

**Checkpoint**: A child that ignores the first signal is force-killed after the deadline.

#### Step 6: Record signal outcome

**Task**: Add `parentSignals`, `forwardedSignals`, `forceKilled`, and final `signal` fields to the report state.

**Mechanics**: A child may handle a signal and then exit by code. The report should preserve the full signal path.

**Hint**: Record the signal the parent received even when the child exits by code.

**Checkpoint**: A Ctrl+C report shows at least one parent signal, at least one forwarded signal, and the child's final exit result.

### Run

Run `npm run flight -- fixtures/long-running.js`, then press `Ctrl+C`.

### Expected behavior

The recorder receives the terminal signal, forwards it to the child, and the child exits. The report records at least one parent signal, at least one forwarded signal, and the child's final exit result.

### Hints

Test signal forwarding before adding more probe logic. Signal behavior is easier to debug while the runner is still small.

### Debugging notes

`child.killed` means a signal was sent. Use `close`, `exitCode`, or `signalCode` for the child's final exit state.

If the child shares the recorder's process group, terminal `Ctrl+C` can reach both processes directly. That can produce duplicate parent signal events, duplicate forwarded signal events, duplicate child signal logs, or a final `signal` result. Isolate the child process group before treating the run as proof of parent-owned forwarding. On platforms or shells where duplicate delivery still occurs, keep the report check focused on the recorded parent signal, forwarded signal, and final child result.

### Checkpoint

The report records the signal path for a Ctrl+C run, and the child process has exited before the recorder exits.

### Reflection

Explain why swallowing `SIGINT` creates broken developer tools.

## Phase 5: Add An In-Process Probe

### Goal

Inject a preload script into the child process and send probe messages back to the parent.

### Why this matters

The parent can observe PID, exit status, stdio, signals, and elapsed time. Memory counters, event loop delay histograms, active resources, warnings, and last-chance failure events live inside the child process.

The probe is the recorder's small in-process component. It should measure and report, then stay out of the target program's way.

### Build

Check each step after the parent receives `probe-ready`.

#### Step 1: Add the server fixture

**Task**: Copy `files/fixtures/basic-server.js` into `fixtures/basic-server.js`.

**Mechanics**: A server fixture keeps the process alive long enough to prove the probe loaded.

**Hint**: Use a timeout in the recorder run so the test finishes.

**Checkpoint**: Direct execution starts a server on an ephemeral port.

#### Step 2: Create the probe module

**Task**: Create `src/probe/register.js` as an ESM preload.

**Mechanics**: `--import` loads ESM preload modules before the target entrypoint.

**Hint**: Keep the probe free of target application imports.

**Checkpoint**: The child can start with `node --import ./src/probe/register.js fixtures/basic-server.js`.

#### Step 3: Add probe launch flags

**Task**: Insert `--import` and the probe path into the child Node argument list before the target script path.

**Mechanics**: Node consumes preload flags before it evaluates the entrypoint.

**Hint**: Build the child command as an argv array and record that array in the report.

**Checkpoint**: The target still starts, and `process.execArgv` in the child includes the preload.

#### Step 4: Add a bounded run timeout

**Task**: Parse `--timeout-ms <number>` and terminate the child when the run exceeds the deadline.

**Mechanics**: The server fixture keeps listening after the probe loads. The recorder needs a bounded observation window before later handle diagnostics exist.

**Hint**: Record `timedOut: true`, send `SIGTERM`, then reuse the Phase 4 kill timeout if the child ignores the signal.

**Checkpoint**: `npm run flight -- --timeout-ms 1500 fixtures/basic-server.js` exits after the timeout instead of hanging.

#### Step 5: Choose the probe transport

**Task**: Implement either IPC or a sidecar newline-delimited JSON file for probe events.

**Mechanics**: The probe needs a path back to the parent that still works while the target program is running.

**Hint**: IPC is clean when you configure `stdio` with `"ipc"`. A sidecar file is easy to inspect after a crash.

**Checkpoint**: The parent receives or reads one structured probe event.

#### Step 6: Send a `probe-ready` event

**Task**: Send a startup event with `type`, `pid`, `nodeVersion`, `execArgv`, and `at`.

**Mechanics**: The first probe event proves the preload ran before the target did meaningful work.

**Hint**: Use the same timeline clock style as the parent. Store offsets consistently.

**Checkpoint**: The parent timeline contains a `probe-ready` event.

#### Step 7: Pass probe configuration through the environment

**Task**: Set environment variables such as `FLIGHT_RECORDER_RUN_ID`, `FLIGHT_RECORDER_PROBE_FILE`, and `FLIGHT_RECORDER_SAMPLE_MS` before spawn.

**Mechanics**: Environment variables give the preload small startup configuration while keeping parent code out of child imports.

**Hint**: Prefix every recorder variable with `FLIGHT_RECORDER_`.

**Checkpoint**: The probe can read its run id and sample interval from `process.env`.

### Run

Run `npm run flight -- --timeout-ms 1500 fixtures/basic-server.js`.

### Expected behavior

The child starts with the probe loaded, and the parent records a `probe-ready` event.

### Hints

Use an absolute path or file URL for the probe path. Relative preload paths can break when the working directory changes.

### Debugging notes

A bad preload aborts the child before the target script runs. Record that as a startup failure.

### Checkpoint

The parent receives and records a `probe-ready` event from the child.

### Reflection

Explain what the parent can observe externally versus what requires in-process instrumentation.

## Phase 6: Measure Memory

### Goal

Sample RSS, heap usage, external memory, and array buffer memory from inside the child.

### Why this matters

Node memory has several counters. The V8 heap can stay flat while Buffer backing stores and native allocations push RSS higher.

Memory samples should become a time series with raw values and peak values.

### Build

Check each step after external memory grows in the report.

#### Step 1: Add the buffer fixture

**Task**: Copy `files/fixtures/buffer-leak.js` into `fixtures/buffer-leak.js`.

**Mechanics**: The fixture retains Buffers over time so external and array buffer counters move.

**Hint**: Keep the fixture small enough to run on a laptop.

**Checkpoint**: Direct execution prints retained buffer counts.

#### Step 2: Start memory sampling in the probe

**Task**: In `src/probe/register.js`, start an interval controlled by `FLIGHT_RECORDER_SAMPLE_MS`.

**Mechanics**: Sampling inside the child can call `process.memoryUsage()` directly.

**Hint**: Send one initial sample immediately, then sample on the interval.

**Checkpoint**: The parent receives at least one `memory-sample` event.

#### Step 3: Record all memory counters

**Task**: Send `rss`, `heapTotal`, `heapUsed`, `external`, and `arrayBuffers` in each memory event.

**Mechanics**: The recorder needs the whole memory shape: V8 heap, RSS, external memory, and array buffer memory.

**Hint**: Store values in bytes. Human-readable conversion belongs in report rendering.

**Checkpoint**: Raw samples contain all five fields from `process.memoryUsage()`.

#### Step 4: Keep the sampler from extending process lifetime

**Task**: Call `unref()` on the sampling interval.

**Mechanics**: The probe should observe the child. Its timer should let the child exit naturally.

**Hint**: Guard the call because only timer handles expose `unref()`.

**Checkpoint**: A short-lived fixture can still exit while the probe interval exists.

#### Step 5: Aggregate peaks in the parent

**Task**: Compute `peakRss`, `peakHeapUsed`, `peakExternal`, and `peakArrayBuffers` from received samples.

**Mechanics**: The parent owns report summaries. The probe sends measurements.

**Hint**: Update peaks as each sample arrives.

**Checkpoint**: Peak fields rise when later samples have larger values.

#### Step 6: Write `reports/memory.json`

**Task**: Write `samples` and `peaks` to `reports/memory.json`.

**Mechanics**: The memory report becomes chart input for later HTML output.

**Hint**: Keep raw sample timestamps next to byte counters.

**Checkpoint**: `reports/memory.json` includes peak RSS, heap used, external memory, and array buffer memory.

### Run

Run `npm run flight -- --sample-ms 100 fixtures/buffer-leak.js`.

### Expected behavior

External memory grows when Buffers are retained.

### Hints

Use a sampling interval around `100` ms for this fixture so growth is visible across several samples.

### Debugging notes

RSS can stay high after objects become unreachable. Allocator behavior and process accounting affect that number.

### Checkpoint

`reports/memory.json` includes peak RSS, heap used, external memory, and array buffer memory.

### Reflection

Explain why Buffer-heavy programs can look healthy if you inspect only heap usage.

## Phase 7: Measure CPU Usage

### Goal

Sample process CPU usage over time and compute total CPU time for the child.

### Why this matters

Elapsed time describes wall-clock duration. CPU time describes scheduled CPU consumed by the process in user and system mode.

CPU-bound JavaScript occupies the main thread while it runs. The recorder should place that spike next to the other run evidence.

### Build

Check each step after the CPU fixture produces a visible spike.

#### Step 1: Add the CPU fixture

**Task**: Copy `files/fixtures/cpu-loop.js` into `fixtures/cpu-loop.js`.

**Mechanics**: The fixture runs a synchronous hot loop, then stays alive briefly so a delayed interval sample can report the consumed CPU time.

**Hint**: Keep output minimal so terminal writes stay out of the measured work.

**Checkpoint**: Direct execution takes around a second and exits.

#### Step 2: Capture the first CPU reading

**Task**: In the probe, call `process.cpuUsage()` at startup and store the result.

**Mechanics**: CPU usage is cumulative. A baseline reading lets you compute deltas.

**Hint**: Store the baseline with a monotonic timestamp.

**Checkpoint**: The probe has an initial CPU reading before the first interval fires.

#### Step 3: Compute sample deltas

**Task**: On each sample, compute `userMicros`, `systemMicros`, `totalMicros`, `wallMs`, and `cpuPercent` from the previous reading.

**Mechanics**: CPU percentage is CPU delta divided by wall-clock delta over the sample window.

**Hint**: Convert wall milliseconds to microseconds before calculating the percentage.

**Checkpoint**: Each CPU sample includes user time, system time, total time, wall time, and percent.

#### Step 4: Send CPU samples to the parent

**Task**: Send events with `type: "cpu-sample"` and the computed fields.

**Mechanics**: The parent timeline should show when CPU pressure happened.

**Hint**: Keep `userMicros` and `systemMicros` separate in raw data.

**Checkpoint**: The parent receives multiple CPU samples for the hot-loop fixture.

#### Step 5: Summarize total CPU time

**Task**: In the parent, compute `totalCpuMicros` and identify the hottest sample.

**Mechanics**: The final report needs both detailed samples and a quick summary.

**Hint**: The hottest sample can be the sample with the largest `cpuPercent`.

**Checkpoint**: `reports/cpu.json` includes samples, total CPU time, and the hottest sample.

### Run

Run `npm run flight -- --sample-ms 100 fixtures/cpu-loop.js`.

### Expected behavior

CPU usage spikes during the hot loop.

### Hints

The sampling interval can drift during CPU-bound work. That drift is useful evidence.

### Debugging notes

CPU samples collected inside the child can be delayed while JavaScript is blocked. Compare them with event loop delay in the next phase.

### Checkpoint

The CPU report shows a visible spike when `fixtures/cpu-loop.js` runs.

### Reflection

Explain the difference between elapsed time and CPU time.

## Phase 8: Measure Event Loop Delay

### Goal

Measure event loop delay and report min, max, mean, p95, and p99 values.

### Why this matters

An async server still runs JavaScript callbacks on the main thread. Synchronous JSON work, CPU loops, GC pauses, and heavy callbacks can delay timers, I/O callbacks, and signal handlers.

The event loop delay histogram turns that delay into a reportable metric.

### Build

Check each step after the JSON fixture produces delay evidence.

#### Step 1: Add the blocking JSON fixture

**Task**: Copy `files/fixtures/blocking-json.js` into `fixtures/blocking-json.js`.

**Mechanics**: Large `JSON.stringify()` and `JSON.parse()` calls run synchronously on the main thread.

**Hint**: The fixture should stay alive briefly after the blocking work so the probe can report the sample.

**Checkpoint**: Direct execution prints a line after the blocking JSON work finishes.

#### Step 2: Create the delay histogram

**Task**: In the probe, import `monitorEventLoopDelay` from `node:perf_hooks`, create a histogram, and enable it.

**Mechanics**: The histogram records how late event loop turns arrive relative to expected scheduling.

**Hint**: Start with a `10` ms resolution.

**Checkpoint**: The probe can read histogram fields after one sample window.

#### Step 3: Sample histogram statistics

**Task**: On each sample, collect `min`, `max`, `mean`, `stddev`, `p50`, `p95`, `p99`, `exceeds`, and timer drift for the sample interval.

**Mechanics**: Percentiles show the distribution of delay across the sample window. Timer drift records how late the sampling interval fired compared with its scheduled time, which catches synchronous blocks that delay the sample callback itself.

**Hint**: Histogram values are nanoseconds. Store unit names clearly or convert during report rendering. Compute drift from `performance.now()` and the next expected sample time.

**Checkpoint**: Each event loop sample includes mean, percentile, and interval drift fields.

#### Step 4: Reset per-window samples

**Task**: Reset the histogram after each sample when you want per-window delay values, but keep whole-run summary values in the parent.

**Mechanics**: Per-window values make the timeline easier to read because each sample describes a time slice. A whole-run summary preserves the largest observed histogram value or interval drift even when a reset makes the next window small.

**Hint**: Keep a separate whole-run max in the parent from both histogram `max` and interval drift.

**Checkpoint**: Later samples describe new delay windows across the run, and the summary keeps the largest delay evidence.

#### Step 5: Write `reports/event-loop.json`

**Task**: Write event loop samples and summary fields to `reports/event-loop.json`.

**Mechanics**: The event loop report becomes a core part of the combined timeline.

**Hint**: Include `maxDelayMs`, `meanDelayMs`, `p95Ms`, and `p99Ms` in the summary. Either roll interval drift into `maxDelayMs` or add a separate `maxIntervalDriftMs` field.

**Checkpoint**: `reports/event-loop.json` includes min, max, mean, p95, p99, and interval drift values.

### Run

Run `npm run flight -- --sample-ms 100 fixtures/blocking-json.js`.

### Expected behavior

The report shows event loop delay evidence around the blocking JSON section. The histogram max may rise, the interval drift may rise, or both may rise.

### Hints

Pair each delay sample with the same `at` offset used by stdio, memory, and CPU events.

### Debugging notes

A very short fixture can exit before the histogram has enough data. Keep the fixture alive briefly after the blocking work.

Reading and resetting `monitorEventLoopDelay()` from the same short interval can miss a block near the reset boundary. Treat interval drift as valid evidence: a delayed sample timer means the event loop was busy while the synchronous JSON work ran.

### Checkpoint

`reports/event-loop.json` includes `min`, `max`, `mean`, `p95`, `p99`, and interval drift fields. The blocking fixture produces either a raised histogram max or a raised interval drift value.

### Reflection

Explain why an async server can still become unresponsive.

## Phase 9: Track Active Handles

### Goal

Report active resources that keep the child process alive.

### Why this matters

Many Node runs finish application work and still stay alive. A timer, server, socket, child process, worker, or stream handle can keep the event loop referenced.

The recorder should turn a hang into evidence.

### Build

Check each step after the hanging fixture times out with handle evidence.

#### Step 1: Add the hanging server fixture

**Task**: Copy `files/fixtures/hanging-server.js` into `fixtures/hanging-server.js`.

**Mechanics**: A listening server creates a referenced handle that keeps the child alive.

**Hint**: Use port `0` so the OS chooses an available port.

**Checkpoint**: Direct execution starts a server and stays alive.

#### Step 2: Add run timeout support

**Task**: Extend the Phase 5 `--timeout-ms` path so timed-out runs carry handle diagnostics.

**Mechanics**: Phase 5 used timeout as a probe smoke-test boundary. In this phase, timeout becomes evidence for programs that stay alive.

**Hint**: Record `timedOut: true` before sending the termination signal.

**Checkpoint**: `npm run flight -- --timeout-ms 1500 fixtures/hanging-server.js` ends by timeout.

#### Step 3: Sample active resource names

**Task**: In the probe, call `process.getActiveResourcesInfo()` when available.

**Mechanics**: Resource type names are safer to report than private handle objects.

**Hint**: Send the raw type-name list plus counts.

**Checkpoint**: The parent receives an `active-handles` event.

#### Step 4: Add guarded private handle inspection

**Task**: Add an optional helper around `process._getActiveHandles()` for extra diagnostics.

**Mechanics**: Private handle objects can expose useful class names, but their shape is version-sensitive.

**Hint**: Redact paths, addresses, and data values before writing reports.

**Checkpoint**: Private handle data appears only when the helper is available and safe to serialize.

#### Step 5: Classify handles

**Task**: Classify resources into `timer`, `server`, `socket`, `stdio`, `ipc`, and `unknown`.

**Mechanics**: A report reader needs categories alongside internal type names.

**Hint**: Keep raw names in the report so the classification can be audited.

**Checkpoint**: The handle report includes category counts and raw resource names.

#### Step 6: Capture final handle evidence on timeout

**Task**: Request or wait for a final handle sample before killing the child.

**Mechanics**: Timeout evidence should describe why the child was still alive.

**Hint**: With IPC, send a probe command for a final snapshot. With sidecar files, sample frequently enough near timeout.

**Checkpoint**: The final report explains the active handles present near timeout.

### Run

Run `npm run flight -- --timeout-ms 1500 fixtures/hanging-server.js`.

### Expected behavior

The recorder stops the run after the timeout and reports active handle summaries.

### Hints

Separate recorder-created IPC and stdio handles from handles created by the target program when possible.

### Debugging notes

The probe's own interval can appear in active resources unless it is unref'ed.

### Checkpoint

The final report includes active handle summaries for the hanging fixture.

### Reflection

Explain why an idle process may still be alive.

## Phase 10: Capture Warnings, Rejections, And Exceptions

### Goal

Record process warnings, unhandled rejections, and uncaught exceptions while preserving failure behavior.

### Why this matters

Runtime failures need evidence: timestamp, name, message, stack, and final exit behavior.

The probe can listen early enough to catch warnings and last-chance failure events. The parent owns the final report and exit status.

### Build

Check each step after the warning and failure fixtures leave evidence.

#### Step 1: Add the warning and failure fixtures

**Task**: Copy `files/fixtures/warning.js`, `files/fixtures/unhandled-rejection.js`, and `files/fixtures/uncaught-exception.js` into `fixtures/`.

**Mechanics**: The fixtures give the recorder one controlled warning, one unhandled promise rejection, and one uncaught exception.

**Hint**: Run each fixture directly once to see Node's default warning and failure behavior.

**Checkpoint**: The warning fixture exits successfully after emitting a warning, and both failure fixtures exit with a failure.

#### Step 2: Listen for warnings

**Task**: In the probe, add a `process.on("warning")` listener and serialize warning details.

**Mechanics**: Warnings can appear before the target has installed its own handlers.

**Hint**: Capture `name`, `message`, `stack`, and `code`.

**Checkpoint**: Running `fixtures/warning.js` creates a warning event in the parent timeline.

#### Step 3: Listen for unhandled rejections

**Task**: Add a probe listener for `unhandledRejection`.

**Mechanics**: The event gives the recorder a chance to capture the rejection reason before the process fails.

**Hint**: Serialize Error objects manually. `JSON.stringify(error)` loses non-enumerable fields.

**Checkpoint**: The report includes an `unhandled-rejection` event with a stack.

#### Step 4: Listen for uncaught exceptions

**Task**: Add a probe listener for `uncaughtException`.

**Mechanics**: This is a last-chance evidence path. Keep it short and reliable.

**Hint**: Flush the failure event quickly through your chosen transport.

**Checkpoint**: Running `fixtures/uncaught-exception.js` produces an `uncaught-exception` report event.

#### Step 5: Preserve failure behavior

**Task**: Make fatal listeners record evidence and still let the child fail.

**Mechanics**: A recorder should capture crashes, then return a failing result to the parent shell.

**Hint**: If your listener changes Node's default behavior, set a failure exit path deliberately.

**Checkpoint**: The recorder exits with a failing status when the child fails.

#### Step 6: Write failure evidence

**Task**: Add a `failures` section to the combined state or write `reports/failures.json`.

**Mechanics**: Failure data should be queryable from structured report fields.

**Hint**: Store `at`, `type`, `name`, `message`, `stack`, and source.

**Checkpoint**: The report includes runtime warnings and fatal errors with timestamps and stacks.

### Run

Run `npm run flight -- fixtures/warning.js`, then run `npm run flight -- fixtures/unhandled-rejection.js`, then run `npm run flight -- fixtures/uncaught-exception.js`.

### Expected behavior

The warning appears in the report. Each failure appears in the report with timestamp and stack, and the recorder exits with a failing status for the failing fixtures.

### Hints

Keep last-chance handlers small. Complex async cleanup in a crash path can fail before evidence is written.

### Debugging notes

Compare fixture behavior under plain Node and under the probe after adding each listener.

### Checkpoint

The report includes runtime warnings and fatal errors.

### Reflection

Explain why the recorder should record crashes and still let the run fail.

## Phase 11: Add Environment And Runtime Flag Support

### Goal

Pass `.env` files, selected environment variables, `NODE_OPTIONS`, and extra Node flags into the child, then record startup configuration.

### Why this matters

Startup configuration changes runtime behavior before the target entrypoint runs. A report that omits flags and environment sources can miss the reason warnings appear, source maps work, memory limits differ, or preloads run.

The recorder should make startup state explicit while redacting secrets.

### Build

Check each step after the child prints the expected environment value.

#### Step 1: Add the environment fixture

**Task**: Copy `files/fixtures/env.js` into `fixtures/env.js`, and copy `files/sample.env` into `.env`.

**Mechanics**: The fixture prints selected startup state so the recorder can prove what the child received.

**Hint**: Inspect `.env` before running the recorder so you know which value should appear.

**Checkpoint**: The fixture can print `FLIGHT_RECORDER_DEMO` when launched with the env file.

#### Step 2: Parse `--env-file`

**Task**: Add `--env-file <path>` to the recorder CLI.

**Mechanics**: Native Node env-file loading happens during startup, before the target code runs.

**Hint**: Prefer passing `--env-file` to the child Node process for this lab.

**Checkpoint**: The child receives values loaded from `.env`.

#### Step 3: Parse explicit environment overrides

**Task**: Add repeatable `--env KEY=value` support.

**Mechanics**: Parent-supplied environment overrides let the recorder run controlled experiments.

**Hint**: Split on the first `=` so values can contain additional equals signs.

**Checkpoint**: An explicit `--env FLIGHT_RECORDER_DEMO=override` changes the child's printed value.

#### Step 4: Parse extra Node flags

**Task**: Add repeatable `--node-flag <flag>` support and place those flags before the target path.

**Mechanics**: Node consumes runtime flags before it evaluates the entrypoint.

**Hint**: Keep child script arguments separate from Node flags.

**Checkpoint**: A flag such as `--node-flag --trace-warnings` appears in the child startup command before the target script.

#### Step 5: Record startup metadata

**Task**: Record `nodeVersion`, `execPath`, `execArgv`, `nodeFlags`, `envFiles`, and redacted environment keys.

**Mechanics**: Runtime reports need the startup inputs that shaped the process before user code ran.

**Hint**: Record the effective command as an argv array.

**Checkpoint**: The report shows the Node version, runtime flags, and env-file paths.

#### Step 6: Redact sensitive environment data

**Task**: Redact values for names containing `TOKEN`, `SECRET`, `PASSWORD`, `KEY`, or `CREDENTIAL`.

**Mechanics**: Reports are debugging artifacts and may be shared.

**Hint**: Recording key names is usually enough. Store values only for explicit non-sensitive demo keys.

**Checkpoint**: The report records startup configuration with secret redaction.

### Run

Run `npm run flight -- --env-file .env fixtures/env.js`.

### Expected behavior

The child receives the expected environment. The report records relevant runtime flags and Node version.

### Hints

A flag placed after the target path becomes a script argument. Keep runtime flags before the target.

### Debugging notes

`--env-file` loaded by Node can affect `NODE_OPTIONS` during startup. A parent-side parser runs at a later bootstrap point.

### Checkpoint

The report records startup configuration, relevant runtime flags, and Node version with secret redaction.

### Reflection

Explain why runtime reports need startup configuration.

## Phase 12: Generate The Timeline Report

### Goal

Combine lifecycle, stdio, memory, CPU, event loop delay, warnings, handle snapshots, and exit data into one ordered JSON report.

### Why this matters

Raw samples become useful when they are placed on one clock. The timeline lets a developer see output, metrics, warnings, and exit behavior in execution order.

The JSON report is the stable data product. HTML, Markdown, and comparison reports should read from the same structure.

### Build

Check each step after `reports/flight.json` contains an ordered timeline.

#### Step 1: Add the mixed-load fixture

**Task**: Copy `files/fixtures/mixed-load.js` into `fixtures/mixed-load.js`.

**Mechanics**: The fixture combines warning output, Buffer retention, CPU work, and ordinary logs.

**Hint**: Run it directly once so you know the visible output.

**Checkpoint**: Direct execution emits a warning, logs output, and exits.

#### Step 2: Create the JSON report module

**Task**: Create `src/report-json.js`.

**Mechanics**: Report assembly should be separate from process launching and probe collection.

**Hint**: Export a function that accepts the accumulated run state and a destination path.

**Checkpoint**: The runner can call the report module after child close.

#### Step 3: Define the report schema

**Task**: Include `schemaVersion`, `runId`, `command`, `startedAt`, `endedAt`, `durationMs`, `node`, `lifecycle`, `stdio`, `memory`, `cpu`, `eventLoop`, `handles`, `failures`, and `timeline`.

**Mechanics**: A stable schema lets later renderers and comparisons consume reports consistently.

**Hint**: Use `schemaVersion: 1`.

**Checkpoint**: Every generated JSON report has the same top-level keys.

#### Step 4: Normalize timeline events

**Task**: Convert all events into `{ at, type, source, data }`.

**Mechanics**: A single event shape lets the report sort and render heterogeneous runtime evidence.

**Hint**: `source` can be `parent`, `child-stdio`, or `probe`.

**Checkpoint**: Stdio, probe, warning, and lifecycle events share the same wrapper shape.

#### Step 5: Sort timeline events

**Task**: Sort events by numeric `at` offset and preserve insertion order for ties.

**Mechanics**: Numeric offsets avoid ambiguity between wall-clock timestamp formats.

**Hint**: Store an internal sequence number while collecting events, then omit it or keep it as `_seq`.

**Checkpoint**: `reports/flight.json` has timeline events in ascending order.

#### Step 6: Write atomically

**Task**: Write the report to a temp file in the destination directory, then rename it to the final path.

**Mechanics**: Atomic replacement avoids half-written reports after a crash during report generation.

**Hint**: Create the destination directory before writing the temp file.

**Checkpoint**: `--json reports/flight.json` writes valid JSON every time.

### Run

Run `npm run flight -- --json reports/flight.json fixtures/mixed-load.js`.

### Expected behavior

One report contains the full run, and `reports/flight.json` has ordered timeline events.

### Hints

Keep raw samples grouped by metric and also represented as timeline events. Different report views need different access patterns.

### Debugging notes

A failed run still needs a report. Treat report writing as part of the recorder contract.

### Checkpoint

`reports/flight.json` includes a sorted `timeline` array and all major metric sections.

### Reflection

Identify which timeline event explains the biggest runtime spike in `fixtures/mixed-load.js`.

## Phase 13: Generate HTML And Markdown Reports

### Goal

Produce human-readable HTML and Markdown reports from the JSON report.

### Why this matters

The JSON file is built for tools. A person debugging a run needs the result, the main spikes, and links back to timeline evidence.

HTML can show structured tables and visual bars. Markdown gives a portable artifact for pull requests and incident notes.

### Build

Check each step after `reports/flight.html` opens locally.

#### Step 1: Create the HTML renderer

**Task**: Create `src/report-html.js` and render from the JSON report object.

**Mechanics**: HTML rendering should consume stable schema data from the JSON report.

**Hint**: Start with static sections and add visual polish after the data is correct.

**Checkpoint**: The renderer can create an HTML file from `reports/flight.json`.

#### Step 2: Add summary cards

**Task**: Show exit status, duration, peak RSS, CPU time, and max event loop delay near the top.

**Mechanics**: Summary cards let a reader triage the run before reading details.

**Hint**: Convert bytes to MiB and microseconds to milliseconds for display.

**Checkpoint**: The first viewport shows the final result and the biggest metrics.

#### Step 3: Add metric sections

**Task**: Render stdio counts, memory samples, CPU samples, event loop percentiles, warnings, failures, and active handles.

**Mechanics**: Each metric answers a different runtime question.

**Hint**: Tables are enough. Small inline bars can make peaks easier to scan.

**Checkpoint**: Every major JSON section has a visible HTML section.

#### Step 4: Add the timeline table

**Task**: Render ordered timeline events with time offset, type, source, and a short data summary.

**Mechanics**: The timeline connects symptoms across subsystems.

**Hint**: Keep long stack traces and output previews collapsed or truncated.

**Checkpoint**: The timeline table follows the same order as the JSON report.

#### Step 5: Create the Markdown renderer

**Task**: Create `src/report-markdown.js` and support `--markdown reports/flight.md`.

**Mechanics**: Markdown gives a compact report that can be pasted into review notes.

**Hint**: Include run summary, top observations, timeline excerpt, warnings, failures, and report paths.

**Checkpoint**: `reports/flight.md` describes the same run as the HTML report.

#### Step 6: Escape untrusted report text

**Task**: Escape HTML output from child stdio, warnings, and stack traces.

**Mechanics**: Child output is untrusted text inside the report renderer.

**Hint**: Centralize HTML escaping in one helper.

**Checkpoint**: Output containing `<script>` appears as text in the HTML report.

### Run

Run `npm run flight -- --html reports/flight.html fixtures/mixed-load.js`.

### Expected behavior

The report shows summary cards, tables or visual bars, timeline, and warnings.

### Hints

Generate JSON first, then render HTML or Markdown from the same object.

### Debugging notes

Avoid rendering thousands of samples by default. Show summaries and a bounded table.

### Checkpoint

`reports/flight.html` opens locally and shows the run result, metric summaries, timeline, and failure evidence.

### Reflection

Write the production debugging rule this tool teaches.

## Phase 14: Compare Multiple Runs

### Goal

Compare two or more recordings and write a Markdown comparison report.

### Why this matters

Performance work is comparative. A single run shows what happened once. Multiple runs show what changed across implementation choices, flag sets, input sizes, or environments.

Comparison should consume existing JSON reports so recordings and analysis stay separate.

### Build

Check each step after `reports/comparison.md` highlights memory and timing differences.

#### Step 1: Add comparison fixtures

**Task**: Copy `files/fixtures/buffer-copy.js` and `files/fixtures/buffer-view.js` into `fixtures/`.

**Mechanics**: The fixtures create different Buffer ownership patterns for comparison and stay alive briefly so interval samples can capture the post-allocation memory state.

**Hint**: Record each fixture into its own JSON file with a short sampling interval.

**Checkpoint**: `reports/copy.json` and `reports/view.json` exist after recording both fixtures.

#### Step 2: Create the compare module

**Task**: Create `src/compare.js`.

**Mechanics**: Comparison reads reports. It should depend on report files and schema fields.

**Hint**: Accept two or more report paths.

**Checkpoint**: The compare command can parse input report paths.

#### Step 3: Validate report compatibility

**Task**: Check `schemaVersion` before comparing reports.

**Mechanics**: Schema mismatches can make metric comparisons wrong.

**Hint**: Fail with a clear message when versions differ.

**Checkpoint**: Reports with different schema versions are rejected.

#### Step 4: Compare core metrics

**Task**: Compare `durationMs`, `peakRss`, `peakHeapUsed`, `peakExternal`, `peakArrayBuffers`, `totalCpuMicros`, `maxEventLoopDelayMs`, `exitCode`, and warning or failure counts.

**Mechanics**: These fields show runtime cost, memory pressure, delay, and correctness outcome.

**Hint**: Treat the first report as the baseline unless `--baseline <path>` is provided.

**Checkpoint**: The comparison table includes absolute deltas and percent deltas where possible.

#### Step 5: Rank top differences

**Task**: Sort notable differences by percent delta, then by absolute delta.

**Mechanics**: A comparison report should put the largest behavior changes first.

**Hint**: Use `n/a` when the baseline value is zero.

**Checkpoint**: The report calls out the biggest memory and timing changes.

#### Step 6: Write the Markdown report

**Task**: Write `reports/comparison.md` with input paths, baseline command, comparison table, top differences, and notes about failed or timed-out runs.

**Mechanics**: The comparison report is the final artifact for performance review.

**Hint**: Include units in every table header.

**Checkpoint**: `reports/comparison.md` exists and compares at least two JSON recordings.

### Run

Run `npm run flight -- --sample-ms 100 --json reports/copy.json fixtures/buffer-copy.js`, then `npm run flight -- --sample-ms 100 --json reports/view.json fixtures/buffer-view.js`, then `npm run flight -- compare reports/copy.json reports/view.json --markdown reports/comparison.md`.

### Expected behavior

The comparison highlights memory and timing differences between the two runs.

### Hints

Keep compare mode able to read existing JSON files. A convenience command can record fresh runs later.

### Debugging notes

A failed run can still be comparable. Keep exit status and failure counts in the table.

### Checkpoint

`reports/comparison.md` compares at least two JSON recordings and calls out memory and timing deltas.

### Reflection

Explain why a single measurement is less useful than a comparison.
