import { lstat, mkdir, readlink, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_IGNORES = new Set(['.git', 'node_modules', '.cache', 'reports']);

export function toPosixRelative(root, absolutePath) {
  const relative = path.relative(root, absolutePath);
  return relative ? relative.split(path.sep).join('/') : '.';
}

export function classifyStats(stats) {
  if (stats.isFile()) return 'file';
  if (stats.isDirectory()) return 'directory';
  if (stats.isSymbolicLink()) return 'symlink';
  if (stats.isFIFO()) return 'fifo';
  if (stats.isSocket()) return 'socket';
  if (stats.isBlockDevice()) return 'blockDevice';
  if (stats.isCharacterDevice()) return 'characterDevice';
  return 'unknown';
}

function permissionsFromMode(mode) {
  return `0${(mode & 0o777).toString(8)}`;
}

function metadataFromStats(stats) {
  return {
    type: classifyStats(stats),
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    ctimeMs: stats.ctimeMs,
    birthtimeMs: stats.birthtimeMs,
    mode: stats.mode,
    permissions: permissionsFromMode(stats.mode),
    dev: stats.dev,
    ino: stats.ino,
    nlink: stats.nlink,
    identity: `${stats.dev}:${stats.ino}`
  };
}

async function addMetadata(record, absoluteRoot, absolutePath, inventory) {
  try {
    const stats = await lstat(absolutePath);
    Object.assign(record, metadataFromStats(stats));

    if (record.type === 'symlink') {
      try {
        record.linkTarget = await readlink(absolutePath);
      } catch (error) {
        inventory.counts.errors += 1;
        inventory.errors.push({
          path: toPosixRelative(absoluteRoot, absolutePath),
          code: error.code ?? 'UNKNOWN',
          message: error.message,
          phase: 'metadata'
        });
      }
    }
  } catch (error) {
    inventory.counts.errors += 1;
    inventory.errors.push({
      path: toPosixRelative(absoluteRoot, absolutePath),
      code: error.code ?? 'UNKNOWN',
      message: error.message,
      phase: 'metadata'
    });
  }
}

export async function scanTree(root, options = {}) {
  const absoluteRoot = path.resolve(root);
  const inventory = {
    root: absoluteRoot,
    generatedAt: new Date().toISOString(),
    counts: {
      files: 0,
      directories: 0,
      ignored: 0,
      errors: 0
    },
    files: [],
    directories: [],
    ignored: [],
    errors: []
  };

  async function walk(directory) {
    inventory.counts.directories += 1;

    if (options.metadata) {
      const record = { path: toPosixRelative(absoluteRoot, directory) };
      await addMetadata(record, absoluteRoot, directory, inventory);
      inventory.directories.push(record);
    }

    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      inventory.counts.errors += 1;
      inventory.errors.push({
        path: toPosixRelative(absoluteRoot, directory),
        code: error.code ?? 'UNKNOWN',
        message: error.message,
        phase: 'scan'
      });
      return;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = toPosixRelative(absoluteRoot, absolutePath);

      if (DEFAULT_IGNORES.has(entry.name)) {
        inventory.counts.ignored += 1;
        inventory.ignored.push({
          path: relativePath,
          reason: 'default-ignore'
        });
        continue;
      }

      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (entry.isFile() || entry.isSymbolicLink()) {
        inventory.counts.files += 1;
        const record = { path: relativePath };

        if (options.metadata) {
          await addMetadata(record, absoluteRoot, absolutePath, inventory);
        }

        inventory.files.push(record);
      }
    }
  }

  await walk(absoluteRoot);
  inventory.files.sort((left, right) => left.path.localeCompare(right.path));
  inventory.directories.sort((left, right) => left.path.localeCompare(right.path));
  inventory.ignored.sort((left, right) => left.path.localeCompare(right.path));

  if (options.reportPath) {
    await mkdir(path.dirname(options.reportPath), { recursive: true });
    await writeFile(`${options.reportPath}`, `${JSON.stringify(inventory, null, 2)}\n`);
  }

  return inventory;
}
