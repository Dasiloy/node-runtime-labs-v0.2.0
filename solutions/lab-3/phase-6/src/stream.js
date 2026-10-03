import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { compileFilter } from './filter.js';
import { createLineSplitter } from './line-splitter.js';
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
  output: 'out/stream.ndjson',
  readHwm: undefined,
  where: 'status >= 500',
};

function parseArgs(args) {
  const options = { ...defaults };
  const specs = new Map([
    ['--source', 'source'],
    ['--input', 'input'],
    ['--output', 'output'],
    ['--read-hwm', 'readHwm'],
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

    options[name] = name === 'readHwm' ? Number.parseInt(value, 10) : value;
    index += 1;
  }

  if (options.readHwm !== undefined && (!Number.isInteger(options.readHwm) || options.readHwm <= 0)) {
    throw new Error('--read-hwm must be a positive integer');
  }

  return options;
}

function createJsonParser(counters) {
  let lineNumber = 0;

  return new Transform({
    readableObjectMode: true,
    writableObjectMode: true,
    transform(line, encoding, callback) {
      if (line.length === 0) {
        callback();
        return;
      }

      lineNumber += 1;

      try {
        const row = JSON.parse(line);
        counters.rows += 1;
        callback(null, row);
      } catch (error) {
        callback(new Error(`Invalid JSON on line ${lineNumber}: ${error.message}`));
      }
    },
  });
}

function createFilterStage(predicate, counters) {
  return new Transform({
    readableObjectMode: true,
    writableObjectMode: true,
    transform(row, encoding, callback) {
      if (predicate(row)) {
        counters.matches += 1;
        callback(null, row);
        return;
      }

      callback();
    },
  });
}

function createNdjsonStringifier(byteCounters) {
  let pending = '';
  const flushAtBytes = 64 * 1024;

  return new Transform({
    writableObjectMode: true,
    transform(row, encoding, callback) {
      pending += `${JSON.stringify(row)}\n`;

      if (Buffer.byteLength(pending) >= flushAtBytes) {
        byteCounters.outputUncompressed += Buffer.byteLength(pending);
        callback(null, pending);
        pending = '';
        return;
      }

      callback();
    },
    flush(callback) {
      if (pending.length > 0) {
        byteCounters.outputUncompressed += Buffer.byteLength(pending);
        callback(null, pending);
        pending = '';
        return;
      }

      callback();
    },
  });
}

async function run(options) {
  const timer = createTimer();
  const memorySampler = createMemorySampler();
  const source = await createSource(options);
  const outputPath = resolve(options.output);
  const predicate = compileFilter(options.where);
  const counters = {
    rows: 0,
    matches: 0,
  };
  const streamBytes = {
    outputUncompressed: 0,
  };
  let status = 'completed';
  let errorMessage;

  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await pipeline(
      source.stream,
      createLineSplitter(),
      createJsonParser(counters),
      createFilterStage(predicate, counters),
      createNdjsonStringifier(streamBytes),
      createWriteStream(outputPath),
    );
  } catch (error) {
    status = 'failed';
    errorMessage = error.message;
    throw error;
  } finally {
    const timing = timer.end();
    const memory = memorySampler.stop();
    const bytes = source.snapshot();
    let outputBytes = 0;

    try {
      outputBytes = (await stat(outputPath)).size;
    } catch {
      outputBytes = 0;
    }

    const report = createReport({
      mode: 'stream',
      status,
      input: {
        path: options.source === 'stdin' ? null : options.input,
        source: source.meta,
        bytes: bytes.bytesRead,
      },
      output: {
        path: options.output,
        bytes: outputBytes,
      },
      counts: {
        rows: counters.rows,
        matches: counters.matches,
      },
      timing,
      memory,
      bytes: {
        ...bytes,
        outputUncompressed: streamBytes.outputUncompressed,
        written: outputBytes,
      },
      details: {
        where: options.where,
        errorMessage,
      },
    });

    await writeJsonReport('reports/stream.json', report);
  }

  console.log(`source: ${source.meta.kind}`);
  console.log(`rows read: ${counters.rows}`);
  console.log(`matches written: ${counters.matches}`);
  console.log(`bytes read: ${source.snapshot().bytesRead}`);
}

async function main() {
  await run(parseArgs(process.argv.slice(2)));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
