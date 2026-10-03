import { mkdir, writeFile } from 'node:fs/promises';
import { loadTaskFile } from './load-tasks.js';
import { runTask } from './runner.js';

const knownFlags = new Set(['--help']);

function printHelp() {
  console.log('Usage: npm run tasks -- <task-file>');
}

function parseArgs(args) {
  const positional = [];
  for (const arg of args) {
    if (arg.startsWith('--')) {
      if (!knownFlags.has(arg)) {
        throw new Error('Unknown flag: ' + arg);
      }
      continue;
    }
    positional.push(arg);
  }
  return { positional };
}

async function writeReport(report) {
  await mkdir('reports', { recursive: true });
  await writeFile('reports/latest.json', JSON.stringify(report, null, 2) + '\n');
}

try {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    printHelp();
  } else {
    const parsed = parseArgs(args);
    const taskFile = await loadTaskFile(parsed.positional[0]);
    const results = [];

    for (const task of taskFile.tasks) {
      results.push(await runTask(task, { taskFileDir: taskFile.taskFileDir }));
    }

    await writeReport({
      taskFile: taskFile.filePath,
      taskCount: taskFile.tasks.length,
      tasks: results
    });

    if (results.some((result) => result.status === 'failed')) {
      process.exitCode = 1;
    }

    console.log('Wrote reports/latest.json');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
