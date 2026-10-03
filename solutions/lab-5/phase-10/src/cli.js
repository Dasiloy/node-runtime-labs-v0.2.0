#!/usr/bin/env node

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { loadCache, saveCacheAtomic } from './cache.js';
import { diffInventories } from './diff.js';
import { printHelp } from './help.js';
import { scanTree } from './scan.js';
import { startWatchSession } from './watch.js';

const commands = new Set(['scan', 'watch']);

function readValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith('-')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseInteger(value, flag, { min = Number.MIN_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(`${flag} must be an integer >= ${min}`);
  }
  return parsed;
}

function parseArgv(argv) {
  const [command, ...rest] = argv;

  if (!command || command === '--help' || command === '-h') {
    return { command: 'help', directory: 'watched', flags: {} };
  }

  if (!commands.has(command)) {
    throw new Error(`Unknown command: ${command}`);
  }

  const flags = {
    cache: '.cache/index.json',
    pollInterval: 1000,
    debounce: 150,
    concurrency: 2,
    rebuildDelayMs: 25
  };
  const positionals = [];

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === '--help' || arg === '-h') {
      flags.help = true;
      continue;
    }
    if (arg === '--metadata') {
      flags.metadata = true;
      continue;
    }
    if (arg === '--hash') {
      flags.hash = true;
      continue;
    }
    if (arg === '--poll') {
      flags.poll = true;
      continue;
    }
    if (arg === '--poll-interval') {
      flags.pollInterval = parseInteger(readValue(rest, index, arg), arg, { min: 100 });
      index += 1;
      continue;
    }
    if (arg === '--debounce') {
      flags.debounce = parseInteger(readValue(rest, index, arg), arg, { min: 0 });
      index += 1;
      continue;
    }
    if (arg === '--concurrency') {
      flags.concurrency = parseInteger(readValue(rest, index, arg), arg, { min: 1 });
      index += 1;
      continue;
    }
    if (arg === '--rebuild-delay-ms') {
      flags.rebuildDelayMs = parseInteger(readValue(rest, index, arg), arg, { min: 0 });
      index += 1;
      continue;
    }
    if (arg === '--follow-symlinks') {
      flags.followSymlinks = true;
      continue;
    }
    if (arg === '--no-cache') {
      flags.noCache = true;
      continue;
    }
    if (arg === '--cache') {
      flags.cache = readValue(rest, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown flag: ${arg}`);
    }

    positionals.push(arg);
  }

  if (positionals.length > 1) {
    throw new Error(`Expected one directory argument, received ${positionals.length}`);
  }

  return {
    command,
    directory: positionals[0] ?? 'watched',
    flags
  };
}

async function resolveWatchedDirectory(input) {
  const absolutePath = path.resolve(process.cwd(), input);
  const entry = await stat(absolutePath).catch((error) => {
    if (error?.code === 'ENOENT') {
      throw new Error(`Invalid directory: ${input} does not exist`);
    }
    throw error;
  });

  if (!entry.isDirectory()) {
    throw new Error(`Invalid directory: ${input} is not a directory`);
  }

  return {
    absolutePath,
    displayPath: path.relative(process.cwd(), absolutePath) || '.'
  };
}

async function runScan(watched, flags) {
  const reportPath = path.join(process.cwd(), 'reports', 'scan.json');
  const diffPath = path.join(process.cwd(), 'reports', 'diff.json');
  const cachePath = path.resolve(process.cwd(), flags.cache);
  const cacheInfo = {
    path: path.relative(process.cwd(), cachePath) || path.basename(cachePath),
    loaded: false,
    loadMs: 0,
    saveMs: 0,
    disabled: Boolean(flags.noCache)
  };

  let previousCache = null;
  if (!flags.noCache) {
    const loadStart = performance.now();
    const loaded = await loadCache(cachePath);
    cacheInfo.loadMs = performance.now() - loadStart;
    cacheInfo.loaded = loaded.loaded;
    previousCache = loaded.data;
  }

  const inventory = await scanTree(watched.absolutePath, {
    metadata: flags.metadata,
    hash: flags.hash,
    followSymlinks: flags.followSymlinks
  });
  const diff = diffInventories(previousCache, inventory);

  if (!flags.noCache) {
    const saveStart = performance.now();
    await saveCacheAtomic(cachePath, inventory, flags, previousCache);
    cacheInfo.saveMs = performance.now() - saveStart;
  }

  inventory.cache = cacheInfo;
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(inventory, null, 2)}\n`);
  await writeFile(diffPath, `${JSON.stringify(diff, null, 2)}\n`);

  console.log(`scanned ${watched.displayPath}: ${inventory.counts.files} files, ${inventory.counts.directories} directories, ${inventory.counts.ignored} ignored, ${inventory.counts.errors} errors`);
  console.log(`diff: ${diff.counts.added} added, ${diff.counts.changed} changed, ${diff.counts.deleted} deleted, ${diff.counts.unchanged} unchanged`);
}

async function main() {
  const parsed = parseArgv(process.argv.slice(2));

  if (parsed.command === 'help' || parsed.flags.help) {
    printHelp();
    return;
  }

  const watched = await resolveWatchedDirectory(parsed.directory);

  if (parsed.command === 'scan') {
    await runScan(watched, parsed.flags);
    return;
  }

  const session = await startWatchSession({
    root: watched.absolutePath,
    flags: parsed.flags,
    registerSignals: true
  });
  await session.done;
  process.exitCode = session.exitCode;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
