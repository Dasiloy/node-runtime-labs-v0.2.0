import { cpus } from "node:os";
import {
  mkdir,
  open,
  readFile,
  rm,
  stat,
  truncate,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import {
  BACKUP_SEGMENT_PATH,
  COMPACT_LOCK_PATH,
  COMPACTING_SEGMENT_PATH,
  INDEX_PATH,
  REPORT_PATHS,
  SEGMENT_PATH,
} from "./paths.js";
import { TYPE_DELETE, TYPE_PUT } from "./record-format.js";
import { encodeRecord } from "./record-encode.js";
import { appendRecord } from "./segment-writer.js";
import { scanSegment, readRecordAt } from "./segment-reader.js";
import { loadOrReplayIndex, rebuildAndSaveIndex, saveIndex } from "./index.js";
import { recoverSegment } from "./recover.js";
import { compactSegment } from "./compact.js";

const DEFAULT_COUNT = 5_000;
const DEFAULT_KEY_SPACE = 1_000;
const GET_COUNT = 2_000;

async function writeAll(handle, buffer) {
  let written = 0;

  while (written < buffer.length) {
    const result = await handle.write(buffer, written, buffer.length - written);
    if (result.bytesWritten === 0) {
      throw new Error("write made no progress");
    }
    written += result.bytesWritten;
  }
}

function keyFor(i, keySpace) {
  return `key-${String(i % keySpace).padStart(5, "0")}`;
}

function valueFor(i) {
  return `value-${String(i).padStart(8, "0")}-${"x".repeat(48)}`;
}

function sampleMemory() {
  if (typeof globalThis.gc === "function") {
    globalThis.gc();
  }
  const memory = process.memoryUsage();
  return {
    rss: memory.rss,
    heapUsed: memory.heapUsed,
    external: memory.external,
    arrayBuffers: memory.arrayBuffers,
  };
}

async function sizeOf(path) {
  try {
    return (await stat(path)).size;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return 0;
    }
    throw error;
  }
}

async function resetBenchmarkData() {
  await mkdir(dirname(SEGMENT_PATH), { recursive: true });
  await rm(SEGMENT_PATH, { force: true });
  await rm(INDEX_PATH, { force: true });
  await rm(COMPACTING_SEGMENT_PATH, { force: true });
  await rm(BACKUP_SEGMENT_PATH, { force: true });
  await rm(COMPACT_LOCK_PATH, { force: true });
}

async function measure(name, operations, fn) {
  const memoryBefore = sampleMemory();
  const started = performance.now();
  const extra = await fn();
  const durationMs = performance.now() - started;
  const memoryAfter = sampleMemory();

  return {
    name,
    durationMs,
    operations,
    opsPerSec: operations > 0 ? operations / (durationMs / 1000) : null,
    memoryBefore,
    memoryAfter,
    ...extra,
  };
}

async function appendMany({ count, keySpace, start = 0, sync = false }) {
  for (let i = 0; i < count; i += 1) {
    const n = start + i;
    await appendRecord({
      key: keyFor(n, keySpace),
      value: valueFor(n),
      timestamp: 1_700_000_000_000 + n,
      sync,
    });
  }
}

async function appendDeletes({ count, keySpace, start = 0 }) {
  for (let i = 0; i < count; i += 1) {
    const n = start + i;
    await appendRecord({
      type: TYPE_DELETE,
      key: keyFor(n, keySpace),
      value: "",
      timestamp: 1_700_100_000_000 + n,
    });
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
      const key = keyFor(i, keySpace);
      const value = valueFor(i);
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

async function runBench({ count = DEFAULT_COUNT, keySpace = DEFAULT_KEY_SPACE } = {}) {
  const cases = [];

  await resetBenchmarkData();
  cases.push(await measure("sequential puts", count, async () => {
    await appendMany({ count, keySpace: count });
    await rebuildAndSaveIndex();
    return {
      segmentSize: await sizeOf(SEGMENT_PATH),
      indexSize: await sizeOf(INDEX_PATH),
    };
  }));

  await resetBenchmarkData();
  cases.push(await measure("repeated puts", count, async () => {
    await appendMany({ count, keySpace });
    await rebuildAndSaveIndex();
    return {
      segmentSize: await sizeOf(SEGMENT_PATH),
      indexSize: await sizeOf(INDEX_PATH),
      keySpace,
    };
  }));

  cases.push(await measure("indexed gets", GET_COUNT, async () => {
    const loaded = await loadOrReplayIndex();
    const keys = Array.from({ length: GET_COUNT }, (_, i) => keyFor(i, keySpace));

    for (const key of keys) {
      const indexed = loaded.index.get(key);
      if (indexed !== undefined && indexed.deleted !== true) {
        await readRecordAt(indexed.segment, indexed.offset);
      }
    }

    return {
      indexMode: loaded.mode,
      entryCount: loaded.entryCount,
      segmentSize: loaded.segmentSize,
    };
  }));

  cases.push(await measure("full scan", count, async () => {
    let recordsRead = 0;
    for await (const entry of scanSegment()) {
      recordsRead += 1;
      void entry;
    }
    return { recordsRead };
  }));

  await truncate(SEGMENT_PATH, Math.max(0, await sizeOf(SEGMENT_PATH) - 7));
  const recoveryCase = await measure("recovery after truncated tail", 1, async () => {
    const report = await recoverSegment();
    return {
      recoveryMs: report.lostBytes >= 0 ? report.lostBytes : 0,
      recoveredSize: report.recoveredSize,
      lostBytes: report.lostBytes,
      validRecordCount: report.validRecordCount,
    };
  });
  recoveryCase.recoveryMs = recoveryCase.durationMs;
  cases.push(recoveryCase);

  await resetBenchmarkData();
  await appendMany({ count, keySpace });
  await appendMany({ count: Math.floor(count / 2), keySpace, start: count });
  await appendDeletes({ count: Math.floor(keySpace / 2), keySpace });
  const compactionCase = await measure("compaction after overwrites and deletes", 1, async () => {
    const report = await compactSegment();
    return {
      compactionMs: report.durationMs,
      beforeSize: report.beforeSize,
      afterSize: report.afterSize,
      recordsRead: report.recordsRead,
      recordsWritten: report.recordsWritten,
      tombstonesDropped: report.tombstonesDropped,
      overwrittenRecordsDropped: report.overwrittenRecordsDropped,
    };
  });
  compactionCase.compactionMs = compactionCase.durationMs;
  cases.push(compactionCase);

  const report = {
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuCount: cpus().length,
    },
    options: {
      count,
      keySpace,
      getCount: GET_COUNT,
      sync: false,
      checksumsEnabled: true,
    },
    cases,
    segmentSize: await sizeOf(SEGMENT_PATH),
    indexSize: await sizeOf(INDEX_PATH),
    memory: sampleMemory(),
    recoveryMs: recoveryCase.durationMs,
    compactionMs: compactionCase.durationMs,
  };

  await writeReports(report);
  return report;
}

function markdownReport(report) {
  const rows = report.cases.map((item) => {
    const ops = item.opsPerSec === null ? "-" : item.opsPerSec.toFixed(2);
    return `| ${item.name} | ${item.durationMs.toFixed(2)} | ${item.operations} | ${ops} |`;
  });

  return [
    "# Binary Store Benchmark",
    "",
    `Generated: ${report.generatedAt}`,
    `Node: ${report.environment.node}`,
    `Platform: ${report.environment.platform} ${report.environment.arch}`,
    `CPUs: ${report.environment.cpuCount}`,
    `Dataset size: ${report.options.count}`,
    `Sync mode: ${report.options.sync}`,
    `Checksums enabled: ${report.options.checksumsEnabled}`,
    "",
    "| Case | Duration ms | Operations | Ops/sec |",
    "| --- | ---: | ---: | ---: |",
    ...rows,
    "",
    `Segment size: ${report.segmentSize} bytes`,
    `Index size: ${report.indexSize} bytes`,
    `RSS: ${report.memory.rss} bytes`,
    `Heap used: ${report.memory.heapUsed} bytes`,
    `External: ${report.memory.external} bytes`,
    `ArrayBuffers: ${report.memory.arrayBuffers} bytes`,
    `Recovery time: ${report.recoveryMs.toFixed(2)} ms`,
    `Compaction time: ${report.compactionMs.toFixed(2)} ms`,
    "",
  ].join("\n");
}

async function writeReports(report) {
  await mkdir(dirname(REPORT_PATHS.benchJson), { recursive: true });
  await writeFile(REPORT_PATHS.benchJson, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(REPORT_PATHS.benchMarkdown, markdownReport(report));
}

function parseArgs(argv) {
  const generateIndex = argv.indexOf("--generate");
  if (generateIndex !== -1) {
    const count = Number(argv[generateIndex + 1]);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error("Usage: node --expose-gc src/bench.js --generate <count>");
    }
    return { mode: "generate", count };
  }

  const countIndex = argv.indexOf("--count");
  const count = countIndex === -1 ? DEFAULT_COUNT : Number(argv[countIndex + 1]);
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new Error("--count requires a positive integer");
  }

  const keySpaceIndex = argv.indexOf("--key-space");
  const keySpace = keySpaceIndex === -1 ? Math.min(DEFAULT_KEY_SPACE, count) : Number(argv[keySpaceIndex + 1]);
  if (!Number.isSafeInteger(keySpace) || keySpace <= 0) {
    throw new Error("--key-space requires a positive integer");
  }

  return { mode: "bench", count, keySpace };
}

try {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.mode === "generate") {
    console.log(JSON.stringify(await generateFixture(parsed.count), null, 2));
  } else {
    const report = await runBench(parsed);
    console.log(JSON.stringify({
      report: "reports/bench.json",
      markdown: "reports/bench.md",
      cases: report.cases.length,
      segmentSize: report.segmentSize,
      indexSize: report.indexSize,
    }, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
