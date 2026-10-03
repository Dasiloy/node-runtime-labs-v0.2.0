import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendRecord } from "../src/segment-writer.js";
import {
  buildIndexFromScan,
  loadOrReplayIndex,
  rebuildAndSaveIndex,
} from "../src/index.js";
import { scanSegment } from "../src/segment-reader.js";

describe("persisted index", () => {
  it("stores entries as an array and loads when segment size matches", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nlog-persisted-index-"));
    const segment = join(dir, "segment.dat");
    const indexPath = join(dir, "index.json");

    try {
      await appendRecord({ segment, key: "name", value: "ish", timestamp: 1 });
      await appendRecord({ segment, key: "city", value: "pune", timestamp: 2 });
      await rebuildAndSaveIndex({ segment, indexPath });

      const loaded = await loadOrReplayIndex({ segment, indexPath });

      assert.equal(loaded.mode, "persisted-index");
      assert.equal(loaded.entryCount, 2);
      assert.equal(loaded.index.get("name").offset, 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("falls back to replay when segment size changes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nlog-stale-index-"));
    const segment = join(dir, "segment.dat");
    const indexPath = join(dir, "index.json");

    try {
      await appendRecord({ segment, key: "name", value: "ish", timestamp: 1 });
      const stale = await buildIndexFromScan(scanSegment(segment), { segment });
      await rebuildAndSaveIndex({ segment, indexPath });
      await appendRecord({ segment, key: "name", value: "node", timestamp: 2 });

      assert.equal(stale.get("name").offset, 0);

      const loaded = await loadOrReplayIndex({ segment, indexPath });
      assert.equal(loaded.mode, "full-replay");
      assert.equal(loaded.index.get("name").offset > 0, true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
