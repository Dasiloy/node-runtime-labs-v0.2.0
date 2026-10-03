import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TYPE_DELETE } from "../src/record-format.js";
import { appendRecord } from "../src/segment-writer.js";
import { buildIndexFromScan, rebuildAndSaveIndex } from "../src/index.js";
import { readRecordAt, scanSegment } from "../src/segment-reader.js";

describe("tombstones", () => {
  it("appends deletes and keeps deleted state in the index", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nlog-tombstone-"));
    const segment = join(dir, "segment.dat");
    const indexPath = join(dir, "index.json");

    try {
      await appendRecord({ segment, key: "name", value: "ish", timestamp: 1 });
      const tombstone = await appendRecord({
        segment,
        type: TYPE_DELETE,
        key: "name",
        value: "",
        timestamp: 2,
      });

      const entry = await readRecordAt(segment, tombstone.offset);
      const index = await buildIndexFromScan(scanSegment(segment), { segment });
      await rebuildAndSaveIndex({ segment, indexPath });
      const persisted = JSON.parse(await readFile(indexPath, "utf8"));

      assert.equal(entry.record.typeName, "DELETE");
      assert.equal(entry.record.valueLength, 0);
      assert.equal(index.get("name").deleted, true);
      assert.equal(persisted.entries[0].deleted, true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
