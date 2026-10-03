import { builtinModules } from 'node:module';
import { markResolved } from './trace.mjs';

const builtinNames = new Set();

for (const name of builtinModules) {
  const bareName = name.startsWith('node:') ? name.slice('node:'.length) : name;
  builtinNames.add(bareName);
}

export function isBuiltinSpecifier(specifier) {
  const bareName = specifier.startsWith('node:') ? specifier.slice('node:'.length) : specifier;
  return builtinNames.has(bareName);
}

export function resolveBuiltin(report) {
  const bareName = report.specifier.startsWith('node:')
    ? report.specifier.slice('node:'.length)
    : report.specifier;
  const canonicalTarget = `node:${bareName}`;

  markResolved(report, canonicalTarget, {
    branch: 'builtin',
    canonicalTarget,
    originalSpecifier: report.specifier,
    filesystemSearchSkipped: true,
    packageLookupSkipped: true,
  });
  return report;
}
