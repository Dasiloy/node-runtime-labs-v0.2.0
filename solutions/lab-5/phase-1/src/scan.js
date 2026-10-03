import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_IGNORES = new Set(['.git', 'node_modules', '.cache', 'reports']);

export function toPosixRelative(root, absolutePath) {
  const relative = path.relative(root, absolutePath);
  return relative ? relative.split(path.sep).join('/') : '.';
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
    ignored: [],
    errors: []
  };

  async function walk(directory) {
    inventory.counts.directories += 1;

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
        inventory.files.push({ path: relativePath });
      }
    }
  }

  await walk(absoluteRoot);
  inventory.files.sort((left, right) => left.path.localeCompare(right.path));
  inventory.ignored.sort((left, right) => left.path.localeCompare(right.path));

  if (options.reportPath) {
    await mkdir(path.dirname(options.reportPath), { recursive: true });
    await writeFile(`${options.reportPath}`, `${JSON.stringify(inventory, null, 2)}\n`);
  }

  return inventory;
}
