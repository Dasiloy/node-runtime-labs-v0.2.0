import { TYPE_DELETE, TYPE_PUT } from "./record-format.js";
import { SEGMENT_PATH } from "./paths.js";

export function applyRecord(index, entry, { segment = SEGMENT_PATH } = {}) {
  const { record } = entry;

  if (record.type !== TYPE_PUT && record.type !== TYPE_DELETE) {
    throw new Error(`cannot index unknown record type: ${record.type}`);
  }

  index.set(record.key, {
    key: record.key,
    type: record.typeName,
    segment,
    offset: entry.offset,
    length: entry.length,
    timestamp: record.timestamp,
  });

  return index;
}

export async function buildIndexFromScan(scan, options = {}) {
  const index = new Map();

  for await (const entry of scan) {
    applyRecord(index, entry, options);
  }

  return index;
}
