import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, truncate } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendRecord } from "../src/segment-writer.js";
import { recoverSegment } from "../src/recover.js";
import { scanSegment } from "../src/segment-reader.js";

describe("recovery", () => {
  it("truncates a partial tail and rebuilds the index", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nlog-recover-"));
    const segment = join(dir, "segment.dat");
    const indexPath = join(dir, "index.json");
    const reportPath = join(dir, "recovery.json");

    try {
      const first = await appendRecord({ segment, key: "a", value: "one", timestamp: 1 });
      await appendRecord({ segment, key: "b", value: "two", timestamp: 2 });
      const originalSize = (await stat(segment)).size;
      await truncate(segment, originalSize - 7);

      const report = await recoverSegment(segment, { indexPath, reportPath });
      const recovered = (await stat(segment)).size;
      const entries = [];
      for await (const entry of scanSegment(segment)) {
        entries.push(entry);
      }

      assert.equal(report.originalSize, originalSize - 7);
      assert.equal(report.recoveredSize, first.length);
      assert.equal(report.lostBytes, report.originalSize - report.recoveredSize);
      assert.equal(recovered, first.length);
      assert.equal(entries.length, 1);
      assert.equal(entries[0].record.key, "a");

      const index = JSON.parse(await readFile(indexPath, "utf8"));
      assert.equal(index.entries.length, 1);
      assert.equal(index.entries[0].key, "a");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
