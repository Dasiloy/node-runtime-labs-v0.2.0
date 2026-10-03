import { resolve } from "node:path";
import process from "node:process";

const usage = `Usage: npm run flight -- [options] <target.js> [target args...]

Options:
  --json <path>       Write the JSON report path (default: reports/flight.json)
  --html <path>       Write an HTML report in a later phase
  --markdown <path>   Write a Markdown report in a later phase
  --env-file <path>   Load environment values for the child in a later phase
  --node-flag <flag>  Pass a Node runtime flag to the child in a later phase
  --timeout-ms <ms>   Stop a long-running target after a deadline
  --sample-ms <ms>    Probe sample interval (default: 250)
  --help              Show this help screen
`;

const valueFlags = new Set([
  "--json",
  "--html",
  "--markdown",
  "--env-file",
  "--node-flag",
  "--timeout-ms",
  "--sample-ms",
]);

const defaults = {
  json: "reports/flight.json",
  html: undefined,
  markdown: undefined,
  envFile: undefined,
  nodeFlags: [],
  timeoutMs: undefined,
  sampleMs: 250,
};

function readFlagValue(args, index, flag) {
  const value = args[index + 1];
  if (value === undefined) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

export function parseArgs(args) {
  const options = {
    ...defaults,
    nodeFlags: [],
    target: undefined,
    targetArgs: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help") {
      return { kind: "help" };
    }

    if (arg.startsWith("--")) {
      if (!valueFlags.has(arg)) {
        throw new Error(`Unknown flag: ${arg}`);
      }

      const value = readFlagValue(args, index, arg);
      index += 1;

      if (arg === "--node-flag") options.nodeFlags.push(value);
      if (arg === "--json") options.json = value;
      if (arg === "--html") options.html = value;
      if (arg === "--markdown") options.markdown = value;
      if (arg === "--env-file") options.envFile = value;
      if (arg === "--timeout-ms") options.timeoutMs = Number(value);
      if (arg === "--sample-ms") options.sampleMs = Number(value);
      continue;
    }

    options.target = {
      input: arg,
      path: resolve(arg),
    };
    options.targetArgs = args.slice(index + 1);
    return { kind: "run", options };
  }

  return { kind: "run", options };
}

function main() {
  try {
    const parsed = parseArgs(process.argv.slice(2));

    if (parsed.kind === "help") {
      process.stdout.write(usage);
      return;
    }

    if (!parsed.options.target) {
      process.stderr.write("Missing target script path. Run with --help for usage.\n");
      process.exitCode = 1;
      return;
    }

    process.stdout.write(`${JSON.stringify(parsed.options, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

main();
