import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OFFSETS, TYPE_PUT } from "../src/record-format.js";
import { encodeRecord } from "../src/record-encode.js";
import { decodeRecord } from "../src/record-decode.js";
import { verifyRecordChecksum } from "../src/checksum.js";

describe("record checksums", () => {
  it("writes a verifiable checksum during encoding", () => {
    const encoded = encodeRecord({
      type: TYPE_PUT,
      key: "name",
      value: "ish",
      timestamp: 1,
    });

    const checksum = verifyRecordChecksum(encoded);
    assert.equal(checksum.ok, true);
    assert.notEqual(checksum.storedChecksum, 0);
  });

  it("rejects one-byte payload corruption", () => {
    const encoded = encodeRecord({
      type: TYPE_PUT,
      key: "name",
      value: "ish",
      timestamp: 1,
    });

    encoded[OFFSETS.payload + Buffer.byteLength("name", "utf8") + 1] ^= 1;

    assert.throws(() => decodeRecord(encoded), /checksum mismatch/);
    assert.doesNotThrow(() => decodeRecord(encoded, { verifyChecksum: false }));
  });
});
