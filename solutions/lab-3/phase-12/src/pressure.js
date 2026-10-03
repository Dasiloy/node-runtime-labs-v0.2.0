import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
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
  createAbortAfterRowsStage,
  createJsonParser,
  createNdjsonStringifier,
  createPluginStage,
} from './pipeline-stages.js';
import { buildPlugins } from './plugins.js';
import { SlowWritable } from './slow-writable.js';
import { createSource } from './sources.js';
import { trackStageCloses } from './stage-tracking.js';

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
  abortAfterRows: undefined,
  abortAfterMs: undefined,
  gzip: false,
  gzipLevel: undefined,
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
    ['--abort-after-rows', 'abortAfterRows'],
    ['--abort-after-ms', 'abortAfterMs'],
    ['--gzip-level', 'gzipLevel'],
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
    if (flag === '--gzip') {
      options.gzip = true;
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

    options[name] = ['readHwm', 'slowWriteMs', 'writeHwm', 'sampleMs', 'abortAfterRows', 'abortAfterMs', 'gzipLevel'].includes(name)
      ? Number.parseInt(value, 10)
      : value;
    index += 1;
  }

  for (const key of ['readHwm', 'slowWriteMs', 'writeHwm', 'sampleMs', 'abortAfterRows', 'abortAfterMs']) {
    if (options[key] !== undefined && (!Number.isInteger(options[key]) || options[key] < 0)) {
      throw new Error(`--${key} must be a non-negative integer`);
    }
  }
  if (options.sampleMs === 0) {
    throw new Error('--sample-ms must be greater than 0');
  }
  if (options.gzipLevel !== undefined && (!Number.isInteger(options.gzipLevel) || options.gzipLevel < 0 || options.gzipLevel > 9)) {
    throw new Error('--gzip-level must be an integer from 0 through 9');
  }

  return options;
}

async function run(options) {
  const timer = createTimer();
  const startMs = performance.now();
  const memorySampler = createMemorySampler();
  const controller = new AbortController();
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
  let status = 'completed';
  let errorMessage;
  let errorCode = null;
  let closeTracker = { snapshot: () => [] };
  let abortTimer;
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
    if (options.abortAfterMs !== undefined) {
      abortTimer = setTimeout(() => {
        controller.abort(new Error(`aborted after ${options.abortAfterMs} ms`));
      }, options.abortAfterMs);
      abortTimer.unref();
    }

    const stages = [
      { name: 'source', stream: source.stream },
      { name: 'lineSplitter', stream: createLineSplitter() },
      { name: 'jsonParser', stream: createJsonParser(counters) },
      {
        name: 'abortAfterRows',
        stream: createAbortAfterRowsStage({
          abortAfterRows: options.abortAfterRows,
          controller,
          signal: controller.signal,
          getRows: () => counters.rows,
        }),
      },
      { name: 'filter', stream: createFilterStage(predicate, counters) },
      { name: 'plugins', stream: createPluginStage(pluginPlan.plugins) },
      { name: 'stringifier', stream: createNdjsonStringifier(streamBytes) },
    ];

    if (options.gzip) {
      stages.push({
        name: 'gzip',
        stream: createGzip(options.gzipLevel === undefined ? undefined : { level: options.gzipLevel }),
      });
    }

    stages.push({ name: 'slowSink', stream: sink });
    closeTracker = trackStageCloses(stages);

    await pipeline(...stages.map((stage) => stage.stream), { signal: controller.signal });
  } catch (error) {
    status = error.name === 'AbortError' || error.code === 'ABORT_ERR' || controller.signal.aborted
      ? 'aborted'
      : 'failed';
    errorMessage = error.message;
    errorCode = error.code ?? null;
  } finally {
    if (abortTimer) {
      clearTimeout(abortTimer);
    }
    clearInterval(sampleInterval);
    sample();
  }

  const sinkMetrics = sink.metrics();
  const bytes = source.snapshot();
  const timing = timer.end();
  const report = createReport({
    mode: 'pressure',
    status,
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
      outputCompressed: options.gzip ? sinkMetrics.bytes : 0,
      written: sinkMetrics.bytes,
    },
    details: {
      where: options.where,
      slowWriteMs: options.slowWriteMs,
      writeHwm: options.writeHwm,
      sampleMs: options.sampleMs,
      sink: sinkMetrics,
      errorMessage,
      abort: {
        abortAfterRows: options.abortAfterRows ?? null,
        abortAfterMs: options.abortAfterMs ?? null,
        rowThresholdCounts: 'parsed rows',
      },
      compression: {
        gzip: options.gzip,
        gzipLevel: options.gzipLevel ?? null,
        compressedBytes: options.gzip ? sinkMetrics.bytes : null,
        uncompressedBytes: streamBytes.outputUncompressed,
        ratio: options.gzip && streamBytes.outputUncompressed > 0
          ? sinkMetrics.bytes / streamBytes.outputUncompressed
          : null,
      },
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
  report.pipelineStatus = status;
  report.completed = status === 'completed';
  report.errorCode = errorCode;
  report.stageCloses = closeTracker.snapshot();

  await writeJsonReport('reports/pressure.json', report);

  if (status === 'failed') {
    throw new Error(errorMessage);
  }

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
