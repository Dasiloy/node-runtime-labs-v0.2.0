import { loadTaskFile } from './load-tasks.js';

const knownFlags = new Set([
  '--help',
  '--concurrency',
  '--mode',
  '--cancel-after',
  '--resume',
  '--progress'
]);

const valueFlags = new Set(['--concurrency', '--mode', '--cancel-after']);

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
    '  --cancel-after <ms>',
    '  --resume',
    '  --progress',
    '  --help'
  ].join('\n'));
}

function parseArgs(args) {
  const positional = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg.startsWith('--')) {
      if (!knownFlags.has(arg)) {
        throw new Error('Unknown flag: ' + arg);
      }

      if (valueFlags.has(arg)) {
        index += 1;
      }

      continue;
    }

    positional.push(arg);
  }

  return { positional };
}

try {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    printHelp();
  } else {
    const parsed = parseArgs(args);
    const taskFilePath = parsed.positional[0];

    if (!taskFilePath) {
      printHelp();
    } else {
      const taskFile = await loadTaskFile(taskFilePath);
      console.log('Loaded ' + taskFile.tasks.length + ' task(s): ' + taskFile.tasks.map((task) => task.id).join(', '));
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
