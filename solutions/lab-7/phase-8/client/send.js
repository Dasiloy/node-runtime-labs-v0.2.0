import net from "node:net";
import { buildEventPayload, encodeFrame } from "./encode.js";
import { createMalformedFrame, MALFORMED_MODES } from "./malformed.js";

const DEFAULT_CLIENT_OPTIONS = Object.freeze({
  host: "127.0.0.1",
  port: 41234,
  name: "sample.event",
  requestId: "1",
  count: 1,
  payloadBytes: 0,
  chunkSize: 0,
  chunkDelayMs: 0,
  burst: false,
  sameWrite: false,
  malformed: ""
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
    payloadBytes: readIntegerFlag(args, "--payload-bytes", DEFAULT_CLIENT_OPTIONS.payloadBytes),
    chunkSize: readIntegerFlag(args, "--chunk-size", DEFAULT_CLIENT_OPTIONS.chunkSize),
    chunkDelayMs: readIntegerFlag(args, "--chunk-delay-ms", DEFAULT_CLIENT_OPTIONS.chunkDelayMs),
    burst: args.includes("--burst"),
    sameWrite: args.includes("--same-write"),
    malformed: readFlag(args, "--malformed", DEFAULT_CLIENT_OPTIONS.malformed)
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
  --payload-bytes <n>     Extra payload bytes (default: ${DEFAULT_CLIENT_OPTIONS.payloadBytes})
  --chunk-size <n>        Bytes per socket write; 0 writes one frame at a time (default: ${DEFAULT_CLIENT_OPTIONS.chunkSize})
  --chunk-delay-ms <ms>   Delay between chunk writes (default: ${DEFAULT_CLIENT_OPTIONS.chunkDelayMs})
  --burst                 Queue writes without waiting between frames
  --same-write            Concatenate all frames and write once
  --malformed <mode>      Send malformed frames: ${MALFORMED_MODES.join(", ")}`);
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
          if (options.sameWrite) {
            const combined = Buffer.concat(frames);
            await writeBuffer(socket, combined);
            console.log(
              JSON.stringify({
                event: "client.framesWritten",
                mode: "same-write",
                frames: frames.length,
                bytesWritten: socket.bytesWritten
              })
            );
          } else if (options.burst) {
            await Promise.all(frames.map(frame => writeFrame(socket, frame, options)));
            logWrittenFrames(frames, options, socket);
          } else {
            for (const frame of frames) {
              await writeFrame(socket, frame, options);
            }
            logWrittenFrames(frames, options, socket);
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

function logWrittenFrames(frames, options, socket) {
  for (const [index, frame] of frames.entries()) {
    const requestId = BigInt(options.requestId) + BigInt(index);
    console.log(
      JSON.stringify({
        event: "client.frameWritten",
        requestId: requestId.toString(),
        frameLength: frame.length,
        bytesWritten: socket.bytesWritten
      })
    );
  }
}

function buildFrames(options) {
  const attributes =
    options.payloadBytes > 0 ? { padding: "x".repeat(options.payloadBytes) } : {};
  const startRequestId = BigInt(options.requestId);
  const frames = [];

  for (let index = 0; index < options.count; index += 1) {
    const requestId = startRequestId + BigInt(index);
    if (options.malformed) {
      frames.push(createMalformedFrame(options.malformed, { requestId }));
      continue;
    }

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

async function writeFrame(socket, frame, options) {
  if (!options.chunkSize || options.chunkSize >= frame.length) {
    await writeBuffer(socket, frame);
    return;
  }

  for (let offset = 0; offset < frame.length; offset += options.chunkSize) {
    await writeBuffer(socket, frame.subarray(offset, offset + options.chunkSize));
    if (options.chunkDelayMs > 0 && offset + options.chunkSize < frame.length) {
      await sleep(options.chunkDelayMs);
    }
  }
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
