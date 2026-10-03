import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  createMemorySampler,
  createReport,
  createTimer,
  writeJsonReport,
} from './measure.js';
import { createSource } from './sources.js';

const defaults = {
  source: 'file',
  input: 'data/access.ndjson',
  readHwm: undefined,
};

function parseArgs(args) {
  const options = { ...defaults };
  const specs = new Map([
    ['--source', 'source'],
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

  if (options.readHwm !== undefined && (!Number.isInteger(options.readHwm) || options.readHwm <= 0)) {
    throw new Error('--read-hwm must be a positive integer');
  }

  return options;
}

function createDiscardSink() {
  return new Writable({
    write(chunk, encoding, callback) {
      callback();
    },
  });
}

async function run(options) {
  const timer = createTimer();
  const memorySampler = createMemorySampler();
  const source = await createSource(options);
  const sink = createDiscardSink();
  let status = 'completed';
  let errorMessage;

  try {
    await pipeline(source.stream, sink);
  } catch (error) {
    status = 'failed';
    errorMessage = error.message;
    throw error;
  } finally {
    const timing = timer.end();
    const memory = memorySampler.stop();
    const bytes = source.snapshot();
    const report = createReport({
      mode: 'stream',
      status,
      input: {
        path: options.source === 'stdin' ? null : options.input,
        source: source.meta,
        bytes: bytes.bytesRead,
      },
      output: {
        path: null,
        bytes: 0,
      },
      counts: {
        rows: null,
        matches: 0,
      },
      timing,
      memory,
      bytes,
      details: {
        errorMessage,
      },
    });

    await writeJsonReport('reports/stream.json', report);
  }

  console.log(`source: ${source.meta.kind}`);
  console.log(`bytes read: ${source.snapshot().bytesRead}`);
}

async function main() {
  await run(parseArgs(process.argv.slice(2)));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
