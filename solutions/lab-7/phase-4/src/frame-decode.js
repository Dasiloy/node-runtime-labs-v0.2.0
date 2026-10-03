import { computeFrameChecksum } from "../client/encode.js";
import {
  CHECKSUM_OFFSET,
  FLAGS_OFFSET,
  FRAME_TYPES,
  HEADER_SIZE,
  MAGIC,
  MAX_PAYLOAD_BYTES,
  PAYLOAD_LENGTH_OFFSET,
  PAYLOAD_OFFSET,
  REQUEST_ID_OFFSET,
  TYPE_HEARTBEAT,
  TYPE_OFFSET,
  VERSION,
  VERSION_OFFSET
} from "./protocol.js";
import {
  BadMagicError,
  ChecksumMismatchError,
  InvalidLengthError,
  InvalidPayloadError,
  ProtocolError,
  UnknownFrameTypeError,
  UnsupportedVersionError
} from "./protocol-errors.js";

export function decodeFrame(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError("decodeFrame expects a Buffer");
  }

  if (buffer.length < HEADER_SIZE) {
    throw new InvalidLengthError({
      minimumBytes: HEADER_SIZE,
      actualBytes: buffer.length
    });
  }

  if (!buffer.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new BadMagicError({ actualHex: buffer.subarray(0, MAGIC.length).toString("hex") });
  }

  const version = buffer.readUInt8(VERSION_OFFSET);
  if (version !== VERSION) {
    throw new UnsupportedVersionError({ version, supportedVersion: VERSION });
  }

  const type = buffer.readUInt8(TYPE_OFFSET);
  if (!FRAME_TYPES[type]) {
    throw new UnknownFrameTypeError({ type });
  }

  const flags = buffer.readUInt16BE(FLAGS_OFFSET);
  if (flags !== 0) {
    throw new ProtocolError("INVALID_FLAGS", "Frame flags are unsupported", { flags });
  }

  const requestId = buffer.readBigUInt64BE(REQUEST_ID_OFFSET);
  const payloadLength = buffer.readUInt32BE(PAYLOAD_LENGTH_OFFSET);
  if (payloadLength > MAX_PAYLOAD_BYTES) {
    throw new InvalidLengthError({ payloadLength, maxPayloadBytes: MAX_PAYLOAD_BYTES });
  }

  const frameEnd = HEADER_SIZE + payloadLength;
  if (buffer.length < frameEnd) {
    throw new InvalidLengthError({
      expectedBytes: frameEnd,
      actualBytes: buffer.length,
      payloadLength
    });
  }

  const frame = buffer.subarray(0, frameEnd);
  const expectedChecksum = frame.readUInt32BE(CHECKSUM_OFFSET);
  const actualChecksum = computeFrameChecksum(frame);
  if (expectedChecksum !== actualChecksum) {
    throw new ChecksumMismatchError({ expectedChecksum, actualChecksum, requestId: requestId.toString() });
  }

  const payloadBytes = frame.subarray(PAYLOAD_OFFSET, frameEnd);
  const payload = decodePayload(type, payloadBytes);

  return {
    type,
    typeName: FRAME_TYPES[type],
    requestId: requestId.toString(),
    flags,
    payloadLength,
    payload,
    consumedBytes: frameEnd
  };
}

function decodePayload(type, payloadBytes) {
  if (type === TYPE_HEARTBEAT) {
    if (payloadBytes.length !== 0) {
      throw new InvalidPayloadError({ type, payloadLength: payloadBytes.length });
    }
    return null;
  }

  try {
    return JSON.parse(payloadBytes.toString("utf8"));
  } catch (error) {
    throw new InvalidPayloadError({ cause: error.message });
  }
}
