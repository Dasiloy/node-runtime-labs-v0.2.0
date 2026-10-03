import http from "node:http";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

export function createMetrics() {
  return {
    startedAtMs: performance.now(),
    activeConnections: 0,
    totalConnections: 0,
    bytesRead: 0,
    framesReceived: 0,
    eventsForwarded: 0,
    protocolErrors: 0,
    protocolErrorsByCode: {},
    socketPauseCount: 0,
    socketResumeCount: 0,
    fileWrites: 0,
    fileDrainCount: 0,
    fileBufferedBytes: 0,
    sinkWriteLatencyMs: [],
    sinkErrors: 0,
    httpSent: 0,
    httpRetried: 0,
    httpTimedOut: 0,
    httpFailed: 0,
    httpInflight: 0,
    httpQueued: 0,
    httpDropped: 0,
    httpLatencyMs: [],
    droppedFrames: 0,
    forcedSocketCloses: 0,
    framesPerConnection: new Map()
  };
}

export function incrementProtocolError(metrics, code) {
  metrics.protocolErrors += 1;
  metrics.protocolErrorsByCode[code] = (metrics.protocolErrorsByCode[code] ?? 0) + 1;
}

export function snapshotMetrics(metrics, connections) {
  const memory = process.memoryUsage();
  return {
    timestamp: new Date().toISOString(),
    uptimeMs: Math.round(performance.now() - metrics.startedAtMs),
    activeConnections: connections.size,
    totalConnections: metrics.totalConnections,
    bytesRead: metrics.bytesRead,
    framesReceived: metrics.framesReceived,
    eventsForwarded: metrics.eventsForwarded,
    protocolErrors: metrics.protocolErrors,
    protocolErrorsByCode: metrics.protocolErrorsByCode,
    socketPauseCount: metrics.socketPauseCount,
    socketResumeCount: metrics.socketResumeCount,
    fileDrainCount: metrics.fileDrainCount,
    fileBufferedBytes: metrics.fileBufferedBytes,
    httpInflight: metrics.httpInflight,
    httpQueued: metrics.httpQueued,
    httpFailed: metrics.httpFailed,
    sinkLatencyMs: summarizeLatency([
      ...metrics.sinkWriteLatencyMs,
      ...metrics.httpLatencyMs
    ]),
    memory: {
      rss: memory.rss,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
      external: memory.external,
      arrayBuffers: memory.arrayBuffers
    },
    connections: [...connections.values()].map(connection => ({
      id: connection.id,
      bytes: connection.bytesRead,
      frames: connection.framesRead,
      lastActivityAt: connection.lastActivityAt,
      paused: connection.paused
    }))
  };
}

export function startMetricsServer({ host = "127.0.0.1", port, getSnapshot, logger }) {
  const server = http.createServer((request, response) => {
    if (request.method !== "GET" || request.url !== "/metrics") {
      response.writeHead(404).end();
      return;
    }

    const body = JSON.stringify(getSnapshot(), null, 2);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(body);
  });

  server.on("listening", () => {
    const address = server.address();
    logger.log("metrics.listening", { host: address.address, port: address.port });
  });

  server.on("error", error => {
    logger.error("metrics.error", error, { host, port });
  });

  server.listen(port, host);
  return server;
}

export function startMetricsSampler({ getSnapshot, filePath = "reports/metrics.jsonl" }) {
  mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  const stream = createWriteStream(path.resolve(filePath), { flags: "a" });
  const interval = setInterval(() => {
    stream.write(`${JSON.stringify(getSnapshot())}\n`);
  }, 1_000);

  return {
    interval,
    stream,
    stop() {
      clearInterval(interval);
      stream.end();
    }
  };
}

function summarizeLatency(samples) {
  if (samples.length === 0) {
    return { count: 0, avg: 0, max: 0 };
  }

  const total = samples.reduce((sum, value) => sum + value, 0);
  return {
    count: samples.length,
    avg: total / samples.length,
    max: Math.max(...samples)
  };
}
