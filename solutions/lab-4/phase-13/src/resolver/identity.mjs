import fs from 'node:fs/promises';
import path from 'node:path';

async function readSymlinkFixtureStatus() {
  try {
    const manifest = JSON.parse(await fs.readFile(path.resolve('fixtures/generated/fixture-manifest.json'), 'utf8'));
    return manifest.symlink ?? null;
  } catch {
    return null;
  }
}

export async function applyIdentityFields(report) {
  if (report.status !== 'resolved' || !path.isAbsolute(report.resolvedPath)) {
    return report;
  }

  report.symlinks = report.symlinks ?? [];
  report.packageLookupPath = report.packageRoot ?? report.resolvedPath;
  report.realPath = await fs.realpath(report.resolvedPath);
  report.cacheIdentityPath = report.preserveSymlinks ? report.resolvedPath : report.realPath;
  report.symlinkFixture = await readSymlinkFixtureStatus();

  if (report.symlinkFixture?.requested && !report.symlinkFixture.created) {
    report.symlinks.push({
      type: 'symlink-fixture-skipped',
      evidence: report.symlinkFixture,
    });
  }

  if (report.realPath !== report.resolvedPath) {
    report.symlinks.push({
      type: 'resolved-path-realpath-differ',
      resolvedPath: report.resolvedPath,
      realPath: report.realPath,
    });
  }

  if (report.realPath !== report.cacheIdentityPath) {
    report.symlinks.push({
      type: 'preserve-symlinks-identity',
      resolvedPath: report.resolvedPath,
      realPath: report.realPath,
      cacheIdentityPath: report.cacheIdentityPath,
    });
  }

  return report;
}
