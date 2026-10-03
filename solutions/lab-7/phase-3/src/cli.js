#!/usr/bin/env node

const commands = new Map([
  ["server", serverHelp],
  ["client", clientHelp],
  ["protocol", protocolCommand],
  ["encode", encodeCommand],
  ["decode", decodeCommand],
  ["receiver", placeholder("receiver")],
  ["load", placeholder("load")],
  ["report", placeholder("report")]
]);

main(process.argv.slice(2));

function main(args) {
  if (args.length === 0 || args[0] === "--help") {
    rejectUnknownFlags(args, new Set(["--help"]));
    printOverview();
    return;
  }

  const [command, ...rest] = args;
  if (command.startsWith("--")) {
    console.error(`Unknown flag: ${command}`);
    process.exitCode = 1;
    return;
  }

  const handler = commands.get(command);
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    printOverview();
    process.exitCode = 1;
    return;
  }

  handler(rest);
}

function printOverview() {
  console.log(`Custom Binary Protocol Gateway

Usage:
  node src/cli.js --help
  node src/cli.js <command> [options]

Commands:
  server     Start the TCP gateway
  client     Send protocol frames to the gateway
  protocol   Print the binary protocol layout
  encode     Encode one event frame and print a hex dump
  decode     Decode one frame from pasted hex
  receiver   Start a local HTTP event receiver
  load       Run a load test client
  report     Generate protocol gateway reports`);
}

function serverHelp(args) {
  if (args.includes("--help")) {
    console.log(`Usage: node src/cli.js server [options]

Options:
  --host <host>              Bind host (default: 127.0.0.1)
  --port <port>              Bind port (default: 41234)
  --sink <stdout|file|http>  Event sink (default: stdout)
  --idle-timeout-ms <ms>     Socket idle timeout (default: 30000)`);
    return;
  }

  console.error("server is not implemented yet");
  process.exitCode = 1;
}

function clientHelp(args) {
  if (args.includes("--help")) {
    console.log(`Usage: node src/cli.js client [options]

Options:
  --host <host>           Server host (default: 127.0.0.1)
  --port <port>           Server port (default: 41234)
  --name <name>           Event name (default: sample.event)
  --request-id <id>       Starting request id (default: 1)
  --count <n>             Number of frames to send (default: 1)
  --payload-bytes <n>     Extra payload bytes (default: 0)`);
    return;
  }

  console.error("client is not implemented yet");
  process.exitCode = 1;
}

async function protocolCommand(args) {
  if (args.length > 0 && !args.includes("--help")) {
    console.error(`Unknown argument for protocol: ${args.join(" ")}`);
    process.exitCode = 1;
    return;
  }

  const { formatProtocol } = await import("./protocol.js");
  console.log(formatProtocol());
}

async function encodeCommand(args) {
  try {
    const { runEncodeCommand } = await import("./encode-one.js");
    runEncodeCommand(args);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

async function decodeCommand(args) {
  try {
    const { runDecodeCommand } = await import("./decode-one.js");
    runDecodeCommand(args);
  } catch (error) {
    console.error(error.code ? `${error.code}: ${error.message}` : error.message);
    process.exitCode = 1;
  }
}

function placeholder(name) {
  return args => {
    if (args.includes("--help")) {
      console.log(`Usage: node src/cli.js ${name} [options]`);
      return;
    }

    console.error(`${name} is not implemented yet`);
    process.exitCode = 1;
  };
}

function rejectUnknownFlags(args, allowed) {
  for (const arg of args) {
    if (arg.startsWith("--") && !allowed.has(arg)) {
      console.error(`Unknown flag: ${arg}`);
      process.exitCode = 1;
      return;
    }
  }
}
