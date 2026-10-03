# NodeBook Runtime Labs

Thank you for purchasing the Labs Bundle. Please follow the steps outlined in this document.

This is a browser-based lab workspace for advanced Node.js runtime practice.

It contains seven phase-based labs from _[NodeBook](https://thenodebook.com)_. Each lab asks you to build a real local tool with Node.js core APIs ie. child processes, buffers, binary files, streams, module resolution, file watching, async orchestration, TCP sockets, backpressure, cancellation, persistence, and runtime reporting.

There are 7 labs, 7 challenges, and 102 phases. 3 more labs will be added soon. You'll get an email notification about it.

## Quick Start

Use Node.js 24 or newer.

From this directory:

```sh
node labs
```

Then open:

```txt
http://127.0.0.1:3217
```

That is the main lab interface. Pick a lab, work through the phases, and mark progress as you go. I recommend starting from the Lab 1, take your time, and complete it before moving to the next lab. The labs are very challenging, but you'll learn a ton of stuff!

You can also run the same app through npm:

```sh
npm run labs
```

No package install step is required. The project uses Node.js core modules only.

## Recommended Learner Flow

For the labs, I recommend not looking up anything inside the `solution/` directory, unless you're really stuck. The solutions/ folder has folders for each labs, and the completed solution for every phase inside that lab. If you ever feel stuck, don't worry you have the solutions handy. If still confused/stuck, feel free to contact me at **ish@thenodebook.com**. 

Start with the `labs/` folder, run `node labs`, and work through the lab interface. The solution package is there for review, comparison, and unblocking after you've attempted the phases. Treat it as reference material, not as the starting point.

## What Is Included

```txt
.
├── README.md
├── package.json
├── labs.js
├── index.html
├── labs/
│   ├── 01-node-runtime-flight-recorder/
│   ├── 02-binary-file-store-append-only-log-database/
│   ├── 03-stream-processing-workbench/
│   ├── 04-module-resolution-inspector/
│   ├── 05-atomic-file-watcher-incremental-build-cache/
│   ├── 06-async-task-runtime-local-job-orchestrator/
│   └── 07-custom-binary-protocol-gateway/
└── solution/          
```

`labs/` is the learner-facing curriculum. Each lab has a `lab.config.json`, a `challenges/main.md` file, and any starter fixtures needed for the exercise.

`labs.js` is the local server. It discovers labs from `labs/*/lab.config.json`, serves the browser UI, tracks progress, and validates lab structure.

`index.html` is the browser interface. It talks to the local server and renders the labs, phases, progress controls, and challenge text.

`solution/` contains completed reference work for the labs and phases. 

## Lab Inventory

### 01. Node Runtime Flight Recorder

Build a CLI that runs another Node program and records what the process did: memory, CPU, event loop delay, handles, warnings, crashes, stdio, signals, and exit behavior.

Phases: 15  
Difficulty: 9/10

### 02. Binary File Store / Append-Only Log Database

Build a tiny local database with binary records, append-only storage, indexes, checksums, crash recovery, tombstones, and compaction.

Phases: 14  
Difficulty: 9/10

### 03. Stream Processing Workbench

Build a controlled stream processing workbench for experimenting with NDJSON data, source adapters, transforms, backpressure, compression, cancellation, and memory.

Phases: 14  
Difficulty: 8.5/10

### 04. Module Resolution Inspector

Build a CLI that explains how Node resolved a specifier, why it picked a file, which package rules applied, and where CJS/ESM interop can break.

Phases: 14  
Difficulty: 8/10

### 05. Atomic File Watcher + Incremental Build Cache

Build a watch-mode CLI that scans files, tracks metadata and hashes, handles atomic writes, debounces rebuilds, and persists an incremental build cache.

Phases: 15  
Difficulty: 8.5/10

### 06. Async Task Runtime / Local Job Orchestrator

Build a local task runner with concurrency limits, retries, timeouts, cancellation, progress events, persistence, and graceful shutdown.

Phases: 14  
Difficulty: 8/10

### 07. Custom Binary Protocol Gateway

Build a TCP server that accepts a custom binary protocol, parses partial packets, validates frames, handles malformed input, applies backpressure, and forwards normalized events to files or HTTP.

Phases: 16  
Difficulty: 9.5/10

## Progress

Progress is stored locally in:

```txt
.nodebook-lab-progress.json
```

That file is created when the local UI updates progress. It can be deleted if you want a clean run.

## Validation

Validate the lab package:

```sh
node labs --check
```

Expected result:

```txt
Validated 7 labs, 7 challenges, 102 phases.
```

Validate one lab by number, slug, or folder id:

```sh
node labs --check 04
node labs --check module-resolution-inspector
node labs --check 04-module-resolution-inspector
```

## Running On Another Port

The default address is:

```txt
http://127.0.0.1:3217
```

If that port is already in use:

```sh
PORT=3218 node labs
```

Good luck.
