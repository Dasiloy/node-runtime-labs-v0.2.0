import { loadTaskFile } from './load-tasks.js';
import { runScheduledTasks } from './scheduler.js';

const knownFlags = new Set([
  "--help",
  "--concurrency",
  "--mode",
  "--timeout"
]);
const valueFlags = new Set([
  "--concurrency",
  "--mode",
  "--timeout"
]);

function printHelp() {
  console.log([
    'Async Task Runtime',
    '',
    'Usage:',
    '  npm run tasks -- <task-file> [flags]',
    '',
    'Default paths:',
    '  tasks/    task definitions',
    '  state/    run snapshots',
    '  reports/  run reports',
    '',
    'Flags:',
    '  --concurrency <n>',
    '  --mode <all|allSettled|race|any>',
    '  --timeout <ms>',
    '  --help'
  ].join('\n'));
}

function parsePositiveInteger(value, flag, { allowZero = false } = {}) {
  if (value === undefined || value.startsWith('--')) {
    throw new Error(flag + ' requires a value');
  }
  const parsed = Number(value);
  const min = allowZero ? 0 : 1;
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(flag + ' must be an integer >= ' + min);
  }
  return parsed;
}

function parseArgs(args) {
  const options = {
    concurrency: 1,
    mode: 'allSettled',
    defaultTimeoutMs: null,
    cancelAfterMs: null,
    resume: false,
    status: false,
    progress: false,
    logEvents: false,
    shutdownMode: 'cancel'
  };
  const positional = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith('--')) {
      if (!knownFlags.has(arg)) {
        throw new Error('Unknown flag: ' + arg);
      }
      if (valueFlags.has(arg)) {
        const value = args[index + 1];
        if (arg === '--concurrency') options.concurrency = parsePositiveInteger(value, arg);
        if (arg === '--mode') {
          if (!['all', 'allSettled', 'race', 'any'].includes(value)) {
            throw new Error('--mode must be one of: all, allSettled, race, any');
          }
          options.mode = value;
        }
        if (arg === '--timeout') options.defaultTimeoutMs = parsePositiveInteger(value, arg);
        index += 1;
        continue;
      }
      continue;
    }
    positional.push(arg);
  }
  return { options, positional };
}


try {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0 || rawArgs.includes('--help')) {
    printHelp();
  } else {
    const { options, positional } = parseArgs(rawArgs);
    {
      const taskFilePath = positional[0];
      if (!taskFilePath) {
        throw new Error('Missing task file path');
      }
      const taskFile = await loadTaskFile(taskFilePath);
      console.log('Loaded ' + taskFile.tasks.length + ' task(s): ' + taskFile.tasks.map((task) => task.id).join(', '));

      const report = await runScheduledTasks(taskFile, {
        concurrency: options.concurrency,
        mode: options.mode,
        defaultTimeoutMs: options.defaultTimeoutMs,
        reportDir: 'reports',
        stateDir: 'state'
      });

      console.log('Wrote reports/latest.json');
      if (report.run.status !== 'success') {
        process.exitCode = 1;
      }
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

