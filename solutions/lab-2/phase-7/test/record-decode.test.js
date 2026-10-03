import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HEADER_SIZE, OFFSETS, TYPE_PUT } from "../src/record-format.js";
import { encodeRecord } from "../src/record-encode.js";
import { decodeRecord } from "../src/record-decode.js";

describe("decodeRecord", () => {
  it("round-trips ASCII records", () => {
    const encoded = encodeRecord({
      type: TYPE_PUT,
      key: "hello",
      value: "world",
      timestamp: 42,
    });

    const decoded = decodeRecord(encoded);

    assert.equal(decoded.type, TYPE_PUT);
    assert.equal(decoded.key, "hello");
    assert.equal(decoded.value, "world");
    assert.equal(decoded.timestamp, 42);
    assert.equal(decoded.keyLength, 5);
    assert.equal(decoded.valueLength, 5);
    assert.equal(decoded.recordLength, HEADER_SIZE + 10);
    assert.equal(decoded.payloadOffset, OFFSETS.payload);
  });

  it("round-trips non-ASCII records", () => {
    const encoded = encodeRecord({
      type: TYPE_PUT,
      key: "नाम",
      value: "東京",
      timestamp: 99,
    });

    const decoded = decodeRecord(encoded);

    assert.equal(decoded.key, "नाम");
    assert.equal(decoded.value, "東京");
    assert.equal(decoded.keyLength, Buffer.byteLength("नाम", "utf8"));
    assert.equal(decoded.valueLength, Buffer.byteLength("東京", "utf8"));
  });

  it("rejects invalid headers", () => {
    const encoded = encodeRecord({ type: TYPE_PUT, key: "a", value: "b" });
    encoded[0] = 0;

    assert.throws(() => decodeRecord(encoded), /invalid magic/);
    assert.throws(() => decodeRecord(Buffer.alloc(HEADER_SIZE - 1)), /incomplete header/);
  });

  it("rejects incomplete payloads", () => {
    const encoded = encodeRecord({ type: TYPE_PUT, key: "hello", value: "world" });
    assert.throws(() => decodeRecord(encoded.subarray(0, encoded.length - 1)), /incomplete payload/);
  });

  it("supports copy, slice, and subarray payload ownership modes", () => {
    const original = encodeRecord({ type: TYPE_PUT, key: "aa", value: "bb" });
    const copy = decodeRecord(Buffer.from(original), { payloadMode: "copy" });
    const sliceSource = Buffer.from(original);
    const sliced = decodeRecord(sliceSource, { payloadMode: "slice" });
    const subarraySource = Buffer.from(original);
    const subarrayed = decodeRecord(subarraySource, { payloadMode: "subarray" });

    sliceSource[OFFSETS.payload] = "z".charCodeAt(0);
    subarraySource[OFFSETS.payload] = "z".charCodeAt(0);

    assert.equal(copy.keyBuffer.toString("utf8"), "aa");
    assert.equal(sliced.keyBuffer.toString("utf8"), "za");
    assert.equal(subarrayed.keyBuffer.toString("utf8"), "za");
  });
});
