import { once } from "node:events";
import { encodeFrame } from "../client/encode.js";
import { TYPE_ACK } from "./protocol.js";

export function createAckFrame({ requestId, policy, connectionId }) {
  return encodeFrame({
    type: TYPE_ACK,
    requestId,
    payload: {
      requestId: String(requestId),
      policy,
      connectionId,
      timestamp: new Date().toISOString()
    }
  });
}

export async function writeAck(socket, ackFrame) {
  if (socket.destroyed || !socket.writable) {
    return false;
  }

  const ok = socket.write(ackFrame);
  if (!ok) {
    await once(socket, "drain");
  }
  return true;
}
