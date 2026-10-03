#!/usr/bin/env node

const commands = new Map([
  ["server", serverCommand],
  ["client", clientCommand],
  ["protocol", protocolCommand],
  ["encode", encodeCommand],
  ["decode", decodeCommand],
  ["receiver", receiverCommand],
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

async function serverCommand(args) {
  try {
    const { runServerCommand } = await import("./server.js");
    await runServerCommand(args);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

async function clientCommand(args) {
  try {
    const { runClientCommand } = await import("../client/send.js");
    await runClientCommand(args);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
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

async function receiverCommand(args) {
  try {
    const { runReceiverCommand } = await import("./http-receiver.js");
    await runReceiverCommand(args);
  } catch (error) {
    console.error(error.message);
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
