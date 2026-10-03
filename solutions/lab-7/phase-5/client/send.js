import net from "node:net";
import { buildEventPayload, encodeFrame } from "./encode.js";

const DEFAULT_CLIENT_OPTIONS = Object.freeze({
  host: "127.0.0.1",
  port: 41234,
  name: "sample.event",
  requestId: "1",
  count: 1,
  payloadBytes: 0
});

export function parseClientOptions(args) {
  if (args.includes("--help")) {
    return { help: true };
  }

  return {
    host: readFlag(args, "--host", DEFAULT_CLIENT_OPTIONS.host),
    port: readIntegerFlag(args, "--port", DEFAULT_CLIENT_OPTIONS.port),
    name: readFlag(args, "--name", DEFAULT_CLIENT_OPTIONS.name),
    requestId: readFlag(args, "--request-id", DEFAULT_CLIENT_OPTIONS.requestId),
    count: readIntegerFlag(args, "--count", DEFAULT_CLIENT_OPTIONS.count),
    payloadBytes: readIntegerFlag(args, "--payload-bytes", DEFAULT_CLIENT_OPTIONS.payloadBytes)
  };
}

export function printClientHelp() {
  console.log(`Usage: node src/cli.js client [options]

Options:
  --host <host>           Server host (default: ${DEFAULT_CLIENT_OPTIONS.host})
  --port <port>           Server port (default: ${DEFAULT_CLIENT_OPTIONS.port})
  --name <name>           Event name (default: ${DEFAULT_CLIENT_OPTIONS.name})
  --request-id <id>       Starting request id (default: ${DEFAULT_CLIENT_OPTIONS.requestId})
  --count <n>             Number of frames to send (default: ${DEFAULT_CLIENT_OPTIONS.count})
  --payload-bytes <n>     Extra payload bytes (default: ${DEFAULT_CLIENT_OPTIONS.payloadBytes})`);
}

export async function runClientCommand(args) {
  const options = parseClientOptions(args);
  if (options.help) {
    printClientHelp();
    return;
  }

  await sendFrames(options);
}

export function sendFrames(options) {
  const frames = buildFrames(options);
  const totalBytes = frames.reduce((sum, frame) => sum + frame.length, 0);

  return new Promise((resolve, reject) => {
    const socket = net.createConnection(
      { host: options.host, port: options.port },
      async () => {
        try {
          for (const [index, frame] of frames.entries()) {
            const requestId = BigInt(options.requestId) + BigInt(index);
            await writeBuffer(socket, frame);
            console.log(
              JSON.stringify({
                event: "client.frameWritten",
                requestId: requestId.toString(),
                frameLength: frame.length,
                bytesWritten: socket.bytesWritten
              })
            );
          }
          socket.end();
        } catch (error) {
          socket.destroy(error);
        }
      }
    );

    socket.on("error", reject);
    socket.on("close", hadError => {
      if (!hadError) {
        console.log(
          JSON.stringify({
            event: "client.close",
            framesWritten: frames.length,
            totalBytes
          })
        );
        resolve({ framesWritten: frames.length, totalBytes });
      }
    });
  });
}

function buildFrames(options) {
  const attributes =
    options.payloadBytes > 0 ? { padding: "x".repeat(options.payloadBytes) } : {};
  const startRequestId = BigInt(options.requestId);
  const frames = [];

  for (let index = 0; index < options.count; index += 1) {
    const requestId = startRequestId + BigInt(index);
    const frameAttributes = { ...attributes };
    if (options.count > 1) {
      frameAttributes.sequence = index;
    }
    const payload = buildEventPayload({
      name: options.name,
      attributes: frameAttributes,
      timestamp: new Date().toISOString()
    });
    frames.push(encodeFrame({ requestId, payload }));
  }

  return frames;
}

function writeBuffer(socket, frame) {
  return new Promise((resolve, reject) => {
    socket.write(frame, error => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
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

function readIntegerFlag(args, flag, fallback) {
  const value = readFlag(args, flag, String(fallback));
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${flag} must be a non-negative integer`);
  }
  return number;
}
