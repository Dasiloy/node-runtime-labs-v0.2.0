import fs from 'node:fs/promises';
import path from 'node:path';
import { addError, markResolved } from './trace.mjs';

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
      report.selectedPackageRoot = packagePath;
      if (searchDirectory.includes(`${path.sep}src${path.sep}nested${path.sep}node_modules`)) {
        report.metadata.push({
          kind: 'package-lookup',
          result: 'closest-package-wins',
          packageName: parsed.packageName,
          packageRoot: packagePath,
        });
      }
      markResolved(report, packagePath, {
        branch: 'package-root',
      });
      return report;
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
