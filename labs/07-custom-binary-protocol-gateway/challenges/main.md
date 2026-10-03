# Custom Binary Protocol Gateway

Build a TCP gateway that accepts a custom binary protocol, decodes frames across arbitrary socket chunk boundaries, validates malformed input, and forwards normalized events to file or HTTP sinks. The finished project has a documented wire format, a client encoder, a stateful parser, connection lifecycle accounting, backpressure propagation, metrics, graceful shutdown, a load generator, and a final report based on real run data.

Use Node v24. Keep the dependency list small. Core modules cover the interesting parts: `node:net`, `node:fs`, `node:stream`, `node:http`, `node:perf_hooks`, `node:zlib`, and the built-in `fetch()`.

## Phase 0: Create The Project

### Goal

Create the protocol gateway project shell with runnable server and client modes.

### Why this matters

The gateway will end up with several moving pieces: a server, protocol constants, a parser, client tools, sinks, reports, and load tests. A clean directory layout keeps generated state away from source files and gives every later phase a predictable place to write output.

The CLI is the project boundary. Every phase should add one observable command or one visible report field.

### Build

#### Step 1: Create the project manifest

**Task**

Create `package.json`. Configure the project for ECMAScript modules and Node v24 or newer.

**Mechanics**

The gateway will use current Node APIs such as built-in `fetch()`, `node:zlib` checksum helpers, and core test runner behavior. The module format and runtime floor should be explicit before source files exist.

**Hint**

Look for the manifest fields that answer two questions: how Node should treat `.js` files, and which Node version the project targets.

**Checkpoint**

Opening `package.json` shows `"type": "module"` and an engine requirement for Node v24 or newer.

#### Step 2: Create the project folders

**Task**

Create `src/`, `client/`, `data/`, `reports/`, `docs/`, and `test/`.

**Mechanics**

The server, clients, generated event data, reports, protocol documentation, and tests have different lifetimes. Separate folders keep runtime output away from implementation files.

**Hint**

Give each folder one job. `src/` owns gateway code. `client/` owns producers. `data/` holds generated payloads and sink output. `reports/` holds evidence. `docs/` holds the wire-format contract. `test/` holds assertions.

**Checkpoint**

Each folder exists, and you can say what belongs in it without opening the lab text.

#### Step 3: Create the gateway CLI entrypoint

**Task**

Create `src/cli.js` as the main command router. Add a default overview and a `--help` path.

**Mechanics**

The CLI is the stable surface for every later phase. The server, protocol printer, report generator, and metrics helper should hang off one predictable entrypoint.

**Hint**

Keep this file small. It should inspect `process.argv.slice(2)`, choose a command, and delegate.

**Checkpoint**

Running `node src/cli.js --help` prints a useful overview and exits with code `0`.

#### Step 4: Add placeholder command modes

**Task**

Add command names for `server`, `client`, `protocol`, `encode`, `decode`, `receiver`, `load`, and `report`.

**Mechanics**

The command list is the lab map. Some commands can point at placeholder handlers now, then gain behavior as the phases fill in.

**Hint**

For incomplete modes, print a clear "not implemented yet" message and set `process.exitCode = 1`.

**Checkpoint**

Known command names reach deliberate handlers. Unknown command names fail clearly.

#### Step 5: Add npm scripts

**Task**

Add scripts for `gateway`, `server`, `client`, `protocol`, `encode`, `decode`, `receiver`, `load`, `report`, and `test`.

**Mechanics**

The lab should be runnable through the same commands from start to finish. npm scripts also document the command names a reader will use later.

**Hint**

Point scripts at the eventual file paths even if some files still contain placeholders.

**Checkpoint**

`npm run gateway -- --help` works, and `npm run gateway -- server --help` reaches server help.

#### Step 6: Reject bad flags

**Task**

Make the overview command accept `--help` and reject unknown flags.

**Mechanics**

Exit codes are part of the interface. Help output is success. Misspelled flags are user input errors and should go to stderr.

**Hint**

Build a tiny allowed-flag set. For now, the overview command probably accepts only `--help`.

**Checkpoint**

`npm run gateway -- --help` exits with code `0`. `npm run gateway -- --wat` exits with a failure code and prints a clear error.

### Run

```sh
npm run gateway -- --help
```

### Expected behavior

The command prints help text that includes `server`, `client`, `protocol`, `encode`, `decode`, `load`, and `report`.

`npm run gateway -- server --help` prints server options. `npm run gateway -- client --help` prints client options.

### Hints

- Treat `src/cli.js` as a command dispatcher. Keep the future server implementation in `src/server.js`.
- Use small helpers such as `readFlag(args, "--port", "41234")` and `hasFlag(args, "--help")`.
- Set `process.exitCode = 1` for expected CLI errors.

### Debugging notes

- If `--help` disappears, add the `--` separator after the npm script name.
- If Node rejects `import`, check `"type": "module"`.
- If a script path fails, run `node src/cli.js --help` directly before fixing the npm script.

### Checkpoint

The project has `src/`, `client/`, `data/`, `reports/`, and `docs/`. The gateway CLI exposes server and client modes. Help output exits with code `0`.

### Reflection

Explain why a custom protocol puts byte ownership in your code instead of in a framework parser.

## Phase 1: Define The Binary Protocol

### Goal

Define the binary frame layout, publish it in `docs/protocol.md`, and print the layout from code.

### Why this matters

TCP delivers ordered bytes. Application messages exist only after your parser reconstructs them. The protocol has to tell the parser where one frame begins, how long the payload is, which version produced it, and whether the bytes survived transport and user-space handling.

A binary protocol becomes readable through offsets. Once offsets are constants, the encoder, decoder, server, tests, and documentation can share one source of truth.

### Build

#### Step 1: Create the protocol constants module

**Task**

Create `src/protocol.js`. Export `MAGIC`, `VERSION`, `HEADER_SIZE`, frame type constants, and `MAX_PAYLOAD_BYTES`.

**Mechanics**

The encoder, decoder, tests, and protocol printer need the same offsets and limits. One constants module keeps the wire format from drifting across files.

**Hint**

Start with `MAGIC = Buffer.from("NBGW", "ascii")`, `VERSION = 1`, `HEADER_SIZE = 24`, and `MAX_PAYLOAD_BYTES = 1_048_576`.

**Checkpoint**

Importing `src/protocol.js` exposes the protocol constants without running the server.

#### Step 2: Define the frame types

**Task**

Add constants for `TYPE_EVENT`, `TYPE_HEARTBEAT`, `TYPE_ACK`, and `TYPE_ERROR`.

**Mechanics**

The frame type byte lets the parser route the payload without inspecting JSON first. That byte also gives the gateway room to ACK, reject, and keep connections alive later.

**Hint**

Use small integer values: event `1`, heartbeat `2`, ack `3`, error `4`.

**Checkpoint**

The protocol printer can list every frame type with its numeric value.

#### Step 3: Document the header layout

**Task**

Create `docs/protocol.md` and describe this header layout:

```txt
0   4   magic bytes
4   1   version
5   1   frame type
6   2   flags
8   8   request id
16  4   payload length
20  4   checksum
24  ... payload bytes
```

**Mechanics**

The documentation is the contract between client and server code. Offsets, byte widths, byte order, and validation rules belong there.

**Hint**

Write the table so someone could implement a decoder from the document alone.

**Checkpoint**

`docs/protocol.md` includes offset, width, field name, type, meaning, and validation rule for every header field.

#### Step 4: Choose byte order and payload format

**Task**

Specify big-endian numeric fields, unsigned 64-bit request ids, and UTF-8 JSON payloads for event frames.

**Mechanics**

The parser needs one numeric convention. The payload is still text JSON, but the boundary around it is binary: payload length decides how many bytes belong to the JSON document.

**Hint**

Keep JSON inside the payload. Keep frame metadata in fixed header fields.

**Checkpoint**

The protocol document states where numbers live and where JSON begins.

#### Step 5: Define checksum rules

**Task**

Define the checksum as the CRC value for the header with the checksum field set to zero plus the payload bytes.

**Mechanics**

The checksum gives the decoder a cheap integrity check before accepting a frame. The checksum field itself has to be zeroed during calculation so both sides hash the same bytes.

**Hint**

Use `crc32()` from `node:zlib` in Node v24. Keep a helper for "frame bytes with zero checksum" rather than duplicating the rule.

**Checkpoint**

The protocol document describes exactly which bytes participate in checksum calculation.

#### Step 6: Print the protocol layout

**Task**

Make `npm run protocol` print a generated table with offset, width, field, type, and validation rule.

**Mechanics**

Generated output catches drift between code and documentation. The printer should read constants, not duplicate magic numbers.

**Hint**

Represent the layout as an array of field descriptors and print from that array.

**Checkpoint**

`npm run protocol` prints `HEADER_SIZE = 24`, `NBGW`, version `1`, frame types, and the max payload size.

### Run

```sh
npm run protocol
```

### Expected behavior

The command prints `HEADER_SIZE = 24`, the four magic bytes, the supported version, frame types, and the max payload size.

`docs/protocol.md` exists and contains the same layout.

### Hints

- Use `Buffer.from("NBGW", "ascii")` for the magic bytes.
- Use `readUInt8`, `readUInt16BE`, `readUInt32BE`, and `readBigUInt64BE` for numeric reads.
- Keep the two flag bytes zero until a later extension needs them.
- Use `crc32()` from `node:zlib` for the checksum in Node v24.

### Debugging notes

- A header constant copied into multiple files will drift. Export constants and import them everywhere.
- JSON payloads keep the event shape inspectable while the frame still exercises binary parsing.
- A payload length cap belongs in the protocol layer. Waiting until allocation time leaves the server exposed to huge advertised lengths.

### Checkpoint

`docs/protocol.md` exists. `npm run protocol` prints all fields and validation rules. The header size equals `24`.

### Reflection

Explain why length prefixes are common in binary protocols that run over TCP.

## Phase 2: Encode Client Frames

### Goal

Build a client-side encoder that turns an event object into one valid binary frame.

### Why this matters

The server needs realistic input before the parser exists. The encoder also proves the protocol document has enough detail for another process to produce bytes.

Encoding is where JavaScript values become offsets and byte ranges. The request id, payload length, checksum, and payload bytes all need fixed positions.

### Build

#### Step 1: Create the encoder module

**Task**

Create `client/encode.js` and export `encodeFrame({ type, requestId, payload, flags })`.

**Mechanics**

The encoder owns the conversion from JavaScript values to protocol bytes. Later client tools should call it instead of rebuilding frame headers.

**Hint**

Import protocol constants from `src/protocol.js`. Avoid duplicated offsets.

**Checkpoint**

`encodeFrame()` can be imported from a test file without running the client CLI.

#### Step 2: Build an event payload

**Task**

Accept a name, request id, and optional attributes. Build a payload object with `name`, `timestamp`, and `attributes`.

**Mechanics**

The payload is application data. The header is transport metadata for the custom protocol. Keeping those separate makes decode behavior easier to test.

**Hint**

Use an ISO timestamp or epoch milliseconds. Pick one and keep it consistent in tests.

**Checkpoint**

The payload object can be stringified before any Buffer allocation happens.

#### Step 3: Convert payload JSON to bytes

**Task**

Convert the payload object to JSON and then to a UTF-8 Buffer.

**Mechanics**

The payload length field counts bytes, not JavaScript characters. The Buffer length is the number the header should advertise.

**Hint**

Call `Buffer.from(json, "utf8")` once and reuse that Buffer for length, checksum, and payload copy.

**Checkpoint**

The payload byte length used in the header equals the Buffer length.

#### Step 4: Allocate and fill the frame

**Task**

Allocate `HEADER_SIZE + payloadBytes.length` bytes. Write magic, version, type, flags, request id, payload length, a zero checksum, and then the payload bytes.

**Mechanics**

Every field has one offset. A local `offset` variable makes the encoder's writes auditable.

**Hint**

Convert `requestId` with `BigInt(requestId)` before `writeBigUInt64BE()`.

**Checkpoint**

After writing the header, the offset equals `HEADER_SIZE`. After copying the payload, the offset equals `frame.length`.

#### Step 5: Compute and write the checksum

**Task**

Compute the checksum after the frame bytes exist, then write the checksum into the checksum field.

**Mechanics**

Both client and server must hash the same byte sequence. The checksum bytes are zero during calculation and filled only after calculation.

**Hint**

Write a helper that temporarily treats bytes `20..23` as zero for checksum calculation.

**Checkpoint**

Encoding the same event twice with the same timestamp and request id produces the same checksum.

#### Step 6: Add a hex dump CLI

**Task**

Make the encode command print offset, hex bytes, ASCII preview, computed frame length, and expected frame length.

```sh
npm run encode -- --name user.login --request-id 42
```

**Mechanics**

The hex dump is the first way to inspect the wire format without a server.

**Hint**

Print 16 bytes per line. Show the byte offset at the start of each line.

**Checkpoint**

`npm run encode -- --name user.login --request-id 42` prints a frame and the total length.

#### Step 7: Test the encoder

**Task**

Add `test/encode-frame.test.js` for header fields, payload placement, and checksum stability.

**Mechanics**

Encoding bugs are cheap to catch before sockets exist. Tests should read bytes from the returned Buffer and compare them with protocol constants.

**Hint**

Use Node's built-in test runner and `node:assert/strict`.

**Checkpoint**

`npm test` passes for request id, frame type, payload length, payload content, and checksum.

### Run

```sh
npm run encode -- --name user.login --request-id 42
npm test
```

### Expected behavior

The encode command prints a hex dump. The reported encoded length equals `24 + payload byte length`.

The tests pass and prove the header fields match the protocol constants.

### Hints

- Use `BigInt(requestId)` before `writeBigUInt64BE()`.
- Keep a local `offset` variable while writing the header. Assert it ends at `HEADER_SIZE`.
- Convert payload JSON once. Use the resulting Buffer for length, checksum, and copy.

### Debugging notes

- String length and byte length can differ. Use `Buffer.byteLength(json, "utf8")` or the payload Buffer length.
- A checksum computed before the payload copy can still be correct if it uses the payload Buffer directly.
- A checksum computed with the checksum bytes already filled will fail on decode.

### Checkpoint

The encoder can produce a valid event frame. The encoded length equals header size plus payload size. Tests verify the request id, frame type, payload length, and checksum.

### Reflection

Explain where numbers and strings live inside the Buffer after encoding.

## Phase 3: Decode Complete Frames

### Goal

Parse one complete binary frame from a Buffer and return the normalized event.

### Why this matters

The complete-buffer case gives the parser a controlled starting point. It exercises offset handling, numeric reads, JSON payload decoding, checksum verification, and structured errors before socket chunking adds state.

Parser bugs usually start as one wrong offset. Keep the byte cursor explicit.

### Build

#### Step 1: Create the complete-frame decoder

**Task**

Create `src/frame-decode.js` and export `decodeFrame(buffer)`.

**Mechanics**

The decoder owns one complete frame. It should validate and decode one frame, then report how many bytes it consumed. Stateful socket parsing comes later.

**Hint**

Return `type`, `requestId`, `flags`, `payloadLength`, `payload`, and `consumedBytes`.

**Checkpoint**

Calling `decodeFrame()` with one encoded frame returns an object and does not mutate the input Buffer.

#### Step 2: Guard the fixed header reads

**Task**

Reject Buffers shorter than `HEADER_SIZE` before reading any fixed field.

**Mechanics**

Buffer read methods require valid offsets. The decoder should fail with a controlled protocol error instead of throwing a low-level range error.

**Hint**

Use a custom error class now, even if Phase 8 expands the full error hierarchy.

**Checkpoint**

A 10-byte Buffer fails through your protocol error path.

#### Step 3: Validate fixed header fields

**Task**

Validate magic bytes, version, frame type, and flags.

**Mechanics**

These fields tell the decoder whether it is reading your protocol and which payload rules apply.

**Hint**

Use `Buffer.compare()` for magic bytes. Keep supported versions and frame types in protocol constants.

**Checkpoint**

Bad magic, bad version, and unknown frame type tests fail with distinct error codes.

#### Step 4: Validate length and checksum

**Task**

Read payload length, reject values above `MAX_PAYLOAD_BYTES`, and verify the checksum.

**Mechanics**

Length validation protects allocation and slicing. Checksum validation protects acceptance of corrupted or tampered bytes.

**Hint**

Calculate `frameEnd = HEADER_SIZE + payloadLength` and require `buffer.length >= frameEnd` for this complete-frame decoder.

**Checkpoint**

A frame with a modified payload byte fails checksum validation.

#### Step 5: Decode payload JSON

**Task**

Decode UTF-8 JSON payloads for event, ACK, and error frames. Keep heartbeat payloads empty or JSON-free.

**Mechanics**

The payload becomes application data only after the frame passes structural validation.

**Hint**

Use `buffer.subarray(HEADER_SIZE, frameEnd)` for the payload slice, then convert to text for `JSON.parse()`.

**Checkpoint**

An event frame returns the original event name and attributes.

#### Step 6: Add a decode CLI

**Task**

Create `src/decode-one.js`. Make `npm run decode -- <hex>` decode a frame copied from the encoder output.

**Mechanics**

The decode CLI gives you a manual round-trip path before sockets exist.

**Hint**

Normalize the pasted hex by removing spaces and line breaks before `Buffer.from(hex, "hex")`.

**Checkpoint**

An encoded frame copied into the decode command prints the same request id and event name.

#### Step 7: Add round-trip tests

**Task**

Add `test/frame-roundtrip.test.js` that imports the client encoder and server decoder.

**Mechanics**

Round-trip tests verify the protocol from both sides. The encoder writes the contract. The decoder reads it.

**Hint**

Use a deterministic timestamp in the event payload so assertions stay stable.

**Checkpoint**

`npm test` passes for one valid frame and one bad-checksum frame.

### Run

```sh
npm run encode -- --name user.login --request-id 42
npm run decode -- <hex-from-encode>
npm test
```

### Expected behavior

The decoded frame matches the original event name, request id, type, and payload attributes.

Round-trip tests pass.

### Hints

- Return `consumedBytes: HEADER_SIZE + payloadLength`.
- Use `buffer.subarray()` for the payload while decoding, then convert to string when parsing JSON.
- Copy tiny retained payloads only if you store them past the current parse operation.
- Use custom error classes now. Phase 8 will reuse them.

### Debugging notes

- `Buffer.compare()` is safer than converting magic bytes to text at every parse.
- JSON parse failures are protocol errors for event frames.
- Check `buffer.length >= HEADER_SIZE` before reading any fixed field.

### Checkpoint

One complete encoded frame decodes back to the original event. Bad checksum tests fail through a controlled protocol error.

### Reflection

Explain why a parser needs strict offset handling.

## Phase 4: Build The TCP Server

### Goal

Accept TCP socket connections and log connection lifecycle events.

### Why this matters

The gateway becomes a network program when `server.listen()` succeeds. Node creates a listening socket below the JavaScript `net.Server`, and accepted peers arrive as `net.Socket` objects.

For this phase, the server only observes bytes. Parsing starts after the connection path is visible.

### Build

#### Step 1: Create the server module

**Task**

Create `src/server.js` and export a function that starts the TCP server.

**Mechanics**

The CLI should choose server mode. The server module should own `net.createServer()`, socket listeners, and server lifecycle.

**Hint**

Return the `net.Server` instance from the start function so later phases can close it during shutdown.

**Checkpoint**

`src/cli.js` can import and call the server module without embedding server logic in the CLI router.

#### Step 2: Add server flags

**Task**

Support `--host`, `--port`, `--sink`, and `--idle-timeout-ms`.

**Mechanics**

These flags become configuration state for the server. Defaults should be visible in help output.

**Hint**

Start with defaults: host `127.0.0.1`, port `41234`, sink `stdout`, idle timeout `30000`.

**Checkpoint**

`npm run server -- --help` lists every server flag and its default.

#### Step 3: Listen with `node:net`

**Task**

Use `net.createServer()` and `server.listen()` to accept TCP connections.

**Mechanics**

`server.listen()` creates the lower listening socket. Each accepted peer arrives as a `net.Socket`.

**Hint**

Log the actual address from `server.address()` after the `listening` event fires.

**Checkpoint**

`npm run server -- --port 41234` prints a listening line with host and port.

#### Step 4: Create structured connection logs

**Task**

Create `src/logger.js`. Log `connection.open` and `connection.close` as structured JSON lines.

**Mechanics**

The gateway needs machine-readable logs before reports exist. Connection open and close records are the first lifecycle evidence.

**Hint**

Include `connectionId`, remote address, remote port, local port, timestamp, bytes read, frames read, and close reason when available.

**Checkpoint**

Opening and closing a TCP client produces one open log and one close log.

#### Step 5: Track bytes on each socket

**Task**

On every `data` event, add `chunk.length` to the connection byte counter.

**Mechanics**

The server is observing raw bytes in this phase. Frame parsing has not started, so byte count is the only input invariant.

**Hint**

Store connection state in a `Map` keyed by socket or connection id.

**Checkpoint**

Sending any bytes to the socket changes the connection byte count.

#### Step 6: Handle server and socket errors

**Task**

Add `error` handlers on the server and every accepted socket.

**Mechanics**

Network errors are normal socket lifecycle events. Without handlers, an expected socket error can terminate the process.

**Hint**

For bind failures, include `error.code` in the message. For socket errors, store the code as the probable close reason.

**Checkpoint**

Starting two servers on the same port reports `EADDRINUSE` cleanly.

### Run

```sh
npm run server -- --port 41234
```

### Expected behavior

The server prints a listening log line with host and port.

Connecting with a TCP client opens and closes a connection without crashing the server.

### Hints

- Keep a `Map` of active connections.
- Set `socket.setNoDelay(true)` so tiny test frames are easier to observe.
- Use `server.on("error")` for bind failures such as `EADDRINUSE`.

### Debugging notes

- `server.close()` stops new accepts. Existing sockets have their own lifecycle.
- A socket can emit `error` before `close`. Record both, then choose one close reason.
- Port `0` is useful for tests, but a fixed port is easier for manual runs.

### Checkpoint

Connection and disconnection events are logged. Byte counts update when raw data arrives.

### Reflection

Explain how `net.Socket` relates to Node stream APIs in this gateway.

## Phase 5: Send Frames From A TCP Client

### Goal

Send one encoded frame from a TCP client to the server.

### Why this matters

The frame now crosses the socket boundary. The client writes one Buffer. The server receives one or more `data` chunks depending on stream reads and kernel buffering.

The byte count is the first end-to-end invariant.

### Build

#### Step 1: Create the TCP send client

**Task**

Create `client/send.js` and connect with `net.createConnection()`.

**Mechanics**

The client is a separate process that writes real bytes into the server socket. That gives the server the same input path it will see under load.

**Hint**

Keep client connection setup small: host, port, connect callback, error handler, close handler.

**Checkpoint**

The client can connect to a running server and exit cleanly.

#### Step 2: Reuse the frame encoder

**Task**

Import `encodeFrame()` and build one event frame from CLI flags.

**Mechanics**

Client sending should exercise the same bytes as the hex dump from Phase 2. A second encoder would create two protocol implementations.

**Hint**

Start with flags for `--name`, `--request-id`, and `--payload-bytes`.

**Checkpoint**

The frame length printed by `client/send.js` matches the frame length printed by `client/encode.js` for the same event.

#### Step 3: Add connection flags

**Task**

Support `--host`, `--port`, `--name`, `--request-id`, `--count`, and `--payload-bytes`.

**Mechanics**

These flags let the same client drive later server phases without rewriting the producer.

**Hint**

Use default host `127.0.0.1`, port `41234`, name `sample.event`, request id `1`, count `1`, and payload bytes `0`.

**Checkpoint**

`npm run client -- --help` lists the flags and defaults.

#### Step 4: Write the frame and end the socket

**Task**

Write the encoded frame to the socket. End the socket after the write callback fires.

**Mechanics**

The write callback tells you Node accepted the bytes through the writable stream path. Ending after that keeps the test connection short and repeatable.

**Hint**

Print `bytesWritten`, `requestId`, and `frame.length` before closing.

**Checkpoint**

The client reports one frame written and exits with code `0`.

#### Step 5: Compare server and client byte counts

**Task**

Update the server `data` handler to log the per-connection byte count.

**Mechanics**

The byte count is the first end-to-end assertion. Parsing can be wrong later, but bytes sent and bytes read should match for this simple run.

**Hint**

Use your own counter or `socket.bytesRead`. Your own counter is easier to include in connection state later.

**Checkpoint**

The server close log reports the same byte count as the client frame length.

### Run

```sh
npm run server -- --port 41234
npm run client -- --port 41234 --name user.login
```

### Expected behavior

The client reports one frame written.

The server reports the same number of received bytes as the client's encoded frame length.

### Hints

- Print the encoded frame length before connecting.
- Use the write callback to observe when the Buffer has left the writable stream queue.
- Keep client process errors visible with `socket.on("error")`.

### Debugging notes

- A successful `socket.write()` call means Node accepted the bytes into the stream write path.
- The server may receive the bytes in chunks that differ from the client's write calls.
- If the client exits before writing, check that the connection callback fired.

### Checkpoint

The byte count observed by the server matches the encoded frame length sent by the client.

### Reflection

Explain why receiving bytes is separate from receiving a complete message.

## Phase 6: Handle Partial Packets

### Goal

Parse frames split across multiple TCP chunks.

### Why this matters

TCP read chunks are produced by stream reads from the socket receive buffer. They are application byte ranges. The parser has to carry incomplete bytes between `data` events until a whole frame is available.

The carry buffer is parser state. It belongs to one connection.

### Build

#### Step 1: Create the connection parser module

**Task**

Create `src/connection-parser.js` and export `pushChunk(state, chunk)`.

**Mechanics**

The decoder from Phase 3 handles a complete frame. The connection parser owns incomplete input across socket `data` events.

**Hint**

Keep the parser state as a plain object. The server can store one state object per connection.

**Checkpoint**

`pushChunk()` can be tested without starting a TCP server.

#### Step 2: Add per-connection parser state

**Task**

Store `carry`, `framesRead`, `bytesRead`, `lastActivityAt`, and `protocolErrors` for each connection.

**Mechanics**

Carry bytes belong to one peer. Sharing carry state across sockets would mix byte streams and corrupt parsing.

**Hint**

Initialize `carry` as an empty Buffer and update timestamps inside the server data handler.

**Checkpoint**

Each connection has its own parser state object in the active-connection map.

#### Step 3: Merge carry and new chunks

**Task**

Inside `pushChunk()`, combine `state.carry` with the new chunk only when carry has bytes.

**Mechanics**

Chunk boundaries are arbitrary. A header can start in one `data` event and finish in the next.

**Hint**

Use the new chunk directly when `state.carry.length === 0`. Use `Buffer.concat()` only when needed.

**Checkpoint**

An incomplete header remains in `state.carry` until more bytes arrive.

#### Step 4: Wait for complete frames

**Task**

Read the payload length only after `HEADER_SIZE` bytes exist. Decode only after `HEADER_SIZE + payloadLength` bytes exist.

**Mechanics**

The length field tells the parser how many bytes are required for the full frame. Until that many bytes are present, the parser should return no frames.

**Hint**

Return `{ frames: [], remainingBytes: state.carry.length }` when input is incomplete.

**Checkpoint**

Half a frame produces zero decoded events and a non-empty carry buffer.

#### Step 5: Emit normalized events

**Task**

When a full frame exists, call `decodeFrame()` and emit one normalized event into the server path.

**Mechanics**

The parser should return decoded frames; the server decides where those frames go next.

**Hint**

Keep normalization small for now: connection id, request id, frame type, payload, and received timestamp.

**Checkpoint**

One valid frame split across chunks emits exactly one event.

#### Step 6: Add chunked client sending

**Task**

Add `--chunk-size` and `--chunk-delay-ms` to the client. When `--chunk-size 1` is set, send one byte per write.

**Mechanics**

The client writes one byte per `socket.write()` call in this mode. The server may still receive larger `data` chunks because TCP and Node stream reads can coalesce writes. The deterministic parser proof is the unit test that calls `pushChunk()` with one byte at a time.

**Hint**

Use `frame.subarray(offset, offset + chunkSize)` for each write.

**Checkpoint**

`npm run client -- --chunk-size 1` still produces one server event. The client write size is fixed; the server read chunk size is transport-dependent.

#### Step 7: Test one-byte parsing

**Task**

Add tests that feed one encoded frame into `pushChunk()` one byte at a time.

**Mechanics**

Socket behavior can vary by machine. The unit test gives you deterministic chunk boundaries.

**Hint**

Loop over the encoded frame and call `pushChunk(state, frame.subarray(i, i + 1))`.

**Checkpoint**

The test sees zero events until the final byte and one event after the final byte.

### Run

```sh
npm run server -- --port 41234
npm run client -- --port 41234 --name tiny.chunks --chunk-size 1
npm test
```

### Expected behavior

The server emits exactly one complete event from one frame sent with one-byte client writes.

The parser test passes with one byte per push.

### Hints

- Keep parser state outside `decodeFrame()`. The decoder can stay focused on complete frames.
- Return an empty `frames` array when the buffer has an incomplete header or incomplete payload.
- Cap carry size. A client advertising a huge payload should hit a protocol error before memory grows.
- Add `--chunk-delay-ms` during manual runs when you want the server logs to show smaller reads more often.

### Debugging notes

- Repeated `Buffer.concat()` on every byte is expensive. For the lab, correctness comes first; later phases can reduce copies.
- Log carry length at debug level while testing chunk boundaries.
- If one-byte tests produce many events, the loop is decoding without waiting for the full payload.

### Checkpoint

The parser works with one-byte pushes and emits one event for one encoded frame.

### Reflection

Explain the carry buffer and why the gateway needs it.

## Phase 7: Handle Multiple Frames In One Chunk

### Goal

Parse several frames from one received Buffer.

### Why this matters

Several client writes can arrive inside one `data` event. The parser must keep decoding while complete frames remain, then retain only the incomplete tail.

The receive buffer has two valid parser outcomes: it can end before a full frame, or it can contain bytes after a full frame. Both paths matter.

### Build

#### Step 1: Loop over complete frames

**Task**

Update `pushChunk(state, chunk)` so it keeps decoding while the buffer contains a full frame.

**Mechanics**

One `data` event can hold several application frames. The parser should consume all complete frames before saving the tail.

**Hint**

Use an `offset` variable. After every successful decode, add `decoded.consumedBytes`.

**Checkpoint**

Two concatenated frames produce two decoded events from one `pushChunk()` call.

#### Step 2: Preserve the incomplete tail

**Task**

After the decode loop stops, store only the unconsumed tail in `state.carry`.

**Mechanics**

The parser needs leftover bytes for the next chunk. It should release bytes that already became frames.

**Hint**

Use `buffer.subarray(offset)` after the loop and assign that to carry.

**Checkpoint**

One-and-a-half frames across two pushes emits one event first and one event after the next push.

#### Step 3: Add multi-frame client modes

**Task**

Add `--count`, `--burst`, and `--same-write` to `client/send.js`.

**Mechanics**

`--same-write` tests coalesced frames. `--burst` tests many writes without waiting between them.

**Hint**

For `--same-write`, encode all frames, concatenate them, and call `socket.write()` once.

**Checkpoint**

`npm run client -- --count 50 --same-write` sends 50 frames through one write call.

#### Step 4: Count decoded frames on the server

**Task**

Track `framesReceived`, `eventsEmitted`, and `framesPerConnection`.

**Mechanics**

Byte count proves transport input. Frame count proves parser output.

**Hint**

Increment global counters and the connection state when `pushChunk()` returns frames.

**Checkpoint**

The connection close log reports `framesRead: 50` after a 50-frame run.

#### Step 5: Add combined-buffer tests

**Task**

Add tests for two full frames in one Buffer and one-and-a-half frames across two pushes.

**Mechanics**

These tests prove both parser paths: extra complete data and incomplete tail data.

**Hint**

Build the one-and-a-half input by slicing the second frame at a non-header boundary.

**Checkpoint**

`npm test` passes for combined frames and split tails.

### Run

```sh
npm run server -- --port 41234
npm run client -- --port 41234 --count 50 --same-write
npm test
```

### Expected behavior

The server emits 50 events. The connection close log reports `framesRead: 50`.

The parser tests pass for combined frames and split tails.

### Hints

- Keep `offset` and `buffer.length` visible in the loop.
- Break the loop as soon as the next full frame is unavailable.
- Assert that consumed bytes never move backward and never exceed `buffer.length`.

### Debugging notes

- A loop that never advances `offset` will pin the event loop.
- A parser that drops the tail will lose the first bytes of the next frame.
- A parser that stores the whole original buffer after consuming frames will retain extra memory.

### Checkpoint

Frame count on the server matches the client count for combined writes and burst writes.

### Reflection

Explain why parsers need separate incomplete-data and extra-data paths.

## Phase 8: Validate Malformed Input

### Goal

Reject bad magic bytes, unsupported versions, invalid lengths, unknown frame types, and checksum failures.

### Why this matters

Protocol servers receive invalid bytes during normal operation. Bad clients, version drift, fuzzers, probes, and truncated connections all hit the same parser boundary.

The gateway needs a policy for every validation failure: record it, close the connection, quarantine the connection for more errors, or keep reading.

### Build

#### Step 1: Create protocol error classes

**Task**

Create `src/protocol-errors.js` with `ProtocolError`, `BadMagicError`, `UnsupportedVersionError`, `InvalidLengthError`, `UnknownFrameTypeError`, `ChecksumMismatchError`, and `InvalidPayloadError`.

**Mechanics**

Stable error codes let logs, reports, and tests identify failures without matching prose.

**Hint**

Give each error a `code` string and a `details` object. Keep `message` readable for terminal logs.

**Checkpoint**

Each error class can be constructed with details and exposes a stable `code`.

#### Step 2: Route decoder failures through protocol errors

**Task**

Update `decodeFrame()` and `pushChunk()` so validation failures use the protocol error classes.

**Mechanics**

The server should see one failure shape from parser code, whether the cause is bad magic, length, checksum, type, or payload.

**Hint**

Catch JSON parse errors and wrap them as `InvalidPayloadError`.

**Checkpoint**

Tests can assert `error.code` for every malformed frame type.

#### Step 3: Add malformed connection policy flags

**Task**

Support `--max-protocol-errors` and `--malformed-policy close|quarantine`.

**Mechanics**

The server policy decides what happens after a parser failure. The parser detects the failure; the connection manager enforces the policy.

**Hint**

Use default max errors `1`. Start with `close` because it is easier to reason about.

**Checkpoint**

Server help lists both malformed-input flags.

#### Step 4: Enforce close and quarantine behavior

**Task**

On `close`, log the error and destroy the socket. On `quarantine`, keep the connection open until error count reaches the configured limit.

**Mechanics**

Close behavior protects the server quickly. Quarantine behavior gives you a controlled way to observe repeated bad frames from one peer.

**Hint**

Store `protocolErrors` on connection state and set `closeReason` before destroying the socket.

**Checkpoint**

One bad frame closes the socket when policy is `close`.

#### Step 5: Add malformed client modes

**Task**

Add `--malformed bad-magic`, `bad-version`, `huge-length`, `bad-checksum`, and `bad-json`.

**Mechanics**

The same client should be able to produce valid and invalid protocol input. That keeps error testing on the real socket path.

**Hint**

Start from a valid encoded frame, then mutate the byte or field needed for each mode.

**Checkpoint**

Each malformed mode produces the expected protocol error code on the server.

#### Step 6: Write protocol error reports

**Task**

Append protocol errors to `reports/protocol-errors.jsonl`.

**Mechanics**

Malformed input should leave durable evidence for the final report.

**Hint**

Include `connectionId`, `remoteAddress`, `requestId` when available, `code`, `details`, and timestamp.

**Checkpoint**

One malformed client run appends one JSON line to `reports/protocol-errors.jsonl`.

#### Step 7: Test the error paths

**Task**

Add tests for every error class and malformed frame mode.

**Mechanics**

Malformed input is part of the protocol surface. It deserves the same assertion quality as valid frames.

**Hint**

Build malformed frames by cloning valid frames with `Buffer.from(frame)` and mutating one field.

**Checkpoint**

`npm test` passes for bad magic, bad version, huge length, bad checksum, unknown type, and bad JSON.

### Run

```sh
npm run server -- --port 41234 --malformed-policy close
npm run client -- --port 41234 --malformed bad-checksum
npm test
```

### Expected behavior

The server logs a protocol error with a stable code, closes or quarantines according to policy, and keeps running for the next connection.

`reports/protocol-errors.jsonl` receives one JSON line per protocol error.

### Hints

- Include `connectionId`, `remoteAddress`, `requestId` when available, and `byteOffset` when useful.
- For `huge-length`, reject the frame after reading the header. Skip payload allocation.
- Treat invalid JSON as an invalid payload for event frames.

### Debugging notes

- Closing a socket from inside a `data` handler can still result in a later `close` event.
- Destroying a socket with an error may emit `error`; log once by using a close-state flag.
- A checksum mismatch test should modify one payload byte after checksum calculation.

### Checkpoint

Malformed input produces controlled protocol errors. The server process remains available after bad clients disconnect.

### Reflection

Explain why malformed input belongs in the normal operating model for a protocol server.

## Phase 9: Add Connection Lifecycle Management

### Goal

Track connection state, idle timeouts, and close reasons.

### Why this matters

Long-running servers need to account for every open socket. Each connection has its own byte counts, frame counts, last activity timestamp, error count, and close path.

An open socket is an active handle. A ref'd socket keeps the Node process alive until it closes, gets destroyed, or becomes unref'd by explicit policy.

### Build

#### Step 1: Create the connection state module

**Task**

Create `src/connection-state.js` with helpers for creating, updating, and finalizing connection state.

**Mechanics**

Connection state now has enough fields that it should stop living as ad hoc properties inside the server file.

**Hint**

Use one creation helper that accepts the socket and returns a plain object.

**Checkpoint**

The server creates connection state through the helper for every accepted socket.

#### Step 2: Store lifecycle fields

**Task**

Track `id`, `remoteAddress`, `remotePort`, `openedAt`, `lastActivityAt`, `bytesRead`, `framesRead`, `protocolErrors`, `backpressurePauses`, and `closeReason`.

**Mechanics**

These fields explain what a connection did and why it closed. Later reports should not reconstruct this from scattered logs.

**Hint**

Use ISO strings for report timestamps and monotonic times for duration calculations.

**Checkpoint**

A connection close record includes all lifecycle fields.

#### Step 3: Add idle timeout handling

**Task**

Use `socket.setTimeout(idleTimeoutMs)` and handle the socket `timeout` event.

**Mechanics**

The timeout event is a notification. Your code decides the close reason and closes the socket.

**Hint**

Set `closeReason = "idle-timeout"` before ending or destroying the socket.

**Checkpoint**

An idle client closes after the configured timeout.

#### Step 4: Finalize connections once

**Task**

Create a `finalizeConnection(state, reason)` path and call it from normal close, error close, protocol close, and timeout close.

**Mechanics**

Socket events can overlap. Finalization should be idempotent so reports do not get duplicate close rows.

**Hint**

Add a boolean such as `state.finalized`.

**Checkpoint**

One socket produces one close report even when an error event fires before close.

#### Step 5: Write connection reports

**Task**

Append close records to `reports/connections.jsonl` and update in-memory metrics.

**Mechanics**

Connection reports are durable lifecycle accounting. Metrics give live state before the process exits.

**Hint**

Open report files lazily or create `reports/` at server startup.

**Checkpoint**

Every closed connection appends one JSON line with close reason and counters.

#### Step 6: Add idle client testing

**Task**

Add `--hold-open-ms` to the client so it can connect and stay idle.

**Mechanics**

Idle timeout needs a reproducible client. A quiet socket is easier than manual terminal testing.

**Hint**

Delay `socket.end()` with `setTimeout()` when the flag is present.

**Checkpoint**

`npm run client -- --hold-open-ms 5000` gets closed by a server configured with `--idle-timeout-ms 1000`.

### Run

```sh
npm run server -- --port 41234 --idle-timeout-ms 1000
npm run client -- --port 41234 --hold-open-ms 5000
```

### Expected behavior

The server closes the idle client after about one second.

The connection close report includes `closeReason: "idle-timeout"`, bytes read, frames read, and protocol error count.

### Hints

- Update `lastActivityAt` on every data event and every decoded frame.
- Use a single `finalizeConnection(state, reason)` helper so all close paths write the same report shape.
- Store timestamps as ISO strings in reports and monotonic times for durations.

### Debugging notes

- `socket.setTimeout()` emits `timeout`; your handler closes the socket.
- A connection can close normally before the idle timer fires. Finalization must run once.
- Report files under `reports/` should be append-only during a run.

### Checkpoint

Idle clients close according to the configured timeout. Connection reports include close reason and per-connection counters.

### Reflection

Explain why open sockets keep Node alive.

## Phase 10: Add Backpressure-Aware File Sink

### Goal

Write normalized events to disk while respecting writable stream backpressure.

### Why this matters

Network input can outrun file output. The gateway needs to connect the sink's pressure signal back to socket reading, otherwise memory grows while the process keeps accepting bytes.

Backpressure is already covered in the streams chapter. Here the job is wiring that signal across the gateway boundary.

### Build

#### Step 1: Create the file sink module

**Task**

Create `src/sinks/file-sink.js` and expose a sink object with `writeEvent(event)` and `close()`.

**Mechanics**

The server should forward decoded events through a sink boundary. File output is the first sink implementation.

**Hint**

Keep sink construction separate from event parsing. The server should receive a sink instance at startup.

**Checkpoint**

The server can start with `--sink file` and create the file sink.

#### Step 2: Normalize decoded events

**Task**

Convert decoded frames into event objects with `receivedAt`, `connectionId`, `requestId`, `type`, `name`, `attributes`, and `payloadBytes`.

**Mechanics**

The sink should receive stable event records, not raw protocol frames.

**Hint**

Compute `payloadBytes` from the decoded frame metadata, not from the JSON string after parsing.

**Checkpoint**

One decoded event has every normalized field before it reaches the file sink.

#### Step 3: Write NDJSON to disk

**Task**

Write normalized events to `data/events.ndjson` through `createWriteStream()`.

**Mechanics**

NDJSON keeps one event per line, which makes append-only output easy to inspect and report later.

**Hint**

Use `JSON.stringify(event) + "\n"` for each write.

**Checkpoint**

Sending three valid frames creates three JSON lines in `data/events.ndjson`.

#### Step 4: Respect `write()` backpressure

**Task**

Call `sink.write(line)`. When it returns `false`, pause socket reads. Resume after `drain`.

**Mechanics**

The file stream's writable queue is the pressure signal. The socket should stop feeding new events when the sink says its queue is full.

**Hint**

Start with a global set of paused sockets. Resume only sockets that are still open.

**Checkpoint**

Under a slow sink, socket pause and resume counters increase.

#### Step 5: Add file-sink metrics

**Task**

Track `fileWrites`, `fileDrainCount`, `fileBufferedBytes`, `socketPauseCount`, `socketResumeCount`, and `sinkWriteLatencyMs`.

**Mechanics**

These metrics show whether file output is controlling gateway input.

**Hint**

Use `writableLength` for buffered bytes and `performance.now()` around write callbacks or delayed writes.

**Checkpoint**

Server logs or live counters show drain count, buffered bytes, write count, and sink write latency values.

#### Step 6: Add a slow sink simulator

**Task**

Add `--slow-sink-ms` so file writes can be delayed for testing pressure.

**Mechanics**

Fast disks may never trigger visible pressure during a small test. A controlled delay makes the backpressure path observable.

**Hint**

Wrap file writes in a custom Writable or queue delayed callbacks before forwarding to the real stream.

**Checkpoint**

`--slow-sink-ms 10` produces visible pause, resume, and drain metrics during a burst client run.

### Run

```sh
npm run server -- --sink file --slow-sink-ms 10
npm run client -- --count 200 --burst
```

### Expected behavior

`data/events.ndjson` receives one JSON line per valid event.

Under the slow sink, server logs show sockets pausing and resuming. File-sink counters show drain count, buffered bytes, write count, and sink write latency values.

The required run is a smoke test. After that works, `npm run client -- --count 5000 --burst` is a useful stress run. With `--slow-sink-ms 10`, that run can take about 50 seconds to flush and the current client prints one line per written frame.

### Hints

- `writableLength` exposes queued bytes for the file stream.
- A paused socket still has kernel receive buffer state below JavaScript.
- Resume sockets after the sink drains. Keep a guard so closed sockets are skipped.

### Debugging notes

- Ignoring a `false` return from `write()` hides the pressure signal.
- Pausing every active socket is simpler than tracking one source at first.
- A sink error should close the server or move it into a draining failure state. Pick one policy and report it.

### Checkpoint

The gateway writes all valid events to disk without unbounded JavaScript buffering. Backpressure counters move during a slow-sink run.

### Reflection

Explain how pressure from file output reaches back to socket input.

## Phase 11: Add HTTP Forwarding Mode

### Goal

Forward normalized events to a local HTTP endpoint with concurrency limits, timeouts, retries, and failure counts.

### Why this matters

Gateways often forward decoded data to another service. Outbound HTTP has its own queue, latency, failure modes, and cancellation boundary. A gateway that accepts unlimited inbound socket data while creating unlimited HTTP requests becomes a memory and connection problem.

Concurrency control gives the sink a bounded shape.

### Build

#### Step 1: Create the HTTP sink module

**Task**

Create `src/sinks/http-sink.js` with the same sink shape as the file sink: `writeEvent(event)` and `close()`.

**Mechanics**

Matching sink APIs keep the server routing code stable while the destination changes.

**Hint**

Build the sink around a queue and a pump function rather than calling `fetch()` directly from the parser path.

**Checkpoint**

The server can start with `--sink http` and construct the HTTP sink.

#### Step 2: Add HTTP sink flags

**Task**

Support `--target`, `--http-concurrency`, `--http-timeout-ms`, `--http-retries`, `--http-queue-limit`, and `--overflow-policy pause|drop`.

**Mechanics**

Outbound HTTP needs explicit limits. The queue, concurrency, timeout, retry, and overflow policy define that boundary.

**Hint**

Use defaults: target `http://127.0.0.1:4310/events`, concurrency `8`, timeout `2000`, retries `1`, queue limit `1000`.

**Checkpoint**

Server help lists all HTTP sink flags and defaults.

#### Step 3: Build a local HTTP receiver

**Task**

Create `src/http-receiver.js` with `POST /events` and append received JSON to `data/http-received.ndjson`.

**Mechanics**

The receiver gives the gateway a real HTTP target without depending on an external service.

**Hint**

Use `node:http`. Read the request body with `for await...of`, parse JSON, write one line, and respond with `204`.

**Checkpoint**

Posting one event to the receiver appends one JSON line.

#### Step 4: Implement bounded forwarding

**Task**

Use `fetch()` with `AbortSignal.timeout(httpTimeoutMs)` and run at most `httpConcurrency` requests at a time.

**Mechanics**

The queue can grow only to its configured limit. In-flight requests stay bounded even during client bursts.

**Hint**

Keep `inflight` as a counter. The pump starts new requests while `inflight < limit` and queued events exist.

**Checkpoint**

During a 100-event run, `inflight` never exceeds the configured concurrency.

#### Step 5: Add retry and timeout accounting

**Task**

Retry transient failures, count timeouts, and treat 4xx responses as final failures.

**Mechanics**

Retries are output policy. They should be visible as counters, not hidden inside a loop.

**Hint**

Create a fresh timeout signal for every attempt.

**Checkpoint**

Receiver failures update `failed`, `retried`, and `timedOut` counters correctly.

#### Step 6: Connect HTTP pressure to sockets

**Task**

When the HTTP queue reaches its limit, apply `--overflow-policy`: pause sockets or drop events.

**Mechanics**

The outbound queue is another pressure point. The gateway needs a bounded answer when the target is slower than inbound traffic.

**Hint**

Reuse the paused-socket set from the file sink path for the `pause` policy.

**Checkpoint**

A slow receiver causes queue-depth metrics to rise and either socket pauses or dropped-event counts to increase.

#### Step 7: Report HTTP sink snapshots

**Task**

Log a periodic HTTP sink snapshot while `--sink http` is active.

**Mechanics**

HTTP forwarding is asynchronous. A TCP connection can close while HTTP requests are still in flight or waiting in the sink queue. Connection close logs should report connection state only; HTTP delivery counts need their own observation point.

**Hint**

Expose a small `snapshot()` method from the HTTP sink or have the sink emit a periodic log line. Include sent count, retry count, timeout count, failure count, in-flight count, queued count, and dropped count.

**Checkpoint**

During a client run, the server prints HTTP sink snapshots that keep changing after the TCP client has closed if HTTP work is still pending.

### Run

```sh
npm run receiver -- --port 4310
npm run server -- --sink http --target http://127.0.0.1:4310/events
npm run client -- --count 100
```

### Expected behavior

The receiver writes events to `data/http-received.ndjson`.

The server logs HTTP sink snapshots with sent count, retry count, timeout count, failure count, in-flight count, and queue depth. Treat final HTTP delivery verification as Phase 12 and Phase 13 work, where live metrics and shutdown drain exist.

### Hints

- Keep the HTTP sink API similar to the file sink: `writeEvent(event)` plus `close()`.
- Use a small work queue and a `pump()` function that starts requests while `inflight < limit`.
- Record latency around each `fetch()` call with `performance.now()`.

### Debugging notes

- A hung receiver should become a timeout counter with bounded `inflight` cleanup.
- Retries need fresh timeout signals for each attempt.
- If the process exits before requests finish, the shutdown phase needs to await sink drain.

### Checkpoint

Events sent by the TCP client arrive at the HTTP receiver. Failures, retries, timeouts, queue length, and concurrency are reported.

### Reflection

Explain why outbound HTTP forwarding needs concurrency control.

## Phase 12: Add Per-Connection Metrics

### Goal

Expose runtime metrics while the gateway is running.

### Why this matters

The gateway now has several pressure points: active sockets, parser errors, sink queues, paused sockets, file drains, HTTP inflight requests, and event throughput. Metrics make those states visible during load instead of only after shutdown.

Use counters for totals, gauges for current values, and latency samples for timing.

### Build

#### Step 1: Create the metrics module

**Task**

Create `src/metrics.js` with helpers for counters, gauges, latency samples, and snapshots.

**Mechanics**

Metrics should be updated by server, parser, connection manager, and sinks without each module inventing its own report shape.

**Hint**

Start with a plain object and small increment/set helpers.

**Checkpoint**

The server can update metrics without importing sink internals.

#### Step 2: Start a metrics HTTP server

**Task**

Add `--metrics-port`, default `9090`, and start a small HTTP server from the gateway process.

**Mechanics**

The metrics endpoint is a separate listener. It exposes state while the gateway is running.

**Hint**

Use `node:http` and keep the handler read-only.

**Checkpoint**

`curl http://127.0.0.1:9090/metrics` returns JSON while the gateway is running.

#### Step 3: Return gateway-wide metrics

**Task**

Return `uptimeMs`, `activeConnections`, `totalConnections`, `bytesRead`, `framesReceived`, `eventsForwarded`, `protocolErrors`, `protocolErrorsByCode`, `socketPauseCount`, `socketResumeCount`, `fileDrainCount`, `fileBufferedBytes`, `httpInflight`, `httpQueued`, `httpFailed`, `sinkLatencyMs`, and `memory`.

**Mechanics**

These fields expose traffic, parser health, sink pressure, outbound queue state, and memory ownership.

**Hint**

Use `process.memoryUsage()` for RSS, heap, external, and array buffer memory.

**Checkpoint**

The metrics response includes every named top-level field.

#### Step 4: Include per-connection snapshots

**Task**

Add `connections` entries with id, bytes, frames, last activity, and paused state.

**Mechanics**

Global metrics explain the process. Per-connection snapshots explain which sockets are active or paused.

**Hint**

Build snapshots from the active connection map at request time.

**Checkpoint**

Opening two clients shows two active connection snapshots.

#### Step 5: Persist metrics samples

**Task**

Write one metrics snapshot per second to `reports/metrics.jsonl`.

**Mechanics**

The final report needs historical pressure data, not just the last endpoint response.

**Hint**

Use one interval timer and close it during shutdown.

**Checkpoint**

After a short server run, `reports/metrics.jsonl` contains timestamped samples.

#### Step 6: Add an optional metrics CLI

**Task**

Optionally add a CLI command that fetches and prints the metrics endpoint.

```sh
npm run gateway -- metrics --port 9090
```

**Mechanics**

A CLI metrics command makes local inspection easier on systems where `curl` is unavailable.

**Hint**

Keep this command thin. It should call `fetch()` and pretty-print JSON.

**Checkpoint**

The command prints the same data as `GET /metrics`.

### Run

```sh
npm run server -- --metrics-port 9090
npm run client -- --count 100
curl http://127.0.0.1:9090/metrics
```

### Expected behavior

Metrics update while the client sends load. Active connection count rises and falls. Frame and event counters increase. Backpressure and HTTP queue metrics move when sinks slow down.

### Hints

- Use monotonic `performance.now()` for durations.
- Use `process.memoryUsage()` for RSS, heap, external, and array buffer memory.
- Keep the metrics response read-only. It should observe state and leave gateway state unchanged.

### Debugging notes

- The metrics server is another active handle. Close it during graceful shutdown.
- Latency percentiles need stored samples or rolling buckets. A fixed-size ring buffer is enough.
- If metrics lag under load, check for synchronous report writing in the hot path.

### Checkpoint

`GET /metrics` returns current gateway state. Metrics match a small load test: client count, frame count, error count, and sink counters line up with observed activity.

### Reflection

Explain which metrics reveal pressure first in this gateway.

## Phase 13: Add Graceful Shutdown

### Goal

Stop accepting new connections, drain existing work, close sockets according to policy, and write a final report.

### Why this matters

Shutdown is part of server behavior. The process receives a signal, stops accepting new work, finishes or abandons in-flight work according to a deadline, closes resources, and leaves evidence about dropped frames.

The shutdown path should use the same accounting as normal operation.

### Build

#### Step 1: Create the shutdown module

**Task**

Create `src/shutdown.js` and route server shutdown through one exported function.

**Mechanics**

The shutdown path touches the listener, sockets, timers, metrics server, sinks, and reports. One coordinator keeps the order visible.

**Hint**

Pass the server, active connections, sink, metrics server, and report writer into the shutdown function.

**Checkpoint**

The server can call the shutdown module without circular imports.

#### Step 2: Handle process signals

**Task**

Register handlers for `SIGINT` and `SIGTERM`.

**Mechanics**

After a handler is installed, the process owns cleanup for that signal. Active handles will keep Node alive until your code closes them.

**Hint**

Use one shutdown promise so repeated signals join the same cleanup path.

**Checkpoint**

Pressing `Ctrl+C` starts the gateway shutdown path.

#### Step 3: Stop accepting and reading work

**Task**

On the first signal, record the reason, call `server.close()`, stop metrics sampling, stop the metrics HTTP server, and stop reading new frames from sockets.

**Mechanics**

Shutdown starts by closing intake. Existing work can then drain or close according to policy.

**Hint**

Mark server state as `shuttingDown` so data handlers know how to treat late input.

**Checkpoint**

New client connections fail or hang after shutdown starts, while existing connections follow the configured policy.

#### Step 4: Add shutdown policy flags

**Task**

Support `--shutdown-grace-ms`, `--shutdown-policy drain|close`, and `--ack accepted|persisted|off`.

**Mechanics**

These flags define what "graceful" means for this gateway: how long to wait, whether to drain, and when to ACK.

**Hint**

Use defaults of grace `10000`, policy `drain`, and ACK `off`.

**Checkpoint**

Server help lists shutdown flags and defaults.

#### Step 5: Define ACK frame behavior

**Task**

When `--ack` is active, write `TYPE_ACK` frames back to the same socket.

**Mechanics**

The ACK uses the normal frame header. The ACK header request id must equal the event frame request id. The ACK payload is UTF-8 JSON with `requestId` as a decimal string, `policy` as `accepted` or `persisted`, `connectionId`, and `timestamp`.

`--ack accepted` writes the ACK after the event frame passes protocol validation and the normalized event has entered the sink path. It does not wait for file or HTTP completion.

`--ack persisted` writes the ACK after the sink reports completion for that event. For the file sink, that means the write callback has fired after any slow-sink delay. For the HTTP sink, that means a 2xx response has been received after retries.

`--ack off` writes no ACK frames.

Dropped events and sink failures do not produce ACK frames. If the server writes `TYPE_ERROR` responses, use those for failure detail and let the client count the request id as failed instead of acknowledged.

Do not ACK malformed frames. Use the existing protocol error path for those.

**Hint**

Keep ACK encoding beside the existing frame encoder so checksum, request id, and payload length rules stay shared. The server should still respect `socket.write()` backpressure when writing ACK frames.

**Checkpoint**

With `--ack accepted`, a valid event produces one ACK quickly. With `--ack persisted` and `--slow-sink-ms 10`, ACK latency grows with sink delay.

#### Step 6: Drain or force close resources

**Task**

Await sink close, close or destroy sockets according to policy, and force close remaining sockets after the deadline.

**Mechanics**

The gateway should leave a clear record of work drained and work dropped.

**Hint**

On a second signal, shorten the deadline and destroy remaining sockets.

**Checkpoint**

A long-running client burst can be interrupted and the process exits after the grace period.

#### Step 7: Write the final report

**Task**

Write `reports/final-report.json` with shutdown timing, reason, open connections at shutdown, dropped frames, drained events, forced socket closes, and sink close time.

**Mechanics**

The final report is the durable result of shutdown policy.

**Hint**

Use the same counters that metrics already expose so report numbers match endpoint numbers.

**Checkpoint**

After `Ctrl+C`, `reports/final-report.json` exists and includes shutdown reason and dropped frame count.

### Run

```sh
npm run server -- --sink file --slow-sink-ms 10 --shutdown-grace-ms 5000
npm run client -- --count 500 --burst
```

Press `Ctrl+C` in the server terminal while the file sink is still draining. If the run finishes before you interrupt it, rerun the client with `--count 2000`.

### Expected behavior

The server stops accepting new connections. It drains or closes existing work according to the configured policy. `reports/final-report.json` includes shutdown reason and dropped frame count.

### Hints

- Use one shutdown promise so repeated signals join the same path.
- Set `process.exitCode` after cleanup rather than calling `process.exit()` from the first handler.
- Keep socket finalization idempotent. Shutdown and normal close can race.

### Debugging notes

- Adding a signal handler changes Node's default signal exit path. Your code now owns closing active handles.
- `server.close()` waits for the listening socket to close, while accepted sockets remain separate.
- File streams need `end()` and a `finish` or `close` observation before final report writing.

### Checkpoint

The final report records shutdown reason, active connection count at shutdown start, drained events, forced closes, and dropped frames.

### Reflection

Explain why shutdown behavior has to be designed before the process receives a signal.

## Phase 14: Build A Load Test Client

### Goal

Stress the gateway with many connections, frame counts, frame rates, payload sizes, and malformed ratios.

### Why this matters

Protocol behavior changes under load. Parser state, Buffer allocation, socket queues, sink queues, HTTP concurrency, and report writing all compete for runtime resources.

The load client gives the final report real numbers instead of guesses.

### Build

#### Step 1: Create the load client

**Task**

Create `client/load.js` and open one socket per configured client.

**Mechanics**

Many concurrent sockets exercise parser state, connection accounting, sink pressure, and shutdown behavior together.

**Hint**

Build a small `runClient(clientIndex)` function that connects, sends its assigned frames, and returns counters.

**Checkpoint**

`--clients 5` opens five connections and closes them after sending.

#### Step 2: Add load flags

**Task**

Support `--host`, `--port`, `--clients`, `--frames`, `--frame-size`, `--rate`, `--malformed-ratio`, `--chunk-size`, `--duration-ms`, `--ack-timeout-ms`, `--report`, and `--metrics-url`.

**Mechanics**

These flags control connection count, data volume, pacing, payload size, malformed input, chunking, and report output.

**Hint**

Use defaults: host `127.0.0.1`, port `41234`, clients `10`, frames `1000`, frame size `256`, malformed ratio `0`, ACK timeout `2000`, report `reports/load-latest.json`.

**Checkpoint**

`npm run load -- --help` lists all load flags and defaults.

#### Step 3: Generate deterministic request ids

**Task**

Split total frames across clients and generate request ids that are unique across all clients.

**Mechanics**

Unique request ids make ACK latency and error attribution possible.

**Hint**

Combine client index and local sequence number into one numeric id.

**Checkpoint**

No duplicate request ids appear in a load report.

#### Step 4: Send valid and malformed frames

**Task**

Use `--malformed-ratio` to inject malformed frames into the same run as valid frames.

**Mechanics**

Mixed traffic shows whether protocol errors isolate to bad frames or destabilize the whole gateway.

**Hint**

Pick malformed modes randomly from the same modes added in Phase 8.

**Checkpoint**

The load report records how many malformed frames were injected.

#### Step 5: Measure ACK latency when ACKs arrive

**Task**

Start a timer before each valid frame write. Compute latency only when a matching ACK request id returns.

**Mechanics**

ACK latency measures end-to-end gateway acceptance or persistence, depending on the server ACK policy.

The load client cannot discover the server's `--ack accepted`, `--ack persisted`, or `--ack off` mode from the TCP connection. Treat ACK tracking as opportunistic: keep pending timers for valid frames, record latency when ACK frames arrive, and count timeouts only after that socket has already observed ACK traffic. A default `--ack off` server run should produce zero ACKs and zero artificial ACK timeouts.

The load client must parse inbound frames from each socket while it is writing outbound event frames. Use the same stateful frame parser shape from the server side, but accept only `TYPE_ACK` and `TYPE_ERROR` responses from the gateway. Match ACKs by the header request id; the payload `requestId` string should agree with the header.

**Hint**

Keep a bounded map of pending request ids and remove entries after ACK or timeout.

**Checkpoint**

The load report includes ACK count, timeout count, and latency values when ACK frames are observed.

#### Step 6: Track per-client counters

**Task**

Record `connected`, `framesSent`, `bytesSent`, `acksReceived`, `ackTimeouts`, `protocolErrorsInjected`, and `socketErrors` per client.

**Mechanics**

Per-client counters make uneven failures visible. One bad connection should not disappear inside totals.

**Hint**

Return each client's counters and reduce them into aggregate totals at the end.

**Checkpoint**

The aggregate sent frame count equals the sum of per-client sent frame counts.

#### Step 7: Poll gateway metrics during load

**Task**

If `--metrics-url` is provided, poll the gateway metrics endpoint during the run.

**Mechanics**

Live metrics capture pressure peaks that may be gone by the time the load client exits.

**Hint**

Sample once per second and store max values for active connections, file buffered bytes, HTTP queue depth, and memory.

**Checkpoint**

The load report includes metrics-derived peaks when `--metrics-url` is set.

#### Step 8: Write the load report

**Task**

Write `reports/load-latest.json` with start time, finish time, duration, throughput, latency, errors, memory, and backpressure.

**Mechanics**

The final protocol report will cite this file.

**Hint**

Compute frames per second and bytes per second from completed duration, not from intended duration.

**Checkpoint**

`npm run load -- --clients 50 --frames 10000` writes a report with throughput, errors, latency, memory, and backpressure fields.

### Run

```sh
npm run server -- --sink file --metrics-port 9090
npm run load -- --clients 50 --frames 10000 --metrics-url http://127.0.0.1:9090/metrics
```

The load-based shutdown check from Phase 13 can now use the load client:

```sh
npm run server -- --sink file --shutdown-grace-ms 5000
npm run load -- --clients 10 --frames 10000
```

Press `Ctrl+C` in the server terminal while load is still running.

### Expected behavior

The load client opens many connections, sends frames, records ACK latency when ACK frames are observed, and writes a load report.

The gateway processes valid frames, rejects injected malformed frames, and records pressure metrics.

### Hints

- Use one socket per load client.
- Rate limiting can be a simple `setTimeout()` between writes per client.
- Keep a bounded map of pending ACK request ids so a bad run retains bounded state.

### Debugging notes

- `EMFILE` means the process hit a file descriptor limit. Lower `--clients` or inspect OS limits.
- `ECONNRESET` can be expected when malformed input triggers close policy.
- If the load client reports sent frames but the gateway reports fewer bytes, check premature socket end and write callbacks.

### Checkpoint

The load report includes throughput, errors, latency, memory, and backpressure. Gateway metrics line up with the load client's sent and error counts within the expected malformed and dropped-frame policy.

### Reflection

Explain which bottleneck appeared first in your run and which metric exposed it.

## Phase 15: Generate Final Protocol Report

### Goal

Produce a Markdown and HTML report that summarizes the protocol design, parser behavior, error policy, backpressure behavior, shutdown behavior, and load results.

### Why this matters

The boss project should end with an artifact that explains the system from its own output. A report based on actual run data is harder to fake than a description of intended behavior.

The report is also a debugging tool. It connects the wire format to observed pressure and failure paths.

### Build

#### Step 1: Create the report generator

**Task**

Create `src/report.js` and connect it to `npm run report`.

**Mechanics**

The report generator turns runtime evidence into a portfolio artifact. It should read generated files and produce Markdown plus HTML.

**Hint**

Start by loading files and printing which inputs were found.

**Checkpoint**

`npm run report` runs without starting the gateway.

#### Step 2: Read report inputs

**Task**

Read `docs/protocol.md`, `reports/load-latest.json`, `reports/final-report.json`, `reports/connections.jsonl`, `reports/protocol-errors.jsonl`, and `reports/metrics.jsonl`.

**Mechanics**

The final report should cite measured behavior, not intended behavior.

**Hint**

Parse JSONL by splitting on newlines, filtering blank lines, and parsing each line.

**Checkpoint**

The generator reports which input files were present and which were missing.

#### Step 3: Summarize protocol design

**Task**

Add sections for header layout, frame types, parser state machine, and malformed input policy.

**Mechanics**

These sections explain how the gateway interprets bytes before discussing performance.

**Hint**

Reuse the protocol document and parser metrics instead of hand-writing separate constants.

**Checkpoint**

The Markdown report includes the frame header table and frame type list.

#### Step 4: Summarize runtime behavior

**Task**

Add sections for connection lifecycle, file sink backpressure, HTTP forwarding concurrency, metrics observed during load, and graceful shutdown result.

**Mechanics**

These sections connect the implementation to observable pressure and lifecycle outcomes.

**Hint**

Use max, min, last, and totals from metrics samples rather than embedding every sample.

**Checkpoint**

The report includes active connection peaks, sink pressure peaks, and shutdown result fields.

#### Step 5: Cite actual load numbers

**Task**

Include total frames sent, total frames accepted, malformed frames injected, protocol errors observed, throughput, latency percentiles, max active connections, max file buffered bytes, max HTTP queue depth, and dropped frames.

**Mechanics**

Numbers give the report evidence. If two sources disagree, label both sources.

**Hint**

Prefer values from the load report for client-side counts and gateway reports for server-side counts.

**Checkpoint**

The report contains actual numeric values from the latest load and final reports.

#### Step 6: Render Markdown and HTML

**Task**

Generate `reports/protocol-gateway.md` and `reports/protocol-gateway.html`.

**Mechanics**

Markdown is easy to inspect in the repo. HTML is easier to share.

**Hint**

Keep the renderer dependency-free and escape HTML from event names, attributes, and error details.

**Checkpoint**

Both report files exist after `npm run report`.

### Run

```sh
npm run report
```

### Expected behavior

`reports/protocol-gateway.html` exists. `reports/protocol-gateway.md` exists. The report includes real numbers from the load test and final shutdown report.

### Hints

- Parse JSONL by splitting lines, filtering blank lines, and `JSON.parse()` per line.
- Use the latest report file by timestamp or write a stable `load-latest.json` alias from the load client.
- Keep report generation tolerant of missing optional files, but print which inputs were unavailable.

### Debugging notes

- HTML escaping matters if event names or attributes came from client input.
- Large metrics files can be summarized with max, min, and last values instead of embedding every sample.
- If numbers disagree, keep both values visible and label their source.

### Checkpoint

The final report exists as Markdown and HTML. It cites actual numbers from the load test and final gateway report.

### Reflection

Write the systems rule this boss lab taught you.
