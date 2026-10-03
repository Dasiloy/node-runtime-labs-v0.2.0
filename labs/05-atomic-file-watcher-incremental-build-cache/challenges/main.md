# Atomic File Watcher + Incremental Build Cache

Build a watch-mode CLI that treats filesystem events as prompts to verify state. The finished tool scans a directory, records metadata, streams content into hashes, saves a cache, classifies changes, watches live edits, normalizes atomic replacement noise, debounces rebuilds, limits rebuild concurrency, and writes reports that show what happened.

Use only Node built-ins. Keep the project small. The value is in the ordering, the reports, and the failure handling.

Each phase is a guided lesson. Mark a step verified only after you have evidence from the command, report, or artifact named by that step.

Write every reflection response in `reports/reflections.md`. Use one heading per phase, such as `## Phase 0`, and append to the same file as the lab progresses.

## Phase 0: Create The Project

### Goal

Create the watcher project shell and a CLI that accepts a directory argument.

### Why this matters

A watch-mode tool needs a stable command surface before it watches anything. Every later phase hangs off the same CLI: scan, watch, cache, diff, rebuild, and report.

By the end of this phase, the project should print help text, accept a watched directory, and reject bad input clearly. No filesystem watching yet.

### Build

- [ ] **Step 1: Create the project manifest**

  **Task**: Create `package.json` with `"type": "module"` and an engine requirement for Node v24 or newer.

  **Mechanics**: The module format and runtime version shape every file in this lab. ESM syntax and Node v24 APIs should be explicit before the watcher grows.

  **Hint**: Keep the manifest small. You need metadata, scripts, and the Node engine range. You don't need dependencies.

  **Checkpoint**: Opening `package.json` shows that the project uses ESM and targets Node v24 or newer.

- [ ] **Step 2: Add the lab scripts**

  **Task**: Add scripts for `scan`, `watch`, `demo-watch`, and `simulate-atomic`.

  **Mechanics**: Script names become the command surface for the whole lab. Later phases add behavior behind the same names instead of changing how the reader runs the project.

  **Hint**: Point `scan` and `watch` at one CLI entry file, then pass the command name as the first argument.

  **Checkpoint**: `npm run` lists the four lab scripts.

- [ ] **Step 3: Create the project folders**

  **Task**: Create `src/`, `watched/`, `.cache/`, and `reports/`.

  **Mechanics**: The project separates implementation code, watched input, persistent tool state, and evidence. That separation prevents generated reports and cache files from being mistaken for source changes.

  **Hint**: Keep `reports/` and `.cache/` outside `watched/`.

  **Checkpoint**: Each folder exists and has one clear job.

- [ ] **Step 4: Create the CLI entry point**

  **Task**: Create `src/cli.js` and dispatch `scan` and `watch`.

  **Mechanics**: Node hands the process raw argv strings. The CLI entry point turns those strings into command behavior, flag state, and exit codes.

  **Hint**: Start with `process.argv.slice(2)`. Parse only the flags you need in this phase.

  **Checkpoint**: Running `node src/cli.js watch watched` reaches the watch command branch.

- [ ] **Step 5: Add help output**

  **Task**: Add `--help` output for the CLI and include planned flags: `--metadata`, `--hash`, `--poll`, `--poll-interval`, `--debounce`, `--concurrency`, `--rebuild-delay-ms`, `--follow-symlinks`, and `--cache`.

  **Mechanics**: Help output is part of the interface. A reader should be able to see the future shape of the tool before the internals exist.

  **Hint**: Put long help text in `src/help.js` once `src/cli.js` starts getting noisy.

  **Checkpoint**: `npm run watch -- --help` prints usage text and exits with code `0`.

- [ ] **Step 6: Accept the watched directory**

  **Task**: Accept a positional directory argument and default to `watched`.

  **Mechanics**: The watcher needs one root path for scanning, cache keys, report paths, and live events. Resolve the root once and pass it down.

  **Hint**: Store both the absolute root and report-friendly relative paths.

  **Checkpoint**: `npm run watch -- watched` accepts the directory and prints a placeholder message.

- [ ] **Step 7: Reject unknown input**

  **Task**: Return exit code `1` for an unknown command, unknown flag, or invalid directory.

  **Mechanics**: Silent flag mistakes corrupt experiments. A misspelled flag should fail before the tool reads or writes anything.

  **Hint**: Send errors to `process.stderr`, then set `process.exitCode = 1`.

  **Checkpoint**: `npm run watch -- --watc` fails, while `npm run watch -- --help` succeeds.

### Run

```sh
npm run watch -- --help
npm run watch -- watched
```

### Expected behavior

The help command exits successfully. The watch command accepts `watched` and prints a placeholder.

Unknown commands or flags fail with a clear error message.

### Hints

Keep the parser tiny. A CLI framework would hide the argv behavior this phase is meant to expose.

### Debugging notes

- `npm run watch -- --help` passes `--help` after the script separator.
- `process.cwd()` is the project root when commands run through npm from the project directory.
- Directory creation should use `{ recursive: true }` so setup can run repeatedly.

### Checkpoint

The project has a manifest, the four core folders, a CLI entry file, help output, directory parsing, and strict unknown-flag handling.

### Reflection

Write two reasons file watching requires more than "listen for change."

## Phase 1: Scan The Directory Tree

### Goal

Build the initial file inventory for the watched tree.

### Why this matters

Watch mode starts with state. A live event can only be classified against something the tool already knows.

The initial scan gives the watcher a baseline: known files, known directories, skipped paths, and scan errors. Later phases compare new snapshots against this baseline instead of trusting raw event names.

### Build

- [ ] **Step 1: Create the scan module**

  **Task**: Create `src/scan.js` and export `scanTree(root, options)`.

  **Mechanics**: The scan function is the inventory boundary. Watch mode, scan mode, diffing, and reports should call the same function instead of each building their own directory walk.

  **Hint**: Return data. Let the CLI decide how to print and write reports.

  **Checkpoint**: `src/cli.js` can import and call `scanTree()`.

- [ ] **Step 2: Walk directories recursively**

  **Task**: Use `fs.promises.readdir(dir, { withFileTypes: true })` to traverse nested folders.

  **Mechanics**: `Dirent` objects give file type hints without a separate stat call for the basic inventory. Metadata arrives in the next phase.

  **Hint**: Sort entries by name before walking them.

  **Checkpoint**: Files inside `watched/a/` and `watched/b/` both appear in the inventory.

- [ ] **Step 3: Add ignore rules**

  **Task**: Ignore `.git`, `node_modules`, `.cache`, and `reports` by default.

  **Mechanics**: A watcher that scans its own cache and reports can trigger rebuilds from its own output. The scan policy should separate source input from tool artifacts.

  **Hint**: Store ignore decisions as report entries instead of silently dropping them.

  **Checkpoint**: Ignored paths increase `counts.ignored` and appear in the `ignored` array.

- [ ] **Step 4: Normalize report paths**

  **Task**: Store relative POSIX-style paths in file records.

  **Mechanics**: Absolute paths differ across machines. Relative paths make reports portable and cache keys stable within the watched root.

  **Hint**: Use `path.relative(root, absolutePath)`, then replace platform separators with `/`.

  **Checkpoint**: Report paths look like `a/one.txt`, not `/home/.../watched/a/one.txt`.

- [ ] **Step 5: Count files, directories, ignored paths, and errors**

  **Task**: Add a `counts` object with `files`, `directories`, `ignored`, and `errors`.

  **Mechanics**: Counts make scan behavior visible at a glance. They also catch traversal bugs before metadata and hashing add more fields.

  **Hint**: Count directories when entered, and count files when recorded.

  **Checkpoint**: Creating two nested directories and two files produces matching counts.

- [ ] **Step 6: Write `reports/scan.json`**

  **Task**: Have `npm run scan -- watched` write a JSON report with `root`, `generatedAt`, `counts`, `files`, `ignored`, and `errors`.

  **Mechanics**: The report is evidence. Later phases can inspect scan behavior without rerunning the command.

  **Hint**: Use pretty JSON while building. It makes report diffs readable.

  **Checkpoint**: `reports/scan.json` exists after the scan and contains all discovered files.

### Run

```sh
mkdir -p watched/a watched/b
printf 'one\n' > watched/a/one.txt
printf 'two\n' > watched/b/two.txt
npm run scan -- watched
```

### Expected behavior

The command lists both files and writes `reports/scan.json`.

The report includes counts for directories, files, ignored paths, and errors.

### Hints

Keep scan output deterministic. Stable ordering turns report changes into useful evidence instead of noise.

### Debugging notes

- A missing `await` around `readdir()` often produces empty reports.
- Directory traversal order varies by filesystem. Sort names before appending results.
- Recursive scans can loop through symlinks once follow mode exists. Phase 12 defines that policy.

### Checkpoint

`reports/scan.json` includes every regular file under `watched/`, plus accurate counts for directories, files, ignored paths, and scan errors.

### Reflection

Explain why the initial scan and live watch events must feed the same inventory model.

## Phase 2: Record File Metadata

### Goal

Store size, mtime, mode, inode, device, and file type for each scanned entry.

### Why this matters

Paths are names. Metadata describes the filesystem object currently reachable through that name.

A file can be renamed, replaced, chmodded, truncated, or recreated while keeping the same path. Metadata gives the diff phase more evidence than a path string.

### Build

- [ ] **Step 1: Add the metadata flag**

  **Task**: Support `npm run scan -- watched --metadata`.

  **Mechanics**: Metadata collection costs extra filesystem calls. The flag makes that cost explicit and keeps the plain scan mode simple.

  **Hint**: Parse the flag in `src/cli.js`, then pass `metadata: true` into `scanTree()`.

  **Checkpoint**: The scan report changes shape only when `--metadata` is present.

- [ ] **Step 2: Use `lstat` for entries**

  **Task**: Call `fs.promises.lstat()` for each scanned entry when metadata is enabled.

  **Mechanics**: `lstat()` reports the path entry itself. That keeps symlinks visible as symlinks instead of following them by accident.

  **Hint**: Reserve `stat()` for the later `--follow-symlinks` policy.

  **Checkpoint**: A symlink record has `type: "symlink"` when the platform supports creating one.

- [ ] **Step 3: Store the core metadata fields**

  **Task**: Add `size`, `mtimeMs`, `ctimeMs`, `birthtimeMs`, `mode`, `permissions`, `dev`, `ino`, and `nlink`.

  **Mechanics**: These fields separate content size, timestamp changes, permission state, and filesystem identity. Diffing uses them as independent signals.

  **Hint**: Store raw numeric values and add formatted strings only where they improve readability.

  **Checkpoint**: A regular file record includes timestamp numbers, mode bits, and identity fields.

- [ ] **Step 4: Build a file type classifier**

  **Task**: Derive `type` from `Stats` methods: `file`, `directory`, `symlink`, `fifo`, `socket`, `blockDevice`, `characterDevice`, or `unknown`.

  **Mechanics**: The watcher will treat ordinary files, directories, symlinks, and special files differently. Type classification belongs in the inventory.

  **Hint**: Put the classifier in one helper so Phase 12 can extend policy without rewriting scan code.

  **Checkpoint**: Directories and files receive different `type` values in the report.

- [ ] **Step 5: Record symlink targets**

  **Task**: For symlink entries, call `fs.promises.readlink()` and record the target string.

  **Mechanics**: The link target is metadata on the link. It tells the report where the link points without following it.

  **Hint**: If `readlink()` fails, record an error and keep the symlink entry.

  **Checkpoint**: `watched/link.txt` includes a `linkTarget` field.

- [ ] **Step 6: Add metadata errors**

  **Task**: Record metadata failures with `path`, `code`, and `phase: "metadata"`.

  **Mechanics**: Files can disappear between `readdir()` and `lstat()`. The scan should report that race instead of crashing.

  **Hint**: Treat `ENOENT` as a scan race and continue.

  **Checkpoint**: A path removed during scanning appears in `errors` rather than terminating the process.

### Run

```sh
printf 'target\n' > watched/target.txt
ln -s target.txt watched/link.txt
npm run scan -- watched --metadata
```

On Windows, create a symlink from an elevated shell or document that the symlink check was skipped.

### Expected behavior

`reports/scan.json` includes metadata for each entry.

`watched/link.txt` appears as `type: "symlink"` when symlink creation is available.

### Hints

The identity key should combine `dev` and `ino`; `ino` alone can collide across devices.

### Debugging notes

- `stat()` follows symlinks. `lstat()` reports the link itself.
- Some filesystems return `0` or repeated inode values. Record what the platform gives you.
- Timestamp precision varies. Compare numeric fields, and expect small differences across platforms.

### Checkpoint

`npm run scan -- watched --metadata` reports file type, size, mtime, mode, inode identity, and symlink state.

### Reflection

Explain why path alone is a weak file identity for a watcher.

## Phase 3: Add Content Hashing

### Goal

Compute a content hash for every regular file.

### Why this matters

Metadata and content answer different questions. Size and mtime can change while bytes stay the same. Bytes can change while size stays the same.

The hash gives the cache an input fingerprint. Later rebuilds can skip work when the fingerprint matches the saved state.

### Build

- [ ] **Step 1: Add the hash flag**

  **Task**: Support `npm run scan -- watched --hash`.

  **Mechanics**: Hashing reads file contents. It should be an explicit mode so the reader can compare metadata-only scans with content scans.

  **Hint**: Hashing can work with or without `--metadata`, but later phases will usually use both.

  **Checkpoint**: Running with `--hash` adds hash fields to regular file records.

- [ ] **Step 2: Create the hashing module**

  **Task**: Create `src/hash.js` with a helper that hashes one file path.

  **Mechanics**: Hashing is content I/O, separate from tree traversal. Keeping it in a module makes error handling and concurrency easier to test.

  **Hint**: Return `{ algorithm, digest, bytes }`.

  **Checkpoint**: A small one-file scan can call the helper and record a SHA-256 digest.

- [ ] **Step 3: Stream file contents into SHA-256**

  **Task**: Use `fs.createReadStream()` and `crypto.createHash('sha256')`.

  **Mechanics**: Streaming keeps memory bounded. The process reads chunks, updates the hash state, and avoids buffering the whole file.

  **Hint**: A `for await...of` loop over the stream keeps the code compact.

  **Checkpoint**: A large file can be hashed without loading the whole file through `readFile()`.

- [ ] **Step 4: Hash regular files only**

  **Task**: Skip directories, symlinks, and special files by default.

  **Mechanics**: Content hashing policy depends on file type. Phase 12 will add symlink-follow behavior; this phase keeps the default safe.

  **Hint**: Use the type classifier from Phase 2 when metadata is available.

  **Checkpoint**: The report shows skipped non-regular entries rather than trying to read them.

- [ ] **Step 5: Preserve output order**

  **Task**: Keep `files` sorted even if hashing runs with limited concurrency.

  **Mechanics**: Concurrent work finishes in timing order. Reports need path order.

  **Hint**: Fill hash results back onto the existing file records instead of pushing completion results into a new array.

  **Checkpoint**: Repeated hash scans produce the same file ordering.

- [ ] **Step 6: Report hash errors**

  **Task**: Record hash failures with `path`, `code`, and `phase: "hash"`.

  **Mechanics**: A file can be deleted or become unreadable after the metadata pass. Hash errors are scan evidence, not process-fatal errors.

  **Hint**: Handle `ENOENT`, `EACCES`, and `EPERM` explicitly.

  **Checkpoint**: A disappearing file produces a report error and the scan still completes.

### Run

```sh
printf 'same\n' > watched/a.txt
printf 'same\n' > watched/b.txt
npm run scan -- watched --metadata --hash
```

### Expected behavior

Both files report the same SHA-256 hash.

`reports/scan.json` includes `hashAlgorithm: "sha256"` and byte counts for hashed files.

### Hints

Hash raw bytes. Do not read files as UTF-8 text before hashing.

### Debugging notes

- Handle `ENOENT` during hashing. A file can disappear after the directory scan.
- A symlink can point to a large file or a loop. Keep symlink hashing behind Phase 12 policy.
- Hash strings in lowercase hex so report comparisons stay simple.

### Checkpoint

Same content produces the same hash, and changed content produces a different hash in the next scan.

### Reflection

Explain why a filesystem cache should stream hashes instead of buffering every file at once.

## Phase 4: Build The Persistent Cache

### Goal

Save the latest inventory to `.cache/index.json` and load it on the next run.

### Why this matters

An incremental tool needs memory across process runs. The scan report describes one run. The cache becomes the previous state for the next run.

Cache writes use the same filesystem care as source writes. A half-written cache makes the next diff unreliable, so the cache update should publish as one replacement.

### Build

- [ ] **Step 1: Create the cache module**

  **Task**: Create `src/cache.js` with `loadCache(cachePath)` and `saveCacheAtomic(cachePath, inventory)`.

  **Mechanics**: Cache I/O has different failure rules than scanning. Loading can recover from missing files. Saving should publish a complete cache or leave the old cache in place.

  **Hint**: Keep cache shape conversion inside this module.

  **Checkpoint**: `src/cli.js` can load a previous cache before scanning.

- [ ] **Step 2: Define the cache schema**

  **Task**: Store `version`, `root`, `createdAt`, `updatedAt`, `options`, and `filesByPath`.

  **Mechanics**: A schema version gives future code a way to reject stale cache shapes. `filesByPath` makes diff lookups direct.

  **Hint**: Keep report-only timing fields out of the cache.

  **Checkpoint**: `.cache/index.json` has one object keyed by relative path for each scanned file.

- [ ] **Step 3: Load before scanning**

  **Task**: Load `.cache/index.json` before each scan command does work.

  **Mechanics**: The previous cache is the comparison base. Loading after saving would erase the state you need.

  **Hint**: Treat `ENOENT` as an empty cache on the first run.

  **Checkpoint**: The first scan reports `loaded: false`, and the second scan reports `loaded: true`.

- [ ] **Step 4: Save through a same-directory temp file**

  **Task**: Write JSON to a temp path beside `.cache/index.json`, then rename it over the target.

  **Mechanics**: Same-directory rename gives the cache one publish point. Readers see the old cache or the new cache.

  **Hint**: Include `process.pid` and random bytes in the temp filename.

  **Checkpoint**: Killing the process during a save never leaves a partial `index.json` with truncated JSON in normal operation.

- [ ] **Step 5: Add cache flags**

  **Task**: Support `--cache <path>` and `--no-cache`.

  **Mechanics**: Flags make cache location and cache bypass observable. The diff and rebuild phases should use the same setting.

  **Hint**: Default to `.cache/index.json` from the project root.

  **Checkpoint**: Passing `--cache .cache/alt.json` writes the alternate cache file.

- [ ] **Step 6: Report cache timing**

  **Task**: Add `cache.path`, `cache.loaded`, `cache.loadMs`, and `cache.saveMs` to `reports/scan.json`.

  **Mechanics**: Cache overhead is part of incremental build cost. The report should show that cost instead of hiding it.

  **Hint**: Use `performance.now()` around load and save calls.

  **Checkpoint**: The scan report includes cache timing on every cached run.

### Run

```sh
npm run scan -- watched --metadata --hash
npm run scan -- watched --metadata --hash
```

### Expected behavior

The first run creates `.cache/index.json`.

The second run reports that a previous cache was loaded and saved again.

### Hints

Invalid JSON should produce a clear cache error. Add a recovery flag such as `--ignore-bad-cache` only if you want explicit recovery behavior.

### Debugging notes

- Loading the cache after saving overwrites the previous state. Load first.
- A rename across filesystems can fail. Same-directory temp files avoid that case for the cache path.
- Pretty JSON makes cache contents readable while the lab is under construction.

### Checkpoint

`.cache/index.json` exists after the first scan, and the second scan reports cache load and save timing.

### Reflection

Explain why cache files need atomic writes too.

## Phase 5: Detect Added, Changed, And Deleted Files

### Goal

Compare the current inventory against the cached inventory and classify paths.

### Why this matters

Rebuild decisions depend on classification. Added files need new outputs. Deleted files may need output cleanup. Changed files need rebuild work. Unchanged files should be cheap.

The diff should explain its decision. A rebuild report that says "changed" without a reason gives the next phase less evidence than the tool already had.

### Build

- [ ] **Step 1: Create the diff module**

  **Task**: Create `src/diff.js` and export `diffInventories(previous, current)`.

  **Mechanics**: Diffing belongs between scanning and rebuilding. It should accept inventory objects and return classifications without touching the filesystem.

  **Hint**: Make this function easy to unit test with plain objects.

  **Checkpoint**: A test object with one previous path and one current path returns the expected classification.

- [ ] **Step 2: Compare path keys**

  **Task**: Use `filesByPath` from the previous cache and current inventory.

  **Mechanics**: Paths are the first matching layer. Deleted paths exist only in previous state. Added paths exist only in current state.

  **Hint**: Build `Set` objects for previous and current path keys.

  **Checkpoint**: Adding and deleting files updates the `added` and `deleted` arrays.

- [ ] **Step 3: Classify changed files**

  **Task**: Compare `hash`, `size`, `mtimeMs`, `ctimeMs`, `mode`, `identity`, and `type`.

  **Mechanics**: A change can be content, metadata, identity, or type. The report should keep the reasons separate.

  **Hint**: Prefer an array of reason strings over one combined message.

  **Checkpoint**: Appending content produces at least a `hash` change when hashes are enabled.

- [ ] **Step 4: Preserve unchanged counts**

  **Task**: Count unchanged paths and optionally store their path list.

  **Mechanics**: Cache wins matter. The unchanged count proves the tool can avoid work later.

  **Hint**: Keep unchanged entries compact so reports stay readable.

  **Checkpoint**: A second scan with no edits reports nonzero `unchanged`.

- [ ] **Step 5: Write `reports/diff.json`**

  **Task**: Include `counts`, `added`, `changed`, `deleted`, and `unchanged`.

  **Mechanics**: This report is the rebuild plan before rebuild code exists. It should show both classifications and reasons.

  **Hint**: Include `previous` and `current` metadata for changed entries only.

  **Checkpoint**: The report contains count fields for all four classifications.

- [ ] **Step 6: Save cache after diffing**

  **Task**: Load previous cache, scan current state, write the diff, then save current state.

  **Mechanics**: Ordering controls correctness. Saving before diffing makes every current file look unchanged.

  **Hint**: Write the order as comments in `src/cli.js` while wiring it up.

  **Checkpoint**: A change made between two runs appears in `reports/diff.json` once, then becomes unchanged on the next run.

### Run

```sh
npm run scan -- watched --metadata --hash
printf 'new\n' > watched/new.txt
printf 'edit\n' >> watched/a.txt
rm watched/b.txt
npm run scan -- watched --metadata --hash
```

### Expected behavior

`reports/diff.json` classifies the new file as added, the edited file as changed, and the removed file as deleted.

### Hints

Use hashes as the strongest content signal when present. Keep metadata reasons too.

### Debugging notes

- Empty previous cache means every current file is added.
- Saving before diffing makes every run look unchanged.
- Deleted files only exist in the previous cache, so their current metadata is absent by design.

### Checkpoint

`reports/diff.json` includes added, changed, deleted, and unchanged counts after a run with one add, one edit, and one delete.

### Reflection

Explain the difference between a metadata change and a content change in this tool.

## Phase 6: Add `fs.watch`

### Goal

Receive live filesystem events from the watched directory tree.

### What you'll build

In this phase, the project changes from a one-shot scanner into a live watch-mode tool.

The watcher starts from a known baseline, registers directory watchers, normalizes raw filesystem events, and preserves those events as reportable evidence. The scope here is narrow. Atomic-write grouping, polling fallback, debouncing, rebuild queues, cache updates, and shutdown reporting arrive in later phases.

For now, the tool should prove one thing clearly: when a file changes inside the watched tree, the project receives an event and records enough information to inspect it.

### What you'll prove

By the end of this phase, editing a nested file should produce a timestamped event with an event type, watched directory, and filename or relative path when the platform supplies one.

### Files you'll touch

- `src/watch.js`
- `src/cli.js`
- `reports/events.jsonl`
- `reports/scan.json`

### Final verification

Start watch mode, edit a nested file under `watched/`, and confirm that `reports/events.jsonl` contains the event record.

### Why this matters

Native watcher events give the tool low-latency prompts. The prompt still needs verification through scan and diff.

Node exposes a compact event API over different operating-system watcher backends. The portable layer for this lab is the event record your tool writes, followed by a rescan.

### Build

- [ ] **Step 1: Create the watch session module**

  **Short outcome**: Move long-running watch-mode state out of the CLI and into a dedicated session module.

  **What you're building**: Create `src/watch.js`, the module that owns the watch session lifecycle.

  This module will eventually hold watcher handles, event buffers, timers, debounce state, rebuild state, and cleanup behavior. The CLI should parse arguments, call the watch session, and report startup errors.

  This boundary matters because watch mode starts resources that keep the process alive. Later phases add atomic-write grouping, polling fallback, rebuild queues, cache updates, and shutdown reporting. If that state stays in `src/cli.js`, the command layer becomes the owner of every runtime concern.

  **Why this step exists**: A scanner can run, produce a report, and exit.

  A watcher creates an active session. That session needs a place to store state, flush evidence, and stop resources later.

  This step creates the ownership boundary for the rest of watch mode.

  **Design boundaries**: Keep argument parsing in `src/cli.js`.

  Keep watcher handles and live event state inside `src/watch.js`.

  Reuse scan functionality from earlier phases; the watcher should share traversal logic.

  **Implementation hint**: Think about the object the caller may need later. It may need a way to stop the session, inspect buffered events, or flush a report.

  Return something the caller can reason about. A hidden session makes later cleanup harder.

  **Common trap**: Letting `src/cli.js` slowly become the home for watcher handles, timers, event buffers, and rebuild state creates avoidable coupling.

  That may feel faster in this step, but it will make later phases harder.

  **Verify it works**: Run:

  ```sh
  npm run watch -- watched
  ```

  You should see the CLI enter watch mode through `startWatchSession()` while watch behavior stays in `src/watch.js`.

  Evidence: `src/cli.js` dispatches to `src/watch.js`, and watcher state stays inside the session module.

  A failure here usually means the command parser and the session boundary are tangled.

  **Reflection**: Why is watch mode better modeled as a session than as a normal command?

- [ ] **Step 2: Take an initial baseline before watching**

  **Short outcome**: Run the existing scan path before registering live watchers.

  **What you're building**: Add an initial baseline step to watch mode.

  Before live events start, the watcher needs to know what already exists. The baseline should reuse the scanner from earlier phases and collect the current file inventory before the watcher interprets live changes.

  The baseline is the watcher's memory of the directory before new events arrive. With it, the tool has evidence about the starting state before later events show that something changed.

  Later phases compare live events against this baseline to classify added, changed, deleted, replaced, and unchanged files.

  **Why this step exists**: Filesystem watchers report future activity only.

  If a file existed before watch mode started, the watcher receives events only for activity after watch starts. The initial scan gives the watcher a known starting point.

  Live events become more useful once the session has a baseline to compare against.

  **Design boundaries**: Reuse the scan path from earlier phases.

  Use the existing traversal path for watch startup.

  Keep baseline data separate from live event data.

  **Implementation hint**: Model the session startup in two stages: observe current state, then observe live changes.

  The first stage gives meaning to the second.

  **Common trap**: Starting with `fs.watch()` first leaves the session with live events and a missing starting inventory.

  It reports events after the watcher is active. The baseline describes the starting state.

  **Verify it works**: Run:

  ```sh
  npm run watch -- watched
  ```

  You should see an initial scan report or baseline summary before live event watching begins.

  Evidence: `reports/scan.json` is written before the first live event, and it includes the number of files or directories discovered.

  A missing or empty baseline usually means watch mode bypassed the shared scanner.

  **Reflection**: Why does a baseline make live events more useful?

- [ ] **Step 3: Register directory watchers**

  **Short outcome**: Start receiving live events from the root directory and nested directories.

  **What you're building**: Register filesystem watchers for the watched tree.

  The watcher should observe the root directory and nested directories so edits inside the tree produce events. Prefer directory-level watching over file-level watching. Directory watchers are better suited to replacement patterns where editors save by writing a temporary file and renaming it into place.

  This step should produce raw filesystem events. Classification waits. The goal is to prove that events are being received.

  Watcher handles are part of the session state. Store them in the watch session so later shutdown code can close them in one place.

  **Why this step exists**: Watch mode depends on the operating system's filesystem event behavior.

  Event details vary across platforms. A change may appear as a rename event, a change event, or a small burst of related events.

  This phase begins by collecting the raw evidence before later phases classify it.

  **Design boundaries**: Start with native filesystem watching.

  Use recursive watching where it is available.

  Where recursive watching is unavailable or unreliable, fall back to one watcher per directory.

  Keep raw event capture separate from later logical classification.

  **Implementation hint**: Prefer observing directories as the primary strategy.

  A file path can be replaced during an atomic save. The directory is usually the more stable observation point.

  **Common trap**: Expect some edits to produce several events.

  Some editors produce multiple events. Some platforms report a replacement as a rename. Some events may omit the filename.

  **Verify it works**: Run:

  ```sh
  npm run watch -- watched
  ```

  In another terminal, edit a file inside a nested directory.

  You should see a live event with a timestamp, event type, and filename or path when the platform supplies one.

  Evidence: the terminal output or event report shows the nested edit as well as edits in the watched root.

  A root-only event stream usually means nested directories were not registered.

  **Reflection**: Why is a raw watch event different from a logical file change?

- [ ] **Step 4: Normalize raw events**

  **Short outcome**: Convert platform-specific watch output into one event shape used by the rest of the lab.

  **What you're building**: Create a normalized event record for every raw watch event.

  The normalized record should preserve the original event information, but it should also add the fields the rest of the project needs: `id`, `time`, `eventType`, `filename`, `watchRoot`, `absolutePath`, `relativePath`, `source`, and any missing-path notes.

  Classification waits. This step creates a stable event format. Later phases can group, debounce, classify, and compare these events.

  The report should make uncertainty visible. If the platform omits the filename, record that fact and mark the directory for rescan.

  **Why this step exists**: Raw watcher output is inconsistent.

  The rest of the lab consumes normalized event objects. Later phases can process watch events from recursive watching, per-directory watching, or polling fallback through the same event path.

  **Design boundaries**: Preserve raw event data.

  Add normalized fields for the rest of the tool.

  Preserve uncertainty. If the filename is missing or ambiguous, record that explicitly.

  **Implementation hint**: A useful event record answers when it happened, where the watcher was attached, what the platform reported, which path may be affected, and how much context the tool has.

  **Common trap**: Treating uncertain events as certain makes the report misleading.

  If the platform gives partial information, the report should show that. Developer tools are more trustworthy when they admit uncertainty.

  **Verify it works**: Run:

  ```sh
  npm run watch -- watched
  ```

  Then edit, create, and delete files in the watched tree.

  You should see one consistent event shape for all raw watcher callbacks.

  Evidence: `reports/events.jsonl` contains timestamped records with the same top-level field names across edit, create, and delete operations.

  Missing `relativePath` values are acceptable when the platform omits the filename, but the record should say so.

  **Reflection**: Why should a tool preserve raw event details after normalization?

- [ ] **Step 5: Buffer events for reporting**

  **Short outcome**: Keep a bounded list of recent watch events and write them to a report.

  **What you're building**: Add an event buffer to the watch session.

  The buffer should collect normalized events so the tool can write a report during or after the session. The report is evidence. It lets you inspect what the watcher received after terminal output scrolls away.

  Keep the buffer bounded. A watch process can run for a long time, and unbounded event storage can become its own memory problem.

  Later phases will read this event history while building atomic-write grouping, debounced batches, rebuild queues, and final reports.

  **Why this step exists**: A watch tool should react and explain what happened.

  Reports make filesystem behavior inspectable. They also prepare the project for later phases where raw event bursts become logical rebuild cycles.

  **Design boundaries**: Store normalized event records.

  Keep the buffer bounded.

  Write report data into `reports/` and keep source directories and the watched input tree clean.

  **Implementation hint**: The buffer needs enough recent evidence to debug the session. The durable report carries the longer event history.

  **Common trap**: Terminal-only event output disappears after the session stops.

  The report gives you something to inspect after the run.

  **Verify it works**: Run:

  ```sh
  npm run watch -- watched
  ```

  Make a few file changes, then inspect the event report.

  You should see timestamped event records in append order.

  Evidence: `reports/events.jsonl` contains one JSON object per recorded event, and each object includes the normalized fields from the previous step.

  If the report grows forever during a long session, the buffer policy needs work before later phases add more event sources.

  **Reflection**: Why is a report more useful than terminal output for debugging watch behavior?

- [ ] **Step 6: Handle watcher errors with evidence**

  **Short outcome**: Record watcher errors clearly and keep the session state understandable.

  **What you're building**: Add basic error handling around watch registration and live event collection.

  A watcher can fail because a directory is missing, permissions change, a watched path is removed, or the platform refuses a recursive mode. This step should make those failures visible.

  Recovery policy belongs in later phases. The phase goal is visibility: the learner should see a clear error event with enough context to inspect.

  Error records belong with the session evidence. Later phases can decide whether to retry, rescan, fall back to polling, or stop.

  **Why this step exists**: Filesystem tools operate in a changing environment.

  The directory tree can change while the tool is watching it. Permissions can change. Paths can disappear.

  A good watch tool treats these as observable events with context.

  **Design boundaries**: Record watcher errors as structured events.

  Keep error reporting separate from later recovery policy.

  Preserve specific failure context.

  **Implementation hint**: When something fails, preserve the path, the operation, whether the failure happened during registration or event delivery, and the error code or message.

  **Common trap**: Catching errors and printing only `watch failed` removes the details needed for debugging.

  Preserve the path, phase, operation, and error message.

  **Verify it works**: Run:

  ```sh
  npm run watch -- missing-directory
  ```

  You should see a clear failure that names the missing or invalid path.

  Evidence: startup failures produce a readable terminal error, and errors after watch mode starts are preserved in `reports/events.jsonl` or the watch state report.

  A generic error missing path and operation details means the failure evidence is too thin.

  **Reflection**: Why should watcher failures become structured events?

### Run

```sh
npm run watch -- watched
```

In another terminal:

```sh
printf 'live\n' >> watched/a.txt
```

### Expected behavior

The watch process logs an event with timestamp, event type, and filename when the file changes.

`reports/events.jsonl` receives the same event record.

### Hints

Schedule verification work after events. Rebuild work belongs in later phases, after event capture and reporting are stable.

### Debugging notes

- Some platforms emit `rename` for edits made through atomic replacement.
- Some platforms omit `filename`. The rescan path handles that case.
- Linux watch limits can appear as `ENOSPC` during watcher setup.

### Checkpoint

Edits under `watched/` produce JSON event records with timestamp, event type, and filename when the platform supplies one.

### Reflection

Explain why watcher behavior differs by OS even though the Node API has the same callback shape.

## Phase 7: Add `fs.watchFile` Fallback

### Goal

Support polling mode with `--poll`.

### Why this matters

Native event delivery can be absent or unreliable on network mounts, container filesystems, and some editor workflows. Polling gives the tool a second observation path based on metadata snapshots.

Polling costs filesystem work on every interval. The report should make that cost visible.

### Build

- [ ] **Step 1: Add polling flags**

  **Task**: Support `--poll` and `--poll-interval <ms>` in watch mode.

  **Mechanics**: Polling changes the observation source and the latency profile. The command should make that mode visible.

  **Hint**: Reject intervals below a small floor such as `100`.

  **Checkpoint**: `npm run watch -- watched --poll --poll-interval 1000` starts in polling mode.

- [ ] **Step 2: Register file pollers**

  **Task**: Use `fs.watchFile()` for regular files discovered by the initial scan.

  **Mechanics**: Polling watches metadata snapshots for paths. It needs one registration per file.

  **Hint**: Use absolute paths for registration to avoid duplicates from path spelling differences.

  **Checkpoint**: Editing an existing file produces an event with `source: "fs.watchFile"`.

- [ ] **Step 3: Discover new files while polling**

  **Task**: Add a periodic directory rescan so polling mode can find new files.

  **Mechanics**: `fs.watchFile()` tracks paths already registered. New paths need separate discovery.

  **Hint**: Use a slower interval for tree discovery than file metadata polling if you want to expose both costs.

  **Checkpoint**: Creating a new file eventually adds a poll registration for it.

- [ ] **Step 4: Normalize polling events**

  **Task**: Convert `curr` and `prev` Stats objects into the same internal event stream used by native watching.

  **Mechanics**: Downstream batching should care about source records, not which watcher API produced them.

  **Hint**: Include compact `prev` and `curr` metadata summaries on the event record.

  **Checkpoint**: Native and polling events both appear in `reports/events.jsonl` with different `source` values.

- [ ] **Step 5: Track polling cleanup**

  **Task**: Store watched file paths and call `fs.unwatchFile()` during cleanup.

  **Mechanics**: Polling registrations are resources. They should be removed when a file disappears or the process shuts down.

  **Hint**: Track listener functions too. That lets you remove a specific registration.

  **Checkpoint**: Deleting a file removes or marks its polling registration.

- [ ] **Step 6: Report polling cost**

  **Task**: Write `reports/watch-state.json` with `mode`, `pollIntervalMs`, `registeredFiles`, `elapsedPollingIntervals`, `estimatedStatChecks`, `pollCallbacks`, `discoveryScans`, and `events`.

  **Mechanics**: Polling cost scales with file count and interval. Node exposes registrations, elapsed time, and callbacks where metadata changed. Derive `estimatedStatChecks` from observable state: `registeredFiles * elapsedPollingIntervals`.

  **Hint**: Increment `pollCallbacks` in the `fs.watchFile()` callback. Increment `discoveryScans` in the periodic tree rescan. Compute `estimatedStatChecks` when writing the report.

  **Checkpoint**: The watch-state report lets you compare polling mode with native watcher mode.

### Run

```sh
npm run watch -- watched --poll --poll-interval 1000
```

In another terminal:

```sh
printf 'poll\n' >> watched/a.txt
```

### Expected behavior

The change is detected through polling and recorded with `source: "fs.watchFile"`.

The watch-state report includes interval, registered file count, elapsed polling interval count, estimated stat check count, poll callback count, discovery scan count, and event count.

### Hints

Polling delay equals the configured interval plus scheduling delay. Measure it from event timestamps.

### Debugging notes

- `fs.watchFile()` tracks files. New files need a periodic tree rescan.
- Very short intervals can create enough stat work to distort rebuild timing.
- Timestamp precision can collapse multiple quick writes into one visible polling change.

### Checkpoint

`npm run watch -- watched --poll` detects edits through polling, and the report lets you compare estimated polling work with native watcher counters.

### Reflection

Explain the cost of polling in terms of estimated stat calls, elapsed intervals, latency, registered file count, and directory size.

## Phase 8: Handle Atomic Writes

### Goal

Detect editor-style temporary write and rename patterns as one logical file change.

### Why this matters

Many editors and build tools publish content by writing a temporary file and renaming it over the target path. Raw watcher events can show temp file creation, target rename, replacement rename, and content changes inside a short burst.

Later rebuild work consumes the logical result: one target path changed after the burst settled.

### Build

- [ ] **Step 1: Add an atomic-write simulator**

  **Task**: Create `src/simulate-atomic-write.js` that writes a same-directory temp file, closes it, and renames it over the target.

  **Mechanics**: A controlled simulator gives you repeatable watcher input without depending on editor behavior.

  **Hint**: Use a temp name that starts with `.` and ends with `.tmp`.

  **Checkpoint**: `npm run simulate-atomic -- watched/a.txt 'replacement text'` replaces the file contents.

- [ ] **Step 2: Create the atomic grouping module**

  **Task**: Create `src/atomic.js` for event burst grouping.

  **Mechanics**: Atomic replacement detection is a layer above raw watcher events and below later batch creation.

  **Hint**: Give the module raw event records and let it return logical event records.

  **Checkpoint**: The watch session can call the grouping module when raw events arrive.

- [ ] **Step 3: Detect temp path patterns**

  **Task**: Recognize temp names such as `.name.tmp`, `name~`, `.swp`, and `.tmp`.

  **Mechanics**: Temp file events are often implementation details of the save operation. They should be reported, then mapped to the target when evidence supports it.

  **Hint**: Keep the pattern list configurable so experiments can add editor-specific names.

  **Checkpoint**: Temp paths appear in logical event records as `tempPaths`.

- [ ] **Step 4: Group rename bursts**

  **Task**: Group raw events by directory and a short time window. Start with `100ms`.

  **Mechanics**: Atomic writes can produce several events close together. The grouping window collects the low-level evidence before classification.

  **Hint**: Use `performance.now()` for burst timing and ISO strings for report timestamps.

  **Checkpoint**: A simulated atomic write produces one candidate group with multiple raw event ids when the platform emits them.

- [ ] **Step 5: Verify the final file state**

  **Task**: After the burst window closes, rescan affected paths and compare metadata identity and hash.

  **Mechanics**: Final state is stronger evidence than raw event order. The target path either points at new content, vanished, or remained unchanged.

  **Hint**: Identity changes plus hash changes are strong replacement evidence.

  **Checkpoint**: Replacing `a.txt` reports `kind: "atomic-replace"` for `a.txt`.

- [ ] **Step 6: Preserve raw evidence**

  **Task**: Write logical groups to `reports/logical-events.json` without deleting raw events from `reports/events.jsonl`.

  **Mechanics**: Grouping changes the logical event stream consumed by later phases. It should leave the original event stream available for debugging.

  **Hint**: Store `rawEventIds` on every logical event.

  **Checkpoint**: The report shows a logical event with raw event ids and temp paths.

### Run

```sh
npm run watch -- watched
```

In another terminal:

```sh
npm run simulate-atomic -- watched/a.txt 'replacement text'
```

### Expected behavior

The report shows raw events grouped into one logical `atomic-replace` event for `a.txt`.

### Hints

Treat rename bursts as candidates, then verify by scanning. The final path state decides the classification.

### Debugging notes

- Editors use different temp names. Keep the pattern list configurable.
- Some platforms emit only a target rename. A rescan still detects the replacement.
- A save can produce both content and metadata changes. Classify the logical operation with all available evidence.

### Checkpoint

Simulated atomic writes produce one logical change instead of a noisy raw event burst.

### Reflection

Explain why atomic writes confuse a watcher that reacts directly to raw events.

## Phase 9: Debounce Rebuilds

### Goal

Group rapid events into one rebuild cycle after the event stream settles.

### Why this matters

A single save can emit multiple events. A bulk edit can touch many files inside one short interval.

Debouncing gives the scanner a stable point to read state. The rebuild should run from a verified diff after the burst, rather than from each raw event.

### Build

- [ ] **Step 1: Add the debounce flag**

  **Task**: Support `--debounce <ms>` in watch mode with a default such as `150`.

  **Mechanics**: The debounce interval controls when the tool decides an event burst has settled enough to verify state.

  **Hint**: Reject negative values and non-numeric input.

  **Checkpoint**: Watch startup prints or reports the active debounce interval.

- [ ] **Step 2: Create the debounce module**

  **Task**: Create `src/debounce.js` to collect events and fire a callback after quiet time.

  **Mechanics**: The debounce module owns timer behavior. Watch code should push events into it and let it emit batches.

  **Hint**: Reset the timer every time a new event arrives.

  **Checkpoint**: Two quick edits produce one pending batch, not two immediate rebuilds.

- [ ] **Step 3: Store pending paths**

  **Task**: Collect affected paths from raw and logical events in a `Set`.

  **Mechanics**: A path can receive many events during one save. A set records the affected input once per batch.

  **Hint**: A `filename === null` event should mark the whole watched root for rescan.

  **Checkpoint**: Repeated events for one file appear once in the batch path list.

- [ ] **Step 4: Verify state when the timer fires**

  **Task**: On batch flush, scan with metadata and hashes, diff against cache, and save the new cache after scheduling rebuild work.

  **Mechanics**: Debouncing delays action until verification can read a coherent snapshot.

  **Hint**: Keep the order: scan, diff, enqueue, save.

  **Checkpoint**: The diff for a batch comes from the post-debounce scan.

- [ ] **Step 5: Write batch reports**

  **Task**: Append batch records to `reports/batches.jsonl`.

  **Mechanics**: Batch records explain how raw events became rebuild cycles.

  **Hint**: Include `batchId`, `startedAt`, `settledAt`, `debounceMs`, `rawEventCount`, `logicalEventCount`, `paths`, and `diffCounts`.

  **Checkpoint**: One rapid edit burst produces one JSONL batch record.

- [ ] **Step 6: Keep reports out of the watched input**

  **Task**: Confirm `reports/` stays ignored by scanning and watching.

  **Mechanics**: Writing a batch report should not trigger a new batch.

  **Hint**: Reuse ignore rules from the scan phase.

  **Checkpoint**: Updating `reports/batches.jsonl` does not create a watcher event for rebuild input.

### Run

```sh
npm run watch -- watched --debounce 300
```

In another terminal:

```sh
printf 'a\n' >> watched/a.txt
printf 'b\n' >> watched/b.txt
```

### Expected behavior

One rebuild cycle runs after events settle.

`reports/batches.jsonl` shows raw events, logical events, affected paths, and diff counts for that cycle.

### Hints

Use one timer for the watch session. Per-path timers make cross-file saves harder to reason about.

### Debugging notes

- A timer that starts once and never resets fires too early during bursty saves.
- Diff results should come from the post-debounce scan.
- Writing reports inside the watched tree can trigger recursive rebuilds. Keep reports outside the watched root or ignore them.

### Checkpoint

Rapid edits produce one rebuild batch after the debounce interval, and the report shows raw events versus rebuild batches.

### Reflection

Explain how debouncing affects correctness, not just terminal noise.

## Phase 10: Add A Rebuild Queue

### Goal

Run rebuild jobs under a concurrency limit.

### Why this matters

Filesystem events can arrive faster than rebuild work finishes. A queue makes that pressure visible and keeps the process from starting unbounded work.

The queue also gives shutdown code a place to inspect active and pending work later.

### Build

- [ ] **Step 1: Create the queue module**

  **Task**: Create `src/queue.js` with a small concurrency-limited task queue.

  **Mechanics**: The queue controls active work. It accepts jobs, starts work while capacity exists, and leaves the rest pending.

  **Hint**: Track `active`, `pending`, and `concurrency`.

  **Checkpoint**: A queue with concurrency `2` never runs three jobs at once.

- [ ] **Step 2: Add the concurrency flag**

  **Task**: Support `--concurrency <n>` in watch mode. Default to `2`.

  **Mechanics**: Concurrency is part of the rebuild contract. The user should be able to choose how much work the tool starts at once.

  **Hint**: Reject values below `1`.

  **Checkpoint**: Passing `--concurrency 1` serializes rebuild jobs.

- [ ] **Step 3: Define rebuild job records**

  **Task**: Represent each job with `id`, `paths`, `createdAt`, `startedAt`, `finishedAt`, and `status`.

  **Mechanics**: Job records bridge event batches and rebuild output. They make queue behavior auditable.

  **Hint**: Keep path lists sorted before writing job records.

  **Checkpoint**: Every batch creates a job record with stable path ordering.

- [ ] **Step 4: Add placeholder rebuild work**

  **Task**: Create `src/rebuild.js` and write per-path output records under `reports/build-output/`.

  **Mechanics**: The queue needs real async work before incremental caching exists. Placeholder rebuilds make scheduling observable.

  **Hint**: Support `--rebuild-delay-ms <ms>` for this phase and await that delay inside each placeholder rebuild. A default such as `25` keeps normal runs quick; a larger value makes queue pressure visible.

  **Checkpoint**: Rebuild jobs create output files for changed paths.

- [ ] **Step 5: Coalesce pending duplicate paths**

  **Task**: If a new batch affects a path already in a pending job, merge it into that pending job instead of adding another duplicate job.

  **Mechanics**: Pending jobs can absorb later events because they have not started. Active jobs already represent work in progress.

  **Hint**: Only coalesce pending jobs. Keep active job history intact.

  **Checkpoint**: Repeated quick edits to one file create one pending rebuild for that file when capacity is full.

- [ ] **Step 6: Report queue state changes**

  **Task**: Append queue samples to `reports/queue.jsonl` whenever active or pending counts change.

  **Mechanics**: Queue high-water marks show backpressure. The final report will use this data.

  **Hint**: Include `time`, `active`, `pending`, `concurrency`, and `event`.

  **Checkpoint**: The report proves active jobs never exceed the configured concurrency. In a pressure run, it also shows `active` reaching the configured limit and `pending` rising above `0`.

### Run

```sh
npm run watch -- watched --debounce 50 --concurrency 2 --rebuild-delay-ms 500
```

In another terminal:

```sh
node -e 'const fs=require("node:fs");let n=0;const t=setInterval(()=>{n++;fs.appendFileSync(`watched/${n}.txt`,`${n}\n`);if(n===4)clearInterval(t);},80);'
```

### Expected behavior

The timed writes land in separate debounce batches while earlier rebuilds are still running.

Rebuild jobs run with no more than two active jobs at once. During the pressure run, the queue reaches two active jobs and at least one pending job.

The queue report shows active count, pending count, and job status changes.

### Hints

Always decrement `active` in a `finally` path. Failed jobs still consume capacity until they finish.

### Debugging notes

- Rebuild errors should fail the job, not the watcher process.
- A concurrency value below `1` should be rejected by CLI parsing.
- Queue reports written under `reports/` should stay ignored by the scanner.

### Checkpoint

After at least three writes separated by more than the debounce interval and less than the rebuild delay, `reports/queue.jsonl` proves active jobs reach the configured concurrency, pending work appears, and active jobs never exceed the configured concurrency.

### Reflection

Explain how filesystem events can create backpressure inside a build tool.

## Phase 11: Add Incremental Build Cache

### Goal

Skip unchanged files during rebuild.

### Why this matters

The watcher has enough evidence to avoid repeated work. Hashes, metadata, and diff reasons should feed the rebuild plan.

The build cache is separate from the scan cache. The scan cache says what inputs looked like. The build cache says which outputs were produced from which input fingerprints.

### Build

- [ ] **Step 1: Add build cache state**

  **Task**: Add a `buildCache` section to `.cache/index.json`.

  **Mechanics**: Scan cache records input state. Build cache records output state derived from input fingerprints.

  **Hint**: Keep the two sections separate even if they live in one file.

  **Checkpoint**: The cache file has distinct `filesByPath` and `buildCache` data.

- [ ] **Step 2: Store output fingerprints**

  **Task**: For each built source, store `inputHash`, `inputMetadata`, `outputPath`, `outputHash`, `builtAt`, and `builderVersion`.

  **Mechanics**: A build cache hit needs evidence that the input, output, and builder version still match.

  **Hint**: Start with a hardcoded `builderVersion` string in `src/rebuild.js`.

  **Checkpoint**: Rebuilt files create or update build cache records.

- [ ] **Step 3: Warm the build cache at watch startup**

  **Task**: After the watch startup scan, run an initial build-cache warmup for the current baseline before relying on cache hits.

  **Mechanics**: A scan cache records input fingerprints. It does not prove any build output exists. The build cache needs output records before unchanged files can count as hits.

  **Hint**: Mark the warmup in `reports/rebuilds.jsonl` with a reason such as `initial-build-cache-warmup` so later reports separate startup work from live rebuilds.

  **Checkpoint**: Starting watch mode creates build cache records and output fingerprints for the current files before the first live edit is tested.

- [ ] **Step 4: Rebuild only added and changed files**

  **Task**: Feed the diff result into `src/rebuild.js`, skip unchanged paths only when their build cache entry is valid, and rebuild added or changed paths.

  **Mechanics**: The diff is the rebuild plan. Unchanged paths become hits only when the input fingerprint, builder version, and output file still match.

  **Hint**: Use `stat()` on the output path before counting a hit, and handle `ENOENT` as a miss.

  **Checkpoint**: A no-op batch after warmup produces cache hits and zero rebuilt paths. Deleting an output file turns the next matching source into a cache miss.

- [ ] **Step 5: Clean deleted outputs**

  **Task**: Remove output records and generated output files for deleted sources.

  **Mechanics**: Incremental systems must handle removals as work. Otherwise stale outputs survive after sources vanish.

  **Hint**: Treat missing output during cleanup as already clean.

  **Checkpoint**: Removing `watched/a.txt` removes or marks the corresponding build output.

- [ ] **Step 6: Report hits and misses**

  **Task**: Append rebuild summaries to `reports/rebuilds.jsonl` with `cacheHits`, `cacheMisses`, `rebuilt`, `skipped`, and `deleted`.

  **Mechanics**: The report proves the incremental behavior. It should show why work ran and why work was skipped.

  **Hint**: Include diff reasons for misses.

  **Checkpoint**: Changing one file in a larger directory rebuilds one file and reports hits for the rest.

### Run

```sh
npm run scan -- watched --metadata --hash
npm run watch -- watched --debounce 200
```

Wait for watch startup to finish the initial build-cache warmup. That warmup should create output fingerprints for the current files.

In another terminal:

```sh
printf 'one changed file\n' >> watched/a.txt
```

### Expected behavior

Only the changed file is rebuilt.

The rebuild report shows cache hits for unchanged files and a cache miss for the edited file.

### Hints

Invalidate a build cache entry when `builderVersion` changes. Output format is part of the cache key.

### Debugging notes

- A missing output file should turn a would-be hit into a miss.
- Deleted source files need output cleanup.
- Permission errors during rebuild should produce skipped or failed records with path and code.

### Checkpoint

Changing one file in a larger directory rebuilds that file only, and the report includes cache hits and misses.

### Reflection

Explain why cache invalidation is hard when inputs include content, metadata, tool version, and output existence.

## Phase 12: Handle Symlinks And Permissions

### Goal

Define and implement policy for symlinks, unreadable files, and special files.

### Why this matters

Real directories contain more than ordinary files. A watcher can encounter symlinks, permission errors, FIFOs, sockets, devices, deleted paths, and files that change between scan and read.

The tool should report its policy decision for each edge case.

### Build

- [ ] **Step 1: Add the symlink flag**

  **Task**: Support `--follow-symlinks` in scan and watch modes.

  **Mechanics**: Symlink policy changes both traversal and hashing. The command should make that policy explicit.

  **Hint**: Default to recording links and skipping targets.

  **Checkpoint**: Running without the flag records symlinks as skipped target reads.

- [ ] **Step 2: Record default skip decisions**

  **Task**: Add `skipped` entries for symlinks, special files, and unsupported file types.

  **Mechanics**: A skip is a deliberate policy decision. It belongs in reports with the same clarity as errors.

  **Hint**: Use fields such as `path`, `kind`, `action`, and `reason`.

  **Checkpoint**: A symlink report entry says `reason: "follow-symlinks-disabled"`.

- [ ] **Step 3: Follow symlinks when requested**

  **Task**: Resolve symlink targets with `realpath()`, stat the target, and hash followed regular files.

  **Mechanics**: Following a link changes the identity being inspected. The report should keep link metadata and target metadata separate.

  **Hint**: Store `linkMetadata` and `targetMetadata` as different objects.

  **Checkpoint**: `--follow-symlinks` adds target metadata for a symlink to a regular file.

- [ ] **Step 4: Detect symlink cycles**

  **Task**: Track visited realpaths while following links.

  **Mechanics**: A symlink loop can make traversal unbounded. Cycle detection turns that into a skipped path with a reason.

  **Hint**: Record `ELOOP` and visited-cycle cases in the same skipped/error shape.

  **Checkpoint**: A link cycle is reported and the scan continues.

- [ ] **Step 5: Handle permission errors**

  **Task**: Handle `EACCES`, `EPERM`, `ENOENT`, and `ELOOP` during scan, hash, rebuild, and watch setup.

  **Mechanics**: Permissions can change while the watcher runs. The process should classify the failure and keep going.

  **Hint**: Include `phase` on every error: `scan`, `metadata`, `hash`, `watch`, or `rebuild`.

  **Checkpoint**: An unreadable file creates an error record, not an unhandled exception.

- [ ] **Step 6: Add platform notes**

  **Task**: Add report notes when symlink creation or permission behavior differs on the current platform.

  **Mechanics**: Cross-platform filesystem labs need evidence about skipped experiments, not silent gaps.

  **Hint**: Use `process.platform` in reports, but avoid platform-specific branching beyond the policy needed for the check.

  **Checkpoint**: Windows symlink or permission skips are documented in the report.

### Run

```sh
printf 'secret\n' > watched/private.txt
chmod 000 watched/private.txt
ln -s private.txt watched/private-link.txt
npm run scan -- watched --metadata --hash
npm run scan -- watched --metadata --hash --follow-symlinks
chmod 644 watched/private.txt
```

On Windows, use an equivalent restricted file or document that the permission test was skipped.

### Expected behavior

The tool reports skipped or followed symlinks based on the flag.

Unreadable files and unsupported file types appear as report entries with error codes.

### Hints

Restore permissions after the test so later phases can read the file.

### Debugging notes

- Running as a privileged user can bypass local permission tests.
- Symlink creation may require elevated privileges on Windows.
- A path can disappear after `readdir()` and before `lstat()`. Record the race.

### Checkpoint

Filesystem edge cases produce explicit skipped, followed, or error records, and the process keeps running.

### Reflection

Explain why filesystem tools need explicit policies for symlinks and permissions.

## Phase 13: Add Graceful Shutdown

### Goal

Close watchers and save cache state on `SIGINT` and `SIGTERM`.

### Why this matters

Watch tools are long-running processes. Shutdown determines whether the last batch, queue state, and cache state survive process exit.

The process should leave enough evidence for the next run to understand where it stopped.

### Build

- [ ] **Step 1: Create the shutdown module**

  **Task**: Create `src/shutdown.js` and register cleanup functions from watch mode.

  **Mechanics**: Shutdown has to coordinate resources created by several modules: native watchers, pollers, timers, queue jobs, and cache writes.

  **Hint**: A registry of cleanup functions is enough for this lab.

  **Checkpoint**: The watch session can ask the shutdown module to stop the tool.

- [ ] **Step 2: Register signal handlers**

  **Task**: Handle `SIGINT` and `SIGTERM`.

  **Mechanics**: Signals are the normal control path for stopping a watch process from a terminal or process manager.

  **Hint**: Make the handler async through a wrapper, but avoid throwing out of the signal callback.

  **Checkpoint**: Pressing `Ctrl+C` starts the shutdown path.

- [ ] **Step 3: Make shutdown idempotent**

  **Task**: Track shutdown state so a second signal takes a faster exit path.

  **Mechanics**: Users press `Ctrl+C` more than once when shutdown takes time. The second signal should have defined behavior.

  **Hint**: Use states such as `running`, `stopping`, and `forced`.

  **Checkpoint**: Two quick interrupts do not run cleanup twice.

- [ ] **Step 4: Stop event intake**

  **Task**: Stop accepting new watcher events, close every `FSWatcher`, unwatch every polling path, and clear timers.

  **Mechanics**: Shutdown should freeze the input boundary before flushing pending work. Otherwise new events can arrive while cleanup is running.

  **Hint**: Close resources from the same maps used by watch and poll setup.

  **Checkpoint**: The shutdown report includes closed watcher and poller counts.

- [ ] **Step 5: Flush or mark pending work**

  **Task**: Flush the debounce batch and decide whether active rebuild jobs finish or get marked interrupted.

  **Mechanics**: A stopped watcher should leave the next run with honest state. Active work needs a final status.

  **Hint**: Use a timeout so shutdown can finish if rebuild work stalls.

  **Checkpoint**: `pendingJobs`, `activeJobs`, and `pendingEvents` appear in `reports/shutdown.json`.

- [ ] **Step 6: Save cache and write shutdown report**

  **Task**: Save cache atomically and write `reports/shutdown.json` with reason, signal, closed resources, cache result, and duration.

  **Mechanics**: The cache and shutdown report are the handoff to the next run.

  **Hint**: Exit with the conventional signal code when shutdown came from a signal.

  **Checkpoint**: After `Ctrl+C`, the report records `signal: "SIGINT"` and `cacheSaved: true` when save succeeds.

### Run

```sh
npm run watch -- watched
```

Press `Ctrl+C`.

### Expected behavior

The process closes watchers, saves cache state, writes `reports/shutdown.json`, and exits.

### Hints

Clear debounce and polling timers. Active timers can keep the process alive after watchers close.

### Debugging notes

- Throwing inside a signal handler can skip cleanup.
- Closing a watcher twice can throw on some paths. Track closed state.
- Long rebuild jobs need a defined shutdown timeout.

### Checkpoint

After `Ctrl+C`, the shutdown report records the signal, closed watcher count, cache save result, and remaining queue state.

### Reflection

Explain why shutdown behavior is part of correctness for a persistent watcher.

## Phase 14: Generate Watch Report

### Goal

Produce a final Markdown report for a complete watch session.

### Why this matters

The lab ends with measured behavior. Raw events, logical events, batches, queue records, cache hits, misses, skipped files, and shutdown state should be visible in one report.

A final report also exposes missed work: unknown events, forced rescans, skipped paths, and rebuild failures.

### Build

- [ ] **Step 1: Create the report module**

  **Task**: Create `src/report.js` to read JSON and JSONL report artifacts.

  **Mechanics**: Report generation should consume evidence produced by the tool, not reach into watcher internals.

  **Hint**: Treat missing optional files as report notes.

  **Checkpoint**: The module can parse `scan.json`, `diff.json`, and JSONL files without crashing on absent files.

- [ ] **Step 2: Build the demo runner**

  **Task**: Implement `src/demo-watch.js` to reset a small fixture, start a controlled watch session, perform edits, simulate an atomic write, delete one file, and stop through the shutdown path.

  **Mechanics**: A demo run gives the final report repeatable input. It should exercise the features the lab built.

  **Hint**: Keep the fixture small so timing remains easy to inspect.

  **Checkpoint**: `npm run demo-watch` produces raw events, logical events, batches, rebuilds, queue records, and shutdown data.

- [ ] **Step 3: Clear stale report artifacts**

  **Task**: Clear generated watch report artifacts under `reports/` at the start of the demo run, preserving `reports/reflections.md`.

  **Mechanics**: Stale evidence can make a broken run look complete. The cleanup target is the generated watch artifact set: `scan.json`, `diff.json`, `events.jsonl`, `logical-events.json`, `batches.jsonl`, `queue.jsonl`, `rebuilds.jsonl`, `watch-state.json`, `shutdown.json`, `watch-report.md`, `watch-report.html`, and `build-output/`. Keep learner-written reflections in place.

  **Hint**: Use an allowlist of generated artifact names.

  **Checkpoint**: Running the demo twice produces a fresh `watch-report.md` each time and leaves `reports/reflections.md` intact.

- [ ] **Step 4: Generate `reports/watch-report.md`**

  **Task**: Write a Markdown report with command options, watched root, scan counts, raw event counts, logical groups, batches, rebuild jobs, queue high-water mark, cache hits and misses, skipped files, errors, recovered work, and shutdown reason.

  **Mechanics**: The report should connect low-level events to final rebuild decisions.

  **Hint**: Keep machine-readable reports beside the Markdown. The Markdown is the narrative view, not the only data.

  **Checkpoint**: The report names each major subsystem built in the lab.

- [ ] **Step 5: Add optional HTML output**

  **Task**: Optionally generate `reports/watch-report.html` from the same data.

  **Mechanics**: HTML is a presentation layer over the same evidence. It should not require a different report pipeline.

  **Hint**: Start with Markdown first. Add HTML only after the data model is stable.

  **Checkpoint**: If HTML exists, it contains the same counts as the Markdown report.

- [ ] **Step 6: Add the filesystem rule**

  **Task**: Add a final `Filesystem Rule` section with one sentence written by the learner.

  **Mechanics**: The final sentence turns the observed behavior into an operating rule for future watcher code.

  **Hint**: Base the sentence on evidence from the report, not a generic rule.

  **Checkpoint**: `reports/watch-report.md` ends with one concrete filesystem rule.

### Run

```sh
npm run demo-watch
```

### Expected behavior

`reports/watch-report.md` exists and describes the watch session from scan through shutdown.

The report names raw events, grouped events, rebuild batches, cache hits, misses, and any skipped work.

### Hints

For JSONL, split on newlines and ignore a final empty line. Timing fields should be displayed, not used as exact test assertions.

### Debugging notes

- A demo that writes into `reports/` can trigger the watcher unless reports are ignored.
- Reusing stale reports can hide bugs. Clear generated watch artifacts at the start of `demo-watch` and preserve `reports/reflections.md`.
- Markdown generation should tolerate missing optional reports and state what was absent.

### Checkpoint

`npm run demo-watch` creates `reports/watch-report.md`, and the report explains events, rebuilds, cache hits, misses, and recovered or skipped work.

### Reflection

Write the filesystem rule this lab taught you.
