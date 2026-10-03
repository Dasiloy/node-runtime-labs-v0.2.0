import { decodeFrame } from "./frame-decode.js";
import {
  HEADER_SIZE,
  MAX_PAYLOAD_BYTES,
  PAYLOAD_LENGTH_OFFSET
} from "./protocol.js";
import { InvalidLengthError } from "./protocol-errors.js";

export function createParserState() {
  return {
    carry: Buffer.alloc(0),
    framesRead: 0,
    bytesRead: 0,
    lastActivityAt: new Date().toISOString(),
    protocolErrors: 0
  };
}

export function pushChunk(state, chunk) {
  const input = state.carry.length === 0 ? chunk : Buffer.concat([state.carry, chunk]);
  const frames = [];
  let offset = 0;

  state.bytesRead += chunk.length;
  state.lastActivityAt = new Date().toISOString();

  while (input.length - offset >= HEADER_SIZE) {
    const payloadLength = input.readUInt32BE(offset + PAYLOAD_LENGTH_OFFSET);
    if (payloadLength > MAX_PAYLOAD_BYTES) {
      state.protocolErrors += 1;
      throw new InvalidLengthError({
        payloadLength,
        maxPayloadBytes: MAX_PAYLOAD_BYTES,
        byteOffset: offset
      });
    }

    const frameEnd = offset + HEADER_SIZE + payloadLength;
    if (input.length < frameEnd) {
      break;
    }

    try {
      const decoded = decodeFrame(input.subarray(offset, frameEnd));
      frames.push(decoded);
      state.framesRead += 1;
      offset += decoded.consumedBytes;
    } catch (error) {
      state.protocolErrors += 1;
      throw error;
    }
  }

  state.carry = input.subarray(offset);
  return { frames, remainingBytes: state.carry.length };
}
