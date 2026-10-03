import { performance } from "node:perf_hooks";
import { createParserState } from "./connection-parser.js";

export function createConnectionState(socket, id) {
  const now = new Date().toISOString();
  return {
    id,
    connectionId: id,
    remoteAddress: socket.remoteAddress,
    remotePort: socket.remotePort,
    localPort: socket.localPort,
    openedAt: now,
    openedAtMs: performance.now(),
    lastActivityAt: now,
    bytesRead: 0,
    framesRead: 0,
    protocolErrors: 0,
    backpressurePauses: 0,
    paused: false,
    closeReason: "peer-close",
    parser: createParserState(),
    finalized: false
  };
}

export function recordBytes(state, byteLength) {
  state.bytesRead += byteLength;
  state.lastActivityAt = new Date().toISOString();
}

export function recordFrame(state) {
  state.framesRead += 1;
  state.lastActivityAt = new Date().toISOString();
}

export function recordProtocolError(state, reason) {
  state.protocolErrors += 1;
  state.closeReason = reason;
  state.lastActivityAt = new Date().toISOString();
}

export function finalizeConnection(state, reason = state.closeReason) {
  if (state.finalized) {
    return null;
  }

  state.finalized = true;
  state.closeReason = reason;
  const closedAt = new Date().toISOString();
  const durationMs = Math.round(performance.now() - state.openedAtMs);

  return {
    id: state.id,
    connectionId: state.connectionId,
    remoteAddress: state.remoteAddress,
    remotePort: state.remotePort,
    localPort: state.localPort,
    openedAt: state.openedAt,
    closedAt,
    durationMs,
    lastActivityAt: state.lastActivityAt,
    bytesRead: state.bytesRead,
    framesRead: state.framesRead,
    protocolErrors: state.protocolErrors,
    backpressurePauses: state.backpressurePauses,
    closeReason: state.closeReason
  };
}
