import test from "node:test";
import assert from "node:assert/strict";
import { createAckFrame } from "../src/ack.js";
import { decodeFrame } from "../src/frame-decode.js";
import { TYPE_ACK } from "../src/protocol.js";

test("createAckFrame encodes an ACK with matching request id", () => {
  const frame = createAckFrame({
    requestId: "42",
    policy: "accepted",
    connectionId: 7
  });
  const decoded = decodeFrame(frame);

  assert.equal(decoded.type, TYPE_ACK);
  assert.equal(decoded.requestId, "42");
  assert.equal(decoded.payload.requestId, "42");
  assert.equal(decoded.payload.policy, "accepted");
  assert.equal(decoded.payload.connectionId, 7);
});
