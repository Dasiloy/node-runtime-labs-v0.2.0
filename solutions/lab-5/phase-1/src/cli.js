#!/usr/bin/env node

import { stat } from 'node:fs/promises';
import path from 'node:path';
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

  const flags = {};
  const positionals = [];

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === '--help' || arg === '-h') {
      flags.help = true;
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
    const inventory = await scanTree(watched.absolutePath, { reportPath });
    console.log(`scanned ${watched.displayPath}: ${inventory.counts.files} files, ${inventory.counts.directories} directories, ${inventory.counts.ignored} ignored, ${inventory.counts.errors} errors`);
    return;
  }

  console.log(`watch placeholder: ${watched.displayPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
