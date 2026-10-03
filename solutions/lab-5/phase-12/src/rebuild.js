import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hashFile } from './hash.js';

export const BUILDER_VERSION = 'lab-5-builder-v1';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function outputNameForPath(sourcePath) {
  return `${sourcePath.replaceAll('/', '__')}.json`;
}

async function writeFileAtomic(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`
  );
  await writeFile(tempPath, data);
  await rename(tempPath, filePath);
}

function ensureBuildCache(cache) {
  const buildCache = cache ?? {};
  buildCache.version ??= 1;
  buildCache.builderVersion = BUILDER_VERSION;
  buildCache.entries ??= {};
  return buildCache;
}

function inputFingerprint(record) {
  return {
    inputHash: record.hash ?? null,
    inputMetadata: {
      size: record.size ?? null,
      mtimeMs: record.mtimeMs ?? null,
      mode: record.mode ?? null,
      identity: record.identity ?? null,
      type: record.type ?? null
    }
  };
}

async function validBuildCacheHit(entry, record, reportsDir) {
  if (!entry || entry.builderVersion !== BUILDER_VERSION) {
    return false;
  }

  const fingerprint = inputFingerprint(record);
  if (entry.inputHash !== fingerprint.inputHash) {
    return false;
  }

  if (JSON.stringify(entry.inputMetadata) !== JSON.stringify(fingerprint.inputMetadata)) {
    return false;
  }

  try {
    await stat(path.resolve(reportsDir, entry.outputPath));
    const outputHash = await hashFile(path.resolve(reportsDir, entry.outputPath));
    return outputHash.digest === entry.outputHash;
  } catch {
    return false;
  }
}

function currentRecordByPath(inventory) {
  return new Map((inventory.files ?? []).map((record) => [record.path, record]));
}

function changedPathSet(diff) {
  return new Set([
    ...diff.added.map((entry) => entry.path),
    ...diff.changed.map((entry) => entry.path)
  ]);
}

export async function rebuildFromDiff({
  job,
  diff,
  currentInventory,
  buildCache,
  reportsDir,
  reason,
  rebuildDelayMs = 0
}) {
  const startedAt = new Date().toISOString();
  const cache = ensureBuildCache(buildCache);
  const records = currentRecordByPath(currentInventory);
  const changedPaths = changedPathSet(diff);
  const deletedPaths = new Set(diff.deleted.map((entry) => entry.path));
  const allCandidatePaths = new Set([
    ...job.paths,
    ...diff.unchanged
  ]);
  const summary = {
    jobId: job.id,
    reason,
    startedAt,
    finishedAt: null,
    cacheHits: [],
    cacheMisses: [],
    rebuilt: [],
    skipped: [],
    deleted: [],
    failed: [],
    rebuildDelayMs
  };

  for (const sourcePath of [...allCandidatePaths].sort()) {
    if (deletedPaths.has(sourcePath)) {
      const entry = cache.entries[sourcePath];
      if (entry?.outputPath) {
        await rm(path.resolve(reportsDir, entry.outputPath), { force: true }).catch((error) => {
          summary.failed.push({
            path: sourcePath,
            code: error?.code ?? 'UNKNOWN',
            message: error?.message ?? String(error),
            phase: 'rebuild'
          });
        });
      }
      delete cache.entries[sourcePath];
      summary.deleted.push(sourcePath);
      continue;
    }

    const record = records.get(sourcePath);
    if (!record) {
      continue;
    }

    const regular = record.type === 'file' || (record.type === 'symlink' && record.targetMetadata?.type === 'file');
    if (!regular) {
      summary.skipped.push({
        path: sourcePath,
        reason: record.type === 'symlink' ? 'symlink-target-not-built' : 'non-regular-file'
      });
      continue;
    }

    const hit = await validBuildCacheHit(cache.entries[sourcePath], record, reportsDir);
    if (hit && !changedPaths.has(sourcePath)) {
      summary.cacheHits.push(sourcePath);
      continue;
    }

    summary.cacheMisses.push({
      path: sourcePath,
      reason: changedPaths.has(sourcePath) ? 'changed-input' : 'missing-or-invalid-output'
    });

    const outputPath = path.posix.join('build-output', outputNameForPath(sourcePath));
    const outputAbsolutePath = path.resolve(reportsDir, outputPath);
    const payload = {
      sourcePath,
      builtAt: new Date().toISOString(),
      builderVersion: BUILDER_VERSION,
      inputHash: record.hash ?? null,
      inputMetadata: inputFingerprint(record).inputMetadata
    };

    try {
      if (rebuildDelayMs > 0) {
        await sleep(rebuildDelayMs);
      }
      await writeFileAtomic(outputAbsolutePath, `${JSON.stringify(payload, null, 2)}\n`);
      const outputHash = await hashFile(outputAbsolutePath);
      cache.entries[sourcePath] = {
        ...inputFingerprint(record),
        outputPath,
        outputHash: outputHash.digest,
        builtAt: payload.builtAt,
        builderVersion: BUILDER_VERSION
      };
      summary.rebuilt.push(sourcePath);
    } catch (error) {
      summary.failed.push({
        path: sourcePath,
        code: error?.code ?? 'UNKNOWN',
        message: error?.message ?? String(error),
        phase: 'rebuild'
      });
    }
  }

  summary.finishedAt = new Date().toISOString();
  return summary;
}

export async function warmBuildCache({ currentInventory, buildCache, reportsDir }) {
  const files = currentInventory.files
    .filter((record) => record.type === 'file' || (record.type === 'symlink' && record.targetMetadata?.type === 'file'))
    .map((record) => record.path);
  const diff = {
    added: files.map((filePath) => ({ path: filePath })),
    changed: [],
    deleted: [],
    unchanged: []
  };

  return rebuildFromDiff({
    job: {
      id: 'warmup-1',
      paths: files,
      createdAt: new Date().toISOString(),
      status: 'running'
    },
    diff,
    currentInventory,
    buildCache,
    reportsDir,
    reason: 'initial-build-cache-warmup'
  });
}

export async function appendJsonLine(filePath, record) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(record)}\n`, { flag: 'a' });
}

export async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}
