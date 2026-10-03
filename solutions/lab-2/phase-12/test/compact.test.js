import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TYPE_DELETE } from "../src/record-format.js";
import { appendRecord } from "../src/segment-writer.js";
import { compactSegment } from "../src/compact.js";
import { scanSegment } from "../src/segment-reader.js";

describe("compaction", () => {
  it("keeps only live PUT records and writes a new index", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nlog-compact-"));
    const segment = join(dir, "segment.dat");
    const compacting = join(dir, "segment.compacting");
    const backup = join(dir, "segment.dat.bak");
    const lockPath = join(dir, "compact.lock");
    const indexPath = join(dir, "index.json");
    const reportPath = join(dir, "compaction.json");

    try {
      await appendRecord({ segment, key: "name", value: "ish", timestamp: 1 });
      await appendRecord({ segment, key: "name", value: "node", timestamp: 2 });
      await appendRecord({ segment, key: "city", value: "pune", timestamp: 3 });
      await appendRecord({ segment, type: TYPE_DELETE, key: "city", value: "", timestamp: 4 });
      const before = (await stat(segment)).size;

      const report = await compactSegment({
        segment,
        compacting,
        backup,
        lockPath,
        indexPath,
        reportPath,
      });

      const entries = [];
      for await (const entry of scanSegment(segment)) {
        entries.push(entry);
      }

      const index = JSON.parse(await readFile(indexPath, "utf8"));
      const after = (await stat(segment)).size;

      assert.equal(report.recordsRead, 4);
      assert.equal(report.recordsWritten, 1);
      assert.equal(report.tombstonesDropped, 1);
      assert.equal(report.overwrittenRecordsDropped, 2);
      assert.equal(after < before, true);
      assert.equal(entries.length, 1);
      assert.equal(entries[0].record.key, "name");
      assert.equal(entries[0].record.value, "node");
      assert.equal(index.entries.length, 1);
      assert.equal(index.entries[0].offset, 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
