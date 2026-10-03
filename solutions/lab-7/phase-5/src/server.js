import net from "node:net";
import { createLogger } from "./logger.js";

const DEFAULT_SERVER_OPTIONS = Object.freeze({
  host: "127.0.0.1",
  port: 41234,
  sink: "stdout",
  idleTimeoutMs: 30_000
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
    )
  };
}

export function printServerHelp() {
  console.log(`Usage: node src/cli.js server [options]

Options:
  --host <host>              Bind host (default: ${DEFAULT_SERVER_OPTIONS.host})
  --port <port>              Bind port (default: ${DEFAULT_SERVER_OPTIONS.port})
  --sink <stdout|file|http>  Event sink (default: ${DEFAULT_SERVER_OPTIONS.sink})
  --idle-timeout-ms <ms>     Socket idle timeout (default: ${DEFAULT_SERVER_OPTIONS.idleTimeoutMs})`);
}

export function startServer(options = {}) {
  const config = { ...DEFAULT_SERVER_OPTIONS, ...options };
  const logger = config.logger ?? createLogger();
  const connections = new Map();
  let nextConnectionId = 1;

  const server = net.createServer(socket => {
    const connectionId = nextConnectionId++;
    const state = {
      connectionId,
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort,
      localPort: socket.localPort,
      openedAt: new Date().toISOString(),
      bytesRead: 0,
      framesRead: 0,
      closeReason: "peer-close"
    };
    connections.set(connectionId, state);

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
      state.bytesRead += chunk.length;
      logger.log("connection.bytes", {
        connectionId,
        chunkBytes: chunk.length,
        bytesRead: state.bytesRead
      });
    });

    socket.on("timeout", () => {
      state.closeReason = "idle-timeout";
      socket.end();
    });

    socket.on("error", error => {
      state.closeReason = error.code ?? "socket-error";
      logger.error("socket.error", error, { connectionId });
    });

    socket.on("close", hadError => {
      connections.delete(connectionId);
      logger.log("connection.close", {
        connectionId,
        remoteAddress: state.remoteAddress,
        remotePort: state.remotePort,
        localPort: state.localPort,
        bytesRead: state.bytesRead,
        framesRead: state.framesRead,
        closeReason: hadError ? state.closeReason : state.closeReason,
        hadError
      });
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
