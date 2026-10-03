import { mkdir, stat, truncate, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { rebuildAndSaveIndex } from "./index.js";
import { REPORT_PATHS, SEGMENT_PATH } from "./paths.js";
import { scanSegment } from "./segment-reader.js";

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

function failureDetails(error, fallbackOffset) {
  const message = error instanceof Error ? error.message : String(error);
  const reason = error && typeof error === "object" && "reason" in error
    ? error.reason
    : message;
  const offset = error && typeof error === "object" && "offset" in error
    ? error.offset
    : fallbackOffset;

  return { failureOffset: offset, failureReason: reason };
}

export async function recoverSegment(segment = SEGMENT_PATH, {
  reportPath = REPORT_PATHS.recovery,
  indexPath,
} = {}) {
  const originalSize = await fileSize(segment);
  let lastValidOffset = 0;
  let lastValidLength = 0;
  let validRecordCount = 0;
  let failureOffset = null;
  let failureReason = null;

  try {
    for await (const entry of scanSegment(segment)) {
      lastValidOffset = entry.offset;
      lastValidLength = entry.length;
      validRecordCount += 1;
    }
  } catch (error) {
    const failure = failureDetails(error, lastValidOffset + lastValidLength);
    failureOffset = failure.failureOffset;
    failureReason = failure.failureReason;
  }

  const recoveredSize = lastValidOffset + lastValidLength;

  if (recoveredSize < originalSize) {
    await truncate(segment, recoveredSize);
  }

  await rebuildAndSaveIndex({ segment, indexPath });

  const report = {
    originalSize,
    recoveredSize,
    lostBytes: originalSize - recoveredSize,
    failureOffset,
    failureReason,
    validRecordCount,
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
