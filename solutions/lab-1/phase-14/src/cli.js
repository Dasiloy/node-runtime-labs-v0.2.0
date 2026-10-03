import { resolve } from "node:path";
import process from "node:process";
import { run } from "./run.js";
import { compareReports } from "./compare.js";

const usage = `Usage:
  npm run flight -- [options] <target.js> [target args...]
  npm run flight -- compare <report-a.json> <report-b.json> [...reports] --markdown reports/comparison.md

Options:
  --json <path>       Write the JSON report path (default: reports/flight.json)
  --html <path>       Write an HTML report in a later phase
  --markdown <path>   Write a Markdown report in a later phase
  --baseline <path>   Select a comparison baseline in compare mode
  --env-file <path>   Load environment values for the child in a later phase
  --env KEY=value     Override one child environment variable
  --node-flag <flag>  Pass a Node runtime flag to the child in a later phase
  --timeout-ms <ms>   Stop a long-running target after a deadline
  --kill-timeout-ms <ms>
                      Force-kill the child after forwarded shutdown (default: 5000)
  --sample-ms <ms>    Probe sample interval (default: 250)
  --help              Show this help screen
`;

const valueFlags = new Set([
  "--json",
  "--html",
  "--markdown",
  "--env-file",
  "--env",
  "--node-flag",
  "--timeout-ms",
  "--kill-timeout-ms",
  "--sample-ms",
]);

const defaults = {
  json: "reports/flight.json",
  html: undefined,
  markdown: undefined,
  envFile: undefined,
  env: [],
  nodeFlags: [],
  timeoutMs: undefined,
  killTimeoutMs: 5000,
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
  if (args[0] === "compare") {
    return { kind: "compare", options: parseCompareArgs(args.slice(1)) };
  }

  const options = {
    ...defaults,
    env: [],
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
      if (arg === "--env") options.env.push(value);
      if (arg === "--timeout-ms") options.timeoutMs = Number(value);
      if (arg === "--kill-timeout-ms") options.killTimeoutMs = Number(value);
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

function parseCompareArgs(args) {
  const options = {
    paths: [],
    baseline: undefined,
    markdown: "reports/comparison.md",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--markdown") {
      options.markdown = readFlagValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--baseline") {
      options.baseline = readFlagValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown compare flag: ${arg}`);
    }
    options.paths.push(arg);
  }

  return options;
}

async function main() {
  try {
    const parsed = parseArgs(process.argv.slice(2));

    if (parsed.kind === "help") {
      process.stdout.write(usage);
      return;
    }

    if (parsed.kind === "compare") {
      const result = await compareReports(parsed.options);
      process.stdout.write(`wrote ${result.markdown}\n`);
      return;
    }

    if (!parsed.options.target) {
      process.stderr.write("Missing target script path. Run with --help for usage.\n");
      process.exitCode = 1;
      return;
    }

    const result = await run(parsed.options);
    process.stderr.write(`child pid ${result.pid} exited with code ${result.exitCode}\n`);
    process.exitCode = result.exitCode ?? 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

main();
