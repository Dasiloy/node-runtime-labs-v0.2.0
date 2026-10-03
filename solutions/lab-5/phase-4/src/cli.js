#!/usr/bin/env node

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { loadCache, saveCacheAtomic } from './cache.js';
import { printHelp } from './help.js';
import { scanTree } from './scan.js';

const commands = new Set(['scan', 'watch']);

function parseArgv(argv) {
  const [command, ...rest] = argv;

  if (!command || command === '--help' || command === '-h') {
    return { command: 'help', directory: 'watched', flags: {} };
  }

  if (!commands.has(command)) {
    throw new Error(`Unknown command: ${command}`);
  }

  const flags = {
    cache: '.cache/index.json'
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

    if (arg === '--no-cache') {
      flags.noCache = true;
      continue;
    }

    if (arg === '--cache') {
      const value = rest[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('--cache requires a path');
      }
      flags.cache = value;
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

async function main() {
  const parsed = parseArgv(process.argv.slice(2));

  if (parsed.command === 'help' || parsed.flags.help) {
    printHelp();
    return;
  }

  const watched = await resolveWatchedDirectory(parsed.directory);

  if (parsed.command === 'scan') {
    const reportPath = path.join(process.cwd(), 'reports', 'scan.json');
    const cachePath = path.resolve(process.cwd(), parsed.flags.cache);
    const cacheInfo = {
      path: path.relative(process.cwd(), cachePath) || path.basename(cachePath),
      loaded: false,
      loadMs: 0,
      saveMs: 0,
      disabled: Boolean(parsed.flags.noCache)
    };

    let previousCache = null;
    if (!parsed.flags.noCache) {
      const loadStart = performance.now();
      const loaded = await loadCache(cachePath);
      cacheInfo.loadMs = performance.now() - loadStart;
      cacheInfo.loaded = loaded.loaded;
      previousCache = loaded.data;
    }

    const inventory = await scanTree(watched.absolutePath, {
      metadata: parsed.flags.metadata,
      hash: parsed.flags.hash
    });

    if (!parsed.flags.noCache) {
      const saveStart = performance.now();
      await saveCacheAtomic(cachePath, inventory, parsed.flags, previousCache);
      cacheInfo.saveMs = performance.now() - saveStart;
    }

    inventory.cache = cacheInfo;
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(inventory, null, 2)}\n`);
    console.log(`scanned ${watched.displayPath}: ${inventory.counts.files} files, ${inventory.counts.directories} directories, ${inventory.counts.ignored} ignored, ${inventory.counts.errors} errors`);
    return;
  }

  console.log(`watch placeholder: ${watched.displayPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
