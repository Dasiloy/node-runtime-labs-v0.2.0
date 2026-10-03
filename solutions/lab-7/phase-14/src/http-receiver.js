import http from "node:http";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { createLogger } from "./logger.js";

const DEFAULT_RECEIVER_OPTIONS = Object.freeze({
  host: "127.0.0.1",
  port: 4310
});

export function printReceiverHelp() {
  console.log(`Usage: node src/cli.js receiver [options]

Options:
  --host <host>  Bind host (default: ${DEFAULT_RECEIVER_OPTIONS.host})
  --port <port>  Bind port (default: ${DEFAULT_RECEIVER_OPTIONS.port})`);
}

export function parseReceiverOptions(args) {
  if (args.includes("--help")) {
    return { help: true };
  }
  return {
    host: readFlag(args, "--host", DEFAULT_RECEIVER_OPTIONS.host),
    port: readIntegerFlag(args, "--port", DEFAULT_RECEIVER_OPTIONS.port)
  };
}

export async function runReceiverCommand(args) {
  const options = parseReceiverOptions(args);
  if (options.help) {
    printReceiverHelp();
    return;
  }
  startHttpReceiver(options);
}

export function startHttpReceiver(options = {}) {
  const config = { ...DEFAULT_RECEIVER_OPTIONS, ...options };
  const logger = createLogger();
  mkdirSync(path.resolve("data"), { recursive: true });
  const output = createWriteStream(path.resolve("data/http-received.ndjson"), {
    flags: "a"
  });

  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/events") {
      response.writeHead(404).end();
      return;
    }

    try {
      const chunks = [];
      for await (const chunk of request) {
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString("utf8");
      const event = JSON.parse(body);
      output.write(`${JSON.stringify(event)}\n`);
      response.writeHead(204).end();
    } catch (error) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
  });

  server.on("listening", () => {
    const address = server.address();
    logger.log("receiver.listening", { host: address.address, port: address.port });
  });

  server.on("error", error => {
    logger.error("receiver.error", error, { host: config.host, port: config.port });
    process.exitCode = 1;
  });

  server.listen(config.port, config.host);
  return server;
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
