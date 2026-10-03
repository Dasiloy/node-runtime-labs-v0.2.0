import { crc32 } from "node:zlib";
import {
  CHECKSUM_OFFSET,
  FLAGS_OFFSET,
  HEADER_SIZE,
  MAGIC,
  MAX_PAYLOAD_BYTES,
  PAYLOAD_LENGTH_OFFSET,
  PAYLOAD_OFFSET,
  REQUEST_ID_OFFSET,
  TYPE_EVENT,
  TYPE_OFFSET,
  VERSION,
  VERSION_OFFSET,
  assertPayloadSize
} from "../src/protocol.js";

export function buildEventPayload({
  name,
  attributes = {},
  timestamp = new Date().toISOString()
}) {
  if (!name || typeof name !== "string") {
    throw new TypeError("event name is required");
  }

  return { name, timestamp, attributes };
}

export function encodeFrame({
  type = TYPE_EVENT,
  requestId = 1n,
  payload = {},
  flags = 0
}) {
  const payloadBytes = payloadToBytes(payload);
  assertPayloadSize(payloadBytes.length);

  const frame = Buffer.allocUnsafe(HEADER_SIZE + payloadBytes.length);
  let offset = 0;

  MAGIC.copy(frame, offset);
  offset += MAGIC.length;
  frame.writeUInt8(VERSION, offset);
  offset += 1;
  frame.writeUInt8(type, offset);
  offset += 1;
  frame.writeUInt16BE(flags, offset);
  offset += 2;
  frame.writeBigUInt64BE(BigInt(requestId), offset);
  offset += 8;
  frame.writeUInt32BE(payloadBytes.length, offset);
  offset += 4;
  frame.writeUInt32BE(0, offset);
  offset += 4;

  if (offset !== HEADER_SIZE) {
    throw new Error(`encoder wrote ${offset} header bytes instead of ${HEADER_SIZE}`);
  }

  payloadBytes.copy(frame, PAYLOAD_OFFSET);
  offset += payloadBytes.length;
  if (offset !== frame.length) {
    throw new Error(`encoder wrote ${offset} frame bytes instead of ${frame.length}`);
  }

  frame.writeUInt32BE(computeFrameChecksum(frame), CHECKSUM_OFFSET);
  return frame;
}

export function computeFrameChecksum(frame) {
  if (frame.length < HEADER_SIZE) {
    throw new RangeError("frame is shorter than the protocol header");
  }

  const previous = frame.readUInt32BE(CHECKSUM_OFFSET);
  frame.writeUInt32BE(0, CHECKSUM_OFFSET);
  const checksum = crc32(frame) >>> 0;
  frame.writeUInt32BE(previous, CHECKSUM_OFFSET);
  return checksum;
}

export function formatHexDump(buffer) {
  const lines = [];

  for (let offset = 0; offset < buffer.length; offset += 16) {
    const row = buffer.subarray(offset, offset + 16);
    const hex = [...row].map(byte => byte.toString(16).padStart(2, "0")).join(" ");
    const ascii = [...row]
      .map(byte => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : "."))
      .join("");
    lines.push(`${offset.toString(16).padStart(8, "0")}  ${hex.padEnd(47)}  ${ascii}`);
  }

  return lines.join("\n");
}

export function frameMetadata(frame) {
  return {
    version: frame.readUInt8(VERSION_OFFSET),
    type: frame.readUInt8(TYPE_OFFSET),
    flags: frame.readUInt16BE(FLAGS_OFFSET),
    requestId: frame.readBigUInt64BE(REQUEST_ID_OFFSET).toString(),
    payloadLength: frame.readUInt32BE(PAYLOAD_LENGTH_OFFSET),
    checksum: frame.readUInt32BE(CHECKSUM_OFFSET)
  };
}

function payloadToBytes(payload) {
  if (Buffer.isBuffer(payload)) {
    if (payload.length > MAX_PAYLOAD_BYTES) {
      throw new RangeError(`payload length ${payload.length} exceeds ${MAX_PAYLOAD_BYTES}`);
    }
    return payload;
  }

  const json = JSON.stringify(payload);
  return Buffer.from(json, "utf8");
}
