import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEventPayload,
  computeFrameChecksum,
  encodeFrame
} from "../client/encode.js";
import {
  CHECKSUM_OFFSET,
  FLAGS_OFFSET,
  HEADER_SIZE,
  MAGIC,
  PAYLOAD_LENGTH_OFFSET,
  REQUEST_ID_OFFSET,
  TYPE_EVENT,
  TYPE_OFFSET,
  VERSION,
  VERSION_OFFSET
} from "../src/protocol.js";

test("encodeFrame writes the fixed header fields", () => {
  const payload = buildEventPayload({
    name: "user.login",
    timestamp: "2026-01-01T00:00:00.000Z",
    attributes: { ip: "127.0.0.1" }
  });
  const frame = encodeFrame({ type: TYPE_EVENT, requestId: 42n, payload });

  assert.deepEqual(frame.subarray(0, 4), MAGIC);
  assert.equal(frame.readUInt8(VERSION_OFFSET), VERSION);
  assert.equal(frame.readUInt8(TYPE_OFFSET), TYPE_EVENT);
  assert.equal(frame.readUInt16BE(FLAGS_OFFSET), 0);
  assert.equal(frame.readBigUInt64BE(REQUEST_ID_OFFSET), 42n);
});

test("encodeFrame places the JSON payload after the fixed header", () => {
  const payload = buildEventPayload({
    name: "billing.invoice.created",
    timestamp: "2026-01-01T00:00:00.000Z",
    attributes: { invoiceId: "inv_123" }
  });
  const frame = encodeFrame({ requestId: 7, payload });
  const payloadLength = frame.readUInt32BE(PAYLOAD_LENGTH_OFFSET);
  const payloadText = frame.subarray(HEADER_SIZE).toString("utf8");

  assert.equal(payloadLength, Buffer.byteLength(payloadText, "utf8"));
  assert.equal(frame.length, HEADER_SIZE + payloadLength);
  assert.deepEqual(JSON.parse(payloadText), payload);
});

test("encodeFrame checksum is stable for deterministic payloads", () => {
  const payload = buildEventPayload({
    name: "stable.event",
    timestamp: "2026-01-01T00:00:00.000Z",
    attributes: { stable: true }
  });
  const first = encodeFrame({ requestId: 100, payload });
  const second = encodeFrame({ requestId: 100, payload });

  assert.equal(first.readUInt32BE(CHECKSUM_OFFSET), second.readUInt32BE(CHECKSUM_OFFSET));
  assert.equal(first.readUInt32BE(CHECKSUM_OFFSET), computeFrameChecksum(first));
});
