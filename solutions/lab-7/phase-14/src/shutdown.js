import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

export function installShutdownHandlers(context) {
  let shutdownPromise;

  const start = signal => {
    if (shutdownPromise) {
      context.metrics.forcedSocketCloses += forceCloseConnections(context, "second-signal");
      return;
    }

    shutdownPromise = shutdownGateway(context, signal).catch(error => {
      context.logger.error("shutdown.error", error);
      process.exitCode = 1;
    });
  };

  process.on("SIGINT", start);
  process.on("SIGTERM", start);
}

export async function shutdownGateway(context, reason = "shutdown") {
  const {
    server,
    config,
    logger,
    runtime,
    metrics,
    connections,
    sink
  } = context;
  const startedAt = performance.now();
  const openConnectionsAtShutdown = connections.size;
  runtime.shuttingDown = true;

  logger.log("shutdown.start", {
    reason,
    openConnectionsAtShutdown,
    shutdownPolicy: config.shutdownPolicy,
    shutdownGraceMs: config.shutdownGraceMs
  });

  const serverClose = closeServer(server);
  if (server.httpSnapshotInterval) {
    clearInterval(server.httpSnapshotInterval);
  }
  if (server.metricsSampler) {
    server.metricsSampler.stop();
  }
  const metricsClose = closeServer(server.metricsServer);

  for (const state of connections.values()) {
    if (state.socket && !state.socket.destroyed) {
      state.socket.pause();
      state.closeReason = "shutdown";
    }
  }

  let forcedSocketCloses = 0;
  let sinkCloseTimeMs = 0;
  let sinkClosed = false;

  const drain = async () => {
    const sinkStartedAt = performance.now();
    await sink.close();
    sinkCloseTimeMs = performance.now() - sinkStartedAt;
    sinkClosed = true;

    if (config.shutdownPolicy === "drain") {
      for (const state of connections.values()) {
        if (state.socket && !state.socket.destroyed) {
          state.closeReason = "shutdown-drained";
          state.socket.end();
        }
      }
    }
  };

  if (config.shutdownPolicy === "close") {
    forcedSocketCloses += forceCloseConnections(context, "shutdown-close");
    metrics.forcedSocketCloses += forcedSocketCloses;
    await withDeadline(sink.close(), config.shutdownGraceMs);
    sinkClosed = true;
  } else {
    const drained = await withDeadline(drain(), config.shutdownGraceMs);
    if (!drained) {
      forcedSocketCloses += forceCloseConnections(context, "shutdown-timeout");
      metrics.forcedSocketCloses += forcedSocketCloses;
    }
  }

  await withDeadline(serverClose, 250);
  await withDeadline(metricsClose, 250);
  await sleep(50);

  const report = {
    reason,
    startedAt: new Date(Date.now() - Math.round(performance.now() - startedAt)).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - startedAt),
    openConnectionsAtShutdown,
    droppedFrames: metrics.droppedFrames,
    drainedEvents: metrics.eventsForwarded,
    forcedSocketCloses: metrics.forcedSocketCloses,
    sinkCloseTimeMs: Math.round(sinkCloseTimeMs),
    sinkClosed
  };

  await writeFile("reports/final-report.json", `${JSON.stringify(report, null, 2)}\n`);
  await closeStream(server.protocolErrorStream);
  await closeStream(server.connectionStream);
  logger.log("shutdown.complete", report);
  process.exitCode = 0;
}

function forceCloseConnections(context, reason) {
  let forced = 0;
  for (const state of context.connections.values()) {
    if (state.socket && !state.socket.destroyed) {
      state.closeReason = reason;
      state.socket.destroy();
      forced += 1;
    }
  }
  return forced;
}

function closeServer(server) {
  if (!server) {
    return Promise.resolve(true);
  }

  return new Promise(resolve => {
    server.close(() => resolve(true));
  });
}

async function closeStream(stream) {
  if (!stream || stream.destroyed || stream.closed) {
    return;
  }

  await new Promise(resolve => stream.end(resolve));
}

async function withDeadline(promise, ms) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(promise).then(() => true),
      new Promise(resolve => {
        timer = setTimeout(() => resolve(false), ms);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
