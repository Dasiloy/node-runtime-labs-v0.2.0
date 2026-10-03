const commands = new Set([
  "put",
  "get",
  "scan",
  "delete",
  "inspect",
  "inspect-format",
  "encode",
  "decode",
  "recover",
  "compact",
  "bench",
]);

const usage = `Usage:
  npm run db -- --help
  npm run put -- <key> <value>
  npm run get -- <key>
  npm run scan
  npm run delete -- <key>
  npm run inspect -- --offset <byte-offset>

Default paths:
  segment: data/segment-0001.dat
  index:   data/index.json
  reports: reports/

Commands:
  put             Append a key/value record
  get             Read the latest value for a key
  scan            Print records in segment order
  delete          Append a delete tombstone
  inspect         Decode one record at an offset
  inspect-format  Print the record format
  encode          Encode one record and print bytes
  decode          Decode bytes into one record
  recover         Truncate a damaged segment tail
  compact         Rewrite live records into a compact segment
  bench           Run storage benchmarks`;

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function errorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (error && typeof error === "object" && "offset" in error) {
    return `${message} at offset ${error.offset}`;
  }
  return message;
}

function notImplemented(command) {
  fail(`${command} is not implemented yet`);
}

async function handleInspectFormat() {
  const {
    HEADER_FIELDS,
    HEADER_SIZE,
    MAGIC_TEXT,
    OFFSETS,
    TYPE_DELETE,
    TYPE_PUT,
    VERSION,
  } = await import("./record-format.js");
  const pad = (value, width) => String(value).padEnd(width);

  console.log(`Record format: ${MAGIC_TEXT} version ${VERSION}`);
  console.log(`HEADER_SIZE = ${HEADER_SIZE}`);
  console.log(`Payload starts at offset ${OFFSETS.payload}`);
  console.log("");
  console.log(`${pad("offset", 8)}${pad("width", 8)}${pad("field", 16)}rule`);

  for (const field of HEADER_FIELDS) {
    console.log(
      `${pad(field.offset, 8)}${pad(field.width, 8)}${pad(field.field, 16)}${field.rule}`,
    );
  }

  console.log("");
  console.log("Payload order: key bytes followed by value bytes");
  console.log("Byte order: numeric fields are big-endian");
  console.log("Text encoding: keys and values are UTF-8 bytes");
  console.log(`Record types: ${TYPE_PUT}=PUT, ${TYPE_DELETE}=DELETE`);
}

async function handleEncode(args) {
  const { TYPE_PUT } = await import("./record-format.js");
  const { encodeRecord } = await import("./record-encode.js");
  const { hexDump } = await import("./hex-dump.js");
  const [key, value] = args;

  if (key === undefined || value === undefined || args.length !== 2) {
    throw new Error("Usage: npm run encode -- <key> <value>");
  }

  const record = encodeRecord({ type: TYPE_PUT, key, value });
  console.log(`length=${record.length}`);
  console.log(`hex=${record.toString("hex")}`);
  console.log(hexDump(record));
}

function parseDecodeInput(args) {
  const fileIndex = args.indexOf("--file");

  if (fileIndex !== -1) {
    const file = args[fileIndex + 1];
    if (file === undefined) {
      throw new Error("--file requires a path");
    }
    return { file };
  }

  const rawHex = args.join("").replace(/^hex=/, "");
  const hex = rawHex.replace(/[^a-fA-F0-9]/g, "");

  if (hex.length === 0) {
    throw new Error("Usage: npm run decode -- <hex> OR npm run decode -- --file <path>");
  }

  if (hex.length % 2 !== 0) {
    throw new Error("hex input must contain an even number of digits");
  }

  return { hex };
}

async function handleDecode(args) {
  const { readFile } = await import("node:fs/promises");
  const { decodeRecord } = await import("./record-decode.js");
  const input = parseDecodeInput(args);
  const buffer = input.file === undefined ? Buffer.from(input.hex, "hex") : await readFile(input.file);
  const record = decodeRecord(buffer);

  console.log(
    JSON.stringify(
      {
        type: record.typeName,
        key: record.key,
        value: record.value,
        timestamp: record.timestamp,
        checksum: record.checksum,
        keyLength: record.keyLength,
        valueLength: record.valueLength,
        recordLength: record.recordLength,
        payloadOffset: record.payloadOffset,
      },
      null,
      2,
    ),
  );
}

function parsePutArgs(args) {
  const syncIndex = args.indexOf("--sync");
  const sync = syncIndex !== -1;
  const positional = sync ? args.toSpliced(syncIndex, 1) : args;
  const [key, value] = positional;

  if (key === undefined || value === undefined || positional.length !== 2) {
    throw new Error("Usage: npm run put -- <key> <value> [--sync]");
  }

  return { key, value, sync };
}

async function handlePut(args) {
  const { appendRecord } = await import("./segment-writer.js");
  const { rebuildAndSaveIndex } = await import("./index.js");
  const result = await appendRecord(parsePutArgs(args));
  await rebuildAndSaveIndex();
  console.log(JSON.stringify(result, null, 2));
}

function parseDeleteArgs(args) {
  const [key, extra] = args;
  if (key === undefined || extra !== undefined) {
    throw new Error("Usage: npm run delete -- <key>");
  }
  return { key };
}

async function handleDelete(args) {
  const { TYPE_DELETE } = await import("./record-format.js");
  const { appendRecord } = await import("./segment-writer.js");
  const { rebuildAndSaveIndex } = await import("./index.js");
  const { key } = parseDeleteArgs(args);
  const result = await appendRecord({
    type: TYPE_DELETE,
    key,
    value: "",
  });
  await rebuildAndSaveIndex();
  console.log(JSON.stringify({ ...result, type: "DELETE", key, deleted: true }, null, 2));
}

function entryJson(entry) {
  return {
    offset: entry.offset,
    length: entry.length,
    type: entry.record.typeName,
    key: entry.record.key,
    value: entry.record.value,
    timestamp: entry.record.timestamp,
  };
}

async function handleScan() {
  const { scanSegment } = await import("./segment-reader.js");

  for await (const entry of scanSegment()) {
    console.log(JSON.stringify(entryJson(entry)));
  }
}

function parseInspectArgs(args) {
  const offsetFlag = args.indexOf("--offset");
  if (offsetFlag === -1 || args[offsetFlag + 1] === undefined) {
    throw new Error("Usage: npm run inspect -- --offset <byte-offset>");
  }

  const offset = Number(args[offsetFlag + 1]);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error("--offset must be a non-negative safe integer");
  }

  return offset;
}

async function handleInspect(args) {
  const { readRecordAt } = await import("./segment-reader.js");
  const entry = await readRecordAt(undefined, parseInspectArgs(args));
  console.log(JSON.stringify(entryJson(entry), null, 2));
}

function parseGetArgs(args) {
  const verbose = args.includes("--verbose");
  const positional = args.filter((arg) => arg !== "--verbose");
  const [key] = positional;

  if (key === undefined || positional.length !== 1) {
    throw new Error("Usage: npm run get -- <key> [--verbose]");
  }

  return { key, verbose };
}

async function handleGet(args) {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  const { performance } = await import("node:perf_hooks");
  const { loadOrReplayIndex } = await import("./index.js");
  const { REPORT_PATHS } = await import("./paths.js");
  const { readRecordAt } = await import("./segment-reader.js");
  const { key, verbose } = parseGetArgs(args);
  const loaded = await loadOrReplayIndex();
  const { index } = loaded;
  const lookupStart = performance.now();
  const indexed = index.get(key);
  const lookupMs = performance.now() - lookupStart;

  const report = {
    mode: loaded.mode,
    entryCount: loaded.entryCount,
    segmentSize: loaded.segmentSize,
    indexLoadMs: loaded.indexLoadMs,
    replayMs: loaded.replayMs,
    lookupMs,
  };

  if (loaded.replayReason !== undefined) {
    report.replayReason = loaded.replayReason;
  }

  await mkdir(dirname(REPORT_PATHS.indexLoad), { recursive: true });
  await writeFile(REPORT_PATHS.indexLoad, `${JSON.stringify(report, null, 2)}\n`);

  if (indexed === undefined) {
    console.log(JSON.stringify({ key, state: "missing" }));
    process.exitCode = 1;
    return;
  }

  if (indexed.deleted === true || indexed.type === "DELETE") {
    const result = {
      key,
      state: "deleted",
      timestamp: indexed.timestamp,
    };

    if (verbose) {
      result.offset = indexed.offset;
      result.length = indexed.length;
      result.segment = indexed.segment;
      result.indexMode = loaded.mode;
    }

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const entry = await readRecordAt(indexed.segment, indexed.offset);
  const result = {
    key,
    value: entry.record.value,
    timestamp: entry.record.timestamp,
  };

  if (verbose) {
    result.offset = indexed.offset;
    result.length = indexed.length;
    result.segment = indexed.segment;
    result.indexMode = loaded.mode;
  }

  console.log(JSON.stringify(result, null, 2));
}

async function handleRecover() {
  const { recoverSegment } = await import("./recover.js");
  const report = await recoverSegment();
  console.log(JSON.stringify(report, null, 2));
}

async function handleCompact() {
  const { compactSegment } = await import("./compact.js");
  const report = await compactSegment();
  console.log(JSON.stringify(report, null, 2));
}

async function runStartupCleanup(command) {
  if (command === "compact") {
    return;
  }

  const { cleanupCompactionArtifacts } = await import("./compact.js");
  const actions = await cleanupCompactionArtifacts();

  for (const action of actions) {
    console.error(`compaction cleanup: ${JSON.stringify(action)}`);
  }
}

async function main(argv = process.argv.slice(2)) {
  const [command] = argv;

  if (command === undefined || command === "--help" || command === "-h") {
    console.log(usage);
    return;
  }

  if (!commands.has(command)) {
    fail(`Unknown command: ${command}\nRun "npm run db -- --help" for usage.`);
    return;
  }

  await runStartupCleanup(command);

  switch (command) {
    case "put":
      try {
        await handlePut(argv.slice(1));
      } catch (error) {
        fail(errorMessage(error));
      }
      break;
    case "get":
      try {
        await handleGet(argv.slice(1));
      } catch (error) {
        fail(errorMessage(error));
      }
      break;
    case "scan":
      try {
        await handleScan();
      } catch (error) {
        fail(errorMessage(error));
      }
      break;
    case "inspect":
      try {
        await handleInspect(argv.slice(1));
      } catch (error) {
        fail(errorMessage(error));
      }
      break;
    case "delete":
      try {
        await handleDelete(argv.slice(1));
      } catch (error) {
        fail(errorMessage(error));
      }
      break;
    case "inspect-format":
      try {
        await handleInspectFormat();
      } catch (error) {
        fail(errorMessage(error));
      }
      break;
    case "encode":
      try {
        await handleEncode(argv.slice(1));
      } catch (error) {
        fail(errorMessage(error));
      }
      break;
    case "decode":
      try {
        await handleDecode(argv.slice(1));
      } catch (error) {
        fail(errorMessage(error));
      }
      break;
    case "recover":
      try {
        await handleRecover();
      } catch (error) {
        fail(errorMessage(error));
      }
      break;
    case "compact":
      try {
        await handleCompact();
      } catch (error) {
        fail(errorMessage(error));
      }
      break;
    case "bench":
      notImplemented(command);
      break;
  }
}

await main();
