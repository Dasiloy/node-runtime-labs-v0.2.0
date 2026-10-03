# Binary File Store / Append-Only Log Database

Build a tiny local database that stores binary records in an append-only segment file. The finished project has a CLI, a documented file format, direct lookups through an index, corruption detection, recovery from truncated writes, tombstones, compaction, and reports that make the storage behavior visible.

Keep the project dependency-light. Node v24 has the Buffer and file system APIs needed here. A test runner, `node:zlib.crc32()`, `node:crypto` for fixture generation, and `node:perf_hooks` for timing are enough.

## Phase 0: Create The Project

### Goal

Create the storage engine project shell with a runnable CLI and the directories the later phases will fill.

### Why this matters

A byte-oriented database creates several kinds of files: source code, segment files, fixtures, and measurement reports. Keep those paths separate from the first commit. Later phases will write binary data repeatedly, corrupt it on purpose, truncate it, rebuild indexes, and generate reports.

The CLI is the public boundary. Before records exist, the project should already say what commands it supports and how invalid input fails.

### Build

Work through the checklist in order. Check a step only after its checkpoint is true.

#### Step 1: Create the project manifest

- [ ] **Task**: Create `package.json` with `"type": "module"` and an engine requirement for Node v24 or newer.

  **Mechanics**: The module format and runtime version belong in project metadata. Later code will use ESM syntax and Node v24 APIs, so the manifest should make that contract visible.

  **Hint**: You are not writing database code yet. You are telling Node how to load the files in this project.

  **Checkpoint**: `package.json` clearly says the project uses ESM and expects Node v24 or newer.

#### Step 2: Create the project folders

- [ ] **Task**: Create `src/`, `data/`, `reports/`, and `fixtures/`.

  **Mechanics**: Source files, mutable database state, generated measurements, and repeatable inputs have different lifecycles. Separate folders keep the segment file easy to inspect.

  **Hint**: `src/` is code. `data/` is database state. `reports/` is evidence. `fixtures/` is input material for repeatable runs.

  **Checkpoint**: All four folders exist, and you can explain what belongs in each one.

#### Step 3: Create the CLI entrypoint

- [ ] **Task**: Create `src/cli.js` as the command router.

  **Mechanics**: A command router receives `process.argv`, selects a command, and returns a process exit status through normal completion or `process.exitCode`.

  **Hint**: Keep this file small. It should route commands, not encode records or read segment files.

  **Checkpoint**: Running `node src/cli.js --help` prints a short command overview without creating files.

#### Step 4: Add the npm scripts

- [ ] **Task**: Add scripts for `db`, `put`, `get`, `scan`, `delete`, `inspect`, `inspect-format`, `encode`, `decode`, `recover`, `compact`, `bench`, and `test`.

  **Mechanics**: The scripts are the stable command surface for the lab. Each later phase fills in one or more of these commands instead of inventing new entrypoints.

  **Hint**: Scripts can point at files that do not exist yet only if you do not run them in this phase. The commands you run now should already work.

  **Checkpoint**: The manifest contains every command name the rest of the lab will use.

#### Step 5: Make help succeed

- [ ] **Task**: Implement help output for `npm run db -- --help`.

  **Mechanics**: Help output is a successful CLI result. Exit code `0` means the user asked for valid information and received it.

  **Hint**: Print the command names, default paths, and the shape of the main commands.

  **Checkpoint**: `npm run db -- --help` prints usage text and exits successfully.

#### Step 6: Reject unknown commands

- [ ] **Task**: Make unknown commands fail with a readable message and a non-zero exit code.

  **Mechanics**: Silent command mistakes create false experiment results. A strict CLI reports invalid input before touching database files.

  **Hint**: Send the error to `process.stderr`, then set `process.exitCode = 1`.

  **Checkpoint**: `npm run db -- made-up-command` fails, prints the unknown command, and points back to `--help`.

#### Step 7: Add command placeholders

- [ ] **Task**: Add placeholder handlers for `put`, `get`, `scan`, and `inspect`.

  **Mechanics**: Placeholder handlers prove routing before storage logic exists. They also reserve command names that later phases will replace.

  **Hint**: A placeholder should fail clearly. For example: `put is not implemented yet`.

  **Checkpoint**: `npm run put -- name ish` reaches the `put` handler and exits with code `1` instead of throwing a stack trace.

### Run

```sh
npm run db -- --help
npm run put -- name ish
```

### Expected behavior

The help command prints usage text with `put`, `get`, `scan`, and `inspect`. The placeholder `put` command fails clearly.

### Hints

Start with raw `process.argv.slice(2)`. Add a real parser only after the project has enough flags to justify it.

### Debugging notes

If `npm run db -- --help` swallows arguments, check the `--` separator. If Node rejects `import`, check `"type": "module"`.

### Checkpoint

The folder structure exists. The CLI overview works. Invalid commands fail. The major command names are present in `package.json`.

### Reflection

Explain why a binary store is a better Buffer lab than parsing text.

## Phase 1: Define The Record Format

### Goal

Design the binary layout for one database record and document it in `docs/format.md`.

### Why this matters

Every later phase depends on the record layout. The writer needs fixed offsets. The reader needs the same offsets. Recovery needs enough header data to decide whether a record is complete before trusting the payload.

The format is a disk contract. Once bytes are written, future code must read them consistently.

### Build

Work through the checklist in order. Check a step only after its checkpoint is true.

#### Step 1: Create the format module

- [ ] **Task**: Create `src/record-format.js`.

  **Mechanics**: A format module keeps byte offsets and widths in one place. The encoder, decoder, scanner, inspector, and docs should use the same constants.

  **Hint**: Export names such as `MAGIC`, `VERSION`, `TYPE_PUT`, `TYPE_DELETE`, `HEADER_SIZE`, and `OFFSETS`.

  **Checkpoint**: No other file needs to hard-code header offsets.

#### Step 2: Pick the header layout

- [ ] **Task**: Define a 28-byte header with magic bytes, version, type, reserved bytes, key length, value length, timestamp, and checksum.

  **Mechanics**: Fixed-width header fields let the reader know how much variable payload follows. The payload can then contain arbitrary bytes without separators.

  **Hint**: Use this layout:

  ```txt
  0   4   magic bytes
  4   1   version
  5   1   record type
  6   2   reserved
  8   4   key length
  12  4   value length
  16  8   timestamp ms
  24  4   checksum
  28  ... payload
  ```

  **Checkpoint**: `HEADER_SIZE` is `28`, and the payload starts at offset `28`.

#### Step 3: Choose field encodings

- [ ] **Task**: Store numeric fields in big-endian order and store keys and values as UTF-8 bytes.

  **Mechanics**: Binary formats need explicit byte order for multi-byte integers and explicit character encoding for text fields.

  **Hint**: The Buffer methods you will need later end with `BE`.

  **Checkpoint**: The format notes identify byte order and text encoding.

#### Step 4: Define record types

- [ ] **Task**: Define `PUT` as type `1` and `DELETE` as type `2`.

  **Mechanics**: Record type changes how the payload is interpreted. `PUT` has key bytes and value bytes. `DELETE` has key bytes and a zero-length value.

  **Hint**: Use numeric constants in the file and readable names in CLI output.

  **Checkpoint**: The format module exports both numeric type constants.

#### Step 5: Generate a format inspection command

- [ ] **Task**: Create `src/inspect-format.js` and the `inspect-format` npm script.

  **Mechanics**: A generated format table catches drift between documentation and constants. The command should print values from `record-format.js`.

  **Hint**: Print offset, width, field name, and validation rule. If `inspect-format` is listed in the `db` command router, `npm run db -- inspect-format` should reach the same output.

  **Checkpoint**: `npm run inspect-format` and `npm run db -- inspect-format` print the layout and `HEADER_SIZE = 28`.

#### Step 6: Write the format document

- [ ] **Task**: Create `docs/format.md`.

  **Mechanics**: A stored file format needs documentation next to the implementation. Recovery and compaction code will rely on these rules later.

  **Hint**: Include record types, payload order, byte order, and checksum coverage.

  **Checkpoint**: `docs/format.md` exists and matches the constants used by `inspect-format`.

### Run

```sh
npm run inspect-format
```

### Expected behavior

The tool prints the header layout, the payload order, record types, and the computed `HEADER_SIZE`.

### Hints

Use `Buffer.from("NLOG", "ascii")` for magic bytes. Keep the two reserved bytes zero for now.

### Debugging notes

A one-byte type field can represent `PUT` and `DELETE`; strings in the file waste bytes and complicate validation.

### Checkpoint

`docs/format.md` exists. `npm run inspect-format` prints the record layout from code.

### Reflection

Explain why binary formats need explicit lengths for variable-size fields.

## Phase 2: Encode Records Into Buffers

### Goal

Convert key/value data into a single Buffer that matches the record format.

### Why this matters

Encoding is where JavaScript values become bytes. Strings need an encoding. Integers need byte width and byte order. The payload needs a known position.

Small offset mistakes create files that look valid until a reader lands on the wrong byte.

### Build

Work through the checklist in order. Check a step only after its checkpoint is true.

#### Step 1: Create the encoder module

- [ ] **Task**: Create `src/record-encode.js` and export `encodeRecord({ type, key, value, timestamp })`.

  **Mechanics**: The encoder owns record construction. The segment writer should append the Buffer it receives without knowing how the header is assembled.

  **Hint**: Import all offsets and constants from `record-format.js`.

  **Checkpoint**: Another module can import `encodeRecord()` and receive a Buffer.

#### Step 2: Convert inputs to bytes

- [ ] **Task**: Convert `key` and `value` to UTF-8 Buffers.

  **Mechanics**: String length and byte length can differ. The header must store byte counts, not JavaScript character counts.

  **Hint**: Use `Buffer.byteLength(value, "utf8")` when validating lengths and `Buffer.from(value, "utf8")` when building payload bytes.

  **Checkpoint**: Non-ASCII keys and values produce correct byte lengths in tests.

#### Step 3: Validate record inputs

- [ ] **Task**: Reject empty keys, unknown record types, and keys or values longer than `0xffffffff` bytes.

  **Mechanics**: The format stores lengths in unsigned 32-bit fields. Values outside that range cannot be represented by the header.

  **Hint**: Validate before allocating the output Buffer.

  **Checkpoint**: Invalid inputs throw readable errors before any file write happens.

#### Step 4: Allocate and write the header

- [ ] **Task**: Allocate exactly `HEADER_SIZE + keyBytes.length + valueBytes.length`, then write the fixed header fields.

  **Mechanics**: A single output Buffer gives the writer one contiguous record to append. Header fields tell the reader how to parse it.

  **Hint**: Use `Buffer.alloc()` while developing so reserved bytes start as zero.

  **Checkpoint**: Header bytes contain `NLOG`, version `1`, type, key length, value length, timestamp, and checksum `0` for now.

#### Step 5: Copy the payload

- [ ] **Task**: Copy key bytes immediately after the header and value bytes immediately after key bytes.

  **Mechanics**: The header gives the decoder enough length information to split the payload back into key and value bytes.

  **Hint**: Keep an `offset` variable. Increment it after each copy.

  **Checkpoint**: The final offset equals `buffer.length`.

#### Step 6: Add the encode CLI and tests

- [ ] **Task**: Create `src/encode-cli.js`, add a hex dump helper, and add tests for length, header fields, and payload order.

  **Mechanics**: A hex dump exposes exact bytes. Tests protect the format before disk I/O enters the project.

  **Hint**: Print 16 bytes per row with the row offset on the left. If `encode` is listed in the `db` command router, `npm run db -- encode <key> <value>` should route to the encoder too.

  **Checkpoint**: `npm run encode -- hello world` and `npm run db -- encode hello world` print a 38-byte record, and `npm test` passes.

### Run

```sh
npm run encode -- hello world
npm test
```

### Expected behavior

The encode command prints a hex dump. The total encoded length is `28 + 5 + 5 = 38` bytes for `hello` and `world`.

### Hints

The first four bytes should be `4e 4c 4f 47`. That is `NLOG` in ASCII.

### Debugging notes

If encoded length is wrong, compare byte length against string length first. Non-ASCII data exposes that mistake quickly.

### Checkpoint

Encoded length matches `HEADER_SIZE + keyLength + valueLength`. Header and payload tests pass.

### Reflection

Explain how text becomes bytes during record encoding.

## Phase 3: Decode Records From Buffers

### Goal

Parse a Buffer back into a record object and prove encode/decode round trips.

### Why this matters

The decoder validates the fixed header before it trusts variable-length payload data. It also reports how many bytes it consumed so a scanner can advance to the next record.

Every disk read will pass through this module. Keep the validation rules here.

### Build

Work through the checklist in order. Check a step only after its checkpoint is true.

#### Step 1: Create the decoder module

- [ ] **Task**: Create `src/record-decode.js` and export `decodeRecord(buffer, options = {})`.

  **Mechanics**: The decoder translates stored bytes back into typed record data and validates the byte-level contract.

  **Hint**: Return both decoded strings and byte metadata.

  **Checkpoint**: The function returns `type`, `key`, `value`, `timestamp`, `checksum`, `keyLength`, `valueLength`, `recordLength`, and `payloadOffset`.

#### Step 2: Validate the fixed header

- [ ] **Task**: Reject incomplete headers, invalid magic bytes, unsupported version, and unknown record types.

  **Mechanics**: Header validation protects every later offset calculation. Bad header data can make the decoder read payload bytes from the wrong position.

  **Hint**: Check `buffer.length >= HEADER_SIZE` before reading header fields.

  **Checkpoint**: Invalid magic bytes produce a readable error.

#### Step 3: Validate the payload boundary

- [ ] **Task**: Read key and value lengths, compute `recordLength`, and reject incomplete payload buffers.

  **Mechanics**: The decoder must know where the current record ends. The scanner uses that length to move through the segment.

  **Hint**: Compute `HEADER_SIZE + keyLength + valueLength` once and reuse it.

  **Checkpoint**: A buffer with a complete header but missing payload bytes is rejected.

#### Step 4: Decode key and value data

- [ ] **Task**: Convert key and value bytes back into UTF-8 strings.

  **Mechanics**: Payload bytes become JavaScript strings only after length checks pass.

  **Hint**: Use offsets from the header. Avoid searching for separators.

  **Checkpoint**: Decoding the record from Phase 2 returns key `hello` and value `world`.

#### Step 5: Add payload ownership modes

- [ ] **Task**: Add `options.payloadMode` with `copy`, `slice`, and `subarray`.

  **Mechanics**: Parsing can either copy payload bytes or keep views into the original Buffer. Phase 12 will measure the memory effect.

  **Hint**: In `copy` mode, wrap views with `Buffer.from(view)`.

  **Checkpoint**: The decoder returns `keyBuffer` and `valueBuffer` in each mode.

#### Step 6: Add the decode CLI and round-trip tests

- [ ] **Task**: Create `src/decode-cli.js` and tests for ASCII, non-ASCII, invalid headers, and incomplete payloads.

  **Mechanics**: Round-trip tests prove the encoder and decoder agree on offsets, lengths, and text encoding.

  **Hint**: Let the CLI accept a hex string and a `--file` path. If `decode` is listed in the `db` command router, `npm run db -- decode <hex>` should route to the decoder too.

  **Checkpoint**: `npm test` passes, and an encoded record decodes back to the original key and value through both `npm run decode -- <hex>` and `npm run db -- decode <hex>`.

### Run

```sh
npm run encode -- hello world
npm run decode -- <hex-from-the-encoder>
npm test
```

### Expected behavior

Encoding and then decoding the same record returns key `hello` and value `world`. Invalid data fails with readable errors.

### Hints

`readBigUInt64BE()` returns a BigInt. Convert only after deciding how your project will represent timestamps.

### Debugging notes

Calling `toString()` before validating lengths can hide malformed payload boundaries.

### Checkpoint

Round-trip tests pass. The decoder rejects incomplete headers and incomplete payloads.

### Reflection

Explain where copies happen and where Buffer views happen during decoding.

## Phase 4: Append Records To A Segment File

### Goal

Write encoded records to disk using append-only segment storage.

### Why this matters

The write path can stay small: encode one record, append it, record the offset, and flush when requested. New bytes are written after old bytes, so recovery can keep the valid prefix and discard a broken tail.

Offsets also become durable addresses. A lookup can point at `segment-0001.dat` plus byte offset.

### Build

Work through the checklist in order. Check a step only after its checkpoint is true.

#### Step 1: Centralize project paths

- [ ] **Task**: Create `src/paths.js` with constants for `data/segment-0001.dat`, `data/index.json`, and report paths.

  **Mechanics**: Shared path constants prevent the CLI, writer, reader, and report code from drifting apart.

  **Hint**: Export absolute paths or paths relative to `process.cwd()`. Pick one rule and keep it consistent.

  **Checkpoint**: `segment-0001.dat` has one exported path used everywhere.

#### Step 2: Create the segment writer

- [ ] **Task**: Create `src/segment-writer.js` and open the segment with `fs.promises.open(path, "a+")`.

  **Mechanics**: Append mode creates the file when needed and writes new records at the end.

  **Hint**: Create `data/` with `{ recursive: true }` before opening the file.

  **Checkpoint**: A missing `data/` directory no longer breaks `put`.

#### Step 3: Capture the append offset

- [ ] **Task**: Call `handle.stat()` before writing and use the current file size as the record offset.

  **Mechanics**: The offset is the byte position where the record starts. The index will store this value later.

  **Hint**: Capture size before the append, not after it.

  **Checkpoint**: The first record starts at offset `0`; the second starts at the previous file size.

#### Step 4: Write the whole encoded record

- [ ] **Task**: Encode the record and write every byte to the segment.

  **Mechanics**: `FileHandle.write()` can report fewer bytes than requested. The writer must treat partial writes as failures or loop until all bytes are written.

  **Hint**: Keep a `written` counter and advance through the Buffer until it reaches `buffer.length`.

  **Checkpoint**: File size increases by exactly the encoded record length.

#### Step 5: Add optional sync mode

- [ ] **Task**: Support a `--sync` flag that calls `filehandle.sync()` after the append.

  **Mechanics**: Sync mode changes durability behavior and benchmark results. Keep it explicit.

  **Hint**: Pass an option into `appendRecord()` instead of reading CLI flags inside the writer.

  **Checkpoint**: `npm run put -- name ish --sync` succeeds and reports that sync mode was used.

#### Step 6: Wire the `put` command

- [ ] **Task**: Replace the `put` placeholder with a real append path and print JSON.

  **Mechanics**: CLI output should expose the segment, offset, length, and timestamp so later phases can verify direct reads.

  **Hint**: Keep the command shape `npm run put -- <key> <value>`.

  **Checkpoint**: `npm run put -- name ish` creates or grows `data/segment-0001.dat`.

### Run

```sh
npm run put -- name ish
ls -l data/segment-0001.dat
```

### Expected behavior

`data/segment-0001.dat` exists and grows by exactly one encoded record. The CLI prints segment path, offset, length, and timestamp.

### Hints

Run `stat -c %s data/segment-0001.dat` on Linux to inspect exact byte size.

### Debugging notes

If offsets are always `0`, the code is reading size after truncating the file or opening with the wrong flag.

### Checkpoint

A second `put` appends after the first record and reports the correct starting offset.

### Reflection

Explain why append-only writes are easier to recover than in-place updates.

## Phase 5: Sequentially Scan Segment Files

### Goal

Read records from disk in order and print them without using an index.

### Why this matters

The segment file is the durable record of writes. Indexes can be rebuilt from it. Reports can be regenerated from it.

Sequential scanning also proves the decoder's `recordLength` contract. Each decoded record tells the reader where the next record starts.

### Build

Work through the checklist in order. Check a step only after its checkpoint is true.

#### Step 1: Create the segment reader

- [ ] **Task**: Create `src/segment-reader.js` and export `scanSegment(path, options = {})` as an async generator.

  **Mechanics**: An async generator lets scan consumers process one record at a time without loading the whole segment into memory.

  **Hint**: Yield `{ offset, length, record }` for each decoded record.

  **Checkpoint**: A caller can use `for await...of` to consume segment entries.

#### Step 2: Read fixed headers first

- [ ] **Task**: Read `HEADER_SIZE` bytes at the current offset before reading payload bytes.

  **Mechanics**: The header contains the payload lengths. The reader needs those lengths before it can allocate or read the full record.

  **Hint**: Write a helper named `readExactly()` that loops until it fills the requested Buffer or reaches EOF.

  **Checkpoint**: Empty segment files end cleanly at offset `0`.

#### Step 3: Read the remaining payload

- [ ] **Task**: Use key length and value length from the header to read the rest of the record.

  **Mechanics**: The complete record Buffer is `HEADER_SIZE + keyLength + valueLength` bytes.

  **Hint**: Keep partial header and partial payload cases separate. They produce different recovery reports later.

  **Checkpoint**: A segment with two records scans both records in order.

#### Step 4: Decode and yield records

- [ ] **Task**: Pass the complete record Buffer into `decodeRecord()` and advance by `recordLength`.

  **Mechanics**: The scanner should trust the decoder for validation and use the decoded length for movement.

  **Hint**: Keep `offset` as a number you control. Do not infer it from loop count.

  **Checkpoint**: The second record starts exactly where the first record ends.

#### Step 5: Wire `scan`

- [ ] **Task**: Replace the `scan` placeholder and print offset, length, type, key, value, and timestamp for each record.

  **Mechanics**: Scan output is the human inspection path for the raw segment.

  **Hint**: Print JSON lines if you want output that is easy to pipe into other tools.

  **Checkpoint**: `npm run scan` prints all appended records in file order.

#### Step 6: Add offset inspection

- [ ] **Task**: Add `npm run inspect -- --offset <n>` to decode one record from a byte offset.

  **Mechanics**: Direct offset reads prepare the project for indexed lookups.

  **Hint**: Reuse the same read-one-record helper that `scanSegment()` uses internally.

  **Checkpoint**: Inspecting the offset reported by `put` prints that exact record.

### Run

```sh
npm run put -- name ish
npm run put -- city pune
npm run scan
```

### Expected behavior

The scan command prints every appended record in file order with offsets and lengths. EOF at a record boundary stops the scan cleanly.

### Hints

A read can return fewer bytes than requested, especially near EOF. Code for that case from the start.

### Debugging notes

An infinite scan loop usually means the reader forgot to advance by `recordLength`.

### Checkpoint

All appended records print in order. `inspect --offset` decodes a single record from its byte position.

### Reflection

Explain why segment readers need to handle partial buffers.

## Phase 6: Add Checksums

### Goal

Compute and verify a checksum for each record so corrupted bytes are detected during reads.

### Why this matters

A file can exist and contain bad data. A byte can be flipped. A record can be copied partly. A process can exit after writing fewer bytes than intended.

The reader needs a local validity check for the record it just parsed.

### Build

Work through the checklist in order. Check a step only after its checkpoint is true.

Phase 6 changes the disk validity rule. Phase 5 records used checksum `0`; Phase 6 decoders treat the checksum field as stored data and compare it with computed CRC-32. Start Phase 6 with an empty segment so every record in the file was written by the checksum-aware encoder.

#### Step 1: Reset copied segment data

- [ ] **Task**: If the phase directory was copied from Phase 5, remove `data/segment-0001.dat` before writing Phase 6 records.

  **Mechanics**: Phase 5 segment bytes carry checksum `0`. Phase 6 scan verifies stored checksums during ordinary reads, so the segment needs records encoded by the Phase 6 writer.

  **Hint**: Reset mutable database state only. Keep `src/`, `test/`, `docs/`, and `package.json`.

  **Checkpoint**: `data/segment-0001.dat` is absent or zero bytes before the first Phase 6 `put`.

#### Step 2: Create checksum helpers

- [ ] **Task**: Create `src/checksum.js` using `crc32` from `node:zlib`.

  **Mechanics**: The checksum is computed over record bytes with the checksum field treated as zero. That keeps the stored checksum out of its own input.

  **Hint**: Copy the record Buffer before zeroing checksum bytes during verification.

  **Checkpoint**: A helper can compute the same checksum for the same record bytes every time.

#### Step 3: Write checksums during encoding

- [ ] **Task**: Update `encodeRecord()` to compute the checksum after the header and payload are written, then store it at offset `24`.

  **Mechanics**: The checksum covers the final record shape. Any later byte change should be detected.

  **Hint**: Leave checksum bytes zero until every other byte has its final value.

  **Checkpoint**: Encoded records contain a non-zero checksum for ordinary `PUT` records.

#### Step 4: Verify checksums during decoding

- [ ] **Task**: Update `decodeRecord()` to reject checksum mismatches unless `options.verifyChecksum === false`.

  **Mechanics**: Decoding is the central validation boundary, so checksum verification belongs there.

  **Hint**: Return both expected and actual checksum values in the error object.

  **Checkpoint**: A one-byte mutation makes decode fail.

#### Step 5: Report corruption from scans

- [ ] **Task**: Make `npm run scan` print checksum failures with the segment offset and exit with code `1`.

  **Mechanics**: The scanner knows the byte offset, while the decoder knows the record validity rule. Combine both pieces in the error report.

  **Hint**: Attach `offset` in the scanner when catching decode errors.

  **Checkpoint**: Corrupting a payload byte reports the failed record offset.

#### Step 6: Add corruption tests or a helper

- [ ] **Task**: Add a test helper or fixture command that flips one byte at a known offset.

  **Mechanics**: Corruption detection should be repeatable. A manual hex editor step is too easy to vary.

  **Hint**: Flip a byte inside the value payload so header lengths stay valid.

  **Checkpoint**: The corruption test fails before checksum support and passes after it.

#### Step 7: Restore a clean working segment

- [ ] **Task**: After the corruption check, delete the damaged segment and write fresh checksum-valid records.

  **Mechanics**: Phase 7 replays the existing segment while building the index. A segment left in the intentionally corrupted state fails before index code runs.

  **Hint**: Reset only `data/segment-0001.dat`. Keep the source you just wrote.

  **Checkpoint**: A final `npm run scan` succeeds before you copy this directory forward.

### Run

```sh
node -e "const fs=require('node:fs'); fs.rmSync('data/segment-0001.dat',{force:true})"
npm run put -- name ish
npm run scan
node -e "const fs=require('node:fs'); const p='data/segment-0001.dat'; const fd=fs.openSync(p,'r+'); const b=Buffer.alloc(1); fs.readSync(fd,b,0,1,33); b[0]^=1; fs.writeSync(fd,b,0,1,33); fs.closeSync(fd)"
npm run scan
node -e "const fs=require('node:fs'); fs.rmSync('data/segment-0001.dat',{force:true})"
npm run put -- name ish
npm run put -- city pune
npm run scan
```

### Expected behavior

The reset removes copied Phase 5 segment bytes. The first scan succeeds. After the byte flip, `npm run scan` reports a checksum failure with the record offset. The last scan succeeds and leaves a checksum-valid segment for Phase 7.

### Hints

Store checksums as unsigned 32-bit integers with `writeUInt32BE()`.

For `name=ish`, the record is 35 bytes: header bytes `0` through `27`, key bytes `28` through `31`, and value bytes `32` through `34`. Offset `33` mutates the value payload while leaving header lengths intact.

### Debugging notes

A checksum mismatch on every record usually means the encoder and decoder include different bytes in the checksum input.

### Checkpoint

Checksum tests pass. Corrupted records are rejected. Scan output includes the offset of the failed record.

### Reflection

Explain why "file exists" and "data is valid" are separate claims.

## Phase 7: Build An In-Memory Index

### Goal

Map keys to the latest record offsets so `get` can seek directly to the newest value.

### Why this matters

The write path records facts. The read path wants the latest fact for a key. The index compresses a scan result into key-to-location entries.

Replaying the segment builds the same map every time, which gives you a correctness baseline before persisted indexes enter the project.

### Build

Work through the checklist in order. Check a step only after its checkpoint is true.

Phase 7 expects checksum-valid input. If the Phase 6 directory still contains the intentionally corrupted segment from the corruption check, reset the mutable database state before writing Phase 7 records.

#### Step 1: Create the index module

- [ ] **Task**: Create `src/index.js` with `buildIndexFromScan(scan)` and `applyRecord(index, entry)`.

  **Mechanics**: The index is derived state. It maps each key to the latest record location seen during scan.

  **Hint**: Use `Map` in memory and plain objects for stored entries.

  **Checkpoint**: A scan of two records for the same key leaves one index entry for the newer record.

#### Step 2: Define index entries

- [ ] **Task**: Store `key`, `type`, `segment`, `offset`, `length`, and `timestamp`.

  **Mechanics**: A lookup needs enough data to seek to the record and validate what it reads.

  **Hint**: Do not store the value in the index yet. Store the location.

  **Checkpoint**: Index entries contain a byte offset and record length.

#### Step 3: Add point reads

- [ ] **Task**: Add `readRecordAt(segment, offset)` to `src/segment-reader.js`.

  **Mechanics**: Indexed lookup reads one record directly instead of scanning the whole segment during the lookup step.

  **Hint**: Reuse the header-read and payload-read code from scanning.

  **Checkpoint**: Reading the offset reported by `put` returns that exact record.

#### Step 4: Wire `get`

- [ ] **Task**: Build the index during CLI startup, find the key, seek to the latest offset, and print the value.

  **Mechanics**: Startup replay builds the read-side map. The actual `get` operation then uses a direct offset read.

  **Hint**: Add `--verbose` to print the offset used by the lookup.

  **Checkpoint**: Repeated puts return the newest value.

#### Step 5: Test overwrite behavior

- [ ] **Task**: Add tests for repeated puts with the same key and a lookup after replay.

  **Mechanics**: Index replacement is the core read-path rule for `PUT`.

  **Hint**: Insert `name=ish`, then `name=node`, then assert that `get name` reads `node`.

  **Checkpoint**: The tests prove the newest offset wins.

### Run

```sh
node -e "const fs=require('node:fs'); fs.rmSync('data/segment-0001.dat',{force:true})"
npm run put -- name ish
npm run put -- name node
npm run get -- name
```

### Expected behavior

The reset removes any intentionally corrupted Phase 6 bytes. The lookup prints `node`, the newest value for `name`.

### Hints

Split startup replay from point reads. A verbose lookup should make that split visible.

### Debugging notes

If `get` returns the first value, index updates are conditional when they should replace the old entry.

### Checkpoint

Repeated puts return the newest value. Verbose lookup output shows a direct offset read.

### Reflection

Explain the difference between the write path and the read path in this project.

## Phase 8: Persist The Index

### Goal

Save and reload the index from disk so startup can skip a full replay when the index is current.

### Why this matters

Full replay is correct and simple. It also gets slower as the segment grows. A persisted index trades startup speed for another file that must match the segment state.

The segment remains authoritative. The index is a cached view with validation data.

### Build

Work through the checklist in order. Check a step only after its checkpoint is true.

#### Step 1: Pick the index file format

- [ ] **Task**: Persist the index as `data/index.json`.

  **Mechanics**: JSON keeps this phase focused on cache validity instead of another binary format.

  **Hint**: You can build `index.bin` later if you want extra format practice.

  **Checkpoint**: The project has one documented persisted index path.

#### Step 2: Define the index file schema

- [ ] **Task**: Store `version`, `segment`, `segmentSize`, `updatedAt`, and `entries`.

  **Mechanics**: `segmentSize` tells the loader whether the index matches the current segment length.

  **Hint**: Convert `Map` values with `Array.from(index.values())`.

  **Checkpoint**: `data/index.json` contains an array of entries, not an empty object.

#### Step 3: Save the index after writes

- [ ] **Task**: After a successful `put`, update the in-memory index and write `data/index.json`.

  **Mechanics**: The persisted index should describe the segment after the append, not before it.

  **Hint**: Capture segment size after the append completes.

  **Checkpoint**: A `put` command creates or updates `data/index.json`.

#### Step 4: Write the index atomically

- [ ] **Task**: Write to a temp file in `data/`, then rename it over `index.json`.

  **Mechanics**: Rename prevents readers from observing half-written JSON.

  **Hint**: Use a temp name that includes the process id.

  **Checkpoint**: Interrupting an index write cannot leave a truncated `index.json` as the intended final file.

#### Step 5: Load or replay at startup

- [ ] **Task**: During `get`, load the persisted index when `segmentSize` matches; otherwise replay the segment.

  **Mechanics**: The loader needs a validity check before trusting cached offsets.

  **Hint**: Treat invalid JSON, missing index files, and size mismatches as replay cases.

  **Checkpoint**: `get` works after separate CLI invocations.

#### Step 6: Write the index load report

- [ ] **Task**: Write `reports/index-load.json` with `mode`, `entryCount`, `segmentSize`, `indexLoadMs`, `replayMs`, and `lookupMs`.

  **Mechanics**: The report makes the startup tradeoff measurable.

  **Hint**: Use `performance.now()` from `node:perf_hooks`.

  **Checkpoint**: The report says whether lookup used `persisted-index` or `full-replay`.

### Run

```sh
npm run put -- name ish
npm run get -- name
cat reports/index-load.json
```

### Expected behavior

The key lookup works after restarting the CLI. The report shows whether the command loaded a persisted index or replayed the segment.

### Hints

Write the index only after the segment append succeeds.

### Debugging notes

A missing key after restart usually means `Map` entries were serialized as an empty object.

### Checkpoint

Lookup works across separate CLI invocations. The report compares index load time with full replay time.

### Reflection

Explain the tradeoff index persistence makes between startup speed and correctness.

## Phase 9: Recover From Partial Writes

### Goal

Detect records cut off mid-write and truncate the segment to the last valid offset.

### Why this matters

Crashes happen between bytes. A process can die after writing half a header or most of a payload. Append-only storage gives recovery a simple target: keep the valid prefix and discard the broken tail.

Recovery must be explicit. The scanner can report a partial tail, but the recovery command owns truncation.

### Build

Work through the checklist in order. Check a step only after its checkpoint is true.

#### Step 1: Create the recovery module

- [ ] **Task**: Create `src/recover.js` and export `recoverSegment(path)`.

  **Mechanics**: Recovery is a write operation against the segment file. Keep it separate from ordinary scan.

  **Hint**: Make the function return a report object before it writes `reports/recovery.json`.

  **Checkpoint**: The CLI can call recovery without duplicating scan logic.

#### Step 2: Track valid progress

- [ ] **Task**: Scan from offset `0` with checksum verification and track `lastValidOffset`, `lastValidLength`, and `validRecordCount`.

  **Mechanics**: The truncation target is the end of the last complete valid record.

  **Hint**: Initialize the valid end to `0` so a corrupt first record truncates the file to zero bytes.

  **Checkpoint**: Recovery can report the final valid byte position.

#### Step 3: Stop at the first failure

- [ ] **Task**: Stop on incomplete header, incomplete payload, invalid magic, invalid version, invalid type, or checksum failure.

  **Mechanics**: After the first failure, record alignment is no longer trustworthy.

  **Hint**: Capture `failureOffset` and `failureReason`.

  **Checkpoint**: A truncated tail produces one recovery failure entry.

#### Step 4: Truncate and rebuild

- [ ] **Task**: Truncate the segment to `lastValidOffset + lastValidLength`, then rebuild and persist the index.

  **Mechanics**: The segment and index must agree after recovery. Old index offsets may point past EOF.

  **Hint**: Use `FileHandle.truncate(size)`.

  **Checkpoint**: `npm run scan` succeeds after recovery.

#### Step 5: Write the recovery report

- [ ] **Task**: Write `reports/recovery.json` with `originalSize`, `recoveredSize`, `lostBytes`, `failureOffset`, `failureReason`, and `validRecordCount`.

  **Mechanics**: Recovery should leave evidence of what was kept and what was removed.

  **Hint**: Make recovery idempotent. Running it twice after a clean recovery should report zero lost bytes.

  **Checkpoint**: The report lists recovered size and lost bytes.

### Run

```sh
npm run put -- a one
npm run put -- b two
node -e "const fs=require('node:fs'); const p='data/segment-0001.dat'; const size=fs.statSync(p).size; fs.truncateSync(p, size - 7)"
npm run recover
cat reports/recovery.json
npm run scan
```

### Expected behavior

Recovery preserves every complete valid record before the broken tail. The segment is truncated to the last valid offset.

### Hints

Truncating to `failureOffset` is wrong when the failure is in the middle of a record. Truncate to the end of the previous valid record.

### Debugging notes

A checksum failure at offset `0` means the first record is bad. Recovery should truncate the file to zero bytes.

### Checkpoint

`reports/recovery.json` contains `recoveredSize` and `lostBytes`. Valid records remain readable.

### Reflection

Explain why append-only files are recovery-friendly.

## Phase 10: Add Tombstones For Deletes

### Goal

Support deletion by appending `DELETE` records instead of rewriting existing records.

### Why this matters

Deletion becomes another record in the log. The database keeps history in scan order, while the index records the latest state for each key.

A tombstone has no value payload. It still needs a key, timestamp, checksum, offset, and length because readers and compaction process it through the same record pipeline.

### Build

Work through the checklist in order. Check a step only after its checkpoint is true.

#### Step 1: Encode delete records

- [ ] **Task**: Update the encoder to support `TYPE_DELETE` with a key and zero-length value.

  **Mechanics**: A delete record uses the same header and checksum rules as a put record. Only the record type and value length differ.

  **Hint**: Reject a delete command that supplies a value.

  **Checkpoint**: A delete record has value length `0`.

#### Step 2: Wire the delete command

- [ ] **Task**: Replace the `delete` placeholder with `npm run delete -- <key>`.

  **Mechanics**: Delete should append a tombstone, not rewrite old bytes.

  **Hint**: Reuse `appendRecord()`.

  **Checkpoint**: Running delete grows `data/segment-0001.dat`.

#### Step 3: Update index application

- [ ] **Task**: On `DELETE`, store `{ type: "DELETE", deleted: true, offset, length, ... }` for the key.

  **Mechanics**: The latest state for a key can be deleted. Missing and deleted are different states.

  **Hint**: Persist tombstone entries in `data/index.json`.

  **Checkpoint**: Deleted keys stay deleted after restarting the CLI.

#### Step 4: Update `get`

- [ ] **Task**: Make `get` report a deleted key differently from a missing key.

  **Mechanics**: A missing key has no history in the current index. A deleted key has a latest tombstone record.

  **Hint**: Use different JSON fields or messages for `missing` and `deleted`.

  **Checkpoint**: `get name` after delete reports the deleted state.

#### Step 5: Keep scan historical

- [ ] **Task**: Keep `scan` printing old `PUT` records and later `DELETE` records.

  **Mechanics**: Scan is the log inspection path, not the query path.

  **Hint**: Avoid filtering scan output through the index.

  **Checkpoint**: Scan output shows historical puts and tombstones in file order.

### Run

```sh
npm run put -- name ish
npm run delete -- name
npm run get -- name
npm run scan
```

### Expected behavior

`get` says `name` is deleted. `scan` still shows the earlier `PUT` and the later `DELETE`.

### Hints

Keep deleted and missing states separate in JSON output.

### Debugging notes

If deleted keys reappear after restart, the persisted index dropped tombstone entries.

### Checkpoint

Deletes append tombstone records. Later `get` reports the deleted state. Historical scan output still includes old values.

### Reflection

Explain why deletes do not immediately shrink disk usage in an append-only store.

## Phase 11: Add Compaction

### Goal

Rewrite live records into a smaller segment and remove overwritten records plus tombstones.

### Why this matters

Append-only storage accumulates old facts. Repeated puts leave old values behind. Deletes leave tombstones behind. Compaction writes the current live key/value set into a new segment, then swaps it into place.

The swap is the risky part. A crash during compaction must leave either the old segment or the new compacted segment usable.

### Build

Work through the checklist in order. Check a step only after its checkpoint is true.

#### Step 1: Create the compaction module

- [ ] **Task**: Create `src/compact.js`.

  **Mechanics**: Compaction reads current state from the old segment and writes a replacement segment with only live records.

  **Hint**: Keep compaction single-process for this lab.

  **Checkpoint**: `npm run compact` reaches the compaction module.

#### Step 2: Build the live set

- [ ] **Task**: Build the current index from the segment and select only live `PUT` entries.

  **Mechanics**: Latest `PUT` entries survive. Overwritten records and tombstones are excluded.

  **Hint**: Do not use raw scan output as the live set. Use latest index state.

  **Checkpoint**: A deleted key is excluded from the compacted output.

#### Step 3: Write a compacting segment

- [ ] **Task**: Read each live record by offset and write it to `data/segment-0001.compacting`.

  **Mechanics**: The compacted file gets new offsets. The new index must be built from the compacted writes.

  **Hint**: Preserve original timestamps or write new timestamps. Pick one rule and document it.

  **Checkpoint**: The compacting segment contains only live records.

#### Step 4: Sync and swap files

- [ ] **Task**: Sync the compacting file, move the current segment to `.bak`, rename compacting to `segment-0001.dat`, then write the new index.

  **Mechanics**: The rename sequence protects the database from a half-installed compacted segment.

  **Hint**: Delete the backup only after the new segment and index are in place.

  **Checkpoint**: A successful compaction leaves `segment-0001.dat` and no stale `.compacting` file.

#### Step 5: Add startup cleanup

- [ ] **Task**: Handle leftover `.compacting` or `.bak` files at startup.

  **Mechanics**: A previous crash can leave compaction artifacts. Startup needs a deterministic rule for those files.

  **Hint**: Prefer preserving a readable segment over deleting evidence.

  **Checkpoint**: Running `scan` or `get` with one artifact present reports `restored-backup-as-segment`, `preserved-backup`, or `preserved-compacting`.

#### Step 6: Write the compaction report

- [ ] **Task**: Write `reports/compaction.json` with `beforeSize`, `afterSize`, `recordsRead`, `recordsWritten`, `tombstonesDropped`, `overwrittenRecordsDropped`, and `durationMs`.

  **Mechanics**: Compaction changes disk size and record count. The report makes that change inspectable.

  **Hint**: Count dropped records while building the live set.

  **Checkpoint**: The report records before and after size.

### Run

Verify the normal compact path first.

```sh
npm run put -- name ish
npm run put -- name node
npm run put -- city pune
npm run delete -- city
npm run compact
cat reports/compaction.json
npm run get -- name
npm run scan
```

Then force the startup cleanup path.

```sh
node -e "const fs=require('node:fs'); fs.rmSync('data/segment-0001.dat.bak',{force:true}); fs.renameSync('data/segment-0001.dat','data/segment-0001.dat.bak')"
npm run scan
node -e "const fs=require('node:fs'); fs.writeFileSync('data/segment-0001.compacting','stale')"
npm run get -- name
```

### Expected behavior

The compacted segment is smaller when overwritten records or tombstones existed. `get -- name` still returns `node`. `scan` shows only live records in the compacted file.

The backup artifact run prints a cleanup action containing `restored-backup-as-segment`, then `scan` succeeds. The compacting artifact run prints a cleanup action containing `preserved-compacting`, then `get -- name` returns `node`.

### Hints

Reject writes while compaction runs by creating `data/compact.lock`.

### Debugging notes

If lookups fail after compaction, the index probably contains offsets from the old segment.

### Checkpoint

File size drops when obsolete records exist. Lookups return correct values after compaction.

### Reflection

Explain why compaction is necessary and risky in this storage design.

## Phase 12: Measure Buffer Ownership

### Goal

Compare copy-heavy and view-heavy parsing modes during large scans.

### Why this matters

`Buffer.slice()` and `Buffer.subarray()` are cheap because they keep views over existing memory. That helps during tight parsing. It can also retain large backing stores when a small view survives longer than the original read operation.

The database gives you a concrete place to measure the difference: same records, same scan, different payload ownership.

### Build

Work through the checklist in order. Check a step only after its checkpoint is true.

#### Step 1: Keep parser modes wired through scan

- [ ] **Task**: Support `npm run scan -- --mode copy`, `--mode slice`, and `--mode subarray`.

  **Mechanics**: The scanner needs to pass the chosen payload mode into `decodeRecord()`.

  **Hint**: Validate the mode before opening the segment.

  **Checkpoint**: Each mode scans the same dataset successfully.

#### Step 2: Generate a large dataset

- [ ] **Task**: Add `src/generate-fixture.js` or `bench --generate` to create a large repeatable dataset.

  **Mechanics**: Small files hide Buffer ownership differences. Use enough records to move external memory by megabytes.

  **Hint**: Deterministic keys and values make repeated measurements easier to compare.

  **Checkpoint**: You can generate 100000 records without manual setup.

#### Step 3: Add memory sampling

- [ ] **Task**: Record `rss`, `heapUsed`, `external`, and `arrayBuffers` before scan, during scan, and after cleanup.

  **Mechanics**: Buffer backing stores show up outside ordinary heap usage. `external` and `arrayBuffers` are the fields to watch.

  **Hint**: Start Node with `--expose-gc` if you want explicit `global.gc()` samples.

  **Checkpoint**: Each scan mode produces memory samples.

#### Step 4: Add retention mode

- [ ] **Task**: Add `--retain` so scan keeps decoded key/value Buffers in an array until after the final memory sample.

  **Mechanics**: Retained views keep their backing stores alive. Retention makes ownership visible in the report.

  **Hint**: Store Buffers only when `--retain` is present.

  **Checkpoint**: Retained runs show different memory behavior from non-retained runs.

#### Step 5: Write the ownership report

- [ ] **Task**: Write `reports/buffer-ownership.json` with one entry per mode.

  **Mechanics**: The report should compare parser mode, record count, retained mode, and memory fields.

  **Hint**: Include `externalBefore`, `externalAfter`, `arrayBuffersBefore`, and `arrayBuffersAfter`.

  **Checkpoint**: The report compares `copy`, `slice`, and `subarray`.

### Run

```sh
node --expose-gc src/bench.js --generate 100000
npm run scan -- --mode copy --retain
npm run scan -- --mode slice --retain
npm run scan -- --mode subarray --retain
cat reports/buffer-ownership.json
```

### Expected behavior

The report shows different external memory and `arrayBuffers` behavior across parser modes, especially when retained views are enabled.

### Hints

`slice` and `subarray` should behave similarly for ownership in modern Node.

### Debugging notes

`global.gc` exists only when Node starts with `--expose-gc`.

### Checkpoint

`reports/buffer-ownership.json` exists and compares `copy`, `slice`, and `subarray` modes.

### Reflection

Explain when zero-copy parsing helps and when retained Buffer views cause excess memory retention.

## Phase 13: Add Benchmarks

### Goal

Benchmark puts, gets, scans, recovery, and compaction, then write a report.

### Why this matters

Storage behavior changes under load. One record proves a narrow path. Many records expose offset bugs, stale indexes, slow startup, memory retention, and compaction cost.

The benchmark should reset its own data files, generate its own inputs, and report enough context to compare future changes.

### Build

Work through the checklist in order. Check a step only after its checkpoint is true.

#### Step 1: Create the benchmark runner

- [ ] **Task**: Create `src/bench.js`.

  **Mechanics**: The benchmark runner owns setup, measurement, cleanup, and report generation.

  **Hint**: Use a separate benchmark mode before deleting or truncating any data files. Keep `npm run bench` and `npm run db -- bench` pointed at the same runner.

  **Checkpoint**: `npm run bench` and `npm run db -- bench` reach the benchmark runner.

#### Step 2: Generate deterministic benchmark data

- [ ] **Task**: Generate keys and values for sequential puts, repeated puts, deletes, recovery, and compaction.

  **Mechanics**: Deterministic data makes performance changes easier to compare between runs.

  **Hint**: Use deterministic keys such as `key-${i % keySpace}` to create repeatable overwrites.

  **Checkpoint**: Two benchmark runs use the same key distribution.

#### Step 3: Measure each operation class

- [ ] **Task**: Measure sequential puts, repeated puts, indexed gets, full scans, recovery after truncated tail, and compaction after overwrites and deletes.

  **Mechanics**: Each operation stresses a different part of the storage engine.

  **Hint**: Separate setup time from measured time.

  **Checkpoint**: Every benchmark case records `durationMs` and `opsPerSec` where applicable.

#### Step 4: Capture size and memory data

- [ ] **Task**: Track `segmentSize`, `indexSize`, `rss`, `heapUsed`, `external`, `arrayBuffers`, `recoveryMs`, and `compactionMs`.

  **Mechanics**: A storage benchmark should report disk, memory, and timing data together.

  **Hint**: Record Node version, platform, CPU count, and timestamp with the results.

  **Checkpoint**: The benchmark output includes environment metadata and memory fields.

#### Step 5: Write benchmark reports

- [ ] **Task**: Write machine-readable results to `reports/bench.json` and human-readable results to `reports/bench.md`.

  **Mechanics**: JSON supports later comparison tools. Markdown gives the reader a quick inspection path.

  **Hint**: Mention sync mode, dataset size, and whether checksums were enabled.

  **Checkpoint**: Both report files exist after `npm run bench`.

### Run

```sh
npm run bench
cat reports/bench.md
```

### Expected behavior

The benchmark completes without manual setup. `reports/bench.md` includes ops/sec, file size, memory, and recovery time.

### Hints

Benchmarks that append to old data produce misleading numbers. Reset benchmark data first.

### Debugging notes

Recovery benchmark should corrupt a copy of a valid segment or generate a fresh segment for that case.

### Checkpoint

`reports/bench.md` and `reports/bench.json` exist. The report includes ops/sec, file size, memory, and recovery time.

### Reflection

Write the storage rule this lab taught you.
