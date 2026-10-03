import {
  buildEventPayload,
  encodeFrame,
  formatHexDump,
  frameMetadata
} from "../client/encode.js";
import { HEADER_SIZE } from "./protocol.js";

export function runEncodeCommand(args) {
  if (hasFlag(args, "--help")) {
    console.log(`Usage: node src/cli.js encode [options]

Options:
  --name <name>           Event name (default: sample.event)
  --request-id <id>       Request id (default: 1)
  --payload-bytes <n>     Extra attribute bytes (default: 0)`);
    return;
  }

  const name = readFlag(args, "--name", "sample.event");
  const requestId = readFlag(args, "--request-id", "1");
  const payloadBytes = Number(readFlag(args, "--payload-bytes", "0"));
  const attributes = payloadBytes > 0 ? { padding: "x".repeat(payloadBytes) } : {};
  const payload = buildEventPayload({
    name,
    attributes,
    timestamp: "2026-01-01T00:00:00.000Z"
  });
  const payloadBuffer = Buffer.from(JSON.stringify(payload), "utf8");
  const frame = encodeFrame({ requestId, payload });
  const metadata = frameMetadata(frame);

  console.log(`frameLength=${frame.length}`);
  console.log(`expectedLength=${HEADER_SIZE + payloadBuffer.length}`);
  console.log(`requestId=${metadata.requestId}`);
  console.log(`checksum=${metadata.checksum}`);
  console.log("hex:");
  console.log(formatHexDump(frame));
  console.log(`compactHex=${frame.toString("hex")}`);
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

function readFlag(args, flag, fallback) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return fallback;
  }

  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}
