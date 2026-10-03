# Async Task Runtime / Local Job Orchestrator

Build a local task runtime that reads task definitions, schedules work, limits concurrency, records every attempt, handles failures as data, and writes reports that make async control flow visible.

Keep the project local and dependency-light. Node v24 has the pieces you need: `node:child_process`, `node:events`, `AbortController`, timers, `fs.promises`, and the test runner. Each phase is a checkable build path. Finish a step, prove its checkpoint, then move on.

## Phase 0: Create The Project

### Goal

Create the task runtime project shell with a runnable CLI, project directories, and the first task-file argument path.

### Why this matters

Async orchestration gets hard to inspect when source files, task inputs, mutable state, and reports land in one directory. Separate paths give the runtime clean boundaries from the start.

The CLI is the public contract. Every later phase should prove itself through a command, a report, and a checkpoint that survives a second run.

### Build

- [ ] **Step 1: Create the project manifest**

  **Task**: Create `package.json` with `"type": "module"`, a Node v24 engine declaration, and the first scripts: `tasks`, `bench`, and `test`.

  **Runtime note**: The module format and runtime version belong in the manifest because every file after this phase depends on those assumptions.

  **Hint**: Keep the scripts small. `tasks` can point at `node src/cli.js`, `bench` can point at `node src/bench.js`, and `test` can use `node --test`.

  **Checkpoint**: The manifest clearly says the project uses ESM, expects Node v24 or newer, and exposes the three command names.

- [ ] **Step 2: Create the runtime folders**

  **Task**: Create `src/`, `tasks/`, `state/`, and `reports/`.

  **Runtime note**: Source code, task definitions, mutable run state, and final reports have different lifecycles. Keeping them separate makes later recovery and reporting easier to reason about.

  **Hint**: Assign one job to each directory. `src/` holds runtime code. `tasks/` holds inputs. `state/` holds live snapshots. `reports/` holds output evidence.

  **Checkpoint**: A directory listing shows all four folders at the project root.

- [ ] **Step 3: Create the CLI entry file**

  **Task**: Create `src/cli.js` and make it print a short overview when called with no arguments.

  **Runtime note**: The CLI entry point is the boundary between shell arguments and runtime behavior. It should stay small while the scheduler, runner, and persistence code grow in separate modules.

  **Hint**: Print command shape, default paths, and the main flags the lab will add later: `--concurrency`, `--mode`, `--cancel-after`, `--resume`, and `--progress`.

  **Checkpoint**: `node src/cli.js` prints a useful overview and exits with code `0`.

- [ ] **Step 4: Make `--help` succeed**

  **Task**: Update `src/cli.js` so `--help` prints the same overview and exits successfully.

  **Runtime note**: Help output is a successful command result. Exit codes are part of the CLI contract.

  **Hint**: Treat `--help` before task-file validation. A user should be able to ask for help without creating a task file first.

  **Checkpoint**: `npm run tasks -- --help` prints help text and exits with code `0`.

- [ ] **Step 5: Reject unknown flags**

  **Task**: Make the CLI reject unsupported flags with a clear error on `stderr` and a non-zero exit code.

  **Runtime note**: Silent flag mistakes produce misleading runs. A local tool should fail when the requested behavior is unknown.

  **Hint**: Start with a small `Set` of known flags. Any argument beginning with `--` that is missing from the set should become a user error.

  **Checkpoint**: `npm run tasks -- --wat` fails, prints the unknown flag, and exits with code `1`.

- [ ] **Step 6: Accept a task file path**

  **Task**: Parse the first positional argument as the task file path and print it back for now.

  **Runtime note**: The task file is the input boundary for the runtime. Later phases will replace the print statement with parsing, validation, and execution.

  **Hint**: Keep flags and positional arguments separate. A task file path should not be mistaken for a flag value.

  **Checkpoint**: `npm run tasks -- tasks/one-success.json` reaches the accepted-input path instead of showing help or crashing.

### Run

```sh
npm run tasks -- --help
npm run tasks -- tasks/one-success.json
npm run tasks -- --wat
```

### Expected behavior

The help command prints usage text. The task-file command accepts the path. The unknown flag fails clearly.

### Hints

Use raw `process.argv.slice(2)` first. A full CLI framework would hide the argument behavior this lab needs to expose.

### Debugging notes

- If `npm run tasks -- --help` swallows flags, check the `--` separator.
- If Node rejects `import`, check `"type": "module"`.
- If paths resolve oddly, print `process.cwd()` and the raw argument array.

### Checkpoint

The source folder exists. The task, state, and report folders exist. The overview command runs. The help flag succeeds. Unknown flags fail. A task file path is accepted.

### Reflection

Explain why async orchestration needs more runtime state than a direct `Promise.all(tasks.map(runTask))` call.

## Phase 1: Define A Task Format

### Goal

Define a small task file format and validate it before any task runs.

### Why this matters

The runner needs a stable input model. A task id needs to be unique. A timeout needs units. A dependency needs to point at another task that exists. Validation gives the scheduler one clean input shape before work starts.

### Build

- [ ] **Step 1: Create the task-format module**

  **Task**: Create `src/task-format.js` and define the normalized task shape the runtime will use internally.

  **Runtime note**: Raw JSON is user input. Normalized task objects are runtime input. Keeping those shapes separate keeps validation out of the scheduler.

  **Hint**: Include `id`, `type`, `command`, `args`, `module`, `export`, `timeoutMs`, `retries`, `dependsOn`, and `metadata`.

  **Checkpoint**: The module exports constants or helper functions that describe the accepted task fields.

- [ ] **Step 2: Create the loader**

  **Task**: Create `src/load-tasks.js` with a `loadTaskFile(filePath)` function that reads and parses JSON.

  **Runtime note**: File reading and JSON parsing can fail before validation starts. Those failures need path-aware error messages.

  **Hint**: Wrap `JSON.parse()` errors with the task file path and original parser message.

  **Checkpoint**: A malformed JSON file reports the file path and parse error without printing an unrelated stack trace.

- [ ] **Step 3: Validate the top-level file**

  **Task**: Require a top-level object with `version`, `tasks`, and optional `metadata`.

  **Runtime note**: A versioned input format gives later phases a place to change rules without guessing which format a task file uses.

  **Hint**: Validate the top-level shape before iterating tasks. That keeps errors specific.

  **Checkpoint**: A file missing `tasks` fails with a message that names the missing field.

- [ ] **Step 4: Validate each task**

  **Task**: Validate `id`, `type`, command fields, function fields, `timeoutMs`, `retries`, `dependsOn`, and `metadata`.

  **Runtime note**: The scheduler needs task ids, dependency ids, timeout values, and retry policies in predictable types.

  **Hint**: Include the task index in every error. `tasks[3].timeoutMs` is much better than `invalid timeout`.

  **Checkpoint**: Invalid task fields produce useful errors before execution starts.

- [ ] **Step 5: Validate relationships**

  **Task**: Reject duplicate task ids and dependency references that point at missing tasks.

  **Runtime note**: Relationship validation has to happen after every id is known. A single-task validator cannot know whether `dependsOn` points at a real task.

  **Hint**: Build a `Set` of ids first, then walk dependencies in a second pass.

  **Checkpoint**: Duplicate ids and unknown dependency ids fail with specific messages.

- [ ] **Step 6: Add the first fixtures**

  **Task**: Add `tasks/one-success.json` and `tasks/invalid-missing-id.json`.

  **Runtime note**: Fixtures make validation repeatable. The success file proves the happy path, and the invalid file proves the error path.

  **Hint**: Keep the success task small. Use `node -e` with `args: ["-e", "require('node:fs').writeFileSync(1, 'one success\\n')"]` so Phase 2 observes stdout bytes.

  **Checkpoint**: The success fixture loads, and the invalid fixture fails for the expected reason.

- [ ] **Step 7: Wire validation into the CLI**

  **Task**: Update `src/cli.js` so a task file is loaded, validated, and summarized.

  **Runtime note**: The CLI should reject bad input before the runtime creates timers, child processes, or state files.

  **Hint**: Print the number of tasks and their ids. Execution still waits until Phase 2.

  **Checkpoint**: The valid file prints a task count. The invalid file exits with code `1`.

### Run

```sh
npm run tasks -- tasks/one-success.json
npm run tasks -- tasks/invalid-missing-id.json
```

### Expected behavior

The valid file prints a task count and task ids. The invalid file exits with code `1` and names the bad field.

### Hints

Return all validation errors when that stays readable. Multiple clear errors save reruns.

### Debugging notes

- JSON parse errors should include the file path.
- A dependency cycle can wait until the scheduler phase.
- Treat `retries.maxAttempts` as total attempts. A value of `1` means one attempt.

### Checkpoint

Valid task definitions load into normalized task objects. Invalid definitions fail before execution starts.

### Reflection

Explain why task definitions need validation before execution.

## Phase 2: Run One Async Task

### Goal

Execute one task and write a report with status, start time, end time, and elapsed time.

### Why this matters

One task is the smallest unit the runtime owns. The scheduler, retry logic, progress stream, persistence layer, and shutdown handler will all depend on the same task result shape.

### Build

- [ ] **Step 1: Create the runner module**

  **Task**: Create `src/runner.js` and export `runTask(task, context)`.

  **Runtime note**: The runner owns one task attempt. The scheduler will call it many times later, but it should stay focused on one unit of work.

  **Hint**: Start with command tasks only. Function tasks enter in the next phase.

  **Checkpoint**: The module exports a callable runner and the CLI can import it.

- [ ] **Step 2: Spawn a command task**

  **Task**: Use `spawn()` from `node:child_process` for `type: "command"`.

  **Runtime note**: Command tasks run in child processes. The parent observes process events, output streams, exit code, and signal.

  **Hint**: Pass the configured `command` and `args` separately. Avoid building one shell string.

  **Checkpoint**: The command from `tasks/one-success.json` runs and prints its line.

- [ ] **Step 3: Capture timing**

  **Task**: Record `startedAt`, `endedAt`, and `elapsedMs`.

  **Runtime note**: Reports need wall-clock timestamps for humans and elapsed time for measurements.

  **Hint**: Use ISO strings for timestamps and `performance.now()` for elapsed milliseconds.

  **Checkpoint**: The result object includes start time, end time, and a positive elapsed value.

- [ ] **Step 4: Capture child process evidence**

  **Task**: Record `exitCode`, `signal`, `stdoutBytes`, and `stderrBytes`.

  **Runtime note**: Process evidence lets the report explain how the task ended without retaining all output forever.

  **Hint**: Stream output through to the parent terminal while counting chunk lengths.

  **Checkpoint**: A command that writes to stdout increments `stdoutBytes`.

- [ ] **Step 5: Produce a success result**

  **Task**: Resolve `runTask()` with `status: "success"` when the child closes with exit code `0`.

  **Runtime note**: The scheduler will treat task status as data. Success should be one explicit value, not the absence of an error.

  **Hint**: Wait for `close`, not just `exit`, so stdio has finished.

  **Checkpoint**: The success fixture returns a result object with `status: "success"`.

- [ ] **Step 6: Write the first report**

  **Task**: Write `reports/latest.json` after the run.

  **Runtime note**: A report is the durable output for the phase. Terminal output alone is hard to inspect after the process exits.

  **Hint**: Create `reports/` if needed before writing.

  **Checkpoint**: `reports/latest.json` contains one task result with timing and process evidence.

### Run

```sh
npm run tasks -- tasks/one-success.json
```

### Expected behavior

The command runs and exits successfully. `reports/latest.json` contains one successful task result.

### Hints

Resolve each child process once. Child process `error` and `close` events can expose double-resolution mistakes.

### Debugging notes

- If the report writes before output finishes, wait for `close`.
- If byte counts stay zero, inspect whether chunks are strings or Buffers.
- If `spawn()` cannot find the command, listen for `error`.

### Checkpoint

`reports/latest.json` includes `status`, `startedAt`, `endedAt`, and `elapsedMs` for the task.

### Reflection

Explain how an async function suspends while the child process is running and resumes when the awaited operation settles.

## Phase 3: Add Error Handling

### Goal

Capture task failures without crashing the runtime.

### Why this matters

Orchestration means failures become data. A failed command, a thrown function error, and a rejected Promise need different evidence in the report, but they should flow through one result shape.

### Build

- [ ] **Step 1: Define failure result fields**

  **Task**: Extend task results with `status: "failed"` and an `error` object.

  **Runtime note**: A classified error gives retries, reports, and mode logic a stable decision point.

  **Hint**: Use `kind`, `message`, and optional `stack`, `exitCode`, and `signal`.

  **Checkpoint**: Failed results have the same base fields as successful results plus an `error` object.

- [ ] **Step 2: Classify non-zero exits**

  **Task**: Convert child processes that close with a non-zero code into `error.kind: "non_zero_exit"`.

  **Runtime note**: A command exiting with code `7` is a task failure, not a runtime crash.

  **Hint**: Store both the status and the raw exit code.

  **Checkpoint**: `tasks/one-failure.json` produces a failed result with the exit code.

- [ ] **Step 3: Classify spawn errors**

  **Task**: Convert child process `error` events into `error.kind: "spawn_error"`.

  **Runtime note**: Spawn errors happen before the command has a normal process exit. They need their own evidence path.

  **Hint**: A missing executable is a good fixture for this branch.

  **Checkpoint**: A missing command produces a failed result with no fake exit code.

- [ ] **Step 4: Add function task support**

  **Task**: Dynamic import the configured module and call the configured export for `type: "function"`.

  **Runtime note**: Function tasks run in the current Node process. Their failures arrive as thrown errors or rejected Promises.

  **Hint**: Resolve module paths relative to the task file directory from Phase 1.

  **Checkpoint**: A function task can run and return successfully.

- [ ] **Step 5: Classify thrown and rejected errors**

  **Task**: Convert thrown errors into `error.kind: "thrown"` and rejected Promises into `error.kind: "rejected"`.

  **Runtime note**: Awaiting the task function observes Promise rejection and prevents unhandled rejection behavior.

  **Hint**: Call the function inside one `try`/`catch` and classify synchronous throws there. Store the returned value, then `await` that value inside a second `try`/`catch` to classify rejected Promises.

  **Checkpoint**: Function fixtures for throw and reject both become failed task results.

- [ ] **Step 6: Set the CLI exit code**

  **Task**: Make the CLI exit with code `1` when any task failed.

  **Runtime note**: Shell callers need an exit code that matches the run outcome.

  **Hint**: Set `process.exitCode` after writing the report.

  **Checkpoint**: A failing task writes a report and the command exits non-zero.

### Run

```sh
npm run tasks -- tasks/one-failure.json
npm run tasks -- tasks/function-failure.json
```

### Expected behavior

The process stays alive long enough to write a report. Each failing task lands in `reports/latest.json` with `status: "failed"` and a classified error.

### Hints

Convert non-`Error` thrown values into strings without losing the original value type.

### Debugging notes

- A rejected Promise that prints an unhandled rejection warning was created without an await or `.catch()`.
- A failed `spawn()` call may have no exit code.
- A command failure should still include start and end timestamps.

### Checkpoint

Reports include failure status, error message, and either stack details or process exit evidence.

### Reflection

Explain why a rejected Promise must be observed by the orchestrator.

## Phase 4: Add Concurrency Limits

### Goal

Run multiple tasks while keeping the number of active tasks under `--concurrency`.

### Why this matters

Unlimited async work creates pressure on child processes, file descriptors, memory, and downstream systems. A local runner needs an active count, a pending queue, and a way to record queue time.

### Build

- [ ] **Step 1: Create the scheduler**

  **Task**: Create `src/scheduler.js` and move multi-task execution into it.

  **Runtime note**: The scheduler owns task order and active count. The runner still owns one attempt.

  **Hint**: Keep scheduler state in maps keyed by task id.

  **Checkpoint**: The CLI calls the scheduler even for a one-task file.

- [ ] **Step 2: Add the concurrency flag**

  **Task**: Parse `--concurrency <n>` with a default of `1`.

  **Runtime note**: Concurrency is a runtime limit. It controls how many task attempts may be active at the same time.

  **Hint**: Reject zero, negative values, non-integers, and missing values.

  **Checkpoint**: `--concurrency 5` is accepted, and `--concurrency nope` fails clearly.

- [ ] **Step 3: Build the ready queue**

  **Task**: Queue tasks whose dependencies have succeeded and hold tasks whose dependencies are unresolved.

  **Runtime note**: A dependency describes an ordering constraint. A ready queue contains only tasks the scheduler may start now.

  **Hint**: Start with tasks that have an empty `dependsOn` array.

  **Checkpoint**: A dependent task starts after its dependency succeeds.

- [ ] **Step 4: Enforce the active count**

  **Task**: Start tasks while `activeCount < concurrency`, and decrement the count when a task finishes.

  **Runtime note**: The active count is the enforcement point. Every start and finish should pass through one path.

  **Hint**: Track `maxActive` as a guardrail while testing.

  **Checkpoint**: With 100 delay tasks and concurrency `5`, `maxActive` never exceeds `5`.

- [ ] **Step 5: Record queue timing**

  **Task**: Store `queuedAt`, `startedAt`, `queueMs`, and `endedAt` for every task.

  **Runtime note**: Queue time shows how long work waited because of concurrency and dependencies.

  **Hint**: Set `queuedAt` when a task enters the ready queue.

  **Checkpoint**: A task that waits behind other tasks has `queueMs > 0`.

- [ ] **Step 6: Handle blocked dependents**

  **Task**: Mark dependents as `blocked` when one of their dependencies fails.

  **Runtime note**: Blocked work reached a terminal state without running. Reports need to show that explicitly.

  **Hint**: Include the failed dependency id in the blocked task result.

  **Checkpoint**: A dependent task with a failed dependency never calls `runTask()`.

- [ ] **Step 7: Record run metrics**

  **Task**: Add `maxActive`, `queueLengthMax`, `taskCount`, `completedCount`, `failedCount`, and `blockedCount`.

  **Runtime note**: Run-level metrics prove scheduling behavior without reading every task result manually.

  **Hint**: Update counters from terminal statuses after the run finishes.

  **Checkpoint**: `reports/latest.json` includes scheduling metrics.

### Run

```sh
npm run tasks -- tasks/one-hundred-delays.json --concurrency 5
```

### Expected behavior

Only five tasks run at once. The report shows `maxActive: 5` and queue length metrics greater than zero.

### Hints

A small drain loop can start more queued work after every task finish.

### Debugging notes

- If `maxActive` reaches `6`, active count is probably updated in more than one place.
- If the process exits early, the scheduler likely resolves before every task is terminal.
- If dependents start after failed dependencies, check dependency status before enqueueing.

### Checkpoint

The report includes `maxActive` and `queueLengthMax`. For 100 delay tasks at concurrency `5`, `maxActive` stays at or below `5`.

### Reflection

Explain why concurrency limits are a form of backpressure.

## Phase 5: Add Promise Combinator Modes

### Goal

Compare `all`, `allSettled`, `race`, and `any` execution behavior.

### Why this matters

Promise combinators have different failure and completion semantics. A production runner needs to choose what happens after the first failure, the first success, or the first settled task.

### Build

- [ ] **Step 1: Add the mode flag**

  **Task**: Parse `--mode <all|allSettled|race|any>` with default `allSettled`.

  **Runtime note**: Mode changes the run outcome, not the mechanics of one task attempt.

  **Hint**: Validate mode values in the CLI before the scheduler starts.

  **Checkpoint**: Unknown modes fail before any task starts.

- [ ] **Step 2: Create mode decision helpers**

  **Task**: Create `src/modes.js` and define how each mode decides whether the run should continue.

  **Runtime note**: Keeping mode policy separate prevents scheduler code from turning into scattered conditionals.

  **Hint**: A helper can receive the current results and return `continue`, `stop`, and `reason`.

  **Checkpoint**: Unit tests can call the mode helper without running real tasks.

- [ ] **Step 3: Implement `allSettled`**

  **Task**: Keep scheduling until every runnable task reaches a terminal state.

  **Runtime note**: `allSettled` preserves the most evidence because it waits for every started and startable task.

  **Hint**: Treat blocked tasks as terminal for the mode count.

  **Checkpoint**: Mixed success and failure tasks all appear in the report.

- [ ] **Step 4: Implement `all`**

  **Task**: Stop the run after the first failed task, then cancel or skip work that has not started.

  **Runtime note**: `all` has fail-fast semantics for the aggregate result while already-started work may still need cleanup.

  **Hint**: Keep tracking already-started tasks until they finish or are canceled.

  **Checkpoint**: The report names the first failure and marks pending work explicitly.

- [ ] **Step 5: Implement `race`**

  **Task**: Stop after the first task settles, regardless of success or failure.

  **Runtime note**: `race` chooses the earliest terminal result among active tasks.

  **Hint**: Use fixtures with different delays so the result is observable.

  **Checkpoint**: The `race` report records `stoppedReason: "first_settled"`.

- [ ] **Step 6: Implement `any`**

  **Task**: Stop after the first success, or report aggregate failure if every candidate fails.

  **Runtime note**: `any` treats failure as tolerable until success becomes impossible.

  **Hint**: Use `AggregateError` for the all-failed outcome.

  **Checkpoint**: One successful task stops the run, and an all-fail file reports aggregate failure.

- [ ] **Step 7: Write a comparison report**

  **Task**: Add `reports/modes.json` with one entry per mode, and update the matching entry after each `--mode` run.

  **Runtime note**: The comparison report makes mode semantics visible without asking the reader to infer behavior from logs.

  **Hint**: Include `startedCount`, `settledCount`, `stoppedReason`, and final status counts. Use either an object keyed by mode or an array of `{ mode, ... }` entries. Read any existing `reports/modes.json`, replace the entry for the current mode, then write the complete collection back to disk.

  **Checkpoint**: Running all four modes produces comparable report entries.

### Run

```sh
npm run tasks -- tasks/mixed-results.json --mode all --concurrency 3
npm run tasks -- tasks/mixed-results.json --mode allSettled --concurrency 3
npm run tasks -- tasks/mixed-results.json --mode race --concurrency 3
npm run tasks -- tasks/mixed-results.json --mode any --concurrency 3
```

### Expected behavior

The modes stop or continue differently. The shared concurrency value lets `race` and `any` settle by task timing because several tasks can be active at once. The comparison report records how many tasks started, how many settled, and why each run stopped. Each command updates the matching mode entry in `reports/modes.json` while preserving the other mode entries.

### Hints

Keep mode decisions out of `runTask()`. Task execution should stay local to one task.

### Debugging notes

- `Promise.all()` rejects on the first rejection, while other already-started Promises keep running.
- If the report loses already-started tasks, keep tracking them after the aggregate outcome is decided.
- If `race` always chooses the first task in the file, the fixtures may have identical timing.

### Checkpoint

`reports/modes.json` compares mode behavior with `startedCount`, `settledCount`, `stoppedReason`, and final status counts.

### Reflection

Explain why `Promise.all()` can be the wrong production primitive for a task runtime.

## Phase 6: Add Timeouts

### Goal

Fail tasks that exceed a configured time limit.

### Why this matters

Async work can hang forever. A task runtime needs a deadline and cleanup path for each task, because a pending Promise alone does not stop the underlying operation.

### Build

- [ ] **Step 1: Read timeout configuration**

  **Task**: Use task-level `timeoutMs` and add a CLI fallback `--timeout <ms>` for tasks that omit it.

  **Runtime note**: Task-level deadlines should win over a broad CLI default because the task definition knows the work shape.

  **Hint**: Normalize the effective timeout before the attempt starts.

  **Checkpoint**: The report shows the effective timeout for each task attempt.

- [ ] **Step 2: Create an attempt abort controller**

  **Task**: Create an `AbortController` for each task attempt.

  **Runtime note**: Each attempt needs its own cancellation signal so retries and sibling tasks stay independent.

  **Hint**: Store the controller near attempt state, not global scheduler state.

  **Checkpoint**: Function tasks receive a signal in their context.

- [ ] **Step 3: Start and clear the timeout timer**

  **Task**: Start a timer when the attempt starts, abort the signal when it fires, and clear the timer when the attempt finishes.

  **Runtime note**: A timeout timer that survives a completed attempt can corrupt a later result.

  **Hint**: Put cleanup in a `finally` path.

  **Checkpoint**: Successful short tasks never change to timed out after completion.

- [ ] **Step 4: Terminate command tasks on timeout**

  **Task**: Send a termination signal to the child process when the timeout fires, then use a short kill grace period if needed.

  **Runtime note**: Aborting the parent-side signal only changes parent state. The child process also needs a termination path.

  **Hint**: Wait for the child `close` event before finalizing the result.

  **Checkpoint**: A timed-out command stops running and the parent process exits.

- [ ] **Step 5: Support abortable function tasks**

  **Task**: Pass `AbortSignal` into function tasks and update fixtures to observe it.

  **Runtime note**: Function cancellation is cooperative. The function must check or pass the signal into abort-aware APIs.

  **Hint**: `timers/promises.setTimeout(ms, value, { signal })` is useful for delay fixtures.

  **Checkpoint**: A long function task rejects or returns when the signal aborts.

- [ ] **Step 6: Report timeout status**

  **Task**: Add `status: "timed_out"`, `error.kind: "timeout"`, and `timedOutAt`.

  **Runtime note**: Timeout is a distinct outcome from normal failure. Retries and reports need that distinction.

  **Hint**: Capture the first timeout timestamp when the timer fires.

  **Checkpoint**: `tasks/timeout.json` reports `timed_out`, not `failed`.

### Run

```sh
npm run tasks -- tasks/timeout.json
```

### Expected behavior

The long task becomes `timed_out`. The report distinguishes timeout from ordinary failure and records the configured timeout.

### Hints

Keep timeout code around one attempt, not around the whole run.

### Debugging notes

- A timeout that fires after task success means the timer was not cleared.
- A timed-out command that keeps printing output means the child process has not been terminated.
- A function task that ignores the signal keeps running until its own awaited work finishes.

### Checkpoint

The timeout status is visible as `timed_out`, with `error.kind: "timeout"`, and it is separate from `failed`.

### Reflection

Explain why timeouts need cleanup after the runtime decides a task has exceeded its deadline.

## Phase 7: Add Cancellation

### Goal

Stop pending and running tasks with `AbortController`.

### Why this matters

Cancellation gives the caller a way to end a run before natural completion. JavaScript cancellation is cooperative, so the runtime can signal intent, update queued work, and clean up owned resources, while task functions need to observe the signal.

### Build

- [ ] **Step 1: Add run-level cancellation**

  **Task**: Add a run-level `AbortController` that represents cancellation for the whole run.

  **Runtime note**: Run cancellation affects queued tasks, running attempts, and scheduling decisions.

  **Hint**: Store the run signal in scheduler context.

  **Checkpoint**: The scheduler can tell whether the run has been canceled.

- [ ] **Step 2: Add `--cancel-after`**

  **Task**: Parse `--cancel-after <ms>` and trigger run cancellation after that delay.

  **Runtime note**: A timed cancellation flag makes cancellation repeatable in tests and demos.

  **Hint**: Clear the timer when the run finishes early.

  **Checkpoint**: A long run cancels at roughly the requested delay.

- [ ] **Step 3: Combine cancellation with timeouts**

  **Task**: Make each attempt observe both run cancellation and per-task timeout.

  **Runtime note**: Timeout and cancellation are different causes that may reach the same abort path.

  **Hint**: Record the first cause that changes the attempt state.

  **Checkpoint**: A canceled task reports `canceled`, while a deadline reports `timed_out`.

- [ ] **Step 4: Stop starting queued work**

  **Task**: When cancellation starts, stop dequeuing new tasks and mark queued tasks as `canceled`.

  **Runtime note**: Queued tasks can finish immediately because no work has started for them.

  **Hint**: Terminal queued tasks still need timestamps and report entries.

  **Checkpoint**: Queued tasks never call `runTask()` after cancellation.

- [ ] **Step 5: Abort running attempts**

  **Task**: Abort the signals for running attempts and let their runners finish cleanup.

  **Runtime note**: Running work may own a child process, timer, stream, or pending Promise. The runner needs the chance to release those resources.

  **Hint**: Reuse the command termination path from the timeout phase.

  **Checkpoint**: Running tasks move to `canceled` or finish with clear cancellation evidence.

- [ ] **Step 6: Record run cancellation**

  **Task**: Add `run.canceledAt`, `run.cancelReason`, and a list of canceled task ids.

  **Runtime note**: Run-level cancellation is part of the report, not just individual task state.

  **Hint**: Use one timestamp for the run cancellation moment and per-task timestamps for terminal states.

  **Checkpoint**: `reports/latest.json` names the cancellation reason and canceled tasks.

### Run

```sh
npm run tasks -- tasks/cancel-after.json --concurrency 2 --cancel-after 250
```

### Expected behavior

Running tasks receive an abort signal. Queued tasks never start. The report includes canceled task ids and the run-level cancellation timestamp.

### Hints

A queued task should never call `runTask()`. Its terminal state belongs to scheduler logic.

### Debugging notes

- If every task starts before cancellation, lower concurrency or increase task count.
- If the process hangs after cancellation, a running function is ignoring `signal.aborted`.
- If timeout and cancellation race, record the first reason that changed attempt state.

### Checkpoint

The report distinguishes `canceled` tasks from `timed_out`, `failed`, and `queued`.

### Reflection

Explain why JavaScript cancellation is cooperative.

## Phase 8: Add Retries

### Goal

Retry failed tasks using a bounded policy.

### Why this matters

Real task runners distinguish transient failure from permanent failure. A retry policy gives the runtime a controlled second attempt, and the attempt history keeps that choice auditable.

### Build

- [ ] **Step 1: Normalize retry policy**

  **Task**: Read `retries.maxAttempts`, `retries.backoffMs`, optional `retries.factor`, and optional `retries.retryOn`.

  **Runtime note**: Retry behavior should be explicit per task, with bounded attempts and a known delay policy.

  **Hint**: Treat `maxAttempts` as total attempts, including the first.

  **Checkpoint**: A task with `maxAttempts: 1` runs only once.

- [ ] **Step 2: Wrap attempts in retry logic**

  **Task**: Create `runTaskWithRetries(task, context)` that calls `runTask()` until success or budget exhaustion.

  **Runtime note**: The scheduler should see one final task result while the report preserves every attempt.

  **Hint**: Keep the loop close to attempt state, not inside the scheduler queue code.

  **Checkpoint**: A successful first attempt returns without scheduling a retry.

- [ ] **Step 3: Classify retryable outcomes**

  **Task**: Retry only statuses and error kinds allowed by the policy.

  **Runtime note**: A timeout, spawn error, and thrown validation error may deserve different retry behavior.

  **Hint**: Default to retrying `failed` and `timed_out`, then let `retryOn` narrow the list.

  **Checkpoint**: A canceled task never retries.

- [ ] **Step 4: Implement backoff**

  **Task**: Wait `backoffMs` before attempt `2`, then multiply by `factor` for later attempts when present.

  **Runtime note**: Backoff spaces attempts and makes retry cost visible.

  **Hint**: Store the computed next delay on the failed attempt before waiting.

  **Checkpoint**: Retry attempts start after the configured delay.

- [ ] **Step 5: Record attempt history**

  **Task**: Record `attempt`, `status`, `startedAt`, `endedAt`, `elapsedMs`, `error`, and `nextDelayMs`.

  **Runtime note**: Attempt history explains how the final task status was reached.

  **Hint**: Preserve all attempts even when the final attempt succeeds.

  **Checkpoint**: A flaky task that succeeds on attempt `3` shows attempts `1`, `2`, and `3`.

- [ ] **Step 6: Add deterministic flaky fixtures**

  **Task**: Add function fixtures that fail the first N attempts based on metadata or a small state file in `state/`.

  **Runtime note**: Deterministic failure makes retry behavior testable without random timing or probability.

  **Hint**: Use task metadata to decide how many failures should occur before success.

  **Checkpoint**: The same flaky fixture behaves the same way across runs after state is reset.

### Run

```sh
npm run tasks -- tasks/flaky.json --concurrency 3
```

### Expected behavior

Flaky tasks eventually succeed or exhaust their attempt budget. The report shows every attempt and the delay between attempts.

### Hints

Retries should reuse the same runner path as normal execution. A retry is another attempt, not a separate task type.

### Debugging notes

- If attempts exceed `maxAttempts`, check whether the counter means total attempts or extra retries.
- If every retry starts immediately, confirm that the backoff wait is awaited.
- If a task succeeds after retry but still reports failed, promote the final attempt status to the task status.

### Checkpoint

`reports/latest.json` includes `attempts` for retried tasks, and no task runs more attempts than its policy permits.

### Reflection

Explain why retries without limits are dangerous.

## Phase 9: Add EventEmitter Lifecycle Events

### Goal

Emit task lifecycle events from the runtime.

### Why this matters

EventEmitter is a natural boundary for local observers. The runner can emit state changes while the CLI, logger, progress iterator, and tests subscribe without being built into the scheduler.

### Build

- [ ] **Step 1: Create a runtime event boundary**

  **Task**: Create `src/runtime.js` or make the orchestrator extend `EventEmitter`.

  **Runtime note**: Events let observers attach to state changes without changing scheduler logic.

  **Hint**: Keep the scheduler as the source of lifecycle events.

  **Checkpoint**: The CLI can attach a listener before starting the run.

- [ ] **Step 2: Emit start events**

  **Task**: Emit `task:start` immediately before an attempt begins.

  **Runtime note**: Start events mark the transition from queued to running.

  **Hint**: Include `taskId`, `attempt`, `timestamp`, and current status.

  **Checkpoint**: Every running attempt has one `task:start` event.

- [ ] **Step 3: Emit outcome events**

  **Task**: Emit `task:success`, `task:failure`, and `task:retry` at the matching state transitions.

  **Runtime note**: Outcome events are the input for logging and progress without requiring the logger to inspect scheduler internals.

  **Hint**: Emit `task:retry` after a failed attempt is classified and before the backoff wait.

  **Checkpoint**: A retried task emits failure, retry, then another start.

- [ ] **Step 4: Emit finish events**

  **Task**: Emit `task:finish` for every terminal task state, including `failed`, `timed_out`, `canceled`, and `blocked`.

  **Runtime note**: A finish event closes the lifecycle for one task regardless of outcome.

  **Hint**: Include final status in the payload.

  **Checkpoint**: Every task has exactly one `task:finish` event.

- [ ] **Step 5: Add event logging**

  **Task**: Add `--log-events` to print lifecycle events as they happen.

  **Runtime note**: A logger listener proves event ordering while keeping output optional.

  **Hint**: Keep payloads as plain objects so they can be serialized.

  **Checkpoint**: `--log-events` prints event names and task ids in order.

- [ ] **Step 6: Test listener behavior**

  **Task**: Add tests for listener order and the `error` event contract.

  **Runtime note**: EventEmitter dispatch is synchronous, and the `error` event has process-level consequences when no listener is attached.

  **Hint**: Ordinary task failures belong on `task:failure`, not the generic `error` event.

  **Checkpoint**: Tests prove order for a successful task and a retried task.

### Run

```sh
npm run tasks -- tasks/flaky.json --log-events
npm test
```

### Expected behavior

Lifecycle events appear in order. Tests prove listener order and error-event behavior.

### Hints

Event payloads should stay small. Heavy listener work delays the emitter call stack.

### Debugging notes

- If `task:finish` fires before `task:success`, check where final status is assigned.
- If an unhandled `error` event crashes the process, add an explicit listener or use a different event name for task failures.
- If logs appear out of order, inspect listeners that await work inside the handler.

### Checkpoint

The logger prints `task:start`, terminal outcome, and `task:finish` in deterministic order. Tests cover listener order and `error` event behavior.

### Reflection

Explain why EventEmitter dispatch is synchronous.

## Phase 10: Add Async Iterator Progress

### Goal

Expose task progress as an async iterator.

### Why this matters

Async iteration fits event streams that produce values over time and then close. The runtime can turn lifecycle events into progress records, while the CLI consumes them with `for await...of`.

### Build

- [ ] **Step 1: Create the progress module**

  **Task**: Create `src/progress.js` and export `progressEvents(runtime, options)`.

  **Runtime note**: The progress module adapts EventEmitter events into the AsyncIterator protocol.

  **Hint**: Keep progress code separate from the scheduler so it can subscribe like any other observer.

  **Checkpoint**: The CLI can import `progressEvents()`.

- [ ] **Step 2: Define progress records**

  **Task**: Convert lifecycle events into records with `type`, `taskId`, `status`, `attempt`, `timestamp`, and optional `message`.

  **Runtime note**: Progress records are stream values. They should be small, serializable, and ordered.

  **Hint**: Preserve the original lifecycle event name in `type`.

  **Checkpoint**: A start event becomes one progress record.

- [ ] **Step 3: Implement buffering**

  **Task**: Buffer records that arrive before the consumer calls `next()`.

  **Runtime note**: EventEmitter can emit before an async iterator consumer is waiting. A small queue prevents progress loss.

  **Hint**: Store records in an array and shift them when `next()` is called.

  **Checkpoint**: Early task events appear in progress output.

- [ ] **Step 4: Implement pending pulls**

  **Task**: Resolve pending `next()` calls when new progress arrives.

  **Runtime note**: Async iterators need a Promise that settles when the next value exists.

  **Hint**: Keep one resolver for the current pending pull, or a small list if you support multiple pulls.

  **Checkpoint**: `for await...of` waits instead of busy-looping.

- [ ] **Step 5: Close the iterator**

  **Task**: End the iterator on normal completion, cancellation, or runtime error, and remove listeners.

  **Runtime note**: Listener cleanup controls process lifetime and prevents duplicate progress in later runs.

  **Hint**: Implement `return()` so breaking out of the loop cleans up too.

  **Checkpoint**: The process exits after progress output finishes.

- [ ] **Step 6: Add the progress CLI flag**

  **Task**: Add `--progress` and print live progress lines using `for await...of`.

  **Runtime note**: The CLI becomes a consumer of progress, not a scheduler special case.

  **Hint**: Attach the iterator before starting the runtime.

  **Checkpoint**: `--progress` prints state changes as tasks run.

### Run

```sh
npm run tasks -- tasks/one-hundred-delays.json --concurrency 5 --progress
```

### Expected behavior

Progress appears as tasks change state. The process exits after the iterator closes. Cancellation also closes the iterator cleanly.

### Hints

Line-based progress is enough. Terminal drawing can wait.

### Debugging notes

- If the process never exits, check for listeners or timers left attached after completion.
- If progress misses early events, attach the iterator before starting the runtime.
- If cancellation drops final records, close the iterator after terminal statuses are emitted.

### Checkpoint

`--progress` uses `for await...of` and the iterator closes on normal completion and cancellation.

### Reflection

Explain how async iteration can model event streams.

## Phase 11: Persist Task State

### Goal

Save task state to disk during a run.

### Why this matters

Local runtimes need to recover evidence after interruption. A report written only at the end loses information when the process receives a signal, crashes, or is killed by the user.

### Build

- [ ] **Step 1: Create the state store**

  **Task**: Create `src/state-store.js` with `save(snapshot)` and `load()` operations.

  **Runtime note**: Persistence should sit behind one module so the scheduler only deals with snapshots.

  **Hint**: Keep the state file path configurable, with `state/run.json` as the default.

  **Checkpoint**: A small test can save and load a snapshot.

- [ ] **Step 2: Use atomic writes**

  **Task**: Write state to a temp file, then rename it to `state/run.json`.

  **Runtime note**: Atomic writes reduce the chance of a partially written state file after interruption.

  **Hint**: Use a temp filename in the same directory as the final file.

  **Checkpoint**: Repeated saves produce valid JSON in `state/run.json`.

- [ ] **Step 3: Define the state schema**

  **Task**: Persist `runId`, `taskFile`, `startedAt`, `updatedAt`, `status`, `options`, `tasksById`, and `events`.

  **Runtime note**: State is the runtime's current truth, while reports are final evidence.

  **Hint**: Store normalized task definitions alongside task state.

  **Checkpoint**: The state file can describe the run without reading the original task file.

- [ ] **Step 4: Persist every transition**

  **Task**: Save after each task state transition and retry event.

  **Runtime note**: Recovery quality depends on how recently the runtime persisted its state.

  **Hint**: Save snapshots from lifecycle event handlers if that keeps scheduler code smaller.

  **Checkpoint**: While a long run is active, `state/run.json` changes as tasks move through states.

- [ ] **Step 5: Add status output**

  **Task**: Add `--status` to read `state/run.json` and print current run state.

  **Runtime note**: Status output lets the user inspect incomplete work after interruption.

  **Hint**: Show counts by status and list running or interrupted task ids.

  **Checkpoint**: `npm run tasks -- --status` prints state without starting a new run.

- [ ] **Step 6: Add resume inspection**

  **Task**: Add `--resume` to load `state/run.json` and report incomplete work.

  **Runtime note**: A restarted process cannot assume previously running tasks still exist. It needs reconciliation.

  **Hint**: Mark previously `running` tasks as `interrupted` unless you implement replay, then save the reconciled snapshot back to `state/run.json`.

  **Checkpoint**: After a killed run, resume output and `state/run.json` distinguish completed, failed, queued, and interrupted work.

### Run

```sh
npm run tasks -- tasks/cancel-after.json --concurrency 2
npm run tasks -- --status
npm run tasks -- tasks/cancel-after.json --resume
```

Kill the first command while tasks are running.

### Expected behavior

`state/run.json` exists during the run. After interruption, the runtime can report completed, failed, queued, and running or interrupted tasks.

### Hints

A state snapshot is easier to persist than a set of mutable class instances.

### Debugging notes

- If `state/run.json` is sometimes truncated, confirm that writes go to a temp file first.
- If `--status` cannot parse the file, print the JSON parse error and path.
- If `running` tasks survive process restart unchanged, add a startup reconciliation pass.

### Checkpoint

Persisted state distinguishes completed, failed, queued, running, interrupted, timed-out, canceled, and blocked tasks.

### Reflection

Explain why persistence changes error handling in a local runtime.

## Phase 12: Add Graceful Shutdown

### Goal

Handle `SIGINT` and `SIGTERM` without losing task state.

### Why this matters

A shutdown path is a protocol between the operating system signal, the scheduler, running attempts, queued tasks, persistence, and final reports. The runtime needs to stop accepting new work, decide what to do with active work, and write honest state before exiting.

### Build

- [ ] **Step 1: Install signal handlers**

  **Task**: Add listeners for `SIGINT` and `SIGTERM`.

  **Runtime note**: Signals enter through the process object and need to transition the scheduler into shutdown.

  **Hint**: Register handlers in the CLI or runtime startup code before tasks begin.

  **Checkpoint**: Pressing `Ctrl+C` reaches your shutdown handler.

- [ ] **Step 2: Add shutdown mode**

  **Task**: Parse `--shutdown <drain|cancel>` with default `cancel`.

  **Runtime note**: Drain waits for running work. Cancel aborts running work. Both stop new queued work.

  **Hint**: Validate the flag before the run starts.

  **Checkpoint**: Invalid shutdown modes fail clearly.

- [ ] **Step 3: Start first-signal shutdown**

  **Task**: On the first signal, record `run.shutdownStartedAt` and stop starting new work.

  **Runtime note**: First-signal behavior should be idempotent. A second call should not start a second shutdown sequence.

  **Hint**: Use a `shuttingDown` flag.

  **Checkpoint**: Multiple first-signal code paths produce one shutdown sequence.

- [ ] **Step 4: Apply drain or cancel behavior**

  **Task**: In `drain` mode, wait for running tasks. In `cancel` mode, abort running attempts. Mark queued tasks as `canceled`.

  **Runtime note**: Shutdown policy controls what happens to active work, while queued work always needs an explicit terminal state.

  **Hint**: Reuse the cancellation path from Phase 7 for `cancel`.

  **Checkpoint**: Reports show which policy was used and how every task ended.

- [ ] **Step 5: Write shutdown state and report**

  **Task**: Save `state/run.json` and write `reports/shutdown.json`.

  **Runtime note**: Shutdown output is the evidence that no task disappeared.

  **Hint**: Include signal name, shutdown mode, timestamps, and final status counts.

  **Checkpoint**: After `Ctrl+C`, `reports/shutdown.json` exists.

- [ ] **Step 6: Handle a second signal**

  **Task**: On a second signal, write one best-effort state snapshot and choose a forced non-zero exit code.

  **Runtime note**: A second signal means the user wants the process to stop faster than the normal graceful path.

  **Hint**: Keep this path short. Avoid starting more async work than needed.

  **Checkpoint**: Pressing `Ctrl+C` twice exits faster and still leaves state evidence when possible.

- [ ] **Step 7: Test shutdown decisions**

  **Task**: Add tests for the shutdown decision function without sending real process signals.

  **Runtime note**: Signal delivery is awkward in tests. The policy function is easier to verify directly.

  **Hint**: Feed fake scheduler state into the policy function and assert state transitions.

  **Checkpoint**: Tests cover drain mode, cancel mode, queued task handling, and second-signal behavior.

### Run

```sh
npm run tasks -- tasks/cancel-after.json --concurrency 2 --shutdown cancel
```

Press `Ctrl+C` while tasks are running.

### Expected behavior

The runtime writes shutdown state and a shutdown report. Every task has an explicit final or incomplete state.

### Hints

Signal handlers should start async shutdown once and let scheduler state drive the rest.

### Debugging notes

- If `Ctrl+C` exits immediately, a signal handler may be missing or throwing.
- If shutdown hangs forever, running tasks may ignore abort signals or lack a kill grace period.
- If reports claim success after cancellation, compute run status from terminal task statuses.

### Checkpoint

`reports/shutdown.json` exists after signal shutdown, and every task has an explicit final or incomplete state.

### Reflection

Explain why graceful shutdown is a protocol.

## Phase 13: Add Benchmark And Final Report

### Goal

Compare concurrency, timeout, retry, and combinator settings with a benchmark report.

### Why this matters

Async choices should be measured. Concurrency changes throughput and queue time. Timeouts change failure classification. Retries can increase success rate while adding latency and load. Combinator modes change how much work the runtime starts before it decides the run outcome.

### Build

- [ ] **Step 1: Create the benchmark entry**

  **Task**: Create `src/bench.js` and make `npm run bench` execute it.

  **Runtime note**: Benchmark code should call the same runtime path as the CLI. Separate benchmark logic can hide scheduler bugs.

  **Hint**: Import the orchestrator directly instead of spawning your CLI for every scenario.

  **Checkpoint**: `npm run bench` starts and prints scenario names.

- [ ] **Step 2: Create deterministic benchmark tasks**

  **Task**: Generate benchmark task sets under `tasks/bench/` or in memory.

  **Runtime note**: Deterministic task duration and failure patterns make scenario comparison meaningful.

  **Hint**: Use small delay tasks, timed-out tasks, and flaky tasks with fixed attempt behavior.

  **Checkpoint**: Repeated benchmark runs use the same task mix.

- [ ] **Step 3: Run concurrency scenarios**

  **Task**: Compare concurrency `1`, `5`, and `20`.

  **Runtime note**: Higher concurrency can improve throughput while changing queue time and process overhead.

  **Hint**: Keep scenario size small enough to finish quickly on a laptop.

  **Checkpoint**: Each concurrency scenario records duration, throughput, queue time, and max active count.

- [ ] **Step 4: Run timeout and retry scenarios**

  **Task**: Compare no timeout versus short timeout, and retry disabled versus retry enabled.

  **Runtime note**: Timeouts and retries change both outcome counts and elapsed time.

  **Hint**: Keep retry fixtures deterministic so success rate is explainable.

  **Checkpoint**: The results include `timedOutCount` and `retryCount`.

- [ ] **Step 5: Run mode scenarios**

  **Task**: Compare `all`, `allSettled`, `race`, and `any`.

  **Runtime note**: Mode controls how much work the runtime starts before the aggregate outcome is decided.

  **Hint**: Reuse `tasks/mixed-results.json` or generate an equivalent benchmark set.

  **Checkpoint**: Each mode result includes `stoppedReason` and final status counts.

- [ ] **Step 6: Write machine-readable results**

  **Task**: Write `reports/bench.json`.

  **Runtime note**: JSON results let another tool inspect exact scenario values.

  **Hint**: Include `durationMs`, `throughputPerSecond`, `successCount`, `failedCount`, `timedOutCount`, `canceledCount`, `retryCount`, `queueMsAvg`, `queueMsP95`, and `maxActive`.

  **Checkpoint**: `reports/bench.json` contains one object per scenario.

- [ ] **Step 7: Write the final Markdown report**

  **Task**: Write `reports/task-runtime.md` from the same scenario result objects.

  **Runtime note**: The Markdown report is the human-facing explanation of measured async behavior.

  **Hint**: Include command, Node version, platform, CPU count, benchmark task mix, and a short interpretation for each scenario group.

  **Checkpoint**: `reports/task-runtime.md` exists and agrees with `reports/bench.json`.

### Run

```sh
npm run bench
```

### Expected behavior

`reports/task-runtime.md` exists. It compares throughput, failure handling, queue time, retry behavior, timeout behavior, and max concurrency.

### Hints

Generate JSON and Markdown from the same scenario result objects.

### Debugging notes

- If benchmark results vary too much, remove random failures and use deterministic flaky tasks.
- If concurrency `20` is slower than `5`, inspect queue time and child process overhead before treating it as a bug.
- If `reports/task-runtime.md` disagrees with `reports/bench.json`, check report generation inputs.

### Checkpoint

`npm run bench` writes `reports/bench.json` and `reports/task-runtime.md` with throughput, failure handling, queue time, retry, timeout, mode, and max concurrency data.

### Reflection

Write the async control-flow rule this lab taught you.
