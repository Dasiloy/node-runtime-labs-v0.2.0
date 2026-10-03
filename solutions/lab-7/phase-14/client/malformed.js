import {
  buildEventPayload,
  computeFrameChecksum,
  encodeFrame
} from "./encode.js";
import {
  CHECKSUM_OFFSET,
  MAX_PAYLOAD_BYTES,
  PAYLOAD_LENGTH_OFFSET,
  TYPE_OFFSET
} from "../src/protocol.js";

export const MALFORMED_MODES = Object.freeze([
  "bad-magic",
  "bad-version",
  "huge-length",
  "bad-checksum",
  "bad-json"
]);

export function createMalformedFrame(mode, { requestId = 1 } = {}) {
  if (mode === "bad-json") {
    return encodeFrame({ requestId, payload: Buffer.from("{", "utf8") });
  }

  const frame = encodeFrame({
    requestId,
    payload: buildEventPayload({
      name: "malformed.sample",
      timestamp: "2026-01-01T00:00:00.000Z"
    })
  });

  switch (mode) {
    case "bad-magic":
      frame[0] = 0x00;
      return frame;
    case "bad-version":
      frame[4] = 0xff;
      return frame;
    case "huge-length":
      frame.writeUInt32BE(MAX_PAYLOAD_BYTES + 1, PAYLOAD_LENGTH_OFFSET);
      return frame;
    case "bad-checksum":
      frame[frame.length - 1] ^= 0xff;
      return frame;
    default:
      throw new Error(`Unknown malformed mode: ${mode}`);
  }
}

export function createUnknownTypeFrame({ requestId = 1 } = {}) {
  const frame = encodeFrame({
    requestId,
    payload: buildEventPayload({
      name: "unknown.type",
      timestamp: "2026-01-01T00:00:00.000Z"
    })
  });
  frame.writeUInt8(99, TYPE_OFFSET);
  frame.writeUInt32BE(0, CHECKSUM_OFFSET);
  frame.writeUInt32BE(computeFrameChecksum(frame), CHECKSUM_OFFSET);
  return frame;
}
