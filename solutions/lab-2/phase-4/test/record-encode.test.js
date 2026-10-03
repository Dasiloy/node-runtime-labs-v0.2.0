import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HEADER_SIZE,
  MAGIC,
  OFFSETS,
  TYPE_PUT,
  VERSION,
} from "../src/record-format.js";
import { encodeRecord } from "../src/record-encode.js";

describe("encodeRecord", () => {
  it("encodes length, header fields, and payload order", () => {
    const record = encodeRecord({
      type: TYPE_PUT,
      key: "hello",
      value: "world",
      timestamp: 1_700_000_000_000,
    });

    assert.equal(record.length, HEADER_SIZE + 5 + 5);
    assert.deepEqual(record.subarray(OFFSETS.magic, OFFSETS.magic + 4), MAGIC);
    assert.equal(record.readUInt8(OFFSETS.version), VERSION);
    assert.equal(record.readUInt8(OFFSETS.type), TYPE_PUT);
    assert.equal(record.readUInt16BE(OFFSETS.reserved), 0);
    assert.equal(record.readUInt32BE(OFFSETS.keyLength), 5);
    assert.equal(record.readUInt32BE(OFFSETS.valueLength), 5);
    assert.equal(Number(record.readBigUInt64BE(OFFSETS.timestamp)), 1_700_000_000_000);
    assert.equal(record.readUInt32BE(OFFSETS.checksum), 0);
    assert.equal(record.subarray(OFFSETS.payload).toString("utf8"), "helloworld");
  });

  it("uses UTF-8 byte lengths for non-ASCII data", () => {
    const record = encodeRecord({
      type: TYPE_PUT,
      key: "नोड",
      value: "東京",
      timestamp: 1,
    });

    assert.equal(record.readUInt32BE(OFFSETS.keyLength), Buffer.byteLength("नोड", "utf8"));
    assert.equal(record.readUInt32BE(OFFSETS.valueLength), Buffer.byteLength("東京", "utf8"));
  });

  it("rejects invalid inputs before allocation", () => {
    assert.throws(() => encodeRecord({ type: 99, key: "a", value: "b" }), /unknown/);
    assert.throws(() => encodeRecord({ type: TYPE_PUT, key: "", value: "b" }), /empty/);
    assert.throws(() => encodeRecord({ type: TYPE_PUT, key: "a", value: "b", timestamp: -1 }), /timestamp/);
  });
});
