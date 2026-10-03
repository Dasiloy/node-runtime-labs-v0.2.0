import { loadTaskFile } from './load-tasks.js';
import { TaskRuntime } from './runtime.js';
import { progressEvents } from './progress.js';
import { StateStore, countStatuses } from './state-store.js';

const knownFlags = new Set([
  "--help",
  "--concurrency",
  "--mode",
  "--timeout",
  "--cancel-after",
  "--resume",
  "--status",
  "--log-events",
  "--progress"
]);
const valueFlags = new Set([
  "--concurrency",
  "--mode",
  "--timeout",
  "--cancel-after"
]);

function printHelp() {
  console.log([
    'Async Task Runtime',
    '',
    'Usage:',
    '  npm run tasks -- <task-file> [flags]',
    '  npm run tasks -- --status',
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
    '  --cancel-after <ms>',
    '  --resume',
    '  --status',
    '  --log-events',
    '  --progress',
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
        if (arg === '--cancel-after') options.cancelAfterMs = parsePositiveInteger(value, arg, { allowZero: true });
        index += 1;
        continue;
      }
      if (arg === '--resume') options.resume = true;
      if (arg === '--status') options.status = true;
      if (arg === '--log-events') options.logEvents = true;
      if (arg === '--progress') options.progress = true;
      continue;
    }
    positional.push(arg);
  }
  return { options, positional };
}

async function printStatus(store) {
  const snapshot = await store.load();
  console.log('Run: ' + snapshot.runId);
  console.log('Status: ' + snapshot.status);
  console.log('Updated: ' + snapshot.updatedAt);
  console.log('Counts: ' + JSON.stringify(countStatuses(snapshot.tasksById)));
  const active = Object.entries(snapshot.tasksById)
    .filter(([, task]) => ['running', 'interrupted'].includes(task.status))
    .map(([taskId]) => taskId);
  if (active.length > 0) {
    console.log('Active or interrupted: ' + active.join(', '));
  }
}

async function printResume(store) {
  const snapshot = await store.load();
  let changed = false;
  const interruptedAt = new Date().toISOString();
  for (const task of Object.values(snapshot.tasksById)) {
    if (task.status === 'running') {
      task.status = 'interrupted';
      task.interruptedAt = interruptedAt;
      changed = true;
    }
  }
  if (changed) {
    snapshot.status = 'interrupted';
    snapshot.updatedAt = interruptedAt;
    await store.save(snapshot);
  }
  console.log('Resume inspection for run: ' + snapshot.runId);
  console.log('Counts: ' + JSON.stringify(countStatuses(snapshot.tasksById)));
}

try {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0 || rawArgs.includes('--help')) {
    printHelp();
  } else {
    const { options, positional } = parseArgs(rawArgs);
    const store = new StateStore({ filePath: 'state/run.json' });
    if (options.status) {
      await printStatus(store);
    } else if (options.resume) {
      await printResume(store);
    } else {

      const taskFilePath = positional[0];
      if (!taskFilePath) {
        throw new Error('Missing task file path');
      }
      const taskFile = await loadTaskFile(taskFilePath);
      console.log('Loaded ' + taskFile.tasks.length + ' task(s): ' + taskFile.tasks.map((task) => task.id).join(', '));

      const runtime = new TaskRuntime(taskFile, {
        options: {
          concurrency: options.concurrency,
          mode: options.mode,
          defaultTimeoutMs: options.defaultTimeoutMs,
          cancelAfterMs: options.cancelAfterMs,
          shutdownMode: options.shutdownMode,
          reportDir: 'reports',
          stateDir: 'state'
        }
      });

      if (options.logEvents) {
        for (const eventName of ['task:start', 'task:success', 'task:failure', 'task:retry', 'task:finish']) {
          runtime.on(eventName, (event) => {
            console.log('[event] ' + eventName + ' ' + event.taskId + ' ' + event.status);
          });
        }
      }
      let report;
      if (options.progress) {
        const progressStream = progressEvents(runtime);
        const runPromise = runtime.start();
        for await (const record of progressStream) {
          console.log('[progress] ' + record.type + ' ' + record.taskId + ' ' + record.status);
        }
        report = await runPromise;
      } else {
        report = await runtime.start();
      }

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

