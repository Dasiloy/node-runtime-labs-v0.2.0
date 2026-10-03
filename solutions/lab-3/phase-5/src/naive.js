import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  createByteCounters,
  createMemorySampler,
  createReport,
  createTimer,
  writeJsonReport,
} from './measure.js';

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

async function run(options) {
  const timer = createTimer();
  const memorySampler = createMemorySampler();
  const byteCounters = createByteCounters();
  const inputPath = resolve(options.input);
  const outputPath = resolve(options.output);
  const predicate = createPredicate(options.where);

  try {
    const inputBuffer = await readFile(inputPath);
    byteCounters.add('read', inputBuffer.byteLength);

    const decoded = inputBuffer.toString('utf8');
    const lines = decoded.endsWith('\n') ? decoded.slice(0, -1).split('\n') : decoded.split('\n');
    const matches = [];
    let rows = 0;

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

      rows += 1;

      if (predicate(row)) {
        matches.push(row);
      }
    }

    const outputString = matches.map((row) => JSON.stringify(row)).join('\n');
    const outputWithFinalNewline = outputString.length === 0 ? '' : `${outputString}\n`;

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, outputWithFinalNewline);
    byteCounters.add('written', Buffer.byteLength(outputWithFinalNewline));

    const inputStat = await stat(inputPath);
    const timing = timer.end();
    const memory = memorySampler.stop();
    const bytes = byteCounters.snapshot();
    const report = createReport({
      mode: 'naive',
      input: {
        path: options.input,
        bytes: inputStat.size,
      },
      output: {
        path: options.output,
        bytes: bytes.written,
      },
      counts: {
        rows,
        matches: matches.length,
      },
      timing,
      memory,
      bytes,
      details: {
        where: options.where,
      },
    });

    await writeJsonReport('reports/naive.json', report);

    console.log(`rows read: ${report.counts.rows}`);
    console.log(`matches written: ${report.counts.matches}`);
    console.log(`bytes written: ${report.output.bytes}`);
  } finally {
    memorySampler.stop();
  }
}

async function main() {
  await run(parseArgs(process.argv.slice(2)));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
