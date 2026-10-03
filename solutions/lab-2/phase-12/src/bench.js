import { mkdir, open, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { TYPE_PUT } from "./record-format.js";
import { encodeRecord } from "./record-encode.js";
import { saveIndex } from "./index.js";
import { INDEX_PATH, SEGMENT_PATH } from "./paths.js";

async function writeAll(handle, buffer) {
  let written = 0;

  while (written < buffer.length) {
    const result = await handle.write(buffer, written, buffer.length - written);
    if (result.bytesWritten === 0) {
      throw new Error("fixture write made no progress");
    }
    written += result.bytesWritten;
  }
}

export async function generateFixture(count, {
  segment = SEGMENT_PATH,
  indexPath = INDEX_PATH,
  keySpace = Math.max(1, Math.min(count, 10_000)),
} = {}) {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("--generate requires a non-negative integer count");
  }

  await mkdir(dirname(segment), { recursive: true });
  await rm(indexPath, { force: true });
  const handle = await open(segment, "w");
  const index = new Map();
  let offset = 0;
  const started = performance.now();

  try {
    for (let i = 0; i < count; i += 1) {
      const key = `key-${String(i % keySpace).padStart(5, "0")}`;
      const value = `value-${String(i).padStart(8, "0")}-${"x".repeat(48)}`;
      const timestamp = 1_700_000_000_000 + i;
      const record = encodeRecord({ type: TYPE_PUT, key, value, timestamp });
      await writeAll(handle, record);
      index.set(key, {
        key,
        type: "PUT",
        segment,
        offset,
        length: record.length,
        timestamp,
      });
      offset += record.length;
    }

    await handle.sync();
  } finally {
    await handle.close();
  }

  await saveIndex(index, { indexPath, segment, size: offset });

  return {
    segment,
    indexPath,
    count,
    keySpace,
    segmentSize: offset,
    durationMs: performance.now() - started,
  };
}

function parseArgs(argv) {
  const generateIndex = argv.indexOf("--generate");
  if (generateIndex === -1) {
    return null;
  }

  const count = Number(argv[generateIndex + 1]);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Usage: node --expose-gc src/bench.js --generate <count>");
  }

  return { count };
}

try {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed === null) {
    console.log("Usage: node --expose-gc src/bench.js --generate <count>");
  } else {
    console.log(JSON.stringify(await generateFixture(parsed.count), null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
