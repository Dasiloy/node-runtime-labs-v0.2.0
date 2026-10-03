import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { compileFilter } from './filter.js';
import { createLineSplitter } from './line-splitter.js';
import {
  buildPlugins,
  runPluginCompositionCheck,
} from './plugins.js';
import {
  createFilterStage,
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
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--plugin-check') {
      options.pluginCheck = true;
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

    options[name] = name === 'readHwm' ? Number.parseInt(value, 10) : value;
    index += 1;
  }

  if (options.readHwm !== undefined && (!Number.isInteger(options.readHwm) || options.readHwm <= 0)) {
    throw new Error('--read-hwm must be a positive integer');
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
  const predicate = compileFilter(options.where);
  const pluginPlan = buildPlugins(options);
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

  try {
    await mkdir(dirname(outputPath), { recursive: true });
    const stages = [
      { name: 'source', stream: source.stream },
      { name: 'lineSplitter', stream: createLineSplitter() },
      { name: 'jsonParser', stream: createJsonParser(counters) },
      { name: 'filter', stream: createFilterStage(predicate, counters) },
      { name: 'plugins', stream: createPluginStage(pluginPlan.plugins) },
      { name: 'stringifier', stream: createNdjsonStringifier(streamBytes) },
      { name: 'destination', stream: createWriteStream(outputPath) },
    ];
    closeTracker = trackStageCloses(stages);

    await pipeline(...stages.map((stage) => stage.stream));
  } catch (error) {
    status = 'failed';
    errorMessage = error.message;
    errorCode = error.code ?? null;
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
        plugins: {
          config: pluginPlan.config,
          executionOrder: ['filter', ...pluginPlan.executionOrder, 'stringify'],
        },
        errorMessage,
      },
    });
    report.pipelineStatus = status;
    report.completed = status === 'completed';
    report.errorCode = errorCode;
    report.stageCloses = closeTracker.snapshot();

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
