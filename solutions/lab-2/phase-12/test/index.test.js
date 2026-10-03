import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendRecord } from "../src/segment-writer.js";
import { buildIndexFromScan } from "../src/index.js";
import { readRecordAt, scanSegment } from "../src/segment-reader.js";

describe("in-memory index", () => {
  it("keeps the newest offset for repeated puts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nlog-index-"));
    const segment = join(dir, "segment.dat");

    try {
      await appendRecord({ segment, key: "name", value: "ish", timestamp: 1 });
      const second = await appendRecord({ segment, key: "name", value: "node", timestamp: 2 });

      const index = await buildIndexFromScan(scanSegment(segment), { segment });
      const indexed = index.get("name");

      assert.equal(index.size, 1);
      assert.equal(indexed.offset, second.offset);

      const entry = await readRecordAt(indexed.segment, indexed.offset);
      assert.equal(entry.record.value, "node");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
