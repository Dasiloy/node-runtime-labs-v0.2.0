import {
  mkdir,
  open,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import {
  BACKUP_SEGMENT_PATH,
  COMPACT_LOCK_PATH,
  COMPACTING_SEGMENT_PATH,
  REPORT_PATHS,
  SEGMENT_PATH,
} from "./paths.js";
import { TYPE_PUT } from "./record-format.js";
import { rebuildAndSaveIndex } from "./index.js";
import { readRecordAt, scanSegment } from "./segment-reader.js";
import { appendRecord } from "./segment-writer.js";

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function fileSize(path) {
  try {
    return (await stat(path)).size;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return 0;
    }
    throw error;
  }
}

async function syncFile(path) {
  const handle = await open(path, "a");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function renameIfExists(from, to) {
  try {
    await rename(from, to);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function cleanupCompactionArtifacts({
  segment = SEGMENT_PATH,
  compacting = COMPACTING_SEGMENT_PATH,
  backup = BACKUP_SEGMENT_PATH,
} = {}) {
  const actions = [];
  const segmentExists = await exists(segment);
  const backupExists = await exists(backup);

  if (!segmentExists && backupExists) {
    await rename(backup, segment);
    actions.push({ artifact: backup, action: "restored-backup-as-segment" });
  } else if (backupExists) {
    const preserved = `${backup}.orphan-${process.pid}`;
    await rename(backup, preserved);
    actions.push({ artifact: backup, action: "preserved-backup", path: preserved });
  }

  if (await exists(compacting)) {
    const preserved = `${compacting}.orphan-${process.pid}`;
    await rename(compacting, preserved);
    actions.push({ artifact: compacting, action: "preserved-compacting", path: preserved });
  }

  return actions;
}

async function collectEntries(segment) {
  const entries = [];
  const latest = new Map();

  for await (const entry of scanSegment(segment)) {
    entries.push(entry);
    latest.set(entry.record.key, entry);
  }

  return { entries, latest };
}

async function writeEmptyCompacting(path) {
  const handle = await open(path, "w");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function compactSegment({
  segment = SEGMENT_PATH,
  compacting = COMPACTING_SEGMENT_PATH,
  backup = BACKUP_SEGMENT_PATH,
  lockPath = COMPACT_LOCK_PATH,
  reportPath = REPORT_PATHS.compaction,
  indexPath,
} = {}) {
  await mkdir(dirname(segment), { recursive: true });
  const cleanupActions = await cleanupCompactionArtifacts({ segment, compacting, backup });
  const lock = await open(lockPath, "wx");
  const started = performance.now();

  try {
    const beforeSize = await fileSize(segment);
    const { entries, latest } = await collectEntries(segment);
    const liveEntries = Array.from(latest.values()).filter((entry) => entry.record.type === TYPE_PUT);
    const liveOffsets = new Set(liveEntries.map((entry) => entry.offset));
    const tombstonesDropped = entries.filter((entry) => entry.record.typeName === "DELETE").length;
    const overwrittenRecordsDropped = entries.filter(
      (entry) => entry.record.typeName === "PUT" && !liveOffsets.has(entry.offset),
    ).length;

    await rm(compacting, { force: true });

    if (liveEntries.length === 0) {
      await writeEmptyCompacting(compacting);
    } else {
      for (const indexedEntry of liveEntries) {
        const entry = await readRecordAt(segment, indexedEntry.offset);
        await appendRecord({
          segment: compacting,
          type: TYPE_PUT,
          key: entry.record.key,
          value: entry.record.value,
          timestamp: entry.record.timestamp,
        });
      }
      await syncFile(compacting);
    }

    const afterSize = await fileSize(compacting);
    await rm(backup, { force: true });
    await renameIfExists(segment, backup);
    await rename(compacting, segment);
    await syncFile(segment);
    await rebuildAndSaveIndex({ segment, indexPath });
    await rm(backup, { force: true });

    const report = {
      beforeSize,
      afterSize,
      recordsRead: entries.length,
      recordsWritten: liveEntries.length,
      tombstonesDropped,
      overwrittenRecordsDropped,
      durationMs: performance.now() - started,
      timestampRule: "preserve-original",
      cleanupActions,
    };

    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    return report;
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
