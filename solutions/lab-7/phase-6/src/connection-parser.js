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

  state.bytesRead += chunk.length;
  state.lastActivityAt = new Date().toISOString();

  if (input.length < HEADER_SIZE) {
    state.carry = input;
    return { frames, remainingBytes: state.carry.length };
  }

  const payloadLength = input.readUInt32BE(PAYLOAD_LENGTH_OFFSET);
  if (payloadLength > MAX_PAYLOAD_BYTES) {
    state.protocolErrors += 1;
    throw new InvalidLengthError({ payloadLength, maxPayloadBytes: MAX_PAYLOAD_BYTES });
  }

  const frameLength = HEADER_SIZE + payloadLength;
  if (input.length < frameLength) {
    state.carry = input;
    return { frames, remainingBytes: state.carry.length };
  }

  try {
    const decoded = decodeFrame(input.subarray(0, frameLength));
    frames.push(decoded);
    state.framesRead += 1;
    state.carry = input.subarray(decoded.consumedBytes);
    return { frames, remainingBytes: state.carry.length };
  } catch (error) {
    state.protocolErrors += 1;
    throw error;
  }
}
