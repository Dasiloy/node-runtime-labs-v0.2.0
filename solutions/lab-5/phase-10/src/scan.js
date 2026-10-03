import { lstat, mkdir, readlink, realpath, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hashFile } from './hash.js';

export const DEFAULT_IGNORES = new Set(['.git', 'node_modules', '.cache', 'reports']);

export function toPosixRelative(root, absolutePath) {
  const relative = path.relative(root, absolutePath);
  return relative ? relative.split(path.sep).join('/') : '.';
}

export function fromPosixRelative(root, relativePath) {
  if (relativePath === '.') return root;
  return path.join(root, ...relativePath.split('/'));
}

export function shouldIgnoreRelative(relativePath) {
  const [firstPart] = relativePath.split('/');
  return DEFAULT_IGNORES.has(firstPart);
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

function typeFromDirent(entry) {
  if (entry.isFile()) return 'file';
  if (entry.isDirectory()) return 'directory';
  if (entry.isSymbolicLink()) return 'symlink';
  if (entry.isFIFO()) return 'fifo';
  if (entry.isSocket()) return 'socket';
  if (entry.isBlockDevice()) return 'blockDevice';
  if (entry.isCharacterDevice()) return 'characterDevice';
  return 'unknown';
}

function permissionsFromMode(mode) {
  return `0${(mode & 0o777).toString(8).padStart(3, '0')}`;
}

export function metadataFromStats(stats) {
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

function compactError(error, phase, relativePath) {
  return {
    path: relativePath,
    code: error?.code ?? 'UNKNOWN',
    message: error?.message ?? String(error),
    phase
  };
}

async function mapLimit(items, limit, worker) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index], index);
    }
  });

  await Promise.all(workers);
}

function pushError(inventory, error, phase, relativePath) {
  inventory.counts.errors += 1;
  inventory.errors.push(compactError(error, phase, relativePath));
}

async function attachLinkTarget(record, absolutePath, inventory) {
  try {
    record.linkTarget = await readlink(absolutePath);
  } catch (error) {
    pushError(inventory, error, 'metadata', record.path);
  }
}

async function attachFollowedTarget(record, absolutePath, inventory, visitedRealpaths) {
  try {
    const targetRealpath = await realpath(absolutePath);
    record.targetRealpath = targetRealpath;

    if (visitedRealpaths.has(targetRealpath)) {
      inventory.skipped.push({
        path: record.path,
        kind: 'symlink',
        action: 'follow',
        reason: 'symlink-cycle'
      });
      return;
    }

    const targetStats = await stat(absolutePath);
    record.targetMetadata = metadataFromStats(targetStats);

    if (record.targetMetadata.type !== 'file') {
      inventory.skipped.push({
        path: record.path,
        kind: record.targetMetadata.type,
        action: 'hash',
        reason: 'followed-target-not-regular-file'
      });
      return;
    }

    const hash = await hashFile(absolutePath);
    record.hashAlgorithm = hash.algorithm;
    record.hash = hash.digest;
    record.hashBytes = hash.bytes;
  } catch (error) {
    const phase = error?.code === 'ELOOP' ? 'metadata' : 'hash';
    pushError(inventory, error, phase, record.path);
    inventory.skipped.push({
      path: record.path,
      kind: 'symlink',
      action: 'follow',
      reason: error?.code === 'ELOOP' ? 'symlink-cycle' : 'follow-failed'
    });
  }
}

async function attachMetadata(record, absolutePath, inventory) {
  try {
    const stats = await lstat(absolutePath);
    Object.assign(record, metadataFromStats(stats));

    if (record.type === 'symlink') {
      await attachLinkTarget(record, absolutePath, inventory);
    }
  } catch (error) {
    pushError(inventory, error, 'metadata', record.path);
  }
}

export async function scanTree(root, options = {}) {
  const absoluteRoot = path.resolve(root);
  const inventory = {
    root: absoluteRoot,
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    options: {
      metadata: Boolean(options.metadata),
      hash: Boolean(options.hash),
      followSymlinks: Boolean(options.followSymlinks)
    },
    counts: {
      files: 0,
      directories: 0,
      ignored: 0,
      skipped: 0,
      errors: 0
    },
    files: [],
    directories: [],
    ignored: [],
    skipped: [],
    errors: [],
    notes: []
  };
  const visitedRealpaths = new Set();

  async function walk(directory, logicalPath = '.') {
    inventory.counts.directories += 1;

    if (options.metadata || options.hash) {
      const record = { path: logicalPath };
      await attachMetadata(record, directory, inventory);
      inventory.directories.push(record);
    }

    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      pushError(inventory, error, 'scan', logicalPath);
      return;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = logicalPath === '.' ? entry.name : `${logicalPath}/${entry.name}`;

      if (shouldIgnoreRelative(relativePath)) {
        inventory.counts.ignored += 1;
        inventory.ignored.push({
          path: relativePath,
          reason: 'default-ignore'
        });
        continue;
      }

      if (entry.isDirectory()) {
        await walk(absolutePath, relativePath);
        continue;
      }

      const entryType = typeFromDirent(entry);
      const record = { path: relativePath };

      if (options.metadata || options.hash || entryType !== 'file') {
        await attachMetadata(record, absolutePath, inventory);
      }

      if (entry.isSymbolicLink()) {
        inventory.counts.files += 1;

        if (!options.followSymlinks) {
          inventory.skipped.push({
            path: relativePath,
            kind: 'symlink',
            action: 'follow',
            reason: 'follow-symlinks-disabled'
          });
        } else {
          await attachFollowedTarget(record, absolutePath, inventory, visitedRealpaths);
        }

        inventory.files.push(record);
        continue;
      }

      if (entry.isFile()) {
        inventory.counts.files += 1;
        if (!record.type && options.hash) {
          record.type = 'file';
        }
        inventory.files.push(record);
        continue;
      }

      inventory.skipped.push({
        path: relativePath,
        kind: record.type ?? entryType,
        action: 'scan',
        reason: 'unsupported-file-type'
      });
    }
  }

  try {
    visitedRealpaths.add(await realpath(absoluteRoot));
  } catch {
    // The caller validates the root. A later readdir/lstat error carries the evidence.
  }

  await walk(absoluteRoot);

  if (options.hash) {
    const targets = inventory.files
      .filter((record) => !record.hash && (record.type === 'file' || record.type === undefined))
      .map((record) => ({
        record,
        absolutePath: fromPosixRelative(absoluteRoot, record.path)
      }));

    await mapLimit(targets, options.hashConcurrency ?? 8, async ({ record, absolutePath }) => {
      try {
        const hash = await hashFile(absolutePath);
        record.hashAlgorithm = hash.algorithm;
        record.hash = hash.digest;
        record.hashBytes = hash.bytes;
      } catch (error) {
        pushError(inventory, error, 'hash', record.path);
      }
    });

    for (const record of inventory.files) {
      if (record.type && record.type !== 'file' && record.type !== 'symlink') {
        inventory.skipped.push({
          path: record.path,
          kind: record.type,
          action: 'hash',
          reason: 'non-regular-file'
        });
      }
    }
  }

  inventory.counts.skipped = inventory.skipped.length;
  inventory.files.sort((left, right) => left.path.localeCompare(right.path));
  inventory.directories.sort((left, right) => left.path.localeCompare(right.path));
  inventory.ignored.sort((left, right) => left.path.localeCompare(right.path));
  inventory.skipped.sort((left, right) => left.path.localeCompare(right.path));

  if (process.platform === 'win32') {
    inventory.notes.push({
      kind: 'platform',
      message: 'Windows symlink and permission behavior can require elevated privileges.'
    });
  }

  if (options.reportPath) {
    await mkdir(path.dirname(options.reportPath), { recursive: true });
    await writeFile(options.reportPath, `${JSON.stringify(inventory, null, 2)}\n`);
  }

  return inventory;
}
