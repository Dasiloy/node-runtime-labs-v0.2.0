#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { appendFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateWatchReport } from './report.js';
import { startWatchSession } from './watch.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function clearGeneratedReports(reportsDir) {
  const generated = [
    'scan.json',
    'diff.json',
    'events.jsonl',
    'logical-events.json',
    'batches.jsonl',
    'queue.jsonl',
    'rebuilds.jsonl',
    'watch-state.json',
    'shutdown.json',
    'watch-report.md',
    'watch-report.html',
    'build-output'
  ];

  await mkdir(reportsDir, { recursive: true });
  await Promise.all(generated.map((name) => rm(path.join(reportsDir, name), {
    recursive: true,
    force: true
  })));
}

async function atomicReplace(target, content) {
  const directory = path.dirname(target);
  const base = path.basename(target);
  const tempPath = path.join(directory, `.${base}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);
  await writeFile(tempPath, content, { flag: 'wx' });
  await rename(tempPath, target);
}

async function main() {
  const root = path.resolve(process.cwd(), 'watched');
  const reportsDir = path.resolve(process.cwd(), 'reports');

  await clearGeneratedReports(reportsDir);
  await rm(root, { recursive: true, force: true });
  await mkdir(path.join(root, 'nested'), { recursive: true });
  await writeFile(path.join(root, 'a.txt'), 'alpha\n');
  await writeFile(path.join(root, 'b.txt'), 'bravo\n');
  await writeFile(path.join(root, 'nested', 'c.txt'), 'charlie\n');

  const session = await startWatchSession({
    root,
    flags: {
      debounce: 150,
      concurrency: 2,
      cache: '.cache/index.json'
    },
    registerSignals: false
  });

  await sleep(250);
  await appendFile(path.join(root, 'a.txt'), 'edited\n');
  await writeFile(path.join(root, 'new.txt'), 'new file\n');
  await atomicReplace(path.join(root, 'nested', 'c.txt'), 'atomic replacement\n');
  await rm(path.join(root, 'b.txt'), { force: true });
  await sleep(900);

  await session.stop({ reason: 'demo-complete' });
  await session.done;
  await generateWatchReport({ reportsDir });
  console.log('wrote reports/watch-report.md');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
