import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const defaults = {
  input: 'data/access.ndjson',
  output: 'out/errors-naive.ndjson',
  where: 'status >= 500',
};

function parseArgs(args) {
  const options = { ...defaults };
  const specs = new Map([
    ['--input', 'input'],
    ['--output', 'output'],
    ['--where', 'where'],
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const name = specs.get(flag);

    if (!name) {
      throw new Error(`Unknown flag: ${flag}`);
    }

    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${flag}`);
    }

    options[name] = value;
    index += 1;
  }

  return options;
}

function createPredicate(where) {
  const match = where.match(/^status\s*>=\s*(\d+)$/);

  if (!match) {
    throw new Error(`Unsupported filter in this phase: ${where}`);
  }

  const threshold = Number.parseInt(match[1], 10);
  return (row) => row.status >= threshold;
}

function peakMemory(before, after) {
  const peak = {};

  for (const key of Object.keys(before)) {
    peak[key] = Math.max(before[key], after[key]);
  }

  return peak;
}

async function run(options) {
  const started = performance.now();
  const memoryBefore = process.memoryUsage();
  const inputPath = resolve(options.input);
  const outputPath = resolve(options.output);
  const predicate = createPredicate(options.where);

  const inputBuffer = await readFile(inputPath);
  const decoded = inputBuffer.toString('utf8');
  const lines = decoded.endsWith('\n') ? decoded.slice(0, -1).split('\n') : decoded.split('\n');
  const matches = [];

  for (const [index, line] of lines.entries()) {
    if (line.length === 0) {
      continue;
    }

    let row;
    try {
      row = JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSON on line ${index + 1}: ${error.message}`);
    }

    if (predicate(row)) {
      matches.push(row);
    }
  }

  const outputString = matches.map((row) => JSON.stringify(row)).join('\n');
  const outputWithFinalNewline = outputString.length === 0 ? '' : `${outputString}\n`;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, outputWithFinalNewline);

  const outputBytes = Buffer.byteLength(outputWithFinalNewline);
  const elapsedMs = performance.now() - started;
  const memoryAfter = process.memoryUsage();
  const inputStat = await stat(inputPath);

  const report = {
    rows: lines.filter(Boolean).length,
    matches: matches.length,
    elapsedMs,
    peakMemory: peakMemory(memoryBefore, memoryAfter),
    inputFile: options.input,
    outputFile: options.output,
    inputBytes: inputStat.size,
    outputBytes,
    where: options.where,
  };

  await mkdir(resolve('reports'), { recursive: true });
  await writeFile(resolve('reports/naive.json'), `${JSON.stringify(report, null, 2)}\n`);

  console.log(`rows read: ${report.rows}`);
  console.log(`matches written: ${report.matches}`);
  console.log(`bytes written: ${report.outputBytes}`);
}

async function main() {
  await run(parseArgs(process.argv.slice(2)));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
