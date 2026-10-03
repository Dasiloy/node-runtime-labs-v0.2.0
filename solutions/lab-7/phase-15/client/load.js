import net from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { buildEventPayload, encodeFrame } from "./encode.js";
import { createMalformedFrame, MALFORMED_MODES } from "./malformed.js";
import { createParserState, pushChunk } from "../src/connection-parser.js";
import { TYPE_ACK, TYPE_ERROR } from "../src/protocol.js";

const DEFAULT_LOAD_OPTIONS = Object.freeze({
  host: "127.0.0.1",
  port: 41234,
  clients: 10,
  frames: 1_000,
  frameSize: 256,
  rate: 0,
  malformedRatio: 0,
  chunkSize: 0,
  durationMs: 0,
  ackTimeoutMs: 2_000,
  report: "reports/load-latest.json",
  metricsUrl: ""
});

export function printLoadHelp() {
  console.log(`Usage: node src/cli.js load [options]

Options:
  --host <host>             Gateway host (default: ${DEFAULT_LOAD_OPTIONS.host})
  --port <port>             Gateway port (default: ${DEFAULT_LOAD_OPTIONS.port})
  --clients <n>             Concurrent sockets (default: ${DEFAULT_LOAD_OPTIONS.clients})
  --frames <n>              Total frames across all clients (default: ${DEFAULT_LOAD_OPTIONS.frames})
  --frame-size <n>          Attribute padding bytes per valid frame (default: ${DEFAULT_LOAD_OPTIONS.frameSize})
  --rate <n>                Per-client frames per second; 0 disables pacing (default: ${DEFAULT_LOAD_OPTIONS.rate})
  --malformed-ratio <n>     Ratio from 0 to 1 (default: ${DEFAULT_LOAD_OPTIONS.malformedRatio})
  --chunk-size <n>          Bytes per socket write; 0 writes full frames (default: ${DEFAULT_LOAD_OPTIONS.chunkSize})
  --duration-ms <ms>        Optional run duration cap (default: ${DEFAULT_LOAD_OPTIONS.durationMs})
  --ack-timeout-ms <ms>     ACK timeout after first ACK is seen (default: ${DEFAULT_LOAD_OPTIONS.ackTimeoutMs})
  --report <path>           Output report path (default: ${DEFAULT_LOAD_OPTIONS.report})
  --metrics-url <url>       Optional gateway metrics endpoint`);
}

export async function runLoadCommand(args) {
  if (args.includes("--help")) {
    printLoadHelp();
    return;
  }

  const options = parseLoadOptions(args);
  const report = await runLoad(options);
  console.log(JSON.stringify({
    event: "load.complete",
    report: options.report,
    framesSent: report.totals.framesSent,
    bytesSent: report.totals.bytesSent,
    framesPerSecond: report.throughput.framesPerSecond
  }));
}

export async function runLoad(options) {
  await mkdir(path.dirname(path.resolve(options.report)), { recursive: true });
  const startedAt = new Date();
  const startedAtMs = performance.now();
  const metricsPoller = options.metricsUrl ? startMetricsPolling(options.metricsUrl) : null;
  const assignments = splitFrames(options.frames, options.clients);

  const results = await Promise.all(
    assignments.map((framesForClient, clientIndex) =>
      runClient(clientIndex, framesForClient, options)
    )
  );

  if (metricsPoller) {
    await metricsPoller.stop();
  }

  const finishedAtMs = performance.now();
  const durationMs = finishedAtMs - startedAtMs;
  const totals = reduceResults(results);
  const report = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs,
    options,
    totals,
    throughput: {
      framesPerSecond: totals.framesSent / (durationMs / 1000),
      bytesPerSecond: totals.bytesSent / (durationMs / 1000)
    },
    latency: summarizeLatency(results.flatMap(result => result.ackLatenciesMs)),
    perClient: results,
    metricsPeaks: metricsPoller?.peaks ?? null
  };

  await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function runClient(clientIndex, frameCount, options) {
  const parser = createParserState();
  const counters = {
    clientIndex,
    connected: false,
    framesSent: 0,
    bytesSent: 0,
    acksReceived: 0,
    ackTimeouts: 0,
    protocolErrorsInjected: 0,
    socketErrors: 0,
    ackLatenciesMs: [],
    duplicateRequestIds: 0
  };
  const requestIds = new Set();
  const pendingAcks = new Map();
  const startedAt = performance.now();

  return new Promise(resolve => {
    const socket = net.createConnection({ host: options.host, port: options.port });

    socket.on("connect", async () => {
      counters.connected = true;
      try {
        for (let sequence = 0; sequence < frameCount; sequence += 1) {
          if (options.durationMs > 0 && performance.now() - startedAt >= options.durationMs) {
            break;
          }

          const requestId = requestIdFor(clientIndex, sequence);
          if (requestIds.has(requestId)) {
            counters.duplicateRequestIds += 1;
          }
          requestIds.add(requestId);

          const malformed = Math.random() < options.malformedRatio;
          const frame = malformed
            ? createMalformedFrame(randomMalformedMode(), { requestId })
            : createValidFrame({ requestId, clientIndex, sequence, options });

          if (malformed) {
            counters.protocolErrorsInjected += 1;
          } else {
            pendingAcks.set(String(requestId), performance.now());
          }

          await writeFrame(socket, frame, options.chunkSize);
          counters.framesSent += 1;
          counters.bytesSent += frame.length;

          if (options.rate > 0) {
            await sleep(1000 / options.rate);
          }
        }
        socket.end();
      } catch (error) {
        counters.socketErrors += 1;
        socket.destroy(error);
      }
    });

    socket.on("data", chunk => {
      try {
        const result = pushChunk(parser, chunk);
        for (const frame of result.frames) {
          if (frame.type !== TYPE_ACK && frame.type !== TYPE_ERROR) {
            continue;
          }
          const started = pendingAcks.get(frame.requestId);
          if (started === undefined) {
            continue;
          }
          pendingAcks.delete(frame.requestId);
          counters.acksReceived += 1;
          counters.ackLatenciesMs.push(performance.now() - started);
        }
      } catch {
        counters.socketErrors += 1;
      }
    });

    socket.on("error", () => {
      counters.socketErrors += 1;
    });

    socket.on("close", async () => {
      if (counters.acksReceived > 0 && pendingAcks.size > 0 && options.ackTimeoutMs > 0) {
        await sleep(options.ackTimeoutMs);
        counters.ackTimeouts += pendingAcks.size;
      }
      resolve(counters);
    });
  });
}

function createValidFrame({ requestId, clientIndex, sequence, options }) {
  const payload = buildEventPayload({
    name: "load.event",
    timestamp: new Date().toISOString(),
    attributes: {
      clientIndex,
      sequence,
      padding: "x".repeat(options.frameSize)
    }
  });
  return encodeFrame({ requestId, payload });
}

async function writeFrame(socket, frame, chunkSize) {
  if (!chunkSize || chunkSize >= frame.length) {
    await writeBuffer(socket, frame);
    return;
  }

  for (let offset = 0; offset < frame.length; offset += chunkSize) {
    await writeBuffer(socket, frame.subarray(offset, offset + chunkSize));
  }
}

function writeBuffer(socket, buffer) {
  return new Promise((resolve, reject) => {
    socket.write(buffer, error => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function startMetricsPolling(metricsUrl) {
  const peaks = {
    activeConnections: 0,
    fileBufferedBytes: 0,
    httpQueued: 0,
    rss: 0
  };
  const sample = async () => {
    try {
      const response = await fetch(metricsUrl);
      if (!response.ok) {
        return;
      }
      const metrics = await response.json();
      peaks.activeConnections = Math.max(peaks.activeConnections, metrics.activeConnections ?? 0);
      peaks.fileBufferedBytes = Math.max(peaks.fileBufferedBytes, metrics.fileBufferedBytes ?? 0);
      peaks.httpQueued = Math.max(peaks.httpQueued, metrics.httpQueued ?? 0);
      peaks.rss = Math.max(peaks.rss, metrics.memory?.rss ?? 0);
    } catch {
      // Metrics polling must not fail the load run.
    }
  };
  void sample();
  const interval = setInterval(sample, 1_000);

  return {
    peaks,
    async stop() {
      clearInterval(interval);
    }
  };
}

function splitFrames(totalFrames, clients) {
  const base = Math.floor(totalFrames / clients);
  const remainder = totalFrames % clients;
  return Array.from({ length: clients }, (_, index) => base + (index < remainder ? 1 : 0));
}

function requestIdFor(clientIndex, sequence) {
  return BigInt(clientIndex + 1) * 1_000_000n + BigInt(sequence + 1);
}

function reduceResults(results) {
  return results.reduce(
    (totals, result) => {
      totals.connected += result.connected ? 1 : 0;
      totals.framesSent += result.framesSent;
      totals.bytesSent += result.bytesSent;
      totals.acksReceived += result.acksReceived;
      totals.ackTimeouts += result.ackTimeouts;
      totals.protocolErrorsInjected += result.protocolErrorsInjected;
      totals.socketErrors += result.socketErrors;
      totals.duplicateRequestIds += result.duplicateRequestIds;
      return totals;
    },
    {
      connected: 0,
      framesSent: 0,
      bytesSent: 0,
      acksReceived: 0,
      ackTimeouts: 0,
      protocolErrorsInjected: 0,
      socketErrors: 0,
      duplicateRequestIds: 0
    }
  );
}

function summarizeLatency(samples) {
  if (samples.length === 0) {
    return { count: 0, p50: 0, p95: 0, max: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted.at(-1)
  };
}

function percentile(sorted, ratio) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function randomMalformedMode() {
  return MALFORMED_MODES[Math.floor(Math.random() * MALFORMED_MODES.length)];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseLoadOptions(args) {
  return {
    host: readFlag(args, "--host", DEFAULT_LOAD_OPTIONS.host),
    port: readIntegerFlag(args, "--port", DEFAULT_LOAD_OPTIONS.port),
    clients: readIntegerFlag(args, "--clients", DEFAULT_LOAD_OPTIONS.clients),
    frames: readIntegerFlag(args, "--frames", DEFAULT_LOAD_OPTIONS.frames),
    frameSize: readIntegerFlag(args, "--frame-size", DEFAULT_LOAD_OPTIONS.frameSize),
    rate: readIntegerFlag(args, "--rate", DEFAULT_LOAD_OPTIONS.rate),
    malformedRatio: readNumberFlag(
      args,
      "--malformed-ratio",
      DEFAULT_LOAD_OPTIONS.malformedRatio
    ),
    chunkSize: readIntegerFlag(args, "--chunk-size", DEFAULT_LOAD_OPTIONS.chunkSize),
    durationMs: readIntegerFlag(args, "--duration-ms", DEFAULT_LOAD_OPTIONS.durationMs),
    ackTimeoutMs: readIntegerFlag(
      args,
      "--ack-timeout-ms",
      DEFAULT_LOAD_OPTIONS.ackTimeoutMs
    ),
    report: readFlag(args, "--report", DEFAULT_LOAD_OPTIONS.report),
    metricsUrl: readFlag(args, "--metrics-url", DEFAULT_LOAD_OPTIONS.metricsUrl)
  };
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
  const value = Number(readFlag(args, flag, String(fallback)));
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${flag} must be a non-negative integer`);
  }
  return value;
}

function readNumberFlag(args, flag, fallback) {
  const value = Number(readFlag(args, flag, String(fallback)));
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${flag} must be a number from 0 to 1`);
  }
  return value;
}
