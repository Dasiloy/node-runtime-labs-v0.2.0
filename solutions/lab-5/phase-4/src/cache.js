import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const CACHE_VERSION = 1;

export async function loadCache(cachePath) {
  try {
    const raw = await readFile(cachePath, 'utf8');
    const data = JSON.parse(raw);
    return { loaded: true, data };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { loaded: false, data: null };
    }

    throw new Error(`Failed to load cache ${cachePath}: ${error.message}`, {
      cause: error
    });
  }
}

export function inventoryToCache(inventory, options = {}, previous = null) {
  const filesByPath = Object.fromEntries(
    inventory.files.map((record) => [record.path, record])
  );

  return {
    version: CACHE_VERSION,
    root: inventory.root,
    createdAt: previous?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    options: {
      metadata: Boolean(options.metadata),
      hash: Boolean(options.hash),
      followSymlinks: Boolean(options.followSymlinks)
    },
    filesByPath
  };
}

export async function saveCacheAtomic(cachePath, inventory, options = {}, previous = null) {
  const cache = inventoryToCache(inventory, options, previous);
  const directory = path.dirname(cachePath);
  await mkdir(directory, { recursive: true });

  const tempPath = path.join(
    directory,
    `.${path.basename(cachePath)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`
  );

  await writeFile(tempPath, `${JSON.stringify(cache, null, 2)}\n`);
  await rename(tempPath, cachePath);
  return cache;
}
