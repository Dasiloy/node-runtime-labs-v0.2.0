import test from "node:test";
import assert from "node:assert/strict";
import { buildEventPayload, encodeFrame } from "../client/encode.js";
import { decodeFrame } from "../src/frame-decode.js";
import {
  CHECKSUM_OFFSET,
  TYPE_EVENT
} from "../src/protocol.js";
import {
  BadMagicError,
  ChecksumMismatchError,
  InvalidLengthError,
  UnknownFrameTypeError,
  UnsupportedVersionError
} from "../src/protocol-errors.js";

test("decodeFrame returns the event from one encoded frame", () => {
  const payload = buildEventPayload({
    name: "user.login",
    timestamp: "2026-01-01T00:00:00.000Z",
    attributes: { tenant: "acme" }
  });
  const frame = encodeFrame({ type: TYPE_EVENT, requestId: 42, payload });
  const decoded = decodeFrame(frame);

  assert.equal(decoded.type, TYPE_EVENT);
  assert.equal(decoded.requestId, "42");
  assert.equal(decoded.payload.name, "user.login");
  assert.deepEqual(decoded.payload.attributes, { tenant: "acme" });
  assert.equal(decoded.consumedBytes, frame.length);
});

test("decodeFrame rejects a bad checksum through a protocol error", () => {
  const payload = buildEventPayload({
    name: "checksum.fail",
    timestamp: "2026-01-01T00:00:00.000Z"
  });
  const frame = encodeFrame({ requestId: 99, payload });
  const corrupted = Buffer.from(frame);
  corrupted[corrupted.length - 1] ^= 0xff;

  assert.throws(() => decodeFrame(corrupted), ChecksumMismatchError);
});

test("decodeFrame reports distinct fixed-header validation errors", () => {
  const frame = encodeFrame({
    requestId: 1,
    payload: buildEventPayload({ name: "ok", timestamp: "2026-01-01T00:00:00.000Z" })
  });

  const shortFrame = Buffer.alloc(10);
  assert.throws(() => decodeFrame(shortFrame), InvalidLengthError);

  const badMagic = Buffer.from(frame);
  badMagic[0] = 0;
  assert.throws(() => decodeFrame(badMagic), BadMagicError);

  const badVersion = Buffer.from(frame);
  badVersion[4] = 99;
  assert.throws(() => decodeFrame(badVersion), UnsupportedVersionError);

  const unknownType = Buffer.from(frame);
  unknownType[5] = 99;
  unknownType.writeUInt32BE(0, CHECKSUM_OFFSET);
  // The type check runs before checksum validation.
  assert.throws(() => decodeFrame(unknownType), UnknownFrameTypeError);
});
