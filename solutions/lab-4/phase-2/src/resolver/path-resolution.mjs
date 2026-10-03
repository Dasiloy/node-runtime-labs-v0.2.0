import fs from 'node:fs/promises';
import path from 'node:path';
import { addAttempt, addError, addMetadata, markResolved } from './trace.mjs';

const cjsExtensions = ['.js', '.json', '.node'];

export function isPathSpecifier(specifier) {
  return (
    specifier.startsWith('./') ||
    specifier.startsWith('../') ||
    specifier.startsWith('/') ||
    specifier === '.' ||
    specifier === '..'
  );
}

async function statIfExists(candidate) {
  try {
    return await fs.stat(candidate);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      return null;
    }
    throw error;
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { missing: true };
    }
    return { error };
  }
}

async function probeFile(report, candidate, reason) {
  const stat = await statIfExists(candidate);
  if (stat?.isFile()) {
    addAttempt(report, {
      path: candidate,
      kind: 'file',
      result: 'found',
      reason,
    });
    return candidate;
  }

  addAttempt(report, {
    path: candidate,
    kind: 'file',
    result: 'missing',
    reason,
  });
  return null;
}

export async function resolveAsFile(report, candidate) {
  const exact = await probeFile(report, candidate, 'exact-path');
  if (exact) {
    return exact;
  }

  for (const extension of cjsExtensions) {
    const found = await probeFile(report, `${candidate}${extension}`, `extension-probe:${extension}`);
    if (found) {
      return found;
    }
  }

  return null;
}

export async function resolveAsDirectory(report, candidate) {
  const stat = await statIfExists(candidate);
  if (!stat?.isDirectory()) {
    addAttempt(report, {
      path: candidate,
      kind: 'directory',
      result: 'missing',
      reason: 'not-a-directory',
    });
    return null;
  }

  addAttempt(report, {
    path: candidate,
    kind: 'directory',
    result: 'found',
    reason: 'directory-target',
  });

  const packageJsonPath = path.join(candidate, 'package.json');
  const packageJson = await readJson(packageJsonPath);
  if (packageJson.error) {
    addMetadata(report, {
      kind: 'package.json',
      path: packageJsonPath,
      result: 'invalid',
      reason: 'invalid-package-json',
      message: packageJson.error.message,
    });
    addError(report, {
      code: 'invalid-package-json',
      path: packageJsonPath,
      message: `Invalid package.json at ${packageJsonPath}`,
    });
    return null;
  }

  if (!packageJson.missing) {
    addMetadata(report, {
      kind: 'package.json',
      path: packageJsonPath,
      result: 'found',
    });

    if (typeof packageJson.main === 'string') {
      addMetadata(report, {
        kind: 'main',
        path: packageJsonPath,
        result: 'selected',
        value: packageJson.main,
      });
      const mainTarget = path.resolve(candidate, packageJson.main);
      const resolvedMain = await resolveAsFile(report, mainTarget) ?? await resolveAsDirectory(report, mainTarget);
      if (resolvedMain) {
        return resolvedMain;
      }
      addMetadata(report, {
        kind: 'main',
        path: mainTarget,
        result: 'invalid',
        reason: 'invalid-main-target',
      });
    }
  }

  for (const extension of cjsExtensions) {
    const indexPath = path.join(candidate, `index${extension}`);
    const found = await probeFile(report, indexPath, `directory-index:${extension}`);
    if (found) {
      return found;
    }
  }

  return null;
}

export async function resolvePathSpecifier(report) {
  const basePath = report.specifier.startsWith('/')
    ? path.resolve(report.specifier)
    : path.resolve(path.dirname(report.importer), report.specifier);

  const resolved = await resolveAsFile(report, basePath) ?? await resolveAsDirectory(report, basePath);
  if (resolved) {
    markResolved(report, resolved, { branch: 'path' });
    return report;
  }

  addError(report, {
    code: 'missing-file',
    specifier: report.specifier,
    importer: report.importer,
    message: `Unable to resolve path specifier ${report.specifier}`,
  });
  addError(report, {
    code: 'missing-directory-entry',
    specifier: report.specifier,
    importer: report.importer,
    message: `No file, extension probe, or directory entry matched ${report.specifier}`,
  });
  return report;
}
