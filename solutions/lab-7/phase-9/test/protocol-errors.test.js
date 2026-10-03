import test from "node:test";
import assert from "node:assert/strict";
import {
  createMalformedFrame,
  createUnknownTypeFrame,
  MALFORMED_MODES
} from "../client/malformed.js";
import { decodeFrame } from "../src/frame-decode.js";
import {
  BadMagicError,
  ChecksumMismatchError,
  InvalidLengthError,
  InvalidPayloadError,
  ProtocolError,
  UnknownFrameTypeError,
  UnsupportedVersionError
} from "../src/protocol-errors.js";

test("protocol errors expose stable code strings and details", () => {
  const errors = [
    new ProtocolError("GENERIC", "generic", { a: 1 }),
    new BadMagicError({ a: 1 }),
    new UnsupportedVersionError({ a: 1 }),
    new InvalidLengthError({ a: 1 }),
    new UnknownFrameTypeError({ a: 1 }),
    new ChecksumMismatchError({ a: 1 }),
    new InvalidPayloadError({ a: 1 })
  ];

  for (const error of errors) {
    assert.equal(typeof error.code, "string");
    assert.deepEqual(error.details, { a: 1 });
  }
});

test("malformed client modes decode to expected protocol errors", () => {
  assert.deepEqual(MALFORMED_MODES, [
    "bad-magic",
    "bad-version",
    "huge-length",
    "bad-checksum",
    "bad-json"
  ]);

  assert.throws(() => decodeFrame(createMalformedFrame("bad-magic")), BadMagicError);
  assert.throws(
    () => decodeFrame(createMalformedFrame("bad-version")),
    UnsupportedVersionError
  );
  assert.throws(() => decodeFrame(createMalformedFrame("huge-length")), InvalidLengthError);
  assert.throws(
    () => decodeFrame(createMalformedFrame("bad-checksum")),
    ChecksumMismatchError
  );
  assert.throws(() => decodeFrame(createMalformedFrame("bad-json")), InvalidPayloadError);
  assert.throws(() => decodeFrame(createUnknownTypeFrame()), UnknownFrameTypeError);
});
