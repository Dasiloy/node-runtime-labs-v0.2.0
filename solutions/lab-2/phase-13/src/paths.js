import { resolve } from "node:path";

export const DATA_DIR = resolve(process.cwd(), "data");
export const REPORTS_DIR = resolve(process.cwd(), "reports");
export const FIXTURES_DIR = resolve(process.cwd(), "fixtures");

export const SEGMENT_PATH = resolve(DATA_DIR, "segment-0001.dat");
export const COMPACTING_SEGMENT_PATH = resolve(DATA_DIR, "segment-0001.compacting");
export const BACKUP_SEGMENT_PATH = resolve(DATA_DIR, "segment-0001.dat.bak");
export const COMPACT_LOCK_PATH = resolve(DATA_DIR, "compact.lock");
export const INDEX_PATH = resolve(DATA_DIR, "index.json");

export const REPORT_PATHS = Object.freeze({
  indexLoad: resolve(REPORTS_DIR, "index-load.json"),
  recovery: resolve(REPORTS_DIR, "recovery.json"),
  compaction: resolve(REPORTS_DIR, "compaction.json"),
  bufferOwnership: resolve(REPORTS_DIR, "buffer-ownership.json"),
  benchJson: resolve(REPORTS_DIR, "bench.json"),
  benchMarkdown: resolve(REPORTS_DIR, "bench.md"),
});
