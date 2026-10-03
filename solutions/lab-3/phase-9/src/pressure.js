import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
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
  sampleMs: 100,
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
    ['--sample-ms', 'sampleMs'],
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

    options[name] = ['readHwm', 'slowWriteMs', 'writeHwm', 'sampleMs'].includes(name)
      ? Number.parseInt(value, 10)
      : value;
    index += 1;
  }

  for (const key of ['readHwm', 'slowWriteMs', 'writeHwm', 'sampleMs']) {
    if (options[key] !== undefined && (!Number.isInteger(options[key]) || options[key] < 0)) {
      throw new Error(`--${key} must be a non-negative integer`);
    }
  }
  if (options.sampleMs === 0) {
    throw new Error('--sample-ms must be greater than 0');
  }

  return options;
}

async function run(options) {
  const timer = createTimer();
  const startMs = performance.now();
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
  const timeline = [];
  const drainEvents = [];
  let lastSample = {
    elapsedMs: 0,
    bytesWritten: 0,
  };

  sink.on('drain', () => {
    drainEvents.push({
      elapsedMs: performance.now() - startMs,
      writableLength: sink.writableLength,
    });
  });

  const sample = () => {
    const elapsedMs = performance.now() - startMs;
    const memory = process.memoryUsage();
    const bytes = source.snapshot();
    const sinkMetrics = sink.metrics();
    const deltaMs = Math.max(elapsedMs - lastSample.elapsedMs, 0.001);
    const deltaBytes = sinkMetrics.bytes - lastSample.bytesWritten;
    const readableLength = typeof source.stream.readableLength === 'number'
      ? source.stream.readableLength
      : null;
    const entry = {
      elapsedMs,
      memory: {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        external: memory.external,
      },
      readableLength,
      writableLength: sinkMetrics.writableLength,
      bytesRead: bytes.bytesRead,
      bytesWritten: sinkMetrics.bytes,
      rowsSeen: counters.rows,
      rowsMatched: counters.matches,
      throughputBytesPerSec: (deltaBytes / deltaMs) * 1000,
      drainCount: sinkMetrics.drainCount,
    };

    timeline.push(entry);
    lastSample = {
      elapsedMs,
      bytesWritten: sinkMetrics.bytes,
    };
  };
  const sampleInterval = setInterval(sample, options.sampleMs);
  sampleInterval.unref();

  try {
    await pipeline(
      source.stream,
      createLineSplitter(),
      createJsonParser(counters),
      createFilterStage(predicate, counters),
      createPluginStage(pluginPlan.plugins),
      createNdjsonStringifier(streamBytes),
      sink,
    );
  } finally {
    clearInterval(sampleInterval);
    sample();
  }

  const sinkMetrics = sink.metrics();
  const bytes = source.snapshot();
  const timing = timer.end();
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
    timing,
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
      sampleMs: options.sampleMs,
      sink: sinkMetrics,
      plugins: {
        config: pluginPlan.config,
        executionOrder: ['filter', ...pluginPlan.executionOrder, 'stringify'],
      },
    },
  });
  const maxFromTimeline = (selector) => timeline.reduce((max, entry) => Math.max(max, selector(entry) ?? 0), 0);

  report.timeline = timeline;
  report.drainEvents = drainEvents;
  report.summary = {
    maxReadableLength: maxFromTimeline((entry) => entry.readableLength),
    maxWritableLength: maxFromTimeline((entry) => entry.writableLength),
    maxRss: maxFromTimeline((entry) => entry.memory.rss),
    totalDrains: sinkMetrics.drainCount,
    totalBytes: sinkMetrics.bytes,
    elapsedMs: timing.elapsedMs,
  };

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
