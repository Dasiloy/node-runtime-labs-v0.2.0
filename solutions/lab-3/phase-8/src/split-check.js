import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  createMemorySampler,
  createReport,
  createTimer,
  writeJsonReport,
} from './measure.js';
import { createLineSplitter } from './line-splitter.js';

const defaults = {
  input: 'data/access.ndjson',
  readHwm: 7,
};

function parseArgs(args) {
  const options = { ...defaults };
  const specs = new Map([
    ['--input', 'input'],
    ['--read-hwm', 'readHwm'],
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

    options[name] = name === 'readHwm' ? Number.parseInt(value, 10) : value;
    index += 1;
  }

  if (!Number.isInteger(options.readHwm) || options.readHwm <= 0) {
    throw new Error('--read-hwm must be a positive integer');
  }

  return options;
}

async function countExpectedLines(path) {
  const text = await readFile(path, 'utf8');
  if (text.length === 0) {
    return 0;
  }

  return text.endsWith('\n') ? text.slice(0, -1).split('\n').length : text.split('\n').length;
}

function createCountingSink() {
  let seen = 0;

  return {
    sink: new Writable({
      objectMode: true,
      write(line, encoding, callback) {
        if (line.length > 0) {
          JSON.parse(line);
          seen += 1;
        }
        callback();
      },
    }),
    getSeen() {
      return seen;
    },
  };
}

async function run(options) {
  const timer = createTimer();
  const memorySampler = createMemorySampler();
  const expectedLines = await countExpectedLines(options.input);
  const { sink, getSeen } = createCountingSink();

  await pipeline(
    createReadStream(options.input, { highWaterMark: options.readHwm }),
    createLineSplitter(),
    sink,
  );

  const seenLines = getSeen();
  const passed = seenLines === expectedLines;
  const report = createReport({
    mode: 'split-check',
    status: passed ? 'passed' : 'failed',
    input: {
      path: options.input,
      bytes: null,
    },
    output: {
      path: null,
      bytes: 0,
    },
    counts: {
      expectedLines,
      seenLines,
      rows: seenLines,
      matches: 0,
    },
    timing: timer.end(),
    memory: memorySampler.stop(),
    bytes: {
      readHwm: options.readHwm,
    },
    details: {
      readHwm: options.readHwm,
      passed,
    },
  });

  await writeJsonReport('reports/split-check.json', report);

  if (!passed) {
    throw new Error(`split check failed: expected ${expectedLines}, saw ${seenLines}`);
  }

  console.log(`expected lines: ${expectedLines}`);
  console.log(`seen lines: ${seenLines}`);
  console.log(`read hwm: ${options.readHwm}`);
}

async function main() {
  await run(parseArgs(process.argv.slice(2)));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
