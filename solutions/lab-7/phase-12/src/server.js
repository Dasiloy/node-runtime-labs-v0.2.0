import net from "node:net";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { pushChunk } from "./connection-parser.js";
import {
  createConnectionState,
  finalizeConnection,
  recordBytes,
  recordFrame,
  recordProtocolError
} from "./connection-state.js";
import { createLogger } from "./logger.js";
import {
  createMetrics,
  incrementProtocolError,
  snapshotMetrics,
  startMetricsSampler,
  startMetricsServer
} from "./metrics.js";
import { createFileSink } from "./sinks/file-sink.js";
import { createHttpSink } from "./sinks/http-sink.js";

const DEFAULT_SERVER_OPTIONS = Object.freeze({
  host: "127.0.0.1",
  port: 41234,
  sink: "stdout",
  idleTimeoutMs: 30_000,
  maxProtocolErrors: 1,
  malformedPolicy: "close",
  slowSinkMs: 0,
  target: "http://127.0.0.1:4310/events",
  httpConcurrency: 8,
  httpTimeoutMs: 2_000,
  httpRetries: 1,
  httpQueueLimit: 1_000,
  overflowPolicy: "pause",
  metricsPort: 9090
});

export function parseServerOptions(args) {
  if (args.includes("--help")) {
    return { help: true };
  }

  return {
    host: readFlag(args, "--host", DEFAULT_SERVER_OPTIONS.host),
    port: readIntegerFlag(args, "--port", DEFAULT_SERVER_OPTIONS.port),
    sink: readFlag(args, "--sink", DEFAULT_SERVER_OPTIONS.sink),
    idleTimeoutMs: readIntegerFlag(
      args,
      "--idle-timeout-ms",
      DEFAULT_SERVER_OPTIONS.idleTimeoutMs
    ),
    maxProtocolErrors: readIntegerFlag(
      args,
      "--max-protocol-errors",
      DEFAULT_SERVER_OPTIONS.maxProtocolErrors
    ),
    malformedPolicy: readEnumFlag(
      args,
      "--malformed-policy",
      DEFAULT_SERVER_OPTIONS.malformedPolicy,
      new Set(["close", "quarantine"])
    ),
    slowSinkMs: readIntegerFlag(args, "--slow-sink-ms", DEFAULT_SERVER_OPTIONS.slowSinkMs),
    target: readFlag(args, "--target", DEFAULT_SERVER_OPTIONS.target),
    httpConcurrency: readIntegerFlag(
      args,
      "--http-concurrency",
      DEFAULT_SERVER_OPTIONS.httpConcurrency
    ),
    httpTimeoutMs: readIntegerFlag(
      args,
      "--http-timeout-ms",
      DEFAULT_SERVER_OPTIONS.httpTimeoutMs
    ),
    httpRetries: readIntegerFlag(args, "--http-retries", DEFAULT_SERVER_OPTIONS.httpRetries),
    httpQueueLimit: readIntegerFlag(
      args,
      "--http-queue-limit",
      DEFAULT_SERVER_OPTIONS.httpQueueLimit
    ),
    overflowPolicy: readEnumFlag(
      args,
      "--overflow-policy",
      DEFAULT_SERVER_OPTIONS.overflowPolicy,
      new Set(["pause", "drop"])
    ),
    metricsPort: readIntegerFlag(args, "--metrics-port", DEFAULT_SERVER_OPTIONS.metricsPort)
  };
}

export function printServerHelp() {
  console.log(`Usage: node src/cli.js server [options]

Options:
  --host <host>              Bind host (default: ${DEFAULT_SERVER_OPTIONS.host})
  --port <port>              Bind port (default: ${DEFAULT_SERVER_OPTIONS.port})
  --sink <stdout|file|http>  Event sink (default: ${DEFAULT_SERVER_OPTIONS.sink})
  --idle-timeout-ms <ms>     Socket idle timeout (default: ${DEFAULT_SERVER_OPTIONS.idleTimeoutMs})
  --max-protocol-errors <n>  Errors before closing quarantined sockets (default: ${DEFAULT_SERVER_OPTIONS.maxProtocolErrors})
  --malformed-policy <mode>  close or quarantine (default: ${DEFAULT_SERVER_OPTIONS.malformedPolicy})
  --slow-sink-ms <ms>        Delay file sink writes for pressure testing (default: ${DEFAULT_SERVER_OPTIONS.slowSinkMs})
  --target <url>             HTTP target URL (default: ${DEFAULT_SERVER_OPTIONS.target})
  --http-concurrency <n>     Max concurrent HTTP requests (default: ${DEFAULT_SERVER_OPTIONS.httpConcurrency})
  --http-timeout-ms <ms>     HTTP request timeout (default: ${DEFAULT_SERVER_OPTIONS.httpTimeoutMs})
  --http-retries <n>         HTTP retry count (default: ${DEFAULT_SERVER_OPTIONS.httpRetries})
  --http-queue-limit <n>     HTTP queue limit (default: ${DEFAULT_SERVER_OPTIONS.httpQueueLimit})
  --overflow-policy <mode>   pause or drop (default: ${DEFAULT_SERVER_OPTIONS.overflowPolicy})
  --metrics-port <port>      Metrics HTTP port (default: ${DEFAULT_SERVER_OPTIONS.metricsPort})`);
}

export function startServer(options = {}) {
  const config = { ...DEFAULT_SERVER_OPTIONS, ...options };
  const logger = config.logger ?? createLogger();
  mkdirSync(path.resolve("reports"), { recursive: true });
  mkdirSync(path.resolve("data"), { recursive: true });
  const protocolErrorStream = createWriteStream(
    path.resolve("reports/protocol-errors.jsonl"),
    { flags: "a" }
  );
  const connectionStream = createWriteStream(path.resolve("reports/connections.jsonl"), {
    flags: "a"
  });
  const connections = new Map();
  const pausedSockets = new Set();
  const metrics = createMetrics();
  const sink = createSink(config, metrics, {
    logger,
    resumePausedSockets: () => resumePausedSockets(pausedSockets, metrics, logger)
  });
  const getSnapshot = () => snapshotMetrics(metrics, connections);
  const metricsServer = startMetricsServer({
    port: config.metricsPort,
    getSnapshot,
    logger
  });
  const metricsSampler = startMetricsSampler({ getSnapshot });
  let nextConnectionId = 1;
  const httpSnapshotInterval =
    config.sink === "http"
      ? setInterval(() => {
          logger.log("http.sink.snapshot", sink.snapshot());
        }, 1_000)
      : null;

  const server = net.createServer(socket => {
    const connectionId = nextConnectionId++;
    const state = createConnectionState(socket, connectionId);
    socket.gatewayState = state;
    connections.set(connectionId, state);
    metrics.totalConnections += 1;
    metrics.activeConnections = connections.size;

    socket.setNoDelay(true);
    socket.setTimeout(config.idleTimeoutMs);

    logger.log("connection.open", {
      connectionId,
      remoteAddress: state.remoteAddress,
      remotePort: state.remotePort,
      localPort: state.localPort,
      bytesRead: state.bytesRead,
      framesRead: state.framesRead
    });

    socket.on("data", chunk => {
      recordBytes(state, chunk.length);
      metrics.bytesRead += chunk.length;
      logger.log("connection.bytes", {
        connectionId,
        chunkBytes: chunk.length,
        bytesRead: state.bytesRead
      });

      try {
        const result = pushChunk(state.parser, chunk);
        for (const frame of result.frames) {
          recordFrame(state);
          metrics.framesReceived += 1;
          metrics.framesPerConnection.set(connectionId, state.framesRead);
          const event = normalizeEvent(frame, state);
          const writeResult = sink.writeEvent(event);
          if (writeResult.accepted !== false) {
            metrics.eventsForwarded += 1;
          } else {
            metrics.droppedFrames += 1;
          }
          if (!writeResult.ok) {
            pauseSocket(socket, state, pausedSockets, metrics, logger);
          }
          logger.log("event.received", {
            connectionId,
            requestId: frame.requestId,
            type: frame.typeName,
            name: frame.payload?.name,
            payloadBytes: frame.payloadLength,
            remainingBytes: result.remainingBytes
          });
        }
      } catch (error) {
        recordProtocolError(state, error.code ?? "protocol-error");
        incrementProtocolError(metrics, error.code ?? "UNKNOWN_ERROR");
        logger.error("protocol.error", error, { connectionId });
        writeProtocolError(protocolErrorStream, state, error);

        if (
          config.malformedPolicy === "close" ||
          state.protocolErrors >= config.maxProtocolErrors
        ) {
          socket.destroy();
          return;
        }

        state.parser.carry = Buffer.alloc(0);
      }
    });

    socket.on("timeout", () => {
      state.closeReason = "idle-timeout";
      socket.destroy();
    });

    socket.on("error", error => {
      state.closeReason = error.code ?? "socket-error";
      logger.error("socket.error", error, { connectionId });
    });

    socket.on("close", hadError => {
      connections.delete(connectionId);
      metrics.activeConnections = connections.size;
      const record = finalizeConnection(state, state.closeReason);
      if (!record) {
        return;
      }

      connectionStream.write(`${JSON.stringify(record)}\n`);
      logger.log("connection.close", { ...record, hadError });
    });
  });

  server.on("listening", () => {
    const address = server.address();
    logger.log("server.listening", {
      host: address.address,
      port: address.port,
      sink: config.sink
    });
  });

  server.on("error", error => {
    logger.error("server.error", error, {
      host: config.host,
      port: config.port
    });
    process.exitCode = 1;
  });

  server.activeConnections = connections;
  server.totals = metrics;
  server.protocolErrorStream = protocolErrorStream;
  server.connectionStream = connectionStream;
  server.sink = sink;
  server.pausedSockets = pausedSockets;
  server.httpSnapshotInterval = httpSnapshotInterval;
  server.metricsServer = metricsServer;
  server.metricsSampler = metricsSampler;
  server.listen(config.port, config.host);
  return server;
}

export async function runServerCommand(args) {
  const options = parseServerOptions(args);
  if (options.help) {
    printServerHelp();
    return;
  }

  startServer(options);
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

function readEnumFlag(args, flag, fallback, allowed) {
  const value = readFlag(args, flag, fallback);
  if (!allowed.has(value)) {
    throw new Error(`${flag} must be one of: ${[...allowed].join(", ")}`);
  }
  return value;
}

function writeProtocolError(stream, state, error) {
  stream.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      connectionId: state.connectionId,
      remoteAddress: state.remoteAddress,
      remotePort: state.remotePort,
      code: error.code ?? "UNKNOWN_ERROR",
      details: error.details ?? {},
      message: error.message
    })}\n`
  );
}

function createSink(config, metrics, { logger, resumePausedSockets }) {
  if (config.sink === "file") {
    return createFileSink({
      slowSinkMs: config.slowSinkMs,
      metrics,
      onDrain: () => {
        logger.log("sink.drain", {
          fileDrainCount: metrics.fileDrainCount,
          fileBufferedBytes: metrics.fileBufferedBytes
        });
        resumePausedSockets();
      }
    });
  }

  if (config.sink === "http") {
    return createHttpSink({
      target: config.target,
      concurrency: config.httpConcurrency,
      timeoutMs: config.httpTimeoutMs,
      retries: config.httpRetries,
      queueLimit: config.httpQueueLimit,
      overflowPolicy: config.overflowPolicy,
      metrics,
      onDrain: () => resumePausedSockets()
    });
  }

  return {
    type: "stdout",
    writeEvent(event) {
      logger.log("event.forwarded", event);
      return { ok: true, done: Promise.resolve() };
    },
    snapshot() {
      return {};
    },
    async close() {}
  };
}

function normalizeEvent(frame, state) {
  return {
    receivedAt: new Date().toISOString(),
    connectionId: state.connectionId,
    requestId: frame.requestId,
    type: frame.typeName,
    name: frame.payload?.name,
    attributes: frame.payload?.attributes ?? {},
    payloadBytes: frame.payloadLength
  };
}

function pauseSocket(socket, state, pausedSockets, metrics, logger) {
  if (pausedSockets.has(socket) || socket.destroyed) {
    return;
  }

  socket.pause();
  pausedSockets.add(socket);
  state.backpressurePauses += 1;
  state.paused = true;
  metrics.socketPauseCount += 1;
  logger.log("socket.paused", {
    connectionId: state.connectionId,
    socketPauseCount: metrics.socketPauseCount
  });
}

function resumePausedSockets(pausedSockets, metrics, logger) {
  for (const socket of pausedSockets) {
    pausedSockets.delete(socket);
    if (socket.destroyed) {
      continue;
    }
    socket.resume();
    if (socket.gatewayState) {
      socket.gatewayState.paused = false;
    }
    metrics.socketResumeCount += 1;
    logger.log("socket.resumed", {
      socketResumeCount: metrics.socketResumeCount
    });
  }
}
