import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { compileFilter } from './filter.js';
import { createLineSplitter } from './line-splitter.js';
import {
  createMemorySampler,
  createReport,
  createTimer,
  writeJsonReport,
} from './measure.js';
import {
  createFilterStage,
  createJsonParser,
  createNdjsonStringifier,
  createPluginStage,
} from './pipeline-stages.js';
import { buildPlugins } from './plugins.js';
import { SlowWritable } from './slow-writable.js';
import { createSource } from './sources.js';

const defaults = {
  source: 'file',
  input: 'data/access.ndjson',
  readHwm: undefined,
  where: 'status >= 500',
  slowWriteMs: 1,
  writeHwm: 16 * 1024,
  writeOutput: '',
  discard: true,
};

function parseArgs(args) {
  const options = { ...defaults };
  const specs = new Map([
    ['--source', 'source'],
    ['--input', 'input'],
    ['--read-hwm', 'readHwm'],
    ['--where', 'where'],
    ['--slow-write-ms', 'slowWriteMs'],
    ['--write-hwm', 'writeHwm'],
    ['--redact', 'redact'],
    ['--select', 'select'],
    ['--enrich', 'enrich'],
    ['--write-output', 'writeOutput'],
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];

    if (flag === '--no-discard') {
      options.discard = false;
      continue;
    }

    const name = specs.get(flag);
    if (!name) {
      throw new Error(`Unknown flag: ${flag}`);
    }

    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${flag}`);
    }

    options[name] = ['readHwm', 'slowWriteMs', 'writeHwm'].includes(name)
      ? Number.parseInt(value, 10)
      : value;
    index += 1;
  }

  for (const key of ['readHwm', 'slowWriteMs', 'writeHwm']) {
    if (options[key] !== undefined && (!Number.isInteger(options[key]) || options[key] < 0)) {
      throw new Error(`--${key} must be a non-negative integer`);
    }
  }

  return options;
}

async function run(options) {
  const timer = createTimer();
  const memorySampler = createMemorySampler();
  const source = await createSource(options);
  const predicate = compileFilter(options.where);
  const pluginPlan = buildPlugins(options);
  const counters = {
    rows: 0,
    matches: 0,
  };
  const streamBytes = {
    outputUncompressed: 0,
  };

  if (!options.discard && options.writeOutput) {
    await mkdir(dirname(resolve(options.writeOutput)), { recursive: true });
  }

  const sink = new SlowWritable({
    delayMs: options.slowWriteMs,
    highWaterMark: options.writeHwm,
    writeOutputPath: options.writeOutput ? resolve(options.writeOutput) : null,
    discard: options.discard,
  });

  await pipeline(
    source.stream,
    createLineSplitter(),
    createJsonParser(counters),
    createFilterStage(predicate, counters),
    createPluginStage(pluginPlan.plugins),
    createNdjsonStringifier(streamBytes),
    sink,
  );

  const sinkMetrics = sink.metrics();
  const bytes = source.snapshot();
  const report = createReport({
    mode: 'pressure',
    status: 'completed',
    input: {
      path: options.source === 'stdin' ? null : options.input,
      source: source.meta,
      bytes: bytes.bytesRead,
    },
    output: {
      path: options.discard ? null : options.writeOutput,
      bytes: sinkMetrics.bytes,
    },
    counts: counters,
    timing: timer.end(),
    memory: memorySampler.stop(),
    bytes: {
      ...bytes,
      outputUncompressed: streamBytes.outputUncompressed,
      written: sinkMetrics.bytes,
    },
    details: {
      where: options.where,
      slowWriteMs: options.slowWriteMs,
      writeHwm: options.writeHwm,
      sink: sinkMetrics,
      plugins: {
        config: pluginPlan.config,
        executionOrder: ['filter', ...pluginPlan.executionOrder, 'stringify'],
      },
    },
  });

  await writeJsonReport('reports/pressure.json', report);

  console.log(`rows read: ${counters.rows}`);
  console.log(`matches written: ${counters.matches}`);
  console.log(`drain events: ${sinkMetrics.drainCount}`);
  console.log(`max buffered bytes: ${sinkMetrics.maxBufferedBytes}`);
}

async function main() {
  await run(parseArgs(process.argv.slice(2)));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
