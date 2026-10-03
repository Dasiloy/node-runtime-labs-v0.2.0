# Module Resolution Inspector

Build a CLI that explains Node's module resolution decisions from the caller's point of view. The finished tool accepts an importer path and a specifier, traces the lookup path, records the package metadata that changed the result, flags CJS/ESM boundary hazards, and writes reports a developer can hand to someone else.

The project works best when the fixtures stay small. Every package in `fixtures/` should exist because it triggers one resolver branch. Keep the traces readable. The goal is a focused explanation tool with scoped package cases.

## Phase 0: Create The Project

### Goal

Create the resolver inspector CLI and prove it can parse commands.

### Why this matters

Module resolution sits behind `require()`, `import`, and `import.meta.resolve()`. A failing import usually exposes the final error, while the useful information sits in the skipped paths, package fields, condition checks, and format decisions that happened earlier.

Start with the CLI contract. The rest of the lab will keep adding trace events to the same command shape.

### Build

Create a clean project shell for the inspector. By the end of the phase, the CLI should accept a command, print help, reject bad flags, and create the first report object.

#### Step 1: Create the project manifest

**Task**: Create `package.json` with `"type": "module"`, an engine range for Node v24 or newer, and scripts named `resolve`, `fixtures`, `cache`, and `inspect-package`.

**Mechanics**: The package manifest controls how Node interprets project `.js` files and gives every later phase a stable command name.

**Hint**: Keep the scripts pointed at files that may still be small stubs. The script names are the public shape of the tool.

**Checkpoint**: Opening `package.json` shows ESM mode, the Node version expectation, and the four command names the lab will keep using.

#### Step 2: Create the project folders

**Task**: Create `src/`, `src/resolver/`, `src/reports/`, `src/probes/`, `scripts/`, `fixtures/`, and `reports/`.

**Mechanics**: The resolver, report renderers, runtime probes, generated fixtures, and output artifacts each need a predictable location.

**Hint**: Give each folder one job. Source code belongs under `src/`; generated test packages belong under `fixtures/`; generated evidence belongs under `reports/`.

**Checkpoint**: A directory listing shows every folder, and you can say what belongs in each one without checking the lab text.

#### Step 3: Create the CLI entry file

**Task**: Create `src/cli.mjs` and make it dispatch the first command shape: `resolve <importer> <specifier>`.

**Mechanics**: The CLI entry is the boundary between raw process arguments and the resolver model used by the rest of the project.

**Hint**: Start with `process.argv.slice(2)`. Pull out the command first, then parse command-specific arguments.

**Checkpoint**: Running `npm run resolve -- fixtures/app/src/index.cjs pkg-main` reaches the resolve command handler and prints a pending message rather than crashing.

#### Step 4: Add help output

**Task**: Make `npm run resolve -- --help` print usage text with positional arguments and the supported flags.

**Mechanics**: Help output is part of the CLI contract. It tells the reader the command shape before the resolver logic exists.

**Hint**: Centralize help text in `src/cli.mjs` for now. Resolver modules should receive parsed options later.

**Checkpoint**: The help command exits with code `0` and prints `resolve <importer> <specifier>`.

#### Step 5: Parse the first flags

**Task**: Recognize `--mode require`, `--mode import`, `--conditions <name>`, `--format text`, `--format json`, and `--preserve-symlinks`.

**Mechanics**: These flags become resolver inputs in later phases. Parsing them now gives every phase the same option object.

**Hint**: Store conditions as an ordered array. The order will matter when conditional exports arrive.

**Checkpoint**: A debug print or JSON output shows `mode`, `conditions`, `format`, and `preserveSymlinks` with stable defaults.

#### Step 6: Reject unknown flags

**Task**: Make unknown flags print a clear error on `stderr` and exit with code `2`.

**Mechanics**: Developer tools should fail loudly when the user typed a flag the tool does not understand. Silent flag mistakes create false evidence.

**Hint**: Treat `--help` as success and unknown `--anything-else` as an argument error.

**Checkpoint**: `--help` exits `0`; a misspelled flag exits `2` and names the rejected flag.

#### Step 7: Create the first report object

**Task**: Build a report object with `importer`, `specifier`, `mode`, `conditions`, `attempts`, `warnings`, and `errors`.

**Mechanics**: The report model is the data contract between the resolver, text output, JSON output, and the final HTML report.

**Hint**: Normalize the importer to an absolute path before storing it. Keep display formatting separate from stored paths.

**Checkpoint**: `--format json` prints one object with the expected fields, even though resolution is still pending.

### Run

```sh
npm run resolve -- --help
```

```sh
npm run resolve -- fixtures/app/src/index.cjs pkg-main
```

### Expected behavior

The help command prints command usage, flags, and positional arguments. The second command accepts the importer and specifier, then prints a clear pending message until later phases implement lookup.

### Hints

Keep the parser small. At this point, the CLI only needs enough structure to reject bad input and create the first report object.

### Debugging notes

`npm run resolve -- --help` passes only the arguments after `--` to your script. Print the parsed argument object while the CLI is new.

### Checkpoint

The CLI prints help, accepts an importer path and a specifier, rejects unknown flags, and produces one report object with stable top-level fields.

### Reflection

Write down the resolution details that normal Node errors hide from the caller.

## Phase 1: Create Fixture Packages

### Goal

Generate controlled fixture packages that trigger the resolution paths this tool needs to explain.

### Why this matters

Real `node_modules` trees contain hoisted packages, generated files, transitive dependencies, build output, and package-manager-specific links. That noise makes the resolver harder to inspect.

Small fixtures give every trace a reason. One package tests `"main"`. Another tests `"exports"`. Another breaks on purpose. The resolver output should point at the fixture design and read like evidence.

### Build

Create the fixture workspace generator. The resolver needs packages with known behavior before it can explain anything useful.

#### Step 1: Create the fixture generator script

**Task**: Create `scripts/create-fixtures.mjs` and make `npm run fixtures` execute it.

**Mechanics**: Generated fixtures keep the lab repeatable. The resolver should always run against the same package shapes.

**Hint**: Let the script own only `fixtures/generated/`.

**Checkpoint**: Running `npm run fixtures` creates `fixtures/generated/`.

#### Step 2: Reset only the generated fixture root

**Task**: Make the script delete and recreate `fixtures/generated/` on each run.

**Mechanics**: Repeatable fixture generation needs a clean output root while preserving source code and reports.

**Hint**: Use recursive removal on `fixtures/generated/` only.

**Checkpoint**: Re-running the script replaces generated fixture files without touching `src/` or `reports/`.

#### Step 3: Generate the app files and inspector input

**Task**: Create `fixtures/generated/app/src/index.cjs`, `fixtures/generated/app/src/index.mjs`, `fixtures/generated/app/src/nested/consumer.cjs`, `fixtures/generated/app/node_modules/`, and `fixtures/generated/app/inspector-input.json`.

**Mechanics**: Importer location drives relative resolution and `node_modules` climbing, so the fixture app needs both top-level and nested importers.

**Hint**: Keep each importer tiny. A few `require()` or `import` statements are enough. Write `inspector-input.json` as a small list of importer/specifier pairs for the final package report, including `./local`, `./missing`, `node:fs`, `pkg-main`, `pkg-main-broken`, `pkg-exports/feature`, `pkg-exports/internal.js`, `pkg-esm`, and nested `pkg-shadow`.

**Checkpoint**: The fixture app has CJS, ESM, nested importer files, and an `inspector-input.json` file that names the traces the final inspector command will gather.

#### Step 4: Generate relative path targets

**Task**: Create `local.js`, `local.json`, `dir-entry/index.js`, and a missing-target case under the fixture app source tree.

**Mechanics**: Relative resolution tests exact file lookup, extension probing, JSON loading, directory entries, and missing path reports.

**Hint**: Put files close to the importer so path output stays readable.

**Checkpoint**: The fixture tree can test `./local`, `./local.json`, a directory entry, and a missing relative path.

#### Step 5: Generate package metadata and shadow cases

**Task**: Create app-level packages named `fs`, `pkg-main`, `pkg-main-broken`, `pkg-exports`, `pkg-exports-blocked`, `pkg-conditions`, `pkg-esm`, `pkg-cjs`, `pkg-dual`, `pkg-runtime-cjs`, and `pkg-shadow`.

**Mechanics**: Each package should isolate one resolver branch: built-in shadowing, `"main"`, invalid `"main"`, `"exports"`, blocked subpaths, invalid export targets, conditions, package `"type"`, CJS, ESM, dual package shape, and package shadowing.

**Hint**: Keep package code boring. The interesting part is the `package.json`. Give `pkg-exports-blocked` these export entries: `"./blocked": null`, `"./escape": "../outside.js"`, and `"./invalid": { "bad": true }`.

**Checkpoint**: Each package has a clear reason to exist and a small `package.json` that triggers that reason. The built-in shadow fixture lives at `fixtures/generated/app/node_modules/fs`, and the app-level `pkg-shadow` package lives at `fixtures/generated/app/node_modules/pkg-shadow`.

#### Step 6: Generate nested shadow, cache, cycle, and workspace cases

**Task**: Create the nested shadow package, plus `cache-demo`, `cycles`, and `workspace` fixture folders. The workspace folder should include a symlink from workspace app `node_modules/pkg-linked` to a workspace package when the platform permits it.

**Mechanics**: Later phases need shadowed package lookup, runtime cache evidence, circular dependency edges, and symlink identity cases.

**Hint**: Put the nested package at `fixtures/generated/app/src/nested/node_modules/pkg-shadow`. Give it the same package name as the app-level `pkg-shadow`, but different exported content so the selected copy is obvious. When symlink creation fails, record that in the manifest instead of failing the entire fixture generation.

**Checkpoint**: The generated tree includes both `pkg-shadow` copies, cache, cycle, and workspace cases, or the manifest records that the symlink case was skipped.

#### Step 7: Write a fixture manifest

**Task**: Write `fixtures/generated/fixture-manifest.json` with package names, intended success cases, intended failure cases, and symlink status.

**Mechanics**: The manifest is the fixture contract. It tells the inspector and the reader which cases are deliberate.

**Hint**: Use stable labels such as `relative`, `main`, `exports`, `conditions`, `interop`, `shadow`, `cache`, `cycles`, and `symlink`.

**Checkpoint**: Opening the manifest explains the fixture workspace without reading every generated file.

### Run

```sh
npm run fixtures
```

```sh
find fixtures/generated -maxdepth 8 -type f | sort
```

### Expected behavior

The fixture script creates the same directory tree every time. The `find` command shows deep package entries such as `pkg-main/dist/index.cjs`, `pkg-exports/dist/feature.js`, nested `pkg-shadow`, the app-level `fs` shadow package, and `app/inspector-input.json`. `fixture-manifest.json` lists the package names, entry files, success cases, failure cases, and symlink status.

### Hints

Favor small fixture packages over realistic packages. A fixture package should trigger one branch and leave a short trace.

### Debugging notes

JSON files need double quotes. A package can be valid while one of its resolver paths is intentionally broken.

### Checkpoint

The fixture workspace covers relative imports, absolute paths, built-ins, package lookup, `"main"`, `"type"`, `"exports"`, conditional exports, ESM, CJS, broken packages, cache behavior, circular dependencies, and symlinks.

### Reflection

Explain why a small fixture tree produces better resolver evidence than a real application dependency tree on the first pass.

## Phase 2: Resolve Relative And Absolute Paths

### Goal

Trace CommonJS-style resolution for `./x.js`, `../x.js`, and absolute paths.

### Why this matters

Path resolution is the smallest branch of the resolver. It still has ordering: exact path, extension probing, and directory entry checks.

Recording every attempted path turns a vague missing-module error into a list of filesystem probes. That list becomes the base trace format for package lookup later.

### Build

Implement path specifier resolution first. Keep the trace explicit enough that a missing file reads as evidence, not just failure.

#### Step 1: Create the trace helper

**Task**: Create `src/resolver/trace.mjs` with helpers for adding attempts, metadata events, warnings, and errors to the report.

**Mechanics**: A resolver explanation is a sequence of decisions. A shared trace helper keeps every branch using the same event shape.

**Hint**: Start each attempt with `path`, `kind`, `result`, and `reason`.

**Checkpoint**: One helper call can append a found or missing filesystem candidate to `report.attempts`.

#### Step 2: Classify path specifiers

**Task**: Treat specifiers starting with `./`, `../`, or `/` as path specifiers.

**Mechanics**: Specifier classification chooses the resolver branch before any filesystem checks happen.

**Hint**: Resolve relative specifiers against `path.dirname(importer)`.

**Checkpoint**: `./local`, `../x`, and an absolute path all enter the path resolver branch.

#### Step 3: Implement file probing

**Task**: For `--mode require`, try exact path, `.js`, `.json`, and `.node` candidates in order.

**Mechanics**: CommonJS extension probing is ordered. The first existing candidate wins.

**Hint**: Use one function that tests a candidate and records the result before returning.

**Checkpoint**: Resolving `./local` records the base path attempt, then selects `local.js`.

#### Step 4: Implement directory probing

**Task**: When the target is a directory, check `package.json` `"main"`, then `index.js`, `index.json`, and `index.node`.

**Mechanics**: Directory-as-module resolution is a legacy CommonJS path that still affects package and local folder loading.

**Hint**: Record package metadata events separately from file attempts.

**Checkpoint**: Resolving a directory fixture shows the directory check and the selected entry file.

#### Step 5: Report clear failure reasons

**Task**: Add failure codes such as `missing-file`, `missing-directory-entry`, `invalid-package-json`, and `invalid-main-target`.

**Mechanics**: Resolver errors become useful when they identify the exhausted branch, not only the final missing specifier.

**Hint**: Put user-facing errors in `report.errors[]` and keep low-level path checks in `report.attempts[]`.

**Checkpoint**: A missing relative path exits with code `1` and names every candidate the resolver tried.

#### Step 6: Print text and JSON traces

**Task**: Make `--format text` print one readable line per attempt and `--format json` print the full report.

**Mechanics**: Text output is for humans during the lab. JSON output becomes the input to later report renderers.

**Hint**: Do not build the text output by mutating the report. Render from the report after resolution ends.

**Checkpoint**: The same resolution run can produce human-readable text or JSON with the same underlying events.

### Run

```sh
npm run fixtures
```

```sh
npm run resolve -- fixtures/generated/app/src/index.cjs ./local
```

```sh
npm run resolve -- fixtures/generated/app/src/index.cjs ./missing
```

### Expected behavior

The successful command prints every attempted candidate until it finds `local.js`. The missing command prints exhausted candidates, records an error, and exits with code `1`.

### Hints

Use absolute paths inside the report and shorter relative paths only when rendering text.

### Debugging notes

`require('./local.js')` and `require('./local')` can produce different attempt lists when the exact file is missing.

### Checkpoint

Missing files produce clear failure reasons, and successful relative resolution records every attempted path before the selected file.

### Reflection

Explain why resolution is a search process even when the specifier looks like a single filename.

## Phase 3: Resolve Built-In Modules

### Goal

Detect built-in module specifiers before filesystem lookup.

### Why this matters

Built-ins resolve through Node's built-in module registry. A specifier such as `node:fs` or `fs` should finish before path probing and package lookup.

The inspector needs to make that early exit visible. The output should show a registry match with zero filesystem search entries.

### Build

Add the built-in branch before any path or package logic.

#### Step 1: Load Node's built-in module list

**Task**: Import `builtinModules` from `node:module`.

**Mechanics**: Node exposes the built-in registry to userland, so the inspector can use the same source of truth for names.

**Hint**: Normalize names with and without the `node:` prefix before comparing.

**Checkpoint**: The resolver can identify `fs`, `path`, `node:fs`, and `node:path` as built-ins.

#### Step 2: Add the built-in report branch

**Task**: Record built-in results with `kind: "builtin"`, the original specifier, and the canonical `node:` target.

**Mechanics**: Built-ins finish resolution without filesystem attempts, so their report shape should reflect that early return.

**Hint**: Preserve the user's spelling. `fs` and `node:fs` teach different things even when they point to the same module.

**Checkpoint**: Resolving `fs` records canonical target `node:fs`.

#### Step 3: Keep built-ins ahead of packages

**Task**: Run built-in detection before relative path and bare package classification.

**Mechanics**: Built-in names beat packages with the same bare name during normal resolution.

**Hint**: Put this branch near the top of the resolver entry point.

**Checkpoint**: A fixture package named `fs` does not affect `require('fs')`.

#### Step 4: Render the zero-search result

**Task**: Make text output say that filesystem probing and `node_modules` search were skipped because the specifier matched a built-in module.

**Mechanics**: The absence of attempts is part of the explanation.

**Hint**: Print a short built-in section instead of an empty attempt table.

**Checkpoint**: Built-in output contains no filesystem attempts and no searched `node_modules` directories.

### Run

```sh
npm run resolve -- fixtures/generated/app/src/index.cjs node:fs
```

```sh
npm run resolve -- fixtures/generated/app/src/index.cjs fs
```

### Expected behavior

The output says the specifier resolves to a built-in module. The trace contains zero filesystem attempts and zero `node_modules` search directories.

### Hints

Keep the original specifier and canonical target in the report. Both pieces explain the decision.

### Debugging notes

`builtinModules` includes some names with a `node:` prefix and many without it.

### Checkpoint

Built-ins finish through the built-in branch, and the report shows zero `node_modules` search entries.

### Reflection

Explain why built-in modules need a resolver branch separate from userland files.

## Phase 4: Resolve `node_modules` Lookup

### Goal

Walk parent directories looking for packages under `node_modules`.

### Why this matters

Bare package lookup depends on the importer's directory. Moving the same source file into a nested folder changes the search list and can change the selected package.

The resolver should show the directory climb. That is the fastest way to explain why one package copy wins over another.

### Build

Implement bare specifier lookup. The output should show every searched directory before it explains the selected package.

#### Step 1: Parse package names and subpaths

**Task**: Split bare specifiers into `packageName` and `packageSubpath`, including scoped packages such as `@scope/pkg/subpath`.

**Mechanics**: Package lookup searches for the package root first. Subpath resolution happens after that root is found.

**Hint**: Scoped packages consume two path segments for the package name.

**Checkpoint**: `pkg/feature` becomes package `pkg` and subpath `./feature`; `@scope/pkg/x` becomes package `@scope/pkg` and subpath `./x`.

#### Step 2: Generate the search directories

**Task**: Starting from `path.dirname(importer)`, walk up to the filesystem root and append `node_modules` at each level.

**Mechanics**: Node builds candidate package locations from the importer's directory upward.

**Hint**: Stop when `path.dirname(current) === current`.

**Checkpoint**: A nested importer produces a search list from the nested folder up to the root.

#### Step 3: Record every package candidate

**Task**: For each search directory, record the candidate package path and whether it exists.

**Mechanics**: Missing candidate directories are useful evidence. They explain why the resolver kept climbing.

**Hint**: Keep these records separate from file probing attempts inside a found package.

**Checkpoint**: Resolving a missing package prints all searched `node_modules` directories.

#### Step 4: Select the closest package root

**Task**: Stop at the first package directory that exists and record it as the selected package root.

**Mechanics**: The nearest package root in the climb wins. Phase 4 proves root selection. Phase 5 reads `package.json` and chooses the package entry file.

**Hint**: Add a `closest-package-wins` note when a lower package shadows an app-level package.

**Checkpoint**: A nested fixture package wins over an app-level package with the same name. The report may stop at `selectedPackageRoot` until Phase 5 adds entry-file resolution.

#### Step 5: Report package-not-found cleanly

**Task**: When no candidate exists, record a package-not-found error with the importer, package name, and search directory count.

**Mechanics**: The package-not-found case is still a complete trace. The search list is the useful part.

**Hint**: Use exit code `1`, not an argument error code.

**Checkpoint**: Missing package output includes the complete upward search list and a package-not-found error.

### Run

```sh
npm run resolve -- fixtures/generated/app/src/nested/consumer.cjs pkg-shadow
```

### Expected behavior

The output lists each searched `node_modules` directory in order. `pkg-shadow` selects `fixtures/generated/app/src/nested/node_modules/pkg-shadow` before the app-level copy. Full `"main"` and package entry behavior starts in Phase 5.

### Hints

Keep package name parsing separate from directory climbing. Those are different decisions.

### Debugging notes

Starting the climb from the importer file instead of its directory adds one invalid search level.

### Checkpoint

The closest package wins, and the report includes the full upward `node_modules` search list.

### Reflection

Explain why moving a file can change which package instance it imports.

## Phase 5: Read `package.json` Entry Fields

### Goal

Inspect `"main"`, `"type"`, and package boundaries when choosing a package entry file.

### Why this matters

Package metadata changes both the selected path and the module format attached to that path. `"main"` chooses a legacy entry. `"type"` changes how `.js` files are interpreted inside the package boundary.

The trace should show the metadata read, the field selected, and the fallback taken when a field is missing or broken.

### Build

Teach the package resolver to read metadata and explain how that metadata changed the result.

#### Step 1: Create the package metadata helper

**Task**: Create `src/resolver/package-json.mjs` with a helper that reads and parses `package.json`.

**Mechanics**: Package metadata is resolver input. Parse errors and missing fields need reportable outcomes.

**Hint**: Return both the parsed object and the file path that supplied it.

**Checkpoint**: Valid package JSON produces a metadata event with `packageRoot` and `packageJsonPath`.

#### Step 2: Resolve the `"main"` field

**Task**: When `"exports"` is absent, resolve `"main"` relative to the package root.

**Mechanics**: `"main"` is the legacy package entry field for package root access.

**Hint**: Feed the `"main"` target through the same file and directory probing code used for relative paths.

**Checkpoint**: `pkg-main` resolves through `"main": "./dist/index.cjs"`.

#### Step 3: Add legacy index fallback

**Task**: When `"main"` is missing or invalid, try package root `index.js`, `index.json`, then `index.node`.

**Mechanics**: CommonJS keeps compatibility fallback behavior for older package shapes.

**Hint**: Record `invalid-main-target` before recording the fallback candidate that succeeds.

**Checkpoint**: `pkg-main-broken` records the broken main target and then selects `index.js`.

#### Step 4: Track package boundaries

**Task**: Store `packageRoot`, `packageName`, `packageType`, and `entryField` on the report.

**Mechanics**: Later phases need package boundary data for format detection, interop warnings, and symlink identity.

**Hint**: Attach boundary data after a package root is selected, before file format is decided.

**Checkpoint**: Package reports show the selected package root and the field that chose the entry file.

#### Step 5: Detect selected module format

**Task**: Use `.mjs`, `.cjs`, and nearest package `"type"` to classify the selected file as ESM or CJS.

**Mechanics**: Resolution chooses a location. Format detection decides which loader contract applies to that location.

**Hint**: `.mjs` and `.cjs` override package `"type"`. `.js` follows the nearest package boundary.

**Checkpoint**: `pkg-esm` reports ESM format for `.js` files inside a `"type": "module"` package.

#### Step 6: Render metadata decisions

**Task**: Print package metadata events in the text trace beside filesystem attempts.

**Mechanics**: A selected file is easier to trust when the report shows the package fields that selected it.

**Hint**: Use short labels such as `package.json`, `main`, `type`, and `fallback`.

**Checkpoint**: Text output explains why the package entry file was selected and which format it has.

### Run

```sh
npm run resolve -- fixtures/generated/app/src/index.cjs pkg-main
```

```sh
npm run resolve -- fixtures/generated/app/src/index.cjs pkg-main-broken
```

```sh
npm run resolve -- fixtures/generated/app/src/index.cjs pkg-esm
```

### Expected behavior

`pkg-main` resolves through its `"main"` field. `pkg-main-broken` records the broken `"main"` target and then falls back to `index.js`. `pkg-esm` reports ESM format for `.js` files inside a `"type": "module"` package.

### Hints

Keep path selection and format classification as separate report fields.

### Debugging notes

Node ignores bundler-only fields such as `"module"` for normal runtime resolution.

### Checkpoint

The report explains why the package entry file was selected, how fallback worked, and how `"type": "module"` changes `.js` interpretation inside the package.

### Reflection

Explain how package metadata changes resolution and format as separate decisions.

## Phase 6: Implement `exports` Resolution Explanation

### Goal

Trace package `"exports"` for main entries, subpath exports, blocked deep imports, and fallback errors.

### Why this matters

`"exports"` is a package boundary. Once present, package-name access goes through the export map. Listed subpaths are visible. Omitted subpaths are blocked through package specifiers.

The inspector needs to show the matched rule instead of only reporting the final selected file or error.

### Build

Add the export-map branch. Keep it narrow: direct targets, direct subpaths, null blocks, and invalid targets.

#### Step 1: Detect `"exports"` before `"main"`

**Task**: When a package has `"exports"`, route package-name resolution through the export map before checking `"main"`.

**Mechanics**: `"exports"` takes precedence for package specifiers.

**Hint**: Keep the legacy `"main"` resolver available for packages that lack `"exports"`.

**Checkpoint**: A package with both fields uses `"exports"` for `pkg` and `pkg/subpath`.

#### Step 2: Normalize export subpaths

**Task**: Convert package root access to `"."` and `pkg/feature` to `"./feature"`.

**Mechanics**: Export maps use normalized subpath keys, not the raw specifier string.

**Hint**: Normalize once and store the normalized subpath in the report.

**Checkpoint**: Text output shows the requested package subpath and the normalized export key.

#### Step 3: Support simple targets

**Task**: Handle `"exports": "./dist/index.js"` and `"exports": { ".": "./dist/index.js" }`.

**Mechanics**: A string export target maps a public package entry to a package-root-relative file.

**Hint**: Resolve export targets relative to the package root.

**Checkpoint**: `pkg-exports` resolves through a selected export target.

#### Step 4: Support direct subpath exports

**Task**: Handle entries such as `"./feature": "./dist/feature.js"`.

**Mechanics**: Subpath exports define the public package surface beyond the root entry.

**Hint**: Match the normalized subpath exactly before trying fallback behavior.

**Checkpoint**: `pkg-exports/feature` reports matched key `"./feature"` and selected target `"./dist/feature.js"`.

#### Step 5: Explain blocked deep imports

**Task**: Report `ERR_PACKAGE_PATH_NOT_EXPORTED` when a requested package subpath is absent or mapped to `null`.

**Mechanics**: The file may exist on disk, but package-name resolution only sees exported subpaths.

**Hint**: Include `packageRoot`, `requestedSubpath`, and `availableExports` in the error evidence.

**Checkpoint**: `pkg-exports/internal.js` fails with a blocked-subpath explanation.

#### Step 6: Validate export targets

**Task**: Reject export targets that escape the package root or use invalid target shapes.

**Mechanics**: Export targets are constrained package-root-relative mappings.

**Hint**: Check for targets that start with `"./"` and stay inside the package root after path normalization.

**Checkpoint**: An invalid target produces an export-target error instead of a selected file.

### Run

```sh
npm run resolve -- fixtures/generated/app/src/index.cjs pkg-exports
```

```sh
npm run resolve -- fixtures/generated/app/src/index.cjs pkg-exports/feature
```

```sh
npm run resolve -- fixtures/generated/app/src/index.cjs pkg-exports/internal.js
```

```sh
npm run resolve -- fixtures/generated/app/src/index.cjs pkg-exports-blocked/escape
```

```sh
npm run resolve -- fixtures/generated/app/src/index.cjs pkg-exports-blocked/invalid
```

### Expected behavior

The root package and exported subpath resolve through matched export rules. The blocked deep import reports the package root, the requested subpath, and the reason the file stays hidden through package-name resolution. The invalid export target runs fail with export-target errors and leave `resolvedPath` unset.

### Hints

Treat export targets as package-root-relative paths and export keys as package public names.

### Debugging notes

A package with `"exports"` and `"main"` uses `"exports"` for package-name access.

### Checkpoint

Exported paths resolve with a matched rule, and blocked paths produce a helpful explanation with the requested subpath and package root.

### Reflection

Explain why `"exports"` can intentionally hide files that exist on disk.

## Phase 7: Add Conditional Exports

### Goal

Explain condition matching in package `"exports"`.

### Why this matters

Conditional exports let the same package expose different files for `import`, `require`, `node`, `development`, and other condition names. The object order decides which matching branch wins.

A resolver report should display both the active condition set and the order of branch checks. Without that order, the selected file can look arbitrary.

### Build

Add condition matching to the export-map resolver and show every checked branch.

#### Step 1: Build the active condition set

**Task**: For `--mode require`, use `node`, `require`, `module-sync`, and `default`. For `--mode import`, use `node`, `import`, and `default`.

**Mechanics**: The resolver mode changes which condition names are active.

**Hint**: Keep the active condition set in report order so it can be printed before branch checks.

**Checkpoint**: A require-mode report and an import-mode report show different active condition sets.

#### Step 2: Add custom conditions

**Task**: Support repeated `--conditions <name>` flags and include those names in the active set before `default`.

**Mechanics**: Custom conditions only matter when the package export map contains matching keys.

**Hint**: Preserve the order from the command line.

**Checkpoint**: `--conditions development` makes `development` active in the report.

#### Step 3: Evaluate condition objects in order

**Task**: Walk condition object entries in insertion order and select the first active branch with a valid target.

**Mechanics**: Conditional exports use object order. The first matching key wins.

**Hint**: Use `Object.entries()` and record every key as matched or skipped.

**Checkpoint**: Moving a condition earlier in the fixture changes the selected branch.

#### Step 4: Support nested condition objects

**Task**: If a matched branch contains another condition object, evaluate that nested object with the same active condition set.

**Mechanics**: Nested conditions let packages combine environment and consumer mode decisions.

**Hint**: Reuse the same resolver function for nested objects and keep a path such as `["node", "import"]` in the report.

**Checkpoint**: A nested fixture branch records both the outer and inner condition checks.

#### Step 5: Render branch evidence

**Task**: Print active conditions, skipped branches, matched branch, and selected target in text output.

**Mechanics**: Condition order is the explanation. The final target alone hides the decision.

**Hint**: Mark skipped branches as `inactive-condition`.

**Checkpoint**: Changing `--conditions development` changes output when the fixture exposes that condition.

### Run

```sh
npm run resolve -- fixtures/generated/app/src/index.cjs pkg-conditions
```

```sh
npm run resolve -- fixtures/generated/app/src/index.cjs pkg-conditions --conditions development
```

```sh
npm run resolve -- fixtures/generated/app/src/index.mjs pkg-conditions --mode import
```

### Expected behavior

The default `require` run selects the branch exposed for require or node according to fixture order. Adding `--conditions development` selects the development branch when that branch appears first. `--mode import` selects the import branch when the package exposes one.

### Hints

The condition object is already ordered JavaScript data. Do not sort its keys.

### Debugging notes

Placing `default` before `require` in a fixture means `require` loses.

### Checkpoint

Changing conditions changes resolution when the package exposes matching branches, and the report shows condition order plus the selected target.

### Reflection

Explain why condition order matters more than a simple priority list.

## Phase 8: Add ESM Resolution Mode

### Goal

Compare CJS-style and ESM-style resolution with `--mode require` and `--mode import`.

### Why this matters

CommonJS and ESM resolve the same specifier through different contracts in several places. Relative ESM imports require explicit file extensions. Package `"exports"` selects different conditions. Format rules affect which loader will handle the resolved file.

The inspector should show these differences side by side while keeping each mode's contract explicit.

### Build

Add ESM-mode resolution for the fixture cases, then build comparison output from two normal reports.

#### Step 1: Keep mode-specific resolver paths

**Task**: Route `--mode require` to the existing CommonJS-style resolver and `--mode import` to a new ESM-style resolver path.

**Mechanics**: CJS and ESM resolution share some package work, but their relative path contracts differ.

**Hint**: Share helpers for package lookup and package metadata. Split behavior at the mode boundary.

**Checkpoint**: The report always states which mode produced the result.

#### Step 2: Use URL results in import mode

**Task**: Return `node:` URLs for built-ins and `file://` URLs for file-backed ESM-mode results.

**Mechanics**: ESM identity is URL-based, so the final result should use URL spelling.

**Hint**: Use `pathToFileURL()` after filesystem resolution selects a concrete file.

**Checkpoint**: Import-mode output shows `file://` for local files and `node:fs` for built-ins.

#### Step 3: Enforce ESM relative path rules

**Task**: In import mode, make extensionless relative file specifiers and directory imports fail with specific explanations.

**Mechanics**: ESM does not use CommonJS extension probing for relative file imports.

**Hint**: Check for an explicit extension before calling the CommonJS-style file probe helpers.

**Checkpoint**: `./local` fails in import mode, while `./local.js` resolves.

#### Step 4: Apply import conditions for packages

**Task**: Use the import-mode condition set for package `"exports"` resolution.

**Mechanics**: The same package can select different files for import and require.

**Hint**: Reuse the Phase 7 condition evaluator with a different active condition set.

**Checkpoint**: A package with separate import and require branches selects the import target in import mode.

#### Step 5: Add mode comparison

**Task**: Add `--compare-modes` to run require mode and import mode for one importer/specifier pair and render a compact diff.

**Mechanics**: Comparison is easier to trust when both sides are normal resolver reports.

**Hint**: Store differences such as `extension-required`, `directory-import-unsupported`, `condition-branch-differs`, and `format-differs`.

**Checkpoint**: Comparing `pkg-conditions` shows selected targets for both modes and names any differences.

### Run

```sh
npm run resolve -- fixtures/generated/app/src/index.mjs ./local --mode import
```

```sh
npm run resolve -- fixtures/generated/app/src/index.mjs ./local.js --mode import
```

```sh
npm run resolve -- fixtures/generated/app/src/index.cjs pkg-conditions --compare-modes
```

### Expected behavior

The extensionless relative import fails in import mode with an `extension-required` explanation. The explicit `.js` path resolves. The comparison command prints the selected target for each mode and calls out any condition or format difference.

### Hints

Build comparison from two complete reports. Avoid a third resolver path for compare mode.

### Debugging notes

`import.meta.resolve()` can help sanity-check some package results, but it returns only the final URL. The trace remains tool-owned.

### Checkpoint

The same specifier can be resolved in require and import modes, and differences in extension rules, package rules, and format are reported clearly.

### Reflection

Explain why ESM resolution is stricter for relative files.

## Phase 9: Detect CJS/ESM Interop Hazards

### Goal

Warn when a package shape is likely to confuse CJS or ESM consumers.

### Why this matters

Interop problems usually come from a mismatch between the consumer syntax and the target module shape. A package can resolve cleanly and still surprise the caller with a namespace object, missing named export, duplicated state, or a top-level-await boundary.

The inspector should separate resolution success from consumption risk.

### Build

Add warnings that explain risky consumer and target combinations. Warnings should never replace resolver errors.

#### Step 1: Define the warning record shape

**Task**: Add `warnings[]` records with `type`, `evidence`, and `suggestion`.

**Mechanics**: A warning needs proof and a fix path. A label alone is too vague for a devtool.

**Hint**: Evidence should come from the selected file, package fields, active conditions, or fixture source text.

**Checkpoint**: Every warning in JSON output has `type`, `evidence`, and `suggestion`.

#### Step 2: Add consumer-shape flags

**Task**: Support `--consumer-format cjs`, `--consumer-format esm`, and `--imported-name <name>`.

**Mechanics**: Interop risk depends on how the consumer plans to load the resolved target.

**Hint**: Default `consumerFormat` from `--mode`, then let explicit flags override it.

**Checkpoint**: The report records the consumer format and requested imported name.

#### Step 3: Warn for named import from CJS

**Task**: When ESM consumers request a named import from a CJS target, inspect the fixture's export shape and warn when extraction is risky.

**Mechanics**: Named import extraction from CJS is static. Runtime-built export names can be invisible to ESM named imports.

**Hint**: A tiny classifier is enough: direct `exports.name =` is friendly; computed or loop-built exports are risky.

**Checkpoint**: `pkg-runtime-cjs` warns for `--imported-name get`.

#### Step 4: Warn for require of ESM

**Task**: When CJS consumers require an ESM target, warn about namespace shape and top-level await risk.

**Mechanics**: Node v24 can require synchronous ESM in supported cases, but the returned value follows ESM namespace rules.

**Hint**: Use the selected format and package metadata as evidence.

**Checkpoint**: `pkg-esm` in require mode emits an interop warning without changing the resolution result.

#### Step 5: Detect dual package splits

**Task**: In compare mode, warn when require and import select different files for the same package.

**Mechanics**: Separate CJS and ESM entry files can create separate module instances and state.

**Hint**: Compare `resolved` and `format` across the two mode reports.

**Checkpoint**: `pkg-dual --compare-modes` reports the separate selected files.

#### Step 6: Warn on conditional format mismatch

**Task**: Detect condition branches that select different formats for different consumers.

**Mechanics**: Conditional exports can make package behavior depend on consumer mode and custom conditions.

**Hint**: Include the matched condition path for each mode in the evidence.

**Checkpoint**: A conditional fixture that routes require to CJS and import to ESM produces a condition-mismatch warning.

### Run

```sh
npm run resolve -- fixtures/generated/app/src/index.mjs pkg-runtime-cjs --mode import --imported-name get
```

```sh
npm run resolve -- fixtures/generated/app/src/index.cjs pkg-esm --mode require
```

```sh
npm run resolve -- fixtures/generated/app/src/index.cjs pkg-dual --compare-modes
```

### Expected behavior

The runtime-built CJS package warns that named import extraction can fail. Requiring the ESM fixture warns about ESM namespace shape and top-level await risk. The dual package fixture reports that `require` and `import` select different files.

### Hints

Keep warnings advisory. Preserve successful resolution status when warnings are present.

### Debugging notes

Named import extraction from CJS is static. Runtime-created export names can be invisible to ESM named imports.

### Checkpoint

Every warning includes `type`, `evidence`, and `suggestion`, and interop hazards stay separate from resolver errors.

### Reflection

Explain why interop problems involve resolution, format, evaluation timing, and exported value shape.

## Phase 10: Visualize `require.cache`

### Goal

Run a fixture script and show which CommonJS modules were loaded and cached.

### Why this matters

CommonJS caching explains shared module state, repeated `require()` behavior, and many circular dependency symptoms. The cache lives inside the process that loaded the modules, so the inspector has to observe a child process from inside that process.

The tool now crosses from static resolution into runtime observation.

### Build

Add a runtime probe that records `require.cache` from inside the child process running the fixture.

#### Step 1: Create the cache preload

**Task**: Create `src/probes/cache-probe.cjs`.

**Mechanics**: A preload runs inside the observed child process, so it can read that process's `require.cache`.

**Hint**: Use CommonJS for the preload because it needs direct access to `require.cache`.

**Checkpoint**: Running Node with `--require ./src/probes/cache-probe.cjs` loads the probe before the entry file.

#### Step 2: Spawn the fixture with the preload

**Task**: Make `npm run cache -- <entry>` spawn `node --require ./src/probes/cache-probe.cjs <entry>`.

**Mechanics**: The parent CLI process controls execution, while the child process owns the cache being inspected.

**Hint**: Pass the output report path through `MODULE_INSPECTOR_CACHE_REPORT`.

**Checkpoint**: The fixture still runs, and the parent CLI preserves the child exit code.

#### Step 3: Capture cache entries on exit

**Task**: In the preload, write each cache entry's `id`, `filename`, `loaded`, and `children` during `process.on('exit')`.

**Mechanics**: The exit event gives the probe one final synchronous chance to write cache evidence.

**Hint**: Use synchronous file writes inside the exit handler.

**Checkpoint**: A JSON cache report appears under `reports/` after the fixture exits.

#### Step 4: Record load events

**Task**: Wrap `Module._load` inside the preload and record each load request before delegating to the original loader.

**Mechanics**: The final cache tells you which modules remained cached at process exit. The loader hook gives you each request event, including repeated requests that returned an existing cached module.

**Hint**: Save the original `Module._load`. For each call, record `request`, `parent?.filename`, the result of `Module._resolveFilename(request, parent, isMain)`, and whether `Module._cache[resolved]` existed before the load. Store these as `loadEvents[]` in the cache report.

**Checkpoint**: Requiring the same file more than once creates multiple `loadEvents[]` rows for one resolved filename, and later rows show `cacheHitBefore: true`.

#### Step 5: Build a loaded module tree

**Task**: Convert `require.cache` entries and child links into a tree or edge list for text output.

**Mechanics**: Child links show which module required which dependency.

**Hint**: Filter out tool probe files after building the graph.

**Checkpoint**: Text output starts at the fixture entry and shows loaded child modules.

#### Step 6: Mark repeated requires as cache hits

**Task**: Count repeated requests for the same resolved filename and mark shared entries in the output.

**Mechanics**: Repeated `require()` returns the same cached module instance for the same resolved filename. Derive request counts and cache-hit labels from `loadEvents[]`, then use the exit-time cache entries to show the final module graph.

**Hint**: The fixture can require the same `shared.cjs` file from multiple places.

**Checkpoint**: Repeated requires show one cache entry and multiple incoming edges or request counts.

### Run

```sh
npm run cache -- fixtures/generated/cache-demo/index.cjs
```

### Expected behavior

The command runs the fixture script, writes a cache report under `reports/`, and prints a loaded module tree. Repeated `require()` calls for the same file show one cache entry and multiple `loadEvents[]` rows, multiple incoming edges, or request counts.

### Hints

Inspecting `require.cache` in the parent CLI process shows the CLI's modules. The fixture app's cache lives in the child process. Exit-time `require.cache` state gives final entries and child edges; repeated request counts come from the `Module._load` events captured before exit.

### Debugging notes

`process.on('exit')` must use synchronous filesystem writes.

### Checkpoint

Repeated requires reuse the same module entry, and the report shows the cached module identity shared by each caller.

### Reflection

Explain why module cache creates shared state across CommonJS consumers.

## Phase 11: Detect Circular Dependencies

### Goal

Find cycles in loaded or scanned CommonJS modules.

### Why this matters

Circular dependencies happen when module evaluation reaches a module that is already in the loading path. CommonJS returns the current `exports` object at that point, even when the exporting module has more code left to run.

Cycle detection turns that runtime condition into a graph path a developer can read.

### Build

Use the cache graph from Phase 10 as the input for cycle detection.

#### Step 1: Normalize cache entries into graph nodes

**Task**: Convert each cache entry into a graph node with `id`, `filename`, and `loaded`.

**Mechanics**: Cycle detection needs stable node ids, and `require.cache` already keys modules by resolved filenames.

**Hint**: Use the same absolute path spelling for nodes and child references.

**Checkpoint**: The JSON report contains `graph.nodes[]`.

#### Step 2: Normalize child links into graph edges

**Task**: Convert `module.children` into `graph.edges[]` with `from` and `to`.

**Mechanics**: Edges describe the require relationship between modules.

**Hint**: Keep edges even when the display later filters probe files.

**Checkpoint**: The JSON report contains edges from the entry module to its direct dependencies.

#### Step 3: Run cycle detection

**Task**: Add a DFS-based detector that records paths returning to an active ancestor.

**Mechanics**: A cycle is a path that reaches a module already in the current traversal stack.

**Hint**: Use a `visited` set and a separate recursion-stack set.

**Checkpoint**: The circular fixture produces at least one cycle path.

#### Step 4: Record cycle evidence

**Task**: Store each cycle as an ordered path and include the edge that closed the cycle.

**Mechanics**: The reader needs to see which files participate and where the loop closed.

**Hint**: Canonicalize cycle paths so the same cycle appears once.

**Checkpoint**: The report contains `cycles[]` with a readable path such as `a.cjs -> b.cjs -> a.cjs`.

#### Step 5: Explain partial exports in output

**Task**: When a cycle is found, print the final loaded state for each participant and attach any partial-load observation captured by the preload.

**Mechanics**: Partially initialized exports show up during `Module._load`, when the resolved module already exists in `Module._cache` with `loaded === false`. By process exit, the same module usually has `loaded: true`, so final cache state gives the graph while load events give the partial-export evidence.

**Hint**: In the Phase 10 loader wrapper, record a `partialObservations[]` row whenever `Module._cache[resolved]` exists and `loaded` is false before calling the original loader. The cycle fixture should export a value before requiring the other participant so the returned partial `exports` object has visible content.

**Checkpoint**: Text output names the cycle participants, shows their final `loaded` state, and identifies which module was still loading during the recorded load event.

### Run

```sh
npm run cache -- fixtures/generated/cycles/a.cjs
```

```sh
npm run cache -- fixtures/generated/cycles/a.cjs --format json
```

### Expected behavior

The text output prints the cycle path. The JSON output includes `graph.nodes`, `graph.edges`, `cycles[]`, and any `partialObservations[]`. The report identifies which modules participate in the cycle, which edge closed it, and which load event saw a module before evaluation finished.

### Hints

A graph can contain shared children across parent edge lists. A cycle requires a path that returns to an active ancestor.

### Debugging notes

Inspect a fresh child process per run. Old cache entries make graph evidence confusing.

### Checkpoint

The cycle path is printed, and the report explains which modules participate in the circular dependency.

### Reflection

Explain why partially initialized exports happen during a CommonJS cycle.

## Phase 12: Inspect Symlink And Workspace Behavior

### Goal

Show how symlinks affect package identity and resolved paths.

### Why this matters

Workspace package managers often connect packages through symlink-like filesystem entries. Node normally resolves real paths for CommonJS cache identity, while preserve-symlink flags keep the symlink spelling in key places.

The inspector should show both spellings: the path used in the package lookup and the real path used for identity.

### Build

Add symlink identity fields to resolver and cache reports.

#### Step 1: Verify the symlink fixture

**Task**: Read the fixture manifest and confirm whether `pkg-linked` symlink creation succeeded.

**Mechanics**: Symlink support varies by platform, so the resolver needs a clean skip path.

**Hint**: Treat a skipped symlink fixture as a note, not a resolver failure.

**Checkpoint**: The report can say whether the symlink case is available.

#### Step 2: Record lookup path and real path

**Task**: For every selected file, store `packageLookupPath`, `resolvedPath`, and `realPath`.

**Mechanics**: Package lookup may use the symlink spelling, while identity often uses the real filesystem target.

**Hint**: Call `fs.realpathSync.native()` only after a concrete file exists.

**Checkpoint**: The symlink package report shows both symlink and realpath spellings.

#### Step 3: Add `--preserve-symlinks`

**Task**: Make the resolver option change the identity path recorded in the report.

**Mechanics**: Preserve-symlink mode changes how Node treats symlink spelling for imported modules.

**Hint**: Keep the lookup path separate from `cacheIdentityPath`.

**Checkpoint**: Running with and without `--preserve-symlinks` produces different identity notes when the symlink fixture exists.

#### Step 4: Add symlink notes

**Task**: Add report notes when `resolvedPath` differs from `realPath`, when two specifiers share a real path, or when preserve-symlink mode changes identity.

**Mechanics**: Symlink behavior becomes easier to understand when the report states the exact path comparison.

**Hint**: Normalize paths before comparing them.

**Checkpoint**: The report contains a `symlinks[]` section with path evidence.

#### Step 5: Extend cache mode

**Task**: Add a cache command option that spawns Node with `--preserve-symlinks` for comparison.

**Mechanics**: Runtime cache identity can change when Node preserves symlink spelling.

**Hint**: Keep child process flags in the cache report metadata.

**Checkpoint**: Cache reports show whether preserve-symlinks mode was active.

### Run

```sh
npm run resolve -- fixtures/generated/workspace/app/src/index.cjs pkg-linked
```

```sh
npm run resolve -- fixtures/generated/workspace/app/src/index.cjs pkg-linked --preserve-symlinks
```

### Expected behavior

The first report shows the symlink path used during package lookup and the real path used for identity. The preserve-symlinks report keeps the symlink spelling where that mode applies. Both reports include a symlink note.

### Hints

Lookup path and identity path answer different questions. Store both.

### Debugging notes

Symlink behavior differs between the entry module and imported modules. Node has separate flags for main and non-main paths.

### Checkpoint

The report includes symlink resolution notes, lookup path, real path, and identity path for the selected package.

### Reflection

Explain why package identity can surprise monorepo users.

## Phase 13: Generate HTML And Markdown Reports

### Goal

Turn traces into readable HTML and Markdown reports.

### Why this matters

The CLI output is good for one command. A finished devtool needs reports that collect traces, warnings, graph data, and a timeline in one place.

Reports also force the internal data model to settle. When a report explanation reads poorly, the trace schema usually needs another field.

### Build

Build final reports from the same JSON model used by the CLI.

#### Step 1: Create report renderer modules

**Task**: Create `src/reports/html.mjs` and `src/reports/markdown.mjs`.

**Mechanics**: Renderers should consume report data. They should not rerun resolution or mutate traces.

**Hint**: Give each renderer one function that accepts the package report model and returns a string.

**Checkpoint**: Both modules can render a tiny fake report in isolation.

#### Step 2: Add the inspect-package command

**Task**: Implement `npm run inspect-package -- fixtures/generated/app`.

**Mechanics**: Package inspection runs many resolver traces and combines them into one report.

**Hint**: Read the trace list from the `fixtures/generated/app/inspector-input.json` file created by the fixture generator. That keeps this phase focused on aggregation and rendering; source scanning can wait for a later extension.

**Checkpoint**: The command gathers multiple importer/specifier pairs from the fixture app, including successful traces and the deliberate broken cases from the input file.

#### Step 3: Build the package report model

**Task**: Create a model with `summary`, `traces[]`, `warnings[]`, `errors[]`, `graph`, `cycles[]`, `timeline[]`, and `symlinks[]`.

**Mechanics**: The final report should combine static resolution, runtime cache evidence, graph edges, and advisory warnings.

**Hint**: Add a timeline event whenever the resolver classifies a specifier, reads package metadata, selects a branch, emits a warning, or fails.

**Checkpoint**: `reports/module-inspector.json` contains all report sections, even when some arrays are empty.

#### Step 4: Render Markdown

**Task**: Write `reports/module-inspector.md` with summary, traces, warnings, graph edges, cycles, and symlink notes.

**Mechanics**: Markdown is the terminal-friendly artifact. It should be readable in an editor without the app UI.

**Hint**: Use stable trace ids so summary rows can point to trace detail sections.

**Checkpoint**: Opening the Markdown report shows every trace and warning from the JSON model.

#### Step 5: Render self-contained HTML

**Task**: Write `reports/module-inspector.html` with inline CSS and escaped file paths, package names, and error messages.

**Mechanics**: HTML is the shareable report. Escaping protects the report from filesystem-derived strings.

**Hint**: Build sections for summary, trace timeline, attempted paths, package rules, condition checks, warnings, graph, cycles, and symlinks.

**Checkpoint**: The HTML file opens cleanly in a browser and contains the same evidence as the JSON report.

#### Step 6: Keep failed traces in the report

**Task**: Make broken fixtures appear as report errors while the `inspect-package` command continues.

**Mechanics**: A diagnostic report should collect failures instead of stopping at the first broken import.

**Hint**: Catch per-trace failures and append them to `errors[]` with the importer and specifier.

**Checkpoint**: Blocked exports and missing files appear in the report as errors, and successful traces still render.

### Run

```sh
npm run inspect-package -- fixtures/generated/app
```

```sh
ls reports
```

### Expected behavior

`reports/module-inspector.html` opens cleanly in a browser. The Markdown report is readable in a terminal or editor. The JSON report contains the same data the renderers used.

### Hints

Render from JSON. Text, Markdown, and HTML should be different views over the same model.

### Debugging notes

HTML escaping matters because file paths and package names come from the filesystem.

### Checkpoint

The report includes traces, warnings, graph data, cycle results, symlink notes, and a summary. `module-inspector.html`, `module-inspector.md`, and `module-inspector.json` are all generated from the same model.

### Reflection

Write the module resolution rule this lab taught you, using one concrete trace from your report as evidence.
