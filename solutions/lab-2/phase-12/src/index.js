import { mkdir, open, readFile, rename, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { TYPE_DELETE, TYPE_PUT } from "./record-format.js";
import { DATA_DIR, INDEX_PATH, SEGMENT_PATH } from "./paths.js";
import { scanSegment } from "./segment-reader.js";

export function applyRecord(index, entry, { segment = SEGMENT_PATH } = {}) {
  const { record } = entry;

  if (record.type !== TYPE_PUT && record.type !== TYPE_DELETE) {
    throw new Error(`cannot index unknown record type: ${record.type}`);
  }

  const indexed = {
    key: record.key,
    type: record.typeName,
    segment,
    offset: entry.offset,
    length: entry.length,
    timestamp: record.timestamp,
  };

  if (record.type === TYPE_DELETE) {
    indexed.deleted = true;
  }

  index.set(record.key, indexed);

  return index;
}

export async function buildIndexFromScan(scan, options = {}) {
  const index = new Map();

  for await (const entry of scan) {
    applyRecord(index, entry, options);
  }

  return index;
}

async function segmentSize(segment) {
  try {
    return (await stat(segment)).size;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return 0;
    }
    throw error;
  }
}

export function serializeIndex(index, {
  segment = SEGMENT_PATH,
  size,
  updatedAt = new Date().toISOString(),
} = {}) {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new Error("serializeIndex requires a non-negative segment size");
  }

  return {
    version: 1,
    segment,
    segmentSize: size,
    updatedAt,
    entries: Array.from(index.values()),
  };
}

export async function saveIndex(index, {
  indexPath = INDEX_PATH,
  segment = SEGMENT_PATH,
  size,
} = {}) {
  const actualSize = size ?? await segmentSize(segment);
  const payload = `${JSON.stringify(serializeIndex(index, { segment, size: actualSize }), null, 2)}\n`;
  await mkdir(dirname(indexPath), { recursive: true });
  const tempPath = `${indexPath}.${process.pid}.tmp`;
  const handle = await open(tempPath, "w");

  try {
    await handle.writeFile(payload, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }

  await rename(tempPath, indexPath);
  return { indexPath, segmentSize: actualSize, entryCount: index.size };
}

export async function loadPersistedIndex({
  indexPath = INDEX_PATH,
  segment = SEGMENT_PATH,
} = {}) {
  const size = await segmentSize(segment);
  let parsed;

  try {
    parsed = JSON.parse(await readFile(indexPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) {
      return { ok: false, reason: "missing-or-invalid-index", segmentSize: size };
    }
    throw error;
  }

  if (parsed.version !== 1) {
    return { ok: false, reason: "unsupported-index-version", segmentSize: size };
  }

  if (parsed.segmentSize !== size) {
    return { ok: false, reason: "segment-size-mismatch", segmentSize: size };
  }

  if (!Array.isArray(parsed.entries)) {
    return { ok: false, reason: "entries-not-array", segmentSize: size };
  }

  const index = new Map();
  for (const entry of parsed.entries) {
    if (typeof entry?.key === "string") {
      index.set(entry.key, entry);
    }
  }

  return {
    ok: true,
    index,
    segmentSize: size,
    entryCount: index.size,
  };
}

export async function loadOrReplayIndex({
  indexPath = INDEX_PATH,
  segment = SEGMENT_PATH,
} = {}) {
  const indexLoadStart = performance.now();
  const persisted = await loadPersistedIndex({ indexPath, segment });
  const indexLoadMs = performance.now() - indexLoadStart;

  if (persisted.ok) {
    return {
      index: persisted.index,
      mode: "persisted-index",
      entryCount: persisted.entryCount,
      segmentSize: persisted.segmentSize,
      indexLoadMs,
      replayMs: 0,
    };
  }

  const replayStart = performance.now();
  const index = await buildIndexFromScan(scanSegment(segment), { segment });
  const replayMs = performance.now() - replayStart;

  return {
    index,
    mode: "full-replay",
    entryCount: index.size,
    segmentSize: persisted.segmentSize,
    indexLoadMs,
    replayMs,
    replayReason: persisted.reason,
  };
}

export async function rebuildAndSaveIndex({
  segment = SEGMENT_PATH,
  indexPath = INDEX_PATH,
} = {}) {
  const index = await buildIndexFromScan(scanSegment(segment), { segment });
  await mkdir(DATA_DIR, { recursive: true });
  await saveIndex(index, { indexPath, segment });
  return index;
}
