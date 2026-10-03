# Stream Processing Workbench

Build a local CLI workbench for testing the stream behavior covered in the runtime chapters. The finished project generates predictable NDJSON, runs whole-file and streaming processors, records memory and timing, simulates slow consumers, compresses output, cancels running pipelines, and writes comparison reports.

Each phase is a guided implementation lesson. Open one step, build the named boundary, verify the evidence, then mark that step complete.

## Phase 0: Create The Project

### Goal

Create the workbench project shell with ESM enabled, Node v24+ declared, and a CLI entry that prints help.

### Why this matters

The workbench needs controlled paths because later phases compare memory, pressure, and output correctness across several processors. A fixed project shape keeps the experiment readable when the generated data, processed outputs, and reports start piling up.

By the end of this phase, the project should print a helpful CLI overview and reject invalid command-line flags clearly.

### Build

- [ ] **Step 1: Create the project manifest**

  **Task**: Create `package.json`. Configure `"type": "module"` and declare Node v24 or newer under `engines.node`.

  **Mechanic**: Node reads package metadata before loading project files. `"type": "module"` tells Node to treat `.js` files as ES modules inside this package boundary. The engine field records the runtime contract for the lab.

  **Hint**: Look for the two metadata entries that answer: which module format should Node use, and which Node version is this project designed for?

  **Checkpoint**: Opening `package.json` shows ESM mode and a Node v24+ engine requirement.

- [ ] **Step 2: Create the main project folders**

  **Task**: Create `src/`, `data/`, `out/`, and `reports/`.

  **Mechanic**: This lab creates source files, generated input, processed output, and measurements. Keeping those artifacts separated makes later comparisons easier to inspect.

  **Hint**: Give each directory one job: `src/` for code, `data/` for generated input, `out/` for processed output, and `reports/` for evidence.

  **Checkpoint**: You can explain what belongs in each folder from memory.

- [ ] **Step 3: Create the overview CLI file**

  **Task**: Create `src/workbench.js`. Make it print a short overview of available commands, default paths, and common flags.

  **Mechanic**: The overview command is the front door for the workbench. It proves Node can load the project before stream processing code exists.

  **Hint**: Imagine opening the project after a week away. The overview should remind you how the workbench is organized.

  **Checkpoint**: Running the overview command prints a useful summary, exits successfully, and leaves `data/`, `out/`, and `reports/` unchanged.

- [ ] **Step 4: Add npm scripts for the lab commands**

  **Task**: Add scripts named `workbench`, `generate`, `naive`, `stream`, `split-check`, `pressure`, and `compare`.

  **Mechanic**: The scripts are the command surface for the tool. Each name maps to a capability the lab will build: generation, whole-file processing, stream processing, chunk checking, pressure testing, and comparison.

  **Hint**: Some script targets can point at files that are still empty or absent. The shape matters first.

  **Checkpoint**: `npm pkg get scripts` shows every command name the rest of the lab will use.

- [ ] **Step 5: Make `--help` succeed**

  **Task**: Update `src/workbench.js` so `--help` prints the same useful guidance as the default command and exits with code `0`.

  **Mechanic**: Exit codes are part of the CLI contract. Code `0` means the command completed successfully, and help output is a successful result.

  **Hint**: Treat `--help` as a normal success path through the program.

  **Checkpoint**: `npm run workbench -- --help` prints help text and exits with success.

- [ ] **Step 6: Reject unknown flags**

  **Task**: Make `src/workbench.js` fail clearly when it receives an unknown flag.

  **Mechanic**: Developer tools need strict flag handling. A misspelled option should produce a failure state because the user likely intended a different experiment.

  **Hint**: Print invalid-flag diagnostics to stderr. Keep regular help output on stdout.

  **Checkpoint**: A valid help flag succeeds. An unknown flag exits with a failure code and prints the invalid flag name.

- [ ] **Step 7: Keep the argument parser tiny**

  **Task**: Parse `process.argv.slice(2)` directly for this first command.

  **Mechanic**: Node exposes command-line arguments through `process.argv`. A small parser keeps the process boundary visible before later phases add more commands.

  **Hint**: Ask two questions for each argument: is this flag allowed, and what should happen when it appears?

  **Checkpoint**: The parser is small enough to read in one sitting and explain branch by branch.

### Run

```sh
npm run workbench -- --help
```

### Expected behavior

The command prints help text that names every npm script and these default paths:

- `data/access.ndjson`
- `out/stream.ndjson`
- `reports/*.json`

The command only prints help text.

### Hints

Use the step hints in the implementation plan first. If path handling feels awkward, resolve CLI paths from `process.cwd()` so commands behave from the directory where the user runs them.

### Debugging notes

- If `import` fails, check `"type": "module"` in `package.json`.
- If `npm run workbench -- --help` drops the flag, check the `--` separator. Flags after it reach your script.
- If Node runs the wrong file, inspect the script value with `npm pkg get scripts`.

### Checkpoint

The project supports ESM, declares Node v24+, and `npm run workbench -- --help` prints useful help with exit code `0`.

### Reflection

Why start with project structure and CLI behavior before stream code? Good runtime experiments need predictable commands, predictable paths, and predictable failure behavior.

## Phase 1: Generate Large NDJSON Data

### Goal

Generate `data/access.ndjson` with configurable row count, payload size, error ratio, and deterministic contents.

### Why this matters

Backpressure and memory differences become visible when the input is large enough. A tiny file finishes before queues, buffers, and retained objects matter.

Predictability matters too. Stable status-code distribution lets the comparison report attribute changed counts to code or configuration changes.

### Build

- [ ] **Step 1: Create the generator entrypoint**

  **Task**: Create `src/generate.js` and connect it to the `generate` npm script.

  **Mechanic**: The generator creates the controlled workload for the rest of the lab. Every benchmark, stream run, and comparison depends on this file.

  **Hint**: Start with a command that writes one valid NDJSON line, then grow it into a loop.

  **Checkpoint**: `npm run generate` executes `src/generate.js`.

- [ ] **Step 2: Add generator flags**

  **Task**: Support `--rows`, `--payload-bytes`, `--error-ratio`, `--seed`, and `--output`.

  **Mechanic**: Tunable input size lets you create small fixtures for debugging and large files for pressure tests.

  **Hint**: Defaults such as `250000` rows, `128` payload bytes, `0.08` error ratio, seed `42`, and `data/access.ndjson` are enough.

  **Checkpoint**: Running with `--rows 1000 --payload-bytes 32` changes the generated file size.

- [ ] **Step 3: Generate deterministic rows**

  **Task**: Emit rows with `id`, `ts`, `method`, `path`, `status`, `ip`, `userAgent`, and `payload`.

  **Mechanic**: The filter and plugin phases need stable fields. Deterministic values keep counts reproducible across runs.

  **Hint**: Use fixed arrays for methods and paths. Pick indexes with a small seeded PRNG.

  **Checkpoint**: Two runs with the same settings and seed produce the same first several lines.

- [ ] **Step 4: Write NDJSON incrementally**

  **Task**: Write each row as `JSON.stringify(row) + "\n"` through a `WriteStream`.

  **Mechanic**: The generator itself should avoid building one giant string. It should participate in writable backpressure from the start.

  **Hint**: When `write()` returns `false`, wait for one `drain` event before writing the next row.

  **Checkpoint**: Large generation runs complete while retaining only the current row and stream buffers.

- [ ] **Step 5: Report line count and file size**

  **Task**: After the stream finishes, print the number of rows and the file size.

  **Mechanic**: Later phases need a known expected row count and byte count before they process the file.

  **Hint**: Use `stat()` after the writer emits `finish`.

  **Checkpoint**: Terminal output includes the requested row count and the byte size of `data/access.ndjson`.

- [ ] **Step 6: Write `reports/generator.json`**

  **Task**: Save generator settings and output stats under `reports/generator.json`.

  **Mechanic**: The report makes the generated input auditable. Comparison runs can cite the exact settings that produced the file.

  **Hint**: Store raw numbers in JSON. Format human-readable sizes only in console output.

  **Checkpoint**: `reports/generator.json` includes `rows`, `payloadBytes`, `errorRatio`, `seed`, `outputFile`, and `bytesWritten`.

### Run

```sh
npm run generate
```

Run a smaller file while testing:

```sh
npm run generate -- --rows 1000 --payload-bytes 32
```

### Expected behavior

`data/access.ndjson` exists. The file contains exactly the requested number of lines. The command prints the line count and byte size. `reports/generator.json` records the generator settings used for the run.

### Hints

Use the step hints first. For a quick sanity check, run `wc -l data/access.ndjson` after generation and compare it with the report.

### Debugging notes

- If the final line count is short, check whether you waited for `finish` after calling `end()`.
- If memory spikes during generation, look for an array collecting all rows.
- If the file changes wildly between runs with the same seed, inspect every call site that uses randomness.

### Checkpoint

The generator creates `data/access.ndjson`, reports line count and file size, and records settings under `reports/generator.json`.

### Reflection

Record the generator settings you used for your main benchmark file. Include rows, payload bytes, error ratio, seed, and output byte size.

## Phase 2: Build The Naive Baseline

### Goal

Process the whole NDJSON file with `readFile()`, filter error rows, write filtered output, and report the memory-heavy baseline.

### Why this matters

The naive path gives the comparison point for every later stream path. It reads the whole file into memory, splits it into strings, parses rows into objects, retains matching objects, serializes output, and writes the result.

Preserve the whole-file shape in this phase so later reports have a concrete comparison point.

### Build

- [ ] **Step 1: Create the naive processor**

  **Task**: Create `src/naive.js` and wire it to `npm run naive`.

  **Mechanic**: The naive command gives one intentional whole-file implementation to compare against the stream implementation.

  **Hint**: Read from `data/access.ndjson` and write to `out/errors-naive.ndjson` by default.

  **Checkpoint**: `npm run naive` starts the naive processor entrypoint.

- [ ] **Step 2: Add input, output, and filter flags**

  **Task**: Support `--input`, `--output`, and `--where`. Default the filter to `status >= 500`.

  **Mechanic**: Matching flags between naive and stream commands make later comparisons fair.

  **Hint**: Parse `--where` as a string for now. Full DSL parsing arrives in Phase 6.

  **Checkpoint**: Passing `--output out/custom.ndjson` changes the output path.

- [ ] **Step 3: Read and split the full file**

  **Task**: Use `readFile()` to load the entire input, decode it, and split it into lines.

  **Mechanic**: This path intentionally retains the whole input buffer and decoded text. That retained data is the memory baseline.

  **Hint**: Ignore one final empty line caused by the last `\n`.

  **Checkpoint**: The processor counts the same number of rows as the generator report.

- [ ] **Step 4: Parse, filter, and retain matches**

  **Task**: Parse each non-empty line as JSON, filter rows where `status >= 500`, and keep the matching row objects.

  **Mechanic**: Retaining matches is part of the naive shape. The stream path will avoid this later.

  **Hint**: Include the line number when `JSON.parse()` fails.

  **Checkpoint**: The match count is stable for the same generated input.

- [ ] **Step 5: Write filtered NDJSON**

  **Task**: Serialize matching rows back to NDJSON and write `out/errors-naive.ndjson`.

  **Mechanic**: The output format must match the stream output format so byte and hash comparisons work later.

  **Hint**: Write one JSON object per line, with a trailing newline.

  **Checkpoint**: Every output row has `status >= 500`.

- [ ] **Step 6: Write the naive report**

  **Task**: Create `reports/naive.json` with rows, matches, elapsed time, and peak memory fields.

  **Mechanic**: This first report gives the shape that Phase 3 will standardize across modes.

  **Hint**: A simple before-and-after memory sample is enough in this phase.

  **Checkpoint**: `reports/naive.json` includes `rows`, `matches`, `elapsedMs`, and `peakMemory`.

### Run

```sh
npm run naive
```

### Expected behavior

`out/errors-naive.ndjson` contains only rows whose status code is at least `500`. `reports/naive.json` includes rows read, matches written, elapsed time, and peak memory fields.

### Hints

Use `Buffer.byteLength(outputString)` to report bytes written before the shared measurement utilities exist.

### Debugging notes

- If matches are zero, print the first few status codes to stderr and verify the generator distribution.
- If output has commas or array brackets, the output is JSON array data rather than NDJSON.
- If parsing fails on an empty last line, handle only the trailing empty line caused by final newline.

### Checkpoint

`reports/naive.json` includes `rows`, `matches`, `elapsedMs`, and `peakMemory`. The filtered output is valid NDJSON.

### Reflection

List every large value the naive path retains at once: the input buffer, decoded text, line array, parsed row objects, match list, and serialized output.

## Phase 3: Add Measurement Utilities

### Goal

Create shared timing, memory, and byte-count measurement so later reports can be compared.

### Why this matters

Elapsed time alone misses the part streams are usually meant to control. A slower stream path can still be the right path if it keeps RSS, heap, external memory, and buffered bytes under control for large inputs.

The report shape has to stabilize now. Later phases should add fields while preserving the meaning of existing ones.

### Build

- [ ] **Step 1: Create the measurement module**

  **Task**: Create `src/measure.js`.

  **Mechanic**: Shared measurement keeps every mode using the same clock, memory fields, byte counters, and report shape.

  **Hint**: Export small helpers instead of one giant class.

  **Checkpoint**: `src/naive.js` can import at least one helper from `src/measure.js`.

- [ ] **Step 2: Add timing helpers**

  **Task**: Record `startedAt`, `endedAt`, and `elapsedMs`.

  **Mechanic**: Wall-clock timestamps explain when the run happened. A monotonic elapsed clock measures duration across wall-clock changes.

  **Hint**: Use `performance.now()` for elapsed time and `Date` for report timestamps.

  **Checkpoint**: The naive report has a `timing` object with all three fields.

- [ ] **Step 3: Add memory sampling**

  **Task**: Sample `process.memoryUsage()` on an interval and track current and peak values.

  **Mechanic**: RSS, heap, external memory, and array buffer memory move independently. Stream experiments need all of them visible.

  **Hint**: Start with a `100` ms interval. Stop it in `finally`.

  **Checkpoint**: The report includes current and peak `rss`, `heapUsed`, `heapTotal`, `external`, and `arrayBuffers`.

- [ ] **Step 4: Add byte counters**

  **Task**: Track bytes read, bytes written, and any mode-specific byte counts.

  **Mechanic**: Rows explain logical work. Bytes explain I/O pressure and compression behavior.

  **Hint**: Store raw byte counts in JSON. Avoid preformatted strings in reports.

  **Checkpoint**: The naive report records input bytes and output bytes.

- [ ] **Step 5: Standardize report writing**

  **Task**: Add a helper that writes pretty JSON reports with a stable top-level shape.

  **Mechanic**: Later comparison code should read reports while staying mode-agnostic.

  **Hint**: Use top-level groups such as `mode`, `status`, `input`, `output`, `counts`, `timing`, and `memory`.

  **Checkpoint**: `reports/naive.json` uses the shared report shape.

- [ ] **Step 6: Move the naive command onto the shared utilities**

  **Task**: Update `src/naive.js` to use the new timer, sampler, counters, and report writer.

  **Mechanic**: Migrating the baseline first tests the shared utilities before the stream processor depends on them.

  **Hint**: Keep the naive processing behavior the same. Only measurement and report construction should move.

  **Checkpoint**: The match count stays the same as Phase 2, and the report shape changes to the shared structure.

### Run

```sh
npm run naive
```

### Expected behavior

`reports/naive.json` keeps the counts from Phase 2 and now has the shared shape. It includes RSS, heap, external memory, elapsed time, and bytes processed.

### Hints

Put measurement cleanup in `finally`. Failed runs still need reports or diagnostics.

### Debugging notes

- If peak memory is lower than final memory, confirm the sampler updates peak values before shutdown.
- If the Node process exits before the report writes, make the main function await report writing and catch errors at the top level.
- If JSON reports differ in shape between modes, move common object creation back into `src/measure.js`.

### Checkpoint

Every report from this point onward includes RSS, heap, external memory, elapsed time, and bytes processed in the same field locations.

### Reflection

Explain why a processor that is fast but retains the entire input can be worse than a slower processor with bounded memory.

## Phase 4: Build Source Adapters

### Goal

Create compatible readable sources for regular files, stdin, and gzipped input.

### Why this matters

A useful stream tool should accept bytes from more than one place. File input is easy to benchmark. Stdin lets the workbench participate in shell pipelines. Gzipped input adds a transform before parsing, which changes chunk boundaries and byte counts.

The rest of the processor should receive a Readable stream and source metadata from every source mode.

### Build

- [ ] **Step 1: Create the stream command boundary**

  **Task**: Create `src/stream.js`. Parse `--source`, `--input`, and `--read-hwm`, call the source adapter once it exists, drain the returned stream, and write `reports/stream.json`.

  **Mechanic**: The `stream` npm script needs a real entrypoint before source modes can be tested. In this phase the command drains bytes and records source evidence. Row parsing starts after the splitter exists.

  **Hint**: Import `pipeline` from `node:stream/promises` and pass the source plus a small discard Writable to it.

  **Checkpoint**: The `stream` npm script points at an existing file, accepts the three source flags, and rejects malformed flags clearly.

- [ ] **Step 2: Create the source adapter module**

  **Task**: Create `src/sources.js` and export `createSource(options)`.

  **Mechanic**: Source adapters isolate where bytes come from. Downstream parser and filter stages can process a common readable stream.

  **Hint**: Return `{ stream, meta }` first. Add counters after the basic source works.

  **Checkpoint**: `src/stream.js` can create a file source through the adapter.

- [ ] **Step 3: Implement file input**

  **Task**: Add `file` mode with `createReadStream(inputPath, { highWaterMark })`.

  **Mechanic**: File streams expose chunked input and let you tune `highWaterMark` for experiments.

  **Hint**: Support `--read-hwm <bytes>` and pass it only when the user sets it.

  **Checkpoint**: `npm run stream -- --source file --input data/access.ndjson` drains the generated file and records its byte count.

- [ ] **Step 4: Implement stdin input**

  **Task**: Add `stdin` mode using `process.stdin`.

  **Mechanic**: Stdin lets another process supply bytes through the inherited descriptor.

  **Hint**: Keep stdin in Buffer mode. Put diagnostics on stderr so stdout can remain data-only later.

  **Checkpoint**: `cat data/access.ndjson | npm run stream -- --source stdin` drains stdin and records the same uncompressed byte count as file mode.

- [ ] **Step 5: Implement gzip input**

  **Task**: Add `gzip` mode that reads a file and passes it through `createGunzip()`.

  **Mechanic**: Gunzip is a transform stage before line parsing. It changes chunk boundaries and byte accounting.

  **Hint**: Report compressed bytes from `stat()` and uncompressed bytes after gunzip.

  **Checkpoint**: A gzipped input file can be decompressed into the same uncompressed byte stream as a raw file.

- [ ] **Step 6: Add source metadata**

  **Task**: Return `kind`, `inputPath`, `compressed`, `declaredBytes`, and counted `bytesRead` where available.

  **Mechanic**: The report needs to say which source mode produced the bytes and how many bytes crossed the source boundary.

  **Hint**: A counting Transform directly after the source is a clean place to increment `bytesRead`.

  **Checkpoint**: `reports/stream.json` records source kind and byte counts.

- [ ] **Step 7: Keep source branching inside the adapter**

  **Task**: Make downstream stages consume the adapter output the same way for file, stdin, and gzip.

  **Mechanic**: Source abstraction keeps parsing and filtering focused on row data instead of file descriptors or compression.

  **Hint**: If a later stage checks `source === "stdin"`, move that branch back into `src/sources.js`.

  **Checkpoint**: The parser and filter code receive a readable stream and shared metadata for every source mode.

### Run

```sh
cat data/access.ndjson | npm run stream -- --source stdin
```

For a file source:

```sh
npm run stream -- --source file --input data/access.ndjson
```

### Expected behavior

The stream command drains both file and stdin sources. Byte counts match for the same uncompressed input. Reports record the source kind.

### Hints

Count bytes at the source boundary before decoding text. That keeps file and stdin counts comparable.

### Debugging notes

- If stdin appears to hang, make sure the shell command is piping data.
- If byte counts differ between file and stdin, check whether you count bytes before or after decoding strings.
- If gzip mode throws `Z_DATA_ERROR`, confirm the input file is actually gzipped.

### Checkpoint

`file`, `stdin`, and `gzip` source adapters produce compatible readable streams. The same uncompressed input produces the same byte count after the source boundary.

### Reflection

Explain why the parser and filter stages should receive a common readable stream instead of branching on file, stdin, or gzip.

## Phase 5: Build A Line Splitter Transform

### Goal

Split arbitrary byte chunks into complete NDJSON lines while carrying partial lines between chunks.

### Why this matters

Stream chunks arrive independently of record boundaries. One chunk can contain half a line, one line, or many lines. NDJSON parsing has to wait until a full line is available before calling `JSON.parse()`.

The splitter is the first stateful transform in the workbench. It owns only the unfinished tail of the current line. Complete lines move downstream immediately.

### Build

- [ ] **Step 1: Create the splitter module**

  **Task**: Create `src/line-splitter.js`.

  **Mechanic**: The splitter converts arbitrary byte chunks into complete record strings for the parser.

  **Hint**: A Transform stream or async generator both work. Pick the form that fits your existing pipeline style.

  **Checkpoint**: The module exports one splitter factory or generator function.

- [ ] **Step 2: Decode chunks safely**

  **Task**: Convert incoming Buffers into text while preserving UTF-8 characters split across chunks.

  **Mechanic**: A multibyte character can span two Buffer chunks. Per-chunk `toString()` can corrupt that boundary.

  **Hint**: Use `StringDecoder` if the splitter owns decoding.

  **Checkpoint**: Non-ASCII payloads survive tiny chunk sizes.

- [ ] **Step 3: Carry partial lines**

  **Task**: Keep the final segment after the last newline as carry state.

  **Mechanic**: The carry buffer stores an incomplete NDJSON record until later bytes complete it.

  **Hint**: Append decoded text to carry, split on `\n`, emit every segment except the final one, and keep that final segment as the next carry.

  **Checkpoint**: A row split across chunks is emitted once, as one complete line.

- [ ] **Step 4: Flush the final carry**

  **Task**: On source end, emit the carry buffer if it contains text.

  **Mechanic**: Files sometimes end immediately after the final record. The final record is still valid NDJSON if the line text is complete.

  **Hint**: Empty carry after a final newline should produce no extra row.

  **Checkpoint**: The line count matches files with a trailing newline and files ending after the final record.

- [ ] **Step 5: Normalize Windows line endings**

  **Task**: Strip one trailing `\r` from each emitted line.

  **Mechanic**: Files with `\r\n` line endings should parse as the same JSON text as files with `\n`.

  **Hint**: Strip `\r` after splitting on `\n`, before JSON parsing.

  **Checkpoint**: A CRLF fixture parses cleanly; `JSON.parse()` receives text ending at the closing brace.

- [ ] **Step 6: Create the split checker**

  **Task**: Create `src/split-check.js` and make it read with a tiny `highWaterMark`, such as `7`.

  **Mechanic**: Tiny chunks force the carry logic to run. Large chunks can hide splitter bugs.

  **Hint**: Count emitted lines and compare that count with the generator report or a direct line-count check.

  **Checkpoint**: `reports/split-check.json` records expected lines, seen lines, `readHwm`, and pass/fail status.

- [ ] **Step 7: Use the splitter in the stream command**

  **Task**: Replace the Phase 4 byte-drain path in `src/stream.js` with source, splitter, and line-count stages.

  **Mechanic**: Row counts belong after the source has been split into complete NDJSON records. The source boundary still counts bytes; the splitter now counts logical rows.

  **Hint**: Keep file, stdin, and gzip branching inside `src/sources.js`. The stream command should receive one readable byte stream, then pass it through the splitter.

  **Checkpoint**: File and stdin runs against `data/access.ndjson` report the same byte count and row count.

### Run

```sh
npm run split-check
```

Run with a smaller read buffer:

```sh
npm run split-check -- --read-hwm 7
```

Verify source modes through the stream command:

```sh
npm run stream -- --source file --input data/access.ndjson
```

```sh
cat data/access.ndjson | npm run stream -- --source stdin
```

### Expected behavior

The seen line count equals the generated line count. The check passes even when chunks are smaller than most rows. File and stdin runs report matching row counts for the same uncompressed input.

### Hints

Log carry length instead of full carry contents when debugging large files.

### Debugging notes

- If the count is one too high, inspect whether the final newline became an empty emitted line.
- If JSON parsing fails later with truncated rows, print the last few characters of carry before and after each split.
- If non-ASCII payloads break, switch to `StringDecoder` instead of `chunk.toString()` per chunk.

### Checkpoint

The splitter works with tiny `highWaterMark` values and emits exactly one item per NDJSON record.

### Reflection

Explain what the carry buffer stores and why it must be flushed only after the upstream source ends.

## Phase 6: Build A Filter DSL

### Goal

Add a simple query syntax for filtering parsed rows.

### Why this matters

The workbench should behave as a small log processor with configurable predicates. A filter DSL also forces the stream path and naive path to share predicate logic, which makes output comparisons meaningful.

Filtering belongs early in the pipeline. Rows rejected by the predicate should skip later transforms, stringification, compression, and slow writes.

### Build

- [ ] **Step 1: Create the filter module**

  **Task**: Create `src/filter.js`.

  **Mechanic**: Shared predicate compilation keeps naive and stream modes using the same row-selection logic.

  **Hint**: Export `parseFilter()` and `compileFilter()` separately if that makes testing easier.

  **Checkpoint**: Both `src/naive.js` and `src/stream.js` can import the same filter compiler.

- [ ] **Step 2: Parse one-clause expressions**

  **Task**: Support `status >= 500`, `method = GET`, `path contains api`, `status < 400`, and `method != POST`.

  **Mechanic**: The DSL turns a shell string into a small internal representation: `field`, `operator`, `value`, and `valueType`.

  **Hint**: A small regular expression is enough for one-clause filters.

  **Checkpoint**: Invalid operators, empty fields, and unknown fields produce clear errors.

- [ ] **Step 3: Compile predicates**

  **Task**: Convert the parsed filter into a function that receives one row and returns `true` or `false`.

  **Mechanic**: Compiling once keeps the hot row loop from reparsing the query for every row.

  **Hint**: Convert numeric query values when the selected row field is numeric.

  **Checkpoint**: `compileFilter("status >= 500")({ status: 503 })` returns `true`.

- [ ] **Step 4: Add a JSON row parser stage**

  **Task**: Convert line strings into row objects and count parse errors with line numbers.

  **Mechanic**: The stream path moves from byte chunks to lines to objects. Filtering should operate on objects.

  **Hint**: Keep the current line number inside the parser stage.

  **Checkpoint**: A malformed line reports its line number and fails the run clearly.

- [ ] **Step 5: Add the stream filter stage**

  **Task**: Filter parsed rows, count rows seen, and count rows matched.

  **Mechanic**: Rows that fail the predicate should leave the pipeline before expensive transforms and writes.

  **Hint**: Emit only matching row objects from this stage.

  **Checkpoint**: `npm run stream -- --where "status >= 500"` writes only matching rows.

- [ ] **Step 6: Move naive mode onto the shared filter**

  **Task**: Update `src/naive.js` to use the same compiled predicate.

  **Mechanic**: Matching output between modes depends on shared predicate behavior.

  **Hint**: Keep the default query identical for both commands.

  **Checkpoint**: Naive and stream match counts are identical for the same input and query.

### Run

```sh
npm run stream -- --where "status >= 500"
```

Compare with the naive path:

```sh
npm run naive -- --where "status >= 500"
```

### Expected behavior

The stream output contains only matching rows. The filtered count matches the naive implementation for the same input and query.

### Hints

Quote the filter expression in the shell. Without quotes, the shell splits it into separate arguments.

### Debugging notes

- If `method = GET` returns zero rows, check whether `GET` stayed a string value.
- If stream and naive counts differ, write a temporary hash of output rows for each mode and compare the first mismatched line number.
- If every query passes, inspect the operator dispatch table before the stream code.

### Checkpoint

Filtered count matches the naive implementation for the same input, output, and `--where` expression.

### Reflection

Explain why filtering before plugin transforms, stringification, compression, and slow sinks reduces both CPU work and memory pressure.

## Phase 7: Add Transform Plugins

### Goal

Support pluggable row transformations for redaction, field selection, and enrichment.

### Why this matters

Transform streams become concrete when they change data. The workbench now has rows flowing as objects, and plugins make that object stream visible: one plugin removes sensitive data, another narrows the output shape, and another adds derived fields.

Plugin order matters because each plugin receives the row produced by the previous plugin. A field selection plugin can remove data a later enrichment plugin expected. A redaction plugin must run before output leaves the process.

### Build

- [ ] **Step 1: Create the plugin module**

  **Task**: Create `src/plugins.js` or a `src/plugins/` directory.

  **Mechanic**: Plugins turn one row object into another row object while staying inside the stream pipeline.

  **Hint**: Start with plain functions. Add stream wrappers after the functions are easy to test.

  **Checkpoint**: The module can build an ordered list of plugin functions from CLI options.

- [ ] **Step 2: Add redaction**

  **Task**: Implement `--redact ip,userAgent` and replace listed fields with a fixed redacted value.

  **Mechanic**: Redaction must happen before data reaches the output stream.

  **Hint**: Leave absent fields alone. Record the requested fields in the report.

  **Checkpoint**: Output rows contain redacted `ip` values when `--redact ip` is set.

- [ ] **Step 3: Add field selection**

  **Task**: Implement `--select id,ts,method,path,status,ip`.

  **Mechanic**: Field selection creates a narrower output object and controls field order.

  **Hint**: Build the output object by iterating over the selection list.

  **Checkpoint**: Selected fields appear in the requested order.

- [ ] **Step 4: Add enrichment**

  **Task**: Implement `--enrich statusClass,payloadLength`.

  **Mechanic**: Enrichment adds derived fields while the row is still an object.

  **Hint**: `statusClass` can derive from `Math.floor(status / 100) + "xx"`.

  **Checkpoint**: Rows include requested enrichment fields before stringification.

- [ ] **Step 5: Define plugin order**

  **Task**: Pick a default order and encode it in one place. A practical order is filter, redact, enrich, select, stringify.

  **Mechanic**: Order affects correctness because each stage sees the row produced by earlier stages.

  **Hint**: Redact before final selection when selected output can include sensitive fields.

  **Checkpoint**: `reports/stream.json` records active plugins in execution order.

- [ ] **Step 6: Add a composition check**

  **Task**: Add a small fixture run or assertion path that verifies plugin output for a known row.

  **Mechanic**: Plugin order bugs can produce valid JSON with wrong fields. A tiny deterministic check catches that class of error.

  **Hint**: Test one row with `--redact ip --select id,status,ip,payloadLength --enrich payloadLength`.

  **Checkpoint**: The assertion proves redaction, enrichment, and selection run in the intended order.

### Run

```sh
npm run stream -- --where "status >= 500" --redact ip --select id,status,path,ip
```

### Expected behavior

The output rows include only selected fields, and `ip` is redacted before writing. `reports/stream.json` records the active plugins in execution order.

### Hints

Keep plugin configuration in the report. The same output file is hard to interpret later unless the report includes the plugin order that produced it.

### Debugging notes

- If selected fields appear in a different order every run, build the output object by iterating over the `--select` list.
- If redaction disappears, check whether field selection removed the sensitive field before redaction ran.
- If enrichment adds fields after selection, decide the intended order and encode that order in the report.

### Checkpoint

Plugins compose in a predictable order, and sensitive fields are changed before bytes reach the output stream.

### Reflection

Explain how transform order affects correctness for `--redact ip --select id,status,ip,payloadLength --enrich payloadLength`.

## Phase 8: Add A Slow Sink Simulator

### Goal

Create a Writable stream that intentionally writes slowly and records backpressure signals.

### Why this matters

Backpressure becomes visible when the consumer is slower than the producer. A slow sink gives the workbench a controlled destination that delays write completion and exposes queue growth, `write()` return values, and `drain` events.

The sink should be plain and measurable. It can discard bytes by default and save them only when a flag asks for output. Its job is to accept chunks slowly and report what happened.

### Build

- [ ] **Step 1: Create `SlowWritable`**

  **Task**: Create `src/slow-writable.js` and implement a custom Writable stream.

  **Mechanic**: A custom Writable controls when each write callback fires. Delaying that callback slows the sink and lets upstream pressure build.

  **Hint**: Extend `Writable` or pass a `write()` function to the constructor.

  **Checkpoint**: The class accepts chunks and emits `finish` on a small test input.

- [ ] **Step 2: Add sink options**

  **Task**: Support `delayMs`, `highWaterMark`, `writeOutputPath`, and `discard`.

  **Mechanic**: Delay controls sink speed. `highWaterMark` controls when `write()` starts returning `false`. Output mode controls whether bytes are saved or discarded.

  **Hint**: Default to discard mode for pressure-only runs.

  **Checkpoint**: A low `highWaterMark` and non-zero delay produce visible queue length.

- [ ] **Step 3: Record write metrics**

  **Task**: Count chunks, bytes, `drain` events, `writableLength` samples, `writableHighWaterMark`, and max buffered bytes.

  **Mechanic**: Writable pressure is observable through queue length and drain events.

  **Hint**: Attach a `drain` listener to the slow writable itself.

  **Checkpoint**: The sink exposes metrics after `finish`.

- [ ] **Step 4: Delay each write**

  **Task**: In `_write()`, count the chunk, update max buffer state, wait `delayMs`, then call the callback.

  **Mechanic**: The write callback is the gate that lets the Writable advance to the next queued chunk.

  **Hint**: `setTimeout(callback, delayMs)` is enough for the delay path.

  **Checkpoint**: Increasing `delayMs` increases elapsed time for the same input.

- [ ] **Step 5: Create the pressure command**

  **Task**: Create `src/pressure.js` and wire the existing source, splitter, parser, filter, plugins, stringifier, and slow sink.

  **Mechanic**: The pressure command runs the normal stream processor against a controlled slow destination.

  **Hint**: Add `--slow-write-ms`, `--write-hwm`, `--read-hwm`, and `--where`.

  **Checkpoint**: `npm run pressure` writes `reports/pressure.json`.

- [ ] **Step 6: Add pressure report fields**

  **Task**: Report `writableLength`, `drainCount`, max buffered bytes, chunks, bytes, and elapsed time.

  **Mechanic**: These fields prove that the sink produced pressure and that the pipeline responded.

  **Hint**: Store both final metrics and max values.

  **Checkpoint**: `reports/pressure.json` includes the slow sink metrics.

### Run

```sh
npm run pressure
```

Increase the delay:

```sh
npm run pressure -- --slow-write-ms 5
```

### Expected behavior

`reports/pressure.json` records slow sink metrics. Runs with a non-zero delay should show drain events or longer elapsed time, depending on highWaterMark and input size.

### Hints

Lower `--write-hwm` while testing. A smaller threshold makes the backpressure signal easier to trigger.

### Debugging notes

- If `drainCount` stays at zero, lower `--write-hwm`, increase input size, or increase `--slow-write-ms`.
- If the process exits early, verify the writable reaches `finish` before the report writes.
- If memory climbs while drain events stay at zero, inspect any array you use for samples. Keep samples bounded or sample at a fixed interval.

### Checkpoint

`reports/pressure.json` includes `writableLength`, `drainCount`, and max buffered bytes.

### Reflection

Explain what `write()` returning `false` tells the producer and what it does to the chunk that crossed the threshold.

## Phase 9: Add Backpressure Visualization

### Goal

Produce a timeline of readable pressure, writable pressure, throughput, drain events, and memory.

### Why this matters

A single max value loses the timing of pressure. The workbench needs a time series so you can see when the readable side has data queued, when the writable side falls behind, when drain events happen, and how memory follows those conditions.

JSON with stable samples is enough. The report can be plotted later.

### Build

- [ ] **Step 1: Add sample interval configuration**

  **Task**: Add `--sample-ms <n>` to `src/pressure.js`, with a default such as `100`.

  **Mechanic**: Sampling interval controls the resolution and overhead of the timeline.

  **Hint**: Start with a moderate interval. The sampler should observe the run instead of dominating it.

  **Checkpoint**: The pressure report records the chosen sample interval.

- [ ] **Step 2: Build the timeline sampler**

  **Task**: Use `setInterval()` to collect samples during the run.

  **Mechanic**: Timeline samples capture state at repeated points: elapsed time, memory, byte counters, row counters, and queue lengths.

  **Hint**: Always force one final sample during shutdown.

  **Checkpoint**: `reports/pressure.json` contains a non-empty `timeline` array.

- [ ] **Step 3: Sample memory and queues**

  **Task**: Record RSS, heap used, external memory, readable queue length where available, and writable queue length from the slow sink.

  **Mechanic**: Queue lengths show stream pressure. Memory samples show process-level cost around that pressure.

  **Hint**: Use `null` for a stage length when a stage has no useful exposed length.

  **Checkpoint**: Each timeline entry has stable keys even when some values are `null`.

- [ ] **Step 4: Sample throughput**

  **Task**: Record bytes read, bytes written, rows seen, rows matched, and throughput per sample window.

  **Mechanic**: Throughput shows how much work completed between samples.

  **Hint**: Compute bytes-per-second from the delta between the current sample and the previous sample.

  **Checkpoint**: Timeline entries show changing throughput during the run.

- [ ] **Step 5: Record drain events with timestamps**

  **Task**: Store every drain event with elapsed milliseconds.

  **Mechanic**: Drain events mark moments when the writable side tells producers they can resume.

  **Hint**: Record the timestamp inside the drain listener.

  **Checkpoint**: The report has both `drainEvents` and per-sample drain counts.

- [ ] **Step 6: Add summary fields**

  **Task**: Add max readable length, max writable length, max RSS, total drains, total bytes, and elapsed time under `summary`.

  **Mechanic**: The summary gives quick comparisons while the timeline keeps detail.

  **Hint**: Derive summary values from the same counters used for samples.

  **Checkpoint**: Increasing `--slow-write-ms` changes elapsed time, buffering, drains, or throughput.

### Run

```sh
npm run pressure -- --slow-write-ms 5
```

Compare a slower sink:

```sh
npm run pressure -- --slow-write-ms 20
```

### Expected behavior

`reports/pressure.json` shows a pressure timeline. Increasing sink delay increases total elapsed time, buffering, drain events, or some combination of those depending on highWaterMark values.

### Hints

Write timeline data as raw numbers. Any charting layer can format it later.

### Debugging notes

- If timeline is empty, confirm the run lasts longer than `--sample-ms` or force one sample at shutdown.
- If memory samples keep rising after completion, make sure the interval is cleared.
- If drain events lack timestamps, record them in the drain listener instead of deriving them later.

### Checkpoint

Increasing `--slow-write-ms` produces a measurable change in `reports/pressure.json`: longer elapsed time, higher max buffer length, more drain events, or lower throughput.

### Reflection

Explain why code that ignores backpressure can turn a temporary producer/consumer mismatch into process memory growth.

## Phase 10: Make Pipeline Lifecycle Explicit

### Goal

Record completion, failure, and cleanup details around the existing `stream/promises.pipeline()` boundary for the stream processor and pressure runner.

### Why this matters

The stream chain now has enough stages that run lifecycle needs to appear in reports. `pipeline()` already gives the run one completion path, one failure path, and coordinated stream teardown while preserving backpressure between stages.

Backpressure keeps the same stream mechanics here. The change is lifecycle ownership.

### Build

- [ ] **Step 1: Build stage factories**

  **Task**: Refactor stream and pressure commands so each run creates fresh source, transform, and destination stages.

  **Mechanic**: A failed stream instance belongs to the failed attempt. Fresh factories keep retry, compare, and abort paths clean.

  **Hint**: Use functions such as `createProcessingStages(options)` instead of module-level stream instances.

  **Checkpoint**: Two runs in one process create separate stream objects.

- [ ] **Step 2: Import promise-based pipeline**

  **Task**: Keep `pipeline` imported from `node:stream/promises` in both stream commands.

  **Mechanic**: The promise API maps stream completion and failure to `await`, `try`, and `catch`.

  **Hint**: Keep report finalization outside the pipeline call.

  **Checkpoint**: The command awaits one pipeline promise for the stream graph.

- [ ] **Step 3: Normalize the stream command stage list**

  **Task**: Build an ordered stage list and pass its streams to `await pipeline(...)`.

  **Mechanic**: Data still moves forward and backpressure still moves backward. `pipeline()` now owns completion, error propagation, and teardown.

  **Hint**: Use this order: source, byte counter, optional gunzip, line splitter, JSON parser, filter, plugins, stringifier, optional gzip, destination.

  **Checkpoint**: `npm run stream` writes the same output as the previous phase.

- [ ] **Step 4: Normalize the pressure command stage list**

  **Task**: Run the pressure stage list through `pipeline()` as well.

  **Mechanic**: The slow sink should participate in the same operation boundary as the normal destination.

  **Hint**: Preserve existing slow sink metrics while changing lifecycle wiring.

  **Checkpoint**: `npm run pressure -- --slow-write-ms 5` still records drain and buffer metrics.

- [ ] **Step 5: Add cleanup and status fields**

  **Task**: Record `pipelineStatus`, `completed`, `errorCode`, and any tracked stage-close information in reports.

  **Mechanic**: Reports should tell whether the operation completed, failed, or cleaned up after a pipeline error.

  **Hint**: Attach close listeners only for stages where that signal helps. Keep the report stable.

  **Checkpoint**: Successful runs record `completed: true`.

- [ ] **Step 6: Keep errors at one boundary**

  **Task**: Wrap the pipeline call with `try`, `catch`, and `finally`.

  **Mechanic**: The command should have one place where stream failure becomes a report and process exit state.

  **Hint**: The top-level `main().catch(...)` path should still catch unexpected programmer errors.

  **Checkpoint**: A missing input file produces one clear failure path and a report or diagnostic.

### Run

```sh
npm run stream
```

Run the pressure path too:

```sh
npm run pressure -- --slow-write-ms 5
```

### Expected behavior

Output matches the previous stream version. Reports show successful completion and cleanup state.

### Hints

Async generator stages should accept the `{ signal }` parameter now, even before abort support uses it.

### Debugging notes

- If errors become unhandled rejections, confirm the top-level `main()` call has a `.catch()` path.
- If the destination file is empty, inspect stage order. A Transform that emits objects must be followed by object-mode-compatible stages until stringification.
- If the pipeline hangs, check custom transforms for callbacks that never fire.

### Checkpoint

The stream and pressure commands run through `pipeline()`, write the expected output, and record successful completion and cleanup in their reports.

### Reflection

Name the lifecycle work that `pipeline()` owns besides moving chunks between stream stages.

## Phase 11: Add Abort And Partial Output Cleanup

### Goal

Cancel a running pipeline safely and prevent partial output files from being mistaken for successful output.

### Why this matters

Cancellation is a correctness feature. A user can stop a run, a service can time out a request, or a higher-level controller can abort stale work. The stream graph should stop, the report should say why, and incomplete files should be marked or removed.

`pipeline()` can tear down streams. The application still owns file-level consistency.

### Build

- [ ] **Step 1: Add abort flags**

  **Task**: Support `--abort-after-rows <n>`, `--abort-after-ms <n>`, and `--keep-partial`.

  **Mechanic**: Row-count aborts test pipeline cancellation from inside the data path. Timer aborts test cancellation from outside the stream graph.

  **Hint**: Parse abort settings before building pipeline stages.

  **Checkpoint**: The command accepts abort flags and records them in the report.

- [ ] **Step 2: Create an AbortController per run**

  **Task**: Create an `AbortController` and pass its signal to `pipeline(...stages, { signal })`.

  **Mechanic**: The signal gives the pipeline one cancellation channel.

  **Hint**: Keep the controller scoped to one run.

  **Checkpoint**: Calling `controller.abort()` causes the pipeline promise to reject with an abort path.

- [ ] **Step 3: Abort after row thresholds**

  **Task**: Add a counting stage that aborts after the configured row count.

  **Mechanic**: The pipeline can cancel itself based on logical progress through rows.

  **Hint**: Decide whether the threshold counts parsed rows or matched rows, then record that choice.

  **Checkpoint**: `npm run stream -- --abort-after-rows 1000` stops before the full file is processed.

- [ ] **Step 4: Abort after time thresholds**

  **Task**: Add a timer that aborts after `--abort-after-ms`.

  **Mechanic**: External cancellation can happen while a stream is waiting on I/O or a slow sink.

  **Hint**: Clear the timer in `finally`.

  **Checkpoint**: A short timeout stops a slow pressure run.

- [ ] **Step 5: Write through temp output**

  **Task**: Write file output to `out/stream.ndjson.tmp` and rename it to `out/stream.ndjson` only after success.

  **Mechanic**: The final path should represent completed output. Temp output represents work in progress.

  **Hint**: Keep temp and final files in the same directory.

  **Checkpoint**: A failed run leaves the previous final output untouched.

- [ ] **Step 6: Clean up or mark partial files**

  **Task**: On abort or failure, remove the temp file unless `--keep-partial` is set.

  **Mechanic**: Partial output is application state. `pipeline()` tears down streams, while your command owns output-file correctness.

  **Hint**: Preserve cleanup errors in the report while keeping the original abort reason.

  **Checkpoint**: Aborted runs report `status: "aborted"`, `partialRemoved`, and `finalPromoted: false`.

### Run

```sh
npm run stream -- --abort-after-rows 1000
```

Keep the partial file for inspection:

```sh
npm run stream -- --abort-after-rows 1000 --keep-partial
```

### Expected behavior

The pipeline stops before processing the full file. The report marks the run as aborted. By default, the temp file is removed and no corrupt final output is promoted.

### Hints

Treat abort as an expected status with a clear report state.

### Debugging notes

- If the final output changes after an aborted run, check whether you write directly to the final path.
- If abort leaves the run active, confirm every async generator stage receives and checks the signal.
- If cleanup removes a good previous output, inspect the temp/final rename order.

### Checkpoint

Corrupt final output never carries a success status. Aborted runs are visible in the report and clean up or mark partial files according to the flag.

### Reflection

Explain why cancellation belongs in the correctness model of a stream processor.

## Phase 12: Add Compression

### Goal

Add gzip compression for output and decompression for input, then report compression ratio and pressure effects.

### Why this matters

Compression is a real transform stage. It changes chunk sizes, can hold internal state, and can change the timing of downstream writes. That makes it a good test for the workbench because it affects both byte counts and backpressure.

The workbench already has source adapters and plugin stages. Compression should fit into that existing stage list rather than becoming a separate code path.

### Build

- [ ] **Step 1: Add gzip output flags**

  **Task**: Support `--gzip`, `--gzip-level <n>`, and compressed output paths such as `out/errors.ndjson.gz`.

  **Mechanic**: Gzip output inserts a compression Transform after stringification and before the destination.

  **Hint**: Pass `{ level }` to `createGzip()` when a level is provided.

  **Checkpoint**: `npm run stream -- --gzip --output out/errors.ndjson.gz` creates a gzip file.

- [ ] **Step 2: Add gunzip input support**

  **Task**: Read gzipped input with `--source gzip --input data/access.ndjson.gz`.

  **Mechanic**: Gunzip must run before line splitting because the line splitter needs decompressed NDJSON bytes.

  **Hint**: Keep gunzip inside the source/stage factory path.

  **Checkpoint**: Gzipped input produces the same row count as the raw file after decompression.

- [ ] **Step 3: Count compressed and uncompressed bytes**

  **Task**: Track compressed input bytes, uncompressed input bytes, uncompressed output bytes, and compressed output bytes.

  **Mechanic**: Compression changes byte counts at transform boundaries. The report needs both sides of the transform.

  **Hint**: Count uncompressed output before gzip and compressed output at the destination.

  **Checkpoint**: The stream report has separate compressed and uncompressed byte fields.

- [ ] **Step 4: Report compression settings**

  **Task**: Record gzip mode, gzip level, and compression ratio.

  **Mechanic**: Ratio needs the original byte count and compressed byte count from the same logical output.

  **Hint**: Store ratio as a numeric value.

  **Checkpoint**: `reports/stream.json` includes gzip settings and ratio when `--gzip` is enabled.

- [ ] **Step 5: Keep comparisons content-aware**

  **Task**: Compare decompressed gzip content against raw NDJSON content for equivalent runs.

  **Mechanic**: Compressed bytes differ by design. Logical row content is the comparable value.

  **Hint**: Use `createGunzip()` in the hash path for gzip outputs.

  **Checkpoint**: Raw and gzip modes can prove matching logical output.

- [ ] **Step 6: Observe pressure changes**

  **Task**: Run pressure tests in raw and gzip modes, then compare drain counts, elapsed time, and byte counts.

  **Mechanic**: Gzip can emit chunks in different sizes and timing than the input rows.

  **Hint**: Record pre-gzip and post-gzip bytes before drawing conclusions.

  **Checkpoint**: The report shows how gzip changed bytes and pressure metrics for the same filter.

### Run

```sh
npm run stream -- --where "status >= 500" --gzip --output out/errors.ndjson.gz
```

If you create a gzipped input file, read it back:

```sh
npm run stream -- --source gzip --input data/access.ndjson.gz
```

### Expected behavior

Compressed output is produced when `--gzip` is enabled. The report includes gzip settings, compressed bytes, uncompressed bytes, and compression ratio.

### Hints

Keep the line splitter after gunzip and before JSON parsing. Keep gzip output after stringification.

### Debugging notes

- If gzip output fails decompression, confirm the destination stream finishes before the report exits.
- If compression ratio is greater than `1`, inspect payload randomness. Highly random payloads compress poorly.
- If drain behavior changes with gzip, record both pre-gzip and post-gzip byte counts before drawing conclusions.

### Checkpoint

The workbench can produce compressed output, read gzipped input, and report compression ratio.

### Reflection

Explain why inserting gzip can change drain behavior even when the number of input rows stays the same.

## Phase 13: Compare Modes

### Goal

Compare naive, stream, slow sink, gzip, and highWaterMark variants in one report.

### Why this matters

The lab should end with evidence. Individual reports prove that each command ran. A comparison report shows which outputs match, which resource profiles differ, and which settings changed the result.

The comparison should show the tradeoffs for this input and this machine.

### Build

- [ ] **Step 1: Create the comparison command**

  **Task**: Create `src/compare.js` and wire it to `npm run compare`.

  **Mechanic**: The comparison command reads or produces mode reports and turns them into one human-readable result.

  **Hint**: Shared internal functions are cleaner than spawning npm scripts if your commands already expose reusable runners.

  **Checkpoint**: `npm run compare` starts a comparison run.

- [ ] **Step 2: Define comparison scenarios**

  **Task**: Run naive default, stream default, pressure default, pressure with `--slow-write-ms 5`, gzip output, low read `highWaterMark`, and larger write `highWaterMark`.

  **Mechanic**: Each scenario changes one part of the processing path so the report can attribute differences.

  **Hint**: Give each scenario a stable name.

  **Checkpoint**: Every scenario writes a unique JSON report path.

- [ ] **Step 3: Compute content checks**

  **Task**: Compute line counts, match counts, and SHA-256 hashes for outputs that should be equivalent.

  **Mechanic**: Reports can look healthy while output content is wrong. Hashes catch mismatched rows.

  **Hint**: Decompress gzip outputs before hashing logical content.

  **Checkpoint**: Equivalent raw and gzip outputs have matching logical hashes.

- [ ] **Step 4: Read report metrics**

  **Task**: Read input bytes, output bytes, rows, matches, elapsed time, peak RSS, peak heap, peak external memory, and drain count from scenario reports.

  **Mechanic**: The comparison should consume the evidence already written by each mode.

  **Hint**: Avoid copying numbers manually. Read JSON.

  **Checkpoint**: A missing report causes the comparison to fail with the scenario name.

- [ ] **Step 5: Write `reports/comparison.md`**

  **Task**: Create a Markdown table with one row per scenario and paths to the JSON reports used.

  **Mechanic**: Markdown makes the comparison easy to read in a terminal, editor, or browser.

  **Hint**: Include mode, input bytes, output bytes, rows, matches, elapsed ms, peak RSS, peak heap, peak external memory, drain count, and output match status.

  **Checkpoint**: `reports/comparison.md` exists after the run.

- [ ] **Step 6: Fail on mismatched equivalent outputs**

  **Task**: Exit with a failure code when modes that should produce the same logical output disagree.

  **Mechanic**: Compare mode is a validation tool as well as a report writer.

  **Hint**: Print the first mismatched scenario pair to stderr.

  **Checkpoint**: A deliberate output difference makes `npm run compare` fail.

- [ ] **Step 7: Record the production rule**

  **Task**: End the comparison report with the stream rule you would apply in production.

  **Mechanic**: The final rule should come from measured behavior rather than preference.

  **Hint**: Tie the rule to evidence: retained memory, drain events, elapsed time, compression ratio, or output correctness.

  **Checkpoint**: `reports/comparison.md` includes a short final note with your production rule.

### Run

```sh
npm run compare
```

### Expected behavior

`reports/comparison.md` exists. Outputs match where they should. Reports differ meaningfully across naive, stream, pressure, gzip, and highWaterMark runs.

### Hints

Save each scenario report under a unique filename, such as `reports/stream-low-hwm.json`, before reading it into the comparison table.

### Debugging notes

- If compare overwrites reports before reading them, give each run a report path flag.
- If hashes differ but line counts match, compare the first mismatched line. Plugin order or output field order is the usual cause.
- If a pressure run takes too long, reduce rows for comparison with a smaller generated fixture and record that fixture in the report.

### Checkpoint

`reports/comparison.md` exists, names the reports it used, and fails the command when equivalent outputs differ.

### Reflection

Write the stream rule you would apply in production after reviewing your comparison report.
