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

export function activeConditionsFor(options) {
  const base = options.mode === 'import'
    ? ['node', 'import']
    : ['node', 'require', 'module-sync'];
  return [...base, ...options.conditions, 'default'];
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isExportsMap(value) {
  return isObject(value) && Object.keys(value).some((key) => key.startsWith('.'));
}

function targetInsidePackage(packageRoot, targetPath) {
  const relative = path.relative(packageRoot, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function selectExportEntry(exportsField, subpath) {
  if (typeof exportsField === 'string' || exportsField === null) {
    return subpath === '.'
      ? { matchedKey: '.', target: exportsField }
      : { blocked: true, reason: 'missing-export' };
  }

  if (!isObject(exportsField)) {
    return { invalid: true, reason: 'invalid-exports-shape' };
  }

  if (!isExportsMap(exportsField)) {
    return subpath === '.'
      ? { matchedKey: '.', target: exportsField }
      : { blocked: true, reason: 'missing-export' };
  }

  if (Object.hasOwn(exportsField, subpath)) {
    return {
      matchedKey: subpath,
      target: exportsField[subpath],
    };
  }

  return { blocked: true, reason: 'missing-export' };
}

function resolveConditionalTarget(report, target, pathSegments = []) {
  if (!isObject(target)) {
    return { target, conditionPath: pathSegments };
  }

  if (isExportsMap(target)) {
    return { invalid: true, reason: 'nested-export-map-not-supported' };
  }

  for (const [conditionName, branchTarget] of Object.entries(target)) {
    const active = report.activeConditions.includes(conditionName);
    const conditionPath = [...pathSegments, conditionName];
    report.conditionChecks.push({
      condition: conditionName,
      path: conditionPath,
      result: active ? 'matched' : 'skipped',
      reason: active ? 'active-condition' : 'inactive-condition',
    });

    if (!active) {
      continue;
    }

    const selected = resolveConditionalTarget(report, branchTarget, conditionPath);
    if (selected.target !== undefined || selected.invalid) {
      return selected;
    }
  }

  return { blocked: true, reason: 'no-active-condition' };
}

export async function resolveExports(report, packageRoot, packageJson, parsed) {
  const normalizedSubpath = parsed.packageSubpath === '.' ? '.' : parsed.packageSubpath;
  report.exportSubpath = normalizedSubpath;
  report.availableExports = availableExportKeys(packageJson.exports);
  report.activeConditions = activeConditionsFor(report);

  addMetadata(report, {
    kind: 'exports',
    result: 'present',
    packageRoot,
    requestedSubpath: parsed.packageSubpath,
    normalizedSubpath,
    availableExports: report.availableExports,
  });

  const selectedEntry = selectExportEntry(packageJson.exports, normalizedSubpath);
  if (selectedEntry.blocked || selectedEntry.target === null) {
    addError(report, {
      code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
      packageRoot,
      requestedSubpath: normalizedSubpath,
      availableExports: report.availableExports,
      message: `${parsed.packageName} does not export ${normalizedSubpath}`,
    });
    return null;
  }

  if (selectedEntry.invalid) {
    addError(report, {
      code: 'invalid-exports',
      packageRoot,
      reason: selectedEntry.reason,
      message: `Invalid exports field in ${parsed.packageName}`,
    });
    return null;
  }

  const selected = resolveConditionalTarget(report, selectedEntry.target);
  if (selected.blocked || selected.target === null) {
    addError(report, {
      code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
      packageRoot,
      requestedSubpath: normalizedSubpath,
      availableExports: report.availableExports,
      message: `${parsed.packageName} has no active export condition for ${normalizedSubpath}`,
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
    matchedKey: selectedEntry.matchedKey,
    target: selected.target,
    conditionPath: selected.conditionPath,
  });

  if (typeof selected.target !== 'string' || !selected.target.startsWith('./')) {
    addError(report, {
      code: 'invalid-export-target',
      packageRoot,
      matchedKey: selectedEntry.matchedKey,
      target: selected.target,
      message: `Export target for ${selectedEntry.matchedKey} must be a package-root-relative string`,
    });
    return null;
  }

  const targetPath = path.resolve(packageRoot, selected.target);
  if (!targetInsidePackage(packageRoot, targetPath)) {
    addError(report, {
      code: 'invalid-export-target',
      packageRoot,
      matchedKey: selectedEntry.matchedKey,
      target: selected.target,
      message: `Export target for ${selectedEntry.matchedKey} escapes the package root`,
    });
    return null;
  }

  const resolved = await resolveAsFile(report, targetPath) ?? await resolveAsDirectory(report, targetPath);
  if (!resolved) {
    addError(report, {
      code: 'missing-export-target',
      packageRoot,
      matchedKey: selectedEntry.matchedKey,
      target: selected.target,
      message: `Export target ${selected.target} did not resolve to a file`,
    });
    return null;
  }

  report.entryField = 'exports';
  report.matchedExport = {
    key: selectedEntry.matchedKey,
    target: selected.target,
    conditionPath: selected.conditionPath,
  };
  return resolved;
}
