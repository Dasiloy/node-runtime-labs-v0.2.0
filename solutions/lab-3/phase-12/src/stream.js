import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { compileFilter } from './filter.js';
import { createLineSplitter } from './line-splitter.js';
import {
  buildPlugins,
  runPluginCompositionCheck,
} from './plugins.js';
import {
  createFilterStage,
  createAbortAfterRowsStage,
  createJsonParser,
  createNdjsonStringifier,
  createPluginStage,
} from './pipeline-stages.js';
import {
  createMemorySampler,
  createReport,
  createTimer,
  writeJsonReport,
} from './measure.js';
import { createSource } from './sources.js';
import { trackStageCloses } from './stage-tracking.js';

const defaults = {
  source: 'file',
  input: 'data/access.ndjson',
  output: 'out/stream.ndjson',
  readHwm: undefined,
  where: 'status >= 500',
  redact: '',
  select: '',
  enrich: '',
  pluginCheck: false,
  abortAfterRows: undefined,
  abortAfterMs: undefined,
  keepPartial: false,
  gzip: false,
  gzipLevel: undefined,
};

function parseArgs(args) {
  const options = { ...defaults };
  const specs = new Map([
    ['--source', 'source'],
    ['--input', 'input'],
    ['--output', 'output'],
    ['--read-hwm', 'readHwm'],
    ['--where', 'where'],
    ['--redact', 'redact'],
    ['--select', 'select'],
    ['--enrich', 'enrich'],
    ['--abort-after-rows', 'abortAfterRows'],
    ['--abort-after-ms', 'abortAfterMs'],
    ['--gzip-level', 'gzipLevel'],
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--plugin-check') {
      options.pluginCheck = true;
      continue;
    }
    if (flag === '--keep-partial') {
      options.keepPartial = true;
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

    options[name] = ['readHwm', 'abortAfterRows', 'abortAfterMs', 'gzipLevel'].includes(name)
      ? Number.parseInt(value, 10)
      : value;
    index += 1;
  }

  if (options.readHwm !== undefined && (!Number.isInteger(options.readHwm) || options.readHwm <= 0)) {
    throw new Error('--read-hwm must be a positive integer');
  }
  for (const key of ['abortAfterRows', 'abortAfterMs']) {
    if (options[key] !== undefined && (!Number.isInteger(options[key]) || options[key] <= 0)) {
      throw new Error(`--${key} must be a positive integer`);
    }
  }
  if (options.gzipLevel !== undefined && (!Number.isInteger(options.gzipLevel) || options.gzipLevel < 0 || options.gzipLevel > 9)) {
    throw new Error('--gzip-level must be an integer from 0 through 9');
  }

  return options;
}

async function run(options) {
  if (options.pluginCheck) {
    const output = runPluginCompositionCheck();
    console.log(JSON.stringify(output));
    console.log('plugin composition check passed');
    return;
  }

  const timer = createTimer();
  const memorySampler = createMemorySampler();
  const source = await createSource(options);
  const outputPath = resolve(options.output);
  const tempOutputPath = `${outputPath}.tmp`;
  const predicate = compileFilter(options.where);
  const pluginPlan = buildPlugins(options);
  const controller = new AbortController();
  const counters = {
    rows: 0,
    matches: 0,
  };
  const streamBytes = {
    outputUncompressed: 0,
  };
  let status = 'completed';
  let errorMessage;
  let errorCode = null;
  let closeTracker = { snapshot: () => [] };
  let finalPromoted = false;
  let partialRemoved = false;
  let partialBytes = 0;
  let cleanupError = null;
  let abortTimer;

  try {
    await mkdir(dirname(outputPath), { recursive: true });
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
      { name: 'stringifier', stream: createNdjsonStringifier(streamBytes, { flushAtBytes: 8 * 1024 }) },
    ];

    if (options.gzip) {
      stages.push({
        name: 'gzip',
        stream: createGzip(options.gzipLevel === undefined ? undefined : { level: options.gzipLevel }),
      });
    }

    stages.push({ name: 'destination', stream: createWriteStream(tempOutputPath) });
    closeTracker = trackStageCloses(stages);

    await pipeline(...stages.map((stage) => stage.stream), { signal: controller.signal });
    await rename(tempOutputPath, outputPath);
    finalPromoted = true;
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

    if (!finalPromoted) {
      try {
        partialBytes = (await stat(tempOutputPath)).size;
      } catch {
        partialBytes = 0;
      }

      if (!options.keepPartial) {
        try {
          await rm(tempOutputPath, { force: true });
          partialRemoved = partialBytes > 0 || status !== 'completed';
        } catch (error) {
          cleanupError = error.message;
        }
      }
    }

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
        outputCompressed: options.gzip ? outputBytes : 0,
        written: outputBytes,
      },
      details: {
        where: options.where,
        plugins: {
          config: pluginPlan.config,
          executionOrder: ['filter', ...pluginPlan.executionOrder, 'stringify'],
        },
        errorMessage,
        abort: {
          abortAfterRows: options.abortAfterRows ?? null,
          abortAfterMs: options.abortAfterMs ?? null,
          rowThresholdCounts: 'parsed rows',
          keepPartial: options.keepPartial,
        },
        cleanup: {
          tempOutputPath,
          partialBytes,
          partialRemoved,
          finalPromoted,
          cleanupError,
        },
        compression: {
          gzip: options.gzip,
          gzipLevel: options.gzipLevel ?? null,
          compressedBytes: options.gzip ? outputBytes : null,
          uncompressedBytes: streamBytes.outputUncompressed,
          ratio: options.gzip && streamBytes.outputUncompressed > 0
            ? outputBytes / streamBytes.outputUncompressed
            : null,
        },
      },
    });
    report.pipelineStatus = status;
    report.completed = status === 'completed';
    report.errorCode = errorCode;
    report.stageCloses = closeTracker.snapshot();

    await writeJsonReport('reports/stream.json', report);
  }

  if (status === 'failed') {
    throw new Error(errorMessage);
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
