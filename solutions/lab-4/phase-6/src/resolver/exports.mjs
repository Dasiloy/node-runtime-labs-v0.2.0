import path from 'node:path';
import { addError, addMetadata } from './trace.mjs';
import { resolveAsDirectory, resolveAsFile } from './path-resolution.mjs';

function availableExportKeys(exportsField) {
  if (typeof exportsField === 'string' || exportsField === null) {
    return ['.'];
  }
  if (exportsField && typeof exportsField === 'object' && !Array.isArray(exportsField)) {
    return Object.keys(exportsField);
  }
  return [];
}

function targetInsidePackage(packageRoot, targetPath) {
  const relative = path.relative(packageRoot, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function selectExportTarget(exportsField, subpath) {
  if (typeof exportsField === 'string' || exportsField === null) {
    return subpath === '.'
      ? { matchedKey: '.', target: exportsField }
      : { blocked: true, reason: 'missing-export' };
  }

  if (!exportsField || typeof exportsField !== 'object' || Array.isArray(exportsField)) {
    return { invalid: true, reason: 'invalid-exports-shape' };
  }

  if (Object.hasOwn(exportsField, subpath)) {
    return {
      matchedKey: subpath,
      target: exportsField[subpath],
    };
  }

  return { blocked: true, reason: 'missing-export' };
}

export async function resolveExports(report, packageRoot, packageJson, parsed) {
  const normalizedSubpath = parsed.packageSubpath === '.' ? '.' : parsed.packageSubpath;
  report.exportSubpath = normalizedSubpath;
  report.availableExports = availableExportKeys(packageJson.exports);

  addMetadata(report, {
    kind: 'exports',
    result: 'present',
    packageRoot,
    requestedSubpath: parsed.packageSubpath,
    normalizedSubpath,
    availableExports: report.availableExports,
  });

  const selected = selectExportTarget(packageJson.exports, normalizedSubpath);
  if (selected.blocked || selected.target === null) {
    addError(report, {
      code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
      packageRoot,
      requestedSubpath: normalizedSubpath,
      availableExports: report.availableExports,
      message: `${parsed.packageName} does not export ${normalizedSubpath}`,
    });
    return null;
  }

  if (selected.invalid) {
    addError(report, {
      code: 'invalid-exports',
      packageRoot,
      reason: selected.reason,
      message: `Invalid exports field in ${parsed.packageName}`,
    });
    return null;
  }

  addMetadata(report, {
    kind: 'exports-match',
    result: 'selected',
    packageRoot,
    matchedKey: selected.matchedKey,
    target: selected.target,
  });

  if (typeof selected.target !== 'string' || !selected.target.startsWith('./')) {
    addError(report, {
      code: 'invalid-export-target',
      packageRoot,
      matchedKey: selected.matchedKey,
      target: selected.target,
      message: `Export target for ${selected.matchedKey} must be a package-root-relative string`,
    });
    return null;
  }

  const targetPath = path.resolve(packageRoot, selected.target);
  if (!targetInsidePackage(packageRoot, targetPath)) {
    addError(report, {
      code: 'invalid-export-target',
      packageRoot,
      matchedKey: selected.matchedKey,
      target: selected.target,
      message: `Export target for ${selected.matchedKey} escapes the package root`,
    });
    return null;
  }

  const resolved = await resolveAsFile(report, targetPath) ?? await resolveAsDirectory(report, targetPath);
  if (!resolved) {
    addError(report, {
      code: 'missing-export-target',
      packageRoot,
      matchedKey: selected.matchedKey,
      target: selected.target,
      message: `Export target ${selected.target} did not resolve to a file`,
    });
    return null;
  }

  report.entryField = 'exports';
  report.matchedExport = {
    key: selected.matchedKey,
    target: selected.target,
  };
  return resolved;
}
