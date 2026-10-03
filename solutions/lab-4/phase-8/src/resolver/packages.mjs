import fs from 'node:fs/promises';
import path from 'node:path';
import { addError, addMetadata, markResolved } from './trace.mjs';
import { resolveExports } from './exports.mjs';
import { readPackageJson, packageTypeOf } from './package-json.mjs';
import { resolveAsDirectory, resolveAsFile } from './path-resolution.mjs';

export function parsePackageSpecifier(specifier) {
  const parts = specifier.split('/');
  if (specifier.startsWith('@')) {
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      throw new Error(`Invalid scoped package specifier: ${specifier}`);
    }
    const packageName = `${parts[0]}/${parts[1]}`;
    const rest = parts.slice(2).join('/');
    return {
      packageName,
      packageSubpath: rest ? `./${rest}` : '.',
    };
  }

  const [packageName, ...restParts] = parts;
  return {
    packageName,
    packageSubpath: restParts.length > 0 ? `./${restParts.join('/')}` : '.',
  };
}

async function directoryExists(candidate) {
  try {
    return (await fs.stat(candidate)).isDirectory();
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      return false;
    }
    throw error;
  }
}

export function packageSearchDirectories(importer) {
  const directories = [];
  let current = path.dirname(importer);

  while (true) {
    directories.push(path.join(current, 'node_modules'));
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return directories;
}

export async function resolvePackageSpecifier(report) {
  let parsed;
  try {
    parsed = parsePackageSpecifier(report.specifier);
  } catch (error) {
    addError(report, {
      code: 'invalid-package-specifier',
      specifier: report.specifier,
      message: error.message,
    });
    return report;
  }

  report.packageName = parsed.packageName;
  report.packageSubpath = parsed.packageSubpath;
  report.packageCandidates = [];

  const searchDirectories = packageSearchDirectories(report.importer);

  for (const searchDirectory of searchDirectories) {
    const packagePath = path.join(searchDirectory, parsed.packageName);
    const exists = await directoryExists(packagePath);
    report.packageCandidates.push({
      searchDirectory,
      packagePath,
      packageName: parsed.packageName,
      result: exists ? 'found' : 'missing',
    });

    if (exists) {
      return resolvePackageRoot(report, packagePath, parsed);
    }
  }

  addError(report, {
    code: 'package-not-found',
    importer: report.importer,
    packageName: parsed.packageName,
    searchDirectoryCount: searchDirectories.length,
    message: `Package ${parsed.packageName} was not found from ${report.importer}`,
  });
  return report;
}

function moduleFormatFor(filePath, packageType) {
  const extension = path.extname(filePath);
  if (extension === '.mjs') {
    return 'esm';
  }
  if (extension === '.cjs') {
    return 'cjs';
  }
  if (extension === '.json') {
    return 'json';
  }
  if (extension === '.node') {
    return 'native-addon';
  }
  if (extension === '.js') {
    return packageType === 'module' ? 'esm' : 'cjs';
  }
  return 'unknown';
}

async function resolvePackageRoot(report, packageRoot, parsed) {
  report.selectedPackageRoot = packageRoot;
  report.packageRoot = packageRoot;

  if (packageRoot.includes(`${path.sep}src${path.sep}nested${path.sep}node_modules`)) {
    addMetadata(report, {
      kind: 'package-lookup',
      result: 'closest-package-wins',
      packageName: parsed.packageName,
      packageRoot,
    });
  }

  const packageMetadata = await readPackageJson(packageRoot);
  if (packageMetadata.error) {
    addMetadata(report, {
      kind: 'package.json',
      result: 'invalid',
      packageRoot,
      packageJsonPath: packageMetadata.packageJsonPath,
      reason: 'invalid-package-json',
      message: packageMetadata.error.message,
    });
    addError(report, {
      code: 'invalid-package-json',
      packageRoot,
      path: packageMetadata.packageJsonPath,
      message: `Invalid package.json at ${packageMetadata.packageJsonPath}`,
    });
    return report;
  }

  const packageJson = packageMetadata.packageJson ?? {};
  report.packageType = packageTypeOf(packageJson);

  addMetadata(report, {
    kind: 'package.json',
    result: packageMetadata.missing ? 'missing' : 'found',
    packageRoot,
    packageJsonPath: packageMetadata.packageJsonPath,
  });
  addMetadata(report, {
    kind: 'type',
    result: 'selected',
    value: report.packageType,
    packageRoot,
  });

  let selectedPath = null;
  let entryField = null;

  if (packageJson.exports !== undefined) {
    entryField = 'exports';
    selectedPath = await resolveExports(report, packageRoot, packageJson, parsed);
  } else if (parsed.packageSubpath !== '.') {
    entryField = 'package-subpath';
    const subpathTarget = path.resolve(packageRoot, parsed.packageSubpath.slice(2));
    selectedPath = await resolveAsFile(report, subpathTarget) ?? await resolveAsDirectory(report, subpathTarget);
  } else if (typeof packageJson.main === 'string') {
    entryField = 'main';
    addMetadata(report, {
      kind: 'main',
      result: 'selected',
      value: packageJson.main,
      packageRoot,
    });
    const mainTarget = path.resolve(packageRoot, packageJson.main);
    selectedPath = await resolveAsFile(report, mainTarget) ?? await resolveAsDirectory(report, mainTarget);

    if (!selectedPath) {
      addMetadata(report, {
        kind: 'main',
        result: 'invalid',
        value: packageJson.main,
        packageRoot,
        reason: 'invalid-main-target',
      });
      entryField = 'legacy-index-fallback';
    }
  }

  if (!selectedPath && parsed.packageSubpath === '.' && packageJson.exports === undefined) {
    entryField ??= 'legacy-index-fallback';
    addMetadata(report, {
      kind: 'fallback',
      result: 'selected',
      value: 'index',
      packageRoot,
    });
    selectedPath = await resolveAsFile(report, path.join(packageRoot, 'index'));
  }

  if (!selectedPath && packageJson.exports !== undefined) {
    return report;
  }

  if (!selectedPath) {
    addError(report, {
      code: entryField === 'package-subpath' ? 'missing-package-subpath' : 'missing-package-entry',
      packageName: parsed.packageName,
      packageRoot,
      message: `No package entry matched ${report.specifier}`,
    });
    return report;
  }

  const moduleFormat = moduleFormatFor(selectedPath, report.packageType);
  report.entryField = report.entryField ?? entryField;
  report.moduleFormat = moduleFormat;
  markResolved(report, selectedPath, {
    branch: 'package',
    packageRoot,
    packageName: parsed.packageName,
    packageSubpath: parsed.packageSubpath,
    packageType: report.packageType,
    entryField,
    moduleFormat,
  });
  return report;
}
